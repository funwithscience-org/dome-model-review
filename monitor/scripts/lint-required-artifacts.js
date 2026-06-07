#!/usr/bin/env node
/*
 * monitor/scripts/lint-required-artifacts.js (PROP-081, DIRECTIVE-20260606-002)
 *
 * Shared pre-push lint: refuses a push when the agent's required per-run
 * artifacts are missing from the outgoing diff. Generalizes PROP-080's
 * lint-close-records pattern to the whole "LLM narrates an artifact-write it
 * skipped" bug class (confirmed cases: PROP-076 lint bypass x3, 2026-06-06
 * prune-integrity report skip).
 *
 * Invocation (as a git pre-push hook, installed at clone setup):
 *   node monitor/scripts/lint-required-artifacts.js --required 'glob1,glob2'
 *
 * Each comma-separated glob must match >=1 path in `git diff --name-only
 * origin/main...HEAD`. Glob syntax: '*' matches within a path segment,
 * '**' matches across segments. Exit codes:
 *   0 — all required globs matched (or nothing outgoing at all)
 *   1 — at least one required glob unmatched: REFUSE the push
 *   0 (warn) — git/infra failure: FAIL-OPEN so load-bearing work is never
 *       stranded by lint infrastructure (unlike the artifact-missing case,
 *       which is exactly what we block).
 */
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const idx = args.indexOf('--required');
if (idx < 0 || !args[idx + 1]) {
  console.error('lint-required-artifacts: usage: --required <comma-separated globs>');
  process.exit(1);
}
const globs = args[idx + 1].split(',').map(s => s.trim()).filter(Boolean);

function globToRe(g) {
  var out = '';
  var SPECIALS = '.+^$(){}|[]';
  for (var i = 0; i < g.length; i++) {
    var ch = g.charAt(i);
    if (ch === '*') {
      if (g.charAt(i + 1) === '*') { out += '.*'; i++; } else { out += '[^/]*'; }
    } else if (SPECIALS.indexOf(ch) >= 0) {
      out += '\\' + ch;
    } else { out += ch; }
  }
  return new RegExp('^' + out + '$');
}

let changed;
try {
  try { execSync('git fetch origin main --quiet', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }); } catch (e) { /* offline: diff against last-known origin/main */ }
  changed = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8', timeout: 20000 })
    .split('\n').map(s => s.trim()).filter(Boolean);
} catch (e) {
  console.warn('lint-required-artifacts: WARN git diff failed (' + e.message.split('\n')[0] + ') — failing OPEN.');
  process.exit(0);
}

if (changed.length === 0) {
  // Nothing outgoing (no-op push / ref-only). Nothing to enforce.
  process.exit(0);
}

const missing = globs.filter(g => !changed.some(p => globToRe(g).test(p)));
if (missing.length === 0) {
  console.log('lint-required-artifacts: OK (' + globs.length + ' required artifact pattern(s) present in outgoing diff).');
  process.exit(0);
}

console.error('');
console.error('PUSH REFUSED — required per-run artifact(s) missing from outgoing commits:');
for (const g of missing) console.error('  MISSING: ' + g);
console.error('');
console.error('Your prompt documents these as required output for every run. Write the');
console.error('missing artifact file(s), `git add` them, amend or add a commit, and push');
console.error('again. Do NOT use --no-verify (FORBIDDEN — see PROP-080/PROP-081); if you');
console.error('believe this lint is wrong, leave a human note and let the operator decide.');
process.exit(1);
