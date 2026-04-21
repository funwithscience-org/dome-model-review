#!/usr/bin/env node
/**
 * Unified build pipeline for the Dome Model Critical Review.
 *
 * Usage:
 *   node build.js          — Build HTML + PDF
 *   node build.js html     — Build HTML only
 *   node build.js pdf      — Build PDF only
 *   node build.js publish  — Build all + git commit + push + workspace sync
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const target = process.argv[2] || 'all';

// Valid targets. 'sync-workspace' is PROP-010: run only the git→workspace
// sync block so post-push callers (decider self-apply) can refresh FUSE
// without paying the HTML/PDF regen + commit/push cost of 'publish'.
const VALID_TARGETS = new Set(['all', 'html', 'pdf', 'publish', 'sync-workspace']);
if (!VALID_TARGETS.has(target)) {
  console.error(`❌ Unknown target '${target}'. Valid: ${[...VALID_TARGETS].join(', ')}`);
  process.exit(2);
}

// ── File ownership table (Phase 1, Change 1.1) ──
//
// Every file that crosses the workspace↔git boundary is classified here.
// Three categories:
//   - 'git'           : authoritative in git. publish copies git → workspace.
//                       workspace-sync MUST NEVER copy this file back (see
//                       workspace-sync.md's is_git_owned guard, Change 1.2).
//   - 'workspace'     : authoritative on the workspace FUSE mount.
//                       publish does NOT copy this file in either direction
//                       — workspace-sync owns the workspace→git push.
//   - 'append_only'         : directory of files that are immutable once
//                             created. Either direction can write a NEW
//                             file, but never overwrite an existing one.
//   - 'append_only_glob'    : same, but the walker accepts any file and lets
//                             the glob-style matching in workspace-sync.md
//                             pick out the timestamped/per-ID files.
//
// A file that is NOT listed here is outside the build-direction contract.
// The one deliberate omission is `monitor/curmudgeon/tracker.json`, which
// is a multi-writer file (decider + curmudgeon) and is protected only by
// scheduling discipline, the git-pull-rebase prelude, the pre-push
// integrity gate, and git merge-conflict detection. DO NOT classify it
// here — a misclassification will cause publish to error on direction
// violation when decider pushes to it. See CLAUDE.md "File Ownership
// Rules" for the full reasoning.
const OWNERSHIP = {
  // git-owned: build.js publish copies git → workspace
  'data/wins.json': 'git',
  'data/sections.json': 'git',
  'data/uncounted-failures.json': 'git',
  'data/predictions.json': 'git',
  'docs/index.html': 'git',
  'docs/llms.txt': 'git',        // Social drafts updates to monitor/social/drafts/; decider commits to docs/
  'docs/sitemap.xml': 'git',     // Same pattern — social drafts, decider commits
  'docs/robots.txt': 'git',      // Same pattern — social drafts, decider commits
  'build-scripts/generate-html.js': 'git',
  'build-scripts/generate-pdf.js': 'git',
  'build-scripts/digest-reviews.js': 'git',
  'build-scripts/fix-json-quotes.js': 'git',
  'build-scripts/archive-old-reports.js': 'git',
  'build.js': 'git',
  'CLAUDE.md': 'git',
  'monitor/v6-restructure-map.json': 'git',
  'test.js': 'git',
  'monitor/decisions/open-issues.json': 'git',
  'monitor/decisions/closed-issues.json': 'git',
  // PROP-009r2 C-1: enforcement-toggle flag, git-owned so build.js publish copies
  // it from clone to workspace. The file's presence = enforce; absence = shadow.
  // Created via `touch && git add && git commit`; removed via `git rm && commit`.
  'monitor/decisions/prop-009-enforce.flag': 'git',
  'monitor/curmudgeon/priority-queue.json': 'git',
  // Direction-guard skip log (Phase 1 Change 1.8). Authoritatively written
  // by workspace-sync from its clone (fs.appendFileSync → git add -A → push),
  // read by structure-integrity Section 7d from the workspace mount. MUST
  // be classified 'git' even though it lives under monitor/integrity/ (which
  // is 'append_only' for the per-run report-*.json files), because:
  //   (a) walkAppendOnly filters by extension '.json' and '.jsonl'.endsWith('.json')
  //       is false, so a growing .jsonl log inside an append_only directory is
  //       NEVER copied by the walker — it would be born dead in the workspace;
  //   (b) the log grows in place (not per-run immutable files), so append_only
  //       semantics (if (fs.existsSync(dst)) continue) would freeze integrity's
  //       view at the first copy anyway.
  // The 'git' override forces unconditional git→workspace copy every publish,
  // so integrity 7d sees fresh skip records. The same-named entry in
  // workspace-sync.md's OWNED_BY_GIT array does NOT regress the writer:
  // workspace-sync writes via fs.appendFileSync directly, not smart_copy, so
  // the direction guard never fires on the authoritative writer.
  'monitor/integrity/workspace-sync-skips.jsonl': 'git',

  // workspace-owned: workspace-sync owns direction; build.js does NOT sync these
  'monitor/status.json': 'workspace',
  'monitor/review-state.json': 'workspace',
  'monitor/decisions/morning-briefing.txt': 'workspace',
  // NOTE: monitor/curmudgeon/tracker.json is DELIBERATELY NOT listed here.
  // It is a multi-writer file (decider + curmudgeon) and belongs in a future
  // Phase 2 shard split. Until then it is protected only by scheduling
  // discipline (Change 1.5), the pre-push integrity gate (Change 1.6), and
  // git's merge-conflict detection, NOT by an ownership rule. Do not add it
  // — misclassifying it will cause publish to bail on direction violation
  // when decider pushes to it.

  // append_only directories (recursive; new files only, never overwrite)
  'monitor/curmudgeon/reviews/': 'append_only',
  'monitor/analyst/new-wins/': 'append_only',
  'monitor/analyst/expansions/': 'append_only',
  'monitor/analyst/category-proposals/': 'append_only',
  'monitor/analyst/issue-proposals/': 'append_only',
  'monitor/analyst/globe-fingerprints/': 'append_only',
  'monitor/decisions/': 'append_only_glob',   // daily-report-*.json, suggested-patches-*.json
  'monitor/tinker/': 'append_only_glob',      // report-*.json
  'monitor/tinker/proposals/': 'append_only',
  'monitor/integrity/': 'append_only',
  'monitor/changes/': 'append_only',
  'monitor/social/drafts/': 'append_only',
};

// Dynamic category: all .md files under monitor/prompts/ are git-owned.
// These are walked at publish time (same walker as the pre-Phase-1 build.js)
// and each is treated as if it were listed above with category 'git'.
const PROMPTS_DIR = 'monitor/prompts';

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

// Phase 1 Change 1.4: tolerate "nothing to commit" (Bug X1 fix).
// The pre-Phase-1 publish flow hard-failed on `git commit` when nothing
// was staged in data/docs/downloads/build-scripts, which meant any
// prompts-only commit silently skipped the workspace-sync block. The
// new helper accepts an array of "tolerate" substrings and treats a
// matching non-zero exit as a soft success so the sync block still runs.
//
// Git emits two different messages depending on the working tree state:
//   * "nothing to commit, working tree clean"  (tree is fully clean)
//   * "no changes added to commit"             (unstaged changes exist
//                                                but nothing was staged
//                                                by `git add data/ ...`)
// Both mean "publish has nothing to publish from data/docs/..." and both
// must be tolerated, otherwise the sync block is silently skipped.
function runTolerant(cmd, label, tolerateSubstrings) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    console.log(`✅ ${label}`);
    return true;
  } catch (e) {
    const stderr = (e.stderr || '').toString();
    const stdout = (e.stdout || '').toString();
    const blob = stderr + stdout;
    const needles = Array.isArray(tolerateSubstrings)
      ? tolerateSubstrings
      : (tolerateSubstrings ? [tolerateSubstrings] : []);
    if (needles.some(s => blob.includes(s))) {
      console.log(`✅ ${label} (nothing to do)`);
      return false;
    }
    console.error(`❌ ${label} failed`);
    if (stderr) console.error(stderr);
    if (stdout) console.error(stdout);
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

// Phase 1 Change 1.1: scan the clone for workspace-classified files with
// local modifications. This catches a buggy prompt that edited a file from
// the wrong side. It is a loud warning, not a hard failure — the goal is
// to surface the bug without wedging the pipeline.
function checkDirectionViolations() {
  let output = '';
  try {
    output = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    // Not a git checkout, or git unavailable — skip the check.
    return 0;
  }
  const modified = output
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
  let violations = 0;
  for (const f of modified) {
    if (OWNERSHIP[f] === 'workspace') {
      console.warn(`⚠️  DIRECTION VIOLATION: ${f} is classified 'workspace' but the clone has local modifications to it. Did a writer accidentally edit a workspace-owned file from the clone? These modifications will NOT be pushed by this build.`);
      violations++;
    }
  }
  return violations;
}

// ── Main ──
printTally();

if (target === 'all' || target === 'html') {
  run('node build-scripts/generate-html.js', 'Generate HTML');
}

if (target === 'all' || target === 'pdf') {
  run('node build-scripts/generate-pdf.js', 'Generate PDF');
}

// PROP-010: extracted sync-to-workspace logic so publish and the new
// lightweight sync-workspace target can share it. No behavior change vs.
// the prior inlined block — same session detection, same OWNERSHIP-driven
// copy loop, same prompts walker, same log format.
function syncToWorkspace() {
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
  if (!workspace) {
    console.log('\n⚠️  Workspace sync skipped: no accessible /sessions/*/mnt/dome-model-review found.');
    return { synced: 0, newAppendOnly: 0, skippedWorkspace: 0, workspace: null };
  }
  console.log(`\n⏳ Sync to workspace (${workspace})...`);

  let synced = 0;
  let skippedWorkspace = 0;
  let newAppendOnly = 0;

  const copyIfExists = (relPath) => {
    const src = path.join(ROOT, relPath);
    const dst = path.join(workspace, relPath);
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    return true;
  };

  const walkAppendOnly = (relDir, globExt) => {
    const absDir = path.join(ROOT, relDir);
    if (!fs.existsSync(absDir)) return;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.isFile()) continue;
        if (globExt && !entry.name.endsWith(globExt)) continue;
        const rel = path.relative(ROOT, full);
        const dst = path.join(workspace, rel);
        if (fs.existsSync(dst)) continue;
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(full, dst);
        newAppendOnly++;
      }
    };
    walk(absDir);
  };

  for (const [entry, category] of Object.entries(OWNERSHIP)) {
    if (category === 'git') {
      if (copyIfExists(entry)) synced++;
    } else if (category === 'workspace') {
      console.log(`   · skip (workspace-owned): ${entry}`);
      skippedWorkspace++;
    } else if (category === 'append_only') {
      walkAppendOnly(entry, '.json');
    } else if (category === 'append_only_glob') {
      walkAppendOnly(entry, null);
    }
  }

  const promptsAbs = path.join(ROOT, PROMPTS_DIR);
  if (fs.existsSync(promptsAbs)) {
    const walkPrompts = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkPrompts(full);
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          const rel = path.relative(ROOT, full);
          if (copyIfExists(rel)) synced++;
        }
      }
    };
    walkPrompts(promptsAbs);
  }

  console.log(`✅ Sync to workspace (${synced} git-owned files copied, ${newAppendOnly} new append-only files, ${skippedWorkspace} workspace-owned entries skipped)`);
  return { synced, newAppendOnly, skippedWorkspace, workspace };
}

if (target === 'sync-workspace') {
  // PROP-010: lightweight post-push sync. No HTML/PDF regen, no git ops —
  // just refresh the FUSE workspace from the current clone state. Intended
  // to be called by decider after `git push origin main` so agents reading
  // from FUSE never see content older than the most recent push.
  syncToWorkspace();
} else if (target === 'publish') {
  // Surface any direction violations before touching git.
  checkDirectionViolations();

  run('git add data/ docs/ downloads/ build-scripts/', 'Stage files');
  const msg = `Update review (auto-build ${new Date().toISOString().slice(0,10)})`;
  const committed = runTolerant(
    `git commit -m "${msg}\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`,
    'Commit',
    ['nothing to commit', 'no changes added to commit']
  );
  if (committed) {
    run('git push origin main', 'Push to GitHub');
    // Run git gc --auto after push to prevent pack-file bloat. The --auto flag
    // is cheap when not needed (fast check of loose-object threshold) and only
    // actually repacks when git itself decides it's worth it. Silent by default.
    // We observed 72MB → 13MB savings after one aggressive gc on 2026-04-15, which
    // was the accumulation of ~9 days of pack drift. Weekly+ auto-gc prevents that.
    runTolerant('git gc --auto --quiet', 'Git GC (if needed)', ['']);
  }

  syncToWorkspace();
}

console.log('\n🎉 Build complete!');
