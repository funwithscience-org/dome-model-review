#!/usr/bin/env node
/**
 * compute-drift-audit.js — PROP-020
 *
 * Precompute the curmudgeon's Priority 3 change-detection candidate list.
 * Deterministic, no LLM calls, runs in <5 seconds. Replaces the in-prompt
 * scan that used to read all ~462 review files in-LLM each cycle.
 *
 * Inputs:
 *   - data/wins.json
 *   - data/sections.json (read for sha computation only in v1; sections not yet scored)
 *   - monitor/curmudgeon/reviews/*.json
 *   - monitor/curmudgeon/priority-queue.json (optional)
 *
 * Output:
 *   - monitor/integrity/drift-audit.json
 *
 * Rules implemented:
 *   - PROP-019 reduced-set fingerprint compare (common fields only).
 *     Schema additions are NOT a drift signal.
 *   - Drift magnitude tiebreak (commit 71be960): within bucket, larger drift first.
 *   - verdict_changed and new_item buckets are uncapped; large_rewrite + tldr_only
 *     capped at thresholds.top_n_cap (default 30).
 *
 * CLI:
 *   node monitor/scripts/compute-drift-audit.js [--workspace PATH] [--top-n N] [--drift-pct P] [--out PATH]
 *
 * Exit codes:
 *   0 = success
 *   1 = input data missing/unreadable (caller escalates Major)
 *   2 = output write failed (caller escalates Major)
 *   3 = internal error (caller escalates Major)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const flag = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const WORKSPACE = flag('--workspace', process.cwd());
const TOP_N = parseInt(flag('--top-n', '30'), 10);
const DRIFT_PCT = parseFloat(flag('--drift-pct', '20'));
const OUT_REL = flag('--out', 'monitor/integrity/drift-audit.json');
const OUT = path.isAbsolute(OUT_REL) ? OUT_REL : path.join(WORKSPACE, OUT_REL);

function sha256_12(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function lenOf(x) {
  return typeof x === 'string' ? x.length : 0;
}

function computeWinFingerprint(w) {
  return {
    claim_length: lenOf(w.claim),
    finding_length: lenOf(w.finding),
    detail_evidence_length: lenOf(w.detail_evidence),
    detail_verdict_length: lenOf(w.detail_verdict_text),
    tldr_evidence_length: lenOf(w.tldr_evidence),
    tldr_verdict_length: lenOf(w.tldr_verdict),
    verdict: w.verdict || ''
  };
}

function loadLatestReviews(reviewsDir) {
  const files = fs.readdirSync(reviewsDir).filter(f => f.endsWith('.json'));
  const latestByBase = new Map();
  for (const f of files) {
    // Match BASE.cN.json or BASE.json. Cycle defaults to 1 if absent.
    const m = f.match(/^(.+?)(?:\.c(\d+))?\.json$/);
    if (!m) continue;
    const base = m[1];
    const cycle = m[2] ? parseInt(m[2], 10) : 1;
    const cur = latestByBase.get(base);
    if (!cur || cycle > cur.cycle) {
      latestByBase.set(base, { file: f, cycle });
    }
  }
  return latestByBase;
}

function isCanonicalWinFingerprint(fp) {
  if (!fp || typeof fp !== 'object') return false;
  // Canonical = at minimum claim_length + detail_evidence_length present.
  // Reviews with bespoke fingerprint shapes (e.g., HOLISTIC reviews,
  // proposal reviews) are skipped.
  return ('claim_length' in fp) && ('detail_evidence_length' in fp);
}

function computeDrifts(currentFp, oldFp) {
  // PROP-019 reduced-set: only compute drift on fields present in BOTH.
  // Schema additions (field in current but not old) are NOT a drift signal.
  const drifts = {};
  for (const k of Object.keys(currentFp)) {
    if (k === 'verdict') continue;        // verdict handled separately
    if (!(k in oldFp)) continue;          // missing from old = skip
    const old = oldFp[k];
    if (typeof old !== 'number' || old === 0) continue;
    const cur = currentFp[k];
    drifts[k] = ((cur - old) / old) * 100;
  }
  return drifts;
}

function classify(currentFp, oldFp, drifts, hasReview) {
  if (!hasReview) return { bucket: 'new_item', verdictChanged: false };
  if (currentFp.verdict !== oldFp.verdict) {
    return { bucket: 'verdict_changed', verdictChanged: true };
  }
  const legacyFields = ['claim_length', 'finding_length', 'detail_evidence_length', 'detail_verdict_length'];
  const tldrFields = ['tldr_evidence_length', 'tldr_verdict_length'];
  let legacyMax = 0;
  let tldrMax = 0;
  for (const f of legacyFields) {
    if (Math.abs(drifts[f] || 0) > Math.abs(legacyMax)) legacyMax = drifts[f] || 0;
  }
  for (const f of tldrFields) {
    if (f in drifts && Math.abs(drifts[f] || 0) > Math.abs(tldrMax)) tldrMax = drifts[f] || 0;
  }
  if (Math.abs(legacyMax) > DRIFT_PCT) return { bucket: 'large_rewrite', verdictChanged: false };
  if (Math.abs(tldrMax) > DRIFT_PCT) return { bucket: 'tldr_only', verdictChanged: false };
  return { bucket: 'no_drift', verdictChanged: false };
}

function main() {
  // Inputs
  const winsPath = path.join(WORKSPACE, 'data/wins.json');
  const sectionsPath = path.join(WORKSPACE, 'data/sections.json');
  const reviewsDir = path.join(WORKSPACE, 'monitor/curmudgeon/reviews');
  const queuePath = path.join(WORKSPACE, 'monitor/curmudgeon/priority-queue.json');

  let wins, sectionsRaw, winsRaw;
  try {
    winsRaw = fs.readFileSync(winsPath, 'utf8');
    wins = JSON.parse(winsRaw);
    sectionsRaw = fs.readFileSync(sectionsPath, 'utf8');
    JSON.parse(sectionsRaw); // validate parse; not used in v1
  } catch (e) {
    console.error('compute-drift-audit: input read failed:', e.message);
    process.exit(1);
  }

  let latest;
  try {
    latest = loadLatestReviews(reviewsDir);
  } catch (e) {
    console.error('compute-drift-audit: reviews dir read failed:', e.message);
    process.exit(1);
  }

  // Priority queue cross-reference (best effort — missing file is not an error)
  const queueByTargetId = new Map();
  try {
    const pq = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const items = Array.isArray(pq) ? pq : (pq.queue || pq.items || []);
    for (const q of items) {
      const tid = q.target_id || q.targetId || q.win_id || q.item_id;
      const qid = q.queue_id || q.queueId || q.id;
      if (tid) queueByTargetId.set(tid, qid || null);
    }
  } catch (e) {
    // Optional file. Continue silently.
  }

  const candidates = [];
  let skippedBespoke = 0;
  let comparable = 0;
  let nonDrift = 0;
  let preTldrCount = 0;
  const stats = {
    verdict_changed_count: 0,
    new_item_count: 0,
    large_rewrite_count: 0,
    tldr_only_count: 0
  };

  for (const w of wins) {
    if (!w.id) continue;
    const item_id = 'WIN-' + w.id;
    const currentFp = computeWinFingerprint(w);
    const reviewMeta = latest.get(item_id);
    let oldFp = null;
    let lastReview = null;
    if (reviewMeta) {
      let reviewJson;
      try {
        reviewJson = JSON.parse(fs.readFileSync(path.join(reviewsDir, reviewMeta.file), 'utf8'));
      } catch (e) {
        console.error('compute-drift-audit: review parse failed for', reviewMeta.file, e.message);
        continue;
      }
      const fp = reviewJson.text_fingerprint;
      if (!isCanonicalWinFingerprint(fp)) {
        skippedBespoke++;
        continue;
      }
      oldFp = fp;
      lastReview = {
        file: reviewMeta.file,
        cycle: reviewMeta.cycle,
        reviewed_at: reviewJson.reviewed_at || null,
        fingerprint: fp
      };
      comparable++;
      if (!('tldr_evidence_length' in fp) && !('tldr_verdict_length' in fp)) {
        preTldrCount++;
      }
    }
    const drifts = oldFp ? computeDrifts(currentFp, oldFp) : {};
    const cls = classify(currentFp, oldFp || {}, drifts, !!oldFp);
    if (cls.bucket === 'no_drift') {
      nonDrift++;
      continue;
    }

    const driftedFields = Object.entries(drifts)
      .filter(([_, v]) => Math.abs(v) > DRIFT_PCT)
      .map(([k]) => k);
    const maxDrift = driftedFields.length
      ? Math.max(...driftedFields.map(f => Math.abs(drifts[f])))
      : null;
    const tiebreak = cls.bucket === 'verdict_changed'
      ? 1e7
      : cls.bucket === 'new_item'
      ? 1e6
      : (maxDrift || 0);

    candidates.push({
      item_id,
      item_type: 'win',
      current_fingerprint: currentFp,
      last_review: lastReview,
      drifts,
      max_drift_pct: maxDrift,
      drifted_fields: driftedFields,
      priority_bucket: cls.bucket,
      is_pre_tldr_schema: !!(oldFp && !('tldr_evidence_length' in oldFp)),
      verdict_changed: cls.verdictChanged,
      tiebreak_score: tiebreak,
      in_priority_queue: queueByTargetId.has(item_id),
      queue_id: queueByTargetId.get(item_id) || null
    });
    stats[cls.bucket + '_count']++;
  }

  // Sort: bucket priority, then tiebreak desc, then item_id alpha.
  const bucketOrder = { verdict_changed: 0, new_item: 1, large_rewrite: 2, tldr_only: 3 };
  candidates.sort((a, b) =>
    bucketOrder[a.priority_bucket] - bucketOrder[b.priority_bucket]
    || b.tiebreak_score - a.tiebreak_score
    || a.item_id.localeCompare(b.item_id)
  );

  // Cap large_rewrite + tldr_only at TOP_N total; verdict_changed + new_item uncapped.
  const uncapped = candidates.filter(c =>
    c.priority_bucket === 'verdict_changed' || c.priority_bucket === 'new_item'
  );
  const capped = candidates
    .filter(c => c.priority_bucket === 'large_rewrite' || c.priority_bucket === 'tldr_only')
    .slice(0, TOP_N);
  const final = [...uncapped, ...capped];

  const out = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generator_run_id: process.env.INTEGRITY_RUN_ID || ('compute-drift-audit-' + Date.now()),
    generator: 'compute-drift-audit.js',
    source_data_versions: {
      wins_sha: sha256_12(winsRaw),
      sections_sha: sha256_12(sectionsRaw)
    },
    thresholds: {
      drift_pct: DRIFT_PCT,
      top_n_cap: TOP_N,
      freshness_hours: 168
    },
    rules_applied: [
      'PROP-019 reduced-set fingerprint compare (common fields only)',
      'drift magnitude tiebreak (commit 71be960)',
      'verdict-change and new-item buckets included unconditionally (above the cap)',
      'drifting candidates ranked by max_drift_pct descending'
    ],
    candidates: final,
    stats: {
      total_items_audited: wins.length,
      items_with_comparable_fingerprint: comparable,
      items_skipped_no_comparable_fingerprint: skippedBespoke,
      non_drifting_count: nonDrift,
      pre_tldr_schema_count: preTldrCount,
      ...stats
    }
  };

  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('compute-drift-audit: output write failed:', e.message);
    process.exit(2);
  }

  console.log('drift-audit written:', OUT);
  console.log('  candidates:', final.length,
    '(verdict_changed:', stats.verdict_changed_count,
    '+ new:', stats.new_item_count,
    '+ large_rewrite:', Math.min(stats.large_rewrite_count, TOP_N),
    '+ tldr_only:', Math.min(stats.tldr_only_count, Math.max(0, TOP_N - stats.large_rewrite_count)),
    ')');
  console.log('  audited:', wins.length,
    '| comparable:', comparable,
    '| skipped (bespoke fp):', skippedBespoke,
    '| non-drifting:', nonDrift,
    '| pre-tldr schema:', preTldrCount);
}

try {
  main();
} catch (e) {
  console.error('compute-drift-audit failed:', e.message);
  console.error(e.stack);
  process.exit(3);
}
