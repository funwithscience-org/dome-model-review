#!/usr/bin/env node
/**
 * PROP-058 one-time burndown: close 4 known zombie blocked-on-curmudgeon ISSs.
 *
 * Targets (all in open-issues.json with status='blocked-on-curmudgeon' as of 2026-05-25T12:38Z):
 *   ISS-1351 (major)    — EXP-211 integrated 2026-04-25
 *   ISS-1552 (moderate) — EXP-255 → EXP-261 integrated 2026-04-27
 *   ISS-1553 (moderate) — EXP-256 integrated 2026-04-27
 *   ISS-1599 (moderate) — blocker ISS-1605 closed 2026-04-27 (operator verified WCAG contrast 2026-05-25 — status-sub 7.48:1 passes, status-num 4.43:1 passes large-text 3:1 at 1.2rem bold)
 *
 * Usage:
 *   node build-scripts/burndown-blocked-on-curmudgeon-zombies-2026-05.js --dry-run
 *   node build-scripts/burndown-blocked-on-curmudgeon-zombies-2026-05.js --apply
 *
 * Idempotent: re-running on a clean tree is a no-op.
 */
const fs = require('fs');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const APPLIED_BY = 'operator-burndown-PROP-058-2026-05-25';

// Default INCLUDES ISS-1599 — operator verified WCAG contrast 2026-05-25 (post-redesign 4.43:1 red on #222240 qualifies as large-text 3:1 at 1.2rem bold; gray 7.48:1 passes normal-text 4.5:1).
// To exclude ISS-1599 from the burndown, comment out the line below.
const TARGET_IDS = [
  'ISS-1351',
  'ISS-1552',
  'ISS-1553',
  'ISS-1599',
];

const oi = JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json', 'utf8'));
const ci = JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json', 'utf8'));
const tracker = JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json', 'utf8'));

// Build EXP integration index from BOTH live tracker.items AND tracker-archive.
const expIntegrated = new Map();
for (const e of (tracker.items || [])) {
  if (e.integrated === true || (e.status === 'complete' && e.integration_mode)) {
    expIntegrated.set(e.id, { at: e.integrated_at || e.completed_at, mode: e.integration_mode });
  }
}
try {
  for (const line of fs.readFileSync('monitor/analyst/expansion-tracker-archive.jsonl', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if ((e.integrated === true || (e.status === 'complete' && e.integration_mode)) && !expIntegrated.has(e.id)) {
        expIntegrated.set(e.id, { at: e.integrated_at || e.completed_at, mode: e.integration_mode });
      }
    } catch {}
  }
} catch {}

const closedSet = new Set(ci.issues.map(i => i.id));

function extractExpId(iss) {
  if (iss.exp_id && /^EXP-\d+$/.test(iss.exp_id)) return iss.exp_id;
  const txt = String(iss.blocked_reason || '') + ' ' + String(iss.description || '');
  const m = txt.match(/\bEXP-\d+\b/g);
  return (m && m[0]) || null;
}
function extractBlockerIss(iss) {
  const txt = String(iss.blocked_reason || '');
  const m = txt.match(/\bblocked on (ISS-\d+)\b/i);
  return (m && m[1]) || null;
}

const ledgerPath = 'monitor/decisions/closure-ledger.jsonl';
const existingLedger = new Set();
try {
  for (const l of fs.readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { existingLedger.add(JSON.parse(l).iss_id); } catch {}
  }
} catch {}

const now = new Date().toISOString();
const plan = [];
const skipped = [];

for (const id of TARGET_IDS) {
  const inClosed = ci.issues.find(c => c.id === id);
  if (inClosed) {
    skipped.push({ id, reason: 'already in closed-issues.json (idempotent skip)' });
    continue;
  }
  const iss = oi.issues.find(i => i.id === id);
  if (!iss) {
    skipped.push({ id, reason: 'not found in open-issues.json' });
    continue;
  }
  if (iss.status !== 'blocked-on-curmudgeon') {
    skipped.push({ id, reason: `current status is '${iss.status}', not 'blocked-on-curmudgeon'` });
    continue;
  }
  const expId = extractExpId(iss);
  const blockerIss = extractBlockerIss(iss);
  let mech = null, evidence = {};
  if (expId && expIntegrated.has(expId)) {
    const meta = expIntegrated.get(expId);
    mech = 'exp-integrated-burndown';
    evidence = { exp_id: expId, exp_integrated_at: meta.at, exp_integration_mode: meta.mode };
  } else if (blockerIss && closedSet.has(blockerIss)) {
    const blocker = ci.issues.find(c => c.id === blockerIss);
    mech = 'blocker-iss-closed-burndown';
    evidence = { blocker_iss: blockerIss, blocker_closed_at: blocker.closed_at || blocker.fixed_at };
  } else {
    skipped.push({ id, reason: `no integrated EXP (extracted='${expId}') AND no closed blocker (extracted='${blockerIss}'); cannot resolve` });
    continue;
  }
  plan.push({ iss, mech, evidence });
}

console.log(`burndown-blocked-on-curmudgeon-zombies-2026-05  (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
console.log(`  target_ids: ${TARGET_IDS.join(', ')}`);
console.log(`  to close:   ${plan.length}`);
console.log(`  skipped:    ${skipped.length}`);
for (const p of plan) {
  console.log(`    ${p.iss.id} sev=${p.iss.severity} → ${p.mech} ${JSON.stringify(p.evidence)}`);
}
for (const s of skipped) {
  console.log(`    [skip] ${s.id}: ${s.reason}`);
}

if (dryRun) {
  console.log('\nDRY-RUN complete. Re-run with --apply to commit changes.');
  process.exit(0);
}

if (plan.length === 0) {
  console.log('\nNothing to apply. Exiting clean.');
  process.exit(0);
}

// Apply: migrate plan entries to closed-issues, append ledger, remove from open.
const migratedIds = new Set();
for (const { iss, mech, evidence } of plan) {
  iss.status = 'fixed';
  iss.fixed_at = now;
  iss.fixed_by = mech;
  iss.migrated_at = now;
  iss.migrated_by_run = APPLIED_BY;
  iss.migrated_by_mechanism = 'one-time-burndown-PROP-058';
  iss.closure_evidence = evidence;
  ci.issues.push(iss);
  migratedIds.add(iss.id);
  if (!existingLedger.has(iss.id)) {
    fs.appendFileSync(ledgerPath, JSON.stringify({
      closed_at: now,
      closed_by_run: APPLIED_BY,
      closed_by_mechanism: 'one-time-burndown',
      iss_id: iss.id,
      prior_status: 'blocked-on-curmudgeon',
      closure_reason: `PROP-058 one-time burndown: dependency resolved (${mech})`,
      action_taken: 'patch',
      closure_evidence: Object.assign({ severity: iss.severity || 'unknown', description_excerpt: String(iss.description || '').slice(0, 120) }, evidence),
      can_revert: false,
      dryrun: false,
    }) + '\n');
  }
}

oi.issues = oi.issues.filter(i => !migratedIds.has(i.id));
oi.last_updated = now;
fs.writeFileSync('monitor/decisions/open-issues.json', JSON.stringify(oi, null, 2));
fs.writeFileSync('monitor/decisions/closed-issues.json', JSON.stringify(ci, null, 2));

console.log(`\nAPPLY complete. Migrated ${migratedIds.size} ISSs.`);
console.log(`  open-issues.json size now: ${oi.issues.length}`);
console.log(`  closed-issues.json size now: ${ci.issues.length}`);
