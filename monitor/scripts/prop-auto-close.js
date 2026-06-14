#!/usr/bin/env node
/**
 * prop-auto-close.js — PROP-102 Phase 0 (shadow) + Phase 1 (enforce gated by flag).
 *
 * Walks every PROP in monitor/tinker/proposals/ and applies two mechanisms:
 *
 *   Mechanism A — auto-close on verification_pattern PASS (Case 1):
 *     PROP's own verification_pattern returns "FIXED" cleanly → flip status to
 *     'implemented' with obe_* closure metadata. Grade-gated: only grade-A
 *     patterns (unambiguous "FIXED"/"STILL_BROKEN" markers) are trusted.
 *
 *   Mechanism B — deliberate-supersedes graph (Case 2):
 *     PROP declares supersedes_props or superseded_by_props referencing
 *     sibling PROPs in a terminal-implemented status → flip status to
 *     'superseded-by-PROP-X' with edge metadata.
 *
 * Shadow vs enforce:
 *   Phase 0 (default — flag absent): logs would-close candidates to the
 *     ledger with dryrun:true, writes zero changes to PROP files.
 *   Phase 1 (flag present): writes status flip + obe_* metadata to PROP file,
 *     ledger row dryrun:false.
 *
 * Exit codes: 0 success; non-zero only on input-data errors.
 * Non-fatal to the calling agent: failures log to stderr and exit 0.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const flag = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const WORKSPACE = flag('--workspace', process.cwd());
const PROPOSALS_DIR = path.join(WORKSPACE, 'monitor/tinker/proposals');
const LEDGER_PATH = path.join(WORKSPACE, 'monitor/tinker/prop-auto-close-ledger.jsonl');
const ENFORCE_FLAG = path.join(WORKSPACE, 'monitor/tinker/prop-auto-close-enforce.flag');
const RUN_ID = process.env.TINKER_RUN_ID
  || ('tinker-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16) + 'Z');

const ENFORCE = fs.existsSync(ENFORCE_FLAG);

// ──────────────────────────────────────────────────────────────────────
// PROP-102 Mechanism A: whitelist / denylist for status transitions.
// ──────────────────────────────────────────────────────────────────────

const WHITELIST_STATUSES = new Set([
  'proposed',
  'design-pending-operator-review',
  'pending-operator-review',
  'implementation-pending-operator-review',
]);

const DENYLIST_EXPLICIT = new Set([
  'operator-approved', 'approved', 'integrated', 'implemented', 'applied',
  'self-applied', 'completed', 'superseded', 'wont-fix-not-worth-it',
]);

const DENYLIST_PATTERNS = [
  /^approved-/, /^superseded-/, /^superseded-by-/, /^deferred-/, /^partially-/,
  /^phase-.*-implemented-phase-.*-pending-/, /^phase-.*-deferred/,
  /^c1-implemented-/, /-implemented-.*-deferred$/,
];

function isStatusEligible(status) {
  if (!status) return false;
  if (DENYLIST_EXPLICIT.has(status)) return false;
  for (const re of DENYLIST_PATTERNS) if (re.test(status)) return false;
  return WHITELIST_STATUSES.has(status);
}

function isFieldGated(prop) {
  if (prop.requires_human_judgment === true) return true;
  if (prop.do_not_auto_close === true) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// PROP-102 Q2: verification_pattern quality grading.
//
//   Grade A: contains BOTH "echo FIXED" and "echo STILL_BROKEN" markers
//            (unambiguous binary outcome encoded in the pattern itself).
//            Trustable for auto-close.
//
//   Grade B: contains test -f / test -d (file-existence) but no FIXED
//            marker. Ambiguous — file may exist for unrelated reasons.
//            Emit soft finding on PASS, never auto-close.
//
//   Grade C: anything else — network calls (curl/wget/http), no clear
//            pass/fail, or empty/missing. Never auto-trust.
// ──────────────────────────────────────────────────────────────────────

function gradePattern(vp) {
  if (!vp || typeof vp !== 'string' || vp.trim() === '') return 'C';
  // Network / time-dependent → grade C regardless of marker presence.
  if (/\b(curl|wget|http:|https:|ping|nslookup|nc -|date \+)/.test(vp)) return 'C';
  const hasFixed = vp.includes('echo FIXED');
  const hasBroken = vp.includes('echo STILL_BROKEN');
  if (hasFixed && hasBroken) return 'A';
  if (/\btest -[fd]\b/.test(vp)) return 'B';
  return 'C';
}

// ──────────────────────────────────────────────────────────────────────
// Mechanism A: run the verification_pattern, look for "FIXED" in stdout.
// ──────────────────────────────────────────────────────────────────────

function runVerification(vp) {
  try {
    const out = execSync(vp, {
      cwd: WORKSPACE,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exit: 0, output: String(out).trim() };
  } catch (e) {
    return {
      exit: e.status || 1,
      output: String((e.stdout || '') + (e.stderr || '')).trim(),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Mechanism B: supersedes graph resolution.
//
//   Forward: PROP-X.supersedes_props = ['PROP-Y', ...] declared on the
//            NEW PROP at authorship time. If PROP-X is terminal-implemented,
//            PROP-Y is auto-closable as superseded-by-PROP-X.
//
//   Reverse: PROP-Y.superseded_by_props = ['PROP-X', ...] written retro-
//            actively (e.g. via mark-prop-superseded.js). If ALL listed
//            superseding PROPs are terminal-implemented, auto-close PROP-Y.
// ──────────────────────────────────────────────────────────────────────

const TERMINAL_IMPLEMENTED_STATUSES = new Set([
  'implemented', 'integrated', 'applied', 'self-applied', 'completed',
]);
const TERMINAL_IMPLEMENTED_PATTERNS = [
  /^implemented/, /^phase-.*-implemented/, /^c1-implemented/,
];

function isTerminalImplemented(status) {
  if (!status) return false;
  if (TERMINAL_IMPLEMENTED_STATUSES.has(status)) return true;
  for (const re of TERMINAL_IMPLEMENTED_PATTERNS) if (re.test(status)) return true;
  return false;
}

function loadAllProps() {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(PROPOSALS_DIR); } catch (e) { return out; }
  for (const f of files) {
    if (!/^PROP-.*\.json$/.test(f)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, f), 'utf8'));
      const id = d.id || d.prop_id || f.replace(/\.json$/, '');
      out[id] = { file: f, data: d };
    } catch (e) { /* skip malformed */ }
  }
  return out;
}

function resolveSupersedeEdges(prop, allProps) {
  // Forward: find any PROP-X that declares this prop in its supersedes_props.
  const propId = prop.id || prop.prop_id;
  const supersedingByForward = [];
  for (const [otherId, other] of Object.entries(allProps)) {
    const supers = other.data.supersedes_props;
    if (Array.isArray(supers) && supers.includes(propId)) {
      if (isTerminalImplemented(other.data.status)) supersedingByForward.push(otherId);
    }
  }
  // Reverse: this prop's own superseded_by_props.
  const reverseList = Array.isArray(prop.superseded_by_props) ? prop.superseded_by_props : [];
  const supersedingByReverse = reverseList.filter(rid => {
    const other = allProps[rid];
    return other && isTerminalImplemented(other.data.status);
  });
  const allSuperseding = [...new Set([...supersedingByForward, ...supersedingByReverse])];
  // For reverse: require ALL listed to be terminal-implemented; for forward:
  // any single forward declaration is enough (the author asserted it).
  const reverseAllImplemented = reverseList.length > 0 &&
    reverseList.every(rid => allProps[rid] && isTerminalImplemented(allProps[rid].data.status));
  const forwardAny = supersedingByForward.length > 0;
  return {
    eligible: forwardAny || reverseAllImplemented,
    superseding_props: allSuperseding,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Closure metadata + ledger.
// ──────────────────────────────────────────────────────────────────────

function appendLedger(row) {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.appendFileSync(LEDGER_PATH, JSON.stringify(row) + '\n');
  } catch (e) {
    console.error('prop-auto-close: ledger append failed: ' + e.message);
  }
}

function flipPropStatus(propFile, newStatus, closureNote, closureEvidence, mechanism) {
  const fullPath = path.join(PROPOSALS_DIR, propFile);
  const d = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const prior = d.status;
  d.status = newStatus;
  d.obe_closed_at = new Date().toISOString();
  d.obe_closed_by = (mechanism === 'A' ? 'tinker-auto-close-' : 'tinker-auto-supersede-') + RUN_ID;
  d.obe_prior_status = prior;
  d.obe_closure_note = closureNote;
  d.obe_closure_evidence = closureEvidence;
  // Atomic write-rename.
  const tmp = fullPath + '.auto-close-tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
  fs.renameSync(tmp, fullPath);
}

// ──────────────────────────────────────────────────────────────────────
// Main.
// ──────────────────────────────────────────────────────────────────────

function main() {
  const startTs = new Date().toISOString();
  const allProps = loadAllProps();
  const propIds = Object.keys(allProps);
  const stats = {
    props_walked: propIds.length,
    has_vp: 0,
    grade_A: 0,
    grade_B: 0,
    grade_C: 0,
    eligible_for_autoclose: 0,
    field_gated: 0,
    mechA_would_close: 0,
    mechA_grade_B_passed_soft: 0,
    mechB_edges_resolved: 0,
    mechB_would_close: 0,
    actually_closed: 0,
  };

  for (const [propId, entry] of Object.entries(allProps)) {
    const d = entry.data;
    if (d.verification_pattern) stats.has_vp++;
    const grade = d.verification_pattern ? gradePattern(d.verification_pattern) : null;
    if (grade === 'A') stats.grade_A++;
    else if (grade === 'B') stats.grade_B++;
    else if (grade === 'C') stats.grade_C++;

    const eligible = isStatusEligible(d.status);
    const gated = isFieldGated(d);
    if (eligible) stats.eligible_for_autoclose++;
    if (gated) stats.field_gated++;

    if (!eligible || gated) continue;

    // Mechanism A: grade-A verification.
    if (grade === 'A') {
      const res = runVerification(d.verification_pattern);
      const passed = res.exit === 0 && /\bFIXED\b/.test(res.output) && !/\bSTILL_BROKEN\b/.test(res.output);
      if (passed) {
        stats.mechA_would_close++;
        const note = 'Auto-closed via verification_pattern at ' + RUN_ID
          + '; grade-A pattern exited 0 with FIXED in output.';
        const evidence = 'verification_pattern: ' + d.verification_pattern + ' | output: ' + res.output.slice(0, 200);
        appendLedger({
          ts: startTs, run_id: RUN_ID, prop_id: propId, mechanism: 'A',
          prior_status: d.status, new_status: 'implemented',
          verification_pattern: d.verification_pattern,
          verification_output: res.output.slice(0, 200),
          superseded_by: null, pattern_grade: 'A', dryrun: !ENFORCE,
        });
        if (ENFORCE) {
          try { flipPropStatus(entry.file, 'implemented', note, evidence, 'A'); stats.actually_closed++; }
          catch (e) { console.error('prop-auto-close: flip failed for ' + propId + ': ' + e.message); }
        }
        continue;
      }
    } else if (grade === 'B') {
      const res = runVerification(d.verification_pattern);
      if (res.exit === 0) {
        stats.mechA_grade_B_passed_soft++;
        appendLedger({
          ts: startTs, run_id: RUN_ID, prop_id: propId, mechanism: 'A',
          prior_status: d.status, new_status: '(grade-B soft finding — manual review)',
          verification_pattern: d.verification_pattern,
          verification_output: res.output.slice(0, 200),
          superseded_by: null, pattern_grade: 'B', dryrun: true,
        });
        // Never auto-close on grade B; only surface for manual review.
      }
    }

    // Mechanism B: supersede graph.
    const supersede = resolveSupersedeEdges(d, allProps);
    if (supersede.eligible) {
      stats.mechB_edges_resolved++;
      stats.mechB_would_close++;
      const newStatus = supersede.superseding_props.length === 1
        ? 'superseded-by-' + supersede.superseding_props[0]
        : 'superseded-by-multiple';
      const note = 'Auto-closed: superseded by ' + supersede.superseding_props.join(', ')
        + ' (terminal-implemented); original verification_pattern intentionally not required.';
      const evidence = JSON.stringify({
        superseding_props: supersede.superseding_props,
        each_status: supersede.superseding_props.map(p => ({ id: p, status: (allProps[p] && allProps[p].data.status) || '?' })),
      });
      appendLedger({
        ts: startTs, run_id: RUN_ID, prop_id: propId, mechanism: 'B',
        prior_status: d.status, new_status: newStatus,
        verification_pattern: null, verification_output: null,
        superseded_by: supersede.superseding_props, pattern_grade: null, dryrun: !ENFORCE,
      });
      if (ENFORCE) {
        try { flipPropStatus(entry.file, newStatus, note, evidence, 'B'); stats.actually_closed++; }
        catch (e) { console.error('prop-auto-close: B-flip failed for ' + propId + ': ' + e.message); }
      }
    }
  }

  const summary = {
    run_id: RUN_ID,
    started_at: startTs,
    finished_at: new Date().toISOString(),
    enforce_mode: ENFORCE,
    stats,
  };
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

try {
  process.exit(main() || 0);
} catch (e) {
  console.error('prop-auto-close internal error: ' + (e && e.stack || e));
  process.exit(0); // non-fatal by design
}
