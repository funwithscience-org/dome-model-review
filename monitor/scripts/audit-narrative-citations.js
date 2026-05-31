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
 *   - Version:               2.0.0 (PROP-069 recalibration)
 *   - Invocation:            node monitor/scripts/audit-narrative-citations.js [--dry-run] [--since=YYYY-MM-DD] [--all]
 *                            (typically from monitor/prompts/workspace-sync.md
 *                            alongside verify-pending-state.js)
 *   - Audited surfaces (PROP-069 recalibrated, see Stage 1A/1B/1C below):
 *                            monitor/curmudgeon/reviews/*.json
 *                              → kernel_of_truth.description
 *                              → kernel_of_truth.why_it_doesnt_save_claim
 *                              → our_argument_summary
 *                            monitor/tinker/report-*.json
 *                              → findings[].description  (severity in
 *                                  {moderate,major,critical,operator_escalation}
 *                                  AND claim-shape filter fires; see Stage 1D)
 *                            DROPPED in PROP-069 (operational/imperative surfaces):
 *                              - daily-report.pipeline_status.*
 *                              - daily-report.recommended_actions[].action
 *   - Output report:         monitor/integrity/narrative-cite-audit-<ISO>.json
 *
 * STAGE 1 (paragraph-citation gate, HARD AUTOMATABLE):
 *   1A — Surface negative drop: pipeline_status + recommended_actions dropped.
 *   1B — Surface positive: every multi-sentence paragraph in
 *        curmudgeon.reviews is in scope.
 *   1C — Surface positive with within-surface filter: tinker findings
 *        filtered to severity >= moderate AND claim-shape gate (1D).
 *   1D — Claim-shape paragraph filter: fires on any of
 *        (a) ENTITY_ID + CLAIM_VERB co-occurrence,
 *        (b) SPECIFIC_NUM with units,
 *        (c) SCI/DOME ref or NAMED literature ref.
 *   Acceptance threshold per PROP-069 §3:
 *       claim-uncited rate <= 15% of claim-shaped paragraphs.
 *
 * STAGE 2 (anchor match, PARTIAL AUTOMATABLE): for each citation that
 * includes a `:<field-anchor>` tail, verify the cited file exists AND
 * (for JSON files) contains a key matching the anchor anywhere in the
 * tree. For .md/.txt the anchor is checked as a literal substring.
 *   PROP-069 hardening:
 *     - CITATION_RE tightened: path component must contain only
 *       [./\w-] characters (no spaces/commas/em-dashes/=). Suppresses
 *       prose-with-trailing-filename mis-captures.
 *     - WELL_KNOWN_PATHS auto-resolution: bare canonical filenames
 *       (open-issues.json, etc.) resolved to their canonical directory
 *       before existence + anchor checks.
 *   Acceptance thresholds per PROP-069 §3:
 *       citation-resolve-rate >= 85%
 *       bogus-anchor <= 20 (flat)
 *       file-missing  <= 20 (flat)
 *
 * STAGE 3 (LLM-as-judge semantic match) is intentionally NOT implemented
 * here — see state-verification.md §3.
 *
 * EDGE CASES (preserved across PROP-069):
 *   - Empty prose → skip silently (paragraph count 0)
 *   - Triple-backtick code blocks → stripped before sentence counting
 *   - Single-backtick inline code → stripped (avoids false ` ` sentence boundaries)
 *   - Markdown headers (`#`) and list items (`-`, `*`, `1.`) → excluded from
 *     paragraph extraction (these are not declared-state prose)
 *   - Single-sentence paragraphs (≤1 sentence) → not audited
 *
 * IDEMPOTENCY: never writes to audited inputs; only output is the integrity
 * report. Re-running produces the same per-file counts given the same on-disk state.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = '2.0.0';
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

// PROP-069 §4.2 — citation regex hardening.
// Previously: /\(([^)]+\.(?:json|jsonl|txt|md))(?::([\w-]+))?\)/g
// matched any parenthesized text ending in .json/etc., capturing arbitrary
// preceding prose as the path (e.g. "WIN-002.c4, WIN-007.c3 ... pending-digest.json").
// New: path component restricted to [./\w-] only — no spaces, commas, semicolons,
// em-dashes, equals signs, or other punctuation may appear in the path.
const CITATION_RE = /\(([./\w-]+\.(?:json|jsonl|txt|md))(?::([\w-]+))?\)/g;

// PROP-069 §4.2 — well-known bare-filename auto-resolution table.
// Bare filename citations (no '/') resolve to their canonical directory if
// the canonical resolved path exists. Original citation.file preserved in
// _resolved_from so the report shows what was auto-resolved.
const WELL_KNOWN_PATHS = {
  'open-issues.json':       'monitor/decisions/',
  'closed-issues.json':     'monitor/decisions/',
  'sections.json':          'data/',
  'wins.json':              'data/',
  'predictions.json':       'data/',
  'uncounted-failures.json':'data/',
  'priority-queue.json':    'monitor/curmudgeon/',
  'pending-digest.json':    'monitor/curmudgeon/',
  'tracker.json':           'monitor/curmudgeon/',
  'expansion-tracker.json': 'monitor/analyst/',
  'attention-inbox.json':   'monitor/analyst/',
  'human-notes.json':       'monitor/decisions/',
  'status.json':            'monitor/',
  'review-state.json':      'monitor/',
  'decider-mode.json':      'monitor/decisions/',
  'closure-ledger.jsonl':   'monitor/decisions/',
};

// PROP-069 §4.1 / §2.D — claim-shape paragraph filter (Stage 1D).
const ENTITY_ID_RE   = /\b(WIN|EXP|SEC|HOL|PRED)-[\d.]+\b/;
const CLAIM_VERB_RE  = /\b(refute[ds]?|contradicts?|contradicted|supports?|fails?|fail(?:ed|ing)|succeed[sing]*|explain[s]?|matches?|claim[s]?|predict[s]?|measure[ds]?|observe[ds]?|shows?|demonstrate[ds]?|require[ds]?|prove[ds]?|disprove[ds]?|conflict[s]?|agree[ds]?|disagree[ds]?|imply|implies)\b/i;
const SPECIFIC_NUM_RE = /\b\d+(\.\d+)?\s*(%|σ|sigma|nT|μGal|km|m\/s|degrees?|deg|N=\d|n=\d)/;
const SCI_REF_RE     = /\b(DOI|et\s+al|paper|study|dataset|firmament|aether|cavity|geomag|seismic|spectra|spectrum|atmosphere|halo|cluster|CMB|CMBR|H\(r\)|B\(r\)|dome|ECM|sphere|V51)\b/i;
const NAMED_LIT_RE   = /\b(Mohe|Christchurch|El Gordo|Halloween|Gutenberg|3C\d+|NGC\d+|HD\d+|Hartland|Ebro|Tesla|wolfSSL)\b/i;

function claimShapeFires(paragraph) {
  if (ENTITY_ID_RE.test(paragraph) && CLAIM_VERB_RE.test(paragraph)) return 'a';
  if (SPECIFIC_NUM_RE.test(paragraph)) return 'b';
  if (SCI_REF_RE.test(paragraph) || NAMED_LIT_RE.test(paragraph)) return 'c';
  return null;
}

const SENTENCE_BOUNDARY_RE = /[.!?]\s+[A-Z]/g;

// ---- Surface configuration (PROP-069 §2 recalibrated) ----
const SEVERITY_IN_SCOPE = new Set(['moderate', 'major', 'critical', 'operator_escalation']);

const SURFACES = [
  // PROP-069 Stage 1A: REMOVED daily-report.pipeline_status surface
  //   (operational narration; no state-bearing claims).
  // PROP-069 Stage 1A: REMOVED daily-report.recommended_actions[].action surface
  //   (imperative prose; not the claim-bearing shape Mech 3 targets).
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
      // PROP-069 Stage 1C+1D: severity gate + claim-shape gate (applied
      // per-paragraph in auditFile via the `_check_claim_shape` hint).
      const out = [];
      const findings = data && Array.isArray(data.findings) ? data.findings : [];
      findings.forEach((f, i) => {
        if (!f || typeof f.description !== 'string') return;
        const sev = f.severity || 'info';
        if (!SEVERITY_IN_SCOPE.has(sev)) return;
        out.push({
          label: 'findings[' + i + '].description',
          prose: f.description,
          _check_claim_shape: true,
        });
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
    if (/^#+\s/.test(firstLine)) continue;
    if (/^[-*]\s+/.test(firstLine)) continue;
    if (/^\d+\.\s+/.test(firstLine)) continue;
    paragraphs.push(trimmed);
  }
  return paragraphs;
}

function countSentences(paragraph) {
  if (!paragraph) return 0;
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

// PROP-069 §4.2 — auto-resolve well-known bare filenames before existence check.
function resolveWellKnownPath(citation) {
  if (!citation.file || citation.file.includes('/')) return citation;
  const prefix = WELL_KNOWN_PATHS[citation.file];
  if (!prefix) return citation;
  const resolved = prefix + citation.file;
  if (!fs.existsSync(resolved)) return citation;
  return Object.assign({}, citation, { file: resolved, _resolved_from: citation.file });
}

function checkAnchor(citation) {
  // PROP-069 §4.2: try well-known auto-resolution before existence check.
  citation = resolveWellKnownPath(citation);

  const f = citation.file;
  if (!fs.existsSync(f)) return { decision: 'file_missing', detail: 'cited file does not exist', citation };
  if (!citation.anchor) return { decision: 'no_anchor', detail: 'citation has no anchor; Stage 2 skipped', citation };

  if (/\.jsonl?$/.test(f)) {
    const r = safeJson(f);
    if (!r.ok) return { decision: 'bogus_anchor', detail: 'JSON parse failed: ' + r.err, citation };
    if (jsonHasKey(r.data, citation.anchor)) return { decision: 'verified', citation };
    return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not found in JSON tree', citation };
  }

  if (/\.(md|txt)$/.test(f)) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      if (txt.includes(citation.anchor)) return { decision: 'verified', citation };
      return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not present in file text', citation };
    } catch (e) {
      return { decision: 'bogus_anchor', detail: 'read failed: ' + e.message, citation };
    }
  }

  return { decision: 'unsupported', detail: 'unsupported file extension for anchor check', citation };
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
    // PROP-069 §4.6 — metric keys clarified to reflect claim-shaped semantics.
    claim_shaped_paragraphs_total: 0,
    claim_shaped_paragraphs_uncited: 0,
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

      // PROP-069 Stage 1D — apply claim-shape gate where surface marks it.
      if (entry._check_claim_shape && !claimShapeFires(p)) continue;

      result.claim_shaped_paragraphs_total++;

      const cits = findCitations(p);
      result.citations_total += cits.length;

      if (cits.length === 0) {
        result.claim_shaped_paragraphs_uncited++;
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
        if (c.anchor) {
          result.citations_with_anchor++;
          const a = checkAnchor(c);
          if (a.citation && a.citation._resolved_from) {
            result.citations_auto_resolved++;
          }
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
        } else {
          // No anchor — only check existence (with well-known auto-resolve).
          const resolved = resolveWellKnownPath(c);
          if (resolved._resolved_from) {
            result.citations_auto_resolved++;
          }
          if (!fs.existsSync(resolved.file)) {
            result.citations_file_missing++;
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
    prop_069_recalibration: true,
    surfaces:   [],
    totals: {
      files_audited:                    0,
      claim_shaped_paragraphs_total:    0,
      claim_shaped_paragraphs_uncited:  0,
      citations_total:                  0,
      citations_with_anchor:            0,
      citations_bogus_anchor:           0,
      citations_file_missing:           0,
      citations_auto_resolved:          0,
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
        if (r.claim_shaped_paragraphs_total != null) {
          summary.totals.claim_shaped_paragraphs_total   += r.claim_shaped_paragraphs_total;
          summary.totals.claim_shaped_paragraphs_uncited += r.claim_shaped_paragraphs_uncited;
          summary.totals.citations_total                  += r.citations_total;
          summary.totals.citations_with_anchor            += r.citations_with_anchor;
          summary.totals.citations_bogus_anchor           += r.citations_bogus_anchor;
          summary.totals.citations_file_missing           += r.citations_file_missing;
          summary.totals.citations_auto_resolved          += r.citations_auto_resolved;
        }
      } catch (e) {
        summary.surfaces.push({ file: fp, error: 'audit_threw: ' + e.message });
      }
    }
  }

  summary.completed_at = new Date().toISOString();

  // PROP-069 §3 — derived citation-resolve-rate.
  const t = summary.totals;
  const resolveCount = Math.max(0, t.citations_total - t.citations_bogus_anchor - t.citations_file_missing);
  const resolveRatePct = t.citations_total > 0
    ? (100 * resolveCount / t.citations_total).toFixed(1)
    : '100.0';
  summary.totals.citation_resolve_rate_pct = Number(resolveRatePct);

  const claimUncitedRatePct = t.claim_shaped_paragraphs_total > 0
    ? (100 * t.claim_shaped_paragraphs_uncited / t.claim_shaped_paragraphs_total).toFixed(1)
    : '0.0';
  summary.totals.claim_uncited_rate_pct = Number(claimUncitedRatePct);

  // PROP-069 §6 — acceptance gates.
  summary.acceptance = {
    claim_uncited_rate_target_pct: 15,
    citation_resolve_rate_target_pct: 85,
    bogus_anchor_cap: 20,
    file_missing_cap: 20,
    claim_uncited_pass: Number(claimUncitedRatePct) <= 15,
    citation_resolve_pass: Number(resolveRatePct) >= 85,
    bogus_anchor_pass: t.citations_bogus_anchor <= 20,
    file_missing_pass: t.citations_file_missing <= 20,
  };
  summary.acceptance.all_pass =
    summary.acceptance.claim_uncited_pass &&
    summary.acceptance.citation_resolve_pass &&
    summary.acceptance.bogus_anchor_pass &&
    summary.acceptance.file_missing_pass;

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

  // PROP-069 §4.6 + workspace-sync.md §3.6c — new stdout format.
  // Also emits LEGACY keys uncited= and bogus_anchors= for one 14-day overlap
  // window so the previous workspace-sync grep doesn't break mid-deploy.
  console.log(
    'audit-narrative-citations.js v' + VERSION + (DRY_RUN ? ' (DRY RUN)' : '') + ': ' +
    'files=' + t.files_audited +
    ', claim-shaped=' + t.claim_shaped_paragraphs_total +
    ', claim-uncited=' + t.claim_shaped_paragraphs_uncited + ' (' + claimUncitedRatePct + '%)' +
    ', citations=' + t.citations_total +
    ', citation-resolve=' + resolveRatePct + '%' +
    ', bogus-anchor=' + t.citations_bogus_anchor +
    ', file-missing=' + t.citations_file_missing +
    ', auto-resolved=' + t.citations_auto_resolved +
    ' [legacy: uncited=' + t.claim_shaped_paragraphs_uncited +
    ' bogus_anchors=' + t.citations_bogus_anchor + ']'
  );

  if (!summary.acceptance.claim_uncited_pass) {
    console.log('  Stage 1: claim-uncited rate ' + claimUncitedRatePct + '% (target ≤15%).');
  }
  if (!summary.acceptance.citation_resolve_pass) {
    console.log('  Stage 2: citation-resolve rate ' + resolveRatePct + '% (target ≥85%).');
  }
  if (!summary.acceptance.bogus_anchor_pass) {
    console.log('  Stage 2: ' + t.citations_bogus_anchor + ' bogus anchor(s) (target ≤20).');
  }
  if (!summary.acceptance.file_missing_pass) {
    console.log('  Stage 2: ' + t.citations_file_missing + ' file-missing citation(s) (target ≤20).');
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
