#!/usr/bin/env node
// PROP-056 one-time burndown: migrate the 11 stranded status='closed' entries
// from open-issues.json to closed-issues.json with canonical status normalization.
// Same logic as the end-of-run Step A0 sweep, but explicitly targeted by ID list
// so the burndown can run cleanly even if Step A0 isn't yet deployed.
//
// Usage:
//   node build-scripts/burndown-status-closed-residue-2026-05.js --dry-run
//   node build-scripts/burndown-status-closed-residue-2026-05.js --apply

const fs = require('fs');
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry-run') || !APPLY;

const OI = 'monitor/decisions/open-issues.json';
const CI = 'monitor/decisions/closed-issues.json';
const LEDGER = 'monitor/decisions/closure-ledger.jsonl';

const TARGET_IDS = [
  'ISS-2094', 'ISS-2095', 'ISS-2096', 'ISS-2098', 'ISS-2099', 'ISS-2101',
  'ISS-2102', 'ISS-2158', 'ISS-2162', 'ISS-2163', 'ISS-2168'
];

function canonicalStatus(iss) {
  const fb = String(iss.fixed_by || iss.closed_by || '').toLowerCase();
  if (/wontfix|superseded|already-resolved|fuse-sync-gap/.test(fb)) return 'wontfix';
  return 'fixed';
}

const oi = JSON.parse(fs.readFileSync(OI, 'utf8'));
const ci = JSON.parse(fs.readFileSync(CI, 'utf8'));
const closedIds = new Set(ci.issues.map(i => i.id));
const existingLedger = new Set();
if (fs.existsSync(LEDGER)) {
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { existingLedger.add(JSON.parse(line).iss_id); } catch {}
  }
}

const now = new Date().toISOString();
const ledgerAppends = [];
const migrated = [];
const skipped = [];

for (const id of TARGET_IDS) {
  const idx = oi.issues.findIndex(i => i.id === id);
  if (idx < 0) { skipped.push({id, reason: 'not in open-issues.json'}); continue; }
  const iss = oi.issues[idx];
  if (iss.status !== 'closed') { skipped.push({id, reason: 'status='+iss.status+', not the residue case'}); continue; }
  if (closedIds.has(id)) { skipped.push({id, reason: 'already in closed-issues.json (dup)'}); continue; }

  const canonical = canonicalStatus(iss);
  iss.status = canonical;
  iss.migrated_at = now;
  iss.migrated_by_run = 'burndown-PROP-056-2026-05-25';
  iss.migrated_by_mechanism = 'one-time-burndown';
  migrated.push({id, canonical, original_fixed_by: iss.fixed_by || iss.closed_by});

  if (!existingLedger.has(id)) {
    ledgerAppends.push({
      closed_at: iss.closed_at || iss.fixed_at || now,
      closed_by_run: 'burndown-PROP-056-2026-05-25',
      closed_by_mechanism: 'one-time-burndown',
      iss_id: id,
      prior_status: 'closed-in-open-issues',
      closure_reason: 'PROP-056 one-time burndown: original close site bypassed migration; canonical status='+canonical,
      action_taken: canonical === 'wontfix' ? 'wontfix' : 'patch',
      closure_evidence: {
        original_fixed_by: iss.fixed_by || iss.closed_by || null,
        severity: iss.severity || 'unknown',
        description_excerpt: String(iss.description || iss.title || '').slice(0, 120),
        burndown_prop: 'PROP-056',
        burndown_authored_at: now
      },
      can_revert: false,
      dryrun: false
    });
  }
}

// Move migrated entries: remove from oi, push to ci
const migratedIds = new Set(migrated.map(m => m.id));
for (const m of migrated) {
  const idx = oi.issues.findIndex(i => i.id === m.id);
  const iss = oi.issues.splice(idx, 1)[0];
  ci.issues.push(iss);
}
oi.last_updated = now;

console.log('migrated:', migrated.length);
migrated.forEach(m => console.log('  ', m.id, '->', m.canonical, '(original fixed_by=' + m.original_fixed_by + ')'));
console.log('skipped:', skipped.length);
skipped.forEach(s => console.log('  ', s.id, '-', s.reason));
console.log('ledger appends:', ledgerAppends.length);

if (APPLY) {
  fs.writeFileSync(OI, JSON.stringify(oi, null, 2));
  fs.writeFileSync(CI, JSON.stringify(ci, null, 2));
  for (const line of ledgerAppends) {
    fs.appendFileSync(LEDGER, JSON.stringify(line) + '\n');
  }
  console.log('APPLIED. open-issues.json:', oi.issues.length, '/ closed-issues.json:', ci.issues.length);
} else {
  console.log('\n(DRY RUN) Re-run with --apply to commit.');
}
