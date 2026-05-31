#!/usr/bin/env node
// monitor/scripts/sync-workspace-step4c.js
//
// PROP-066 Phase 1 (2026-05-31): extraction of workspace-sync.md's Step 4c
// (git→FUSE divergence detect + auto-sync) into a Node helper. Replaces a
// ~140-line bash block buried in a 1370-line prompt that the Haiku
// workspace-sync agent was observably skipping on most cycles.
//
// Failure modes this closes (vs PROP-064):
//   1. Cross-bash-session variable loss — PROP-064's PULL_MOVED was set in
//      Step 1's bash tool call and read in Step 4c's separate bash tool
//      call; the bash environment does NOT survive across MCP tool calls,
//      so PULL_MOVED was effectively always 0. This script derives the
//      "upstream-moved" signal from durable on-disk state: the timestamp
//      of the most recent monitor/integrity/sync-workspace-runs-*.json
//      sentinel vs. the timestamp of the latest origin/main commit.
//   2. LLM skip-by-omission — a 140-line bash block reads as a wall of
//      logic, easily skipped. A 3-line `node monitor/scripts/...js`
//      invocation reads as one more numbered action and is structurally
//      hard to skip. Mirrors push-via-api.js, audit-rewrite.js,
//      prune-integrity.js extractions.
//   3. Silent early-return — PROP-064's Step 4c wrote no sentinel when
//      classification=equal AND NEED_SYNC=0, making "ran-and-decided-no-op"
//      indistinguishable from "didn't run" in the audit log. This script
//      ALWAYS writes a sentinel — success, divergence-audit, abort, OR
//      no-op-with-reason — so tinker audits can tell them apart.
//
// Invariants:
//   - Always writes EXACTLY ONE final sentinel to monitor/integrity/.
//   - Crash → write monitor/integrity/sync-workspace-step4c-crash-<ts>.json
//     with stack trace + input state (HEAD, REMOTE, last-sentinel-ts) per
//     DIRECTIVE-20260531-004 Q2 answer. Exit 2.
//   - Non-FF origin → write sync-workspace-non-ff-abort-<ts>.json. Exit 1.
//   - All other paths exit 0.
//
// No npm deps. Pure node stdlib + git CLI.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const INTEGRITY_DIR = path.join(ROOT, 'monitor/integrity');
const CONFIG_PATH = path.join(ROOT, 'monitor/scripts/sync-workspace-step4c.config.json');
const HARDCODED_FALLBACK = '2026-05-30T00:00:00Z';
const TS_FILE = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z'); // 2026-05-31T12-34-56Z
const TS_ISO = new Date().toISOString();

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}
function shSilent(cmd) {
  try { return sh(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}
function shExitCode(cmd) {
  try { execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] }); return 0; }
  catch (e) { return e.status || 1; }
}
function writeSentinel(name, body) {
  fs.mkdirSync(INTEGRITY_DIR, { recursive: true });
  const p = path.join(INTEGRITY_DIR, name);
  fs.writeFileSync(p, JSON.stringify(body, null, 2));
  // PROP-073 sub-fix #3 (2026-05-31): log ABSOLUTE write path. The previous
  // `console.log('[PROP-066]', name)` printed only the basename, which made it
  // impossible to distinguish "script ran in correct cwd" from "script ran in
  // unexpected cwd" or "script never invoked". path.resolve(p) gives an
  // unambiguous absolute path. Tinker audits grep run-report bash output for
  // '[PROP-066] wrote sentinel: /tmp/<clone>/monitor/integrity/...' and treat
  // its absence as primary skip evidence.
  console.log('[PROP-066] wrote sentinel:', path.resolve(p));
  return p;
}

// State holders (visible to crash handler).
let state = { local_sha: null, remote_sha: null, last_sentinel_at: null, classification: null, need_sync: null };
let finalSentinelWritten = false;

process.on('uncaughtException', (err) => {
  if (finalSentinelWritten) { process.exit(2); return; }
  try {
    writeSentinel(`sync-workspace-step4c-crash-${TS_FILE}.json`, {
      event: 'sync-workspace-step4c-crash',
      timestamp: TS_ISO,
      prop_id: 'PROP-066',
      error_message: String(err && err.message || err),
      stack: err && err.stack ? err.stack : null,
      input_state: state,
      cwd: ROOT
    });
  } catch (e) { /* swallow — script is exiting anyway */ }
  process.exit(2);
});

// ---- Step 1: load config, determine fallback baseline ----
let fallbackBaseline = HARDCODED_FALLBACK;
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (cfg && typeof cfg.fallback_baseline_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(cfg.fallback_baseline_at)) {
      fallbackBaseline = cfg.fallback_baseline_at;
    } else {
      console.error('[PROP-066] WARN: config malformed; using hardcoded baseline', HARDCODED_FALLBACK);
    }
  } else {
    console.error('[PROP-066] WARN: config missing at', CONFIG_PATH, '— using hardcoded baseline', HARDCODED_FALLBACK);
  }
} catch (e) {
  console.error('[PROP-066] WARN: config read error', e.message, '— using hardcoded baseline');
}

// ---- Step 2: find most-recent sync-workspace-runs-*.json sentinel ----
function isoFromFilename(fn) {
  // sync-workspace-runs-2026-05-31T01-16-37Z.json → 2026-05-31T01:16:37Z
  const m = fn.match(/sync-workspace-runs-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.json$/);
  if (!m) return null;
  return m[1].replace(/-(\d{2})-(\d{2})Z$/, ':$1:$2Z').replace(/T(\d{2})-/, 'T$1:');
}
let lastSentinelAt = fallbackBaseline;
try {
  if (fs.existsSync(INTEGRITY_DIR)) {
    const files = fs.readdirSync(INTEGRITY_DIR).filter(f => f.startsWith('sync-workspace-runs-') && f.endsWith('.json'));
    let best = null;
    for (const f of files) {
      const iso = isoFromFilename(f);
      if (iso && (best === null || iso > best)) best = iso;
    }
    if (best) lastSentinelAt = best;
  }
} catch (e) { /* fall through to fallback */ }
state.last_sentinel_at = lastSentinelAt;

// ---- Step 3: git fetch, gather SHAs and remote HEAD timestamp ----
sh('git fetch origin main 2>&1 | tail -3');
const LOCAL_SHA = sh('git rev-parse HEAD');
const REMOTE_SHA = sh('git rev-parse origin/main');
const REMOTE_HEAD_TS = sh('git log -1 --format=%cI origin/main'); // ISO 8601 strict
state.local_sha = LOCAL_SHA;
state.remote_sha = REMOTE_SHA;

// ---- Step 4: four-way classification (preserved verbatim from PROP-064) ----
let classification;
if (LOCAL_SHA === REMOTE_SHA) {
  classification = 'equal';
} else if (shExitCode(`git merge-base --is-ancestor ${LOCAL_SHA} ${REMOTE_SHA}`) === 0) {
  classification = 'local-ancestor-of-remote';
} else if (shExitCode(`git merge-base --is-ancestor ${REMOTE_SHA} ${LOCAL_SHA}`) === 0) {
  classification = 'remote-ancestor-of-local';
} else {
  classification = 'true-non-ff';
}
state.classification = classification;

// ---- Step 5: PULL_MOVED equivalent — derived from durable state ----
// NEED_SYNC=1 if upstream HEAD timestamp is newer than last sentinel
// (i.e. upstream moved at some point since our last successful sync),
// OR if classification = local-ancestor-of-remote (origin moved during cycle).
const lastSentinelMs = Date.parse(lastSentinelAt);
const remoteHeadMs = Date.parse(REMOTE_HEAD_TS);
const upstreamNewerThanLastSync = (isFinite(remoteHeadMs) && isFinite(lastSentinelMs) && remoteHeadMs > lastSentinelMs);
let needSync = false;
if (classification === 'local-ancestor-of-remote') needSync = true;
if (classification === 'equal' && upstreamNewerThanLastSync) needSync = true;
state.need_sync = needSync;

console.log(`[PROP-066] classification=${classification} upstream_newer_than_last_sync=${upstreamNewerThanLastSync} need_sync=${needSync} local=${LOCAL_SHA.slice(0,10)} remote=${REMOTE_SHA.slice(0,10)} last_sentinel=${lastSentinelAt}`);

// ---- Step 6: branch on (classification, need_sync) ----
// Sentinel base payload — every code path writes this with action/extras.
function basePayload(action) {
  return {
    event: 'sync-workspace-step4c-run',
    timestamp: TS_ISO,
    prop_id: 'PROP-066',
    action,
    classification,
    local_sha: LOCAL_SHA,
    remote_sha: REMOTE_SHA,
    remote_head_ts: REMOTE_HEAD_TS,
    last_sentinel_at: lastSentinelAt,
    upstream_newer_than_last_sync: upstreamNewerThanLastSync,
    need_sync: needSync
  };
}

if (classification === 'true-non-ff') {
  // Refuse to sync. Operator recovery required.
  writeSentinel(`sync-workspace-non-ff-abort-${TS_FILE}.json`, {
    ...basePayload('abort-non-ff'),
    reason: 'origin/main is not a fast-forward of HEAD AND HEAD is not an ancestor of origin/main; refusing to sync until operator inspects',
    action_recommended: 'investigate force-push / rebase / race; operator may run node build.js sync-workspace manually after verifying canonical state'
  });
  finalSentinelWritten = true;
  process.exit(1);
}

if (!needSync) {
  // Either classification=equal+no-upstream-movement, or remote-ancestor-of-local (benign).
  const action = (classification === 'remote-ancestor-of-local') ? 'benign-local-ahead' : 'no-op-no-upstream-movement';
  // For benign-local-ahead, list the files where LOCAL is ahead of REMOTE for audit
  let divergentFiles = [];
  if (classification === 'remote-ancestor-of-local') {
    try { divergentFiles = sh('git diff --name-only origin/main HEAD').split('\n').filter(Boolean); } catch (e) {}
  }
  writeSentinel(`sync-workspace-runs-${TS_FILE}.json`, {
    ...basePayload(action),
    files_copied: 0,
    new_files: 0,
    sync_exit_code: 0,
    divergent_files: divergentFiles,
    divergent_count: divergentFiles.length,
    note: action === 'no-op-no-upstream-movement'
      ? 'classification=equal AND last-sentinel >= remote HEAD ts; nothing to propagate this cycle'
      : 'LOCAL ahead of REMOTE — push not yet visible to fetch ref / eventual-consistency lag; audit only'
  });
  finalSentinelWritten = true;
  process.exit(0);
}

// needSync === true and classification is one of {equal, local-ancestor-of-remote}
// For local-ancestor-of-remote, FF-merge first.
if (classification === 'local-ancestor-of-remote') {
  try { sh('git merge --ff-only origin/main 2>&1 | tail -3'); }
  catch (e) {
    console.error('[PROP-066] ff-merge failed unexpectedly:', e.message);
    writeSentinel(`sync-workspace-runs-${TS_FILE}.json`, {
      ...basePayload('ff-merge-failed'),
      files_copied: 0,
      new_files: 0,
      sync_exit_code: -1,
      output_tail: String(e.stderr || e.message || '').split('\n').slice(-20).join('\n')
    });
    finalSentinelWritten = true;
    process.exit(0); // soft fail — caller continues
  }
}

// Invoke build.js sync-workspace (idempotent OWNERSHIP-whitelist copy).
let syncOut = '';
let syncExit = 0;
try {
  syncOut = execSync('node build.js sync-workspace', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  syncOut = String((e.stdout || '') + (e.stderr || ''));
  syncExit = e.status || 1;
}
const copiedMatch = syncOut.match(/(\d+)\s+git-owned files copied/);
const newMatch = syncOut.match(/(\d+)\s+new append-only files/);
const filesCopied = copiedMatch ? parseInt(copiedMatch[1], 10) : 0;
const newFiles = newMatch ? parseInt(newMatch[1], 10) : 0;
const action = (classification === 'local-ancestor-of-remote') ? 'auto-sync' : 'pull-moved-auto-sync';

writeSentinel(`sync-workspace-runs-${TS_FILE}.json`, {
  ...basePayload(action),
  files_copied: filesCopied,
  new_files: newFiles,
  sync_exit_code: syncExit,
  output_tail: syncOut.split('\n').slice(-20).join('\n')
});
finalSentinelWritten = true;
process.exit(0);
