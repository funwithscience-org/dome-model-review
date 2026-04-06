#!/usr/bin/env node
/**
 * Sync code_analysis tags from curmudgeon review JSONs into wins.json.
 *
 * Reads monitor/curmudgeon/reviews/WIN-*.json and applies their
 * code_analysis_tags to the corresponding entries in data/wins.json.
 *
 * Only overwrites a WIN's code_analysis if the review has reviewed: true.
 * Prints a summary of changes.
 *
 * Usage:
 *   node build-scripts/sync-code-analysis.js                    # dry run
 *   node build-scripts/sync-code-analysis.js --apply            # write changes
 *   node build-scripts/sync-code-analysis.js --apply --workspace # also sync to workspace
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WINS_PATH = path.join(ROOT, 'data/wins.json');
const WORKSPACE = '/sessions/peaceful-gallant-rubin/mnt/dome-model-review';

// Try both workspace and local monitor dirs for review files
const REVIEW_DIRS = [
  path.join(WORKSPACE, 'monitor/curmudgeon/reviews'),
  path.join(ROOT, 'monitor/curmudgeon/reviews')
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const syncWorkspace = args.includes('--workspace');

// Find the review directory that exists
let reviewDir = null;
for (const dir of REVIEW_DIRS) {
  if (fs.existsSync(dir)) {
    reviewDir = dir;
    break;
  }
}

if (!reviewDir) {
  console.error('❌ No curmudgeon reviews directory found.');
  process.exit(1);
}

console.log(`📂 Reading reviews from: ${reviewDir}`);
console.log(`📂 Wins file: ${WINS_PATH}`);
console.log(`🔧 Mode: ${apply ? 'APPLY' : 'DRY RUN'}\n`);

// Load wins.json
const wins = JSON.parse(fs.readFileSync(WINS_PATH, 'utf8'));

// Scan review files — pick latest cycle per WIN for cycle-aware filenames
// (WIN-001.json = cycle 1, WIN-001.c2.json = cycle 2, etc.)
const allReviewFiles = fs.readdirSync(reviewDir)
  .filter(f => f.match(/^WIN-\d+(?:\.c\d+)?\.json$/))
  .sort();
const latestByWin = new Map();
for (const file of allReviewFiles) {
  const match = file.match(/^(WIN-\d+)(?:\.c(\d+))?\.json$/);
  if (!match) continue;
  const winKey = match[1];
  const cycle = match[2] ? parseInt(match[2]) : 1;
  const existing = latestByWin.get(winKey);
  if (!existing || cycle > existing.cycle) {
    latestByWin.set(winKey, { file, cycle });
  }
}
const reviewFiles = [...latestByWin.values()].map(v => v.file).sort();

let applied = 0;
let skipped = 0;
let unchanged = 0;
let conflicts = [];

for (const file of reviewFiles) {
  const review = JSON.parse(fs.readFileSync(path.join(reviewDir, file), 'utf8'));
  const winId = review.point_id?.replace('WIN-', '').padStart(3, '0')
    || file.replace('WIN-', '').replace('.json', '').padStart(3, '0');

  const win = wins.find(w => w.id === winId);
  if (!win) {
    console.log(`  ⚠️  ${file}: WIN-${winId} not found in wins.json`);
    skipped++;
    continue;
  }

  const tags = review.code_analysis_tags;
  if (!tags || !tags.reviewed) {
    console.log(`  ⏭️  ${file}: not marked as reviewed`);
    skipped++;
    continue;
  }

  // Extract just the 5 core fields (drop evidence strings)
  const newAnalysis = {
    monitoring: tags.monitoring,
    relabels_standard: tags.relabels_standard,
    post_hoc: tags.post_hoc,
    derives_from_dome: tags.derives_from_dome,
    reviewed: true
  };

  // Check if already set and matches
  const existing = win.code_analysis;
  if (existing && existing.reviewed) {
    const same = existing.monitoring === newAnalysis.monitoring
      && existing.relabels_standard === newAnalysis.relabels_standard
      && existing.post_hoc === newAnalysis.post_hoc
      && existing.derives_from_dome === newAnalysis.derives_from_dome;

    if (same) {
      unchanged++;
      continue;
    } else {
      conflicts.push({
        win: winId,
        existing,
        new: newAnalysis
      });
      // Curmudgeon review takes precedence
    }
  }

  console.log(`  ✅ WIN-${winId}: ${newAnalysis.monitoring} | relabel=${newAnalysis.relabels_standard} | post_hoc=${newAnalysis.post_hoc} | dome=${newAnalysis.derives_from_dome}`);
  win.code_analysis = newAnalysis;
  applied++;
}

console.log(`\n📊 Summary:`);
console.log(`   Reviews found:  ${reviewFiles.length}`);
console.log(`   Applied:        ${applied}`);
console.log(`   Unchanged:      ${unchanged}`);
console.log(`   Skipped:        ${skipped}`);
if (conflicts.length > 0) {
  console.log(`   Conflicts (overwritten): ${conflicts.length}`);
  conflicts.forEach(c => {
    console.log(`     WIN-${c.win}: ${c.existing.monitoring}→${c.new.monitoring}, relabel=${c.existing.relabels_standard}→${c.new.relabels_standard}, post_hoc=${c.existing.post_hoc}→${c.new.post_hoc}`);
  });
}

if (apply && applied > 0) {
  fs.writeFileSync(WINS_PATH, JSON.stringify(wins, null, 2) + '\n');
  console.log(`\n💾 Wrote ${WINS_PATH}`);

  if (syncWorkspace) {
    const wsDst = path.join(WORKSPACE, 'data/wins.json');
    if (fs.existsSync(path.dirname(wsDst))) {
      fs.copyFileSync(WINS_PATH, wsDst);
      console.log(`💾 Synced to ${wsDst}`);
    }
  }
} else if (!apply && applied > 0) {
  console.log(`\n🔍 Dry run — no files changed. Run with --apply to write.`);
} else if (applied === 0) {
  console.log(`\n✨ Nothing to apply — all tags are up to date.`);
}
