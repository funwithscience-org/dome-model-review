#!/usr/bin/env node

/**
 * test.js — Automated test suite for the dome model critical review.
 *
 * Validates:
 *  1. wins.json schema integrity
 *  2. HTML output consistency with data
 *  3. Internal link/anchor resolution
 *  4. Build pipeline sanity checks
 *
 * Run: node test.js
 * Exit code 0 = all pass, 1 = failures
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WINS_PATH = path.join(ROOT, 'data', 'wins.json');
const HTML_PATH = path.join(ROOT, 'docs', 'index.html');
const SECTIONS_PATH = path.join(ROOT, 'data', 'sections.json');

// ── Test harness ──

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

function assertEq(actual, expected, name) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name} — expected ${expected}, got ${actual}`);
  }
}

// ════════════════════════════════════════════
// 1. wins.json schema validation
// ════════════════════════════════════════════

console.log('\n── 1. wins.json Schema ──');

const VALID_VERDICTS = [
  'Refuted by Data', 'Self-Contradicted', 'Std Model Explains',
  'Misleading', 'Not Demonstrated', 'Unfalsifiable'
];

const VALID_MONITORING = ['hardcoded', 'live_fetch', 'none'];

let wins;
try {
  const raw = fs.readFileSync(WINS_PATH, 'utf8');
  wins = JSON.parse(raw);
  assert(true, 'wins.json parses as valid JSON');
} catch (e) {
  assert(false, `wins.json parses as valid JSON: ${e.message}`);
  process.exit(1);
}

assert(Array.isArray(wins), 'wins.json is an array');
assert(wins.length === 67, `wins.json has 67 entries (got ${wins.length})`);

// Check sequential IDs
const ids = wins.map(w => w.id);
for (let i = 0; i < wins.length; i++) {
  const expected = String(i + 1).padStart(3, '0');
  assert(wins[i].id === expected, `WIN-${expected} has correct sequential ID`);
}

// Check no duplicate IDs
const uniqueIds = new Set(ids);
assertEq(uniqueIds.size, wins.length, 'No duplicate WIN IDs');

// Required fields for every WIN
const REQUIRED_FIELDS = [
  'id', 'claim', 'verdict', 'finding', 'new_in_v51',
  'detail_claim', 'detail_evidence', 'detail_verdict_text'
];

for (const win of wins) {
  for (const field of REQUIRED_FIELDS) {
    assert(win[field] !== undefined && win[field] !== null,
      `WIN-${win.id} has required field '${field}'`);
  }

  // Verdict is valid
  assert(VALID_VERDICTS.includes(win.verdict),
    `WIN-${win.id} verdict '${win.verdict}' is a valid category`);

  // new_in_v51 is boolean
  assert(typeof win.new_in_v51 === 'boolean',
    `WIN-${win.id} new_in_v51 is boolean`);

  // Claim and finding are non-empty strings
  assert(typeof win.claim === 'string' && win.claim.length > 0,
    `WIN-${win.id} claim is non-empty string`);
  assert(typeof win.finding === 'string' && win.finding.length > 0,
    `WIN-${win.id} finding is non-empty string`);

  // Detail fields are non-empty strings
  assert(typeof win.detail_claim === 'string' && win.detail_claim.length > 0,
    `WIN-${win.id} detail_claim is non-empty`);
  assert(typeof win.detail_evidence === 'string' && win.detail_evidence.length > 0,
    `WIN-${win.id} detail_evidence is non-empty`);
  assert(typeof win.detail_verdict_text === 'string' && win.detail_verdict_text.length > 0,
    `WIN-${win.id} detail_verdict_text is non-empty`);

  // code_analysis validation (if present)
  if (win.code_analysis) {
    const ca = win.code_analysis;
    assert(VALID_MONITORING.includes(ca.monitoring),
      `WIN-${win.id} code_analysis.monitoring '${ca.monitoring}' is valid`);
    assert(typeof ca.relabels_standard === 'boolean',
      `WIN-${win.id} code_analysis.relabels_standard is boolean`);
    assert(typeof ca.post_hoc === 'boolean',
      `WIN-${win.id} code_analysis.post_hoc is boolean`);
    assert(typeof ca.derives_from_dome === 'boolean',
      `WIN-${win.id} code_analysis.derives_from_dome is boolean`);
    assert(typeof ca.reviewed === 'boolean',
      `WIN-${win.id} code_analysis.reviewed is boolean`);
  }

  // detail_group is string or null
  assert(win.detail_group === null || typeof win.detail_group === 'string',
    `WIN-${win.id} detail_group is string or null`);
}

// DOI format validation in detail_evidence
const DOI_REGEX = /https?:\/\/doi\.org\/[^\s"<]+/g;
const HREF_REGEX = /href="([^"]+)"/g;

for (const win of wins) {
  const evidence = win.detail_evidence || '';
  // Check that any DOI links are well-formed
  const dois = evidence.match(DOI_REGEX) || [];
  for (const doi of dois) {
    assert(!doi.includes(' ') && doi.length > 20,
      `WIN-${win.id} DOI '${doi.slice(0, 50)}...' is well-formed`);
  }
}

// ════════════════════════════════════════════
// 2. HTML output consistency
// ════════════════════════════════════════════

console.log('\n── 2. HTML Output Consistency ──');

let html;
try {
  html = fs.readFileSync(HTML_PATH, 'utf8');
  assert(true, 'docs/index.html exists and is readable');
} catch (e) {
  assert(false, `docs/index.html exists: ${e.message}`);
  // Continue — some tests can still run
  html = '';
}

if (html) {
  // Verdict counts in HTML should match data
  const verdictTally = {};
  for (const win of wins) {
    verdictTally[win.verdict] = (verdictTally[win.verdict] || 0) + 1;
  }

  // Check that the HTML contains the correct total WIN count
  assert(html.includes(`${wins.length} prediction`),
    `HTML references ${wins.length} predictions`);

  // Check each verdict count appears somewhere in HTML
  // The counts appear in various formats: pie chart labels, legend text, table cells, prose
  for (const [verdict, count] of Object.entries(verdictTally)) {
    const patterns = [
      `${count} ${verdict}`,           // legend: "23 Misleading"
      `${verdict} (${count})`,          // prose: "Misleading (23)"
      `<strong>${count}</strong>`,      // bold count
      `>${count}<`,                     // table cell or SVG text
      `>${count} `,                     // SVG legend text
      `">${count}</tspan>`,             // SVG tspan
    ];
    const found = patterns.some(p => html.includes(p));
    assert(found, `HTML contains count ${count} for verdict '${verdict}'`);
  }

  // Check new_in_v51 count
  const newCount = wins.filter(w => w.new_in_v51).length;
  assert(html.includes(String(newCount)),
    `HTML contains new-in-V51 count (${newCount})`);

  // Every WIN should appear in the HTML (in the summary table at minimum)
  // Detail sections use id="winXXX" but not all WINs get individual anchors
  // So we check that the WIN's claim text appears somewhere in the output
  for (const win of wins) {
    // The claim text (HTML-escaped) should appear in the summary table
    const escapedClaim = win.claim
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;');
    assert(html.includes(win.claim) || html.includes(escapedClaim),
      `HTML contains WIN-${win.id} claim text`);
  }

  // Check code_analysis computed counts in HTML
  const reviewed = wins.filter(w => w.code_analysis && w.code_analysis.reviewed).length;
  const pending = wins.length - reviewed;
  if (reviewed > 0) {
    assert(html.includes(String(reviewed)),
      `HTML contains reviewed count (${reviewed})`);
  }

  // ════════════════════════════════════════════
  // 3. Internal link/anchor resolution
  // ════════════════════════════════════════════

  console.log('\n── 3. Internal Links ──');

  // Extract all id="" attributes
  const idRegex = /\bid="([^"]+)"/g;
  const definedIds = new Set();
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    definedIds.add(match[1]);
  }

  // Extract all href="#..." internal links
  const internalLinkRegex = /href="#([^"]+)"/g;
  const internalLinks = new Set();
  while ((match = internalLinkRegex.exec(html)) !== null) {
    internalLinks.add(match[1]);
  }

  for (const anchor of internalLinks) {
    assert(definedIds.has(anchor),
      `Internal link #${anchor} resolves to an existing id`);
  }

  // Check that onclick showTab targets exist
  const showTabRegex = /showTab\('([^']+)'\)/g;
  const tabTargets = new Set();
  while ((match = showTabRegex.exec(html)) !== null) {
    tabTargets.add(match[1]);
  }
  // showTab targets should map to tab-content div IDs
  // Tab content sections use: <div class="tab-content" id="tabname">
  const tabContentRegex = /class="tab-content[^"]*"\s+id="([^"]+)"/g;
  const definedTabs = new Set();
  while ((match = tabContentRegex.exec(html)) !== null) {
    definedTabs.add(match[1]);
  }
  for (const tab of tabTargets) {
    assert(definedTabs.has(tab),
      `showTab('${tab}') targets an existing tab-content id`);
  }

  // ════════════════════════════════════════════
  // 4. Build pipeline sanity
  // ════════════════════════════════════════════

  console.log('\n── 4. Build Pipeline ──');

  // HTML should be newer than (or same as) wins.json
  const htmlStat = fs.statSync(HTML_PATH);
  const winsStat = fs.statSync(WINS_PATH);
  assert(htmlStat.mtimeMs >= winsStat.mtimeMs - 1000,
    'HTML is not stale (modified after or with wins.json)');

  // HTML is valid-ish (has doctype, html, head, body)
  assert(html.includes('<!DOCTYPE html') || html.includes('<!doctype html'),
    'HTML has DOCTYPE');
  assert(html.includes('<html'), 'HTML has <html> tag');
  assert(html.includes('<head'), 'HTML has <head> tag');
  assert(html.includes('<body'), 'HTML has <body> tag');
  assert(html.includes('</html>'), 'HTML has closing </html>');

  // No hardcoded verdict counts in the wrong place
  // (We can't fully check this, but we can verify the build script exists)
  assert(fs.existsSync(path.join(ROOT, 'build-scripts', 'generate-html.js')),
    'generate-html.js exists');
  assert(fs.existsSync(path.join(ROOT, 'build.js')),
    'build.js exists');
}

// ════════════════════════════════════════════
// 5. Data file cross-references
// ════════════════════════════════════════════

console.log('\n── 5. Data Cross-References ──');

// Check detail_group references point to valid WINs
const winIds = new Set(wins.map(w => w.id));
for (const win of wins) {
  if (win.detail_group) {
    // Groups look like "WIN-045/046/049/050/051"
    const groupIds = win.detail_group.match(/\d{3}/g) || [];
    for (const gid of groupIds) {
      assert(winIds.has(gid),
        `WIN-${win.id} detail_group references valid WIN-${gid}`);
    }
  }
}

// sections.json validation (if it exists)
if (fs.existsSync(SECTIONS_PATH)) {
  console.log('\n── 6. sections.json ──');
  try {
    const sections = JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8'));
    assert(typeof sections === 'object' && !Array.isArray(sections),
      'sections.json is an object');

    // Each section should have required fields
    for (const [key, section] of Object.entries(sections)) {
      assert(typeof section.title === 'string' && section.title.length > 0,
        `Section '${key}' has a title`);
      assert(typeof section.html === 'string' && section.html.length > 0,
        `Section '${key}' has html content`);
      assert(typeof section.tab === 'string',
        `Section '${key}' has a tab assignment`);
    }
  } catch (e) {
    assert(false, `sections.json is valid JSON: ${e.message}`);
  }
}

// ════════════════════════════════════════════
// Results
// ════════════════════════════════════════════

console.log(`\n${'═'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(`\n  Failures:`);
  for (const f of failures) {
    console.log(`    • ${f}`);
  }
}
console.log(`${'═'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
