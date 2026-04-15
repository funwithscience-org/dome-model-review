#!/usr/bin/env node
/**
 * Archive / prune old append-only reports from the clone to keep disk usage
 * under control. Targets directories that accumulate timestamp-named files
 * (daily-reports, suggested-patches, tinker reports, integrity reports).
 *
 * Strategy: anything older than --days (default 14) gets `git rm`'d. git log
 * still has the history, so nothing is truly lost — just removed from the
 * working tree so the clone doesn't stay bloated.
 *
 * WARNING: this only prunes the git clone. The FUSE workspace mount cannot
 * unlink, so old reports there will persist until the user does a manual
 * clean. This is expected — the clone is what carries the disk weight
 * across sessions via pack-file objects.
 *
 * Usage:
 *   node build-scripts/archive-old-reports.js                   # dry run
 *   node build-scripts/archive-old-reports.js --apply           # actually delete
 *   node build-scripts/archive-old-reports.js --apply --days 7  # 7-day retention
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const daysIdx = args.indexOf('--days');
const days = daysIdx > -1 ? parseInt(args[daysIdx + 1]) : 14;

if (isNaN(days) || days < 1) {
  console.error('Error: --days must be a positive integer');
  process.exit(1);
}

const TARGETS = [
  { dir: 'monitor/decisions', globs: [/^daily-report-.*\.json$/, /^suggested-patches-.*\.json$/] },
  { dir: 'monitor/decisions/applied-patches', globs: [/^suggested-patches-.*\.json$/] },
  { dir: 'monitor/tinker', globs: [/^report-.*\.json$/] },
  { dir: 'monitor/integrity', globs: [/^report-.*\.json$/] },
];

// Extract timestamp from filename; returns Date or null.
// Supports: daily-report-2026-04-12.json, daily-report-2026-04-12T14-32.json,
// suggested-patches-2026-04-12T14-32.json, report-2026-04-12T10-00.json
function parseTimestamp(filename) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})(?:T(\d{2})-(\d{2}))?/);
  if (!m) return null;
  const date = m[1];
  const hour = m[2] || '00';
  const min = m[3] || '00';
  const iso = `${date}T${hour}:${min}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
console.log(`Archive cutoff: files older than ${cutoff.toISOString()} (${days} days)`);
console.log(apply ? '\nAPPLY mode — files will be git-removed.\n' : '\nDRY RUN — pass --apply to actually remove.\n');

let totalCandidates = 0;
let totalSize = 0;
const toRemove = [];

for (const target of TARGETS) {
  if (!fs.existsSync(target.dir)) continue;
  const entries = fs.readdirSync(target.dir);
  for (const entry of entries) {
    if (!target.globs.some(rx => rx.test(entry))) continue;
    const ts = parseTimestamp(entry);
    if (!ts) continue;
    if (ts >= cutoff) continue;
    const filepath = path.join(target.dir, entry);
    const stat = fs.statSync(filepath);
    toRemove.push(filepath);
    totalSize += stat.size;
    totalCandidates++;
  }
}

console.log(`Found ${totalCandidates} files older than cutoff (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);

if (totalCandidates === 0) {
  console.log('Nothing to archive.');
  process.exit(0);
}

// Show a sample
console.log('\nSample (first 10):');
toRemove.slice(0, 10).forEach(f => console.log('  ' + f));
if (toRemove.length > 10) console.log(`  ... and ${toRemove.length - 10} more`);

if (!apply) {
  console.log('\nDry run complete. Pass --apply to remove via git rm.');
  process.exit(0);
}

// Batch git rm (avoids shell arg-length limits and is fast)
const BATCH = 100;
for (let i = 0; i < toRemove.length; i += BATCH) {
  const chunk = toRemove.slice(i, i + BATCH);
  const cmd = 'git rm ' + chunk.map(f => `"${f}"`).join(' ');
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (e) {
    console.error(`Batch ${i}-${i + chunk.length} failed:`, e.message.slice(0, 200));
  }
}

console.log(`\nRemoved ${toRemove.length} files. Commit and push to propagate.`);
console.log(`Suggested commit message: "Archive ${toRemove.length} old reports (>${days} days)"`);
