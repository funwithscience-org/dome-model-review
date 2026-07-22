#!/usr/bin/env node
/*
 * compute-integrity-step-cost.js (PROP-104 Phase 0, 2026-06-17;
 * PROP-140 Phase 0 revision, 2026-07-22)
 *
 * Per-step token attribution for integrity runs. Structural copy of compute-decider-step-cost.js with agent label + SIGNATURES swapped. Read-only transcript
 * analyzer; mirrors compute-run-cost.js but buckets usage by step
 * windows derived from TWO mechanisms (PROP-140):
 *
 *   1. STEP_MARKER breadcrumbs (original PROP-104/PROP-112 mechanism):
 *      `echo "STEP_MARKER <step> $(date +%s)"` emitted by the agent at
 *      each dispatcher step. Markers take precedence when present.
 *   2. Signature-based inference (PROP-140 fallback, zero agent
 *      cooperation): distinctive step-entry commands (digest-reviews.js,
 *      allocate-iss-ids.js, build.js publish, ...) open/rename the
 *      active step window when NO marker has been seen in the current
 *      transcript segment. Restores attribution for model pins that
 *      drop the freestanding-echo discipline (Sonnet 5, 2026-07-05..).
 *
 * Multi-segment (PROP-140): accepts MULTIPLE transcript paths and
 * analyzes all of them ordered by first timestamp. Harness restarts /
 * rotations / subagents produce >1 .jsonl per run; the old single-path
 * head -1 discovery priced an arbitrary fragment.
 *
 * Mechanism B (context-source attribution) unchanged: tool_result
 * blocks > THRESHOLD_BYTES (default 2KB) bucket by originating tool
 * name + command fingerprint.
 *
 * Usage:
 *   node compute-integrity-step-cost.js <t1.jsonl> [t2.jsonl ...] [--threshold N]
 *
 * Output: JSON on stdout shaped:
 *   {
 *     run_meta: { transcript, model, msgs, total_cost_usd, duration_sec, ... },
 *     summary: { per_step_attribution_pct, attribution_mode, segments_analyzed, ... },
 *     per_step: [ { step, msgs, tokens: {...}, cost_usd: {...} }, ... ],
 *     unattributed: { msgs, tokens: {...}, cost_usd: {...} },
 *     tool_result_buckets_top20: [ ... ]
 *   }
 *
 * attribution_mode: 'marker' | 'signature-fallback' | 'mixed' | 'none'.
 *
 * Discipline mirror with write-self-cost.sh: exits 0 on partial-data
 * failures (missing transcript field, etc.) with degraded output rather
 * than 1; only exits 1 on operational impossibility (no readable input
 * file at all, parse error on the input path).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Pricing table — kept in sync with compute-run-cost.js. USD per MTok.
const PRICING = {
  'claude-opus-4-8':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-7':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-6':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-5':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-sonnet-4-6': { in: 3,  w5: 3.75, w1h: 6,  read: 0.30, out: 15 },
  'claude-sonnet-4-5': { in: 3,  w5: 3.75, w1h: 6,  read: 0.30, out: 15 },
  'claude-haiku-4-5':  { in: 1,  w5: 1.25, w1h: 2,  read: 0.10, out: 5 },
};
function priceFor(model) {
  if (!model) return PRICING['claude-opus-4-8'];
  if (PRICING[model]) return PRICING[model];
  if (/opus/.test(model))   return PRICING['claude-opus-4-8'];
  if (/sonnet/.test(model)) return PRICING['claude-sonnet-4-6'];
  if (/haiku/.test(model))  return PRICING['claude-haiku-4-5'];
  return PRICING['claude-opus-4-8'];
}

const STEP_MARKER_RE = /STEP_MARKER\s+(\S+)\s+(\d+)/g;

// PROP-140 signature table — integrity check-entry commands. A match on the
// tool_use command body (or tool_result text) opens/renames the active step
// window exactly like a STEP_MARKER, but ONLY while no marker has been seen
// in the current transcript segment (markers take precedence).
// EXTEND THIS TABLE when integrity checks change: each entry is
// [regex-on-command-or-result, step-name]. First match wins. Keep regexes
// anchored to distinctive filenames/args so ordinary prose can't match.
const SIGNATURES = [
  [/node test\.js/,                        'test-suite'],
  [/build\.js html/,                       'build-drift'],
  [/check-status-json-provenance\.js/,     '9d-provenance'],
  [/check-wayback\.js/,                    'wayback'],
  [/lint-exp-allocations\.js/,             'exp-invariant'],
  [/check-prune-resurrection\.js/,         'prune-resurrection'],
];

function parseCli() {
  const argv = process.argv.slice(2);
  const transcripts = [];
  let threshold = 2048;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold' && argv[i + 1]) { threshold = parseInt(argv[i + 1], 10); i++; }
    else if (a === '--help' || a === '-h') {
      console.error('usage: compute-integrity-step-cost.js <t1.jsonl> [t2.jsonl ...] [--threshold N]');
      process.exit(0);
    } else { transcripts.push(a); }
  }
  if (!transcripts.length) {
    console.error('compute-integrity-step-cost: missing transcript path');
    console.error('usage: compute-integrity-step-cost.js <t1.jsonl> [t2.jsonl ...] [--threshold N]');
    process.exit(1);
  }
  return { transcripts, threshold };
}

function emptyTokenBag() {
  return { input: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0 };
}

function emptyBucket() {
  return { msgs: 0, tokens: emptyTokenBag() };
}

function costOf(model, tok) {
  const p = priceFor(model);
  const c = {
    input_usd: tok.input * p.in / 1e6,
    output_usd: tok.output * p.out / 1e6,
    cache_write_5m_usd: tok.cache_write_5m * p.w5 / 1e6,
    cache_write_1h_usd: tok.cache_write_1h * p.w1h / 1e6,
    cache_read_usd: tok.cache_read * p.read / 1e6,
  };
  c.total_usd = c.input_usd + c.output_usd + c.cache_write_5m_usd + c.cache_write_1h_usd + c.cache_read_usd;
  for (const k of Object.keys(c)) c[k] = +c[k].toFixed(6);
  return c;
}

function detectStepMarkers(text) {
  // Returns last (newest) STEP_MARKER step name found in text, or null.
  if (!text) return null;
  let m, last = null;
  STEP_MARKER_RE.lastIndex = 0;
  while ((m = STEP_MARKER_RE.exec(text)) !== null) {
    last = m[1];
  }
  return last;
}

function detectSignature(text) {
  if (!text) return null;
  for (const [re, step] of SIGNATURES) {
    if (re.test(text)) return step;
  }
  return null;
}

function bucketKey(toolName, body) {
  if (!toolName) return 'unknown';
  const first = (body || '').trim().split(/\r?\n/)[0] || '';
  const fp = first.slice(0, 80);
  return `${toolName}: ${fp}`;
}

function segmentFirstTs(lines) {
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch (_) { continue; }
    if (o.timestamp) return o.timestamp;
  }
  return null;
}

function main() {
  const { transcripts, threshold } = parseCli();

  // Load all readable segments; order by first timestamp (nulls last).
  const segments = [];
  for (const t of transcripts) {
    if (!fs.existsSync(t)) {
      console.error(`compute-integrity-step-cost: ${t} not found; skipping`);
      continue;
    }
    let lines;
    try {
      lines = fs.readFileSync(t, 'utf8').split(/\r?\n/).filter(Boolean);
    } catch (e) {
      console.error(`compute-integrity-step-cost: failed to read ${t}: ${e.message}; skipping`);
      continue;
    }
    segments.push({ file: t, lines, firstTs: segmentFirstTs(lines) });
  }
  if (!segments.length) {
    console.error('compute-integrity-step-cost: no readable transcript among supplied paths');
    process.exit(1);
  }
  segments.sort((a, b) => {
    if (a.firstTs && b.firstTs) return a.firstTs.localeCompare(b.firstTs);
    if (a.firstTs) return -1;
    if (b.firstTs) return 1;
    return 0;
  });

  const perStep = new Map();   // step → bucket
  const unattributed = emptyBucket();
  let model = null;
  let firstTs = null, lastTs = null;
  let usedMarker = false, usedSignature = false;
  const toolResultBuckets = new Map();

  for (const seg of segments) {
    // Step windows and tool pairing do not survive a harness restart:
    // reset per segment. Accumulators (perStep, unattributed) are global.
    let activeStep = null;
    let markerSeenSegment = false;
    const pendingToolCalls = new Map(); // tool_use_id → { name, body }

    for (const line of seg.lines) {
      let o;
      try { o = JSON.parse(line); } catch (_) { continue; }
      if (o.timestamp) {
        if (!firstTs || o.timestamp < firstTs) firstTs = o.timestamp;
        if (!lastTs || o.timestamp > lastTs) lastTs = o.timestamp;
      }
      const msg = o.message;
      if (!msg) continue;
      if (msg.model) model = msg.model;

      // ASSISTANT message: bucket usage + collect tool_use calls.
      if (msg.role === 'assistant' || msg.type === 'assistant') {
        const u = msg.usage;
        if (u) {
          const tok = emptyTokenBag();
          tok.input          = u.input_tokens || 0;
          tok.output         = u.output_tokens || 0;
          tok.cache_read     = u.cache_read_input_tokens || 0;
          const cc = u.cache_creation;
          if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
            tok.cache_write_5m = cc.ephemeral_5m_input_tokens || 0;
            tok.cache_write_1h = cc.ephemeral_1h_input_tokens || 0;
          } else {
            tok.cache_write_5m = u.cache_creation_input_tokens || 0;
          }
          let bucket;
          if (activeStep) {
            if (!perStep.has(activeStep)) perStep.set(activeStep, emptyBucket());
            bucket = perStep.get(activeStep);
          } else {
            bucket = unattributed;
          }
          bucket.msgs++;
          for (const k of Object.keys(tok)) bucket.tokens[k] += tok[k];
        }
        // Stash any tool_use blocks for pairing with the next tool_result.
        if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c && c.type === 'tool_use' && c.id) {
              let body = '';
              if (c.input) {
                try {
                  if (typeof c.input === 'string') body = c.input;
                  else body = JSON.stringify(c.input).slice(0, 500);
                } catch (_) {}
              }
              pendingToolCalls.set(c.id, { name: c.name || 'unknown', body });
            }
          }
        }
        continue;
      }

      // USER message: extract tool_result content, derive step window
      // (marker first, signature fallback), size-bucket large results.
      if (msg.role === 'user') {
        if (!Array.isArray(msg.content)) continue;
        for (const c of msg.content) {
          if (!c || c.type !== 'tool_result') continue;
          let text = '';
          if (typeof c.content === 'string') text = c.content;
          else if (Array.isArray(c.content)) {
            for (const cc of c.content) if (cc && typeof cc.text === 'string') text += cc.text;
          }
          const pending = pendingToolCalls.get(c.tool_use_id) || { name: 'unknown', body: '' };

          // 1. Marker detection — markers always win and, once seen in a
          //    segment, disable signature inference for the rest of it
          //    (prevents signatures fighting a marker-established window).
          const markerStep = detectStepMarkers(text);
          if (markerStep) {
            if (markerStep !== activeStep) activeStep = markerStep;
            markerSeenSegment = true;
            usedMarker = true;
          } else if (!markerSeenSegment) {
            // 2. Signature fallback (PROP-140): test the originating
            //    command body plus the head of the result text.
            const sigStep = detectSignature(pending.body + '\n' + text.slice(0, 4000));
            if (sigStep && sigStep !== activeStep) {
              activeStep = sigStep;
              usedSignature = true;
            }
          }

          // Size-bucket if above threshold.
          const sz = Buffer.byteLength(text, 'utf8');
          if (sz >= threshold) {
            const key = bucketKey(pending.name, pending.body);
            if (!toolResultBuckets.has(key)) {
              toolResultBuckets.set(key, { bucket: key, count: 0, total_bytes: 0, sample: text.slice(0, 200) });
            }
            const b = toolResultBuckets.get(key);
            b.count++;
            b.total_bytes += sz;
          }
          if (c.tool_use_id) pendingToolCalls.delete(c.tool_use_id);
        }
      }
    }
  }

  // Build report.
  const perStepArr = [];
  for (const [step, b] of perStep.entries()) {
    const cost = costOf(model, b.tokens);
    perStepArr.push({ step, msgs: b.msgs, tokens: b.tokens, cost_usd: cost });
  }
  perStepArr.sort((a, b) => b.cost_usd.total_usd - a.cost_usd.total_usd);

  const unCost = costOf(model, unattributed.tokens);

  const bucketArr = [];
  for (const v of toolResultBuckets.values()) bucketArr.push(v);
  bucketArr.sort((a, b) => b.total_bytes - a.total_bytes);

  // Run meta.
  const allMsgs = perStepArr.reduce((s, x) => s + x.msgs, 0) + unattributed.msgs;
  const allTok = emptyTokenBag();
  for (const x of perStepArr) for (const k of Object.keys(allTok)) allTok[k] += x.tokens[k];
  for (const k of Object.keys(allTok)) allTok[k] += unattributed.tokens[k];
  const totalCost = costOf(model, allTok);
  const dur = (firstTs && lastTs) ? ((Date.parse(lastTs) - Date.parse(firstTs)) / 1000) : null;

  const attributionMode =
    usedMarker && usedSignature ? 'mixed' :
    usedMarker ? 'marker' :
    usedSignature ? 'signature-fallback' : 'none';

  const report = {
    schema: 'integrity-step-cost/2',
    generated_at: new Date().toISOString(),
    run_meta: {
      transcript: segments.length === 1
        ? path.basename(segments[0].file)
        : `${path.basename(segments[0].file)} (+${segments.length - 1} more)`,
      model,
      msgs: allMsgs,
      total_cost_usd: totalCost.total_usd,
      duration_sec: dur != null ? +dur.toFixed(1) : null,
      first_ts: firstTs,
      last_ts: lastTs,
    },
    summary: {
      per_step_attribution_pct: allMsgs ? +(((allMsgs - unattributed.msgs) / allMsgs) * 100).toFixed(2) : 0,
      attribution_mode: attributionMode,
      segments_analyzed: segments.length,
      unattributed_msgs: unattributed.msgs,
      steps_observed: perStepArr.length,
      tool_result_large_blocks: bucketArr.reduce((s, b) => s + b.count, 0),
      tool_result_large_total_kb: +(bucketArr.reduce((s, b) => s + b.total_bytes, 0) / 1024).toFixed(1),
    },
    per_step: perStepArr,
    unattributed: { msgs: unattributed.msgs, tokens: unattributed.tokens, cost_usd: unCost },
    tool_result_buckets_top20: bucketArr.slice(0, 20).map(b => ({
      bucket: b.bucket,
      count: b.count,
      total_kb: +(b.total_bytes / 1024).toFixed(1),
      sample_first_200_chars: b.sample,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main();
