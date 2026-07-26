#!/usr/bin/env node
/**
 * check-ownership-registration-gap.js — PROP-141 Phase 2 (Option C)
 * DIRECTIVE-20260725-001 / lineage: ISS-3000 (check-wayback.js), ISS-3001
 * (clone-hygiene.sh), ISS-3011 (monitor/baseline/) — three instances of the
 * same defect class in one month: a file crosses the workspace<->git boundary
 * but is registered in NEITHER build.js OWNERSHIP NOR workspace-sync.md, so
 * git->FUSE propagation is structurally blind for it.
 *
 * READ-ONLY registration-gap lint. Flags files that:
 *   (a) were modified in git by agent-clone-sized commits in the last N days
 *       (bulk commits touching > --max-commit-files are skipped as
 *       imports/restructures, and the shallow-clone graft boundary commit is
 *       always excluded — in a --depth clone the boundary commit falsely
 *       presents the ENTIRE tree as added),
 *   (b) exist on FUSE (pass --fuse; if omitted, existence is not checked and
 *       results carry fuse_checked:false), and
 *   (c) appear in NEITHER build.js OWNERSHIP (file keys or directory-prefix
 *       keys, i.e. the append-only walked directories) NOR anywhere in
 *       monitor/prompts/workspace-sync.md (NEVER_PUSH, GIT_APPEND_ONLY, or
 *       explicit smart_copy special-cases) NOR the dynamic git-owned rule
 *       for monitor/prompts/**\/*.md.
 *
 * Allow-list (deliberately-unclassified multi-writer files per CLAUDE.md —
 * do NOT report these): monitor/curmudgeon/tracker.json,
 * monitor/analyst/expansion-tracker.json, monitor/analyst/attention-inbox.json.
 *
 * Scope: monitor/ and data/ only (the agent write surfaces; all three prior
 * incidents lived under monitor/).
 *
 * Exit codes (PROP-099/PROP-130 convention):
 *   0 = clean (no gaps)
 *   3 = gaps found -> caller emits findings[] category='ownership-registration-gap'
 *       severity=moderate
 *   2 = internal error -> caller reports canary-did-not-run (do NOT report clean)
 *
 * Invoke FROM A CLONE (this script is clone-invoked source code; registered
 * git-owned in build.js OWNERSHIP + workspace-sync.md NEVER_PUSH):
 *   node monitor/scripts/check-ownership-registration-gap.js \
 *     --workspace "$CLONE" --fuse "$WORKSPACE" [--days 14] [--max-commit-files 200]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const WORKSPACE = path.resolve(arg('--workspace', process.cwd()));
const FUSE = arg('--fuse', null);
const DAYS = parseInt(arg('--days', '14'), 10);
const MAX_COMMIT_FILES = parseInt(arg('--max-commit-files', '200'), 10);

const ALLOW = new Set([
  'monitor/curmudgeon/tracker.json',
  'monitor/analyst/expansion-tracker.json',
  'monitor/analyst/attention-inbox.json'
]);

try {
  // --- Registration surface 1: build.js OWNERSHIP ---
  const buildSrc = fs.readFileSync(path.join(WORKSPACE, 'build.js'), 'utf8');
  const ownMatch = buildSrc.match(/const OWNERSHIP = \{[\s\S]*?\n\};/);
  if (!ownMatch) throw new Error('could not locate OWNERSHIP object in build.js');
  const entries = [...ownMatch[0].matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => m[1]);
  const regFiles = new Set(entries.filter(p => !p.endsWith('/')));
  const regDirs = entries.filter(p => p.endsWith('/'));

  // --- Registration surface 2: workspace-sync.md (substring mention).
  // Deliberately loose: NEVER_PUSH + GIT_APPEND_ONLY arrays AND prose/code
  // special-cases (e.g. monitor/analyst/human-notes.json smart_copy) all
  // count as "registered somewhere". The gap class we hunt is files that
  // appear NOWHERE. ---
  const wsSyncMd = fs.readFileSync(
    path.join(WORKSPACE, 'monitor/prompts/workspace-sync.md'), 'utf8');

  // --- Shallow boundary commits (graft commits falsely present whole tree as added) ---
  let shallow = new Set();
  try {
    shallow = new Set(fs.readFileSync(path.join(WORKSPACE, '.git/shallow'), 'utf8')
      .split('\n').filter(Boolean));
  } catch (_) { /* full clone: no shallow file */ }

  // --- Candidates: files touched in last N days by normal-sized commits ---
  const log = cp.execSync(
    `git -C "${WORKSPACE}" log --since="${DAYS} days ago" ` +
    `--pretty=@%H%x09%ct%x09%s --name-only`,
    { maxBuffer: 256 * 1024 * 1024 }).toString();
  const commits = log.split('@').filter(Boolean).map(blk => {
    const lines = blk.split('\n');
    const [h, ct, s] = lines[0].split('\t');
    return { h, ct: +ct, subject: s || '', files: lines.slice(1).filter(Boolean) };
  });

  const skippedBulk = [];
  const touched = new Map(); // path -> {last_commit, last_commit_at, subject}
  for (const c of commits) {
    if (shallow.has(c.h)) {
      skippedBulk.push({ commit: c.h.slice(0, 8), files: c.files.length,
        reason: 'shallow-clone graft boundary (whole tree presents as added)' });
      continue;
    }
    if (c.files.length > MAX_COMMIT_FILES) {
      skippedBulk.push({ commit: c.h.slice(0, 8), files: c.files.length,
        reason: `bulk commit > ${MAX_COMMIT_FILES} files (import/restructure, not an agent-clone write)`,
        subject: c.subject.slice(0, 100) });
      continue;
    }
    for (const f of c.files) {
      if (!(f.startsWith('monitor/') || f.startsWith('data/'))) continue;
      if (!touched.has(f)) {
        touched.set(f, {
          last_commit: c.h.slice(0, 8),
          last_commit_at: new Date(c.ct * 1000).toISOString(),
          subject: c.subject.slice(0, 90)
        });
      }
    }
  }

  // --- Gap evaluation ---
  const gaps = [];
  for (const [f, info] of touched) {
    if (ALLOW.has(f)) continue;
    if (regFiles.has(f)) continue;                       // build.js OWNERSHIP file entry
    if (regDirs.some(d => f.startsWith(d))) continue;    // append-only walked directory
    if (/^monitor\/prompts\/.*\.md$/.test(f)) continue;  // dynamic git-owned rule
    if (wsSyncMd.includes(f)) continue;                  // mentioned in workspace-sync.md
    let onFuse = null;
    if (FUSE) {
      onFuse = fs.existsSync(path.join(FUSE, f));
      if (!onFuse) continue;                             // condition (b): must exist on FUSE
    }
    gaps.push({ path: f, on_fuse: onFuse, ...info });
  }
  gaps.sort((a, b) => a.path.localeCompare(b.path));

  const out = {
    event: 'ownership-registration-gap-lint',
    ts: new Date().toISOString(),
    window_days: DAYS,
    fuse_checked: !!FUSE,
    commits_walked: commits.length,
    commits_skipped_bulk: skippedBulk,
    candidates: touched.size,
    gap_count: gaps.length,
    gaps: gaps.slice(0, 40),
    truncated: gaps.length > 40
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(gaps.length > 0 ? 3 : 0);
} catch (e) {
  console.error('check-ownership-registration-gap: internal error: ' + (e && e.message));
  process.exit(2);
}
