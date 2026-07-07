#!/usr/bin/env node
/*
 * monitor/scripts/audit-narrative-citations.js
 *
 * PROP-014 Mechanism 3 narrative-cite enforcement — Stage 1 paragraph-citation
 * gate + Stage 2 anchor-match. Audits declared-state prose surfaces for
 * inline citations and flags uncited paragraphs / bogus-anchor citations.
 * This is observational only — it never mutates the audited inputs.
 *
 *   - PROP reference:        monitor/tinker/proposals/PROP-014-agent-state-coupling.json
 *   - Amendment-001 Q3:      monitor/tinker/proposals/PROP-014-amendment-001.json
 *   - Recalibration:         monitor/tinker/proposals/PROP-069-narrative-cite-recalibration.json
 *   - Canonical disciplines: monitor/prompts/reference/state-verification.md
 *   - Version:               1.1.0  (PROP-069 recalibration)
 *   - Invocation:            node monitor/scripts/audit-narrative-citations.js [--dry-run] [--since=YYYY-MM-DD] [--all]
 *                            (typically from monitor/prompts/workspace-sync.md
 *                            alongside verify-pending-state.js)
 *   - Audited surfaces (PROP-069 Stage 1A dropped the two daily-report surfaces):
 *                            monitor/curmudgeon/reviews/*.json
 *                              → kernel_of_truth.description
 *                              → kernel_of_truth.why_it_doesnt_save_claim
 *                              → our_argument_summary
 *                            monitor/tinker/report-*.json
 *                              → findings[].description  (claim-shaped, moderate+ only)
 *   - Output report:         monitor/integrity/narrative-cite-audit-<ISO>.json
 *
 * STAGE 1 (paragraph gate, HARD AUTOMATABLE): every claim-shaped paragraph
 * >1 sentence MUST contain at least one inline citation matching CITATION_RE.
 * PROP-069 recalibrated acceptance: ≤15% claim-uncited across claim-shaped
 * paragraphs (was: 0% across all paragraphs incl. operational narration).
 *
 * STAGE 1A (PROP-069): dropped daily-report.pipeline_status and
 * daily-report.recommended_actions[].action surfaces entirely — these are
 * operational narration / imperative actions, not state-bearing claims.
 * STAGE 1C/1D (PROP-069): tinker findings audited only when severity is
 * moderate+ AND the paragraph fires the claim-shape filter.
 *
 * STAGE 2 (anchor match, PARTIAL AUTOMATABLE): for each citation that
 * includes a `:<field-anchor>` tail, verify the cited file exists AND
 * (for JSON files) contains a key matching the anchor anywhere in the
 * tree. For .md/.txt the anchor is checked as a literal substring.
 * PROP-069 Stage 2 hardening: CITATION_RE only matches path-safe chars
 * (suppresses prose-mistaken-for-citation), plus bare well-known-filename
 * auto-resolution and optional glob expansion before the existence check.
 * Recalibrated acceptance: ≥85% citation-resolve-rate, ≤20 bogus-anchor,
 * ≤20 file-missing (flat caps).
 *
 * STAGE 3 (semantic match) is intentionally NOT implemented here — that
 * stage requires LLM-as-judge sampling or manual review; it is documented
 * in state-verification.md §3 but lives outside this script.
 *
 * EDGE CASES (per directive):
 *   - Empty prose → skip silently (paragraph count 0)
 *   - Triple-backtick code blocks → stripped before sentence counting
 *   - Single-backtick inline code → stripped (avoids false ` ` sentence boundaries)
 *   - Markdown headers (`#`) and list items (`-`, `*`, `1.`) → excluded from
 *     paragraph extraction (these are not declared-state prose)
 *   - Single-sentence paragraphs (≤1 sentence) → not audited (too short to
 *     carry a state-bearing claim worth citing)
 *   - Non-claim-shaped paragraphs on _check_claim_shape surfaces → skipped
 *
 * IDEMPOTENCY: this script never writes to audited inputs. The only output
 * is the integrity report. Re-running produces the same per-file counts
 * given the same on-disk state.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = '1.1.0';
const NOW_ISO = new Date().toISOString();
const RUN_ID = process.env.RUN_ID
  || ('narrative-audit-' + NOW_ISO.replace(/[:.]/g, '').slice(0, 15) + 'Z-' + process.pid);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const sinceArg = args.find((a) => a.startsWith('--since='));

// Default scan window = last 14 days (matches amendment-001 Q3 acceptance window).
// `--all` overrides to scan every file. `--since=YYYY-MM-DD` narrows or widens.
let SINCE_MS;
if (ALL) {
  SINCE_MS = 0;
} else if (sinceArg) {
  const parsed = Date.parse(sinceArg.split('=')[1]);
  SINCE_MS = Number.isFinite(parsed) ? parsed : (Date.now() - 14 * 24 * 3600 * 1000);
} else {
  SINCE_MS = Date.now() - 14 * 24 * 3600 * 1000;
}

// Citation regex. Matches:
//   (path/file.ext)
//   (path/file.ext:anchor-name)
// where ext ∈ {json, jsonl, txt, md} and anchor is /[\w-]+/.
// PROP-069 Stage 2 hardening: path component is [./\w-]+ (path-safe chars
// only — no spaces, commas, semicolons, em-dashes, equals) instead of
// [^)]+ (any char except close-paren). Suppresses ~42% of file-missing and
// ~10-20% of bogus-anchor that were prose-with-trailing-filename mis-captures.
const CITATION_RE = /\(([./\w-]+\.(?:json|jsonl|txt|md))(?::([\w-]+))?\)/g;

// Sentence boundary: '.', '!', '?' followed by whitespace + capital letter.
// Counts boundaries; sentence count = boundaries + 1 for any non-empty paragraph.
const SENTENCE_BOUNDARY_RE = /[.!?]\s+[A-Z]/g;

// PROP-069 Step 4: well-known bare-filename → canonical-directory resolution.
// Applied before the fs.existsSync() check so a bare 'open-issues.json'
// citation resolves to 'monitor/decisions/open-issues.json'.
const WELL_KNOWN_PATHS = {
  'open-issues.json': 'monitor/decisions/',
  'closed-issues.json': 'monitor/decisions/',
  'sections.json': 'data/',
  'wins.json': 'data/',
  'predictions.json': 'data/',
  'uncounted-failures.json': 'data/',
  'priority-queue.json': 'monitor/curmudgeon/',
  'pending-digest.json': 'monitor/curmudgeon/',
  'tracker.json': 'monitor/curmudgeon/',
  'expansion-tracker.json': 'monitor/analyst/',
  'attention-inbox.json': 'monitor/analyst/',
  'human-notes.json': 'monitor/decisions/',
  'status.json': 'monitor/',
  'review-state.json': 'monitor/',
  'decider-mode.json': 'monitor/decisions/',
  'closure-ledger.jsonl': 'monitor/decisions/',
};

// PROP-069 Stage 1D: claim-shape paragraph filter. Applied only to surfaces
// whose extractor sets _check_claim_shape (tinker findings). A paragraph
// "fires" (i.e. is worth auditing for a citation) if it references an entity
// id + claim verb, a specific quantity, or a scientific/named-literature ref.
const ENTITY_ID_RE = /\b(WIN|EXP|SEC|HOL|PRED)-[\d.]+\b/;
const CLAIM_VERB_RE = /\b(refute[ds]?|contradicts?|contradicted|supports?|fails?|fail(?:ed|ing)|succeed[sing]*|explain[s]?|matches?|claim[s]?|predict[s]?|measure[ds]?|observe[ds]?|shows?|demonstrate[ds]?|require[ds]?|prove[ds]?|disprove[ds]?|conflict[s]?|agree[ds]?|disagree[ds]?|imply|implies)\b/i;
const SPECIFIC_NUM_RE = /\b\d+(\.\d+)?\s*(%|σ|sigma|nT|μGal|km|m\/s|degrees?|deg|N=\d|n=\d)/;
const SCI_REF_RE = /\b(DOI|et\s+al|paper|study|dataset|firmament|aether|cavity|geomag|seismic|spectra|spectrum|atmosphere|halo|cluster|CMB|CMBR|H\(r\)|B\(r\)|dome|ECM|sphere|V51)\b/i;
const NAMED_LIT_RE = /\b(Mohe|Christchurch|El Gordo|Halloween|Gutenberg|3C\d+|NGC\d+|HD\d+|Hartland|Ebro|Tesla|wolfSSL)\b/i;

function claimShapeFires(paragraph) {
  if (ENTITY_ID_RE.test(paragraph) && CLAIM_VERB_RE.test(paragraph)) return 'a';
  if (SPECIFIC_NUM_RE.test(paragraph)) return 'b';
  if (SCI_REF_RE.test(paragraph) || NAMED_LIT_RE.test(paragraph)) return 'c';
  return null;
}

// ---- Surface configuration ----
// Each surface declares: a directory + filename regex, and an extractor
// that returns [{label, prose}, ...] from a parsed JSON document.
// Adding a new surface = one entry.
//
// PROP-069 Stage 1A: the two daily-report surfaces (pipeline_status,
// recommended_actions[].action) were REMOVED — operational narration and
// imperative actions are not state-bearing claims.
const SURFACES = [
  {
    name: 'curmudgeon.reviews.kernel_of_truth+our_argument_summary',
    dir: 'monitor/curmudgeon/reviews',
    re: /\.json$/,
    extract: (data) => {
      const out = [];
      if (!data || typeof data !== 'object') return out;
      const k = data.kernel_of_truth || {};
      if (typeof k.description === 'string') {
        out.push({ label: 'kernel_of_truth.description', prose: k.description });
      }
      if (typeof k.why_it_doesnt_save_claim === 'string') {
        out.push({ label: 'kernel_of_truth.why_it_doesnt_save_claim', prose: k.why_it_doesnt_save_claim });
      }
      if (typeof data.our_argument_summary === 'string') {
        out.push({ label: 'our_argument_summary', prose: data.our_argument_summary });
      }
      return out;
    },
  },
  {
    name: 'tinker.report.findings[].description',
    dir: 'monitor/tinker',
    re: /^report-.*\.json$/,
    extract: (data) => {
      // PROP-069 Stage 1C+1D: only claim-shaped findings at moderate+ severity.
      const out = [];
      const findings = data && Array.isArray(data.findings) ? data.findings : [];
      findings.forEach((f, i) => {
        if (!f || typeof f.description !== 'string') return;
        const sev = f.severity || 'info';
        if (['moderate', 'major', 'critical', 'operator_escalation'].indexOf(sev) < 0) return;
        out.push({ label: 'findings[' + i + '].description', prose: f.description, _check_claim_shape: true });
      });
      return out;
    },
  },
];

function logErr(msg) { process.stderr.write('[narrative-audit] ' + msg + '\n'); }
function logOut(msg) { process.stdout.write('[narrative-audit] ' + msg + '\n'); }

function safeJson(filePath) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function listFiles(dir, re) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => re.test(f))
      .map((f) => path.join(dir, f));
  } catch (e) {
    return [];
  }
}

function stripCodeBlocks(prose) {
  // Triple-backtick fenced blocks first, then inline single-backtick code.
  return prose
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function extractParagraphs(prose) {
  if (typeof prose !== 'string' || prose.length === 0) return [];
  const cleaned = stripCodeBlocks(prose).replace(/\r/g, '');
  const blocks = cleaned.includes('\n\n') ? cleaned.split(/\n{2,}/) : [cleaned];

  const paragraphs = [];
  for (const raw of blocks) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const firstLine = trimmed.split('\n')[0].trim();
    // Skip headers, bullet items, numbered list items — these are not
    // declared-state prose paragraphs.
    if (/^#+\s/.test(firstLine)) continue;
    if (/^[-*]\s+/.test(firstLine)) continue;
    if (/^\d+\.\s+/.test(firstLine)) continue;
    paragraphs.push(trimmed);
  }
  return paragraphs;
}

function countSentences(paragraph) {
  if (!paragraph) return 0;
  // Reset the global regex state before each test
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  const matches = paragraph.match(SENTENCE_BOUNDARY_RE);
  return matches ? matches.length + 1 : 1;
}

function findCitations(paragraph) {
  const out = [];
  CITATION_RE.lastIndex = 0;
  let m;
  while ((m = CITATION_RE.exec(paragraph)) !== null) {
    out.push({ file: m[1], anchor: m[2] || null, raw: m[0] });
  }
  return out;
}

function jsonHasKey(node, key) {
  // Recursive search: returns true if `key` appears as an object key anywhere.
  if (node === null || node === undefined) return false;
  if (Array.isArray(node)) {
    for (const v of node) {
      if (jsonHasKey(v, key)) return true;
    }
    return false;
  }
  if (typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, key)) return true;
    for (const k of Object.keys(node)) {
      if (jsonHasKey(node[k], key)) return true;
    }
  }
  return false;
}

// PROP-069 Step 4: resolve a citation's file path before existence check.
// Applies the well-known bare-filename table, then optional glob expansion.
// Returns { file, auto_resolved }.
function resolveCitationFile(file) {
  // Bare well-known filename (no slash) → canonical prefix.
  if (!file.includes('/') && WELL_KNOWN_PATHS[file]) {
    const resolved = WELL_KNOWN_PATHS[file] + file;
    if (fs.existsSync(resolved)) {
      return { file: resolved, auto_resolved: true };
    }
  }
  // Optional glob expansion for paths containing '*'.
  if (file.includes('*')) {
    const dir = path.dirname(file);
    const pattern = path.basename(file).replace(/\*/g, '.*');
    const re = new RegExp('^' + pattern + '$');
    try {
      const matches = fs.readdirSync(dir).filter((f) => re.test(f));
      if (matches.length > 0) {
        return { file: path.join(dir, matches[0]), auto_resolved: true };
      }
    } catch (e) { /* dir missing — fall through to file_missing */ }
  }
  return { file, auto_resolved: false };
}

function checkAnchor(citation) {
  // Returns { decision, detail, auto_resolved }
  // Decisions: 'verified' | 'bogus_anchor' | 'file_missing' | 'no_anchor' | 'unsupported'
  const rw = resolveCitationFile(citation.file);
  const f = rw.file;
  const auto = rw.auto_resolved;
  if (!fs.existsSync(f)) return { decision: 'file_missing', detail: 'cited file does not exist', auto_resolved: auto };
  if (!citation.anchor) return { decision: 'no_anchor', detail: 'citation has no anchor; Stage 2 skipped', auto_resolved: auto };

  if (/\.jsonl?$/.test(f)) {
    const r = safeJson(f);
    if (!r.ok) return { decision: 'bogus_anchor', detail: 'JSON parse failed: ' + r.err, auto_resolved: auto };
    if (jsonHasKey(r.data, citation.anchor)) return { decision: 'verified', auto_resolved: auto };
    return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not found in JSON tree', auto_resolved: auto };
  }

  if (/\.(md|txt)$/.test(f)) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      if (txt.includes(citation.anchor)) return { decision: 'verified', auto_resolved: auto };
      return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not present in file text', auto_resolved: auto };
    } catch (e) {
      return { decision: 'bogus_anchor', detail: 'read failed: ' + e.message, auto_resolved: auto };
    }
  }

  return { decision: 'unsupported', detail: 'unsupported file extension for anchor check', auto_resolved: auto };
}

function auditFile(filePath, surface) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (e) {
    return { file: filePath, error: 'stat_failed: ' + e.message };
  }
  if (stat.mtimeMs < SINCE_MS) return null; // out of window

  const r = safeJson(filePath);
  if (!r.ok) return { file: filePath, error: 'json_parse_failed: ' + r.err };

  const proseEntries = surface.extract(r.data);
  const result = {
    file: filePath,
    surface_name: surface.name,
    mtime: new Date(stat.mtimeMs).toISOString(),
    paragraphs_total: 0,
    paragraphs_uncited: 0,
    citations_total: 0,
    citations_with_anchor: 0,
    citations_bogus_anchor: 0,
    citations_file_missing: 0,
    citations_auto_resolved: 0,
    sample_uncited: [],
    sample_bogus: [],
  };

  for (const entry of proseEntries) {
    const paragraphs = extractParagraphs(entry.prose);
    for (const p of paragraphs) {
      const sCount = countSentences(p);
      if (sCount <= 1) continue;
      // PROP-069 Stage 1D: on claim-shape surfaces, skip non-claim paragraphs.
      if (entry._check_claim_shape && !claimShapeFires(p)) continue;
      result.paragraphs_total++;

      const cits = findCitations(p);
      result.citations_total += cits.length;

      if (cits.length === 0) {
        result.paragraphs_uncited++;
        if (result.sample_uncited.length < 3) {
          result.sample_uncited.push({
            surface_field: entry.label,
            sentence_count: sCount,
            sample_text: p.slice(0, 240),
          });
        }
        continue;
      }

      for (const c of cits) {
        if (c.anchor) result.citations_with_anchor++;
        const a = checkAnchor(c);
        if (a.auto_resolved) result.citations_auto_resolved++;
        if (a.decision === 'bogus_anchor') {
          result.citations_bogus_anchor++;
          if (result.sample_bogus.length < 3) {
            result.sample_bogus.push({
              surface_field: entry.label, citation: c.raw, detail: a.detail,
            });
          }
        } else if (a.decision === 'file_missing') {
          result.citations_file_missing++;
          if (result.sample_bogus.length < 3) {
            result.sample_bogus.push({
              surface_field: entry.label, citation: c.raw, detail: 'file missing',
            });
          }
        }
      }
    }
  }

  return result;
}

function main() {
  const summary = {
    version:    VERSION,
    run_id:     RUN_ID,
    started_at: NOW_ISO,
    dry_run:    DRY_RUN,
    since_iso:  SINCE_MS > 0 ? new Date(SINCE_MS).toISOString() : null,
    surfaces:   [],
    totals: {
      files_audited:           0,
      paragraphs_total:        0,
      paragraphs_uncited:      0,
      // PROP-069 honest aliases (claim-shaped denominator):
      claim_shaped_paragraphs_total: 0,
      claim_uncited:                 0,
      citations_total:         0,
      citations_with_anchor:   0,
      citations_bogus_anchor:  0,
      citations_file_missing:  0,
      citations_auto_resolved: 0,
    },
  };

  for (const surface of SURFACES) {
    const files = listFiles(surface.dir, surface.re);
    for (const fp of files) {
      try {
        const r = auditFile(fp, surface);
        if (!r) continue; // out of window
        summary.surfaces.push(r);
        summary.totals.files_audited++;
        if (r.paragraphs_total != null) {
          summary.totals.paragraphs_total       += r.paragraphs_total;
          summary.totals.paragraphs_uncited     += r.paragraphs_uncited;
          summary.totals.citations_total        += r.citations_total;
          summary.totals.citations_with_anchor  += r.citations_with_anchor;
          summary.totals.citations_bogus_anchor += r.citations_bogus_anchor;
          summary.totals.citations_file_missing += r.citations_file_missing;
          summary.totals.citations_auto_resolved += (r.citations_auto_resolved || 0);
        }
      } catch (e) {
        summary.surfaces.push({ file: fp, error: 'audit_threw: ' + e.message });
      }
    }
  }

  // Honest aliases mirror the canonical counts (denominator is now claim-shaped only).
  summary.totals.claim_shaped_paragraphs_total = summary.totals.paragraphs_total;
  summary.totals.claim_uncited = summary.totals.paragraphs_uncited;

  const t = summary.totals;

  // ---- PROP-069 recalibrated metrics + alarm ----
  const claimUncitedRate = t.paragraphs_total
    ? (100 * t.paragraphs_uncited / t.paragraphs_total)
    : 0;
  const resolving = t.citations_total - t.citations_bogus_anchor - t.citations_file_missing;
  const resolveRate = t.citations_total
    ? (100 * resolving / t.citations_total)
    : 100;

  // Thresholds (PROP-069 step_3): claim-uncited ≤15%, resolve ≥85%,
  // bogus-anchor ≤20 flat, file-missing ≤20 flat.
  const TH = { claim_uncited_pct: 15, resolve_pct: 85, bogus_cap: 20, missing_cap: 20 };
  const green =
    claimUncitedRate <= TH.claim_uncited_pct &&
    resolveRate >= TH.resolve_pct &&
    t.citations_bogus_anchor <= TH.bogus_cap &&
    t.citations_file_missing <= TH.missing_cap;
  // YELLOW = all conditions within 5 points of green.
  const yellow = !green &&
    claimUncitedRate <= TH.claim_uncited_pct + 5 &&
    resolveRate >= TH.resolve_pct - 5 &&
    t.citations_bogus_anchor <= TH.bogus_cap + 5 &&
    t.citations_file_missing <= TH.missing_cap + 5;
  const alarm = green ? 'GREEN' : (yellow ? 'YELLOW' : 'RED');

  summary.totals.claim_uncited_rate_pct = +claimUncitedRate.toFixed(1);
  summary.totals.citation_resolve_rate_pct = +resolveRate.toFixed(1);
  summary.recalibration = {
    prop: 'PROP-069',
    thresholds: TH,
    alarm,
    green_definition: 'claim-uncited ≤15% AND citation-resolve ≥85% AND bogus-anchor ≤20 AND file-missing ≤20',
  };

  summary.completed_at = new Date().toISOString();

  const reportName = 'narrative-cite-audit-' + NOW_ISO.replace(/[:.]/g, '').slice(0, 15) + 'Z.json';
  const reportPath = path.join('monitor/integrity', reportName);

  if (!DRY_RUN) {
    try {
      fs.mkdirSync('monitor/integrity', { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n');
      logOut('Wrote: ' + reportPath);
    } catch (e) {
      logErr('Could not write integrity report: ' + e.message);
    }
  }

  const uncitedPct = claimUncitedRate.toFixed(1);
  const bogusPct = t.citations_with_anchor
    ? (100 * t.citations_bogus_anchor / t.citations_with_anchor).toFixed(1)
    : '0.0';

  // PROP-069 compat: emit BOTH the legacy tokens (uncited=, bogus_anchors=)
  // AND the new recalibrated tokens (claim-uncited=, citation-resolve=,
  // bogus-anchor=, file-missing=) for a 14-day overlap window. The
  // workspace-sync soft-complaint grep reads the new tokens.
  console.log(
    'audit-narrative-citations.js v' + VERSION + (DRY_RUN ? ' (DRY RUN)' : '') + ': ' +
    'files=' + t.files_audited +
    ', paragraphs=' + t.paragraphs_total +
    ', uncited=' + t.paragraphs_uncited + ' (' + uncitedPct + '%)' +
    ', citations=' + t.citations_total +
    ', bogus_anchors=' + t.citations_bogus_anchor + ' (' + bogusPct + '% of anchored)' +
    ', file_missing=' + t.citations_file_missing
  );
  console.log(
    'PROP-069 [' + alarm + ']: ' +
    'claim-uncited=' + t.paragraphs_uncited +
    ' claim-uncited-rate=' + uncitedPct + '%' +
    ' citation-resolve=' + resolveRate.toFixed(1) +
    ' bogus-anchor=' + t.citations_bogus_anchor +
    ' file-missing=' + t.citations_file_missing +
    ' auto-resolved=' + t.citations_auto_resolved
  );

  if (claimUncitedRate > TH.claim_uncited_pct) {
    console.log('  Stage 1: claim-uncited ' + uncitedPct + '% above ' + TH.claim_uncited_pct + '% target.');
  }
  if (t.citations_bogus_anchor > TH.bogus_cap) {
    console.log('  Stage 2: ' + t.citations_bogus_anchor + ' bogus anchor(s) above ' + TH.bogus_cap + ' cap.');
  }
  if (t.citations_file_missing > TH.missing_cap) {
    console.log('  Stage 2: ' + t.citations_file_missing + ' file-missing above ' + TH.missing_cap + ' cap.');
  }

  // Soft-complaint by design: never exit non-zero, never block the workspace-sync run.
  process.exit(0);
}

try {
  main();
} catch (e) {
  logErr('FATAL: ' + e.message);
  if (e.stack) logErr(e.stack);
  process.exit(1);
}
