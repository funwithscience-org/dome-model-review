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

// --- Policies ------------------------------------------------------------

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const policies = [
  {
    name: 'workspace-sync-runs',
    dir: WS_SYNC_RUNS_DIR,
    pattern: /^run-.*\.json$/,
    retention_days: 30,
    keep_last_n: null,
    archive: path.join(INTEGRITY_DIR, 'workspace-sync-runs-archive.jsonl')
  },
  {
    name: 'verify-pending-run',
    dir: INTEGRITY_DIR,
    pattern: /^verify-pending-run-.*\.json$/,
    retention_days: 14,
    keep_last_n: null,
    archive: path.join(INTEGRITY_DIR, 'verify-pending-runs-archive.jsonl')
  },
  {
    name: 'narrative-cite-audit',
    dir: INTEGRITY_DIR,
    pattern: /^narrative-cite-audit-.*\.json$/,
    retention_days: null,
    keep_last_n: 7,    // keep newest 7 at full fidelity, archive older
    archive: path.join(INTEGRITY_DIR, 'narrative-cite-audit-archive.jsonl')
  },
  {
    name: 'push-failure',
    dir: INTEGRITY_DIR,
    pattern: /^push-failure-.*\.json$/,
    retention_days: 14,
    keep_last_n: null,
    archive: path.join(INTEGRITY_DIR, 'push-failure-archive.jsonl')
  },
  {
    name: 'report-daily',
    dir: INTEGRITY_DIR,
    pattern: /^report-\d{4}-\d{2}-\d{2}.*\.json$/,
    retention_days: 90,
    keep_last_n: null,
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
    out.push({ name, full, mtimeMs: st.mtimeMs, size: st.size });
  }
  // Newest first so keep_last_n is straightforward.
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

function eligibleForArchive(policy, matches) {
  if (policy.keep_last_n != null) {
    return matches.slice(policy.keep_last_n);
  }
  if (policy.retention_days != null) {
    const cutoff = NOW - policy.retention_days * DAY_MS;
    return matches.filter(m => m.mtimeMs < cutoff);
  }
  return [];
}

function runPolicy(policy) {
  const matches = listMatches(policy);
  const eligible = eligibleForArchive(policy, matches);
  if (matches.length === 0) {
    console.log(`[${policy.name}] no files matched (dir absent or empty).`);
    return { policy: policy.name, matched: 0, eligible: 0, archived: 0, deleted: 0, bytes_reclaimed: 0 };
  }
  console.log(`[${policy.name}] matched=${matches.length} eligible=${eligible.length}` +
              ` (policy: ${policy.keep_last_n != null ? 'keep_last_n=' + policy.keep_last_n : 'retention_days=' + policy.retention_days})`);

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

  return { policy: policy.name, matched: matches.length, eligible: eligible.length, archived, deleted, bytes_reclaimed };
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
