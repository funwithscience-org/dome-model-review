#!/usr/bin/env node
/**
 * check-status-json-provenance.js — DIRECTIVE-20260711-001 / PROP-130 canary (INST-1)
 *
 * Read-only. Walks the last N commits touching monitor/status.json in the
 * local git history and detects field-level regressions and "chimera"
 * commits — a single commit in which one writer's field advanced while
 * another writer's field moved BACKWARD. That is the signature of the
 * status.json two-writer race (incident a88d026, 2026-07-09: decider's fresh
 * last_run + poller's poll fields reverted 5 days by a whole-file
 * mtime-driven FUSE->git copy; see ISS-2962 and
 * monitor/tinker/reports/workspace-sync-status-json-clobber-2026-07-10.md).
 *
 * Rules:
 *  - MONOTONIC timestamp fields (last_poll, last_run, last_analysis) must
 *    never move backward between consecutive commits.
 *  - consecutive_quiet_polls may reset to 0 (legit on a non-quiet poll) but a
 *    decrease to a NONZERO smaller value is a regression (5 -> 4 in incident).
 *  - chimera=true when the same commit-diff also ADVANCED >=1 monotonic field.
 *
 * Exit codes:
 *   0 — clean (no regression found in window)
 *   2 — insufficient history (<2 readable status.json versions in window;
 *       e.g. shallow-clone truncation) — liveness/insufficiency signal,
 *       NOT a race finding
 *   3 — canary FIRED: >=1 field regression detected; JSON details on stdout
 *
 * Usage:
 *   node monitor/scripts/check-status-json-provenance.js [--root <repo>] [--commits 30]
 *   node monitor/scripts/check-status-json-provenance.js --self-test
 *
 * Intended consumer: structure-integrity.md daily run (Section 9d).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const MONOTONIC = ['last_poll', 'last_run', 'last_analysis'];
const FILE = 'monitor/status.json';

function git(root, cmd) {
  return execSync('git ' + cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function analyze(root, nCommits) {
  let shas;
  try {
    shas = git(root, `log -n ${nCommits} --format=%H -- ${FILE}`).trim().split('\n').filter(Boolean);
  } catch (e) {
    return { rc: 2, reason: 'git log failed: ' + e.message.split('\n')[0] };
  }
  const versions = [];
  for (const sha of shas) {
    try {
      const raw = git(root, `show ${sha}:${FILE}`);
      const meta = git(root, `show -s --format='%cI|%s' ${sha}`).trim();
      const [date, ...subj] = meta.split('|');
      versions.push({ sha, date, subject: subj.join('|').slice(0, 100), json: JSON.parse(raw) });
    } catch (e) { /* unreadable/unparseable version: skip */ }
  }
  if (versions.length < 2) return { rc: 2, reason: `only ${versions.length} readable status.json version(s) in last ${nCommits} commits` };
  // versions[0] is newest; walk newest->oldest comparing each commit against its parent-version
  const findings = [];
  for (let i = 0; i < versions.length - 1; i++) {
    const cur = versions[i], prev = versions[i + 1];
    const regressed = [], advanced = [];
    for (const f of MONOTONIC) {
      const a = Date.parse(prev.json[f]), b = Date.parse(cur.json[f]);
      if (isNaN(a) || isNaN(b)) continue;
      if (b < a) regressed.push({ field: f, from: prev.json[f], to: cur.json[f] });
      if (b > a) advanced.push(f);
    }
    const qa = prev.json.consecutive_quiet_polls, qb = cur.json.consecutive_quiet_polls;
    if (Number.isFinite(qa) && Number.isFinite(qb) && qb < qa && qb !== 0) {
      regressed.push({ field: 'consecutive_quiet_polls', from: qa, to: qb });
    }
    if (regressed.length) {
      findings.push({ sha: cur.sha, date: cur.date, subject: cur.subject, regressed, chimera: advanced.length > 0, advanced_fields: advanced });
    }
  }
  return findings.length ? { rc: 3, findings, versions_checked: versions.length } : { rc: 0, versions_checked: versions.length };
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-prov-selftest-'));
  const sh = c => execSync(c, { cwd: dir, encoding: 'utf8' });
  const write = (o) => { fs.mkdirSync(path.join(dir, 'monitor'), { recursive: true }); fs.writeFileSync(path.join(dir, FILE), JSON.stringify(o, null, 1)); };
  try {
    sh('git init -q');
    sh('git config user.name t && git config user.email t@t');
    const T = n => `2026-07-0${n}T00:00:00Z`;
    write({ last_poll: T(1), last_run: T(1), last_analysis: T(1), consecutive_quiet_polls: 1 });
    sh('git add -A && git commit -qm c1');
    write({ last_poll: T(2), last_run: T(1), last_analysis: T(1), consecutive_quiet_polls: 2 });
    sh('git add -A && git commit -qm "c2 poller advance"');
    write({ last_poll: T(2), last_run: T(3), last_analysis: T(1), consecutive_quiet_polls: 2 });
    sh('git add -A && git commit -qm "c3 decider advance"');
    const clean = analyze(dir, 30);
    if (clean.rc !== 0) { console.error('SELF-TEST FAIL: clean history returned rc=' + clean.rc, JSON.stringify(clean)); return 1; }
    // chimeric commit: last_run advances, poll fields revert (a88d026 shape)
    write({ last_poll: T(1), last_run: T(4), last_analysis: T(1), consecutive_quiet_polls: 1 });
    sh('git add -A && git commit -qm "c4 workspace-sync chimera"');
    const dirty = analyze(dir, 30);
    if (dirty.rc !== 3) { console.error('SELF-TEST FAIL: chimeric history returned rc=' + dirty.rc); return 1; }
    const f = dirty.findings[0];
    if (!f.chimera || !f.regressed.some(r => r.field === 'last_poll') || !f.regressed.some(r => r.field === 'consecutive_quiet_polls')) {
      console.error('SELF-TEST FAIL: chimera finding malformed:', JSON.stringify(f)); return 1;
    }
    console.log('SELF-TEST PASS: clean rc=0, chimera rc=3 with chimera=true on last_poll + consecutive_quiet_polls');
    return 0;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

if (process.argv.includes('--self-test')) process.exit(selfTest());
const res = analyze(path.resolve(arg('root', '.')), parseInt(arg('commits', '30'), 10));
console.log(JSON.stringify(res, null, 1));
process.exit(res.rc);
