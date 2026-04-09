#!/usr/bin/env node
/**
 * Unified build pipeline for the Dome Model Critical Review.
 *
 * Usage:
 *   node build.js          — Build HTML + PDF
 *   node build.js html     — Build HTML only
 *   node build.js pdf      — Build PDF only
 *   node build.js publish  — Build all + git commit + push
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const target = process.argv[2] || 'all';

function run(cmd, label) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`✅ ${label}`);
  } catch (e) {
    console.error(`❌ ${label} failed`);
    process.exit(1);
  }
}

function printTally() {
  const wins = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wins.json'), 'utf8'));
  const tally = {};
  wins.forEach(w => { tally[w.verdict] = (tally[w.verdict] || 0) + 1; });
  console.log(`\n📊 Verdict Tally (${wins.length} WINs):`);
  Object.entries(tally).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
}

// ── Main ──
printTally();

if (target === 'all' || target === 'html') {
  run('node build-scripts/generate-html.js', 'Generate HTML');
}

if (target === 'all' || target === 'pdf') {
  run('node build-scripts/generate-pdf.js', 'Generate PDF');
}

if (target === 'publish') {
  run('git add data/ docs/ downloads/ build-scripts/', 'Stage files');
  const msg = `Update review (auto-build ${new Date().toISOString().slice(0,10)})`;
  run(`git commit -m "${msg}\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`, 'Commit');
  run('git push origin main', 'Push to GitHub');

  // Sync key files to workspace (FUSE mount can't run git, but agents read from there).
  // Detect the current Cowork session dynamically so this works in every ephemeral
  // session — clean clones live under /sessions/<name>/dome-review-clean, so the
  // session name is always discoverable from cwd. Fallback: scan /sessions/*/mnt/
  // dome-model-review for any accessible workspace mount.
  let workspace = null;
  const sessionMatch = (process.cwd().match(/\/sessions\/([^/]+)/) || [])[1];
  if (sessionMatch) {
    const candidate = `/sessions/${sessionMatch}/mnt/dome-model-review`;
    if (fs.existsSync(candidate)) workspace = candidate;
  }
  if (!workspace) {
    try {
      const dirs = fs.readdirSync('/sessions');
      for (const d of dirs) {
        const c = `/sessions/${d}/mnt/dome-model-review`;
        try { if (fs.existsSync(c) && fs.readdirSync(c).length > 0) { workspace = c; break; } } catch {}
      }
    } catch {}
  }
  if (workspace) {
    console.log(`\n⏳ Sync to workspace (${workspace})...`);
    const syncFiles = ['data/wins.json', 'data/sections.json', 'docs/index.html', 'build-scripts/generate-html.js', 'build-scripts/generate-pdf.js', 'CLAUDE.md', 'monitor/v6-restructure-map.json', 'monitor/prompts/curmudgeon.md', 'monitor/prompts/analyst.md', 'monitor/prompts/decider.md', 'monitor/prompts/tinker.md', 'test.js'];
    let synced = 0;
    for (const f of syncFiles) {
      const src = path.join(ROOT, f);
      const dst = path.join(workspace, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        synced++;
      }
    }
    console.log(`✅ Sync to workspace (${synced} files)`);
  } else {
    console.log('\n⚠️  Workspace sync skipped: no accessible /sessions/*/mnt/dome-model-review found.');
  }
}

console.log('\n🎉 Build complete!');
