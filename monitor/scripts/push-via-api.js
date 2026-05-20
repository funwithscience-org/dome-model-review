#!/usr/bin/env node
/**
 * push-via-api.js — Push files to GitHub via the Git Data API.
 *
 * Why this exists (PROP-050): in our scheduled-task environment, certain
 * sessions (most notably the one running as "Devilwench" identity) return
 * 403 on `git push origin main` despite the PAT having correct
 * `contents:write` scope (verified 2026-04-25 — see
 * HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001). The 403 is at git's HTTPS
 * push code path; the SAME PAT successfully calls the REST API. This
 * script is the fallback push path when `git push` 403s.
 *
 * Proven 2026-05-20 commit 7126e0fd: cowork-claude pushed docs/index.html
 * via this exact 6-call sequence with the same PAT that 403s on git push.
 *
 * Usage:
 *   node monitor/scripts/push-via-api.js \
 *     --files data/wins.json,docs/index.html \
 *     --message "Update review: WIN-070 caption fix" \
 *     [--repo funwithscience-org/dome-model-review] \
 *     [--branch main] \
 *     [--pat-env PAT]
 *
 * Reads from process.cwd() — invoke from your git clone root.
 *
 * Mechanism (6 REST calls per push):
 *   1) POST /git/blobs (per file)             → blob SHAs
 *   2) GET  /git/ref/heads/<branch>           → current head SHA
 *   3) GET  /git/commits/<head SHA>           → current tree SHA (for base_tree)
 *   4) POST /git/trees (base_tree + entries)  → new tree SHA
 *   5) POST /git/commits                      → new commit SHA
 *   6) PATCH /git/refs/heads/<branch>         → fast-forward ref (force:false)
 *
 * On 422 from step 6 (concurrent commit), retries ONCE from step 2.
 * On other errors, exits non-zero with diagnostic JSON to stderr.
 *
 * Files passed in --files that DO NOT exist on local disk are treated as
 * deletes (tree entry with sha:null). Files that exist are added/modified.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}

const files = (arg('files', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const message = arg('message', 'Auto-push via Git Data API');
const repo = arg('repo', 'funwithscience-org/dome-model-review');
const branch = arg('branch', 'main');
const patEnv = arg('pat-env', 'PAT');

if (files.length === 0) {
  console.error('push-via-api: --files is required (comma-separated paths relative to repo root)');
  process.exit(2);
}

let pat = process.env[patEnv];
if (!pat) {
  // Try to extract from local git remote (same pattern as workspace-sync.md Step 1).
  try {
    const remote = require('child_process').execSync('git remote get-url origin', { encoding: 'utf8' });
    const m = remote.match(/x-access-token:([^@]+)@/);
    if (m) pat = m[1];
  } catch (_) {}
}
if (!pat) {
  console.error(`push-via-api: PAT not found (checked $${patEnv} and git remote URL).`);
  process.exit(2);
}

const apiBase = `https://api.github.com/repos/${repo}`;
const headers = {
  'Authorization': `token ${pat}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'dome-model-review-push-via-api/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function gh(method, url, body) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = { _raw: text }; }
  if (!res.ok) {
    const err = new Error(`GitHub API ${method} ${url} returned ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function makeTreeEntry(filepath) {
  // tree entries with sha:null mean "delete this path"; tree entries with
  // sha:<blob-sha> mean "set this path to that blob's content". If a file
  // listed in --files is missing on local disk, we treat it as a delete.
  if (!fs.existsSync(filepath)) {
    return { path: filepath, sha: null, mode: '100644', type: 'blob' };
  }
  const buf = fs.readFileSync(filepath);
  const blob = await gh('POST', `${apiBase}/git/blobs`, {
    content: buf.toString('base64'),
    encoding: 'base64',
  });
  // Best-effort detect executable bit on local file.
  let mode = '100644';
  try {
    const st = fs.statSync(filepath);
    if ((st.mode & 0o111) !== 0) mode = '100755';
  } catch (_) {}
  return { path: filepath, sha: blob.sha, mode, type: 'blob' };
}

async function attempt() {
  // Step 1: create blobs / build tree entries.
  const treeEntries = [];
  for (const f of files) {
    treeEntries.push(await makeTreeEntry(f));
  }

  // Step 2: get current head SHA.
  const ref = await gh('GET', `${apiBase}/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;

  // Step 3: get head commit's tree SHA (for base_tree).
  const headCommit = await gh('GET', `${apiBase}/git/commits/${headSha}`);
  const baseTreeSha = headCommit.tree.sha;

  // Step 4: create new tree on top of base_tree.
  const newTree = await gh('POST', `${apiBase}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // Step 5: create the commit.
  const newCommit = await gh('POST', `${apiBase}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha],
  });

  // Step 6: update ref (force:false → 422 if non-fast-forward).
  await gh('PATCH', `${apiBase}/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
    force: false,
  });

  return newCommit.sha;
}

(async () => {
  try {
    let sha;
    try {
      sha = await attempt();
    } catch (e) {
      if (e.status === 422) {
        // Concurrent commit landed between Step 2 (fetch HEAD) and Step 6
        // (ref update). Retry once with a fresh HEAD; the new base_tree on
        // step 4 will incorporate the intervening commit. After one retry,
        // give up — same discipline as `git push origin main` (one attempt
        // after rebase, then human).
        console.error('push-via-api: 422 on ref update (concurrent commit). Retrying once with fresh HEAD.');
        sha = await attempt();
      } else {
        throw e;
      }
    }
    console.log(`push-via-api: pushed commit ${sha} to ${repo}@${branch}`);
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'push-via-api-failure',
      message: e.message,
      status: e.status || null,
      body: e.body || null,
      files,
      commit_message: message,
    }, null, 2));
    process.exit(1);
  }
})();
