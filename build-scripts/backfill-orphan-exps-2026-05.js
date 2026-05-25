#!/usr/bin/env node
/**
 * PROP-053 follow-up: backfill the 50 orphan_file EXP IDs into expansion-tracker-archive.jsonl.
 *
 * Orphan = EXP-NNN.json file present on disk in monitor/analyst/expansions/, no tracker entry.
 * These are completed analyst work that never got recorded in the tracker. Reconstruct the
 * tracker entry from the file's own metadata (item_id, target, source, authored_at, etc.),
 * append to expansion-tracker-archive.jsonl with status='complete' but integrated=null
 * (orphan-backfill cannot prove integration; future audit verifies via the actual data file).
 *
 * Usage:
 *   node build-scripts/backfill-orphan-exps-2026-05.js --dry-run
 *   node build-scripts/backfill-orphan-exps-2026-05.js --apply
 *
 * Idempotent: re-running is a no-op (skips any ID that already has a tracker entry).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const APPLIED_BY = 'operator-orphan-backfill-2026-05-25';
const NOW = new Date().toISOString();

// 1. Run the audit and capture orphan_file IDs
const auditOut = require('child_process').execSync('node build-scripts/audit-exp-tracker-gaps.js', { encoding: 'utf8' });
const audit = JSON.parse(auditOut);
const orphanIds = audit.by_category.orphan_file || [];
console.log(`audit reports ${orphanIds.length} orphan_file IDs`);
if (orphanIds.length === 0) {
  console.log('nothing to do.');
  process.exit(0);
}

// 2. Build a map id -> filename by scanning the expansions directory
const expDir = 'monitor/analyst/expansions';
const files = fs.readdirSync(expDir).filter(f => f.endsWith('.json'));
const idToFile = new Map();
for (const f of files) {
  const m = f.match(/^EXP-(\d+)/);
  if (m) {
    const id = parseInt(m[1], 10);
    // Prefer the first match per id (handle disambiguated names)
    if (!idToFile.has(id)) idToFile.set(id, f);
  }
}

// 3. Load existing tracker (live + archive) for dedup
const tracker = JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json', 'utf8'));
const knownIds = new Set();
for (const e of (tracker.items || [])) {
  if (e.id) knownIds.add(parseInt(String(e.id).replace(/^EXP-/, ''), 10));
}
try {
  for (const line of fs.readFileSync('monitor/analyst/expansion-tracker-archive.jsonl', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.id) knownIds.add(parseInt(String(e.id).replace(/^EXP-/, ''), 10));
    } catch {}
  }
} catch {}

// 4. For each orphan, read its EXP file and construct a tracker entry
const plan = [];
const skipped = [];
for (const id of orphanIds) {
  const idStr = `EXP-${id}`;
  if (knownIds.has(id)) {
    skipped.push({ id: idStr, reason: 'already in tracker (idempotent skip)' });
    continue;
  }
  const fn = idToFile.get(id);
  if (!fn) {
    skipped.push({ id: idStr, reason: 'no EXP file found on disk (audit may have stale data)' });
    continue;
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(path.join(expDir, fn), 'utf8'));
  } catch (e) {
    skipped.push({ id: idStr, reason: `JSON parse error: ${e.message}` });
    continue;
  }
  // Construct best-effort tracker entry
  const entry = {
    id: idStr,
    target: doc.target || doc.scope || doc.description || `(orphan-backfilled from ${fn})`,
    source: doc.source || doc.source_hnote || 'orphan-backfill',
    category: doc.category || doc.patch_type || 'orphan-backfill',
    issue_ids: doc.issue_ids || doc.resolves_issues || [],
    priority: doc.priority || 'low',
    status: 'orphan-backfilled-status-unknown',
    integrated: null,
    integrated_at: doc.integrated_at || null,
    integration_mode: doc.integration_mode || null,
    authored_by: doc.authored_by || 'orphan-backfill-unknown',
    authored_at: doc.authored_at || doc.created_at || null,
    completed_at: doc.completed_at || null,
    output_file: path.join('monitor/analyst/expansions', fn),
    review_class: doc.review_class || null,
    backfilled_at: NOW,
    backfilled_by: APPLIED_BY,
    backfill_note: 'PROP-053 follow-up: reconstructed tracker entry from orphan EXP file; pre-backfill state had file-on-disk with no tracker entry. integrated=null because backfill cannot verify integration without re-scanning data files. Status reflects this uncertainty; a future audit pass should set integrated based on actual data-file evidence.',
  };
  plan.push(entry);
}

console.log(`\nbackfill-orphan-exps-2026-05  (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
console.log(`  to write:  ${plan.length}`);
console.log(`  skipped:   ${skipped.length}`);
for (const p of plan.slice(0, 10)) {
  console.log(`    ${p.id} target="${String(p.target).slice(0, 80)}" file=${p.output_file}`);
}
if (plan.length > 10) console.log(`    ... and ${plan.length - 10} more`);
for (const s of skipped.slice(0, 10)) {
  console.log(`    [skip] ${s.id}: ${s.reason}`);
}

if (dryRun) {
  console.log('\nDRY-RUN complete. Re-run with --apply to commit.');
  process.exit(0);
}

if (plan.length === 0) {
  console.log('\nNothing to apply.');
  process.exit(0);
}

const archivePath = 'monitor/analyst/expansion-tracker-archive.jsonl';
const lines = plan.map(e => JSON.stringify(e)).join('\n') + '\n';
fs.appendFileSync(archivePath, lines);

console.log(`\nAPPLY complete. Appended ${plan.length} orphan-backfill entries to ${archivePath}.`);
console.log('Re-run audit-exp-tracker-gaps.js to verify orphan_file count is now 0.');
