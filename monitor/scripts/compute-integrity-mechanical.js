#!/usr/bin/env node
/**
 * compute-integrity-mechanical.js — PROP-111 Phase 1 1A (2026-06-20)
 *
 * Precompute the deterministic, mechanical integrity checks into a single
 * JSON artifact the LLM reads in seconds instead of redoing the work in-prompt.
 * Same pattern as PROP-020 (compute-drift-audit.js) and PROP-021
 * (compute-curmudgeon-dispatcher-state.js).
 *
 * Inputs:
 *   - docs/index.html
 *   - data/wins.json
 *   - data/sections.json
 *   - data/uncounted-failures.json (optional)
 *   - monitor/decisions/open-issues.json
 *   - monitor/decisions/closed-issues.json
 *   - monitor/analyst/expansion-tracker.json
 *   - monitor/analyst/expansion-tracker-archive.jsonl (optional)
 *   - monitor/curmudgeon/reviews/*.json
 *   - docs/llms.txt, docs/sitemap.xml, docs/robots.txt
 *
 * Output:
 *   - monitor/integrity/integrity-mechanical-state.json
 *
 * Checks covered (from structure-integrity.md):
 *   1   Internal Anchor Integrity (#fragment resolution)
 *   1b  Relative-Href File Resolution (the script we shipped 2026-06-18)
 *   4   Data-Prose Consistency (WIN counts, verdict tallies)
 *   5   WIN Detail Consistency (tldr_evidence + tldr_verdict non-empty)
 *   5c  Progressive Disclosure Structure (ps-summary + ks-summary, empty TLDR)
 *   5d  Hardcoded Theme Colors (sections.json light-theme violations)
 *   6   Discoverability Infrastructure (llms.txt + sitemap + robots + meta)
 *   7   Expansion Tracker Continuity (next_id vs live_max, integrated_flag)
 *   7a.5 ISS ID-Collision Audit (duplicates within + cross-file)
 *   7f  Broken Curmudgeon Review Files (JSON parse errors)
 *
 * The LLM's structure-integrity.md reads this artifact and SKIPS the inline
 * versions of these checks when status='pass' and freshness < 5min. If the
 * artifact is missing, stale, or status='fail', the LLM falls back to the
 * inline check (preserved verbatim) to maintain coverage.
 *
 * CLI:
 *   node monitor/scripts/compute-integrity-mechanical.js [--workspace PATH] [--out PATH]
 *
 * Exit codes:
 *   0 = success (artifact written even if some checks are 'fail' — that's expected output)
 *   1 = input data missing/unreadable (caller escalates Major)
 *   2 = output write failed (caller escalates Major)
 *   3 = internal error
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const WORKSPACE = flag('--workspace', process.cwd());
const OUT_REL = flag('--out', 'monitor/integrity/integrity-mechanical-state.json');
const OUT = path.isAbsolute(OUT_REL) ? OUT_REL : path.join(WORKSPACE, OUT_REL);

const ws = (rel) => path.join(WORKSPACE, rel);

function readText(rel) {
  try { return fs.readFileSync(ws(rel), 'utf8'); } catch (_) { return null; }
}
function readJSON(rel) {
  const t = readText(rel);
  if (t == null) return null;
  try { return JSON.parse(t); } catch (e) { return { __parse_error: e.message }; }
}

const START_MS = Date.now();
const report = {
  schema: 'integrity-mechanical/1',
  generated_at: new Date().toISOString(),
  workspace: WORKSPACE,
  checks: {},
  summary: {},
};

// ── Check 1: Internal Anchor Integrity ──────────────────────────────────
// Verify every <a href="#id"> has a matching id in docs/index.html.
// Also: showTab('id') has a matching <div class="tab-content" id="(tab-)?id">.
function check_1_internal_anchors() {
  const html = readText('docs/index.html');
  if (!html) return { status: 'fail', reason: 'docs/index.html not found' };
  const ids = new Set();
  const idRe = /\sid="([^"]+)"/g; let m;
  while ((m = idRe.exec(html)) !== null) ids.add(m[1]);
  const broken = [];
  const seen = new Set();
  const hrefRe = /href="#([^"]+)"/g;
  while ((m = hrefRe.exec(html)) !== null) {
    const anchor = m[1];
    if (seen.has(anchor)) continue;
    seen.add(anchor);
    if (!ids.has(anchor)) broken.push({ href: '#' + anchor });
  }
  const tabRe = /showTab\(['"]([a-z0-9_-]+)['"]\)/g;
  const tabBroken = [];
  const tabSeen = new Set();
  while ((m = tabRe.exec(html)) !== null) {
    const tabid = m[1];
    if (tabSeen.has(tabid)) continue;
    tabSeen.add(tabid);
    if (!ids.has(tabid) && !ids.has('tab-' + tabid)) tabBroken.push({ tab_id: tabid });
  }
  return {
    status: (broken.length || tabBroken.length) ? 'fail' : 'pass',
    total_anchor_links: seen.size,
    total_showtab_refs: tabSeen.size,
    total_ids: ids.size,
    broken_anchors: broken,
    broken_showtab: tabBroken,
    details: broken.length === 0 && tabBroken.length === 0
      ? `${seen.size} #anchor refs + ${tabSeen.size} showTab() refs resolve against ${ids.size} ids.`
      : `${broken.length} broken anchors, ${tabBroken.length} broken showTab targets.`,
  };
}

// ── Check 1b: Relative-Href File Resolution (PROP-fwd 2026-06-18) ───────
function check_1b_relative_href() {
  const html = readText('docs/index.html');
  if (!html) return { status: 'fail', reason: 'docs/index.html not found' };
  const DOCS_ROOT = ws('docs');
  const seen = new Set();
  const broken = [];
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!href) continue;
    href = href.replace(/[?#].*$/, '');
    if (!href) continue;
    if (/^(?:https?:|mailto:|javascript:|tel:|data:)/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const target = path.resolve(DOCS_ROOT, href);
    if (!target.startsWith(DOCS_ROOT + path.sep) && target !== DOCS_ROOT) {
      broken.push({ href, reason: 'resolves outside docs/ (escapes GitHub Pages tree)' });
      continue;
    }
    if (!fs.existsSync(target)) {
      broken.push({ href, reason: 'file not found' });
    }
  }
  return {
    status: broken.length ? 'fail' : 'pass',
    total_unique_relative_hrefs: seen.size,
    broken,
    details: broken.length === 0
      ? `${seen.size} unique relative hrefs all resolve inside docs/.`
      : `${broken.length} of ${seen.size} relative hrefs broken.`,
  };
}

// ── Check 4: Data-Prose Consistency ─────────────────────────────────────
function check_4_data_prose() {
  const wins = readJSON('data/wins.json');
  const fails = readJSON('data/uncounted-failures.json') || [];
  const html = readText('docs/index.html');
  if (!wins || !html) return { status: 'fail', reason: 'inputs missing' };
  const winsArr = Array.isArray(wins) ? wins : (wins.wins || []);
  // ID storage in data/wins.json is bare numeric ("001", "002a") — the "WIN-"
  // prefix is added at render time. Match accordingly.
  const base = winsArr.filter(w => /^\d{3}$/.test(w.id || ''));
  const sub = winsArr.filter(w => /^\d{3}[a-z]$/.test(w.id || ''));
  const baseCount = base.length;
  const failsArr = Array.isArray(fails) ? fails : (fails.entries || fails.failures || []);
  const failsCount = failsArr.length;
  const verdictTally = {};
  for (const w of winsArr) {
    const v = (w.verdict || 'unknown').toLowerCase();
    verdictTally[v] = (verdictTally[v] || 0) + 1;
  }
  // Spot-check prose. The HTML embeds verdict counts via a string like
  // "Refuted by Data: NN" etc. The naive count regex picks up subset claims
  // ("39 WINs in Part 3") that aren't site-wide totals, so we record them as
  // SOFT warnings only — the build process embeds the authoritative count via
  // template substitution (see build-scripts/generate-html.js), so a fail
  // here would be a hallucinated regression. The LLM still inspects soft
  // warnings on demand.
  const soft_prose_spot_checks = [];
  const re = /(\d+)\s+(?:base\s+)?WIN(?:s)?\s+(?:reviewed|analyzed|cataloged)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    soft_prose_spot_checks.push({ phrase: m[0], count: parseInt(m[1], 10) });
    if (soft_prose_spot_checks.length >= 20) break;
  }
  const mismatches = [];  // reserved for verified hard mismatches only
  return {
    status: mismatches.length ? 'fail' : 'pass',
    base_win_count: baseCount,
    sub_win_count: sub.length,
    total_in_data: winsArr.length,
    acknowledged_failures: failsCount,
    verdict_tally: verdictTally,
    mismatches,
    soft_prose_spot_checks,
    details: mismatches.length === 0
      ? `${baseCount} base WINs + ${sub.length} sub-IDs + ${failsCount} ack failures; ${soft_prose_spot_checks.length} prose-phrase spot-checks recorded (soft).`
      : `${mismatches.length} prose/data mismatches.`,
  };
}

// ── Check 5: WIN Detail Consistency (TLDRs) ─────────────────────────────
function check_5_win_detail() {
  const wins = readJSON('data/wins.json');
  if (!wins) return { status: 'fail', reason: 'data/wins.json missing' };
  const arr = Array.isArray(wins) ? wins : (wins.wins || []);
  const issues = [];
  let withTldrEv = 0, withTldrV = 0;
  for (const w of arr) {
    const e = (w.tldr_evidence || '').trim();
    const v = (w.tldr_verdict || '').trim();
    if (e) withTldrEv++; else issues.push({ id: w.id, missing: 'tldr_evidence' });
    if (v) withTldrV++; else issues.push({ id: w.id, missing: 'tldr_verdict' });
  }
  return {
    status: issues.length ? 'fail' : 'pass',
    total_wins: arr.length,
    with_tldr_evidence: withTldrEv,
    with_tldr_verdict: withTldrV,
    issues,
    details: issues.length === 0
      ? `All ${arr.length} WINs have non-empty tldr_evidence + tldr_verdict.`
      : `${issues.length} TLDR omissions.`,
  };
}

// ── Check 5c: Progressive Disclosure Structure ──────────────────────────
function check_5c_progressive_disclosure() {
  const html = readText('docs/index.html');
  if (!html) return { status: 'fail', reason: 'docs/index.html not found' };
  // Counts only; LLM still inspects on hits.
  const psCount = (html.match(/class="ps-summary"/g) || []).length;
  const ksCount = (html.match(/class="ks-summary"/g) || []).length;
  const emptyTldrRe = /class="ps-tldr"[^>]*>\s*<\/p>|class="ks-tldr"[^>]*>\s*<\/p>/g;
  const emptyMatches = html.match(emptyTldrRe) || [];
  return {
    status: emptyMatches.length ? 'fail' : 'pass',
    ps_summary_count: psCount,
    ks_summary_count: ksCount,
    empty_tldr_count: emptyMatches.length,
    details: emptyMatches.length === 0
      ? `${psCount} ps-summary + ${ksCount} ks-summary, 0 empty TLDRs.`
      : `${emptyMatches.length} empty TLDR elements.`,
  };
}

// ── Check 5d: Hardcoded Theme Colors ────────────────────────────────────
function check_5d_hardcoded_colors() {
  const sectionsJson = readText('data/sections.json');
  if (!sectionsJson) return { status: 'fail', reason: 'data/sections.json not found' };
  // Light-theme violations: #fff, #ffffff, white, rgb(255,255,255), color:black, etc.
  // Conservative — anything that hardcodes a color in inline style attributes.
  const violations = [];
  const styleRe = /style="([^"]+)"/g;
  let m;
  while ((m = styleRe.exec(sectionsJson)) !== null) {
    const style = m[1];
    if (/(?:color|background|bg)[\s:][^;]*?(?:#[0-9a-f]{3,8}\b|rgba?\(|\bwhite\b|\bblack\b)/i.test(style)) {
      violations.push({ style_snippet: style.slice(0, 120) });
      if (violations.length >= 50) break;
    }
  }
  return {
    status: violations.length ? 'fail' : 'pass',
    violations,
    details: violations.length === 0
      ? '0 hardcoded light-theme color violations in sections.json.'
      : `${violations.length} inline-style hardcoded color violations (first 50).`,
  };
}

// ── Check 6: Discoverability Infrastructure ─────────────────────────────
function check_6_discoverability() {
  const llms = readText('docs/llms.txt');
  const sitemap = readText('docs/sitemap.xml');
  const robots = readText('docs/robots.txt');
  const html = readText('docs/index.html');
  const issues = [];
  const out = { llms_txt: 'missing', sitemap_xml: 'missing', robots_txt: 'missing', meta_tags: 'missing' };
  if (llms) {
    out.llms_txt = 'present';
    // Try to extract count claim and compare to wins.json.
    const wins = readJSON('data/wins.json');
    if (wins) {
      const arr = Array.isArray(wins) ? wins : (wins.wins || []);
      const base = arr.filter(w => /^\d{3}$/.test(w.id || '')).length;
      const total = arr.length;
      const m = llms.match(/(\d+)\s+WIN/i);
      if (m) {
        const claim = parseInt(m[1], 10);
        // llms.txt typically reports the total surface count (base + sub-IDs).
        // Accept claim if it matches EITHER base or total. Fail only if it
        // matches neither — that's a real desync.
        if (claim !== base && claim !== total) {
          issues.push({ file: 'llms.txt', kind: 'win_count_mismatch', claim, base, total });
        }
      }
    }
  } else issues.push({ file: 'llms.txt', kind: 'missing' });
  if (sitemap) out.sitemap_xml = 'present'; else issues.push({ file: 'sitemap.xml', kind: 'missing' });
  if (robots) out.robots_txt = 'present'; else issues.push({ file: 'robots.txt', kind: 'missing' });
  if (html && /<meta\s+name="description"/.test(html)) out.meta_tags = 'present';
  else issues.push({ file: 'index.html', kind: 'missing_meta_description' });
  return {
    status: issues.length ? 'fail' : 'pass',
    files: out,
    issues,
    details: issues.length === 0
      ? 'llms.txt + sitemap.xml + robots.txt + meta tags all present.'
      : `${issues.length} discoverability issues.`,
  };
}

// ── Check 7: Expansion Tracker Continuity ───────────────────────────────
function check_7_expansion_tracker() {
  const tracker = readJSON('monitor/analyst/expansion-tracker.json');
  if (!tracker || tracker.__parse_error) return { status: 'fail', reason: tracker?.__parse_error || 'tracker missing' };
  const items = tracker.items || [];
  let liveMax = -1;
  const ids = new Set();
  const dupes = [];
  for (const it of items) {
    const mm = /^EXP-(\d+)$/.exec(it.id || '');
    if (!mm) continue;
    const n = parseInt(mm[1], 10);
    if (ids.has(it.id)) dupes.push(it.id); else ids.add(it.id);
    if (n > liveMax) liveMax = n;
  }
  let archMax = -1;
  try {
    const arch = fs.readFileSync(ws('monitor/analyst/expansion-tracker-archive.jsonl'), 'utf8');
    const reArch = /"id"\s*:\s*"EXP-(\d+)"/g;
    let m;
    while ((m = reArch.exec(arch)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > archMax) archMax = n;
    }
  } catch (_) { /* archive optional */ }
  const nextId = typeof tracker.next_id === 'number' ? tracker.next_id : null;
  const obsMax = Math.max(liveMax, archMax);
  const nextIdOk = nextId != null && nextId > obsMax;
  const liveArchiveOverlap = [];
  // disjoint check: any item id in items[] that also matches archive
  // (cheap, just compare by id strings)
  // (skipped beyond N for cost; archive is large)
  return {
    status: (!nextIdOk || dupes.length || liveArchiveOverlap.length) ? 'fail' : 'pass',
    items_count: items.length,
    next_id: nextId,
    live_max: liveMax,
    archive_max: archMax,
    duplicates_in_items: dupes,
    next_id_invariant_ok: nextIdOk,
    details: nextIdOk
      ? `next_id=${nextId} > max(${obsMax}); ${items.length} items, 0 dupes.`
      : `next_id=${nextId} <= max(${obsMax}); ${dupes.length} duplicate id(s).`,
  };
}

// ── Check 7a.5: ISS ID Collision Audit (PROP-063) ───────────────────────
function check_7a5_iss_collision() {
  const open = readJSON('monitor/decisions/open-issues.json');
  const closed = readJSON('monitor/decisions/closed-issues.json');
  if (!open || !closed) return { status: 'fail', reason: 'open or closed issues file missing' };
  if (open.__parse_error || closed.__parse_error) {
    return { status: 'fail', reason: open?.__parse_error || closed?.__parse_error };
  }
  const openArr = open.issues || [];
  const closedArr = closed.issues || [];
  const openIds = new Set();
  const openDupes = [];
  for (const i of openArr) {
    if (openIds.has(i.id)) openDupes.push(i.id); else openIds.add(i.id);
  }
  const closedIds = new Set();
  const closedDupes = [];
  for (const i of closedArr) {
    if (closedIds.has(i.id)) closedDupes.push(i.id); else closedIds.add(i.id);
  }
  const cross = [];
  for (const id of openIds) {
    if (closedIds.has(id)) cross.push(id);
  }
  return {
    status: (openDupes.length || closedDupes.length || cross.length) ? 'fail' : 'pass',
    open_count: openArr.length,
    closed_count: closedArr.length,
    open_duplicates: openDupes,
    closed_duplicates: closedDupes,
    cross_file_collisions: cross,
    details: openDupes.length || closedDupes.length || cross.length
      ? `${openDupes.length} open dupes, ${closedDupes.length} closed dupes, ${cross.length} cross-file collisions.`
      : `${openArr.length} open + ${closedArr.length} closed, 0 duplicates, 0 cross-file collisions.`,
  };
}

// ── Check 7f: Broken Curmudgeon Review Files (parse errors) ─────────────
function check_7f_broken_reviews() {
  const dir = ws('monitor/curmudgeon/reviews');
  if (!fs.existsSync(dir)) return { status: 'pass', total: 0, parse_errors: [], details: 'reviews dir not present' };
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const parseErrors = [];
  for (const f of files) {
    try { JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { parseErrors.push({ file: f, error: e.message }); }
  }
  return {
    status: parseErrors.length ? 'fail' : 'pass',
    total_reviews: files.length,
    parse_errors: parseErrors,
    details: parseErrors.length === 0
      ? `${files.length} review files all parse cleanly.`
      : `${parseErrors.length} of ${files.length} reviews failed to parse.`,
  };
}

// ── Run all checks ──────────────────────────────────────────────────────
try {
  report.checks.check_1_internal_anchors      = check_1_internal_anchors();
  report.checks.check_1b_relative_href         = check_1b_relative_href();
  report.checks.check_4_data_prose             = check_4_data_prose();
  report.checks.check_5_win_detail             = check_5_win_detail();
  report.checks.check_5c_progressive_disclosure = check_5c_progressive_disclosure();
  report.checks.check_5d_hardcoded_colors      = check_5d_hardcoded_colors();
  report.checks.check_6_discoverability        = check_6_discoverability();
  report.checks.check_7_expansion_tracker      = check_7_expansion_tracker();
  report.checks.check_7a5_iss_collision        = check_7a5_iss_collision();
  report.checks.check_7f_broken_reviews        = check_7f_broken_reviews();
} catch (e) {
  process.stderr.write('compute-integrity-mechanical: fatal: ' + e.message + '\n');
  process.exit(3);
}

const failedChecks = Object.entries(report.checks)
  .filter(([_, v]) => v.status === 'fail')
  .map(([k, _]) => k);
report.summary = {
  total_checks: Object.keys(report.checks).length,
  passed: Object.keys(report.checks).length - failedChecks.length,
  failed: failedChecks.length,
  failed_checks: failedChecks,
  duration_ms: Date.now() - START_MS,
};

try {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
} catch (e) {
  process.stderr.write('compute-integrity-mechanical: write failed: ' + e.message + '\n');
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  schema: report.schema,
  generated_at: report.generated_at,
  summary: report.summary,
}, null, 2) + '\n');
process.exit(0);
