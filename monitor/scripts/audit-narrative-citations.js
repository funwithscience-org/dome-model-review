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
 *   - Canonical disciplines: monitor/prompts/reference/state-verification.md
 *   - Version:               1.0.0
 *   - Invocation:            node monitor/scripts/audit-narrative-citations.js [--dry-run] [--since=YYYY-MM-DD] [--all]
 *                            (typically from monitor/prompts/workspace-sync.md
 *                            alongside verify-pending-state.js)
 *   - Audited surfaces:      monitor/decisions/daily-report-*.json
 *                              → pipeline_status.{poller,analyst,curmudgeon,decider}
 *                              → recommended_actions[].action
 *                            monitor/curmudgeon/reviews/*.json
 *                              → kernel_of_truth.description
 *                              → kernel_of_truth.why_it_doesnt_save_claim
 *                              → our_argument_summary
 *                            monitor/tinker/report-*.json
 *                              → findings[].description
 *   - Output report:         monitor/integrity/narrative-cite-audit-<ISO>.json
 *
 * STAGE 1 (paragraph gate, HARD AUTOMATABLE): every paragraph >1 sentence
 * MUST contain at least one inline citation matching CITATION_RE.
 * Acceptance threshold per amendment Q3: 0% uncited paragraphs across the
 * post-rollout 14-day window.
 *
 * STAGE 2 (anchor match, PARTIAL AUTOMATABLE): for each citation that
 * includes a `:<field-anchor>` tail, verify the cited file exists AND
 * (for JSON files) contains a key matching the anchor anywhere in the
 * tree. For .md/.txt the anchor is checked as a literal substring.
 * Acceptance threshold: ≤2% bogus anchors in declared-state prose.
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
 *
 * IDEMPOTENCY: this script never writes to audited inputs. The only output
 * is the integrity report. Re-running produces the same per-file counts
 * given the same on-disk state.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
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
// Spec source: PROP-014 amendment-001 Q3 stage_1_paragraph_gate.
const CITATION_RE = /\(([^)]+\.(?:json|jsonl|txt|md))(?::([\w-]+))?\)/g;

// Sentence boundary: '.', '!', '?' followed by whitespace + capital letter.
// Counts boundaries; sentence count = boundaries + 1 for any non-empty paragraph.
const SENTENCE_BOUNDARY_RE = /[.!?]\s+[A-Z]/g;

// ---- Surface configuration ----
// Each surface declares: a directory + filename regex, and an extractor
// that returns [{label, prose}, ...] from a parsed JSON document.
// Adding a new surface = one entry.
const SURFACES = [
  {
    name: 'daily-report.pipeline_status',
    dir: 'monitor/decisions',
    re: /^daily-report-.*\.json$/,
    extract: (data) => {
      const out = [];
      const ps = data && data.pipeline_status;
      if (ps && typeof ps === 'object') {
        for (const k of Object.keys(ps)) {
          if (typeof ps[k] === 'string') {
            out.push({ label: 'pipeline_status.' + k, prose: ps[k] });
          }
        }
      }
      return out;
    },
  },
  {
    name: 'daily-report.recommended_actions[].action',
    dir: 'monitor/decisions',
    re: /^daily-report-.*\.json$/,
    extract: (data) => {
      const out = [];
      const acts = data && Array.isArray(data.recommended_actions) ? data.recommended_actions : [];
      acts.forEach((a, i) => {
        if (a && typeof a.action === 'string') {
          out.push({ label: 'recommended_actions[' + i + '].action', prose: a.action });
        }
      });
      return out;
    },
  },
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
      const out = [];
      const findings = data && Array.isArray(data.findings) ? data.findings : [];
      findings.forEach((f, i) => {
        if (f && typeof f.description === 'string') {
          out.push({ label: 'findings[' + i + '].description', prose: f.description });
        }
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

function checkAnchor(citation) {
  // Returns { decision, detail }
  // Decisions: 'verified' | 'bogus_anchor' | 'file_missing' | 'no_anchor' | 'unsupported'
  const f = citation.file;
  if (!fs.existsSync(f)) return { decision: 'file_missing', detail: 'cited file does not exist' };
  if (!citation.anchor) return { decision: 'no_anchor', detail: 'citation has no anchor; Stage 2 skipped' };

  if (/\.jsonl?$/.test(f)) {
    const r = safeJson(f);
    if (!r.ok) return { decision: 'bogus_anchor', detail: 'JSON parse failed: ' + r.err };
    if (jsonHasKey(r.data, citation.anchor)) return { decision: 'verified' };
    return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not found in JSON tree' };
  }

  if (/\.(md|txt)$/.test(f)) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      if (txt.includes(citation.anchor)) return { decision: 'verified' };
      return { decision: 'bogus_anchor', detail: 'anchor "' + citation.anchor + '" not present in file text' };
    } catch (e) {
      return { decision: 'bogus_anchor', detail: 'read failed: ' + e.message };
    }
  }

  return { decision: 'unsupported', detail: 'unsupported file extension for anchor check' };
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
    sample_uncited: [],
    sample_bogus: [],
  };

  for (const entry of proseEntries) {
    const paragraphs = extractParagraphs(entry.prose);
    for (const p of paragraphs) {
      const sCount = countSentences(p);
      if (sCount <= 1) continue;
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
        if (c.anchor) {
          result.citations_with_anchor++;
          const a = checkAnchor(c);
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
        } else if (!fs.existsSync(c.file)) {
          // No anchor — only check existence.
          result.citations_file_missing++;
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
      citations_total:         0,
      citations_with_anchor:   0,
      citations_bogus_anchor:  0,
      citations_file_missing:  0,
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
        }
      } catch (e) {
        summary.surfaces.push({ file: fp, error: 'audit_threw: ' + e.message });
      }
    }
  }

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

  const t = summary.totals;
  const uncitedPct = t.paragraphs_total
    ? (100 * t.paragraphs_uncited / t.paragraphs_total).toFixed(1)
    : '0.0';
  const bogusPct = t.citations_with_anchor
    ? (100 * t.citations_bogus_anchor / t.citations_with_anchor).toFixed(1)
    : '0.0';

  console.log(
    'audit-narrative-citations.js v' + VERSION + (DRY_RUN ? ' (DRY RUN)' : '') + ': ' +
    'files=' + t.files_audited +
    ', paragraphs=' + t.paragraphs_total +
    ', uncited=' + t.paragraphs_uncited + ' (' + uncitedPct + '%)' +
    ', citations=' + t.citations_total +
    ', bogus_anchors=' + t.citations_bogus_anchor + ' (' + bogusPct + '% of anchored)' +
    ', file_missing=' + t.citations_file_missing
  );

  if (t.paragraphs_uncited > 0) {
    console.log('  Stage 1: ' + t.paragraphs_uncited + ' uncited paragraph(s) above 1-sentence threshold (target 0%).');
  }
  if (t.citations_bogus_anchor > 0) {
    console.log('  Stage 2: ' + t.citations_bogus_anchor + ' bogus anchor(s) (target ≤2%).');
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
