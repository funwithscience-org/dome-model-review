#!/usr/bin/env node
/*
 * monitor/scripts/verify-pending-state.js
 *
 * PROP-014 Mechanism 1 verifier — flips '*-pending-verification' status
 * suffixes to terminal status when the verification primitive passes.
 *
 *   - PROP reference:        monitor/tinker/proposals/PROP-014-agent-state-coupling.json
 *   - Amendment-001:         monitor/tinker/proposals/PROP-014-amendment-001.json
 *   - Canonical disciplines: monitor/prompts/reference/state-verification.md
 *   - Version:               1.0.0
 *   - Invocation:            node monitor/scripts/verify-pending-state.js [--dry-run]
 *                            (typically from monitor/prompts/workspace-sync.md
 *                            after `git pull --rebase`)
 *   - Related ledgers:       monitor/decisions/closed-issues.json (issues[])
 *                            monitor/analyst/expansion-tracker.json (items[])
 *   - Output report:         monitor/integrity/verify-pending-run-<ISO>.json
 *
 * CONTRACT (per DIRECTIVE-20260502-003 + PROP-014 sub_mechanism_1a / 1b):
 *
 *   For each entry whose `status` field matches /-pending-verification$/:
 *     1. Read `verification_pattern` (Mech 1a) or `verification_artifact_path`
 *        (Mech 1b) from the entry.
 *     2. Mech 1a: run `verification_pattern` as a shell command (typically
 *        `git show origin/main:<patch_file> | grep -q <patched_string>`).
 *        Pass = exit 0.
 *     3. Mech 1b: status='resolved-pending-verification' AND
 *        `verification_artifact_path` present → `test -f` against the working
 *        tree (which equals origin/main after the workspace-sync `git pull
 *        --rebase`). Pass = file exists.
 *     4. On pass: flip status → terminal value (fixed | resolved | integrated),
 *        write verified_at + verified_by_run + verifier_script_version.
 *     5. On fail: leave entry pending; write last_verify_attempt +
 *        last_verify_attempt_failure_reason. NO retry inside the same run.
 *
 *   Defensive default: if `verification_pattern` is absent or malformed, log
 *   error and leave the entry pending. NEVER set terminal status when
 *   verification did not pass.
 *
 *   Idempotency: re-running against the same on-disk state is a no-op.
 *   Already-terminal entries are skipped. Never-pending entries are skipped.
 *
 *   Error handling: per-entry failures are logged and the run continues.
 *   The script never exits non-zero on a per-entry failure — only on a
 *   catastrophic top-level throw.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = '1.0.0';
const DRY_RUN = process.argv.includes('--dry-run');
const NOW_ISO = new Date().toISOString();
const RUN_ID = process.env.RUN_ID
  || ('verify-pending-' + NOW_ISO.replace(/[:.]/g, '').slice(0, 15) + 'Z-' + process.pid);

// suffix → terminal status mapping
const TERMINAL_MAP = {
  'fixed-pending-verification':       'fixed',
  'resolved-pending-verification':    'resolved',
  'integrated-pending-verification':  'integrated',
};

const PENDING_SUFFIX_RE = /-pending-verification$/;

// Files to scan: [path, arrayKey, idField]
const SCAN_TARGETS = [
  ['monitor/decisions/closed-issues.json',     'issues', 'id'],
  ['monitor/analyst/expansion-tracker.json',   'items',  'id'],
];

function logErr(msg) { process.stderr.write('[verify-pending] ' + msg + '\n'); }
function logOut(msg) { process.stdout.write('[verify-pending] ' + msg + '\n'); }

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return { ok: false, reason: 'missing_file' };
    const txt = fs.readFileSync(p, 'utf8');
    return { ok: true, data: JSON.parse(txt) };
  } catch (e) {
    return { ok: false, reason: 'bad_json', err: e.message };
  }
}

function runShellCmd(cmd) {
  // Pass = exit 0; fail = non-zero, signal, or thrown error.
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, status: e.status, signal: e.signal, msg: (e.message || '').slice(0, 200) };
  }
}

function verifyEntry(entry) {
  const status = entry.status || '';
  const terminal = TERMINAL_MAP[status];
  if (!terminal) {
    return { decision: 'error', reason: 'unknown_pending_status:' + status };
  }

  // Mech 1b: artifact-path test
  if (status === 'resolved-pending-verification' && entry.verification_artifact_path) {
    const target = String(entry.verification_artifact_path);
    try {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        return { decision: 'flip', terminal, primitive: 'test_f', target };
      }
      return { decision: 'still_pending', reason: 'artifact_missing', target };
    } catch (e) {
      return { decision: 'error', reason: 'stat_error:' + e.message, target };
    }
  }

  // Mech 1a / general path: shell command via verification_pattern
  const pat = entry.verification_pattern;
  if (!pat || typeof pat !== 'string') {
    return { decision: 'error', reason: 'verification_pattern_missing_or_malformed' };
  }

  const r = runShellCmd(pat);
  if (r.ok) return { decision: 'flip', terminal, primitive: 'shell_command', cmd: pat };
  return {
    decision: 'still_pending',
    reason: 'verification_pattern_failed',
    cmd: pat,
    exit: r.status,
  };
}

function processFile(filePath, arrayKey, idField, summary) {
  const r = readJsonSafe(filePath);
  if (!r.ok) {
    summary.errors.push({ file: filePath, reason: r.reason, err: r.err });
    return;
  }
  const data = r.data;
  const arr = data[arrayKey];
  if (!Array.isArray(arr)) {
    summary.errors.push({ file: filePath, reason: 'array_not_found:' + arrayKey });
    return;
  }

  const perFile = {
    file: filePath,
    checked: 0,
    flipped: 0,
    still_pending: 0,
    errors: 0,
  };
  let mutated = false;

  for (const entry of arr) {
    const status = entry.status || '';
    if (!PENDING_SUFFIX_RE.test(status)) continue;
    perFile.checked++;

    const v = verifyEntry(entry);
    const id = entry[idField] || entry.win_id || '<no-id>';

    if (v.decision === 'flip') {
      perFile.flipped++;
      summary.flipped_entries.push({
        file: filePath, id, from: status, to: v.terminal, primitive: v.primitive,
      });
      if (!DRY_RUN) {
        entry.status = v.terminal;
        entry.verified_at = NOW_ISO;
        entry.verified_by_run = RUN_ID;
        entry.verifier_script_version = VERSION;
        mutated = true;
      }
    } else if (v.decision === 'still_pending') {
      perFile.still_pending++;
      summary.still_pending_entries.push({
        file: filePath, id, status, reason: v.reason,
      });
      if (!DRY_RUN) {
        entry.last_verify_attempt = NOW_ISO;
        entry.last_verify_attempt_failure_reason = v.reason;
        mutated = true;
      }
    } else {
      perFile.errors++;
      summary.errors.push({ file: filePath, id, reason: v.reason });
      // Defensive default: leave entry untouched. Do NOT flip on error.
    }
  }

  summary.per_file.push(perFile);

  if (mutated && !DRY_RUN) {
    try {
      if (Object.prototype.hasOwnProperty.call(data, 'last_updated')) {
        data.last_updated = NOW_ISO;
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    } catch (e) {
      summary.errors.push({ file: filePath, reason: 'write_failed:' + e.message });
    }
  }
}

function main() {
  const summary = {
    version:               VERSION,
    run_id:                RUN_ID,
    started_at:            NOW_ISO,
    dry_run:               DRY_RUN,
    per_file:              [],
    flipped_entries:       [],
    still_pending_entries: [],
    errors:                [],
    totals:                { checked: 0, flipped: 0, still_pending: 0, errors: 0 },
  };

  for (const [fp, key, idField] of SCAN_TARGETS) {
    processFile(fp, key, idField, summary);
  }

  // Tally
  for (const pf of summary.per_file) {
    summary.totals.checked       += pf.checked;
    summary.totals.flipped       += pf.flipped;
    summary.totals.still_pending += pf.still_pending;
    summary.totals.errors        += pf.errors;
  }
  summary.completed_at = new Date().toISOString();

  // Write integrity report (skip in dry-run; show only console)
  const reportName = 'verify-pending-run-' + NOW_ISO.replace(/[:.]/g, '').slice(0, 15) + 'Z.json';
  const reportPath = path.join('monitor/integrity', reportName);

  if (!DRY_RUN) {
    try {
      fs.mkdirSync('monitor/integrity', { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n');
      logOut('Wrote: ' + reportPath);
    } catch (e) {
      logErr('Could not write integrity report: ' + e.message);
    }
  }

  // Console summary — formatted for workspace-sync's commit message + run report.
  const t = summary.totals;
  console.log(
    'verify-pending-state.js v' + VERSION + (DRY_RUN ? ' (DRY RUN)' : '') + ': ' +
    'checked=' + t.checked +
    ', flipped=' + t.flipped +
    ', still_pending=' + t.still_pending +
    ', errors=' + t.errors
  );

  if (summary.flipped_entries.length) {
    console.log('  Flipped:');
    for (const f of summary.flipped_entries.slice(0, 20)) {
      console.log('    - ' + f.id + ' (' + f.file + '): ' + f.from + ' → ' + f.to);
    }
    const extra = summary.flipped_entries.length - 20;
    if (extra > 0) console.log('    ... and ' + extra + ' more');
  }
  if (summary.still_pending_entries.length) {
    console.log('  Still pending:');
    for (const s of summary.still_pending_entries.slice(0, 20)) {
      console.log('    - ' + s.id + ' (' + s.file + '): ' + s.reason);
    }
    const extra = summary.still_pending_entries.length - 20;
    if (extra > 0) console.log('    ... and ' + extra + ' more');
  }
  if (summary.errors.length) {
    console.log('  Errors:');
    for (const e of summary.errors.slice(0, 10)) {
      console.log('    - ' + (e.id || '<top>') + ' (' + e.file + '): ' + e.reason);
    }
  }

  // NEVER exit non-zero on per-entry failure (per directive contract).
  process.exit(0);
}

try {
  main();
} catch (e) {
  logErr('FATAL: ' + e.message);
  if (e.stack) logErr(e.stack);
  process.exit(1);
}
