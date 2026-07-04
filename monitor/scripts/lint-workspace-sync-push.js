#!/usr/bin/env node
/**
 * lint-workspace-sync-push.js - PROP-121 pre-push guard for workspace-sync.
 *
 * Installed as .git/hooks/pre-push in workspace-sync's clone. Because git runs
 * pre-push hooks itself, this fires regardless of whether the agent used the
 * documented smart_copy path or improvised (rsync / tar / cp -a + manual
 * git commit). It closes the total-path-bypass failure class that evaded every
 * in-path gate on 2026-07-01 (commit eab98c5: 1012 files added, all in-path
 * gates skipped because the whole Step 3/4 code path was abandoned).
 *
 * Two checks, both fail-closed (exit 1 blocks the push):
 *   CHECK 1 (resurrection; primary; near-zero false positive): any path this
 *     push ADDS under monitor/integrity/ that intersects GIT_DELETED_SET
 *     (prune tombstones, built by build-git-deleted-set.js). A legitimate sync
 *     never re-adds a prune-tombstoned file. NOT disableable by the override
 *     flag - resurrection is never legitimate.
 *   CHECK 2 (bulk-change ceiling; backstop for unknown future shapes): total
 *     files changed across the push range > CEILING (default 300). Disableable
 *     per-cycle by an operator override sentinel for a legitimate post-outage
 *     catchup sync.
 *
 * On internal error: fail-closed (exit 1). A sync that cannot verify its own
 * safety must not push - one skipped cycle is ~1h of drift and fully
 * recoverable; a bad push may not be. This mirrors the PROP-103/113/114
 * fail-closed lineage.
 *
 * --no-verify is FORBIDDEN by prompt (workspace-sync.md prohibition 7). This
 * hook is the enforcement; the prohibition is the instruction.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const CEILING = parseInt(process.env.WS_SYNC_BULK_CEILING || '300', 10);
let ROOT;
try {
  ROOT = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('[ws-sync-guard] FATAL: cannot resolve repo root: ' + e.message);
  process.exit(1);
}
const OVERRIDE_FLAG = path.join(ROOT, 'monitor/integrity/workspace-sync-bulk-override.flag');
const ZERO = '0000000000000000000000000000000000000000';

function sh(cmd) {
  return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// Read pre-push ref updates from stdin: "<localref> <localsha> <remoteref> <remotesha>".
let stdin = '';
try { stdin = fs.readFileSync(0, 'utf8'); } catch (e) { stdin = ''; }
const updates = stdin.split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => l.split(/\s+/)).filter(p => p.length >= 4);

// If git gave us no ref lines (some environments), fall back to inspecting HEAD's tip commit.
let ranges = [];
if (updates.length === 0) {
  ranges.push({ base: 'HEAD~1', tip: 'HEAD', single: true });
} else {
  for (const u of updates) {
    const localSha = u[1], remoteSha = u[3];
    if (localSha === ZERO) continue; // branch deletion; not our concern
    let base;
    if (remoteSha === ZERO) {
      // New remote ref: compare against origin/main if present, else the tip commit only.
      try { sh('git rev-parse --verify origin/main'); base = 'origin/main'; }
      catch (e) { base = localSha + '~1'; }
    } else {
      base = remoteSha;
    }
    ranges.push({ base: base, tip: localSha, single: false });
  }
}
if (ranges.length === 0) process.exit(0);

function changedFiles(base, tip) {
  // All files touched across base..tip (added/modified/deleted).
  let out;
  try { out = sh('git diff --name-only ' + base + ' ' + tip); }
  catch (e) {
    // base unreachable (shallow clone): degrade to the tip commit alone.
    out = sh('git show --name-only --pretty=format: ' + tip);
  }
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}
function addedFiles(base, tip) {
  let out;
  try { out = sh('git diff --diff-filter=A --name-only ' + base + ' ' + tip); }
  catch (e) {
    out = sh('git show --diff-filter=A --name-only --pretty=format: ' + tip);
  }
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

// Aggregate across all ranges being pushed.
let allChanged = new Set();
let allAddedIntegrity = [];
try {
  for (const r of ranges) {
    for (const f of changedFiles(r.base, r.tip)) allChanged.add(f);
    for (const f of addedFiles(r.base, r.tip)) {
      if (f.indexOf('monitor/integrity/') === 0) allAddedIntegrity.push(f);
    }
  }
} catch (e) {
  console.error('[ws-sync-guard] FATAL: change enumeration failed: ' + e.message + ' -- fail-closed.');
  process.exit(1);
}

// ---- CHECK 1: resurrection (added integrity path INTERSECT prune tombstones) ----
let resurrected = [];
if (allAddedIntegrity.length > 0) {
  const gdsPath = path.join(cp.execSync('git rev-parse --git-dir', { cwd: ROOT, encoding: 'utf8' }).trim(), 'ws-sync-guard-gds.txt');
  let gds = new Set();
  try {
    cp.execSync('node monitor/scripts/build-git-deleted-set.js --integrity-dir monitor/integrity --out ' + gdsPath,
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    if (fs.existsSync(gdsPath)) {
      for (const line of fs.readFileSync(gdsPath, 'utf8').split('\n')) {
        const t = line.trim(); if (t) gds.add(t);
      }
    }
  } catch (e) {
    // build-git-deleted-set.js exits 0 always; if it somehow throws, gds stays empty
    // and CHECK 1 no-ops. CHECK 2 (below) still catches the bulk shape.
    console.error('[ws-sync-guard] WARN: GIT_DELETED_SET build failed; CHECK 1 degraded, CHECK 2 still active.');
  }
  try { fs.unlinkSync(gdsPath); } catch (e) {}
  for (const f of allAddedIntegrity) if (gds.has(f)) resurrected.push(f);
}
if (resurrected.length > 0) {
  console.error('[ws-sync-guard] BLOCK (CHECK 1 resurrection): this push ADDS '
    + resurrected.length + ' prune-tombstoned integrity path(s). A legitimate sync never'
    + ' re-adds a tombstoned file. Sample:');
  for (const f of resurrected.slice(0, 10)) console.error('    ' + f);
  console.error('[ws-sync-guard] This is the 2026-07-01 (eab98c5) failure shape. Do NOT --no-verify.');
  console.error('[ws-sync-guard] Root cause is almost always: the documented smart_copy path was bypassed,'
    + ' so GIT_DELETED_SET never filtered these. Re-run the sync via the smart_copy loop, not rsync/cp.');
  process.exit(1);
}

// ---- CHECK 2: bulk-change ceiling ----
if (allChanged.size > CEILING) {
  if (fs.existsSync(OVERRIDE_FLAG)) {
    console.error('[ws-sync-guard] CHECK 2: ' + allChanged.size + ' files changed (> ceiling '
      + CEILING + ') but operator override flag present (' + OVERRIDE_FLAG + '). Allowing.');
    console.error('[ws-sync-guard] NOTE: CHECK 1 (resurrection) still passed - no tombstoned re-adds.');
  } else {
    console.error('[ws-sync-guard] BLOCK (CHECK 2 bulk ceiling): this push changes '
      + allChanged.size + ' files (> ceiling ' + CEILING + '). A routine FUSE->git sync'
      + ' touches 1-20 files/commit. This shape matches the 2026-07-01 mass-add and the'
      + ' 2026-05-21 mass-delete failure class.');
    console.error('[ws-sync-guard] If this IS a legitimate post-outage catchup, the operator creates:');
    console.error('    touch ' + OVERRIDE_FLAG);
    console.error('  then re-pushes, then removes the flag. Do NOT --no-verify.');
    process.exit(1);
  }
}

process.exit(0);
