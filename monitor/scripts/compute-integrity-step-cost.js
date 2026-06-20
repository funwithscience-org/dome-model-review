#!/usr/bin/env node
/*
 * compute-integrity-step-cost.js (PROP-111 Phase 0, 2026-06-20)
 *
 * Per-step token attribution for integrity runs. Read-only transcript
 * analyzer; structural copy of compute-decider-step-cost.js with the
 * agent label changed. Buckets usage by STEP_MARKER stderr breadcrumbs
 * that integrity emits at each check.
 *
 * Mechanism A (per-check input/cache/output bucketing):
 *   Integrity emits `echo "STEP_MARKER <check-id> $(date +%s)" >&2` at
 *   the start of each Check section (check-1-internal-anchors,
 *   check-1b-relative-href, check-2-tab-structure, ..., check-9-build-
 *   reproducibility). The markers land in bash tool_result stderr and
 *   so are readable in the transcript. This analyzer aligns each
 *   assistant message's usage with the active check window (last marker
 *   seen before that message), then sums input / cache_read /
 *   cache_write / output per window.
 *
 * Mechanism B (context-source attribution):
 *   Quantify whether the growing conversation prefix comes from
 *   (a) static prompt prose, (b) accumulated tool_result output volume,
 *   or (c) Read-tool state-file loads. The script walks tool_result
 *   blocks > THRESHOLD_BYTES (default 2KB) and buckets by the originating
 *   tool name + a fingerprint of the first ~80 bytes of the command/path.
 *   The largest tool_result producers surface as the (b) drivers.
 *
 * Usage:
 *   node compute-integrity-step-cost.js <transcript.jsonl> [--threshold N]
 *
 * Output: JSON on stdout shaped:
 *   {
 *     run_meta: { transcript, model, msgs, total_cost_usd, duration_sec },
 *     per_step: [ { step, msgs, tokens: {...}, cost_usd: {...} }, ... ],
 *     unattributed: { msgs, tokens: {...}, cost_usd: {...} },
 *     tool_result_buckets: [ { bucket, count, total_bytes, sample }, ... ]
 *   }
 *
 * Discipline mirror with write-self-cost.sh: exits 0 on partial-data
 * failures (missing transcript field, etc.) with degraded output rather
 * than 1; only exits 1 on operational impossibility (file missing,
 * parse error on the input path).
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

function parseCli() {
  const argv = process.argv.slice(2);
  let transcript = null;
  let threshold = 2048;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold' && argv[i + 1]) { threshold = parseInt(argv[i + 1], 10); i++; }
    else if (a === '--help' || a === '-h') {
      console.error('usage: compute-integrity-step-cost.js <transcript.jsonl> [--threshold N]');
      process.exit(0);
    } else if (!transcript) { transcript = a; }
  }
  if (!transcript) {
    console.error('compute-integrity-step-cost: missing transcript path');
    console.error('usage: compute-integrity-step-cost.js <transcript.jsonl> [--threshold N]');
    process.exit(1);
  }
  return { transcript, threshold };
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

function extractToolResultContent(message) {
  if (!message || !Array.isArray(message.content)) return '';
  let out = '';
  for (const c of message.content) {
    if (c && c.type === 'tool_result') {
      if (typeof c.content === 'string') out += c.content;
      else if (Array.isArray(c.content)) {
        for (const cc of c.content) {
          if (cc && typeof cc.text === 'string') out += cc.text;
        }
      }
    }
  }
  return out;
}

function detectStepMarkers(text, lastStep) {
  // Returns last (newest) STEP_MARKER step name found in text, or lastStep.
  if (!text) return lastStep;
  let m, last = null;
  STEP_MARKER_RE.lastIndex = 0;
  while ((m = STEP_MARKER_RE.exec(text)) !== null) {
    last = m[1];
  }
  return last || lastStep;
}

function bucketKey(toolName, body) {
  if (!toolName) return 'unknown';
  const first = (body || '').trim().split(/\r?\n/)[0] || '';
  const fp = first.slice(0, 80);
  return `${toolName}: ${fp}`;
}

function main() {
  const { transcript, threshold } = parseCli();

  if (!fs.existsSync(transcript)) {
    console.error(`compute-integrity-step-cost: ${transcript} not found`);
    process.exit(1);
  }
  let lines;
  try {
    lines = fs.readFileSync(transcript, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch (e) {
    console.error(`compute-integrity-step-cost: failed to read ${transcript}: ${e.message}`);
    process.exit(1);
  }

  const perStep = new Map();   // step → bucket
  const unattributed = emptyBucket();
  let activeStep = null;
  let model = null;
  let firstTs = null, lastTs = null;

  // For tool-call fingerprinting we need to remember the tool call from
  // the prior assistant message (tool_use with name + input) and pair it
  // with the next user-role tool_result.
  let pendingToolCalls = new Map(); // tool_use_id → { name, body }
  const toolResultBuckets = new Map();

  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch (_) { continue; }
    if (o.timestamp) { if (!firstTs) firstTs = o.timestamp; lastTs = o.timestamp; }
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

    // USER message: extract tool_result content, scan for STEP_MARKER,
    // and size-bucket large results.
    if (msg.role === 'user') {
      if (!Array.isArray(msg.content)) continue;
      for (const c of msg.content) {
        if (!c || c.type !== 'tool_result') continue;
        let text = '';
        if (typeof c.content === 'string') text = c.content;
        else if (Array.isArray(c.content)) {
          for (const cc of c.content) if (cc && typeof cc.text === 'string') text += cc.text;
        }
        // Detect STEP_MARKER — newest wins (rare but ok).
        const newStep = detectStepMarkers(text, activeStep);
        if (newStep !== activeStep && newStep) activeStep = newStep;

        // Size-bucket if above threshold.
        const sz = Buffer.byteLength(text, 'utf8');
        if (sz >= threshold) {
          const pending = pendingToolCalls.get(c.tool_use_id) || { name: 'unknown', body: '' };
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

  // Build report.
  const perStepArr = [];
  let stepGrandTotalUsd = 0;
  for (const [step, b] of perStep.entries()) {
    const cost = costOf(model, b.tokens);
    stepGrandTotalUsd += cost.total_usd;
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

  const report = {
    schema: 'integrity-step-cost/1',
    generated_at: new Date().toISOString(),
    run_meta: {
      transcript: path.basename(transcript),
      model,
      msgs: allMsgs,
      total_cost_usd: totalCost.total_usd,
      duration_sec: dur != null ? +dur.toFixed(1) : null,
      first_ts: firstTs,
      last_ts: lastTs,
    },
    summary: {
      per_step_attribution_pct: allMsgs ? +(((allMsgs - unattributed.msgs) / allMsgs) * 100).toFixed(2) : 0,
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
