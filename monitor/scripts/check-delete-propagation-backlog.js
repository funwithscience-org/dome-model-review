#!/usr/bin/env node
/**
 * check-delete-propagation-backlog.js — DIRECTIVE-20260708-001 / PROP-125 canary
 *
 * Read-only. Finds the newest monitor/integrity/sync-workspace-runs-*.json
 * sentinel (dome-mirror writes one per cycle) and inspects
 * delete_propagation.candidates.
 *
 * Why: scheduled sessions cannot unlink() FUSE files (deny-by-default policy,
 * lifted only by the interactive allow_cowork_file_delete grant — see
 * monitor/tinker/reports/fuse-unlink-eperm-investigation-2026-07-08.md).
 * Deletion candidates therefore accumulate until the operator runs a manual
 * drain from a granted cowork session. This canary tells the operator WHEN:
 * it fires well before the abort_abs=500 delete-sanity gate would start
 * aborting the pass.
 *
 * Exit codes:
 *   0 — clean (candidates below threshold)
 *   2 — no usable sentinel within --hours window (dome-mirror liveness signal;
 *       report as its own finding, do not treat as backlog)
 *   3 — canary FIRED: candidates >= threshold → operator drain recommended
 *
 * Usage:
 *   node monitor/scripts/check-delete-propagation-backlog.js \
 *     [--root <repo-root>] [--threshold 200] [--hours 48]
 *
 * Intended consumer: structure-integrity.md daily run (PROP-125). Also safe
 * to run ad-hoc from any clone or the FUSE workspace.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const ROOT = path.resolve(arg('root', '.'));
const THRESHOLD = parseInt(arg('threshold', '200'), 10);
const HOURS = parseInt(arg('hours', '48'), 10);
const DIR = path.join(ROOT, 'monitor', 'integrity');

let files;
try {
  files = fs.readdirSync(DIR)
    .filter(f => /^sync-workspace-runs-.*\.json$/.test(f))
    .sort(); // ISO timestamps in filenames sort lexicographically
} catch (e) {
  console.log(JSON.stringify({ canary: 'delete-propagation-backlog', rc: 2, reason: 'integrity-dir-unreadable: ' + e.message }));
  process.exit(2);
}

if (!files.length) {
  console.log(JSON.stringify({ canary: 'delete-propagation-backlog', rc: 2, reason: 'no sync-workspace-runs-*.json sentinels found' }));
  process.exit(2);
}

// Walk newest-first until we find a parseable sentinel with a delete_propagation block.
let picked = null, body = null;
for (let i = files.length - 1; i >= 0; i--) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    if (b && typeof b.delete_propagation === 'object') { picked = files[i]; body = b; break; }
  } catch (_) { /* skip corrupt */ }
}

if (!picked) {
  console.log(JSON.stringify({ canary: 'delete-propagation-backlog', rc: 2, reason: 'no sentinel carries a delete_propagation block' }));
  process.exit(2);
}

const ts = Date.parse(body.timestamp || 0);
const ageH = isFinite(ts) ? (Date.now() - ts) / 3600000 : Infinity;
if (ageH > HOURS) {
  console.log(JSON.stringify({
    canary: 'delete-propagation-backlog', rc: 2,
    reason: 'newest sentinel is stale (' + ageH.toFixed(1) + 'h > ' + HOURS + 'h) — check dome-mirror liveness first',
    sentinel: picked
  }));
  process.exit(2);
}

const dp = body.delete_propagation;
const out = {
  canary: 'delete-propagation-backlog',
  sentinel: picked,
  sentinel_age_hours: +ageH.toFixed(1),
  candidates: dp.candidates,
  category_total: dp.category_total,
  mode: dp.mode,
  aborted: dp.aborted || null,
  threshold: THRESHOLD
};

if (typeof dp.candidates === 'number' && dp.candidates >= THRESHOLD) {
  out.rc = 3;
  out.action = 'OPERATOR DRAIN RECOMMENDED: from an interactive cowork session, grant allow_cowork_file_delete, ' +
    'replicate the three-guard rule (allow-listed pattern + absent from git ls-files HEAD + past retention window ' +
    'per filename date), rm the candidates, verify next dome-mirror sentinel shows candidates near zero. ' +
    'Proven procedure: 2026-06-13 (462 files) and 2026-07-08 (1,137 files). ' +
    'Headroom before the abort_abs=500 delete-sanity gate: ' + Math.max(0, 500 - dp.candidates) + ' candidates.';
  console.log(JSON.stringify(out, null, 2));
  process.exit(3);
}

out.rc = 0;
console.log(JSON.stringify(out, null, 2));
process.exit(0);
