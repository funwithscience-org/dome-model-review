#!/usr/bin/env node
/**
 * audit-exp-tracker-gaps.js — PROP-053 deliverable
 *
 * Classify gaps in monitor/analyst/expansion-tracker.json into:
 *   - orphan_file:               file exists in monitor/analyst/expansions/, no tracker entry
 *                                → REAL gap; analyst wrote the EXP but skipped tracker write
 *   - tracker_referenced_no_file: no tracker entry, no expansion file, but referenced in
 *                                 monitor/decisions/ or monitor/curmudgeon/reviews/ or data/
 *                                 → benign; likely rolled into a batch EXP or superseded
 *   - mentioned_only:            light trace (1-2 references) only
 *                                → likely superseded mid-flight
 *   - no_trace:                  no artifact found in any searched directory
 *                                → bulk-reservation drift (analyst advanced next_id
 *                                  but aborted/raced/skipped the write)
 *
 * Output: JSON to stdout. Optional human-readable summary to stderr with --summary.
 *
 * Usage:
 *   node build-scripts/audit-exp-tracker-gaps.js          # JSON to stdout
 *   node build-scripts/audit-exp-tracker-gaps.js --summary  # also human-readable to stderr
 *   node build-scripts/audit-exp-tracker-gaps.js --json-out monitor/integrity/exp-tracker-audit.json
 *
 * Run from the repo root (process.cwd() must contain monitor/, data/).
 *
 * Integrity prompt callers should report severity:
 *   MODERATE  if by_category.orphan_file.length > 5
 *   INFO      otherwise (pure bulk-reservation drift is not a structural integrity issue)
 *
 * See monitor/prompts/reference/expansion-tracker-gap-semantics.md for the reader's guide.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TRACKER = 'monitor/analyst/expansion-tracker.json';
const ARCHIVE = 'monitor/analyst/expansion-tracker-archive.jsonl';
const EXPANSIONS_DIR = 'monitor/analyst/expansions';
const SEARCH_ROOTS = ['monitor', 'data'];

const wantSummary = process.argv.includes('--summary');
const jsonOutIdx = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIdx >= 0 ? process.argv[jsonOutIdx + 1] : null;

function pad(n) { return String(n).padStart(3, '0'); }

// ── Step 1: collect present IDs from tracker + archive ──────────────────────
function collectPresentIds() {
  const present = new Set();
  if (!fs.existsSync(TRACKER)) {
    throw new Error('expansion-tracker.json not found at ' + TRACKER);
  }
  const t = JSON.parse(fs.readFileSync(TRACKER, 'utf8'));
  const nextId = t.next_id;
  if (typeof nextId !== 'number') {
    throw new Error('expansion-tracker.json missing numeric next_id');
  }
  for (const it of (t.items || [])) {
    const m = String(it.id || '').match(/^EXP-(\d+)/);
    if (m) present.add(parseInt(m[1], 10));
  }
  if (fs.existsSync(ARCHIVE)) {
    const lines = fs.readFileSync(ARCHIVE, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const m = String(e.id || '').match(/^EXP-(\d+)/);
        if (m) present.add(parseInt(m[1], 10));
      } catch { /* skip malformed line */ }
    }
  }
  return { nextId, present };
}

// ── Step 2: collect IDs with expansion files ────────────────────────────────
function collectFileIds() {
  const files = new Set();
  if (!fs.existsSync(EXPANSIONS_DIR)) return files;
  for (const name of fs.readdirSync(EXPANSIONS_DIR)) {
    const m = name.match(/^EXP-(\d+)(\.|-)/);
    if (m) files.add(parseInt(m[1], 10));
  }
  return files;
}

// ── Step 3: count mentions of EXP-NNN across monitor/ + data/ ──────────────
//   (excluding expansion-tracker* and expansions/ since those are
//   already accounted for in steps 1+2)
function buildMentionIndex(missing) {
  // For efficiency, do ONE grep per "EXP-NNN" pattern, but batched by quoted-OR
  // — actually simpler: do one grep -r per ID. With ~94 missing IDs and a small
  // repo this is fast enough (~100ms total).
  // For very large repos consider one ripgrep call with a big alternation,
  // but stay portable: only assume POSIX grep.
  const counts = new Map();
  const grepIgnore = [
    "--exclude=expansion-tracker.json",
    "--exclude=expansion-tracker-archive.jsonl",
    "--exclude-dir=expansions",
    "--exclude=audit-exp-tracker-gaps.js"
  ].join(' ');
  for (const id of missing) {
    const target = 'EXP-' + pad(id);
    let count = 0;
    try {
      // -l = list files; pipe through wc -l. Errors → 0.
      const out = execSync(
        `grep -r -l ${grepIgnore} --include='*.json' --include='*.md' --include='*.jsonl' --include='*.txt' '${target}' ${SEARCH_ROOTS.join(' ')} 2>/dev/null | wc -l`,
        { encoding: 'utf8' }
      );
      count = parseInt(out.trim(), 10) || 0;
    } catch { count = 0; }
    counts.set(id, count);
  }
  return counts;
}

// ── Step 4: build contiguous missing ranges ─────────────────────────────────
function buildRanges(missing) {
  const ranges = [];
  let start = null;
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i];
    if (start === null) start = id;
    const isLast = i === missing.length - 1 || missing[i + 1] !== id + 1;
    if (isLast) {
      ranges.push({ start, end: id, size: id - start + 1 });
      start = null;
    }
  }
  return ranges;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const { nextId, present } = collectPresentIds();
  const fileIds = collectFileIds();

  const missing = [];
  for (let id = 1; id < nextId; id++) {
    if (!present.has(id)) missing.push(id);
  }

  const mentions = buildMentionIndex(missing);

  const byCategory = {
    orphan_file: [],
    tracker_referenced_no_file: [],
    mentioned_only: [],
    no_trace: []
  };

  for (const id of missing) {
    if (fileIds.has(id)) { byCategory.orphan_file.push(id); continue; }
    const c = mentions.get(id) || 0;
    if (c >= 3) byCategory.tracker_referenced_no_file.push(id);
    else if (c >= 1) byCategory.mentioned_only.push(id);
    else byCategory.no_trace.push(id);
  }

  const result = {
    generated_at: new Date().toISOString(),
    total_slots: nextId - 1,
    present: present.size,
    missing_total: missing.length,
    missing_ranges: buildRanges(missing),
    by_category: byCategory,
    severity_hint: byCategory.orphan_file.length > 5 ? 'MODERATE' : 'INFO',
    summary:
      byCategory.orphan_file.length +
      ' orphan-file (real gaps needing backfill); ' +
      (byCategory.tracker_referenced_no_file.length +
        byCategory.mentioned_only.length +
        byCategory.no_trace.length) +
      ' benign bulk-reservation drift; ' +
      missing.length +
      ' total missing of ' +
      (nextId - 1) +
      ' slots'
  };

  const json = JSON.stringify(result, null, 2);
  if (jsonOutPath) {
    fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
    fs.writeFileSync(jsonOutPath, json + '\n');
  } else {
    process.stdout.write(json + '\n');
  }

  if (wantSummary) {
    process.stderr.write('\n=== expansion-tracker gap audit ===\n');
    process.stderr.write('total slots:    ' + result.total_slots + '\n');
    process.stderr.write('present:        ' + result.present + '\n');
    process.stderr.write('missing total:  ' + result.missing_total + '\n');
    process.stderr.write('  orphan_file:                ' + byCategory.orphan_file.length + (byCategory.orphan_file.length ? ' [' + byCategory.orphan_file.join(',') + ']' : '') + '\n');
    process.stderr.write('  tracker_referenced_no_file: ' + byCategory.tracker_referenced_no_file.length + '\n');
    process.stderr.write('  mentioned_only:             ' + byCategory.mentioned_only.length + (byCategory.mentioned_only.length ? ' [' + byCategory.mentioned_only.join(',') + ']' : '') + '\n');
    process.stderr.write('  no_trace:                   ' + byCategory.no_trace.length + '\n');
    process.stderr.write('severity hint:  ' + result.severity_hint + '\n');
    process.stderr.write(result.summary + '\n\n');
  }
}

try {
  main();
} catch (e) {
  process.stderr.write('audit-exp-tracker-gaps.js: ' + e.message + '\n');
  process.exit(1);
}
