#!/usr/bin/env node
// PROP-055 one-time backfill: append closure-ledger.jsonl entries for the 12 ISSs closed
// between 2026-05-18 and 2026-05-25 whose close path bypassed the ledger.
// Read each ISS from closed-issues.json, synthesize a ledger line preserving original closed_at,
// closed_by_mechanism='self-apply-backfill' (so the audit trail shows this is a retro-write).
// Idempotent: skips IDs already in the ledger.
//
// Usage:
//   node build-scripts/backfill-closure-ledger-2026-05.js --dry-run   # report what would be appended
//   node build-scripts/backfill-closure-ledger-2026-05.js --apply     # actually append

const fs = require('fs');
const APPLY = process.argv.includes('--apply');
const DRY = process.argv.includes('--dry-run') || !APPLY;

const LEDGER = 'monitor/decisions/closure-ledger.jsonl';
const CLOSED = 'monitor/decisions/closed-issues.json';

const TARGET_IDS = [
  'ISS-2104', 'ISS-2176', 'ISS-2177', 'ISS-2178', 'ISS-2179', 'ISS-2180',
  'ISS-2181', 'ISS-2182', 'ISS-2183', 'ISS-2184', 'ISS-2185', 'ISS-2186'
];

const existingIds = new Set();
if (fs.existsSync(LEDGER)) {
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { existingIds.add(JSON.parse(line).iss_id); } catch {}
  }
}

const ci = JSON.parse(fs.readFileSync(CLOSED, 'utf8'));
const toBackfill = [];
for (const id of TARGET_IDS) {
  if (existingIds.has(id)) {
    console.log('SKIP', id, '(already in ledger)');
    continue;
  }
  const issue = ci.issues.find(i => i.id === id);
  if (!issue) {
    console.log('MISS', id, '(not in closed-issues.json)');
    continue;
  }
  const ledgerLine = {
    closed_at: issue.closed_at || issue.fixed_at,
    closed_by_run: (issue.fixed_by || '').replace(/^decider-self-apply-/, '').replace(/^.*?(decider-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}).*$/, '$1') || 'unknown',
    closed_by_mechanism: 'self-apply-backfill',
    iss_id: id,
    prior_status: 'open',
    closure_reason: issue.closure_reason || issue.notes || issue.fix_description || 'PROP-055 backfill: original closure bypassed ledger',
    action_taken: 'patch',
    closure_evidence: {
      severity: issue.severity || 'unknown',
      target: issue.target || issue.location || null,
      description_excerpt: String(issue.description || issue.title || '').slice(0, 120),
      backfill_source: 'closed-issues.json',
      backfill_authored_at: new Date().toISOString(),
      backfill_prop: 'PROP-055'
    },
    can_revert: false,
    dryrun: false
  };
  toBackfill.push(ledgerLine);
  console.log(DRY ? 'WOULD APPEND' : 'APPEND', id, ledgerLine.closed_at);
}

if (toBackfill.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

if (APPLY) {
  for (const line of toBackfill) {
    fs.appendFileSync(LEDGER, JSON.stringify(line) + '\n');
  }
  console.log('Appended', toBackfill.length, 'lines to', LEDGER);
} else {
  console.log('\n(DRY RUN) Would append', toBackfill.length, 'lines. Re-run with --apply to commit.');
}
