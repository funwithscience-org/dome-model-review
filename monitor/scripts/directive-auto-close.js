#!/usr/bin/env node
/**
 * directive-auto-close.js — PROP-108 Phase 0 (shadow) + Phase 1 (enforce gated by flag).
 *
 * Mirror of prop-auto-close.js's Mechanism B applied to the operator-directive
 * surface. Walks every status='pending' directive in
 * monitor/tinker/operator-directives/ and closes it when its linked PROP is
 * unambiguously, fully implemented.
 *
 * Linkage resolution (two paths):
 *
 *   Forward back-ref: PROP.directive_id === DIRECTIVE.directive_id
 *     The canonical case — when a directive commissions a PROP, the
 *     PROP carries the directive_id field.
 *
 *   Cross-lineage forward-decl: PROP.supersedes_directives contains
 *     DIRECTIVE.directive_id
 *     For cases where PROP-X obsoletes DIRECTIVE-Y but PROP-X was authored
 *     from DIRECTIVE-Z. Operator / tinker declares supersession explicitly
 *     via `node mark-directive-superseded.js DIRECTIVE-Y by PROP-X`.
 *
 * Closure rules (conservative — Q2 whitelist):
 *
 *   Auto-close when linked PROP.status ∈ {
 *     'implemented', 'integrated', 'applied', 'self-applied', 'completed'
 *   }.
 *
 *   Explicitly NOT terminal for default close:
 *     'proposed', 'design-pending-operator-review', 'pending-operator-review',
 *     'implementation-pending-operator-review', 'approved', 'operator-approved',
 *     anything matching /^approved-/, /^phase-.*-implemented/,
 *     /^phase-.*-shipped/, /^phase-.*-measurement-shipped/,
 *     /^partially-/, /^superseded/, /^wont-fix/.
 *
 *   Multi-phase opt-in (Q3): if a directive declares
 *     `auto_close_when_phase_0_done: true`, expand the whitelist for that
 *     directive specifically to include /^phase-0.*-implemented/,
 *     /^phase-0.*-shipped/, /^phase-0-measurement-shipped/,
 *     /^approved-mech-1-implemented/. The directive's author is asserting
 *     that Phase 0 / Mech 1 completion fulfills the directive's task.
 *
 *   Field-gated: if directive declares `do_not_auto_close: true` or
 *     `requires_human_judgment: true`, skip regardless of PROP status.
 *
 * Shadow vs enforce (Q5):
 *
 *   Phase 0 (default — flag absent): every run is dry-run; appends ledger
 *     rows with dryrun:true. Writes ZERO changes to directive files.
 *
 *   Phase 1 (flag present): gated by presence of
 *     monitor/decisions/directive-auto-close-enforce.flag. Flips
 *     directive.status pending → completed + sets completed_at,
 *     completed_by_run, prop_id_authored, closure_note. Idempotent —
 *     only writes if status was 'pending'.
 *
 * Idempotence (Q6): respects CLAUDE.md DIRECTIVE-LIFECYCLE additive-edit
 * exception. Only the documented fields (status, completed_at,
 * completed_by_run, prop_id_authored) are written. Single allowed
 * transition: pending → completed.
 *
 * Exit codes: 0 success; non-fatal — internal errors log to stderr + exit 0.
 *
 * Logs a JSON summary on stderr: {directives_walked, pending,
 * linkage_via_directive_id, linkage_via_supersedes_directives,
 * would_close, field_gated, actually_closed, enforce_mode}.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const WORKSPACE = flag('--workspace', process.cwd());

const DIRECTIVES_DIR = path.join(WORKSPACE, 'monitor/tinker/operator-directives');
const PROPOSALS_DIR  = path.join(WORKSPACE, 'monitor/tinker/proposals');
const LEDGER_PATH    = path.join(WORKSPACE, 'monitor/tinker/directive-auto-close-ledger.jsonl');
const ENFORCE_FLAG   = path.join(WORKSPACE, 'monitor/decisions/directive-auto-close-enforce.flag');

const RUN_ID = process.env.TINKER_RUN_ID
  || ('tinker-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16) + 'Z');

const ENFORCE = fs.existsSync(ENFORCE_FLAG);

// ──────────────────────────────────────────────────────────────────────
// Q2: Conservative terminal-PROP-status whitelist.
// ──────────────────────────────────────────────────────────────────────

const TERMINAL_PROP_STATUSES_DEFAULT = new Set([
  'implemented', 'integrated', 'applied', 'self-applied', 'completed',
]);

// Q3: Expanded whitelist for directives that opted into Phase-0-done close.
const TERMINAL_PROP_PATTERNS_OPT_IN = [
  /^phase-0.*-implemented/,
  /^phase-0.*-shipped/,
  /^phase-0-measurement-shipped/,
  /^approved-mech-1-implemented/,
];

// Patterns that are NEVER terminal for directive close (sanity guard against
// future PROP-status additions slipping past the explicit whitelist).
const EXPLICITLY_NOT_TERMINAL_PATTERNS = [
  /^proposed/, /^design-pending/, /^pending-operator-review/,
  /^implementation-pending/, /^approved$/, /^operator-approved/,
  /^partially-/, /^superseded/, /^wont-fix/, /^deferred/,
  /-pending-/, /-shadow-audit$/, /-shadow-pending/,
];

function isTerminalForDirective(propStatus, directiveOptsInPhase0, directiveOptsInProposeOnly) {
  if (!propStatus) return false;
  // Default conservative path.
  if (TERMINAL_PROP_STATUSES_DEFAULT.has(propStatus)) return true;
  // PROP-120 opt-in: authoring-directives whose deliverable IS a propose-only PROP.
  // For these, the linked PROP reaching status='proposed' IS the terminal state of the
  // directive (the deliverable was authored; operator may or may not later ship it, but
  // the directive's commission was 'author the PROP' which is now done). Guarded against
  // operator-rejected states by the EXPLICITLY_NOT_TERMINAL_PATTERNS below.
  if (directiveOptsInProposeOnly && propStatus === 'proposed') return true;
  // Opt-in expansion only if the directive declared it.
  if (directiveOptsInPhase0) {
    for (const re of TERMINAL_PROP_PATTERNS_OPT_IN) {
      if (re.test(propStatus)) return true;
    }
  }
  // Even with opt-in, the "explicitly not terminal" patterns win.
  // Note: 'proposed' is in EXPLICITLY_NOT_TERMINAL_PATTERNS, but it's checked AFTER the
  // PROP-120 opt-in branch above — so the opt-in correctly bypasses the default exclusion
  // ONLY for bare 'proposed' (not rejected/superseded/withdrawn which match other patterns
  // here and correctly stay non-terminal).
  for (const re of EXPLICITLY_NOT_TERMINAL_PATTERNS) {
    if (re.test(propStatus)) return false;
  }
  return false;
}

function isDirectiveGated(directive) {
  if (directive.do_not_auto_close === true) return true;
  if (directive.requires_human_judgment === true) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Index PROPs once per run (small surface — read once, search many).
// ──────────────────────────────────────────────────────────────────────

function loadAllProps() {
  if (!fs.existsSync(PROPOSALS_DIR)) return [];
  const files = fs.readdirSync(PROPOSALS_DIR).filter(f => f.startsWith('PROP-') && f.endsWith('.json'));
  const props = [];
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, f), 'utf8'));
      props.push({ file: f, prop: p });
    } catch (_) { /* skip malformed */ }
  }
  return props;
}

function findLinkedProp(directiveId, allProps) {
  // Path 1: forward back-ref. PROP.directive_id === directiveId
  // OR PROP.source_directive === directiveId (older convention).
  for (const { file, prop } of allProps) {
    if (prop.directive_id === directiveId) return { match: { file, prop }, via: 'directive_id' };
    if (prop.source_directive === directiveId) return { match: { file, prop }, via: 'source_directive' };
  }
  // Path 2: cross-lineage forward-decl via supersedes_directives.
  for (const { file, prop } of allProps) {
    const sd = prop.supersedes_directives;
    if (Array.isArray(sd) && sd.includes(directiveId)) {
      return { match: { file, prop }, via: 'supersedes_directives' };
    }
  }
  return { match: null, via: null };
}

// ──────────────────────────────────────────────────────────────────────
// Main walk.
// ──────────────────────────────────────────────────────────────────────

function appendLedger(row) {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.appendFileSync(LEDGER_PATH, JSON.stringify(row) + '\n');
  } catch (e) {
    process.stderr.write('directive-auto-close: ledger write failed: ' + e.message + '\n');
  }
}

function flipDirective(filePath, directive, linkedPropId, closureNote) {
  // Idempotent — only flip if still pending.
  if (directive.status !== 'pending') return false;
  directive.status = 'completed';
  directive.completed_at = new Date().toISOString();
  directive.completed_by_run = RUN_ID;
  directive.prop_id_authored = linkedPropId;
  directive.closure_note = closureNote;
  try {
    fs.writeFileSync(filePath, JSON.stringify(directive, null, 2) + '\n');
    return true;
  } catch (e) {
    process.stderr.write('directive-auto-close: write failed for ' + filePath + ': ' + e.message + '\n');
    return false;
  }
}

function main() {
  const summary = {
    run_id: RUN_ID,
    enforce_mode: ENFORCE,
    directives_walked: 0,
    pending: 0,
    field_gated: 0,
    linkage_via_directive_id: 0,
    linkage_via_supersedes_directives: 0,
    linkage_via_source_directive: 0,
    no_linkage: 0,
    linked_prop_not_terminal: 0,
    would_close: 0,
    actually_closed: 0,
    closures: [],
  };

  if (!fs.existsSync(DIRECTIVES_DIR)) {
    process.stderr.write('directive-auto-close: ' + DIRECTIVES_DIR + ' not found — exiting 0\n');
    process.stdout.write(JSON.stringify(summary) + '\n');
    return;
  }

  const allProps = loadAllProps();
  const dFiles = fs.readdirSync(DIRECTIVES_DIR).filter(f => f.startsWith('DIRECTIVE-') && f.endsWith('.json'));

  for (const f of dFiles) {
    summary.directives_walked++;
    const fp = path.join(DIRECTIVES_DIR, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }
    if (d.status !== 'pending') continue;
    summary.pending++;

    if (isDirectiveGated(d)) {
      summary.field_gated++;
      appendLedger({
        ts: new Date().toISOString(), run_id: RUN_ID, dryrun: !ENFORCE,
        directive_id: d.directive_id || f.replace('.json', ''),
        action: 'skip', reason: 'field_gated (do_not_auto_close or requires_human_judgment)',
      });
      continue;
    }

    const directiveId = d.directive_id || f.replace('.json', '');
    const { match, via } = findLinkedProp(directiveId, allProps);

    if (!match) {
      summary.no_linkage++;
      continue;
    }

    if (via === 'directive_id') summary.linkage_via_directive_id++;
    else if (via === 'source_directive') summary.linkage_via_source_directive++;
    else if (via === 'supersedes_directives') summary.linkage_via_supersedes_directives++;

    const linkedProp = match.prop;
    const linkedPropId = linkedProp.id || linkedProp.prop_id || match.file.replace('.json', '');
    const optsIn = d.auto_close_when_phase_0_done === true;
    // PROP-120 (2026-06-30): authoring-directive opt-in. Set on directives whose
    // deliverable is a propose-only PROP — the linked PROP reaching 'proposed' IS the
    // terminal state of the directive (commission was 'author the PROP'). Default
    // implementation directives remain unchanged.
    const optsInProposeOnly = d.auto_close_when_deliverable_proposed === true;

    if (!isTerminalForDirective(linkedProp.status, optsIn, optsInProposeOnly)) {
      summary.linked_prop_not_terminal++;
      continue;
    }

    summary.would_close++;
    const closureNote = 'directive-auto-close (PROP-108): linked PROP ' + linkedPropId
      + ' status="' + linkedProp.status + '" matched terminal whitelist via ' + via
      + (optsIn ? ' (auto_close_when_phase_0_done=true opt-in)' : '')
      + (optsInProposeOnly && linkedProp.status === 'proposed' ? ' (auto_close_when_deliverable_proposed=true opt-in)' : '') + '.';

    const ledgerRow = {
      ts: new Date().toISOString(), run_id: RUN_ID, dryrun: !ENFORCE,
      directive_id: directiveId,
      linked_prop_id: linkedPropId,
      linked_prop_status: linkedProp.status,
      linkage_via: via,
      opted_in_phase_0_done: optsIn,
      action: ENFORCE ? 'close' : 'would_close',
      reason: closureNote,
    };
    appendLedger(ledgerRow);

    if (ENFORCE) {
      const ok = flipDirective(fp, d, linkedPropId, closureNote);
      if (ok) {
        summary.actually_closed++;
        summary.closures.push({ directive_id: directiveId, linked_prop_id: linkedPropId, via });
      }
    } else {
      summary.closures.push({ directive_id: directiveId, linked_prop_id: linkedPropId, via, dryrun: true });
    }
  }

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

try { main(); } catch (e) {
  process.stderr.write('directive-auto-close: fatal: ' + (e && e.message) + '\n');
}
process.exit(0);
