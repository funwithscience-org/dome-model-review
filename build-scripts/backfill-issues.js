#!/usr/bin/env node
/**
 * backfill-issues.js — One-time script to create open-issues entries
 * for every curmudgeon hole that doesn't already have a matching issue.
 *
 * Uses the digest (pending-digest.json) as input, so it only processes
 * reviews not yet in the processed-reviews ledger.
 *
 * Usage:
 *   node build-scripts/backfill-issues.js --workspace /path/to/workspace [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let workspace = process.cwd();
const wsIdx = args.indexOf('--workspace');
if (wsIdx !== -1 && args[wsIdx + 1]) workspace = args[wsIdx + 1];
const dryRun = args.includes('--dry-run');

const DIGEST_PATH = path.join(workspace, 'monitor/curmudgeon/pending-digest.json');
const OPEN_ISSUES_PATH = path.join(workspace, 'monitor/decisions/open-issues.json');
const CLOSED_ISSUES_PATH = path.join(workspace, 'monitor/decisions/closed-issues.json');

const digest = JSON.parse(fs.readFileSync(DIGEST_PATH, 'utf8'));
const oi = JSON.parse(fs.readFileSync(OPEN_ISSUES_PATH, 'utf8'));

// Load closed issues for wontfix dedup — prevents re-raising issues that were
// deliberately rejected. Fixed issues are also included since re-raising a fixed
// issue would just create duplicate work.
let closedIssues = [];
try {
  const ci = JSON.parse(fs.readFileSync(CLOSED_ISSUES_PATH, 'utf8'));
  closedIssues = ci.issues || [];
} catch (e) {
  // No closed issues file yet — that's fine
}

// Find highest ISS number across both open and closed
const allIssues = [...oi.issues, ...closedIssues];
const maxIss = Math.max(...allIssues.map(i => parseInt(((i.issue_id || i.id || 'ISS-0').match(/\d+/) || ['0'])[0])), 0);
let nextIss = maxIss + 1;

// Build index of existing issues per WIN for dedup (includes closed/wontfix)
const existingByWin = {};
for (const issue of allIssues) {
  const w = String(issue.win_id || '');
  const norm = w.startsWith('WIN-') ? w : 'WIN-' + w.padStart(3, '0');
  if (!existingByWin[norm]) existingByWin[norm] = [];
  existingByWin[norm].push(issue);
}

// Fuzzy match: does an existing issue already cover this hole?
function isHoleCovered(hole, existingIssues) {
  if (!existingIssues || existingIssues.length === 0) return false;
  const holeText = (hole.summary + ' ' + hole.recommendation).toLowerCase();
  return existingIssues.some(iss => {
    const issText = (iss.description || '').toLowerCase();
    const issWords = issText.split(/\W+/).filter(w => w.length >= 5);
    const hits = issWords.filter(w => holeText.includes(w)).length;
    return hits >= 4;
  });
}

function normalizeSeverity(s) {
  const lower = (s || '').toLowerCase();
  const map = { critical: 'critical', major: 'major', high: 'major', moderate: 'moderate', minor: 'minor', low: 'minor', none: 'minor' };
  return map[lower] || 'moderate';
}

let created = 0;
let skippedDup = 0;
const newIssues = [];

for (const review of digest.pending_reviews) {
  const winId = review.win_id;
  const winNum = winId.replace('WIN-', '');
  const existing = existingByWin[winId] || [];

  for (const hole of review.holes) {
    if (isHoleCovered(hole, existing)) {
      skippedDup++;
      continue;
    }

    const issId = 'ISS-' + String(nextIss).padStart(3, '0');
    nextIss++;

    const issue = {
      id: issId,
      win_id: winNum,
      severity: normalizeSeverity(hole.severity),
      status: 'open',
      found_by: 'curmudgeon',
      found_at: review.reviewed_at,
      description: winId + ': ' + hole.summary,
      recommendation: hole.recommendation,
      affects_summary_table: hole.affects_summary_table,
      category: /\bcitation\b|DOI|404/i.test(hole.summary) ? 'citation' : 'accuracy'
    };

    newIssues.push(issue);
    // Add to existing index so subsequent holes in same WIN can dedup against it
    if (!existingByWin[winId]) existingByWin[winId] = [];
    existingByWin[winId].push(issue);
    created++;
  }
}

console.log(`${dryRun ? '[DRY RUN] ' : ''}Results:`);
console.log(`  Reviews scanned: ${digest.pending_reviews.length}`);
console.log(`  Holes found: ${digest.pending_reviews.reduce((s, r) => s + r.holes.length, 0)}`);
console.log(`  Already covered (skipped): ${skippedDup}`);
console.log(`  New issues created: ${created}`);
console.log(`  Issue IDs: ISS-${String(maxIss + 1).padStart(3, '0')} through ISS-${String(nextIss - 1).padStart(3, '0')}`);

if (!dryRun && newIssues.length > 0) {
  oi.issues.push(...newIssues);
  oi.last_updated = new Date().toISOString();
  fs.writeFileSync(OPEN_ISSUES_PATH, JSON.stringify(oi, null, 2));
  console.log(`\nWritten to ${OPEN_ISSUES_PATH}`);
  console.log(`Total open issues: ${oi.issues.length}`);
}

// Severity breakdown of new issues
const sevCounts = {};
newIssues.forEach(i => { sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1; });
console.log(`\nNew issue severity breakdown:`, sevCounts);
