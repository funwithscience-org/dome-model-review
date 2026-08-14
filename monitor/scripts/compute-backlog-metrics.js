#!/usr/bin/env node
// compute-backlog-metrics.js — PROP-151 (2026-08-14, tinker self-applied)
//
// Encapsulates tinker's PROP-030 backlog-trend pre-flight: computes the
// queue-metrics row, appends it to monitor/tinker/queue-history.jsonl, and
// evaluates every threshold tier (incl. the small-base floor and PROP-117
// Detector B) so the LLM reads conclusions instead of re-implementing ~120
// lines of inline JS each run.
//
// Why a script (root-cause history): the inline block produced two recurring
// bug classes that prompt annotations failed to fully kill —
//   (1) RUN_ID env-passing: each MCP bash call is a fresh shell; runs on
//       2026-08-09 and 2026-08-10 appended rows with missing/wrong
//       tinker_run_id despite a prior self-fix note.
//   (2) fixed_at field-name hazard: closed-issues.json timestamps closure as
//       `fixed_at` (NOT closed_at); a closed_at-only read silently
//       undercounts closed-velocity to ~0.
// Both fixes are now code, not prompt discipline.
//
// Usage (from the tinker clone root):
//   node monitor/scripts/compute-backlog-metrics.js --run-id 2026-08-14T02-40 [--dry-run]
//
// Output: single JSON object on stdout:
//   { metrics, thresholds_fired: [{tier, reason}], suppressed_percent_trips: [],
//     detector_b: {fired, reason}, row_appended }
// Exit codes: 0 = computed (regardless of thresholds), 2 = computation error.
// FAIL-LOUD BY DESIGN: unlike the auto-close walkers this must not swallow
// errors — a missing queue-history row breaks the PROP-081 pre-push artifact
// lint and blinds trend analysis. Per-metric soft-fails (e.g. unreadable
// optional file) degrade that metric to null/0, but a failure to read
// open-issues.json or append the row exits 2.

'use strict';
const fs = require('fs');
const cp = require('child_process');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const RUN_ID = arg('--run-id');
const DRY = process.argv.includes('--dry-run');
if (!RUN_ID) {
  console.error('ERROR: --run-id is required (format YYYY-MM-DDTHH-MM)');
  process.exit(2);
}

const HISTORY = 'monitor/tinker/queue-history.jsonl';
const now = Date.now();
const cutoff7 = now - 7 * 86400000;

let oi;
try {
  oi = JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json', 'utf8'));
} catch (e) {
  console.error('ERROR: cannot read monitor/decisions/open-issues.json: ' + e.message);
  process.exit(2);
}

const ageDays = i => {
  const t = i.found_at || i.created_at;
  return t ? (now - Date.parse(t)) / 86400000 : null;
};
const openAges = oi.issues.filter(i => i.status === 'open').map(i => ageDays(i) || 0);

const metrics = {
  ts: new Date().toISOString(),
  tinker_run_id: RUN_ID,
  open_issues_total: oi.issues.length,
  open_status_count: oi.issues.filter(i => i.status === 'open').length,
  assigned_analyst_count: oi.issues.filter(i => i.status === 'assigned-analyst').length,
  age_ge_14d_count: oi.issues.filter(i => { const a = ageDays(i); return a !== null && a >= 14; }).length,
  age_ge_30d_count: oi.issues.filter(i => { const a = ageDays(i); return a !== null && a >= 30; }).length,
  oldest_open_age_days: openAges.length ? Math.max(...openAges) : 0
};

metrics.new_issues_velocity_7d = oi.issues.filter(i => {
  const t = i.found_at || i.created_at;
  return t && Date.parse(t) > cutoff7;
}).length;

// Closed velocity: closed-issues.json `fixed_at` within 7d (FIELD-NAME HAZARD:
// it is fixed_at, NOT closed_at/resolved_at) + non-dryrun closure-ledger rows.
let closed7 = 0;
try {
  const ci = JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json', 'utf8'));
  const arr = ci.issues || ci;
  closed7 += arr.filter(i => i.fixed_at && Date.parse(i.fixed_at) > cutoff7).length;
} catch (_) {}
try {
  for (const line of fs.readFileSync('monitor/decisions/closure-ledger.jsonl', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!r.dryrun && r.ts && Date.parse(r.ts) > cutoff7) closed7++; } catch (_) {}
  }
} catch (_) {}
metrics.closed_issues_velocity_7d = closed7;
metrics.net_velocity_7d = metrics.closed_issues_velocity_7d - metrics.new_issues_velocity_7d;

// PROP-034: baby-drain throughput (expansion-tracker completions by analyst-baby, 7d)
let baby = 0, verifyDrain = 0;
try {
  const t = JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json', 'utf8'));
  const arr = t.items || (Array.isArray(t) ? t : Object.values(t));
  baby = arr.filter(i =>
    (String(i.status || '').startsWith('consolidated-into-') || i.status === 'complete') &&
    i.completed_at && Date.parse(i.completed_at) > cutoff7 &&
    (i.authored_by === 'analyst-baby' || i.claimed_by === 'analyst-baby')
  ).length;
} catch (_) {}
metrics.baby_drain_count_7d = baby;

// PROP-038: verify-mode curmudgeon throughput (7d)
try {
  for (const f of fs.readdirSync('monitor/curmudgeon/reviews')) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync('monitor/curmudgeon/reviews/' + f, 'utf8'));
      if (r.agent_subtype === 'curmudgeon-verify' && r.reviewed_at && Date.parse(r.reviewed_at) > cutoff7) verifyDrain++;
    } catch (_) {}
  }
} catch (_) {}
metrics.verify_drain_count_7d = verifyDrain;

// PROP-043: pending commission HNOTEs
let commissionCount = 0;
try {
  const h = JSON.parse(fs.readFileSync('monitor/analyst/human-notes.json', 'utf8'));
  const arr = h.notes || (Array.isArray(h) ? h : Object.values(h));
  commissionCount = arr.filter(n => n.status === 'pending' && n.commission === true).length;
} catch (_) {}
metrics.pending_commission_hnotes_count = commissionCount;

// PROP-085: root-FS headroom; PROP-105: closed-issues size
try {
  metrics.root_fs_free_mb = parseInt(cp.execSync("df -m / | awk 'NR==2{print $4}'").toString().trim(), 10);
} catch (_) { metrics.root_fs_free_mb = null; }
try {
  const st = fs.statSync('monitor/decisions/closed-issues.json');
  metrics.closed_issues_mb = +(st.size / 1024 / 1024).toFixed(2);
} catch (_) { metrics.closed_issues_mb = null; }

// PROP-117 Detector B: unreviewed win-new items in the priority queue
let burstUnreviewed = 0;
try {
  const pq = JSON.parse(fs.readFileSync('monitor/curmudgeon/priority-queue.json', 'utf8'));
  const items = pq.items || [];
  const winNew = items.filter(it => (it.target_type || it.class || '') === 'win-new' || (it.target || '').match(/^WIN-\d{3}$/));
  for (const it of winNew) {
    const target = (it.target || '').replace(/^WIN-/, '');
    let hasReview = false;
    try {
      const files = fs.readdirSync('monitor/curmudgeon/reviews/');
      hasReview = files.some(f => f.startsWith('WIN-' + target + '.'));
    } catch (_) {}
    if (!hasReview) burstUnreviewed++;
  }
} catch (_) {}
metrics.inbound_burst_winnew_unreviewed = burstUnreviewed;

// sessions-FS headroom (PROP-148 companion telemetry, rows carry it since 08-13)
try {
  metrics.sessions_fs_avail_mb = parseInt(cp.execSync('df -m ' + JSON.stringify(process.cwd()) + " | awk 'NR==2{print $4}'").toString().trim(), 10);
} catch (_) { metrics.sessions_fs_avail_mb = null; }

// ---- Threshold evaluation (PROP-030 calibration + 2026-07-30 small-base floor)
const fired = [];
const suppressed = [];
let history = [];
try {
  history = fs.readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
} catch (_) {}

// WoW comparison: row closest to 7d ago (within 5–9d window preferred, else nearest older)
const target = now - 7 * 86400000;
let wowRow = null, bestDelta = Infinity;
for (const r of history) {
  if (!r.ts) continue;
  const d = Math.abs(Date.parse(r.ts) - target);
  if (d < bestDelta) { bestDelta = d; wowRow = r; }
}
let wowPct = null;
if (wowRow && typeof wowRow.open_issues_total === 'number' && wowRow.open_issues_total > 0) {
  wowPct = (metrics.open_issues_total - wowRow.open_issues_total) / wowRow.open_issues_total * 100;
}
const percentTiersActive = metrics.open_issues_total >= 30;

// Consecutive negative-velocity runs (trailing history rows + this row)
let negStreak = metrics.net_velocity_7d < 0 ? 1 : 0;
if (negStreak) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (typeof history[i].net_velocity_7d === 'number' && history[i].net_velocity_7d < 0) negStreak++;
    else break;
  }
}

function firePct(tier, limit) {
  if (wowPct === null || wowPct <= limit) return;
  if (percentTiersActive) fired.push({ tier, reason: 'open_issues_total grew ' + wowPct.toFixed(1) + '% WoW (>' + limit + '%)' });
  else suppressed.push({ tier, reason: 'WoW +' + wowPct.toFixed(1) + '% >' + limit + '% suppressed by small-base floor (total ' + metrics.open_issues_total + ' < 30)' });
}
firePct('info', 5); firePct('moderate', 10); firePct('major', 20);
if (metrics.open_issues_total > 200) fired.push({ tier: 'moderate', reason: 'open_issues_total > 200' });
if (metrics.open_issues_total > 300) fired.push({ tier: 'major', reason: 'open_issues_total > 300' });
if (metrics.open_issues_total > 400) fired.push({ tier: 'operator_escalation', reason: 'open_issues_total > 400' });
if (negStreak >= 2) fired.push({ tier: 'moderate', reason: 'net_velocity_7d < 0 for ' + negStreak + ' consecutive runs' });
if (negStreak >= 4) fired.push({ tier: 'major', reason: 'net_velocity_7d < 0 for ' + negStreak + ' consecutive runs' });
if (negStreak >= 7) fired.push({ tier: 'operator_escalation', reason: 'net_velocity_7d < 0 for ' + negStreak + ' consecutive runs' });
if (metrics.assigned_analyst_count > 50) fired.push({ tier: 'moderate', reason: 'assigned-analyst > 50' });
if (metrics.assigned_analyst_count > 100) fired.push({ tier: 'major', reason: 'assigned-analyst > 100' });
if (metrics.assigned_analyst_count > 150) fired.push({ tier: 'operator_escalation', reason: 'assigned-analyst > 150' });
if (metrics.age_ge_30d_count > 50) fired.push({ tier: 'major', reason: 'age_ge_30d_count > 50' });
// PROP-043 commission-HNOTE tiers (info>=3, moderate>=5, major>=10)
if (commissionCount >= 3) fired.push({ tier: 'info', reason: 'pending commission HNOTEs >= 3 (' + commissionCount + ')' });
if (commissionCount >= 5) fired.push({ tier: 'moderate', reason: 'pending commission HNOTEs >= 5 (' + commissionCount + ')' });
if (commissionCount >= 10) fired.push({ tier: 'major', reason: 'pending commission HNOTEs >= 10 (' + commissionCount + ')' });

// PROP-117 Detector B: fires only if >=2 unreviewed AND poller's HNOTE absent (24h)
const detectorB = { fired: false, reason: 'inbound_burst_winnew_unreviewed=' + burstUnreviewed + ' (<2)' };
if (burstUnreviewed >= 2) {
  let pollerAlreadyFiled = false;
  try {
    const h = JSON.parse(fs.readFileSync('monitor/decisions/human-notes.json', 'utf8'));
    const notes = h.notes || [];
    const hcut = now - 24 * 3600 * 1000;
    pollerAlreadyFiled = notes.some(n => (n.action || '') === 'recommend_cadence_revert' && n.created_at && Date.parse(n.created_at) > hcut);
  } catch (_) {}
  if (pollerAlreadyFiled) {
    detectorB.reason = burstUnreviewed + ' unreviewed win-new, but poller filed recommend_cadence_revert HNOTE within 24h — no fallback finding';
  } else {
    detectorB.fired = true;
    detectorB.reason = burstUnreviewed + ' unreviewed win-new in priority-queue AND no recommend_cadence_revert HNOTE in 24h — emit category=inbound-burst severity=major finding + summary line (cron reverts per PROP-117)';
  }
}

let rowAppended = false;
if (!DRY) {
  try {
    fs.appendFileSync(HISTORY, JSON.stringify(metrics) + '\n');
    rowAppended = true;
  } catch (e) {
    console.error('ERROR: failed to append queue-history row: ' + e.message);
    process.exit(2);
  }
}

console.log(JSON.stringify({
  metrics,
  wow: wowRow ? { compared_to_ts: wowRow.ts, prev_total: wowRow.open_issues_total, pct: wowPct === null ? null : +wowPct.toFixed(1) } : null,
  neg_velocity_streak: negStreak,
  thresholds_fired: fired,
  suppressed_percent_trips: suppressed,
  detector_b: detectorB,
  row_appended: rowAppended,
  dry_run: DRY
}, null, 1));
