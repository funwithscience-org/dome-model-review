#!/usr/bin/env node
/*
 * monitor/scripts/allocate-exp-ids.js (PROP-106)
 *
 * THE ONLY SUPPORTED WAY TO MINT NEW EXP IDS.
 *
 * Mirrors PROP-089's allocate-iss-ids.js applied to the EXP surface
 * (monitor/analyst/expansion-tracker.json). Replaces the inline PROP-100
 * allocation blocks that analyst Mode 1, analyst-baby Mode 1 BAU drain,
 * and decider integration sites kept improvising or omitting.
 *
 * The specific gap-opener that motivated this script: analyst-baby's
 * Mode 1 batch-write path had NO explicit next_id mutation at all
 * (verified by Q1 of PROP-106 root_cause_answer_to_directive). Writes
 * landed without advancing next_id, producing 8 consecutive days of
 * integrity FAIL/warn through 2026-06-17. The PROP-100 read-side clamp
 * prevented actual id duplication, but the stale-state tripping was
 * accumulating operator-attention cost.
 *
 * Invocation:
 *   node monitor/scripts/allocate-exp-ids.js [--count N] [--dry-run] [--verify]
 *
 *   Default: mint 1 id, advance expansion-tracker.json.next_id, print to
 *   stdout one id per line. --count N mints N consecutive.
 *
 *   --dry-run: do NOT write next_id; print what would be allocated.
 *
 *   --verify: do NOT mint. Run the invariant check only and exit:
 *     0 — invariant holds (next_id > max(all EXP ids in live ∪ archive))
 *     1 — invariant violated; print violating ids and recovery hint
 *   Used both by the pre-push lint and by the C4 recovery procedure.
 *
 * Allocation invariant.
 *   next_id := max(
 *     expansion-tracker.next_id,
 *     max(EXP id in expansion-tracker.items[]) + 1,
 *     max(EXP id in expansion-tracker-archive.jsonl) + 1
 *   )
 *
 *   Emitted ids = [next_id, next_id + N) formatted as EXP-NNN (zero-padded
 *   to 3 digits, per PROP-053-rev2 convention).
 *   expansion-tracker.next_id := next_id + N after write.
 *
 * Race tolerance.
 *   Two concurrent writers (analyst Mode 1 + analyst-baby, or any pair)
 *   may each call this helper, each read the same state, each emit the
 *   SAME ids, each write. Whichever pushes second loses at the pre-push
 *   lint (lint-exp-allocations.js next_id invariant against the rebased
 *   state). The second writer then runs the canonical concurrent-collision
 *   recovery procedure (analyst.md / analyst-baby.md / decider.md C4,
 *   added by PROP-106): git pull --rebase, re-run --verify, re-allocate
 *   ids via this script (now seeing the rebased state), rewrite the
 *   colliding EXP records, re-stage, re-push.
 *
 * Exit codes:
 *   0 — success; allocated ids printed to stdout (or --verify passed)
 *   1 — operational failure OR --verify invariant violated
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TRACKER_PATH = 'monitor/analyst/expansion-tracker.json';
const ARCHIVE_PATH = 'monitor/analyst/expansion-tracker-archive.jsonl';
const ID_PREFIX = 'EXP-';
const PAD_WIDTH = 3;

function parseCli() {
  const args = process.argv.slice(2);
  let count = 1;
  let dryRun = false;
  let verify = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      if (isNaN(count) || count < 0) {
        console.error('allocate-exp-ids: --count requires a non-negative integer (0 = self-heal write-only; ≥1 = mint)');
        process.exit(1);
      }
      i++;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--verify') {
      verify = true;
    } else if (a === '--help' || a === '-h') {
      console.error('Usage: node monitor/scripts/allocate-exp-ids.js [--count N] [--dry-run] [--verify]');
      process.exit(0);
    } else {
      console.error(`allocate-exp-ids: unknown argument '${a}'`);
      process.exit(1);
    }
  }
  return { count, dryRun, verify };
}

function readJSON(p) {
  if (!fs.existsSync(p)) {
    console.error(`allocate-exp-ids: ${p} not found`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`allocate-exp-ids: failed to parse ${p}: ${e.message}`);
    process.exit(1);
  }
}

function maxExpIdIn(arr) {
  let max = -1;
  for (const it of (arr || [])) {
    const m = /^EXP-(\d+)$/.exec(it.id || '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function maxExpIdInArchive(archivePath) {
  // Archive may not exist yet (PROP-053-rev2 ships rotation on rate-threshold).
  if (!fs.existsSync(archivePath)) return -1;
  let max = -1;
  let lines;
  try {
    lines = fs.readFileSync(archivePath, 'utf8').split(/\r?\n/);
  } catch (e) {
    console.error(`allocate-exp-ids: failed to read ${archivePath}: ${e.message}`);
    process.exit(1);
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    // Cheap regex over the line — avoid JSON.parse per row for speed on large archives.
    const m = /"id"\s*:\s*"EXP-(\d+)"/.exec(line);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

// PROP-144 (2026-08-01, ISS-3033): orphan-file guard. Mode-6 self-initiated
// EXP files (EXP-673/674/675) existed in monitor/analyst/expansions/ with NO
// tracker entry while tracker.next_id sat at 673 — the next allocation would
// have minted a duplicate EXP-673. Scan expansions/ filenames so orphan files
// participate in the clamp even when the tracker never saw them.
function maxExpIdInFiles(dir) {
  let max = -1;
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^EXP-(\d+)/.exec(f);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  } catch (e) { /* dir missing — best-effort guard */ }
  return max;
}

function padId(n) {
  const s = String(n);
  return ID_PREFIX + (s.length >= PAD_WIDTH ? s : ('0'.repeat(PAD_WIDTH - s.length) + s));
}

function main() {
  const { count, dryRun, verify } = parseCli();

  const tracker = readJSON(TRACKER_PATH);
  const liveMax = maxExpIdIn(tracker.items);
  const archMax = maxExpIdInArchive(ARCHIVE_PATH);
  const declaredNext = (typeof tracker.next_id === 'number') ? tracker.next_id : 0;

  const filesMax = maxExpIdInFiles('monitor/analyst/expansions'); // PROP-144
  const safeNext = Math.max(declaredNext, liveMax + 1, archMax + 1, filesMax + 1);

  if (verify) {
    // Invariant: next_id > max(live ∪ archive).
    const observedMax = Math.max(liveMax, archMax);
    if (declaredNext > observedMax) {
      console.error(`allocate-exp-ids: --verify PASS (next_id=${declaredNext} > max=${observedMax})`);
      process.exit(0);
    }
    console.error(`allocate-exp-ids: --verify FAIL`);
    console.error(`  declared next_id = ${declaredNext}`);
    console.error(`  live_max         = ${liveMax}${liveMax === observedMax ? ' <-- max' : ''}`);
    console.error(`  archive_max      = ${archMax}${archMax === observedMax ? ' <-- max' : ''}`);
    console.error(`  safeNext (clamp) = ${safeNext}`);
    console.error(`Recovery: node monitor/scripts/allocate-exp-ids.js --dry-run  # confirm clamp`);
    console.error(`          node monitor/scripts/allocate-exp-ids.js --count 0  # write clamp only`);
    console.error(`          (--count 0 advances next_id without minting; useful for self-heal commits)`);
    process.exit(1);
  }

  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(padId(safeNext + i));
  }
  const newNext = safeNext + count;

  if (dryRun) {
    console.error(`allocate-exp-ids: DRY RUN — would allocate ${count} id(s) starting at ${padId(safeNext)}`);
    if (safeNext !== declaredNext) {
      console.error(`allocate-exp-ids: WARN clamp safeNext=${safeNext} > declaredNext=${declaredNext} (live_max=${liveMax}, arch_max=${archMax})`);
    }
    console.error(`allocate-exp-ids: would advance next_id ${declaredNext} → ${newNext}`);
    for (const id of ids) console.log(id);
    process.exit(0);
  }

  // Apply: write next_id back. Atomic write via tmp+rename to avoid
  // partial-write corruption on disk-pressure.
  tracker.next_id = newNext;
  const tmp = TRACKER_PATH + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(tracker, null, 2) + '\n');
    fs.renameSync(tmp, TRACKER_PATH);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    console.error(`allocate-exp-ids: failed to write ${TRACKER_PATH}: ${e.message}`);
    process.exit(1);
  }

  // stderr trail for the caller's run log.
  if (safeNext !== declaredNext) {
    console.error(`allocate-exp-ids: WARN clamp safeNext=${safeNext} > declaredNext=${declaredNext} (live_max=${liveMax}, arch_max=${archMax}); allocated from clamped floor`);
  }
  console.error(`allocate-exp-ids: allocated ${count} id(s) starting at ${padId(safeNext)}; next_id advanced ${declaredNext} → ${newNext}`);
  for (const id of ids) console.log(id);
  process.exit(0);
}

main();
