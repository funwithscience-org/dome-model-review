#!/usr/bin/env node
/**
 * audit-exp-tracker-gaps.js — PROP-053 + PROP-053-rev2 (EXP-515)
 *
 * Classifies gaps between EXP-NNN expansion files on disk and entries in the
 * expansion-tracker (live + archive).
 *
 * Tracker semantics (PROP-022 phase 4): the tracker is split into
 *   - monitor/analyst/expansion-tracker.json items[]            (live, pending)
 *   - monitor/analyst/expansion-tracker-archive.jsonl           (terminal-state, append-only)
 * Both must be ingested to compute true gap categories.
 *
 * Gap categories (PROP-053 spec):
 *   orphan_file               — file on disk but NO entry in live OR archive (potential lost work)
 *   tracker_referenced_no_file — live/archive entry but NO matching file on disk (benign bulk-reservation or rolled-into-batch)
 *   mentioned_only            — referenced in another EXP/decision/review but no file and no tracker entry
 *   no_trace                  — id in 1..(next_id-1) with no file, no tracker entry, no mention (pure bulk-reservation drift)
 *
 * Output schema (PROP-053-rev2, conforms to spec):
 *   {
 *     total_slots:        next_id - 1,
 *     present:            count where id has file OR tracker entry,
 *     missing_total:      count where id has neither file NOR tracker entry,
 *     missing_ranges:     [{start, end, size}, ...] (consecutive missing runs),
 *     missing_in_context: mentioned_only ∪ no_trace count (derived),
 *     by_category: {
 *       orphan_file:                [ids],
 *       tracker_referenced_no_file: [ids],
 *       mentioned_only:             [ids],
 *       no_trace:                   [ids]
 *     },
 *     summary:       string,
 *     severity_hint: 'MODERATE' if orphan_file > 5 else 'INFO'
 *   }
 *
 * Usage:
 *   node build-scripts/audit-exp-tracker-gaps.js [--json] [--orphans-only]
 */

const fs = require('fs');
const path = require('path');

const EXPANSIONS_DIR = path.join(__dirname, '..', 'monitor', 'analyst', 'expansions');
const TRACKER_FILE   = path.join(__dirname, '..', 'monitor', 'analyst', 'expansion-tracker.json');
const ARCHIVE_FILE   = path.join(__dirname, '..', 'monitor', 'analyst', 'expansion-tracker-archive.jsonl');
// PROP-053 spec also scans decisions/ and curmudgeon/reviews/ for EXP-NNN cross-references
const DECISIONS_DIR  = path.join(__dirname, '..', 'monitor', 'decisions');
const REVIEWS_DIR    = path.join(__dirname, '..', 'monitor', 'curmudgeon', 'reviews');

function extractExpIds(str) {
  const matches = [];
  const re = /EXP-(\d+)/g;
  let m;
  while ((m = re.exec(str)) !== null) matches.push('EXP-' + m[1]);
  return matches;
}

function computeMissingRanges(missingIds) {
  // missingIds: array of numeric ids (sorted ascending)
  if (!missingIds.length) return [];
  const ranges = [];
  let start = missingIds[0];
  let prev = missingIds[0];
  for (let i = 1; i < missingIds.length; i++) {
    if (missingIds[i] === prev + 1) {
      prev = missingIds[i];
    } else {
      ranges.push({ start, end: prev, size: prev - start + 1 });
      start = missingIds[i];
      prev = missingIds[i];
    }
  }
  ranges.push({ start, end: prev, size: prev - start + 1 });
  return ranges;
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const orphansOnly = args.includes('--orphans-only');

  // 1. Collect all EXP-NNN files on disk (loose regex: any file starting EXP-NNN counts as a trace)
  const files = fs.readdirSync(EXPANSIONS_DIR).filter(f => /^EXP-\d+/.test(f));
  const fileIds = new Set();
  const fileMap = {}; // id -> first filename seen (for orphan reporting)
  for (const f of files) {
    const m = f.match(/^EXP-(\d+)/);
    if (m) {
      const id = 'EXP-' + m[1];
      fileIds.add(id);
      if (!fileMap[id]) fileMap[id] = f;
    }
  }

  // 2. Collect tracker entries — LIVE items[] AND ARCHIVE JSONL (PROP-053-rev2 ISS-2434 fix)
  const tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  const liveIds = new Set(tracker.items.map(i => i.id).filter(id => /^EXP-\d+$/.test(id)));
  const liveItemMap = {};
  for (const it of tracker.items) {
    if (it.id) liveItemMap[it.id] = it;
  }

  const archiveIds = new Set();
  const archiveItemMap = {};
  if (fs.existsSync(ARCHIVE_FILE)) {
    const lines = fs.readFileSync(ARCHIVE_FILE, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.id && /^EXP-\d+$/.test(obj.id)) {
          archiveIds.add(obj.id);
          archiveItemMap[obj.id] = obj;
        }
      } catch (e) { /* skip malformed line */ }
    }
  }
  const trackedIds = new Set([...liveIds, ...archiveIds]);

  // 3. Collect cross-references from expansion files, decisions/, reviews/
  const mentionedIds = new Set();
  function scanDirForMentions(dir) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        try {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isFile()) {
            const content = fs.readFileSync(full, 'utf8');
            extractExpIds(content).forEach(id => mentionedIds.add(id));
          }
        } catch (e) { /* skip unreadable */ }
      }
    } catch (e) { /* dir not found — skip */ }
  }
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(EXPANSIONS_DIR, f), 'utf8');
      extractExpIds(content).forEach(id => mentionedIds.add(id));
    } catch (e) { /* skip unreadable */ }
  }
  scanDirForMentions(DECISIONS_DIR);
  scanDirForMentions(REVIEWS_DIR);

  // 4. Classify
  const byCategory = {
    orphan_file: [],                // file on disk, NOT in live, NOT in archive
    tracker_referenced_no_file: [], // in live ∪ archive, NOT on disk
    mentioned_only: [],             // mentioned but NOT on disk and NOT in live ∪ archive
    no_trace: []                    // in 1..next_id-1, NOT on disk, NOT in live ∪ archive, NOT mentioned
  };
  const okIds = [];

  // Orphan files (PROP-053-rev2: archive-aware)
  for (const id of fileIds) {
    if (trackedIds.has(id)) {
      okIds.push(id);
    } else {
      byCategory.orphan_file.push({ id, file: fileMap[id] });
    }
  }

  // Tracker-referenced-no-file (renamed from tracker_only per ISS-2437)
  for (const id of trackedIds) {
    if (!fileIds.has(id)) {
      const item = liveItemMap[id] || archiveItemMap[id] || {};
      const where = liveIds.has(id) ? 'live' : 'archive';
      byCategory.tracker_referenced_no_file.push({
        id,
        where,
        status: item.status || 'unknown',
        target: (item.target || '').substring(0, 80)
      });
    }
  }

  // Mentioned-only
  for (const id of mentionedIds) {
    if (!fileIds.has(id) && !trackedIds.has(id)) {
      byCategory.mentioned_only.push({ id });
    }
  }

  // no_trace (PROP-053 spec ISS-2435): iterate 1..next_id-1
  const nextId = typeof tracker.next_id === 'number' ? tracker.next_id : 0;
  const noTraceNumeric = [];
  for (let i = 1; i < nextId; i++) {
    const id = 'EXP-' + i;
    if (!fileIds.has(id) && !trackedIds.has(id) && !mentionedIds.has(id)) {
      byCategory.no_trace.push({ id });
      noTraceNumeric.push(i);
    }
  }

  // 5. Compute spec-required derived fields
  const totalSlots = Math.max(0, nextId - 1);
  // present = ids with file OR tracker entry (in 1..next_id-1 range)
  let presentCount = 0;
  let missingTotal = 0;
  const missingNumeric = [];
  for (let i = 1; i < nextId; i++) {
    const id = 'EXP-' + i;
    if (fileIds.has(id) || trackedIds.has(id)) {
      presentCount++;
    } else {
      missingTotal++;
      missingNumeric.push(i);
    }
  }
  const missingRanges = computeMissingRanges(missingNumeric);
  // missing_in_context: subset of missing that are mentioned somewhere (NOT pure phantoms)
  const missingInContext = byCategory.mentioned_only.length;

  const orphanCount = byCategory.orphan_file.length;
  // PROP-088 (2026-06-12): bucket orphans by EXP-number range.
  // Pre-PROP-034 (EXP<500) is frozen — those orphans are fully audited as
  // benign (EXP-614 walked all 68 entries on 2026-06-11) and will never
  // grow. Post-PROP-034 (EXP>=500) is the active range; this is where a
  // genuine lost-work event would land. Fire MODERATE only when the active
  // bucket exceeds 100. Legacy bucket is informational only.
  const legacyOrphans = byCategory.orphan_file.filter(e =>
    parseInt(String(e.id || '0').replace('EXP-', ''), 10) < 500);
  const activeOrphans = byCategory.orphan_file.filter(e =>
    parseInt(String(e.id || '0').replace('EXP-', ''), 10) >= 500);
  const severityHint = activeOrphans.length > 100 ? 'MODERATE' : 'INFO';

  const summary = `${okIds.length} ok, ${orphanCount} orphan_file (legacy<500: ${legacyOrphans.length}, active>=500: ${activeOrphans.length}), ${byCategory.tracker_referenced_no_file.length} tracker_referenced_no_file, ${byCategory.mentioned_only.length} mentioned_only, ${byCategory.no_trace.length} no_trace; missing_total=${missingTotal} across ${missingRanges.length} range(s); severity_hint=${severityHint}`;

  const output = {
    total_slots: totalSlots,
    present: presentCount,
    missing_total: missingTotal,
    missing_ranges: missingRanges,
    missing_in_context: missingInContext,
    by_category: byCategory,
    summary,
    severity_hint: severityHint
  };

  // 6. Report
  if (jsonMode) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (orphansOnly) {
    if (orphanCount === 0) {
      console.log('No orphan files found.');
    } else {
      console.log(`ORPHAN FILES (${orphanCount}):`);
      byCategory.orphan_file.forEach(e => console.log(`  ${e.id}  ${e.file}`));
    }
    // ISS-2441: emit one-line summaries for other buckets so lost deliverables are not silently hidden
    if (byCategory.tracker_referenced_no_file.length > 0)
      console.log(`TRACKER-REFERENCED-NO-FILE (no file, benign reservation drift): ${byCategory.tracker_referenced_no_file.length}`);
    if (byCategory.mentioned_only.length > 0)
      console.log(`MENTIONED-ONLY (cross-referenced, no standalone record): ${byCategory.mentioned_only.length}`);
    if (byCategory.no_trace.length > 0)
      console.log(`NO-TRACE (allocated id with no artifact anywhere — bulk-reservation drift): ${byCategory.no_trace.length}`);
    console.log(`severity_hint: ${severityHint}`);
    return;
  }

  console.log('=== EXP Tracker Gap Audit (PROP-053-rev2) ===');
  console.log(`total_slots:                  ${totalSlots}  (next_id=${nextId})`);
  console.log(`present (file OR tracker):    ${presentCount}`);
  console.log(`missing_total:                ${missingTotal}  across ${missingRanges.length} range(s)`);
  console.log(`missing_in_context:           ${missingInContext}  (mentioned-only subset)`);
  console.log('');
  console.log(`ok (file + tracker):                       ${okIds.length}`);
  console.log(`orphan_file (file, no tracker):            ${orphanCount}`);
  console.log(`tracker_referenced_no_file (entry, none):  ${byCategory.tracker_referenced_no_file.length}`);
  console.log(`mentioned_only (cross-ref, no record):     ${byCategory.mentioned_only.length}`);
  console.log(`no_trace (allocated, no artifact):         ${byCategory.no_trace.length}`);
  console.log('');
  console.log(`severity_hint: ${severityHint}  (MODERATE if orphan_file > 5, else INFO)`);
  console.log('');

  if (orphanCount > 0) {
    console.log('--- ORPHAN FILES (potential lost work) ---');
    byCategory.orphan_file.forEach(e => console.log(`  ${e.id}  ${e.file}`));
    console.log('');
  }
  if (byCategory.tracker_referenced_no_file.length > 0) {
    console.log('--- TRACKER-REFERENCED-NO-FILE (benign — rolled into batch or archived) ---');
    byCategory.tracker_referenced_no_file.slice(0, 20).forEach(e => console.log(`  ${e.id}  [${e.where}/${e.status}]  ${e.target}`));
    if (byCategory.tracker_referenced_no_file.length > 20)
      console.log(`  ... and ${byCategory.tracker_referenced_no_file.length - 20} more`);
    console.log('');
  }
  if (byCategory.mentioned_only.length > 0) {
    console.log('--- MENTIONED-ONLY (cross-references with no standalone record) ---');
    byCategory.mentioned_only.slice(0, 20).forEach(e => console.log(`  ${e.id}`));
    if (byCategory.mentioned_only.length > 20)
      console.log(`  ... and ${byCategory.mentioned_only.length - 20} more`);
    console.log('');
  }
  if (byCategory.no_trace.length > 0) {
    console.log('--- NO-TRACE (allocated ids with no artifact anywhere) ---');
    if (missingRanges.length > 0) {
      console.log('  missing_ranges (consecutive runs):');
      missingRanges.slice(0, 10).forEach(r => console.log(`    EXP-${r.start} .. EXP-${r.end}  (size ${r.size})`));
      if (missingRanges.length > 10)
        console.log(`    ... and ${missingRanges.length - 10} more range(s)`);
    }
  }
}

main();
