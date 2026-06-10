#!/usr/bin/env node
/*
 * monitor/scripts/allocate-iss-ids.js (PROP-089)
 *
 * THE ONLY SUPPORTED WAY TO MINT NEW ISS IDS.
 *
 * Replaces the inline `next_iss_id` allocation sites that were producing
 * ISS-2663/2664 duplicate-allocation races between concurrent decider
 * runs. Per PROP-089: the helper script + push-time uniqueness lint
 * (lint-decider-surfaces.js) + canonical concurrent-collision recovery
 * procedure together solve the race operationally — file-locking and
 * UUIDs were explicitly rejected (no shared filesystem; ISS-\d+ convention
 * is parsed across the pipeline).
 *
 * Invocation:
 *   node monitor/scripts/allocate-iss-ids.js [--count N]
 *
 *   Emits N newly-allocated ISS ids on stdout, one per line. N defaults
 *   to 1. The helper also updates open-issues.json's next_iss_id field
 *   so subsequent allocations don't repeat. Caller is then responsible
 *   for adding the actual ISS entries to open-issues.json.issues[].
 *
 *   --dry-run does NOT write next_iss_id; it just prints what would be
 *   allocated.
 *
 * Allocation invariant.
 *   next_iss_id := max(
 *     open-issues.next_iss_id,
 *     max(ISS id in open-issues.json) + 1,
 *     max(ISS id in closed-issues.json) + 1
 *   )
 *
 *   Emitted ids = [next_iss_id, next_iss_id + N) before write.
 *   open-issues.next_iss_id := next_iss_id + N after write.
 *
 * Race tolerance.
 *   Two concurrent decider runs A and B may each call this helper, each
 *   read the same state, each emit the SAME ids, each write. Whichever
 *   pushes second loses at the pre-push lint (lint-decider-surfaces.js
 *   C3 cross-file uniqueness + next_iss_id invariant), because that
 *   commit's ISSs collide with the one already on origin/main. The
 *   second decider then runs the canonical concurrent-collision recovery
 *   procedure (decider.md, added by PROP-089 C4): git pull --rebase,
 *   re-allocate ids via this script (now seeing the rebased state),
 *   rewrite the affected ISS records, re-stage, re-push.
 *
 * Exit codes:
 *   0 — success; allocated ids printed to stdout
 *   1 — operational failure (file missing, parse error, write error)
 */

'use strict';

const fs = require('fs');

const OPEN_PATH = 'monitor/decisions/open-issues.json';
const CLOSED_PATH = 'monitor/decisions/closed-issues.json';

function parseCli() {
  const args = process.argv.slice(2);
  let count = 1;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      if (isNaN(count) || count < 1) {
        console.error('allocate-iss-ids: --count requires a positive integer');
        process.exit(1);
      }
      i++;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--help' || a === '-h') {
      console.error('Usage: node monitor/scripts/allocate-iss-ids.js [--count N] [--dry-run]');
      process.exit(0);
    } else {
      console.error(`allocate-iss-ids: unknown argument '${a}'`);
      process.exit(1);
    }
  }
  return { count, dryRun };
}

function readJSON(path) {
  if (!fs.existsSync(path)) {
    console.error(`allocate-iss-ids: ${path} not found`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`allocate-iss-ids: failed to parse ${path}: ${e.message}`);
    process.exit(1);
  }
}

function maxIssIdIn(arr) {
  let max = -1;
  for (const it of (arr || [])) {
    const m = /^ISS-(\d+)$/.exec(it.id || '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function main() {
  const { count, dryRun } = parseCli();

  const open = readJSON(OPEN_PATH);
  const closed = readJSON(CLOSED_PATH);

  const openMax = maxIssIdIn(open.issues);
  const closedMax = maxIssIdIn(closed.issues);
  const declaredNext = (typeof open.next_iss_id === 'number') ? open.next_iss_id : 0;

  // Allocation invariant.
  const startId = Math.max(declaredNext, openMax + 1, closedMax + 1);

  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(`ISS-${startId + i}`);
  }
  const newNext = startId + count;

  if (dryRun) {
    console.error(`allocate-iss-ids: DRY RUN — would allocate ${count} ids starting at ISS-${startId}`);
    console.error(`allocate-iss-ids: would advance next_iss_id ${declaredNext} → ${newNext}`);
    for (const id of ids) console.log(id);
    process.exit(0);
  }

  // Apply: write next_iss_id back. Caller is responsible for adding the
  // actual issue entries.
  open.next_iss_id = newNext;
  try {
    fs.writeFileSync(OPEN_PATH, JSON.stringify(open, null, 2) + '\n');
  } catch (e) {
    console.error(`allocate-iss-ids: failed to write ${OPEN_PATH}: ${e.message}`);
    process.exit(1);
  }

  // stderr trail for the caller's run log.
  console.error(`allocate-iss-ids: allocated ${count} id(s) starting at ISS-${startId}; next_iss_id advanced ${declaredNext} → ${newNext}`);
  for (const id of ids) console.log(id);
  process.exit(0);
}

main();
