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
    // Static files: data, HTML, build scripts, CLAUDE.md, test suite.
    const staticSyncFiles = ['data/wins.json', 'data/sections.json', 'docs/index.html', 'build-scripts/generate-html.js', 'build-scripts/generate-pdf.js', 'CLAUDE.md', 'monitor/v6-restructure-map.json', 'test.js'];
    // Dynamic: every .md in monitor/prompts (recursively). This includes agent
    // prompts AND reference files AND workspace-sync.md. Previously we hardcoded
    // a short list that excluded workspace-sync.md and all reference files, which
    // meant fixes to those files never reached the workspace mount and the running
    // agents kept executing the stale versions (2026-04-09 PROP-003/004 regression).
    const promptFiles = [];
    const walkPrompts = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkPrompts(full);
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          promptFiles.push(path.relative(ROOT, full));
        }
      }
    };
    const promptsDir = path.join(ROOT, 'monitor/prompts');
    if (fs.existsSync(promptsDir)) walkPrompts(promptsDir);
    const syncFiles = [...staticSyncFiles, ...promptFiles];
    let synced = 0;
    for (const f of syncFiles) {
      const src = path.join(ROOT, f);
      const dst = path.join(workspace, f);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
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
