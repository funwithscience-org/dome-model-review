#!/usr/bin/env node
/**
 * revert-burndown-closures.js — PROP-026 Phase 1 (landed 2026-05-10)
 *
 * Reads monitor/decisions/closure-ledger.jsonl and reverts auto-closures from
 * a specified decider run (or other filter), restoring the ISSs to
 * open-issues.json with their prior_status preserved.
 *
 * Usage:
 *   node build-scripts/revert-burndown-closures.js --run <run_id>
 *   node build-scripts/revert-burndown-closures.js --iss ISS-NNNN
 *   node build-scripts/revert-burndown-closures.js --since <ISO>
 *   node build-scripts/revert-burndown-closures.js --run <run_id> --dry-run
 *
 * Idempotency: revert is a no-op if the ISS is already back in open-issues.json
 * (or never made it to closed-issues.json — e.g., dryrun:true ledger entry).
 *
 * Audit trail: every revert appends a line to closure-ledger.jsonl with type
 * 'revert' so the original close + revert pair are both visible.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function parseArgs() {
  const out = { run: null, iss: null, since: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--run') out.run = args[++i];
    else if (a === '--iss') out.iss = args[++i];
    else if (a === '--since') out.since = args[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage:');
      console.log('  --run <run_id>    revert all auto-closures from one decider run');
      console.log('  --iss <ISS-NNN>   revert one specific ISS');
      console.log('  --since <ISO>     revert all auto-closures with closed_at >= ISO');
      console.log('  --dry-run         print what would be reverted, do not write');
      process.exit(0);
    }
  }
  if (!out.run && !out.iss && !out.since) {
    console.error('ERROR: must specify at least one of --run / --iss / --since');
    process.exit(1);
  }
  return out;
}

const opts = parseArgs();

// 1. Read closure-ledger.jsonl, filter matching close-records (skip revert-records)
const ledgerPath = 'monitor/decisions/closure-ledger.jsonl';
if (!fs.existsSync(ledgerPath)) {
  console.error(`ERROR: ${ledgerPath} not found`);
  process.exit(1);
}
const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
const closeRecords = lines.map((l, i) => {
  try { return { lineNum: i + 1, data: JSON.parse(l) }; }
  catch (e) { console.error(`WARN: skip malformed line ${i + 1}: ${e.message}`); return null; }
}).filter(Boolean);

const matching = closeRecords.filter(r => {
  const d = r.data;
  // Skip revert records and dry-run records (those didn't actually close anything)
  if (d.type === 'revert') return false;
  if (d.dryrun === true) return false;
  if (d.can_revert === false) return false;
  if (opts.run && d.closed_by_run !== opts.run) return false;
  if (opts.iss && d.iss_id !== opts.iss) return false;
  if (opts.since && d.closed_at < opts.since) return false;
  return true;
});

console.log(`Found ${matching.length} closure records matching filters.`);
if (matching.length === 0) {
  console.log('Nothing to revert. Exit 0.');
  process.exit(0);
}

// Print summary
console.log('\nClosures to revert:');
for (const r of matching.slice(0, 20)) {
  const d = r.data;
  console.log(`  ${d.iss_id}: closed_at=${d.closed_at.slice(0, 19)} mechanism=${d.closed_by_mechanism} run=${d.closed_by_run} prior_status=${d.prior_status}`);
}
if (matching.length > 20) console.log(`  ... ${matching.length - 20} more`);

if (opts.dryRun) {
  console.log('\n--dry-run: no writes made. Exit 0.');
  process.exit(0);
}

// 2. Load open-issues.json and closed-issues.json
const openPath = 'monitor/decisions/open-issues.json';
const closedPath = 'monitor/decisions/closed-issues.json';
const oi = JSON.parse(fs.readFileSync(openPath, 'utf8'));
const ci = JSON.parse(fs.readFileSync(closedPath, 'utf8'));

const openIds = new Set(oi.issues.map(i => i.id));
const closedById = new Map(ci.issues.map(i => [i.id, i]));

let reverted = 0;
let skippedAlreadyOpen = 0;
let skippedNotInClosed = 0;
const revertedIds = [];

for (const r of matching) {
  const issId = r.data.iss_id;
  if (openIds.has(issId)) {
    console.log(`  SKIP ${issId}: already in open-issues.json (idempotent no-op)`);
    skippedAlreadyOpen++;
    continue;
  }
  const closedIssue = closedById.get(issId);
  if (!closedIssue) {
    console.log(`  SKIP ${issId}: not found in closed-issues.json (already manually reverted? data drift?)`);
    skippedNotInClosed++;
    continue;
  }
  // Restore prior_status (or default to 'open' if absent in ledger record)
  const restoredStatus = r.data.prior_status || 'open';
  closedIssue.status = restoredStatus;
  delete closedIssue.fixed_by;
  delete closedIssue.closed_by_run;
  delete closedIssue.auto_closed;
  closedIssue.reverted_at = new Date().toISOString();
  closedIssue.reverted_from_close_run = r.data.closed_by_run;
  // Move closed → open
  ci.issues = ci.issues.filter(i => i.id !== issId);
  oi.issues.push(closedIssue);
  reverted++;
  revertedIds.push(issId);
}

if (reverted === 0) {
  console.log(`\nNo writes needed (skipped: ${skippedAlreadyOpen} already open + ${skippedNotInClosed} not in closed). Exit 0.`);
  process.exit(0);
}

// 3. Write updated files
const now = new Date().toISOString();
oi.last_updated = now;
ci.last_updated = now;
fs.writeFileSync(openPath, JSON.stringify(oi, null, 2));
fs.writeFileSync(closedPath, JSON.stringify(ci, null, 2));

// 4. Append revert record to ledger
const revertRecord = {
  type: 'revert',
  reverted_at: now,
  reverted_by_run: process.env.RUN_ID || `manual-revert-${Date.now()}`,
  filter: opts,
  iss_ids: revertedIds,
  count: reverted,
  skipped_already_open: skippedAlreadyOpen,
  skipped_not_in_closed: skippedNotInClosed
};
fs.appendFileSync(ledgerPath, JSON.stringify(revertRecord) + '\n');

console.log(`\nReverted ${reverted} ISSs.`);
console.log(`  Skipped: ${skippedAlreadyOpen} already in open + ${skippedNotInClosed} not in closed.`);
console.log(`  open-issues.json: now ${oi.issues.length} entries`);
console.log(`  closed-issues.json: now ${ci.issues.length} entries`);
console.log(`  Audit-trail revert record appended to ${ledgerPath}.`);
