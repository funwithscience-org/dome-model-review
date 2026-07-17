#!/usr/bin/env node
/**
 * compute-curmudgeon-dispatcher-state.js — PROP-021 Phase 1.
 *
 * Precompute curmudgeon's pre-review dispatcher state into a slim artifact so
 * the dispatcher hot-path is a single ~3-5 KB read instead of ~150 KB of
 * state-file walks plus an in-LLM PROP-009 lookup against 700+ review files.
 *
 * Phase 1 (THIS SCRIPT): produces the artifact only. curmudgeon.md is NOT
 * edited in Phase 1; the artifact runs alongside the existing dispatcher
 * logic and is used for measurement. Phase 2 (separate PR, conditional on
 * the artifact being correct + the operator confirming the ≥40% token
 * reduction threshold from PROP-021 §regression_protection.a) edits
 * curmudgeon.md to consume this artifact and slims out the rare-path prose.
 *
 * Inputs (workspace-relative):
 *   - monitor/curmudgeon/priority-queue.json
 *   - monitor/curmudgeon/human-notes.json
 *   - monitor/curmudgeon/tracker.json (holistic_checks)
 *   - monitor/changes/*.json (Step 0c2 unaudited critical/strategic count)
 *   - monitor/integrity/drift-audit.json (Priority 3 hand-off)
 *   - monitor/curmudgeon/reviews/*.json (PROP-009 queue_id strict + soft-fallback
 *     match against queue items to find the un-reviewed head)
 *
 * Output:
 *   - monitor/integrity/curmudgeon-dispatcher-state.json
 *
 * Sequential priority order (preserved verbatim from curmudgeon.md):
 *   1 → priority queue has an un-reviewed item
 *   2 → human notes has a pending entry
 *   audit → monitor/changes/ has unaudited classification:critical|strategic
 *           within the last 7 days (the existing Step 0c2 audit branch).
 *           "Audited" = c.audited_at present OR the chg id is referenced by a
 *           REACTIVE-AUDIT-*.json review (ISS-2986: changes/ is append-only,
 *           so audited_at can never be stamped post-hoc; the reactive-audit
 *           review file is the durable stamp-equivalent)
 *   3 → drift-audit.json has a non-OBE candidate AND is fresh (<168h)
 *   4 → tracker.holistic_checks has a status:pending entry
 *   5 → spot-check fallback
 *
 * CLI:
 *   node monitor/scripts/compute-curmudgeon-dispatcher-state.js
 *     [--workspace PATH]   default: process.cwd()
 *     [--out PATH]         default: monitor/integrity/curmudgeon-dispatcher-state.json
 *     [--max-batch-byte-budget N]  default: 10240 (matches curmudgeon.md Step 8a)
 *     [--drift-fresh-hours N]      default: 168
 *
 * Exit codes:
 *   0 = success
 *   1 = required input missing (priority-queue.json or human-notes.json)
 *   2 = output write failed
 *   3 = internal error
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const WORKSPACE = flag('--workspace', process.cwd());
const OUT_REL = flag('--out', 'monitor/integrity/curmudgeon-dispatcher-state.json');
const OUT = path.isAbsolute(OUT_REL) ? OUT_REL : path.join(WORKSPACE, OUT_REL);
const MAX_BATCH_BUDGET = parseInt(flag('--max-batch-byte-budget', '10240'), 10);
const DRIFT_FRESH_H = parseFloat(flag('--drift-fresh-hours', '168'));

const SCHEMA_VERSION = 1;
const RUN_ID = process.env.CURMUDGEON_DISPATCHER_RUN_ID
  || ('curm-dispatcher-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + 'Z');

const tStart = Date.now();
const stats = {
  queue_resolution_ms: 0,
  notes_resolution_ms: 0,
  changes_scan_ms: 0,
  drift_freshness_ms: 0,
  holistic_scan_ms: 0,
  review_walk_ms: 0,
  total_script_ms: 0,
};

function readJSON(rel, fallback = null) {
  const p = path.join(WORKSPACE, rel);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return fallback; }
}

function fail(code, msg) {
  console.error('compute-curmudgeon-dispatcher-state: ' + msg);
  process.exit(code);
}

// ───────────────────────────────────────────────────────────────────────
// Step 1: Priority 1 — un-reviewed queue head via PROP-009 strict + soft.
// ───────────────────────────────────────────────────────────────────────

function resolvePriority1() {
  const t0 = Date.now();
  const pq = readJSON('monitor/curmudgeon/priority-queue.json');
  if (!pq) fail(1, 'priority-queue.json missing or unreadable');
  const queue = Array.isArray(pq.queue) ? pq.queue : [];
  const out = {
    has_unreviewed: false,
    head_item: null,
    batch_eligible_run: [],
    queue_total: queue.length,
    queue_history_count: Array.isArray(pq.history) ? pq.history.length : 0,
  };

  if (queue.length === 0) {
    stats.queue_resolution_ms = Date.now() - t0;
    return out;
  }

  // Read reviews dir once for PROP-009 strict (queue_id match) + soft
  // fallback (filename includes target_id AND reviewed_at > pushed_at).
  const reviewsDir = path.join(WORKSPACE, 'monitor/curmudgeon/reviews');
  let reviewFiles = [];
  try { reviewFiles = fs.readdirSync(reviewsDir).filter(f => f.endsWith('.json')); }
  catch (e) { /* reviewsDir may not exist; queue items will all be un-reviewed */ }

  // Build a sparse queue_id → review-exists map by scanning review files.
  // Mode is targeted: we only look at files whose name includes any active
  // queue target_id, which is small (queue is short and target_ids are
  // distinctive like WIN-014, SEC-1.5-EXP623, etc.).
  const tWalk = Date.now();
  const queueIdToReviewExists = new Map();
  const queueIdsActive = new Set(queue.map(q => q.queue_id).filter(x => x != null));
  const queueTargets = new Set(queue.map(q => String(q.target_id || '')).filter(Boolean));

  for (const f of reviewFiles) {
    const matchesTarget = [...queueTargets].some(tid => f.includes(tid));
    if (!matchesTarget) continue;
    let rev;
    try { rev = JSON.parse(fs.readFileSync(path.join(reviewsDir, f), 'utf8')); }
    catch (e) { continue; }
    // PROP-009 strict: queue_id field on review must equal queue item's queue_id.
    if (rev.queue_id != null && queueIdsActive.has(rev.queue_id)) {
      queueIdToReviewExists.set(rev.queue_id, { strict: true, file: f, reviewed_at: rev.reviewed_at });
      continue;
    }
    // Soft fallback: filename matches a queue target_id AND reviewed_at > queue.pushed_at.
    if (rev.reviewed_at) {
      for (const q of queue) {
        if (q.queue_id != null && queueIdToReviewExists.has(q.queue_id)) continue;
        if (f.includes(String(q.target_id || '')) && q.pushed_at && rev.reviewed_at > q.pushed_at) {
          queueIdToReviewExists.set(q.queue_id, { strict: false, file: f, reviewed_at: rev.reviewed_at });
          break;
        }
      }
    }
  }
  stats.review_walk_ms = Date.now() - tWalk;

  // Head = first queue item without a review.
  const head = queue.find(q => !queueIdToReviewExists.has(q.queue_id));
  if (head) {
    out.has_unreviewed = true;
    out.head_item = {
      queue_id: head.queue_id,
      target_type: head.target_type,
      target_id: head.target_id,
      pushed_at: head.pushed_at,
      reason: (head.reason || '').slice(0, 500),
      class: head.class,
      context_hints: head.context_hints || null,
      // Content-exists guard: for proposal items, the EXP file must exist.
      content_exists: (() => {
        if (head.target_type === 'expansion-proposal' && head.target_id) {
          const expGlob = path.join(WORKSPACE, 'monitor/analyst/expansions');
          try {
            const files = fs.readdirSync(expGlob);
            return files.some(f => f.includes(head.target_id));
          } catch (e) { return false; }
        }
        return true;
      })(),
    };
    out.head_item.ready_to_review = out.head_item.content_exists;
  }

  // Batch eligible run (Step 8a gate): up to 3 items, all minor, all
  // win-detail-rewrite / section-rewrite / killshot-rewrite (re-review types),
  // none with anti-staleness >3 cycles since last singleton-deep review.
  // Phase 1 implements only the gross gate (target_type + count). Severity
  // discrimination via closed-issues.json lookup is Phase 2 (this script
  // reads closed-issues lazily only if it's needed; for safety it does not
  // pre-claim batch eligibility — the LLM applies the final gate).
  const rereviewTypes = new Set(['win-detail-rewrite', 'section-rewrite', 'killshot-rewrite']);
  let bytesUsed = 0;
  for (const q of queue) {
    if (out.batch_eligible_run.length >= 3) break;
    if (queueIdToReviewExists.has(q.queue_id)) continue;
    if (!rereviewTypes.has(q.target_type)) break;
    const reasonBytes = (q.reason || '').length;
    if (bytesUsed + reasonBytes > MAX_BATCH_BUDGET) break;
    out.batch_eligible_run.push({
      queue_id: q.queue_id,
      target_type: q.target_type,
      target_id: q.target_id,
      pushed_at: q.pushed_at,
    });
    bytesUsed += reasonBytes;
  }
  // batch_eligible_run is "candidate" — the LLM applies severity + verdict-change gate.

  stats.queue_resolution_ms = Date.now() - t0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Step 2: Priority 2 — pending human notes.
// ───────────────────────────────────────────────────────────────────────

function resolvePriority2() {
  const t0 = Date.now();
  const hn = readJSON('monitor/curmudgeon/human-notes.json');
  if (!hn) fail(1, 'human-notes.json missing or unreadable');
  const notes = Array.isArray(hn.notes) ? hn.notes : [];
  const pending = notes.filter(n => n.status === 'pending' || n.status === 'active');
  const out = {
    pending_count: pending.length,
    pending_items: pending.map(n => ({
      id: n.id || n.note_id || null,
      target: n.target || null,
      priority: n.priority || null,
      created_at: n.created_at || null,
      note_excerpt: (n.note || n.body || '').slice(0, 300),
      // Advisory only: the LLM exercises judgment on coverage-already-exists.
      coverage_already_exists_resolved: { covered: null, mapping: {} },
    })),
  };
  stats.notes_resolution_ms = Date.now() - t0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Step 3: Priority "audit" — unaudited critical/strategic change count.
// ───────────────────────────────────────────────────────────────────────

function resolvePriorityAudit() {
  const t0 = Date.now();
  const out = {
    needed: false,
    unaudited_critical_count: 0,
    unaudited_strategic_count: 0,
    covered_by_reactive_audit_count: 0,
    files: [],
  };
  const changesDir = path.join(WORKSPACE, 'monitor/changes');
  let files = [];
  try { files = fs.readdirSync(changesDir).filter(f => f.endsWith('.json')); }
  catch (e) { stats.changes_scan_ms = Date.now() - t0; return out; }

  // ISS-2986 (option a — REACTIVE-AUDIT coverage scan): monitor/changes/ is
  // append-only, so nothing can ever stamp audited_at onto an existing change
  // file (0 of 210 files have ever carried it) and Priority 0c2 re-fired
  // daily on the same change until the 7d cutoff (5 consecutive re-audits of
  // chg-20260712-0010-003, 2026-07-13..07-17). Instead, treat a change as
  // audited when a completed reactive-audit review references it. Two id
  // sources per REACTIVE-AUDIT-*.json:
  //   (a) instrumentation.dispatcher_flagged_files — the files THIS script
  //       flagged on the cycle that audit consumed (present since 07-16);
  //   (b) chg ids named in the audit's topic string — legacy audits predate
  //       the instrumentation field but always name the audited chg id there.
  // Failure-safe: if the reviews dir is unreadable, the set stays empty and
  // behavior degrades to pre-ISS-2986 re-fire (never suppresses a needed
  // audit by error).
  const auditedChgIds = new Set();
  try {
    const revDir = path.join(WORKSPACE, 'monitor/curmudgeon/reviews');
    for (const rf of fs.readdirSync(revDir)) {
      if (!/^REACTIVE-AUDIT-.*\.json$/.test(rf)) continue;
      let ra;
      try { ra = JSON.parse(fs.readFileSync(path.join(revDir, rf), 'utf8')); }
      catch (e) { continue; }
      const flagged = (ra.instrumentation && ra.instrumentation.dispatcher_flagged_files) || [];
      for (const p of flagged) {
        const base = String(p).split('/').pop().replace(/\.json$/, '');
        if (base) auditedChgIds.add(base);
      }
      const topicIds = String(ra.topic || '').match(/chg-\d{8}-\d{4}-\d{3}/g) || [];
      for (const id of topicIds) auditedChgIds.add(id);
    }
  } catch (e) { /* reviews dir unreadable — fall back to audited_at-only behavior */ }

  const cutoff = Date.now() - (7 * 24 * 3600 * 1000);
  for (const f of files) {
    let c;
    try { c = JSON.parse(fs.readFileSync(path.join(changesDir, f), 'utf8')); }
    catch (e) { continue; }
    if (c.audited_at) continue;
    const cl = c.classification;
    if (cl !== 'critical' && cl !== 'strategic') continue;
    const ct = c.detected_at || c.created_at;
    if (ct && Date.parse(ct) < cutoff) continue;
    if (auditedChgIds.has(f.replace(/\.json$/, ''))) { out.covered_by_reactive_audit_count++; continue; }
    if (cl === 'critical') out.unaudited_critical_count++;
    else out.unaudited_strategic_count++;
    if (out.files.length < 20) out.files.push('monitor/changes/' + f);
  }
  out.needed = (out.unaudited_critical_count + out.unaudited_strategic_count) > 0;
  stats.changes_scan_ms = Date.now() - t0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Step 4: Priority 3 — drift-audit hand-off summary.
// ───────────────────────────────────────────────────────────────────────

function resolvePriority3() {
  const t0 = Date.now();
  const da = readJSON('monitor/integrity/drift-audit.json');
  const out = {
    drift_audit_path: 'monitor/integrity/drift-audit.json',
    drift_audit_generated_at: null,
    drift_audit_age_hours: null,
    drift_audit_fresh: false,
    candidate_count: 0,
    head_candidate_id: null,
  };
  if (!da) { stats.drift_freshness_ms = Date.now() - t0; return out; }
  out.drift_audit_generated_at = da.generated_at || null;
  if (da.generated_at) {
    const ageH = (Date.now() - Date.parse(da.generated_at)) / 3600000;
    out.drift_audit_age_hours = +(ageH.toFixed(2));
    out.drift_audit_fresh = ageH < DRIFT_FRESH_H;
  }
  const candidates = Array.isArray(da.candidates) ? da.candidates : [];
  out.candidate_count = candidates.length;
  if (candidates.length > 0) {
    // drift-audit candidates use item_id (e.g. "WIN-014") — see compute-drift-audit.js.
    const c0 = candidates[0];
    out.head_candidate_id = c0.item_id || c0.id || c0.win_id || c0.target_id || null;
    out.head_candidate_already_in_priority_queue = !!c0.in_priority_queue;
  }
  stats.drift_freshness_ms = Date.now() - t0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Step 5: Priority 4 — holistic check rotation.
// ───────────────────────────────────────────────────────────────────────

function resolvePriority4() {
  const t0 = Date.now();
  const tr = readJSON('monitor/curmudgeon/tracker.json');
  const out = { pending_check_ids: [], next_check_id: null };
  if (!tr) { stats.holistic_scan_ms = Date.now() - t0; return out; }
  const checks = Array.isArray(tr.holistic_checks) ? tr.holistic_checks : [];
  const pending = checks.filter(c => c.status === 'pending');
  out.pending_check_ids = pending.map(c => c.id || c.check_id).filter(Boolean).sort();
  out.next_check_id = out.pending_check_ids[0] || null;
  stats.holistic_scan_ms = Date.now() - t0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Recommendation: sequential priority order 1 → 2 → audit → 3 → 4 → 5.
// ───────────────────────────────────────────────────────────────────────

function resolveRecommendation(p1, p2, audit, p3, p4) {
  if (p1.has_unreviewed) {
    return { recommended_priority: 1, recommendation_reason: 'queue has ' + p1.queue_total + ' item(s); head un-reviewed' };
  }
  if (p2.pending_count > 0) {
    return { recommended_priority: 2, recommendation_reason: p2.pending_count + ' pending human note(s)' };
  }
  if (audit.needed) {
    return { recommended_priority: 'audit', recommendation_reason: (audit.unaudited_critical_count + audit.unaudited_strategic_count) + ' unaudited critical/strategic change(s) within 7d' };
  }
  if (p3.candidate_count > 0 && p3.drift_audit_fresh) {
    return { recommended_priority: 3, recommendation_reason: p3.candidate_count + ' drift candidate(s); audit age ' + p3.drift_audit_age_hours + 'h' };
  }
  if (p4.pending_check_ids.length > 0) {
    return { recommended_priority: 4, recommendation_reason: p4.pending_check_ids.length + ' pending holistic check(s); next: ' + p4.next_check_id };
  }
  return { recommended_priority: 5, recommendation_reason: 'no work in 1-4; fall back to spot-check' };
}

// ───────────────────────────────────────────────────────────────────────
// Main.
// ───────────────────────────────────────────────────────────────────────

function main() {
  try {
    const p1 = resolvePriority1();
    const p2 = resolvePriority2();
    const audit = resolvePriorityAudit();
    const p3 = resolvePriority3();
    const p4 = resolvePriority4();
    const rec = resolveRecommendation(p1, p2, audit, p3, p4);

    stats.total_script_ms = Date.now() - tStart;

    const artifact = {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      generator: 'compute-curmudgeon-dispatcher-state.js',
      generator_run_id: RUN_ID,
      workspace: WORKSPACE,
      recommended_priority: rec.recommended_priority,
      recommendation_reason: rec.recommendation_reason,
      priority_1_queue: p1,
      priority_2_notes: p2,
      priority_0c2_major_change_audit: audit,
      priority_3_drift: p3,
      priority_4_holistic: p4,
      stats,
    };

    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n');
    } catch (e) {
      fail(2, 'output write failed: ' + e.message);
    }
    console.log('curmudgeon-dispatcher-state: ' + OUT);
    console.log('  recommended_priority=' + rec.recommended_priority + ' (' + rec.recommendation_reason + ')');
    console.log('  total_script_ms=' + stats.total_script_ms);
    process.exit(0);
  } catch (e) {
    console.error('internal error:', e && e.stack || e);
    process.exit(3);
  }
}

main();
