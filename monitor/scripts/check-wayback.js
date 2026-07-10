#!/usr/bin/env node
/**
 * check-wayback.js — PROP-128 / DIRECTIVE-20260709-002
 *
 * Read-only Wayback Machine presence verification for the operator-curated
 * MONITORED_URLS list. For each URL in the config:
 *   - GET https://archive.org/wayback/available?url=<url> (public, no auth)
 *   - compute: archived (bool), closest snapshot URL, timestamp, age_days
 * Compare to previous state in wayback-state.json (if present) and emit:
 *   - REMOVAL alert if prev.archived===true && cur.archived===false
 *   - STALE alert if newest snapshot age > staleness_threshold_days
 *   - UNKNOWN entry if API unreachable/timeout/non-JSON — logged, NEVER alarmed,
 *     previous state retained for that URL.
 *
 * Writes new wayback-state.json (full per-URL state + run timestamp).
 * Prints JSON summary to stdout for the caller (social.md daily run).
 * Exit code: ALWAYS 0. Alert presence is in the JSON, not the exit code —
 * social's run must not die on an alert (PROP-128 verification_pattern).
 *
 * Constraints (per DIRECTIVE-20260709-002 Part C, operator veto):
 *   - NEVER calls https://web.archive.org/save/ from this script.
 *   - Read-only availability API only.
 *
 * Usage:
 *   node monitor/scripts/check-wayback.js \
 *     --config monitor/social/wayback-monitored-urls.json \
 *     --state  monitor/social/wayback-state.json
 *
 * Env:
 *   WAYBACK_API_BASE — override the API base (default https://archive.org)
 *                      for fixture testing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
  const out = { config: null, state: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && i + 1 < argv.length) { out.config = argv[++i]; continue; }
    if (argv[i] === '--state'  && i + 1 < argv.length) { out.state  = argv[++i]; continue; }
  }
  if (!out.config) { console.error('missing --config'); process.exit(2); }
  if (!out.state)  { console.error('missing --state');  process.exit(2); }
  return out;
}

function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      port: u.port || 443,
      headers: { 'User-Agent': 'funwithscience-dome-model-review/check-wayback.js (PROP-128)' }
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('non-JSON response (' + res.statusCode + '): ' + body.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout after ' + timeoutMs + 'ms')); });
    req.end();
  });
}

function ageDays(ts) {
  // ts format: YYYYMMDDHHMMSS
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(ts || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return (Date.now() - d.getTime()) / (86400 * 1000);
}

async function checkOne(url, apiBase) {
  try {
    const j = await fetchJson(apiBase + '/wayback/available?url=' + encodeURIComponent(url), 10000);
    const c = j && j.archived_snapshots && j.archived_snapshots.closest;
    if (!c || !c.available) return { url, archived: false };
    const age = ageDays(c.timestamp);
    return {
      url,
      archived: true,
      snapshot_url: c.url,
      snapshot_ts: c.timestamp,
      age_days: age == null ? null : Math.round(age * 10) / 10
    };
  } catch (e) {
    return { url, status: 'UNKNOWN', error: String(e.message || e).slice(0, 120) };
  }
}

function loadJsonOrDefault(fp, defaultVal) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return defaultVal; }
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadJsonOrDefault(args.config, null);
  if (!cfg || !Array.isArray(cfg.urls)) {
    console.error('config missing or malformed at ' + args.config);
    process.exit(2);
  }
  const staleness = cfg.staleness_threshold_days || 90;
  const apiBase = process.env.WAYBACK_API_BASE || 'https://archive.org';

  const prev = loadJsonOrDefault(args.state, { per_url: {} });
  const prevMap = prev.per_url || {};

  const results = [];
  for (const url of cfg.urls) {
    const r = await checkOne(url, apiBase);
    results.push(r);
    // Sequential 500ms spacing to be polite
    await new Promise(res => setTimeout(res, 500));
  }

  // Merge with previous state for UNKNOWN entries (carry forward)
  const perUrl = {};
  for (const r of results) {
    if (r.status === 'UNKNOWN') {
      const p = prevMap[r.url];
      if (p) perUrl[r.url] = { ...p, last_check_status: 'UNKNOWN', last_check_error: r.error, last_check_ts: new Date().toISOString() };
      else perUrl[r.url] = { ...r, last_check_ts: new Date().toISOString() };
    } else {
      perUrl[r.url] = { ...r, last_check_ts: new Date().toISOString() };
    }
  }

  // Detect alerts
  const removal_alerts = [];
  const staleness_alerts = [];
  const unknown = [];
  for (const r of results) {
    if (r.status === 'UNKNOWN') { unknown.push({ url: r.url, error: r.error }); continue; }
    const p = prevMap[r.url];
    if (p && p.archived === true && r.archived === false) {
      removal_alerts.push({ url: r.url, last_known_snapshot_ts: p.snapshot_ts, last_known_snapshot_url: p.snapshot_url });
    }
    if (r.archived && r.age_days != null && r.age_days > staleness) {
      staleness_alerts.push({ url: r.url, snapshot_ts: r.snapshot_ts, age_days: r.age_days, snapshot_url: r.snapshot_url });
    }
  }

  const archivedAges = results.filter(r => r.archived === true && typeof r.age_days === 'number').map(r => r.age_days);
  const summary = {
    ran_at: new Date().toISOString(),
    api_base: apiBase,
    monitored_url_count: cfg.urls.length,
    all_archived: results.every(r => r.archived === true),
    oldest_snapshot_age_days: archivedAges.length ? Math.max(...archivedAges) : null,
    newest_snapshot_age_days: archivedAges.length ? Math.min(...archivedAges) : null,
    removal_alerts,
    staleness_alerts,
    unknown
  };

  // Write state file
  const newState = { ran_at: summary.ran_at, staleness_threshold_days: staleness, per_url: perUrl };
  fs.mkdirSync(path.dirname(args.state), { recursive: true });
  fs.writeFileSync(args.state, JSON.stringify(newState, null, 2) + '\n');

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  // Fail-safe: never die on unexpected error — emit a minimal UNKNOWN summary
  console.log(JSON.stringify({
    ran_at: new Date().toISOString(),
    monitored_url_count: 0,
    all_archived: false,
    error: 'check-wayback internal error (fail-safe): ' + String(e.message || e).slice(0, 200),
    removal_alerts: [],
    staleness_alerts: [],
    unknown: []
  }, null, 2));
  process.exit(0);
});
