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
assert(wins.length >= 67, `wins.json has at least 67 entries (got ${wins.length})`);

// Check IDs: sequential 001–067 required, plus optional sub-IDs (e.g., "058b")
// for dome-site numbering collisions where one WIN number maps to two different claims
const ids = wins.map(w => w.id);
const baseIds = ids.filter(id => /^\d{3}$/.test(id));
const subIds = ids.filter(id => /^\d{3}[a-z]$/.test(id));
for (let i = 0; i < 67; i++) {
  const expected = String(i + 1).padStart(3, '0');
  assert(baseIds.includes(expected), `WIN-${expected} exists in wins.json`);
}
subIds.forEach(id => {
  const base = id.slice(0, 3);
  assert(baseIds.includes(base), `Sub-ID WIN-${id} has a matching base WIN-${base}`);
});

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
  // Use base WIN count (3-digit IDs only) — sub-IDs (e.g., "058b") are tracking entries
  // for dome numbering collisions, not additional dome claims
  const baseWinCount = wins.filter(w => /^\d{3}$/.test(w.id)).length;
  assert(html.includes(`${baseWinCount} prediction`),
    `HTML references ${baseWinCount} predictions`);

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
  // Tab content sections use: <div class="ds-tab-content" id="tabname">
  const tabContentRegex = /class="ds-tab-content[^"]*"\s+id="([^"]+)"/g;
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
  console.log('\n── 6. sections.json Schema ──');
  try {
    const sections = JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8'));
    assert(typeof sections === 'object' && !Array.isArray(sections),
      'sections.json is an object');

    // Expected sections (all must be present)
    const EXPECTED_SECTIONS = [
      'part1', 'part1b', 'part2', 'part2b', 'part3', 'part4',
      'part5', 'part6', 'part7', 'part8', 'part9', 'part10'
    ];

    const VALID_TABS = [
      'overview', 'evaluate', 'model', 'wins', 'pages', 'killshots',
      'predictions', 'falsify', 'selftest', 'ai', 'refs'
    ];

    // _meta is optional but skip it in section checks
    const sectionKeys = Object.keys(sections).filter(k => k !== '_meta');

    for (const expected of EXPECTED_SECTIONS) {
      assert(sectionKeys.includes(expected),
        `sections.json contains expected section '${expected}'`);
    }

    // Each section should have required fields and valid values
    for (const key of sectionKeys) {
      const section = sections[key];

      assert(typeof section.title === 'string' && section.title.length > 0,
        `Section '${key}' has a non-empty title`);
      assert(typeof section.html === 'string' && section.html.length > 0,
        `Section '${key}' has non-empty html content`);
      assert(typeof section.tab === 'string' && VALID_TABS.includes(section.tab),
        `Section '${key}' tab '${section.tab}' is a valid tab ID`);
      assert(typeof section.id === 'string' && section.id === key,
        `Section '${key}' id matches its key`);

      // Minimum content length sanity check (catch truncated extractions)
      assert(section.html.length > 100,
        `Section '${key}' has substantial content (${section.html.length} chars, min 100)`);

      // Placeholder tokens should be well-formed (no broken/partial tokens)
      const brokenPlaceholders = section.html.match(/\{\{[^}]*$/gm) || [];
      assert(brokenPlaceholders.length === 0,
        `Section '${key}' has no broken placeholder tokens`);

      // All placeholder tokens should match the expected pattern
      const placeholders = section.html.match(/\{\{[A-Z_]+\}\}/g) || [];
      for (const ph of placeholders) {
        assert(/^\{\{[A-Z][A-Z0-9_]+\}\}$/.test(ph),
          `Section '${key}' placeholder '${ph}' is well-formed`);
      }

      // No raw template literal interpolations should remain
      const rawInterps = section.html.match(/\$\{[^}]+\}/g) || [];
      assert(rawInterps.length === 0,
        `Section '${key}' has no raw \${...} interpolations (found ${rawInterps.length}: ${rawInterps.slice(0,3).join(', ')})`);

      // HTML should not contain script tags (those belong in the generator, not the data)
      const scriptTags = section.html.match(/<script[\s>]/gi) || [];
      assert(scriptTags.length === 0,
        `Section '${key}' has no <script> tags (scripts belong in generator)`);
    }
  } catch (e) {
    assert(false, `sections.json is valid JSON: ${e.message}`);
  }
}

// ════════════════════════════════════════════
// 7. Prose content integrity (structural checks independent of sections.json)
// ════════════════════════════════════════════

if (html) {
  console.log('\n── 7. Prose Content Integrity ──');

  // Every expected Part heading should appear in the HTML
  const EXPECTED_PARTS = [
    { id: 'part1', pattern: 'Part 1' },
    { id: 'part1b', pattern: 'Part 1b' },
    { id: 'part2', pattern: 'Part 2' },
    { id: 'part2b', pattern: 'Part 2b' },
    { id: 'part3', pattern: 'Part 3' },
    { id: 'part4', pattern: 'Part 4' },
    { id: 'part5', pattern: 'Part 5' },
    { id: 'part6', pattern: 'Part 6' },
    { id: 'part7', pattern: 'Part 7' },
    { id: 'part8', pattern: 'Part 8' },
    { id: 'part9', pattern: 'Part 9' },
    { id: 'part10', pattern: 'Part 10' },
  ];

  for (const part of EXPECTED_PARTS) {
    assert(html.includes(`id="${part.id}"`),
      `HTML contains heading with id="${part.id}"`);
    assert(html.includes(part.pattern),
      `HTML contains "${part.pattern}" text`);
  }

  // Re-extract tab IDs for this scope
  const tabContentRegex2 = /class="ds-tab-content[^"]*"\s+id="([^"]+)"/g;
  const definedTabs2 = new Set();
  let m2;
  while ((m2 = tabContentRegex2.exec(html)) !== null) {
    definedTabs2.add(m2[1]);
  }

  // Each tab-content div should have non-trivial content
  for (const tab of definedTabs2) {
    const tabRegex = new RegExp(`id="${tab}"[^>]*>([\\s\\S]*?)(?=<div[^>]*class="ds-tab-content"|$)`);
    const tabMatch = html.match(tabRegex);
    if (tabMatch) {
      // Strip HTML tags to get text content length
      const textContent = tabMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      assert(textContent.length > 50,
        `Tab '${tab}' has substantial text content (${textContent.length} chars)`);
    }
  }

  // Key scientific phrases that MUST appear in the HTML (canary content)
  // If any of these disappear, prose was likely truncated or dropped
  const CANARY_PHRASES = [
    'Schumann resonance',           // Part 1 / WIN-002
    'H(r)',                         // firmament height function (Part 2)
    'monitor.py',                   // code analysis (Part 2b)
    'inject_ai_layer',              // AI steering (Part 8)
    'falsification',                 // methodology (Part 7)
    'kill-shot',                    // Part 5 kill shots
    '95.2%',                        // accuracy claim discussion
    'aetheric',                     // dome model terminology
    'self-contradict',              // key verdict category discussion
  ];

  for (const phrase of CANARY_PHRASES) {
    const found = html.toLowerCase().includes(phrase.toLowerCase());
    assert(found, `HTML contains canary phrase "${phrase}" (content integrity check)`);
  }

  // No unresolved placeholder tokens should appear in final HTML
  const unresolvedPlaceholders = html.match(/\{\{[A-Z_]+\}\}/g) || [];
  assert(unresolvedPlaceholders.length === 0,
    `HTML has no unresolved {{PLACEHOLDER}} tokens (found ${unresolvedPlaceholders.length}: ${unresolvedPlaceholders.slice(0,5).join(', ')})`);

  // No raw template literal syntax should appear in final HTML
  // (would indicate a build error where interpolation wasn't resolved)
  const rawTemplateLeaks = html.match(/\$\{(?:counts|wins|tally|total|newInV51)/g) || [];
  assert(rawTemplateLeaks.length === 0,
    `HTML has no leaked template literals (found ${rawTemplateLeaks.length}: ${rawTemplateLeaks.slice(0,3).join(', ')})`);
}

// ════════════════════════════════════════════
// Uncounted Failures Validation
// ════════════════════════════════════════════

{
  const failuresPath = path.join(__dirname, 'data', 'uncounted-failures.json');
  if (fs.existsSync(failuresPath)) {
    const failures_data = JSON.parse(fs.readFileSync(failuresPath, 'utf8'));
    assert(Array.isArray(failures_data.entries), 'uncounted-failures.json has entries array');
    assert(typeof failures_data.dome_claimed_failures === 'number', 'dome_claimed_failures is a number');
    assert(typeof failures_data.dome_claimed_accuracy === 'string', 'dome_claimed_accuracy is a string');

    const failIds = new Set();
    for (const entry of failures_data.entries) {
      assert(typeof entry.id === 'string' && /^FAIL-\d{3}$/.test(entry.id),
        `Failure ${entry.id} has valid FAIL-NNN format`);
      assert(!failIds.has(entry.id), `No duplicate failure ID: ${entry.id}`);
      failIds.add(entry.id);
      assert(typeof entry.dome_ref === 'string' && entry.dome_ref.length > 0,
        `${entry.id} has dome_ref`);
      assert(typeof entry.summary === 'string' && entry.summary.length > 0,
        `${entry.id} has summary`);
      assert(typeof entry.prediction === 'string' && entry.prediction.length > 0,
        `${entry.id} has prediction`);
      assert(typeof entry.outcome === 'string' && entry.outcome.length > 0,
        `${entry.id} has outcome`);
      assert(typeof entry.dome_label === 'string' && entry.dome_label.length > 0,
        `${entry.id} has dome_label`);
      assert(typeof entry.what_actually_happened === 'string' && entry.what_actually_happened.length > 0,
        `${entry.id} has what_actually_happened`);
      if (entry.related_wins) {
        assert(Array.isArray(entry.related_wins), `${entry.id} related_wins is array`);
      }
    }

    // Check that HTML contains resolved uncounted failures count (not placeholder)
    if (html) {
      assert(!html.includes('{{ACKNOWLEDGED_FAILURES}}'),
        'HTML has no unresolved {{ACKNOWLEDGED_FAILURES}} placeholder');
      assert(!html.includes('{{DOME_CLAIMED_ACCURACY}}'),
        'HTML has no unresolved {{DOME_CLAIMED_ACCURACY}} placeholder');
    }
  }
}

// ════════════════════════════════════════════
// Section 6: predictions.json schema validation
// ════════════════════════════════════════════

{
  const predictionsPath = path.join(__dirname, 'data', 'predictions.json');
  if (fs.existsSync(predictionsPath)) {
    const pred_data = JSON.parse(fs.readFileSync(predictionsPath, 'utf8'));
    assert(Array.isArray(pred_data.entries), 'predictions.json has entries array');
    assert(pred_data._meta && typeof pred_data._meta === 'object', 'predictions.json has _meta');
    assert(Array.isArray(pred_data.categories), 'predictions.json has categories array');

    const validAuthorStatuses = ['pending', 'confirmed', 'falsified', 'expired', 'withdrawn', 'unresolved', 'refined', 'suspended', 'logging', 'promoted', 'dome_silent'];
    const validOurVerdicts = ['pending', 'confirmed', 'falsified', 'expired', 'withdrawn', 'recycled', 'standard_physics', 'unfalsifiable', 'silent_ignore', null];
    const validEntryTypes = ['prediction', 'tracking', 'data_watch', 'manual_test', 'prospective'];
    const validTestability = ['testable', 'partially_testable', 'untestable', null];
    const validDerivation = ['dome_geometry', 'standard_physics', 'unfalsifiable', 'mixed', null];
    const predIds = new Set();

    for (const entry of pred_data.entries) {
      assert(typeof entry.id === 'string' && entry.id.length > 0,
        `Prediction entry has valid id: ${entry.id}`);
      assert(!predIds.has(entry.id), `No duplicate prediction ID: ${entry.id}`);
      predIds.add(entry.id);
      assert(typeof entry.claim === 'string' && entry.claim.length > 0,
        `${entry.id} has claim`);
      assert(validEntryTypes.includes(entry.entry_type),
        `${entry.id} entry_type '${entry.entry_type}' is valid`);
      assert(validAuthorStatuses.includes(entry.author_status),
        `${entry.id} author_status '${entry.author_status}' is valid`);
      if (entry.our_verdict !== null && entry.our_verdict !== undefined) {
        assert(validOurVerdicts.includes(entry.our_verdict),
          `${entry.id} our_verdict '${entry.our_verdict}' is valid`);
      }
      assert(typeof entry.prospective === 'boolean',
        `${entry.id} has boolean prospective flag`);
      if (entry.testability !== undefined && entry.testability !== null) {
        assert(validTestability.includes(entry.testability),
          `${entry.id} testability '${entry.testability}' is valid`);
      }
      if (entry.derivation !== undefined && entry.derivation !== null) {
        assert(validDerivation.includes(entry.derivation),
          `${entry.id} derivation '${entry.derivation}' is valid`);
      }
      if (entry.category) {
        const catIds = pred_data.categories.map(c => c.id);
        assert(catIds.includes(entry.category),
          `${entry.id} category '${entry.category}' exists in categories list`);
      }
      if (entry.test_window) {
        assert(typeof entry.test_window === 'object' || typeof entry.test_window === 'string',
          `${entry.id} test_window is object or string`);
      }
      if (entry.related_wins) {
        assert(Array.isArray(entry.related_wins),
          `${entry.id} related_wins is array`);
      }
    }

    // Check that HTML has no unresolved prediction placeholders
    if (html) {
      assert(!html.includes('{{PRED_TOTAL}}'),
        'HTML has no unresolved {{PRED_TOTAL}} placeholder');
      assert(!html.includes('{{PRED_PROSPECTIVE}}'),
        'HTML has no unresolved {{PRED_PROSPECTIVE}} placeholder');
      assert(!html.includes('{{PRED_TESTABLE}}'),
        'HTML has no unresolved {{PRED_TESTABLE}} placeholder');
    }
  }
}

// ── 8. Prediction Panels ──

console.log('\n── 8. Prediction Panels ──');

{
  const PREDICTIONS_PATH = path.join(ROOT, 'data', 'predictions.json');
  if (fs.existsSync(PREDICTIONS_PATH) && fs.existsSync(HTML_PATH)) {
    const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_PATH, 'utf8'));
    const html = fs.readFileSync(HTML_PATH, 'utf8');

    const reviewable = predictions.entries.filter(e =>
      e.entry_type === 'prediction' || e.entry_type === 'tracking'
    );
    const tombstone = reviewable.filter(e => e.is_genuinely_prospective === true);
    const mined = reviewable.filter(e => e.is_genuinely_prospective !== true);

    // Section headers exist
    assert(html.includes('id="pred-tombstone"'), 'Predictions tab has tombstone section header');
    assert(html.includes('id="pred-mined"'), 'Predictions tab has mined section header');

    // Every reviewable prediction has an anchor
    for (const pred of reviewable) {
      const anchorId = 'pred-' + pred.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      assert(html.includes(`id="${anchorId}"`), `Prediction ${pred.id} has an anchor in HTML`);
    }

    // Tombstone count matches
    const tombstoneAnchors = tombstone.map(e =>
      'pred-' + e.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    );
    for (const a of tombstoneAnchors) {
      assert(html.includes(`id="${a}"`), `Tombstone prediction anchor ${a} exists`);
    }

    // Predictions with detail_reasoning have verdict tags
    const withReasoning = reviewable.filter(e => e.detail_reasoning);
    assert(withReasoning.length > 0, 'At least one prediction has detail_reasoning');

    // Restates links resolve to valid WIN anchors
    const restatesEntries = reviewable.filter(e => e.restates_win);
    for (const pred of restatesEntries) {
      const rawWin = String(pred.restates_win).replace(/^WIN-/i, '');
      const winId = rawWin.padStart(3, '0');
      assert(html.includes(`id="win${winId}"`), `Restates link from ${pred.id} → WIN-${winId} resolves`);
    }

    // Operational section exists if data_watch/manual_test entries present
    const operational = predictions.entries.filter(e =>
      e.entry_type === 'data_watch' || e.entry_type === 'manual_test'
    );
    if (operational.length > 0) {
      assert(html.includes('id="pred-operational"'), 'Predictions tab has operational section');
    }

    // No malformed WIN links (regression test for WIN-WIN-NNN bug)
    const malformedWinLinks = html.match(/winWIN-/g);
    assert(!malformedWinLinks, 'No malformed winWIN- anchor references in HTML');

    console.log(`  Checked ${reviewable.length} prediction panels (${tombstone.length} tombstone, ${mined.length} mined, ${operational.length} operational)`);
  }
}

// ── 9. Phase A Design Refresh (EXP-207 Typography) ──
{
  console.log('\n── 9. Phase A Design Refresh ──');
  const htmlContent = fs.readFileSync('docs/index.html', 'utf8');
  const sectionsContent = fs.readFileSync('data/sections.json', 'utf8');

  // EXP-207: No inline font-family:monospace literals in generated HTML
  assertEq((htmlContent.match(/font-family:\s*monospace/g) || []).length, 0,
    'docs/index.html still contains inline font-family:monospace literal(s)');

  // EXP-207: No inline font-family:monospace literals in sections data
  assertEq((sectionsContent.match(/font-family:\s*monospace/g) || []).length, 0,
    'data/sections.json still contains inline font-family:monospace literal(s)');

  // EXP-207: Body rule consumes --serif
  assert(/body\{font-family:var\(--serif\)/.test(htmlContent), 'body font-family is not var(--serif)');

  // EXP-207: .formula class present and routes to --mono
  assert(/\.formula\s*\{[^}]*font-family:var\(--mono\)/.test(htmlContent), '.formula class missing or not mapped to var(--mono)');

  // EXP-208: Stance statement present in HTML
  assert(htmlContent.includes('class="ds-stance-statement"'), 'EXP-208: .ds-stance-statement element missing from docs/index.html');
  assert(htmlContent.includes('The world is a globe.'), 'EXP-208: stance-statement text "The world is a globe." missing');
  assert(htmlContent.includes('That does not prevent us from engaging'), 'EXP-208: stance-statement continuation text missing');
  assert(/\.ds-stance-statement\{/.test(htmlContent), 'EXP-208: .ds-stance-statement CSS rule missing');

  // EXP-209: Verdict bar chart section present
  assert(htmlContent.includes('class="ds-verdict-bars"'), 'EXP-209: .ds-verdict-bars section missing from docs/index.html');
  assert(htmlContent.includes('class="ds-verdict-bar-row"'), 'EXP-209: .ds-verdict-bar-row elements missing');
  assert(/\.ds-verdict-bars\{/.test(htmlContent), 'EXP-209: .ds-verdict-bars CSS rule missing');
  assert(htmlContent.includes('id="verdicts"'), 'EXP-209: verdict-distribution anchor #verdicts missing');
  assert(!htmlContent.includes('class="ds-sc-breakdown"'), 'EXP-209: old .ds-sc-breakdown grid still present (should be removed)');

  // EXP-212: Latest Findings placement (between verdict-legend and nav.ds-toc)
  {
    const overviewSlice = htmlContent.split('class="ds-tab-content" id="evaluate"')[0] || htmlContent;
    const vlPos = overviewSlice.indexOf('class="ds-verdict-legend"');
    const bnPos = overviewSlice.indexOf('class="ds-breaking-news"');
    const tocPos = overviewSlice.indexOf('class="ds-toc"');
    assert(vlPos > -1 && bnPos > -1 && tocPos > -1, 'EXP-212: verdict-legend, breaking-news, or nav.ds-toc missing from Overview');
    assert(vlPos < bnPos && bnPos < tocPos, 'EXP-212: breaking-news must appear between verdict-legend and nav.ds-toc on Overview');
  }
  // EXP-212: breaking-news has 3 bn-item entries
  const bnMatch = htmlContent.match(/<div class="ds-breaking-news">[\s\S]*?<\/div>\s*\n\s*<\/div>/);
  if (bnMatch) {
    const bnItems = (bnMatch[0].match(/<div class="ds-bn-item">/g) || []).length;
    assertEq(bnItems, 3, 'EXP-212: breaking-news must retain exactly 3 bn-item entries');
    assert(bnMatch[0].includes('#ts-april-2026-update'), 'EXP-212: bn-item #1 timestamp-tab link preserved');
    assert(bnMatch[0].includes('#section-1-8'), 'EXP-212: bn-item #2 refraction section link preserved');
    assert(bnMatch[0].includes('#pred-mined'), 'EXP-212: bn-item #3 predictions catalog link preserved');
  }
  // EXP-212: chrome weight reduced (1px border, no gradient, no accent color, uppercase eyebrow)
  assert(/\.ds-breaking-news\{[^}]*border:1px/.test(htmlContent), 'EXP-212: .ds-breaking-news must use 1px border (was 2px)');
  assert(!htmlContent.includes('linear-gradient(135deg,var(--card-bg)'), 'EXP-212: .ds-breaking-news must not use linear-gradient background');
  assert(/\.ds-bn-header\{[^}]*text-transform:uppercase/.test(htmlContent), 'EXP-212: .ds-bn-header must be uppercase eyebrow');
  // EXP-212: no newspaper emoji in bn-header
  assert(!htmlContent.includes('&#128240;'), 'EXP-212: &#128240; newspaper emoji must not appear in docs/index.html');

  // EXP-213: verdict-badge class migration (spans may have additional attributes like style="margin-left:8px")
  const vbClassCount = (htmlContent.match(/class="ds-verdict-badge vb-[a-z_]+"/g) || []).length;
  assert(vbClassCount > 50, `EXP-213: expected 90+ verdict-badge.vb-* spans, got ${vbClassCount}`);
  // No inline-style hex backgrounds on verdict-badge
  const inlineHexBadges = htmlContent.match(/class="ds-verdict-badge"[^>]*style="[^"]*background:#[A-Fa-f0-9]{3,6}/g);
  assert(!inlineHexBadges, `EXP-213: verdict-badge must not carry inline-style hex backgrounds; found ${inlineHexBadges ? inlineHexBadges.length : 0}`);
  // Tap target minimums in CSS source
  const cssSource = fs.readFileSync('build-scripts/generate-html.js', 'utf8');
  assert(cssSource.includes('.ds-tab-btn{padding:.7rem') && cssSource.includes('min-height:44px'), 'EXP-213: mobile .ds-tab-btn rule must pin min-height:44px');
  assert(/\.ds-toc a\{[^}]*min-height:44px/.test(cssSource), 'EXP-213: .ds-toc a rule must pin min-height:44px');
  assert(/\.ds-skip-link\{[^}]*min-height:44px/.test(cssSource), 'EXP-213: .ds-skip-link rule must pin min-height:44px');
  assert(/\.win-anchor\{[^}]*min-height:44px/.test(cssSource), 'EXP-213: .win-anchor rule must pin min-height:44px');
  // Stacked card table media block
  assert(/@media\(max-width:720px\)\{\.stacked-card-table/.test(cssSource), 'EXP-213: .stacked-card-table @media(max-width:720px) block missing');
  // Integrity flag cleanup: no #f5f5f5 or background:#fff in sections.json
  assert(!sectionsContent.includes('background: #f5f5f5') && !sectionsContent.includes('background:#f5f5f5'), 'EXP-213: data/sections.json still contains background:#f5f5f5 (integrity-flagged light panel)');
  const whiteRe = /background:\s*#fff[";]/;
  assert(!whiteRe.test(sectionsContent), 'EXP-213: data/sections.json still contains background:#fff (integrity-flagged light panel)');
  // Skip-link present in HTML
  assert(htmlContent.includes('class="ds-skip-link"'), 'EXP-213: .ds-skip-link missing from docs/index.html');
  assert(htmlContent.includes('href="#main"'), 'EXP-213: skip-link href="#main" missing');
  // Main landmark present
  assert(htmlContent.includes('<main id="main">'), 'EXP-213: <main id="main"> landmark missing from docs/index.html');
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
