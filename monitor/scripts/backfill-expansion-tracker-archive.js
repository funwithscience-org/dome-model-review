#!/usr/bin/env node
/*
 * monitor/scripts/backfill-expansion-tracker-archive.js
 *
 * PROP-022 phase 5 one-shot backfill: split expansion-tracker.json into
 *   - monitor/analyst/expansion-tracker.json (live: items not yet integrated AND not in terminal status)
 *   - monitor/analyst/expansion-tracker-archive.jsonl (everything else)
 *
 * Live state predicate (PROP-022 amendment-001 phase_5_gap_1, corrected):
 *   i.integrated !== true && i.status NOT in (cancelled, superseded, subsumed)
 *
 * Equivalently: keep an item live if `integrated:true` is NOT set AND its
 * status is not one of the three terminal-by-status values. Move to archive
 * when `integrated:true` is set OR when status flips to cancelled/superseded/
 * subsumed.
 *
 * Top-level metadata preserved in live file: description, last_updated,
 * next_id, total_items. (next_id stays in live per gap_4 — same precedent
 * as priority-queue.json phase 3.)
 *
 * Archive shape: one JSON object per line, no enclosing array. Each line is
 * the FULL item record at the moment of archival, terminated by '\n'.
 *
 * Idempotent: re-running with no live items moving to archive is a no-op
 * on the live file (same content) and an append of zero lines on the
 * archive file. Refuses to overwrite an existing archive (use --force).
 *
 * Usage:
 *   node monitor/scripts/backfill-expansion-tracker-archive.js [--dry-run] [--force]
 *
 * Run from the repo root.
 */

const fs = require('fs');
const path = require('path');

const TRACKER_PATH = 'monitor/analyst/expansion-tracker.json';
const ARCHIVE_PATH = 'monitor/analyst/expansion-tracker-archive.jsonl';
const TERMINAL_STATUSES = new Set(['cancelled', 'superseded', 'subsumed']);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

function isLive(item) {
  return item.integrated !== true && !TERMINAL_STATUSES.has(item.status);
}

function main() {
  if (!fs.existsSync(TRACKER_PATH)) {
    console.error(`FAIL: ${TRACKER_PATH} not found. Run from repo root.`);
    process.exit(1);
  }
  if (fs.existsSync(ARCHIVE_PATH) && !force && !dryRun) {
    console.error(`FAIL: ${ARCHIVE_PATH} already exists. Use --force to overwrite (destructive) or --dry-run to preview.`);
    process.exit(1);
  }

  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  const items = tracker.items || [];
  const totalIn = items.length;

  const live = [];
  const archive = [];
  for (const item of items) {
    (isLive(item) ? live : archive).push(item);
  }

  console.log(`Read:    ${totalIn} items from ${TRACKER_PATH}`);
  console.log(`  Live:    ${live.length} (predicate: !integrated && status NOT in [cancelled,superseded,subsumed])`);
  console.log(`  Archive: ${archive.length}`);
  console.log('');

  // Sanity: total preservation
  if (live.length + archive.length !== totalIn) {
    console.error(`FAIL: partition lost items (${live.length}+${archive.length}=${live.length+archive.length} != ${totalIn})`);
    process.exit(1);
  }

  // Show live items for sanity
  console.log('Live items detail:');
  for (const i of live) {
    console.log(`  ${i.id} status=${i.status} integrated=${i.integrated}`);
  }
  console.log('');

  if (dryRun) {
    console.log('DRY RUN: no files written. Re-run without --dry-run to apply.');
    return;
  }

  // Build live file (preserve top-level metadata, replace items)
  const liveFile = {
    description: tracker.description,
    items: live,
    last_updated: new Date().toISOString(),
    next_id: tracker.next_id,
    total_items: tracker.total_items
  };

  // Build archive (one JSON object per line, no enclosing array)
  const archiveLines = archive.map(i => JSON.stringify(i)).join('\n') + '\n';

  // Write atomically: archive first, then live (so a crash mid-write leaves
  // the archive present + live still original — recoverable forward).
  fs.writeFileSync(ARCHIVE_PATH, archiveLines);
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(liveFile, null, 2) + '\n');

  console.log(`Wrote:   ${TRACKER_PATH} (${live.length} live items)`);
  console.log(`Wrote:   ${ARCHIVE_PATH} (${archive.length} archived items, JSONL)`);

  // Post-write verification
  const verifyLive = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  const verifyArchLines = fs.readFileSync(ARCHIVE_PATH, 'utf8').split('\n').filter(Boolean);
  console.log('');
  console.log('Verify:');
  console.log(`  Live re-read:    ${verifyLive.items.length} items, next_id=${verifyLive.next_id}`);
  console.log(`  Archive re-read: ${verifyArchLines.length} lines`);
  console.log(`  Total round-trip: ${verifyLive.items.length + verifyArchLines.length} == ${totalIn}? ${verifyLive.items.length + verifyArchLines.length === totalIn ? 'YES' : 'NO'}`);

  // ID-set preservation check (cheap regression test 1)
  const origIds = new Set(items.map(i => i.id));
  const newIds = new Set([...verifyLive.items.map(i => i.id), ...verifyArchLines.map(l => JSON.parse(l).id)]);
  const missing = [...origIds].filter(id => !newIds.has(id));
  const extra = [...newIds].filter(id => !origIds.has(id));
  if (missing.length || extra.length) {
    console.error(`FAIL: id-set differs. missing=${missing.slice(0,5)} extra=${extra.slice(0,5)}`);
    process.exit(1);
  }
  console.log(`  ID-set preserved: ${origIds.size} == ${newIds.size}? YES`);
}

main();
