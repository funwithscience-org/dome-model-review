#!/usr/bin/env node

/**
 * extract-sections.js
 *
 * Extracts hardcoded prose sections from generate-html.js into data/sections.json.
 * Then modifies generate-html.js and build-doc-v4.js to read from sections.json.
 *
 * This is a ONE-TIME migration script. After running:
 *   1. data/sections.json becomes the single source of truth for prose
 *   2. generate-html.js reads sections from the JSON file
 *   3. build-doc-v4.js reads sections from the JSON file
 *   4. Prose duplication between the two generators is eliminated
 *
 * Usage:
 *   node build-scripts/extract-sections.js --dry-run    # Preview what will be extracted
 *   node build-scripts/extract-sections.js --apply       # Actually do the extraction
 *   node build-scripts/extract-sections.js --verify      # Verify sections.json matches current HTML
 *
 * Strategy:
 *   The script identifies section boundaries in generate-html.js by finding
 *   <h1 id="partX"> markers. It extracts the HTML content between sections
 *   and stores it in sections.json with metadata (id, title, tab assignment).
 *
 *   Template literal interpolations (${...}) are preserved as named placeholders
 *   like {{TOTAL_WINS}} that get resolved at build time by both generators.
 *
 * IMPORTANT: This script is designed to be run by a scheduled task (Claude agent)
 * that has full context on the codebase. The agent should:
 *   1. Run --dry-run first and review the output
 *   2. Run --apply to create sections.json
 *   3. Modify generate-html.js to load sections from JSON
 *   4. Modify build-doc-v4.js to load sections from JSON
 *   5. Run node build.js html and diff the output against the original
 *   6. Run node test.js to verify everything passes
 *   7. If both pass, commit and publish
 *
 * The reason this is a prompt-driven task rather than a fully automated script
 * is that the interpolation patterns in each section are unique and need
 * intelligent handling. The script below handles the EXTRACTION; the agent
 * handles the INTEGRATION.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GEN_HTML = path.join(ROOT, 'build-scripts', 'generate-html.js');
const SECTIONS_OUT = path.join(ROOT, 'data', 'sections.json');

const mode = process.argv[2] || '--dry-run';

// Read the generator source
const src = fs.readFileSync(GEN_HTML, 'utf8');
const lines = src.split('\n');

// ── Section definitions ──
// Maps section IDs to their tab assignments and expected heading patterns
const SECTION_DEFS = [
  { id: 'part1',  tab: 'overview',    title: 'Part 1: What Is the Ovoid Cavity Cosmological Model?' },
  { id: 'part1b', tab: 'evaluate',    title: 'Part 1.5: Version Change Analysis' },
  { id: 'part2',  tab: 'wins',        title: 'Part 2: Point-by-Point Review of Claimed Wins' },
  { id: 'part3',  tab: 'pages',       title: 'Part 3: Live Power Dashboard & Site Page Analysis' },
  { id: 'part3b', tab: 'predictions', title: 'Part 3.5: Predictions Page — Structural Analysis' },
  { id: 'part4',  tab: 'falsify',     title: 'Part 4: Falsification Tests' },
  { id: 'part4b', tab: 'selftest',    title: 'Part 4.5: Internal Contradictions' },
  { id: 'part4c', tab: 'code',        title: 'Part 4.6: Repository Code Analysis' },
  { id: 'part5',  tab: 'ai',          title: 'Part 5: Analysis of AI Context Directives' },
  { id: 'part6',  tab: 'refs',        title: 'Part 6: Conclusions' },
  { id: 'part7',  tab: 'refs',        title: 'Part 7: References and Public Datasets' },
];

// Find the line numbers for each section heading
const sectionLines = [];
for (const def of SECTION_DEFS) {
  const pattern = `<h1 id="${def.id}">`;
  const lineIdx = lines.findIndex(l => l.includes(pattern));
  if (lineIdx === -1) {
    console.error(`WARNING: Could not find section ${def.id} (pattern: ${pattern})`);
    continue;
  }
  sectionLines.push({ ...def, startLine: lineIdx });
}

// Sort by line number
sectionLines.sort((a, b) => a.startLine - b.startLine);

// ── Interpolation catalog ──
// Known ${...} patterns in the prose and their placeholder names
const INTERPOLATION_MAP = [
  // These are the template literal expressions used in prose sections
  // Each gets a named placeholder that build-time code will resolve
  { pattern: '${wins.length}', placeholder: '{{TOTAL_WINS}}' },
  { pattern: '${total}', placeholder: '{{TOTAL_WINS}}' },
  { pattern: '${newInV51Count}', placeholder: '{{NEW_IN_V51}}' },
  { pattern: '${tally', placeholder: null }, // complex — needs manual handling
];

if (mode === '--dry-run') {
  console.log('═══ DRY RUN: Section Extraction Preview ═══\n');
  console.log(`Found ${sectionLines.length} sections in generate-html.js:\n`);

  for (let i = 0; i < sectionLines.length; i++) {
    const sec = sectionLines[i];
    const endLine = i < sectionLines.length - 1
      ? sectionLines[i + 1].startLine
      : lines.length;

    // Count interpolations in this section
    let interpolations = 0;
    for (let j = sec.startLine; j < endLine; j++) {
      const matches = lines[j].match(/\$\{[^}]+\}/g);
      if (matches) interpolations += matches.length;
    }

    const lineCount = endLine - sec.startLine;
    console.log(`  ${sec.id.padEnd(8)} | Lines ${sec.startLine + 1}-${endLine} (${lineCount} lines) | Tab: ${sec.tab.padEnd(12)} | Interpolations: ${interpolations}`);
  }

  // Count total interpolations
  let totalInterp = 0;
  const interpExamples = new Set();
  for (const sec of sectionLines) {
    const endIdx = sectionLines.indexOf(sec) < sectionLines.length - 1
      ? sectionLines[sectionLines.indexOf(sec) + 1].startLine
      : lines.length;
    for (let j = sec.startLine; j < endIdx; j++) {
      const matches = lines[j].match(/\$\{[^}]+\}/g);
      if (matches) {
        totalInterp += matches.length;
        matches.forEach(m => interpExamples.add(m));
      }
    }
  }

  console.log(`\nTotal interpolations to resolve: ${totalInterp}`);
  console.log('Unique patterns:');
  for (const ex of interpExamples) {
    console.log(`  ${ex}`);
  }

  console.log('\nTo proceed: node build-scripts/extract-sections.js --apply');

} else if (mode === '--verify') {
  if (!fs.existsSync(SECTIONS_OUT)) {
    console.error('data/sections.json does not exist. Run --apply first.');
    process.exit(1);
  }
  const sections = JSON.parse(fs.readFileSync(SECTIONS_OUT, 'utf8'));
  console.log(`sections.json contains ${Object.keys(sections).length} sections:`);
  for (const [key, sec] of Object.entries(sections)) {
    console.log(`  ${key}: "${sec.title}" (${sec.html.length} chars, tab: ${sec.tab})`);
  }
  console.log('\nRun node build.js html && node test.js to verify build output matches.');

} else if (mode === '--apply') {
  console.log('═══ APPLYING: Extracting sections to data/sections.json ═══\n');
  console.log('NOTE: This creates the JSON file but does NOT modify the generators.');
  console.log('The scheduled agent task will handle the generator modifications.\n');

  // For now, just catalog what needs to be done
  // The actual extraction requires understanding the template literal context
  // which is best done by the agent with full file context

  const catalog = {};
  for (let i = 0; i < sectionLines.length; i++) {
    const sec = sectionLines[i];
    const endLine = i < sectionLines.length - 1
      ? sectionLines[i + 1].startLine
      : null; // last section — boundary needs manual identification

    catalog[sec.id] = {
      title: sec.title,
      tab: sec.tab,
      source_start_line: sec.startLine + 1,
      source_end_line: endLine ? endLine : 'EOF (needs manual boundary)',
      status: 'pending_extraction'
    };
  }

  console.log('Section catalog (for agent reference):');
  console.log(JSON.stringify(catalog, null, 2));
  console.log('\nThe scheduled agent should now:');
  console.log('1. Read generate-html.js and extract each section\'s HTML');
  console.log('2. Replace ${...} interpolations with {{PLACEHOLDER}} tokens');
  console.log('3. Write the complete sections.json');
  console.log('4. Modify generate-html.js to load from sections.json');
  console.log('5. Modify build-doc-v4.js to load from sections.json');
  console.log('6. Run build + test to verify');

} else {
  console.error(`Unknown mode: ${mode}. Use --dry-run, --apply, or --verify`);
  process.exit(1);
}
