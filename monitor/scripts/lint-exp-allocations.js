#!/usr/bin/env node
/*
 * monitor/scripts/lint-exp-allocations.js (PROP-106 C3)
 *
 * STRICT push-time invariant gate for the EXP id surface.
 * Chained into pre-push hooks of analyst, analyst-baby, AND decider
 * clones — the three writers of monitor/analyst/expansion-tracker.json.
 *
 * Asserts:
 *   (a) expansion-tracker.next_id > max(EXP id in items[] ∪ archive.jsonl)
 *   (b) no duplicate EXP ids within items[]
 *
 * Exit codes:
 *   0 — invariants hold; push allowed
 *   1 — invariant violated; print details + recovery hint; push blocked
 *
 * Why a peer script (not an extension of lint-decider-surfaces.js):
 * lint-decider-surfaces.js is chained ONLY into decider's pre-push hook
 * (PROP-083 chain), but the EXP surface is written by analyst +
 * analyst-baby + decider — and the primary gap-opener (analyst-baby)
 * never runs the decider hook. Extending lint-decider-surfaces would
 * miss the dominant writer. The peer-script approach lets each of the
 * three writers install the same chained lint in their own clones.
 *
 * Diff-aware scoping is NOT needed for the strict invariant — the
 * invariant is a whole-file property, and legacy gaps in items[] are
 * no_trace (gaps without a corresponding EXP-NNN file are harmless per
 * monitor/prompts/reference/expansion-tracker-gap-semantics.md), so the
 * strict check never fires on benign reservation drift — only on the
 * actual write-without-bump bug PROP-106 is hardening against.
 *
 * Shadow vs enforce:
 *   - Default: ENFORCE (exit 1 on violation).
 *   - If monitor/decisions/prop-106-shadow.flag exists, SHADOW mode:
 *     log violations to monitor/integrity/lint-exp-allocations-shadow.jsonl
 *     and exit 0 (no push block).
 *   - Convention mirrors prop-009-enforce.flag (presence = active mode).
 *     PROP-106's shadow flag is opposite-polarity (presence = shadow,
 *     absence = enforce) so the safer default after the flag is removed
 *     is enforcement.
 */

'use strict';

const fs = require('fs');

const TRACKER_PATH = 'monitor/analyst/expansion-tracker.json';
const ARCHIVE_PATH = 'monitor/analyst/expansion-tracker-archive.jsonl';
const SHADOW_FLAG = 'monitor/decisions/prop-106-shadow.flag';
const SHADOW_LOG  = 'monitor/integrity/lint-exp-allocations-shadow.jsonl';

function readJSON(p) {
  if (!fs.existsSync(p)) {
    console.error(`lint-exp-allocations: ${p} not found — skipping (no tracker = no surface to lint)`);
    process.exit(0);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`lint-exp-allocations: failed to parse ${p}: ${e.message}`);
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
  if (!fs.existsSync(archivePath)) return -1;
  let max = -1;
  let lines;
  try {
    lines = fs.readFileSync(archivePath, 'utf8').split(/\r?\n/);
  } catch (e) {
    console.error(`lint-exp-allocations: failed to read ${archivePath}: ${e.message}`);
    process.exit(1);
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /"id"\s*:\s*"EXP-(\d+)"/.exec(line);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function findDuplicateIds(arr) {
  const seen = new Map();
  const dupes = [];
  for (const it of (arr || [])) {
    const id = it.id || '';
    if (!/^EXP-\d+$/.test(id)) continue;
    if (seen.has(id)) {
      dupes.push(id);
    } else {
      seen.set(id, true);
    }
  }
  return dupes;
}

function isShadowMode() {
  return fs.existsSync(SHADOW_FLAG);
}

function logShadow(violation) {
  try {
    const row = { ts: new Date().toISOString(), agent_clone: process.env.AGENT || 'unknown', violation };
    fs.appendFileSync(SHADOW_LOG, JSON.stringify(row) + '\n');
  } catch (_) { /* non-fatal */ }
}

function main() {
  const tracker = readJSON(TRACKER_PATH);
  const liveMax = maxExpIdIn(tracker.items);
  const archMax = maxExpIdInArchive(ARCHIVE_PATH);
  const declaredNext = (typeof tracker.next_id === 'number') ? tracker.next_id : 0;
  const observedMax = Math.max(liveMax, archMax);
  const dupes = findDuplicateIds(tracker.items);

  const violations = [];

  if (declaredNext <= observedMax) {
    violations.push({
      kind: 'next_id_invariant',
      detail: `next_id=${declaredNext} <= observed_max=${observedMax} (live_max=${liveMax}, archive_max=${archMax})`,
      recovery: 'node monitor/scripts/allocate-exp-ids.js --count 0  # writes safe clamp, advances next_id'
    });
  }

  if (dupes.length > 0) {
    violations.push({
      kind: 'duplicate_ids_in_items',
      detail: `duplicate EXP ids in expansion-tracker.json items[]: ${dupes.join(', ')}`,
      recovery: 'inspect the duplicate entries; rename the loser via allocate-exp-ids.js --count 1; update all references'
    });
  }

  const shadow = isShadowMode();

  if (violations.length === 0) {
    console.error(`lint-exp-allocations: PASS (next_id=${declaredNext} > max=${observedMax}; ${(tracker.items || []).length} items, 0 duplicates)`);
    process.exit(0);
  }

  // Violations detected.
  console.error(`lint-exp-allocations: ${shadow ? 'SHADOW' : 'FAIL'} — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  [${v.kind}] ${v.detail}`);
    console.error(`     recovery: ${v.recovery}`);
  }

  if (shadow) {
    logShadow(violations);
    console.error(`lint-exp-allocations: SHADOW mode (presence of ${SHADOW_FLAG}); logging to ${SHADOW_LOG}; allowing push`);
    process.exit(0);
  }

  console.error(`lint-exp-allocations: blocking push. Remove ${SHADOW_FLAG} to enforce; recovery commands above.`);
  process.exit(1);
}

main();
