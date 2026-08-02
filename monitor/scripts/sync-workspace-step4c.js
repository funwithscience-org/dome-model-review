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

// ---- PROP-091 (2026-06-11) delete-propagation pass ----------------------
//
// FUSE-side reconciliation: prune-integrity deletes per-run artifacts from
// origin/main, but sync-workspace-step4c only PROPAGATES copies git→FUSE
// (build.js syncToWorkspace is create-only). So FUSE accumulates whatever
// prune deletes. This pass identifies orphans by three guards and (when
// enabled) unlinks them.
//
// Three-guard candidate rule:
//   (1) Path matches an allow-listed prune-managed pattern.
//   (2) Path is ABSENT from git ls-files HEAD (authoritative "belongs in
//       git" test).
//   (3) Path is past per-pattern retention window per the date embedded in
//       the filename. (1)+(2) alone would delete fresh unpushed FUSE-born
//       sentinels; the age guard is what protects the audit trail.
//
// Config gate: monitor/scripts/sync-workspace-step4c.config.json
//   "delete_propagation": { "enabled": false, "per_cycle_cap": 200,
//     "abort_abs": 500, "abort_pct_of_category": 50 }
//
// Phase 0 ships with enabled=false (manifest-only): every cycle writes
// delete_propagation.candidates + sample into the run sentinel; no
// unlinks. Operator reviews ≥3 days of manifests, then flips enabled to
// true via clone-and-push.
//
// EPERM fallback: if FUSE refuses unlink (cross-session permission, no
// allow_cowork_file_delete grant), the pass records
// 'unlink-unsupported-on-fuse' in the sentinel and stops. Manifest-only
// mode is still net positive — converts invisible accumulation into a
// visible deletion queue.
//
// PATTERN TABLE — mirrored in workspace-sync.md is_prune_expired() and
// prune-integrity.js POLICIES. Edit one → edit all three. FOURTH surface
// (PROP-145): build.js FUSE_EXCLUDE_TRANSIENT — a new per-run integrity
// pattern must also be added there so it is never mirrored to FUSE.
const DELETE_PATTERNS = [
  { re: /^monitor\/integrity\/workspace-sync-runs\/run-.*\.json$/, days: 7 },
  { re: /^monitor\/integrity\/verify-pending-run-.*\.json$/, days: 14 },
  { re: /^monitor\/integrity\/narrative-cite-audit-.*\.json$/, days: 14 },
  { re: /^monitor\/integrity\/push-failure-.*\.json$/, days: 14 },
  { re: /^monitor\/integrity\/git-to-fuse-divergence-.*\.json$/, days: 14 },
  { re: /^monitor\/integrity\/sync-workspace-runs-.*\.json$/, days: 14 }
  // Deliberately EXCLUDED: report-*.json (90d), workspace-sync-abort-*.json
  // (30d), sync-workspace-non-ff-abort-*.json (90d) — low volume, high
  // forensic value; operator deletes manually if ever needed.
];

function dateFromFilename(rel) {
  const b = path.basename(rel);
  let m = b.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = b.match(/(\d{4})(\d{2})(\d{2})T/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}

function deletePropagationPass(fuseRoot) {
  const out = {
    ran: false, mode: null, candidates: 0, deleted: 0, errors: 0,
    truncated: false, aborted: null, sample: [], category_total: 0
  };
  let cfg = { enabled: false, per_cycle_cap: 200, abort_abs: 500, abort_pct_of_category: 50 };
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (c && typeof c.delete_propagation === 'object') {
      cfg = { ...cfg, ...c.delete_propagation };
    }
  } catch (e) { /* fall back to defaults */ }
  out.mode = cfg.enabled ? 'delete' : 'manifest-only';

  // HEAD-membership set — authoritative "belongs in git" test.
  let tracked;
  try {
    tracked = new Set(sh('git ls-files monitor/integrity').split('\n').filter(Boolean));
  } catch (e) {
    out.aborted = 'git-ls-files-failed: ' + e.message;
    return out;
  }

  // Walk FUSE monitor/integrity/, collect allow-listed entries.
  const fuseDir = path.join(fuseRoot, 'monitor/integrity');
  const fuseFiles = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) fuseFiles.push(path.relative(fuseRoot, full));
    }
  }
  try { walk(fuseDir); }
  catch (e) {
    out.aborted = 'fuse-walk-failed: ' + e.message;
    return out;
  }

  const inCategory = fuseFiles.filter(r => DELETE_PATTERNS.some(p => p.re.test(r)));
  out.category_total = inCategory.length;
  const nowMs = Date.now();
  const candidates = inCategory.filter(rel => {
    if (tracked.has(rel)) return false;                            // still in git HEAD — keep
    const pat = DELETE_PATTERNS.find(p => p.re.test(rel));
    const d = dateFromFilename(rel);
    if (!d) return false;                                          // undated — never touch
    const ageMs = nowMs - Date.parse(d);
    return isFinite(ageMs) && ageMs > (pat.days + 1) * 86400000;   // past retention (+1d slack)
  });
  out.candidates = candidates.length;
  out.sample = candidates.slice(0, 20);

  // Safety gates (PROP-051 lineage, 2026-05-21 disaster sensitivity).
  const pctCap = Math.floor(inCategory.length * cfg.abort_pct_of_category / 100);
  if (candidates.length > cfg.abort_abs ||
      (inCategory.length > 0 && candidates.length > pctCap)) {
    out.aborted = 'delete-sanity gate: ' + candidates.length + ' candidates exceeds abort_abs=' +
      cfg.abort_abs + ' or ' + cfg.abort_pct_of_category + '% of category (' + pctCap +
      '); zero deletions this cycle';
    return out;
  }

  out.ran = true;
  if (!cfg.enabled) return out;                                    // manifest-only

  // Phase-2 path: actually delete (capped).
  for (const rel of candidates.slice(0, cfg.per_cycle_cap)) {
    try {
      fs.unlinkSync(path.join(fuseRoot, rel));
      out.deleted++;
    } catch (e) {
      out.errors++;
      if (/EPERM|EACCES|ENOTSUP|not permitted/i.test(String(e.message))) {
        out.aborted = 'unlink-unsupported-on-fuse: ' + e.message +
          ' — falling back to manifest-only';
        break;                                                     // FUSE refuses; stop trying
      }
    }
  }
  out.truncated = candidates.length > cfg.per_cycle_cap;
  return out;
}

// ---- PROP-092 (2026-06-13) overwrite-propagation pass --------------------
// Sibling to PROP-091's delete pass. PROP-091 handles "origin removed a file,
// FUSE kept it". This pass handles "origin REWROTE an existing file, FUSE
// kept its older copy". Scope: an explicit allow-list of overwrite-mode
// human-facing latest-*-summary.txt rescue surfaces. These are written
// per-run by global pipeline agents and rescued FUSE→git by workspace-sync,
// but NOTHING brings the most-recent version back DOWN into other sessions'
// FUSE mounts:
//   - 'workspace'-classified ones (latest-decider/baby/score/rewrite-summary)
//     are skipped wholesale by build.js syncToWorkspace.
//   - append_only / append_only_glob ones (.txt under monitor/changes,
//     monitor/integrity, monitor/tinker, etc.) are either filtered out
//     (.json-only walker) or copied ONCE then frozen (create-only "if exists
//     continue"). monitor/tinker/latest-tinker-summary.txt is the frozen case
//     the operator hit 2026-06-12 (FUSE stuck at the version the cowork
//     session last wrote; misread as "tinker hasn't run since June 10").
//
// Two-guard candidate rule (per directive Q1 = content-hash):
//   (1) Path is in the explicit OVERWRITE_ALLOWLIST (enumerated, reviewable,
//       no directory globs).
//   (2a) git HEAD content != FUSE content (content-hash diff → there IS work).
//   (2b) DIRECTION GUARD: the file's last git-commit time is NEWER than the
//        last successful sync sentinel (lastSentinelAt). This proves git is
//        the authoritative-newer side. A FUSE copy that differs only because
//        THIS session wrote a fresher-but-unpushed version has an OLDER
//        last-git-commit time → it is NOT overwritten; workspace-sync
//        rescues it up first, and a later cycle propagates it down. Uses
//        git commit time + the durable sentinel baseline, NEVER raw FUSE
//        mtime (PROP-082).
//
// Loop-safety: after this copies git→FUSE, FUSE byte-matches git HEAD, so
// workspace-sync's smart_copy "cmp -s" content-equality short-circuit returns
// without pushing. No git↔FUSE ping-pong.
//
// Config gate: monitor/scripts/sync-workspace-step4c.config.json
//   "overwrite_propagation": { "enabled": false, "per_cycle_cap": 20,
//     "abort_abs": 20 }
// enabled=false → manifest-only: list candidates + per-file hashes/decision
// in the sentinel, write nothing. Mandatory Phase-0 state.
//
// FUSE overwrite feasibility note: unlike PROP-091's delete pass (blocked by
// FUSE's missing unlink()), an in-place fs.copyFileSync truncate-write of an
// EXISTING FUSE file works — it is exactly what build.js copyIfExists already
// does every publish for git-owned files like CLAUDE.md. So Phase 2 is
// genuinely viable here, not just-a-manifest. EPERM-class errors still fall
// back to manifest-only defensively.
//
// ALLOW-LIST — enumerated, reviewable. Each entry is a per-run overwrite-mode
// summary of a GLOBAL pipeline agent (one logical decider/tinker/etc. across
// whichever session the scheduler picked), so cross-session canonical = latest
// in git. If you add an agent summary, add it here.
const OVERWRITE_ALLOWLIST = [
  'monitor/tinker/latest-tinker-summary.txt',          // directive's named case (frozen)
  'monitor/decisions/latest-decider-summary.txt',      // workspace-owned (skipped)
  'monitor/analyst/latest-analysis-summary.txt',       // unclassified dir (never copied)
  'monitor/analyst/analysis-records/latest-analysis-summary.txt',
  'monitor/analyst-baby/latest-baby-summary.txt',      // workspace-owned (skipped)
  'monitor/curmudgeon/latest-review-summary.txt',      // unclassified dir (never copied)
  'monitor/curmudgeon/latest-verify-summary.txt',      // unclassified dir (never copied)
  'monitor/integrity/latest-integrity-summary.txt',    // append_only .json-walker skips .txt
  'monitor/changes/latest-poll-summary.txt',           // append_only .json-walker skips .txt
  'monitor/social/latest-summary.txt',                 // unclassified dir (never copied)
  'monitor/sloppytoppy/latest-score-summary.txt',      // workspace-owned (agent DISABLED)
  'monitor/sloppytoppy/latest-rewrite-summary.txt'     // workspace-owned (agent DISABLED)
];
function hashFile(p) {
  try { return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch (e) { return null; }
}
function overwritePropagationPass(fuseRoot, lastSentinelIso) {
  const out = { ran: false, mode: null, candidates: 0, written: 0, errors: 0,
                truncated: false, aborted: null, items: [] };
  let cfg = { enabled: false, per_cycle_cap: 20, abort_abs: 20 };
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (c && typeof c.overwrite_propagation === 'object') cfg = { ...cfg, ...c.overwrite_propagation };
  } catch (e) { /* defaults */ }
  out.mode = cfg.enabled ? 'overwrite' : 'manifest-only';
  const lastMs = Date.parse(lastSentinelIso);
  const candidates = [];
  for (const rel of OVERWRITE_ALLOWLIST) {
    const gitPath = path.join(ROOT, rel);     // clone is at HEAD post-ff-merge
    const fusePath = path.join(fuseRoot, rel);
    if (!fs.existsSync(gitPath)) continue;     // not in git HEAD → nothing to push down
    const gitHash = hashFile(gitPath);
    const fuseHash = fs.existsSync(fusePath) ? hashFile(fusePath) : null;
    if (gitHash && fuseHash && gitHash === fuseHash) continue;  // already in sync
    let gitCommitIso = null;
    try { gitCommitIso = sh('git log -1 --format=%cI -- ' + JSON.stringify(rel)); } catch (e) {}
    const gitCommitMs = Date.parse(gitCommitIso);
    const gitIsNewer = isFinite(gitCommitMs) && isFinite(lastMs) && gitCommitMs > lastMs;
    const decision = (fuseHash === null) ? 'fuse-absent-create'
                   : gitIsNewer ? 'git-newer-overwrite'
                   : 'fuse-ahead-skip';   // local unpushed write — leave for workspace-sync
    candidates.push({ path: rel, git_hash: gitHash ? gitHash.slice(0,12) : null,
      fuse_hash: fuseHash ? fuseHash.slice(0,12) : null, git_commit: gitCommitIso,
      last_sentinel: lastSentinelIso, decision });
  }
  const toWrite = candidates.filter(c => c.decision === 'git-newer-overwrite' || c.decision === 'fuse-absent-create');
  out.candidates = toWrite.length;
  out.items = candidates;   // includes fuse-ahead-skip rows for audit visibility
  if (toWrite.length > cfg.abort_abs) {
    out.aborted = 'overwrite-sanity gate: ' + toWrite.length + ' would-write exceeds abort_abs=' + cfg.abort_abs + '; zero writes';
    return out;
  }
  out.ran = true;
  if (!cfg.enabled) return out;   // manifest-only
  for (const c of toWrite.slice(0, cfg.per_cycle_cap)) {
    try {
      const dst = path.join(fuseRoot, c.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(ROOT, c.path), dst);   // truncate-write; no unlink needed
      out.written++;
    } catch (e) {
      out.errors++;
      if (/EPERM|EACCES|ENOTSUP|not permitted/i.test(String(e.message))) {
        out.aborted = 'copy-unsupported-on-fuse: ' + e.message + ' — falling back to manifest-only';
        break;
      }
    }
  }
  out.truncated = toWrite.length > cfg.per_cycle_cap;
  return out;
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

// PROP-091 (2026-06-11): delete-propagation pass — only after a successful sync.
// PROP-092 (2026-06-13): overwrite-propagation pass — sibling, same conditions.
// fuseRoot is parsed from build.js's own output line ("Sync to workspace (<path>)..."),
// so the helper agrees with build.js on which workspace was targeted.
let delResult = { ran: false, mode: null, aborted: 'sync-failed' };
let ovwResult = { ran: false, mode: null, aborted: 'sync-failed' };
if (syncExit === 0) {
  const fuseRootMatch = syncOut.match(/Sync to workspace \(([^)]+)\)/);
  const fuseRoot = fuseRootMatch ? fuseRootMatch[1] : null;
  delResult = fuseRoot
    ? deletePropagationPass(fuseRoot)
    : { ran: false, mode: null, aborted: 'no-fuse-workspace-resolved-from-build-output' };
  ovwResult = fuseRoot
    ? overwritePropagationPass(fuseRoot, lastSentinelAt)
    : { ran: false, mode: null, aborted: 'no-fuse-workspace-resolved-from-build-output' };
}

writeSentinel(`sync-workspace-runs-${TS_FILE}.json`, {
  ...basePayload(action),
  files_copied: filesCopied,
  new_files: newFiles,
  sync_exit_code: syncExit,
  delete_propagation: delResult,
  overwrite_propagation: ovwResult,
  output_tail: syncOut.split('\n').slice(-20).join('\n')
});
finalSentinelWritten = true;
process.exit(0);
