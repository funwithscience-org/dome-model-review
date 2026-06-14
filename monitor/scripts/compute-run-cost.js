#!/usr/bin/env node
/*
 * compute-run-cost.js  (PROP-101, 2026-06-14)
 * Compute actual USD cost + token usage for a Claude run from its session
 * JSONL transcript, OR from a pre-extracted usage object.
 *
 * WHY: tinker Mode 3 historically measured only static prompt line-counts
 * (a coarse proxy for cost). This helper computes the real number from
 * usage.{input_tokens,output_tokens,cache_creation_input_tokens,
 * cache_read_input_tokens} present on every assistant message.
 *
 * Cache pricing is NOT optional: a typical Opus pipeline run reads millions
 * of cache_read tokens (priced 0.1x base) and writes hundreds of thousands of
 * cache_creation tokens (priced 1.25x for 5m, 2x for 1h). Ignoring the cache
 * columns mis-states cost by 3-5x. This helper prices every column.
 *
 * Pricing source: docs.claude.com/en/docs/about-claude/pricing (fetched
 * 2026-06-14). All figures USD per million tokens (MTok). Update PRICING when
 * Anthropic changes rates. inference_geo / fast-mode / batch modifiers are NOT
 * applied (pipeline uses global standard rates); see comments to extend.
 *
 * Usage:
 *   node compute-run-cost.js <transcript.jsonl>          # one run
 *   node compute-run-cost.js --json '<usage-obj>' --model claude-opus-4-8
 *   node compute-run-cost.js --dir <projects-dir>        # all *.jsonl under dir
 * Output: JSON to stdout.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// USD per MTok. [baseInput, cacheWrite5m, cacheWrite1h, cacheRead, output]
const PRICING = {
  'claude-opus-4-8':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-7':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-6':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-opus-4-5':   { in: 5,  w5: 6.25, w1h: 10, read: 0.50, out: 25 },
  'claude-sonnet-4-6': { in: 3,  w5: 3.75, w1h: 6,  read: 0.30, out: 15 },
  'claude-sonnet-4-5': { in: 3,  w5: 3.75, w1h: 6,  read: 0.30, out: 15 },
  'claude-haiku-4-5':  { in: 1,  w5: 1.25, w1h: 2,  read: 0.10, out: 5 },
};
// Fallback by family substring if exact id absent (forward-compat for new minors).
function priceFor(model) {
  if (!model) return PRICING['claude-opus-4-8']; // conservative default = most expensive Opus tier
  if (PRICING[model]) return PRICING[model];
  if (/opus/.test(model))   return PRICING['claude-opus-4-8'];
  if (/sonnet/.test(model)) return PRICING['claude-sonnet-4-6'];
  if (/haiku/.test(model))  return PRICING['claude-haiku-4-5'];
  return PRICING['claude-opus-4-8'];
}

// Aggregate usage from a transcript's assistant messages.
function aggregateTranscript(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const agg = { input: 0, output: 0, cw5: 0, cw1h: 0, cwFlat: 0, read: 0, msgs: 0 };
  let model = null;
  let firstTs = null, lastTs = null;
  for (const l of lines) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.timestamp) { if (!firstTs) firstTs = o.timestamp; lastTs = o.timestamp; }
    const m = o.message; if (!m) continue;
    const u = m.usage; if (!u) continue;
    agg.msgs++;
    if (m.model) model = m.model;
    agg.input  += u.input_tokens || 0;
    agg.output += u.output_tokens || 0;
    agg.read   += u.cache_read_input_tokens || 0;
    // Prefer the nested 5m/1h breakdown for accurate cache-write pricing.
    const cc = u.cache_creation;
    if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
      agg.cw5  += cc.ephemeral_5m_input_tokens || 0;
      agg.cw1h += cc.ephemeral_1h_input_tokens || 0;
    } else {
      agg.cwFlat += u.cache_creation_input_tokens || 0; // unknown split -> price as 5m (conservative-low)
    }
  }
  return { model, agg, firstTs, lastTs };
}

function cost(model, agg) {
  const p = priceFor(model);
  const c = {
    input_usd:        agg.input  * p.in   / 1e6,
    output_usd:       agg.output * p.out  / 1e6,
    cache_write_5m_usd:  (agg.cw5 + agg.cwFlat) * p.w5 / 1e6, // flat treated as 5m
    cache_write_1h_usd:  agg.cw1h * p.w1h / 1e6,
    cache_read_usd:   agg.read   * p.read / 1e6,
  };
  c.total_usd = +(c.input_usd + c.output_usd + c.cache_write_5m_usd + c.cache_write_1h_usd + c.cache_read_usd).toFixed(6);
  for (const k of Object.keys(c)) c[k] = +c[k].toFixed(6);
  return c;
}

function durationSec(firstTs, lastTs) {
  if (!firstTs || !lastTs) return null;
  const d = (Date.parse(lastTs) - Date.parse(firstTs)) / 1000;
  return isFinite(d) && d >= 0 ? +d.toFixed(1) : null;
}

function reportOne(jsonlPath) {
  const { model, agg, firstTs, lastTs } = aggregateTranscript(jsonlPath);
  return {
    transcript: path.basename(jsonlPath),
    model,
    assistant_msgs: agg.msgs,
    tokens: {
      input: agg.input, output: agg.output,
      cache_write_5m: agg.cw5 + agg.cwFlat, cache_write_1h: agg.cw1h,
      cache_read: agg.read,
    },
    cost_usd: cost(model, agg),
    transcript_duration_sec: durationSec(firstTs, lastTs), // wall-clock proxy (Q2 option a)
    first_ts: firstTs, last_ts: lastTs,
  };
}

// ---- CLI ----
const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }

if (arg('--json')) {
  const u = JSON.parse(arg('--json'));
  const model = arg('--model') || 'claude-opus-4-8';
  const agg = {
    input: u.input_tokens || 0, output: u.output_tokens || 0,
    cw5: (u.cache_creation && u.cache_creation.ephemeral_5m_input_tokens) || 0,
    cw1h: (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0,
    cwFlat: (u.cache_creation ? 0 : (u.cache_creation_input_tokens || 0)),
    read: u.cache_read_input_tokens || 0, msgs: 1,
  };
  console.log(JSON.stringify({ model, cost_usd: cost(model, agg) }, null, 2));
} else if (arg('--dir')) {
  const dir = arg('--dir');
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (f.endsWith('.jsonl')) files.push(p); } })(dir);
  const out = files.map(reportOne);
  out.sort((a, b) => (b.cost_usd.total_usd) - (a.cost_usd.total_usd));
  console.log(JSON.stringify({ runs: out, grand_total_usd: +out.reduce((s, r) => s + r.cost_usd.total_usd, 0).toFixed(4) }, null, 2));
} else if (argv[0]) {
  console.log(JSON.stringify(reportOne(argv[0]), null, 2));
} else {
  console.error('usage: compute-run-cost.js <transcript.jsonl> | --dir <d> | --json <usage> [--model <id>]');
  process.exit(1);
}
