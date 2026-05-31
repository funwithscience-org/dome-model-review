#!/usr/bin/env node
/**
 * audit-exp-tracker-gaps.js — PROP-053 follow-up (EXP-515)
 *
 * Classifies gaps between EXP-NNN expansion files on disk and
 * entries in monitor/analyst/expansion-tracker.json.
 *
 * Gap categories:
 *   orphan_file      — file on disk but NO tracker entry (potential lost work)
 *   tracker_only     — tracker entry but NO matching file (benign bulk-reservation)
 *   mentioned_only   — referenced in another EXP/review file but no tracker entry and no standalone file
 *   ok               — file on disk AND tracker entry present
 *
 * Usage:
 *   node build-scripts/audit-exp-tracker-gaps.js [--json] [--orphans-only]
 */

const fs = require('fs');
const path = require('path');

const EXPANSIONS_DIR = path.join(__dirname, '..', 'monitor', 'analyst', 'expansions');
const TRACKER_FILE   = path.join(__dirname, '..', 'monitor', 'analyst', 'expansion-tracker.json');

function extractExpIds(str) {
  const matches = [];
  const re = /EXP-(\d+)/g;
  let m;
  while ((m = re.exec(str)) !== null) matches.push('EXP-' + m[1]);
  return matches;
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const orphansOnly = args.includes('--orphans-only');

  // 1. Collect all EXP-NNN files on disk
  const files = fs.readdirSync(EXPANSIONS_DIR).filter(f => /^EXP-\d+/.test(f));
  const fileIds = new Set();
  const fileMap = {}; // id -> filename
  for (const f of files) {
    const m = f.match(/^EXP-(\d+)/);
    if (m) {
      const id = 'EXP-' + m[1];
      fileIds.add(id);
      fileMap[id] = f;
    }
  }

  // 2. Collect all tracker entries
  const tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  const trackerIds = new Set(tracker.items.map(i => i.id).filter(id => /^EXP-\d+$/.test(id)));

  // 3. Collect cross-references from all expansion files
  const mentionedIds = new Set();
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(EXPANSIONS_DIR, f), 'utf8');
      extractExpIds(content).forEach(id => mentionedIds.add(id));
    } catch (e) { /* skip unreadable */ }
  }

  // 4. Classify
  const results = {
    ok: [],
    orphan_file: [],       // file exists, no tracker entry
    tracker_only: [],      // tracker entry exists, no file
    mentioned_only: []     // neither file nor tracker, but referenced
  };

  for (const id of fileIds) {
    if (trackerIds.has(id)) {
      results.ok.push({ id, file: fileMap[id] });
    } else {
      results.orphan_file.push({ id, file: fileMap[id] });
    }
  }

  for (const id of trackerIds) {
    if (!fileIds.has(id)) {
      const item = tracker.items.find(i => i.id === id);
      results.tracker_only.push({ id, status: item ? item.status : 'unknown', target: item ? (item.target||'').substring(0, 80) : '' });
    }
  }

  // mentioned_only: in cross-refs but not in fileIds and not in trackerIds
  for (const id of mentionedIds) {
    if (!fileIds.has(id) && !trackerIds.has(id)) {
      results.mentioned_only.push({ id });
    }
  }

  // 5. Report
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (orphansOnly) {
    if (results.orphan_file.length === 0) {
      console.log('No orphan files found.');
    } else {
      console.log(`ORPHAN FILES (${results.orphan_file.length}):`);
      results.orphan_file.forEach(e => console.log(`  ${e.id}  ${e.file}`));
    }
    return;
  }

  console.log('=== EXP Tracker Gap Audit ===');
  console.log(`OK (file + tracker):       ${results.ok.length}`);
  console.log(`Orphan files (no tracker): ${results.orphan_file.length}`);
  console.log(`Tracker-only (no file):    ${results.tracker_only.length}`);
  console.log(`Mentioned-only (no file):  ${results.mentioned_only.length}`);
  console.log('');

  if (results.orphan_file.length > 0) {
    console.log('--- ORPHAN FILES (potential lost work) ---');
    results.orphan_file.forEach(e => console.log(`  ${e.id}  ${e.file}`));
    console.log('');
  }
  if (results.tracker_only.length > 0) {
    console.log('--- TRACKER-ONLY (benign bulk-reservation drift) ---');
    results.tracker_only.forEach(e => console.log(`  ${e.id}  [${e.status}]  ${e.target}`));
    console.log('');
  }
  if (results.mentioned_only.length > 0) {
    console.log('--- MENTIONED-ONLY (cross-references with no standalone record) ---');
    results.mentioned_only.forEach(e => console.log(`  ${e.id}`));
  }
}

main();
