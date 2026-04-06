#!/usr/bin/env node
/**
 * apply-patches.js — Apply suggested patches from decider to wins.json
 *
 * Usage:
 *   node build-scripts/apply-patches.js <patches-file> [--dry-run]
 *
 * Patches target parsed field values (not raw JSON), so this script:
 * 1. Parses wins.json into objects
 * 2. Finds the WIN by id and the field by name
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

// Find wins.json relative to script location
const winsPath = path.resolve(__dirname, '..', 'data', 'wins.json');
const winsData = JSON.parse(fs.readFileSync(winsPath, 'utf8'));

let applied = 0, failed = 0, skipped = 0;

for (let i = 0; i < patches.length; i++) {
  const p = patches[i];
  const num = i + 1;
  const winId = (p.win_id || '').replace('WIN-', '');
  const field = p.field;
  const find = p.find || p.old_string || '';
  const replace = p.replace || p.new_string || '';

  // Only handle wins.json patches
  if (p.file && !p.file.includes('wins.json')) {
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
  fs.writeFileSync(winsPath, JSON.stringify(winsData, null, 2));
}

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Applied: ${applied}, Failed: ${failed}, Skipped: ${skipped}`);
if (failed > 0) {
  console.log('Failed patches need manual review.');
}
