#!/usr/bin/env node
/**
 * V6 Restructure: Reorder tabs, renumber all sections, rename JSON keys.
 *
 * Uses PLACEHOLDER-BASED two-pass replacement to prevent double-renaming.
 * (e.g., "4.5.1" → "2.1" then "2.1" → "3.1" would cascade without this)
 *
 * New tab order and numbering:
 *   Part 1:   The Model (model)              — was Part 1, 1.5
 *   Part 1b:  Version Change (model)          — was Part 1.5
 *   Part 2:   Self-Contradictions (selftest)   — was Part 4.5
 *   Part 2b:  Code Analysis (selftest)         — was Part 4.6
 *   Part 3:   Wins Reviewed (wins)             — was Part 2
 *   Part 4:   Live Power Dashboard (pages)     — was Part 3 (minus kill shots)
 *   Part 5:   Kill Shots (killshots)           — extracted from Part 3.3
 *   Part 6:   Predictions Analysis (predictions) — was Part 3.5
 *   Part 7:   External Tests (falsify)         — was Part 4
 *   Part 8:   AI Directives (ai)               — was Part 5
 *   Part 9:   Conclusions (ai)                 — was Part 6
 *   Part 10:  References (refs)                — was Part 7
 *
 * Run with --dry-run to preview changes without writing.
 * Run without flags to apply.
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════
// PLACEHOLDER-BASED REPLACEMENT ENGINE
// ═══════════════════════════════════════════

let phCounter = 0;
function makePH() { return `__RSTPH_${++phCounter}__`; }

/**
 * Two-pass replacement: old → placeholder → new.
 * Patterns are sorted longest-first to avoid partial matches.
 * @param {string} text - Input text
 * @param {Array<[string, string]>} pairs - [old, new] pairs
 * @returns {string} - Transformed text
 */
function safeReplace(text, pairs) {
  // Sort by old-string length, longest first
  const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length);

  // Pass 1: old → placeholder
  const phMap = []; // [placeholder, newValue]
  for (const [old, neu] of sorted) {
    if (old === neu) continue;
    const ph = makePH();
    phMap.push([ph, neu]);
    text = text.split(old).join(ph);
  }

  // Pass 2: placeholder → new
  for (const [ph, neu] of phMap) {
    text = text.split(ph).join(neu);
  }

  return text;
}

// ═══════════════════════════════════════════
// 1. SECTION KEY MAPPING (old → new)
// ═══════════════════════════════════════════

const KEY_MAP = {
  'part1':  'part1',    // unchanged
  'part1b': 'part1b',   // unchanged
  'part4b': 'part2',    // Self-Contradictions
  'part4c': 'part2b',   // Code Analysis
  'part2':  'part3',    // Wins Reviewed
  'part3':  'part4',    // Live Power (kill shots removed)
  // part5 is new (kill shots extracted from part3)
  'part3b': 'part6',    // Predictions
  'part4':  'part7',    // External Tests
  'part5':  'part8',    // AI Directives
  'part6':  'part9',    // Conclusions
  'part7':  'part10',   // References
};

// ═══════════════════════════════════════════
// 2. ALL TEXT REPLACEMENTS
// ═══════════════════════════════════════════
// Single unified list of [old, new] pairs.
// The safeReplace function handles ordering automatically.

const TEXT_REPLACEMENTS = [
  // ── Part-level title replacements (specific subsections first) ──
  ['Part 1.5:', 'Part 1b:'],
  ['Part 1.5b:', 'Part 1b:'],
  ['PART 1.5', 'Part 1b'],
  ['Part 1.5', 'Part 1b'],
  ['Part 4.5: Internal Contradictions', 'Part 2: Self-Contradictions'],
  ['Part 4.5: Self-Contradictions', 'Part 2: Self-Contradictions'],
  ['Part 4.6:', 'Part 2b:'],
  ['Part 4.6', 'Part 2b'],
  ['PART 4.6', 'Part 2b'],
  ['Part 4.5', 'Part 2'],
  ['PART 4.5', 'Part 2'],
  ['Part 3.5:', 'Part 6:'],
  ['Part 3.5', 'Part 6'],

  // ── Part-level number renumbering (bare "Part N:" in h1 titles and prose) ──
  ['Part 2:', 'Part 3:'],
  ['Part 3:', 'Part 4:'],
  ['Part 4:', 'Part 7:'],
  ['Part 5:', 'Part 8:'],
  ['Part 6:', 'Part 9:'],
  ['Part 7:', 'Part 10:'],

  // ── Section X.Y.Z cross-references (prose) ──
  // Self-contradictions: 4.5.x → 2.x
  ['Section 4.5.1', 'Section 2.1'],
  ['Section 4.5.2', 'Section 2.2'],
  ['Section 4.5.3', 'Section 2.3'],
  ['Section 4.5.4', 'Section 2.4'],
  ['Section 4.5.5', 'Section 2.5'],
  ['Section 4.5.6', 'Section 2.6'],
  ['Section 4.5.7', 'Section 2.7'],
  ['Section 4.5.8', 'Section 2.8'],
  ['Section 4.5.9', 'Section 2.9'],
  ['section 4.5.9', 'Section 2.9'],
  // Code analysis: 4.6.x → 2b.x
  ['Section 4.6.1', 'Section 2b.1'],
  ['Section 4.6.2', 'Section 2b.2'],
  ['Section 4.6.3', 'Section 2b.3'],
  ['Section 4.6.4', 'Section 2b.4'],
  // Predictions: 3.5.x → 6.x
  ['Section 3.5.1', 'Section 6.1'],
  ['Section 3.5.2', 'Section 6.2'],
  ['Section 3.5.3', 'Section 6.3'],
  ['Section 3.5.4', 'Section 6.4'],
  ['Section 3.5.5', 'Section 6.5'],
  ['Section 3.5.6', 'Section 6.6'],
  ['Section 3.5.7', 'Section 6.7'],
  ['Section 3.5.8', 'Section 6.8'],
  ['Section 3.5.9', 'Section 6.9'],
  // Live Power subsections: 3.x → 4.x (but skip 3.3 which is extracted, and 3.5.x which is handled above)
  ['Section 3.2', 'Section 4.2'],
  ['SECTION 3.6', 'Section 4.5'],
  ['section 3.6', 'Section 4.5'],
  ['Section 3.6', 'Section 4.5'],
  // Falsification tests: 4.8, 4.9 → 7.1, 7.2
  ['Section 4.8', 'Section 7.1'],
  ['Section 4.9', 'Section 7.2'],
  // Conclusions subsections: 6.x → 9.x
  ['Section 6.1', 'Section 9.1'],
  ['Section 6.2', 'Section 9.2'],
  ['Section 6.3', 'Section 9.3'],
  ['Section 6.4', 'Section 9.4'],
  ['Section 6.5', 'Section 9.5'],
  ['Section 6.6', 'Section 9.6'],
  // Section 9.1 (already in wins.json) — this references what WAS Section 6.1, which is now 9.1
  // If "Section 9.1" exists in old text, it was put there erroneously (should be 6.1).
  // Check: it's in WIN-056, likely a forward-ref. Leave as-is since 6.1→9.1 handles it.
  // Section 1.5 stays (but the Part changes)
  ['Section 1.5', 'Section 1b'],

  // ── Heading numbers inside <h2>/<h3> tags ──
  // Self-contradictions: 4.5.x → 2.x (these appear as heading content)
  ['4.5.1', '2.1'],
  ['4.5.2', '2.2'],
  ['4.5.3', '2.3'],
  ['4.5.4', '2.4'],
  ['4.5.5', '2.5'],
  ['4.5.6', '2.6'],
  ['4.5.7', '2.7'],
  ['4.5.8', '2.8'],
  ['4.5.9', '2.9'],
  // Code analysis: 4.6.x → 2b.x
  ['4.6.1', '2b.1'],
  ['4.6.2', '2b.2'],
  ['4.6.3', '2b.3'],
  ['4.6.4', '2b.4'],
  // Predictions: 3.5.x → 6.x
  ['3.5.1', '6.1'],
  ['3.5.2', '6.2'],
  ['3.5.3', '6.3'],
  ['3.5.4', '6.4'],
  ['3.5.5', '6.5'],
  ['3.5.6', '6.6'],
  ['3.5.7', '6.7'],
  ['3.5.8', '6.8'],
  ['3.5.9', '6.9'],
  // Wins: 2.x → 3.x
  ['<h2>2.1 ', '<h2>3.1 '],
  ['<h2>2.2 ', '<h2>3.2 '],
  ['<h2>2.3 ', '<h2>3.3 '],
  ['<h2>2.4 ', '<h2>3.4 '],
  ['<h2>2.5 ', '<h2>3.5 '],
  ['<h2>2.6 ', '<h2>3.6 '],
  // Live Power: 3.x → 4.x (context: heading only, not bare numbers)
  ['<h2>3.1 ', '<h2>4.1 '],
  ['<h2>3.2 ', '<h2>4.2 '],
  ['<h2>3.3 ', '<h2>5.1 '],  // Kill shots → Part 5
  ['<h2>3.4 ', '<h2>4.3 '],
  ['<h2>3.5 ', '<h2>4.4 '],  // Note: 3.5 as a bare heading (not 3.5.x)
  ['<h2>3.6 ', '<h2>4.5 '],
  // Falsification: 4.8, 4.9 → 7.1, 7.2
  ['<h2>4.8 ', '<h2>7.1 '],
  ['<h2>4.9 ', '<h2>7.2 '],
  // AI Directives: 5.x → 8.x
  ['<h3>5.1 ', '<h3>8.1 '],
  ['<h3>5.2 ', '<h3>8.2 '],
  ['<h3>5.3 ', '<h3>8.3 '],
  ['<h3>5.4 ', '<h3>8.4 '],
  ['<h3>5.5 ', '<h3>8.5 '],
  ['<h3>5.6 ', '<h3>8.6 '],
  ['<h3>5.7 ', '<h3>8.7 '],
  ['<h3>5.8 ', '<h3>8.8 '],
  ['<h3>5.9 ', '<h3>8.9 '],
  ['<h3>5.10 ', '<h3>8.10 '],
  ['<h3>5.11 ', '<h3>8.11 '],
  ['<h3>5.12 ', '<h3>8.12 '],
  ['<h3>5.13 ', '<h3>8.13 '],
  ['<h3>5.14 ', '<h3>8.14 '],
  ['<h3>5.15 ', '<h3>8.15 '],
  ['<h3>5.16 ', '<h3>8.16 '],
  // Conclusions: 6.x → 9.x
  ['<h2>6.1 ', '<h2>9.1 '],
  ['<h2>6.2 ', '<h2>9.2 '],
  ['<h2>6.3 ', '<h2>9.3 '],
  ['<h2>6.4 ', '<h2>9.4 '],
  ['<h2>6.5 ', '<h2>9.5 '],
  ['<h2>6.6 ', '<h2>9.6 '],

  // ── Anchor IDs ──
  ['id="part4b"', 'id="part2"'],
  ['id="part4c"', 'id="part2b"'],
  ['id="part2"', 'id="part3"'],
  ['id="part3"', 'id="part4"'],
  ['id="part3b"', 'id="part6"'],
  ['id="part4"', 'id="part7"'],
  ['id="part5"', 'id="part8"'],
  ['id="part6"', 'id="part9"'],
  ['id="part7"', 'id="part10"'],

  // ── Href anchors ──
  ['href="#part4b"', 'href="#part2"'],
  ['href="#part4c"', 'href="#part2b"'],
  ['href="#part2"', 'href="#part3"'],
  ['href="#part3b"', 'href="#part6"'],
  ['href="#part4"', 'href="#part7"'],
  ['href="#part5"', 'href="#part8"'],
  ['href="#part6"', 'href="#part9"'],
  ['href="#part7"', 'href="#part10"'],
  // Note: href="#part3" → href="#part4" only applies in specific contexts.
  // The kill-shot extraction changes anchors within part3 content.
  // But part3 itself (now part4) keeps its anchor. Handle below.

  // ── Part 1 title updates ──
  ['Part 1.5: Version Change Analysis', 'Part 1b: Version Change Analysis'],
  ['Part 1.5b: Version Change Analysis', 'Part 1b: Version Change Analysis'],
];

// ═══════════════════════════════════════════
// EXECUTION
// ═══════════════════════════════════════════

// ── Load sections.json ──
const sectionsPath = path.join(ROOT, 'data', 'sections.json');
const sections = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));

// ── Step A: Extract kill shots from part3 into new key ──
console.log('\n═══ STEP A: Extract Kill Shots ═══');
const part3html = sections.part3.html;
const ksStart = part3html.indexOf('<h2>3.3 Kill-Shot');
const ksEnd = part3html.indexOf('<h2>3.4 Audit');
if (ksStart === -1 || ksEnd === -1) {
  console.error('Could not find kill-shot section boundaries!');
  console.error('  ksStart:', ksStart, 'ksEnd:', ksEnd);
  process.exit(1);
}
const killShotHtml = part3html.substring(ksStart, ksEnd);
const part3WithoutKs = part3html.substring(0, ksStart) + part3html.substring(ksEnd);
console.log(`  Extracted ${killShotHtml.length} chars of kill-shot content`);
console.log(`  Part 3 reduced from ${part3html.length} to ${part3WithoutKs.length} chars`);

// Build kill-shot section with Part 5 wrapper
const ksWithHeading = `<h1 id="part5">Part 5: Kill-Shot Binary Tests</h1>\n\n` +
  `<p>The dome's kill-shot page presents six binary tests under a bold rule: "If any single test confirms, globe is falsified. If any single test fails, dome is falsified." Two are claimed as confirmed; four are pending.</p>\n\n` +
  killShotHtml
    .replace('<h2>3.3 Kill-Shot Binary Test Page</h2>', '')
    .replace(/^\s*<p>This page presents six binary tests[^<]*<\/p>\s*/m, '')
    .trim();

sections.part3.html = part3WithoutKs;

// ── Step B: Rename keys ──
console.log('\n═══ STEP B: Rename Section Keys ═══');
const newSections = {};
if (sections._meta) newSections._meta = sections._meta;

for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
  if (sections[oldKey]) {
    newSections[newKey] = { ...sections[oldKey] };
    // Update the id field to match new key
    newSections[newKey].id = newKey;
    console.log(`  ${oldKey} → ${newKey} (id: ${newKey})`);
  } else {
    console.warn(`  WARNING: ${oldKey} not found in sections.json`);
  }
}

// Kill shots will be added AFTER the replacement pass (to avoid
// the old "Part 5:" → "Part 8:" replacement catching the new content)
console.log(`  (new) → part5 (Kill Shots) — will be added after renumbering`);

// Update tab assignments
const TAB_MAP = {
  part1: 'model', part1b: 'model',
  part2: 'selftest', part2b: 'selftest',
  part3: 'wins',
  part4: 'pages',
  part5: 'killshots',
  part6: 'predictions',
  part7: 'falsify',
  part8: 'ai', part9: 'ai',
  part10: 'refs'
};
for (const [key, tab] of Object.entries(TAB_MAP)) {
  if (newSections[key]) newSections[key].tab = tab;
}

// Sort by part number
const sortOrder = ['_meta', 'part1', 'part1b', 'part2', 'part2b', 'part3', 'part4', 'part5', 'part6', 'part7', 'part8', 'part9', 'part10'];
const sortedSections = {};
for (const key of sortOrder) {
  if (newSections[key]) sortedSections[key] = newSections[key];
}

// ── Step C: Apply renumbering to all section HTML ──
console.log('\n═══ STEP C: Renumber Headings & Cross-References (placeholder-safe) ═══');
let totalChanges = 0;
for (const [key, sec] of Object.entries(sortedSections)) {
  if (!sec.html) continue;
  const original = sec.html;
  sec.html = safeReplace(sec.html, TEXT_REPLACEMENTS);

  // Update title field too
  if (sec.title) {
    sec.title = safeReplace(sec.title, TEXT_REPLACEMENTS);
  }

  if (sec.html !== original) {
    const changedLines = sec.html.split('\n').filter((line, i) =>
      line !== original.split('\n')[i]
    ).length;
    console.log(`  ${key}: ${changedLines} lines changed`);
    totalChanges += changedLines;
  }
}
console.log(`  Total: ${totalChanges} lines changed across all sections`);

// ── Step C2: Add kill-shot section ──
// Apply TEXT_REPLACEMENTS to the body content (to fix old cross-refs like Section 4.5.9, href="#part4b")
// but build the <h1> header fresh so Part 5 numbering isn't caught by "Part 5:" → "Part 8:" replacement.
const ksBodyOnly = killShotHtml
  .replace('<h2>3.3 Kill-Shot Binary Test Page</h2>', '')
  .replace(/^\s*<p>This page presents six binary tests[^<]*<\/p>\s*/m, '')
  .trim();
const processedKsBody = safeReplace(ksBodyOnly, TEXT_REPLACEMENTS);
const finalKsHtml = `<h1 id="part5">Part 5: Kill-Shot Binary Tests</h1>\n\n` +
  `<p>The dome's kill-shot page presents six binary tests under a bold rule: ` +
  `"If any single test confirms, globe is falsified. If any single test fails, dome is falsified." ` +
  `Two are claimed as confirmed; four are pending.</p>\n\n` +
  processedKsBody;
sortedSections.part5 = {
  id: 'part5',
  title: 'Part 5: Kill-Shot Binary Tests',
  tab: 'killshots',
  html: finalKsHtml
};
console.log(`  Added part5 (Kill Shots) — ${finalKsHtml.length} chars`);

// ── Step D: Apply renumbering to wins.json ──
console.log('\n═══ STEP D: Renumber wins.json cross-references ═══');
const winsPath = path.join(ROOT, 'data', 'wins.json');
const wins = JSON.parse(fs.readFileSync(winsPath, 'utf8'));
let winChanges = 0;
for (const win of wins) {
  for (const field of ['detail_evidence', 'detail_verdict_text', 'detail_extra', 'detail_claim', 'finding']) {
    if (!win[field]) continue;
    const original = win[field];
    win[field] = safeReplace(win[field], TEXT_REPLACEMENTS);
    if (win[field] !== original) winChanges++;
  }
}
console.log(`  ${winChanges} field values updated`);

// ── Re-sort after adding part5 ──
const finalSections = {};
for (const key of sortOrder) {
  if (sortedSections[key]) finalSections[key] = sortedSections[key];
}

// ── Step E: Verify no orphaned old references ──
console.log('\n═══ STEP E: Verification ═══');
const allText = JSON.stringify(finalSections) + JSON.stringify(wins);
const orphanPatterns = [
  /Part 4\.5/g, /Part 4\.6/g, /Section 4\.5\.\d/g, /Section 4\.6\.\d/g,
  /Part 3\.5/g, /Section 3\.5\.\d/g,
  /id="part4b"/g, /id="part4c"/g, /id="part3b"/g,
  /href="#part4b"/g, /href="#part4c"/g, /href="#part3b"/g,
];
let orphans = 0;
for (const pat of orphanPatterns) {
  const matches = allText.match(pat);
  if (matches) {
    console.log(`  ⚠️  Orphaned reference: ${pat.source} (${matches.length} occurrences)`);
    orphans += matches.length;
  }
}
const phCheck = allText.match(/__RSTPH_\d+__/g);
if (phCheck) {
  console.log(`  ❌ UNREPLACED PLACEHOLDERS: ${phCheck.length} found!`);
  orphans += phCheck.length;
}
if (orphans === 0) {
  console.log('  ✅ No orphaned references or placeholders found');
}

// ── Write output ──
if (DRY_RUN) {
  console.log('\n═══ DRY RUN — no files written ═══');
  console.log(`Would write sections.json with ${Object.keys(finalSections).length} keys: ${Object.keys(finalSections).join(', ')}`);
  console.log(`Would write wins.json with ${winChanges} changed fields`);

  // Show sample of what changed
  console.log('\n═══ Sample changes ═══');
  for (const [key, sec] of Object.entries(finalSections)) {
    if (!sec.title) continue;
    console.log(`  ${key}: ${sec.title}`);
  }
} else {
  fs.writeFileSync(sectionsPath, JSON.stringify(finalSections, null, 2));
  console.log(`\n✅ Wrote sections.json (${Object.keys(finalSections).length} keys)`);
  fs.writeFileSync(winsPath, JSON.stringify(wins, null, 2));
  console.log(`✅ Wrote wins.json (${winChanges} fields updated)`);
}

console.log('\n═══ DONE ═══');
console.log('Next steps:');
console.log('1. Update generate-html.js (tab buttons, content divs, sectionNav, TOC)');
console.log('2. Run: node build.js html && node test.js');
console.log('3. Manually verify cross-references in the output HTML');
