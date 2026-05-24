#!/usr/bin/env node
/**
 * prune-integrity.js — PROP-051 Workstream C.
 *
 * Caps monitor/integrity/ disk usage by archiving older per-run artifacts to
 * compact JSONL files, then deleting the originals. The 2026-05-21 disaster
 * was triggered partly by monitor/integrity/ reaching ~606MB on disk, which
 * pushed the FS over 95% and led the workspace-sync Haiku to improvise a
 * dangerous degraded-mode path. This script keeps the directory bounded.
 *
 * Per-category retention policy (from PROP-051 phase_3_design.pruning_policy):
 *
 *   workspace-sync-runs/        keep 30 days  → workspace-sync-runs-archive.jsonl
 *   verify-pending-run-*.json   keep 14 days  → verify-pending-runs-archive.jsonl
 *   narrative-cite-audit-*.json keep last 7   → narrative-cite-audit-archive.jsonl
 *   push-failure-*.json         keep 14 days  → push-failure-archive.jsonl
 *   report-*.json (daily)       keep 90 days  → report-archive.jsonl
 *
 * Archive format: one JSON record per line. Each record has:
 *   { file: <original filename>, mtime: <ISO>, body: <full JSON contents> }
 * Archives are append-only and tolerate duplicates (idempotency).
 *
 * Defaults to DRY-RUN. Pass --apply to actually archive + delete. Pass --root
 * to override the repo root (default: cwd's nearest ancestor containing
 * monitor/integrity/).
 *
 * Single-writer: this script. Invoked from a scheduled task (recommended) or
 * manually by the operator. Not called by workspace-sync's hot path.
 */

const fs = require('fs');
const path = require('path');

// --- CLI ----------------------------------------------------------------

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose') || args.includes('-v');
let rootArg = null;
const rootIdx = args.indexOf('--root');
if (rootIdx >= 0 && args[rootIdx + 1]) rootArg = args[rootIdx + 1];
// PROP-054: --max-archive-per-policy <N> caps the per-category blast radius on
// first apply. When unset, no cap. Eligibility filter runs first; cap takes
// the OLDEST N eligible per category so prune is incremental + verifiable.
let MAX_PER_POLICY = null;
const maxIdx = args.indexOf('--max-archive-per-policy');
if (maxIdx >= 0 && args[maxIdx + 1]) {
  const n = parseInt(args[maxIdx + 1], 10);
  if (Number.isFinite(n) && n >= 0) MAX_PER_POLICY = n;
}

// --- Locate repo root ----------------------------------------------------

function findRepoRoot(start) {
  let cur = path.resolve(start);
  while (cur !== path.dirname(cur)) {
    if (fs.existsSync(path.join(cur, 'monitor', 'integrity'))) return cur;
    cur = path.dirname(cur);
  }
  return null;
}
const REPO_ROOT = rootArg ? path.resolve(rootArg) : findRepoRoot(process.cwd());
if (!REPO_ROOT) {
  console.error('ERROR: could not find repo root (no ancestor contains monitor/integrity/). Pass --root <path>.');
  process.exit(2);
}
const INTEGRITY_DIR = path.join(REPO_ROOT, 'monitor', 'integrity');
const WS_SYNC_RUNS_DIR = path.join(INTEGRITY_DIR, 'workspace-sync-runs');

// --- Filename-embedded timestamp parser (PROP-054) -----------------------
//
// Fresh-clone execution sets every checked-out file's mtime to the clone time,
// so fs.statSync().mtimeMs is meaningless for age computation. All file
// categories embed an ISO timestamp in the filename; parse it instead.
//
// Patterns are anchored to a '-' boundary on the left (the agent-name prefix
// ends with '-'). Tried most-specific to most-general. Returns ms since epoch,
// or null if no pattern matches (eligibility falls back to mtime + verbose
// '[parse-fallback]' log).

function parseFilenameTimestamp(name) {
  const tryParse = (Y, M, D, h, m, s) => {
    const t = Date.parse(`${Y}-${M}-${D}T${h}:${m}:${s || '00'}Z`);
    return isNaN(t) ? null : t;
  };
  let m;
  // A: -YYYY-MM-DDTHH-MM-SSZ (workspace-sync-runs; dashed time + Z; tolerates -final/-abort suffix)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5],m[6]);
  // B: -YYYY-MM-DDTHH:MM:SSZ (push-failure colon variant)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5],m[6]);
  // C: -YYYY-MM-DDTHH--MM--SSZ (push-failure double-dash variant)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})--(\d{2})--(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5],m[6]);
  // D: -YYYY-MM-DDTHHMMSSZ (push-failure undashed-seconds + Z)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5],m[6]);
  // E: -YYYY-MM-DDTHHMMZ (verify-pending-run, narrative-cite-audit; HHmm + Z)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5]);
  // F: -YYYY-MM-DDTHH-MMZ (push-failure dashed HH-MM with Z, no seconds)
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})Z/))) return tryParse(m[1],m[2],m[3],m[4],m[5]);
  // G: -YYYY-MM-DDTHH-MM (push-failure dashed HH-MM no Z; report-daily 'T-HH-MM'). Negative lookahead
  //    prevents matching Pattern A's HH-MM-SS (handled above).
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})(?!\d)/))) return tryParse(m[1],m[2],m[3],m[4],m[5]);
  // H: -YYYYMMDDTHHMMSS (push-failure undashed legacy)
  if ((m = name.match(/-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/))) return tryParse(m[1],m[2],m[3],m[4],m[5],m[6]);
  // I: -YYYY-MM-DD.json (report-daily date-only). Anchored to .json EOF.
  if ((m = name.match(/-(\d{4})-(\d{2})-(\d{2})\.json$/))) return tryParse(m[1],m[2],m[3],'00','00','00');
  return null;
}

// --- Policies ------------------------------------------------------------

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const policies = [
  {
    name: 'workspace-sync-runs',
    dir: WS_SYNC_RUNS_DIR,
    pattern: /^run-.*\.json$/,
    retention_days: 30,
    keep_last_n: 50,                 // PROP-054: belt-and-suspenders floor (~2 days hourly)
    archive: path.join(INTEGRITY_DIR, 'workspace-sync-runs-archive.jsonl')
  },
  {
    name: 'verify-pending-run',
    dir: INTEGRITY_DIR,
    pattern: /^verify-pending-run-.*\.json$/,
    retention_days: 14,
    keep_last_n: 20,                 // PROP-054: ~2-3 days at 6-8 runs/day
    archive: path.join(INTEGRITY_DIR, 'verify-pending-runs-archive.jsonl')
  },
  {
    name: 'narrative-cite-audit',
    dir: INTEGRITY_DIR,
    pattern: /^narrative-cite-audit-.*\.json$/,
    retention_days: null,
    keep_last_n: 7,    // unchanged (already-working policy)
    archive: path.join(INTEGRITY_DIR, 'narrative-cite-audit-archive.jsonl')
  },
  {
    name: 'push-failure',
    dir: INTEGRITY_DIR,
    pattern: /^push-failure-.*\.json$/,
    retention_days: 14,
    keep_last_n: 20,                 // PROP-054: covers ~1 week worst case
    archive: path.join(INTEGRITY_DIR, 'push-failure-archive.jsonl')
  },
  {
    name: 'report-daily',
    dir: INTEGRITY_DIR,
    pattern: /^report-\d{4}-\d{2}-\d{2}.*\.json$/,
    retention_days: 90,
    keep_last_n: 20,                 // PROP-054: ~20 days post-mortem depth (operator-tweaked 2026-05-24 from initial 30)
    archive: path.join(INTEGRITY_DIR, 'report-archive.jsonl')
  }
];

// --- Per-policy execution ------------------------------------------------

function listMatches(policy) {
  if (!fs.existsSync(policy.dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(policy.dir)) {
    if (!policy.pattern.test(name)) continue;
    const full = path.join(policy.dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    const parsedTs = parseFilenameTimestamp(name);   // PROP-054: prefer filename
    if (VERBOSE && parsedTs == null) console.log(`  [parse-fallback] ${name} — using mtime`);
    out.push({ name, full, mtimeMs: st.mtimeMs, parsedTs, size: st.size });
  }
  // Newest first (by parsed timestamp; fall back to mtime). Stable for keep_last_n.
  out.sort((a, b) => (b.parsedTs || b.mtimeMs) - (a.parsedTs || a.mtimeMs));
  return out;
}

function eligibleForArchive(policy, matches) {
  // PROP-054: floor enforced FIRST. Even if every parsed_ts is null and every
  // effective_ts equals clone-time (defeating retention_days), the floor still
  // preserves the newest keep_last_n. Belt-and-suspenders against future
  // parse regressions.
  const floor = policy.keep_last_n != null
    ? new Set(matches.slice(0, policy.keep_last_n).map(m => m.name))
    : new Set();
  if (policy.retention_days != null) {
    const cutoff = NOW - policy.retention_days * DAY_MS;
    return matches.filter(m => {
      if (floor.has(m.name)) return false;
      const effTs = m.parsedTs || m.mtimeMs;
      return effTs < cutoff;
    });
  }
  // keep_last_n-only policy (no retention_days): everything outside the floor is eligible.
  if (policy.keep_last_n != null) return matches.filter(m => !floor.has(m.name));
  return [];
}

function runPolicy(policy) {
  const matches = listMatches(policy);
  let eligible = eligibleForArchive(policy, matches);
  if (matches.length === 0) {
    console.log(`[${policy.name}] no files matched (dir absent or empty).`);
    return { policy: policy.name, matched: 0, eligible: 0, archived: 0, deleted: 0, bytes_reclaimed: 0, capped: 0 };
  }
  // PROP-054 safety cap: if --max-archive-per-policy is set, take the OLDEST N
  // eligible (eligible is currently sorted newest-first by parsedTs/mtime, so
  // we slice from the tail). Keeps prune incremental and verifiable on first
  // apply.
  let capped = 0;
  if (MAX_PER_POLICY != null && eligible.length > MAX_PER_POLICY) {
    capped = eligible.length - MAX_PER_POLICY;
    eligible = eligible.slice(-MAX_PER_POLICY);
  }
  console.log(`[${policy.name}] matched=${matches.length} eligible=${eligible.length + capped}` +
              (capped > 0 ? ` (capped to ${eligible.length} via --max-archive-per-policy)` : '') +
              ` (policy: retention_days=${policy.retention_days} keep_last_n=${policy.keep_last_n})`);

  let archived = 0;
  let deleted = 0;
  let bytes_reclaimed = 0;

  for (const m of eligible) {
    let body;
    try {
      const raw = fs.readFileSync(m.full, 'utf8');
      try { body = JSON.parse(raw); } catch { body = { _raw_text: raw }; }
    } catch (e) {
      console.warn(`  [skip] could not read ${m.name}: ${e.message}`);
      continue;
    }
    const record = {
      file: m.name,
      mtime: new Date(m.mtimeMs).toISOString(),
      size: m.size,
      body
    };
    const line = JSON.stringify(record) + '\n';
    if (APPLY) {
      try {
        fs.appendFileSync(policy.archive, line);
        archived += 1;
      } catch (e) {
        console.warn(`  [skip-archive] ${m.name}: ${e.message}`);
        continue;     // do NOT delete if archive append failed
      }
      try {
        fs.unlinkSync(m.full);
        deleted += 1;
        bytes_reclaimed += m.size;
      } catch (e) {
        console.warn(`  [archive-OK delete-FAIL] ${m.name}: ${e.message}`);
        // Archive duplicate may occur next run if delete keeps failing —
        // archive's append-only tolerates duplicates.
      }
    } else {
      archived += 1;     // counted as "would archive"
      bytes_reclaimed += m.size;
    }
    if (VERBOSE) {
      console.log(`  ${APPLY ? '✓' : '·'} ${m.name} (${(m.size/1024).toFixed(1)} KB, ${new Date(m.mtimeMs).toISOString()})`);
    }
  }

  const verb = APPLY ? 'archived+deleted' : 'WOULD archive+delete';
  console.log(`[${policy.name}] ${verb}=${APPLY ? deleted : archived}` +
              ` bytes_reclaimed=${(bytes_reclaimed/1024/1024).toFixed(2)}MB` +
              ` archive=${path.relative(REPO_ROOT, policy.archive)}`);

  return { policy: policy.name, matched: matches.length, eligible: eligible.length + capped, archived, deleted, bytes_reclaimed, capped };
}

// --- Main ----------------------------------------------------------------

console.log(`prune-integrity.js — ${APPLY ? 'APPLY MODE (will modify disk)' : 'DRY RUN (--apply to commit)'}`);
console.log(`repo root: ${REPO_ROOT}`);
console.log(`integrity dir: ${INTEGRITY_DIR}`);
console.log('');

const results = policies.map(runPolicy);
const totalBytes = results.reduce((a, r) => a + r.bytes_reclaimed, 0);

console.log('');
console.log('=== summary ===');
for (const r of results) {
  console.log(`  ${r.policy.padEnd(22)}  matched=${r.matched}  eligible=${r.eligible}  ` +
              (APPLY ? `archived=${r.archived}  deleted=${r.deleted}` : `would_archive=${r.archived}`));
}
console.log(`  TOTAL bytes ${APPLY ? 'reclaimed' : 'reclaimable'}: ${(totalBytes/1024/1024).toFixed(2)} MB`);

if (!APPLY) {
  console.log('');
  console.log('Pass --apply to actually archive and delete.');
}
