#!/usr/bin/env node
/**
 * mark-directive-superseded.js — PROP-108 Q8 backfill helper.
 *
 * Annotates PROPs with a `supersedes_directives` array so that
 * directive-auto-close.js's cross-lineage path can detect the linkage.
 *
 * Use when a PROP was authored from DIRECTIVE-Z but actually fulfills
 * the task of DIRECTIVE-Y (different directive). Today's canonical
 * cases:
 *
 *   PROP-101 (cost instrumentation) supersedes DIRECTIVE-20260614-002
 *     (Mode 3 line-count proxy — PROP-101 ships real per-token cost
 *      data so Mode 3's old proxy is OBE).
 *
 *   PROP-106 (EXP id hardening) supersedes DIRECTIVE-20260614-001
 *     (chronic expansion-tracker collisions — PROP-106 addresses the
 *      same root cause that DIRECTIVE-001 flagged, but PROP-106 was
 *      authored from DIRECTIVE-20260616-002).
 *
 * Usage:
 *   node monitor/scripts/mark-directive-superseded.js PROP-X by DIRECTIVE-Y [DIRECTIVE-Z ...]
 *
 *   PROP-X gets `supersedes_directives: ['DIRECTIVE-Y', 'DIRECTIVE-Z', ...]`
 *   added (or merged into existing field). Idempotent — re-running
 *   adds nothing if already present.
 *
 * Run from a fresh git clone; the script writes to PROP-X.json. The
 * operator commits + pushes.
 *
 * Exit codes:
 *   0 success
 *   1 PROP-X not found, malformed JSON, or argv parse error
 */

'use strict';
const fs = require('fs');
const path = require('path');

function usage() {
  process.stderr.write('usage: node mark-directive-superseded.js PROP-X by DIRECTIVE-Y [DIRECTIVE-Z ...]\n');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 3) usage();

const propId = args[0];
if (!/^PROP-\d+/.test(propId)) {
  process.stderr.write('mark-directive-superseded: first arg must be PROP-NNN; got "' + propId + '"\n');
  usage();
}

if (args[1] !== 'by') {
  process.stderr.write('mark-directive-superseded: second arg must be literal "by"; got "' + args[1] + '"\n');
  usage();
}

const directives = args.slice(2);
for (const d of directives) {
  if (!/^DIRECTIVE-/.test(d)) {
    process.stderr.write('mark-directive-superseded: directive arg must be DIRECTIVE-*; got "' + d + '"\n');
    usage();
  }
}

const PROPOSALS_DIR = path.join(process.cwd(), 'monitor/tinker/proposals');
if (!fs.existsSync(PROPOSALS_DIR)) {
  process.stderr.write('mark-directive-superseded: ' + PROPOSALS_DIR + ' not found — run from repo root\n');
  process.exit(1);
}

// Find the PROP file. Allow prefix match (PROP-108 → PROP-108-anything.json).
const candidates = fs.readdirSync(PROPOSALS_DIR).filter(
  f => f.endsWith('.json') && (f === propId + '.json' || f.startsWith(propId + '-') || f.startsWith(propId + '.'))
);
if (candidates.length === 0) {
  process.stderr.write('mark-directive-superseded: no PROP file matching "' + propId + '" in ' + PROPOSALS_DIR + '\n');
  process.exit(1);
}
if (candidates.length > 1) {
  process.stderr.write('mark-directive-superseded: multiple PROP files matched "' + propId + '": ' + candidates.join(', ') + '\n');
  process.exit(1);
}

const propPath = path.join(PROPOSALS_DIR, candidates[0]);
let prop;
try {
  prop = JSON.parse(fs.readFileSync(propPath, 'utf8'));
} catch (e) {
  process.stderr.write('mark-directive-superseded: failed to parse ' + propPath + ': ' + e.message + '\n');
  process.exit(1);
}

const existing = Array.isArray(prop.supersedes_directives) ? prop.supersedes_directives.slice() : [];
const merged = existing.slice();
let added = 0;
for (const d of directives) {
  if (!merged.includes(d)) { merged.push(d); added++; }
}

if (added === 0) {
  process.stderr.write('mark-directive-superseded: no changes — ' + propId + ' already supersedes all listed directives.\n');
  process.exit(0);
}

prop.supersedes_directives = merged;
try {
  fs.writeFileSync(propPath, JSON.stringify(prop, null, 2) + '\n');
} catch (e) {
  process.stderr.write('mark-directive-superseded: write failed for ' + propPath + ': ' + e.message + '\n');
  process.exit(1);
}

process.stderr.write(
  'mark-directive-superseded: ' + propId + '.supersedes_directives '
  + (existing.length ? 'extended from [' + existing.join(', ') + ']' : 'set')
  + ' to [' + merged.join(', ') + '] (+' + added + ').\n'
);
process.exit(0);
