#!/usr/bin/env node
/**
 * apply-patches.js — Apply suggested patches from decider to wins.json and sections.json
 *
 * Usage:
 *   node build-scripts/apply-patches.js <patches-file> [--dry-run]
 *
 * Patches target parsed field values (not raw JSON), so this script:
 * 1. Parses wins.json (and sections.json if it exists) into objects
 * 2. Finds the WIN by id and the field by name, or the section by id
 * 3. Does string replacement on the parsed value
 * 4. Re-serializes to JSON
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const patchFile = args.find(a => !a.startsWith('--'));

if (!patchFile) {
  console.error('Usage: node apply-patches.js <patches-file> [--dry-run]');
  process.exit(1);
}

const patchData = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
const patches = patchData.patches || patchData;

// Find data files relative to script location
const winsPath = path.resolve(__dirname, '..', 'data', 'wins.json');
const sectionsPath = path.resolve(__dirname, '..', 'data', 'sections.json');

const winsData = JSON.parse(fs.readFileSync(winsPath, 'utf8'));

let sectionsData = null;
let sectionsModified = false;
if (fs.existsSync(sectionsPath)) {
  sectionsData = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'));
}

let applied = 0, failed = 0, skipped = 0;

for (let i = 0; i < patches.length; i++) {
  const p = patches[i];
  const num = i + 1;
  const winId = (p.win_id || '').replace('WIN-', '');
  const field = p.field;
  const find = p.find || p.old_string || '';
  const replace = p.replace || p.new_string || '';

  // Route to sections.json if specified
  if (p.file && p.file.includes('sections.json')) {
    if (!sectionsData) {
      console.log(`⏭  Patch ${num}: ${p.section_id || p.target || 'sections.json'} — sections.json doesn't exist yet, skipping`);
      skipped++;
      continue;
    }
    // Accept section_id, target, or parse from field.
    // Formats: section_id="part4", field="part4.html", field="part4", target="part4"
    let sectionId = p.section_id || p.target;
    let sectionField = null;
    if (!sectionId && p.field) {
      if (p.field.includes('.')) {
        const parts = p.field.split('.');
        sectionId = parts[0];
        sectionField = parts[1] || 'html';
      } else if (sectionsData && sectionsData[p.field]) {
        // field is the section ID itself (e.g., "part4")
        sectionId = p.field;
        sectionField = 'html';
      }
    }
    if (!sectionField) sectionField = 'html';
    if (!sectionId) {
      console.log(`⏭  Patch ${num}: sections.json patch with no section_id, skipping`);
      skipped++;
      continue;
    }
    const section = sectionsData[sectionId];
    if (!section) {
      console.log(`❌ Patch ${num}: Section "${sectionId}" not found in sections.json`);
      failed++;
      continue;
    }
    // Search the html field (primary) and title field
    const sectionFields = ['html', 'title'];
    const targetField = sectionField && sectionFields.includes(sectionField) ? sectionField : 'html';
    const fieldsToSearch = [targetField, ...sectionFields.filter(f => f !== targetField)];

    let matched = false;
    for (const f of fieldsToSearch) {
      if (section[f] && typeof section[f] === 'string' && section[f].includes(find)) {
        if (!dryRun) {
          section[f] = section[f].replace(find, replace);
          sectionsModified = true;
        }
        const fieldNote = f !== targetField ? ` (found in ${f}, not ${targetField})` : '';
        console.log(`✅ Patch ${num}: ${sectionId} .${f}${fieldNote}`);
        applied++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      console.log(`❌ Patch ${num}: ${sectionId} .${targetField} — find string not found`);
      console.log(`   Find starts: "${find.slice(0, 80)}..."`);
      failed++;
    }
    continue;
  }

  // Skip non-wins.json, non-sections.json patches
  if (p.file && !p.file.includes('wins.json') && !p.file.includes('sections.json')) {
    console.log(`⏭  Patch ${num}: ${p.win_id || p.target} — targets ${p.file}, skipping (manual apply needed)`);
    skipped++;
    continue;
  }

  if (!winId) {
    console.log(`⏭  Patch ${num}: no win_id, skipping`);
    skipped++;
    continue;
  }

  const win = winsData.find(w => w.id === winId);
  if (!win) {
    console.log(`❌ Patch ${num}: WIN-${winId} not found in wins.json`);
    failed++;
    continue;
  }

  // Try the specified field first, then search all text fields
  const textFields = ['claim', 'finding', 'detail_claim', 'detail_evidence', 'detail_verdict_text', 'detail_extra', 'verdict'];
  const fieldsToTry = field && textFields.includes(field) ? [field, ...textFields.filter(f => f !== field)] : textFields;

  let matched = false;
  for (const f of fieldsToTry) {
    if (win[f] && typeof win[f] === 'string' && win[f].includes(find)) {
      if (!dryRun) {
        win[f] = win[f].replace(find, replace);
      }
      const fieldNote = f !== field ? ` (found in ${f}, not ${field})` : '';
      console.log(`✅ Patch ${num}: WIN-${winId} .${f}${fieldNote}`);
      applied++;
      matched = true;
      break;
    }
  }

  // Also handle code_analysis patches
  if (!matched && field === 'code_analysis' && win.code_analysis) {
    try {
      const tags = typeof find === 'string' ? JSON.parse(find) : find;
      const newTags = typeof replace === 'string' ? JSON.parse(replace) : replace;
      Object.assign(win.code_analysis, newTags);
      console.log(`✅ Patch ${num}: WIN-${winId} .code_analysis (merged tags)`);
      applied++;
      matched = true;
    } catch (e) {
      // Not a JSON code_analysis patch, fall through
    }
  }

  if (!matched) {
    console.log(`❌ Patch ${num}: WIN-${winId} .${field || '?'} — find string not found in any field`);
    console.log(`   Find starts: "${find.slice(0, 80)}..."`);
    failed++;
  }
}

if (!dryRun) {
  // Atomic write for wins.json: write to temp, then rename
  const winsTmp = winsPath + '.tmp';
  fs.writeFileSync(winsTmp, JSON.stringify(winsData, null, 2));
  fs.renameSync(winsTmp, winsPath);

  // Atomic write for sections.json: write to temp, then rename
  if (sectionsModified && sectionsData) {
    const sectionsTmp = sectionsPath + '.tmp';
    fs.writeFileSync(sectionsTmp, JSON.stringify(sectionsData, null, 2));
    fs.renameSync(sectionsTmp, sectionsPath);
  }
}

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Applied: ${applied}, Failed: ${failed}, Skipped: ${skipped}`);
if (failed > 0) {
  console.log('Failed patches need manual review.');
}
