#!/usr/bin/env node
/**
 * build-git-deleted-set.js — PROP-113 Fix B (helper-script extraction, PROP-066 pattern).
 *
 * Builds the GIT_DELETED_SET (one repo-relative path per line, sorted+unique)
 * that workspace-sync's smart_copy consults to skip resurrecting prune-tombstoned
 * integrity artifacts. Replaces the inline `for archive; node -e; awk; sort -u`
 * pipeline in workspace-sync.md.
 *
 * HARDENING over the inline version (the bug PROP-113 Fix B closes):
 *   1. Per-line JSON parse with malformed-fragment tolerance — a record that
 *      does not parse is skipped, never emitted as a raw string. (The inline
 *      node fallback already did this, but the awk stage downstream could still
 *      receive multi-line .file values; here extraction + validation are fused.)
 *   2. Path-shape validation. Every candidate path must match
 *      ^monitor/integrity/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$  (after the bare-
 *      basename -> monitor/integrity/ prefixing). Anything else (embedded
 *      newlines, prose fragments, absolute paths, .. traversal) is dropped and
 *      counted in `rejected`. This is what stops garbage strings from inflating
 *      the set to the 70375-vs-20631 overcount that escaped PROP-103.
 *   3. A `.file` value containing a newline is itself rejected wholesale (it
 *      can only be corruption) rather than split into fragments.
 *
 * Output contract: writes the sorted-unique path list to --out (or stdout if
 * --out omitted). Prints a one-line JSON summary to stderr:
 *   {records_seen, parse_failures, paths_emitted, rejected}
 * Exit 0 always (a build failure must degrade to an empty set so the PROP-103
 * lower-bound gate fail-closes; it must NEVER hard-error workspace-sync).
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const IDIR = arg('--integrity-dir', 'monitor/integrity');
const OUT = arg('--out', null);
const PATH_RE = /^monitor\/integrity\/[A-Za-z0-9._:-]+(\/[A-Za-z0-9._:-]+)*$/;

let recordsSeen = 0, parseFailures = 0, rejected = 0;
const paths = new Set();

let archives = [];
try {
  archives = fs.readdirSync(IDIR).filter(f => f.endsWith('-archive.jsonl'));
} catch (e) {
  // No integrity dir / archives yet (fresh repo). Emit empty set, exit 0.
  if (OUT) { try { fs.writeFileSync(OUT, ''); } catch (_) {} }
  process.stderr.write(JSON.stringify({ records_seen: 0, parse_failures: 0, paths_emitted: 0, rejected: 0, note: 'no archive dir' }) + '\n');
  process.exit(0);
}

for (const a of archives) {
  let content;
  try { content = fs.readFileSync(path.join(IDIR, a), 'utf8'); } catch (e) { continue; }
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    recordsSeen++;
    let rec;
    try { rec = JSON.parse(line); } catch (e) { parseFailures++; continue; }
    let f = rec && rec.file;
    if (typeof f !== 'string' || !f) { rejected++; continue; }
    // A .file value can only ever be a single path. A newline in it is corruption.
    if (f.indexOf('\n') !== -1 || f.indexOf('\r') !== -1) { rejected++; continue; }
    // Prefix bare basenames to repo-relative, matching smart_copy's expectation.
    const candidate = f.indexOf('/') !== -1 ? f : ('monitor/integrity/' + f);
    if (!PATH_RE.test(candidate)) { rejected++; continue; }
    // Reject path-traversal: a '..' segment passes PATH_RE (dots are allowed in
    // names) but must never enter the deletion-authority set.
    if (candidate.split('/').indexOf('..') !== -1) { rejected++; continue; }
    paths.add(candidate);
  }
}

const sorted = Array.from(paths).sort();
const body = sorted.length ? sorted.join('\n') + '\n' : '';
if (OUT) {
  try { fs.writeFileSync(OUT, body); }
  catch (e) { process.stderr.write('build-git-deleted-set: write failed: ' + e.message + '\n'); /* leave OUT as-is/empty */ }
} else {
  process.stdout.write(body);
}
process.stderr.write(JSON.stringify({
  records_seen: recordsSeen, parse_failures: parseFailures,
  paths_emitted: sorted.length, rejected: rejected
}) + '\n');
process.exit(0);
