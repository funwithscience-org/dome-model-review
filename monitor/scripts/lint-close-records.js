#!/usr/bin/env node
/*
 * monitor/scripts/lint-close-records.js (PROP-076)
 *
 * Pre-push lint gate for decider-driven closures. Refuses to push when
 * newly-added closed-issues.json entries violate the PROP-059 discipline
 * (every decider-self-apply* close must carry verification_pattern OR
 * audit_grandfathered).
 *
 * The PROP-059 prompt-level rule has been in place since 2026-05-25, but
 * the LLM keeps bypassing it by improvising bespoke fixed_by strings
 * (e.g. 'decider-self-apply-EXP-450-H1-wuhan-removed') and omitting the
 * verification_pattern field. The daily integrity audit catches these
 * the next morning; this script catches them at push time.
 *
 * Invocation (from decider's clone, after committing close-records,
 * BEFORE `git push`):
 *
 *   node monitor/scripts/lint-close-records.js
 *
 * Exit codes:
 *   0 — all newly-added close-records pass (or none added this commit)
 *   1 — at least one violation; refuse to push
 *
 * Detection logic mirrors structure-integrity.md Step 7h. Compare local
 * HEAD's closed-issues.json against origin/main's copy; for every entry
 * present locally but NOT in origin (newly-added), apply the Mech-A-bypass
 * filter:
 *   - status in {'fixed', 'fixed-pending-verification'}
 *   - fixed_by startsWith 'decider-'
 *   - fixed_by does NOT contain any of: operator-direct, burndown,
 *     sweep, wontfix, -OBE-, EXP-integrated, exp-integrated
 *   - verification_pattern is null/empty AND audit_grandfathered is
 *     absent/empty
 * If any entry hits all four conditions, exit 1 with the IDs.
 *
 * Recovery path on exit 1: either
 *   (a) re-write the close-record with the canonical pattern (set
 *       fixed_by='decider-self-apply', add verification_pattern that
 *       grep-matches the patch's replace fingerprint); or
 *   (b) explicitly mark audit_grandfathered=<reason-string> for design-
 *       intentional bulk-close paths (archive-terminal-exps,
 *       verification-batch, exp553-phantom-fix, verified-H7-already, and
 *       similar one-off cleanups that don't fit the canonical pattern).
 */

'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const OBE_SUBS = [
  'operator-direct', 'burndown', 'sweep', 'wontfix',
  '-OBE-', 'EXP-integrated', 'exp-integrated'
];

function isOBE(fixedBy) {
  return OBE_SUBS.some(s => fixedBy.includes(s));
}

function loadOriginClosedIds() {
  try {
    const out = execSync(
      'git show origin/main:monitor/decisions/closed-issues.json',
      { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 }
    );
    const j = JSON.parse(out);
    const arr = j.issues || j;
    return new Set(arr.map(i => i.id));
  } catch (e) {
    console.error('lint-close-records: could not load origin/main closed-issues.json: ' + e.message);
    console.error('lint-close-records: treating as "first commit" — auditing ALL local entries');
    return new Set();
  }
}

function main() {
  const path = 'monitor/decisions/closed-issues.json';
  if (!fs.existsSync(path)) {
    console.error('lint-close-records: ' + path + ' not found; nothing to lint');
    process.exit(0);
  }
  const localJ = JSON.parse(fs.readFileSync(path, 'utf8'));
  const localArr = localJ.issues || localJ;
  const originIds = loadOriginClosedIds();
  const newlyAdded = localArr.filter(i => !originIds.has(i.id));

  const violations = newlyAdded.filter(i =>
    (i.status === 'fixed' || i.status === 'fixed-pending-verification') &&
    typeof i.fixed_by === 'string' &&
    i.fixed_by.startsWith('decider-') &&
    !isOBE(i.fixed_by) &&
    (i.verification_pattern == null || String(i.verification_pattern).trim() === '') &&
    (i.audit_grandfathered == null || String(i.audit_grandfathered).trim() === '')
  );

  if (violations.length === 0) {
    console.log('lint-close-records: pass (' + newlyAdded.length + ' newly-added entries, 0 violations)');
    process.exit(0);
  }

  console.error('═══════════════════════════════════════════════════════════');
  console.error('PROP-076 PRE-PUSH LINT GATE — FAIL');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(violations.length + ' newly-added close-record(s) lack BOTH verification_pattern AND audit_grandfathered:');
  for (const v of violations) {
    console.error('  - ' + v.id + ' | fixed_by=' + v.fixed_by + ' | status=' + v.status);
  }
  console.error('');
  console.error('Recovery: edit closed-issues.json so each violation has EITHER');
  console.error('  (a) non-empty verification_pattern (canonical close template — see');
  console.error('      decider-patches-and-selfapply.md L596-642), OR');
  console.error('  (b) non-empty audit_grandfathered (with reason; for design-intentional');
  console.error('      bulk-close paths that do not have a single fingerprint).');
  console.error('');
  console.error('REFUSE TO PUSH. Re-stage closed-issues.json after edits, amend the commit,');
  console.error('re-run this script. If you cannot construct a verification_pattern at all,');
  console.error('revert the close-record (move the ISS back to open-issues.json) rather than');
  console.error('shipping a Mech-A-bypass.');
  process.exit(1);
}

main();
