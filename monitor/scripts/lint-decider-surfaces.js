#!/usr/bin/env node
/*
 * monitor/scripts/lint-decider-surfaces.js (PROP-087 + PROP-089 C3)
 *
 * Pre-push lint for decider's three write surfaces — priority-queue.json,
 * attention-inbox.json, open-issues.json — and cross-file ISS uniqueness
 * against closed-issues.json. Refuses to push when newly-added or modified
 * records violate the canonical schemas documented in decider.md.
 *
 * Background. Four decider schema-improvisation events landed in ~2 days
 * across two surfaces (3 ATTN-NNN inbox records DIRECTIVE-20260608-002 +
 * qids 510/511/512 with improvised field names commit 3d9675d). The queue
 * push happened ~8h AFTER the SCHEMA-DO-NOT-DEVIATE warning landed in
 * decider.md line ~812 on 2026-06-08. Prompt exhortation empirically
 * insufficient. PROP-087 closes the producer side; PROP-089 C3 extends
 * the open-issues.json check to cross-file ISS uniqueness + next_id
 * invariant after the ISS-2663/2664 allocator races.
 *
 * Invocation (from decider's clone, after committing, BEFORE git push):
 *
 *   node monitor/scripts/lint-decider-surfaces.js
 *
 * Replay mode (forensics — lint a historical commit):
 *
 *   node monitor/scripts/lint-decider-surfaces.js --replay <COMMITISH>
 *
 *   Lints the named commit's state vs HEAD~1 origin/main rather than
 *   local-vs-origin-main. Used to verify the lint would have caught
 *   known-bad pushes (3d9675d for queue drift, c08b533 for qid-reuse).
 *
 * Exit codes:
 *   0 — all newly-added or modified records pass
 *   1 — at least one violation; refuse to push
 *
 * Detection logic.
 *   priority-queue.json live items must carry required canonical fields
 *   and lack the observed-drift field names (target/type/added_at/added_by
 *   /priority). Within-file queue_id uniqueness. next_id > max(live qid).
 *   Newly-pushed queue_ids must not already be present in archive.
 *
 *   attention-inbox.json new records must use id format ATT-<ISO-timestamp>
 *   (not ATTN-NNN), carry a status field with legal value, and lack the
 *   observed-drift field names (resolved/subject/detail/details).
 *
 *   open-issues.json + closed-issues.json: cross-file ISS id uniqueness,
 *   open-issues.next_iss_id > max(all ISS ids across BOTH files).
 *
 * Recovery on exit 1: STOP. Repair the offending record using the
 * canonical template (decider.md Step A schema block, or PROP-089
 * allocate-iss-ids.js). --no-verify is FORBIDDEN.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// -----------------------------------------------------------------------
// Canonical-schema definitions (must mirror decider.md / DATA-SCHEMAS.md)
// -----------------------------------------------------------------------

const QUEUE_ITEM_REQUIRED = ['queue_id', 'target_type', 'target_id', 'class', 'reason', 'pushed_by', 'pushed_at'];

// PROP-142 (ISS-3012): canonical top-level field-set for priority-queue.json.
// Must mirror DATA-SCHEMAS.md § priority-queue.json 'Live file top-level
// fields' — if you add a genuinely new top-level field, update BOTH in the
// same change. Unknown fields (e.g. the 2026-07-18 queue_length/queue_depth/
// next_queue_id cruft) are rejected so shadow fields cannot silently reappear.
const QUEUE_TOPLEVEL_ALLOWED = [
  'description',
  'schema_version', 'schema_version_set_at', 'schema_version_set_by',
  'mode', 'mode_legal_values', 'mode_set_by', 'mode_set_at', 'mode_rules',
  'writers', 'readers',
  'queue', 'next_id',
  'schedule_state',
  'last_updated', 'last_updated_by',
  'depth',
];
// Shadow gate for the unknown-field check only (PROP-106 polarity:
// presence = shadow/log-only, absence = enforce).
const QUEUE_SCHEMA_SHADOW_FLAG = 'monitor/decisions/prop-142-queue-schema-shadow.flag';
const QUEUE_ITEM_LEGAL_CLASS = ['verification', 'deep-attack', 'holistic', 'rewrite-verify'];
const QUEUE_ITEM_FORBIDDEN_KEYS = ['target', 'type', 'added_at', 'added_by', 'priority'];

const INBOX_ITEM_REQUIRED = ['id', 'status', 'target_type', 'target_id', 'reason', 'pushed_by', 'pushed_at'];
const INBOX_ITEM_LEGAL_STATUS = ['pending', 'open', 'resolved', 'superseded'];
const INBOX_ITEM_FORBIDDEN_KEYS = ['resolved', 'subject', 'detail', 'details'];
const INBOX_ID_PATTERN = /^ATT-\d{4}-\d{2}-\d{2}T/;  // ATT-<ISO-timestamp>
const INBOX_ID_FORBIDDEN_PATTERN = /^ATTN-\d+/;       // observed drift

// -----------------------------------------------------------------------
// Git helpers
// -----------------------------------------------------------------------

function gitShow(ref, repoPath) {
  try {
    return execSync(`git show ${ref}:${repoPath}`, {
      encoding: 'utf8',
      maxBuffer: 200 * 1024 * 1024,
    });
  } catch (e) {
    return null;
  }
}

function readLocal(repoPath) {
  if (!fs.existsSync(repoPath)) return null;
  return fs.readFileSync(repoPath, 'utf8');
}

function parseJSONSafe(text, label) {
  if (text == null) return null;
  try { return JSON.parse(text); }
  catch (e) {
    console.warn(`[warn] ${label}: JSON parse failed (${e.message}); treating as absent`);
    return null;
  }
}

// -----------------------------------------------------------------------
// CLI: --replay COMMITISH support
// -----------------------------------------------------------------------

function parseCli() {
  const args = process.argv.slice(2);
  const replayIdx = args.indexOf('--replay');
  if (replayIdx >= 0 && args[replayIdx + 1]) {
    return { mode: 'replay', commit: args[replayIdx + 1] };
  }
  return { mode: 'live' };
}

// In live mode: localRef = HEAD (working tree), baseRef = origin/main.
// In replay mode: localRef = the named commit, baseRef = that commit's parent.
function refsFor(mode, commit) {
  if (mode === 'replay') {
    return { localRef: commit, baseRef: `${commit}^` };
  }
  return { localRef: null, baseRef: 'origin/main' };  // null = read from working tree
}

function readSurface(repoPath, localRef) {
  if (localRef == null) return parseJSONSafe(readLocal(repoPath), repoPath);
  return parseJSONSafe(gitShow(localRef, repoPath), `${localRef}:${repoPath}`);
}

// -----------------------------------------------------------------------
// Lint: priority-queue.json
// -----------------------------------------------------------------------

function lintQueue(localJ, baseJ, archiveText) {
  const violations = [];
  if (!localJ) return violations;

  // PROP-142 (ISS-3012): top-level schema conformance. Reject unknown fields
  // so operator/decider edits cannot silently reintroduce shadow cruft
  // (queue_length/queue_depth/next_queue_id class). shadow_eligible marks
  // these rows for the soak-period gate in main().
  for (const k of Object.keys(localJ)) {
    if (!QUEUE_TOPLEVEL_ALLOWED.includes(k)) {
      violations.push({
        surface: 'priority-queue.json',
        qid: '(meta)',
        kind: 'unknown-top-level-field',
        shadow_eligible: true,
        detail: `top-level field '${k}' is not in the canonical schema (DATA-SCHEMAS.md § priority-queue.json). Remove it, or if genuinely new, add it to DATA-SCHEMAS.md AND QUEUE_TOPLEVEL_ALLOWED in the same change.`,
      });
    }
  }
  const items = Array.isArray(localJ.queue) ? localJ.queue : (Array.isArray(localJ.items) ? localJ.items : []);
  const baseItems = baseJ ? (Array.isArray(baseJ.queue) ? baseJ.queue : (Array.isArray(baseJ.items) ? baseJ.items : [])) : [];
  const baseQids = new Set(baseItems.map(it => it.queue_id).filter(x => x != null));

  // Per-item canonical schema check on NEWLY-ADDED items.
  for (const it of items) {
    const qid = it.queue_id;
    const isNew = qid == null || !baseQids.has(qid);
    if (!isNew) continue;

    // Required-field check
    for (const k of QUEUE_ITEM_REQUIRED) {
      if (it[k] == null || it[k] === '') {
        violations.push({
          surface: 'priority-queue.json',
          qid: qid != null ? qid : '(none)',
          kind: 'missing-required-field',
          detail: `field '${k}' is required by canonical schema`,
        });
      }
    }

    // Forbidden-key check
    for (const k of QUEUE_ITEM_FORBIDDEN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(it, k)) {
        violations.push({
          surface: 'priority-queue.json',
          qid: qid != null ? qid : '(none)',
          kind: 'forbidden-improvised-key',
          detail: `field '${k}' is on the observed-drift list (target/type/added_at/added_by/priority); use the canonical schema keys`,
        });
      }
    }

    // Class enum
    if (it.class != null && !QUEUE_ITEM_LEGAL_CLASS.includes(it.class)) {
      violations.push({
        surface: 'priority-queue.json',
        qid: qid != null ? qid : '(none)',
        kind: 'illegal-class',
        detail: `class='${it.class}' must be one of ${JSON.stringify(QUEUE_ITEM_LEGAL_CLASS)}`,
      });
    }

    // pushed_at ISO-parseable
    if (it.pushed_at != null && it.pushed_at !== '' && isNaN(Date.parse(it.pushed_at))) {
      violations.push({
        surface: 'priority-queue.json',
        qid: qid != null ? qid : '(none)',
        kind: 'unparseable-pushed_at',
        detail: `pushed_at='${it.pushed_at}' is not ISO-parseable`,
      });
    }
  }

  // Within-file qid uniqueness (entire live queue, not just new — duplicates would have escaped).
  const qidCount = new Map();
  for (const it of items) {
    if (it.queue_id != null) qidCount.set(it.queue_id, (qidCount.get(it.queue_id) || 0) + 1);
  }
  for (const [qid, n] of qidCount) {
    if (n > 1) {
      violations.push({
        surface: 'priority-queue.json',
        qid,
        kind: 'within-file-qid-collision',
        detail: `queue_id ${qid} appears ${n} times in live items[]`,
      });
    }
  }

  // next_id invariant: must be > max(live queue_id) and > base next_id (monotone non-decreasing).
  const liveMax = Math.max(0, ...items.map(it => it.queue_id || 0));
  // PROP-142 (ISS-3012): next_id is REQUIRED; the next_queue_id fallback is
  // retired. A stale shadow value (587 vs canonical 591, operator edit
  // 2026-07-18) sat poised to authorize qid reuse if next_id was ever
  // dropped. Fail closed instead of falling back.
  const nextId = localJ.next_id != null ? localJ.next_id : null;
  if (nextId == null) {
    violations.push({
      surface: 'priority-queue.json',
      qid: '(meta)',
      kind: 'next_id-missing',
      detail: 'next_id is required on priority-queue.json (no fallback; the legacy next_queue_id shadow field is retired per ISS-3012/PROP-142)',
    });
  }
  if (nextId != null && nextId <= liveMax) {
    violations.push({
      surface: 'priority-queue.json',
      qid: '(meta)',
      kind: 'next_id-invariant-violation',
      detail: `next_id=${nextId} must be > max(live queue_id)=${liveMax}`,
    });
  }
  if (baseJ) {
    const baseNext = baseJ.next_id != null ? baseJ.next_id : null;  // PROP-142: no next_queue_id fallback on the base side either; a base commit without next_id just skips the regression check (history can't be repaired)
    if (nextId != null && baseNext != null && nextId < baseNext) {
      violations.push({
        surface: 'priority-queue.json',
        qid: '(meta)',
        kind: 'next_id-regression',
        detail: `next_id=${nextId} regressed from base ${baseNext}`,
      });
    }
  }

  // qid-reuse guard. The canonical invariant is: at any snapshot, a queue_id
  // is either LIVE or ARCHIVED, never both. If a qid appears in BOTH, the
  // recovery path or allocator reused it — this is what caught the c08b533
  // case (recovery run reassigned 511/512 to new work after popping the
  // broken originals). Check every live qid against the archive, not just
  // ones absent from base, because base→local may also reuse a qid
  // (the failure mode we're catching).
  if (archiveText) {
    const archiveQids = new Set();
    const lines = archiveText.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.queue_id != null) archiveQids.add(obj.queue_id);
      } catch { /* tolerate */ }
    }
    for (const it of items) {
      const qid = it.queue_id;
      if (qid == null) continue;
      if (archiveQids.has(qid)) {
        violations.push({
          surface: 'priority-queue.json',
          qid,
          kind: 'qid-reuse-against-archive',
          detail: `live queue_id ${qid} also exists in priority-queue-archive.jsonl — qids must be unique across (live ∪ archive)`,
        });
      }
    }
    // next_id invariant against archive: must exceed any qid ever used.
    const archiveMax = archiveQids.size ? Math.max(...archiveQids) : 0;
    if (nextId != null && nextId <= archiveMax) {
      violations.push({
        surface: 'priority-queue.json',
        qid: '(meta)',
        kind: 'next_id-archive-invariant-violation',
        detail: `next_id=${nextId} must be > max(archive queue_id)=${archiveMax}`,
      });
    }
  }

  return violations;
}

// -----------------------------------------------------------------------
// Lint: attention-inbox.json
// -----------------------------------------------------------------------

function lintInbox(localJ, baseJ) {
  const violations = [];
  if (!localJ) return violations;
  const items = Array.isArray(localJ.items) ? localJ.items : [];
  const baseItems = baseJ && Array.isArray(baseJ.items) ? baseJ.items : [];
  const baseIds = new Set(baseItems.map(it => it.id).filter(x => x != null));

  for (const it of items) {
    const id = it.id;
    const isNew = id == null || !baseIds.has(id);
    if (!isNew) continue;

    // id format
    if (typeof id !== 'string' || !INBOX_ID_PATTERN.test(id)) {
      const drift = typeof id === 'string' && INBOX_ID_FORBIDDEN_PATTERN.test(id);
      violations.push({
        surface: 'attention-inbox.json',
        id: id != null ? id : '(none)',
        kind: drift ? 'forbidden-id-format-ATTN-NNN' : 'illegal-id-format',
        detail: drift
          ? `id '${id}' matches the observed-drift pattern ATTN-NNN; canonical is ATT-<ISO-timestamp>`
          : `id '${id}' does not match canonical pattern ATT-<ISO-timestamp>`,
      });
    }

    // Required fields
    for (const k of INBOX_ITEM_REQUIRED) {
      if (it[k] == null || it[k] === '') {
        violations.push({
          surface: 'attention-inbox.json',
          id: id != null ? id : '(none)',
          kind: 'missing-required-field',
          detail: `field '${k}' is required by canonical schema`,
        });
      }
    }

    // Status enum
    if (it.status != null && !INBOX_ITEM_LEGAL_STATUS.includes(it.status)) {
      violations.push({
        surface: 'attention-inbox.json',
        id: id != null ? id : '(none)',
        kind: 'illegal-status',
        detail: `status='${it.status}' must be one of ${JSON.stringify(INBOX_ITEM_LEGAL_STATUS)}`,
      });
    }

    // Forbidden-key check
    for (const k of INBOX_ITEM_FORBIDDEN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(it, k)) {
        violations.push({
          surface: 'attention-inbox.json',
          id: id != null ? id : '(none)',
          kind: 'forbidden-improvised-key',
          detail: `field '${k}' is on the observed-drift list (resolved/subject/detail/details); use the canonical schema keys`,
        });
      }
    }
  }
  return violations;
}

// -----------------------------------------------------------------------
// Lint: open-issues + closed-issues cross-file ISS uniqueness (PROP-089 C3)
// -----------------------------------------------------------------------

function lintIssCrossFile(openJ, closedJ) {
  const violations = [];
  if (!openJ && !closedJ) return violations;

  const openItems = openJ && Array.isArray(openJ.issues) ? openJ.issues : [];
  const closedItems = closedJ && Array.isArray(closedJ.issues) ? closedJ.issues : [];

  // Within-file uniqueness — open
  const openCount = new Map();
  for (const it of openItems) {
    if (it.id != null) openCount.set(it.id, (openCount.get(it.id) || 0) + 1);
  }
  for (const [id, n] of openCount) {
    if (n > 1) {
      violations.push({
        surface: 'open-issues.json',
        id,
        kind: 'within-file-id-collision',
        detail: `ISS id ${id} appears ${n} times in open-issues.json`,
      });
    }
  }

  // Within-file uniqueness — closed
  const closedCount = new Map();
  for (const it of closedItems) {
    if (it.id != null) closedCount.set(it.id, (closedCount.get(it.id) || 0) + 1);
  }
  for (const [id, n] of closedCount) {
    if (n > 1) {
      violations.push({
        surface: 'closed-issues.json',
        id,
        kind: 'within-file-id-collision',
        detail: `ISS id ${id} appears ${n} times in closed-issues.json`,
      });
    }
  }

  // Cross-file: an ISS may not be in both files at once.
  const openIds = new Set(openItems.map(i => i.id).filter(x => x != null));
  const closedIds = new Set(closedItems.map(i => i.id).filter(x => x != null));
  for (const id of openIds) {
    if (closedIds.has(id)) {
      violations.push({
        surface: 'cross-file',
        id,
        kind: 'iss-in-both-files',
        detail: `ISS ${id} present in both open-issues.json and closed-issues.json`,
      });
    }
  }

  // next_iss_id invariant: must be > max(all ISS ids).
  const allIds = [...openIds, ...closedIds]
    .map(id => {
      const m = /^ISS-(\d+)$/.exec(id || '');
      return m ? parseInt(m[1], 10) : -1;
    })
    .filter(n => n >= 0);
  const maxIss = allIds.length ? Math.max(...allIds) : 0;
  const nextIss = openJ && openJ.next_iss_id != null ? openJ.next_iss_id : null;
  if (nextIss != null && nextIss <= maxIss) {
    violations.push({
      surface: 'open-issues.json',
      id: '(meta)',
      kind: 'next_iss_id-invariant-violation',
      detail: `next_iss_id=${nextIss} must be > max(all ISS ids)=${maxIss}`,
    });
  }

  return violations;
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

function main() {
  const cli = parseCli();
  const { localRef, baseRef } = refsFor(cli.mode, cli.commit);
  const label = cli.mode === 'replay'
    ? `[replay ${cli.commit}]`
    : '[live HEAD vs origin/main]';

  console.log(`lint-decider-surfaces ${label}`);

  const queueLocal = readSurface('monitor/curmudgeon/priority-queue.json', localRef);
  const queueBase = parseJSONSafe(gitShow(baseRef, 'monitor/curmudgeon/priority-queue.json'),
                                  `${baseRef}:priority-queue.json`);

  // Archive is JSONL on git side; in live mode read the working tree.
  let archiveText = null;
  if (localRef == null) {
    archiveText = readLocal('monitor/curmudgeon/priority-queue-archive.jsonl');
  } else {
    archiveText = gitShow(localRef, 'monitor/curmudgeon/priority-queue-archive.jsonl');
  }

  const inboxLocal = readSurface('monitor/analyst/attention-inbox.json', localRef);
  const inboxBase = parseJSONSafe(gitShow(baseRef, 'monitor/analyst/attention-inbox.json'),
                                  `${baseRef}:attention-inbox.json`);

  const openLocal = readSurface('monitor/decisions/open-issues.json', localRef);
  const closedLocal = readSurface('monitor/decisions/closed-issues.json', localRef);

  const allViolations = [
    ...lintQueue(queueLocal, queueBase, archiveText),
    ...lintInbox(inboxLocal, inboxBase),
    ...lintIssCrossFile(openLocal, closedLocal),
  ];

  // PROP-142 (ISS-3012) shadow gate: 'unknown-top-level-field' rows are
  // advisory while monitor/decisions/prop-142-queue-schema-shadow.flag exists
  // (soak period); enforced once the flag is removed. Polarity matches
  // prop-106-shadow.flag (presence = shadow, absence = enforce) so the safer
  // default after flag removal is enforcement. All other violation kinds are
  // unaffected by the flag.
  const shadowMode = fs.existsSync(QUEUE_SCHEMA_SHADOW_FLAG);
  const violations = shadowMode ? allViolations.filter(v => !v.shadow_eligible) : allViolations;
  if (shadowMode) {
    for (const v of allViolations.filter(v => v.shadow_eligible)) {
      console.warn(`SHADOW (prop-142 flag present, not blocking): [${v.surface}] ${v.kind}: ${v.detail}`);
    }
  }

  if (violations.length === 0) {
    console.log('lint-decider-surfaces: pass (0 violations across all surfaces)');
    process.exit(0);
  }

  console.error('═══════════════════════════════════════════════════════════');
  console.error('PROP-087 / PROP-089 C3 PRE-PUSH LINT GATE — FAIL');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(`${violations.length} violation(s):`);
  for (const v of violations) {
    const tag = v.qid != null ? `qid=${v.qid}` : (v.id != null ? `id=${v.id}` : '');
    console.error(`  [${v.surface}] ${tag} ${v.kind}: ${v.detail}`);
  }
  console.error('');
  console.error('Recovery: repair using the canonical templates documented in');
  console.error('  - decider.md Step A (attention-inbox schema; line ~812)');
  console.error('  - decider.md "How to push items onto the queue" (priority-queue items)');
  console.error('  - PROP-089 allocate-iss-ids.js helper for any new ISS allocation');
  console.error('');
  console.error('REFUSE TO PUSH. Re-stage the offending files after edits, amend the commit,');
  console.error('re-run this script. --no-verify is FORBIDDEN.');
  process.exit(1);
}

main();
