#!/usr/bin/env node
/**
 * mark-prop-superseded.js — PROP-102 Q10 manual tool.
 *
 * Usage:
 *   node mark-prop-superseded.js PROP-008 by PROP-019 PROP-020
 *
 * Writes `superseded_by_props: ['PROP-019','PROP-020']` onto PROP-008's JSON
 * (additive, preserves all other fields). Does NOT flip status — that happens
 * automatically on the next tinker run if all listed superseding PROPs are in
 * a terminal-implemented status (Mechanism B reverse-form resolution).
 *
 * Operator-side helper for retroactively coding closures whose underlying
 * problem was solved by sibling work. The next tinker run picks it up.
 *
 * For directly closing a stale PROP whose own verification_pattern now passes,
 * use the operator-cowork bulk close pattern with obe_* metadata directly
 * (or wait for Mechanism A to enforce — same outcome).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (argv.length < 3 || argv[1] !== 'by') {
  console.error('usage: mark-prop-superseded.js <PROP-NNN> by <PROP-XXX> [<PROP-YYY> ...]');
  console.error('  example: node mark-prop-superseded.js PROP-008 by PROP-019 PROP-020');
  process.exit(1);
}

const targetId = argv[0];
const supersedingIds = argv.slice(2);

if (!/^PROP-/.test(targetId)) {
  console.error('target must start with PROP-');
  process.exit(1);
}
for (const sid of supersedingIds) {
  if (!/^PROP-/.test(sid)) {
    console.error('superseding id must start with PROP-: ' + sid);
    process.exit(1);
  }
}

const WORKSPACE = process.env.WORKSPACE || process.cwd();
const dir = path.join(WORKSPACE, 'monitor/tinker/proposals');

function findPropFile(propId) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(propId)) continue;
    if (!f.endsWith('.json')) continue;
    return f;
  }
  return null;
}

const targetFile = findPropFile(targetId);
if (!targetFile) {
  console.error('could not find proposal file for ' + targetId + ' in ' + dir);
  process.exit(1);
}

// Verify all superseding PROPs exist.
const missingSuperseding = [];
for (const sid of supersedingIds) {
  if (!findPropFile(sid)) missingSuperseding.push(sid);
}
if (missingSuperseding.length) {
  console.error('superseding PROPs not found: ' + missingSuperseding.join(', '));
  process.exit(1);
}

const targetPath = path.join(dir, targetFile);
const d = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

const existing = Array.isArray(d.superseded_by_props) ? d.superseded_by_props : [];
const merged = [...new Set([...existing, ...supersedingIds])];
const added = merged.filter(x => !existing.includes(x));

if (added.length === 0) {
  console.log(targetId + ' already lists all of ' + supersedingIds.join(', ') + ' in superseded_by_props; no change');
  process.exit(0);
}

d.superseded_by_props = merged;
const noteLine = 'marked superseded by ' + supersedingIds.join(' + ') + ' via mark-prop-superseded.js at ' + new Date().toISOString();
if (Array.isArray(d.mark_history)) d.mark_history.push(noteLine);
else d.mark_history = [noteLine];

const tmp = targetPath + '.mark-tmp';
fs.writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
fs.renameSync(tmp, targetPath);

console.log(targetId + ' superseded_by_props updated: added ' + added.join(', '));
console.log('  current value: ' + JSON.stringify(merged));
console.log('  next tinker run will auto-close ' + targetId + ' if all listed PROPs are terminal-implemented.');
