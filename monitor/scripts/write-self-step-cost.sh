#!/usr/bin/env bash
# write-self-step-cost.sh — PROP-112 (2026-06-21)
#
# Per-step cost self-instrumentation for scheduled agents.
#
# Sibling to write-self-cost.sh (PROP-101). Where that script computes the
# total run cost, this one computes the per-STEP_MARKER token+cost bucket
# via the agent's own step-cost analyzer (compute-<agent>-step-cost.js).
#
# Background: tinker cannot read other agents' transcripts (cross-session
# /sessions/*/.claude/projects/*.jsonl is mode 750 nobody:nogroup → EACCES,
# see PROP-101 Q1 + PROP-112 evidence). The only viable place to run per-
# step analysis is inside the agent that produced the transcript — same
# pattern PROP-101 established for total cost. This script does that
# bookkeeping uniformly so each STEP_MARKER-instrumented agent's prompt
# only needs a one-line invocation.
#
# Usage:
#   write-self-step-cost.sh <clone> <agent> <analyzer-script-name>
#
# Where:
#   <clone>     — fresh clone path (e.g. ${CLEAN_CLONE})
#   <agent>     — agent name (matches the path component under monitor/),
#                 e.g. "decisions", "integrity"
#   <analyzer>  — bare filename of the per-step analyzer under
#                 monitor/scripts/, e.g. "compute-decider-step-cost.js"
#
# Output: appends one JSON line per run to
#   monitor/<agent>/step-cost-history.jsonl
#
# Each line is:
#   { agent, run_at, transcript_path, step_cost: { /* analyzer JSON */ } }
#
# step-cost-history.jsonl is git-append-only (per PROP-065 convention),
# written exclusively via clone-and-push.
#
# Exit codes:
#   0 = success or graceful no-op (transcript not discoverable, helper
#       missing, analyzer non-zero, etc. — non-fatal by design).
#   1 = bad usage (missing args).
#
# Non-fatal by design: a step-cost-self-report failure must never break
# the agent's main pipeline. All errors are logged to stderr but the
# exit code is 0 unless the CLI was invoked incorrectly.

set -u

CLONE="${1:-}"
AGENT="${2:-}"
ANALYZER="${3:-}"

if [ -z "$CLONE" ] || [ -z "$AGENT" ] || [ -z "$ANALYZER" ]; then
  echo "usage: write-self-step-cost.sh <clone> <agent> <analyzer-script-name>" >&2
  echo "  e.g. write-self-step-cost.sh /tmp/edit-clone decisions compute-decider-step-cost.js" >&2
  exit 1
fi

HELPER="${CLONE}/monitor/scripts/${ANALYZER}"
if [ ! -f "$HELPER" ]; then
  echo "write-self-step-cost: analyzer not found at $HELPER; skipping" >&2
  exit 0
fi

# Discover the live transcript. The agent can read exactly ONE *.jsonl under
# /sessions/*/.claude/projects/ — its own current run (PROP-101 Q1). All
# other sessions' .claude dirs are mode 750 owned by nobody:nogroup and EACCES.
# PROP-140 (2026-07-22): enumerate ALL readable segments (harness restarts /
# rotations / subagents produce >1 .jsonl per run; head -1 analyzed an
# arbitrary fragment). The analyzer accepts multiple paths and orders them.
mapfile -t TRANSCRIPTS < <(find /sessions -path '*/.claude/projects/*' -name '*.jsonl' -readable 2>/dev/null | sort)
TRANSCRIPT="${TRANSCRIPTS[0]:-}"
TRANSCRIPT_LIST=$(IFS=,; echo "${TRANSCRIPTS[*]:-}")
HISTORY="${CLONE}/monitor/${AGENT}/step-cost-history.jsonl"
mkdir -p "$(dirname "$HISTORY")" 2>/dev/null || true

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  # Mirror write-self-cost.sh's 2026-06-15 hardening: always emit a row even
  # on discovery failure so the LLM has nothing to hallucinate AND tinker's
  # aggregator can detect discovery-failed agents as a class.
  node -e "
    const fs=require('fs');
    try {
      const row={
        agent: process.argv[1],
        run_at: new Date().toISOString(),
        analyzer: process.argv[2],
        discovery_failed: true,
        reason: 'no-readable-jsonl-transcript-under-sessions',
      };
      fs.appendFileSync(process.argv[3], JSON.stringify(row) + '\n');
      console.log('write-self-step-cost: ' + process.argv[1] + ' discovery_failed (placeholder row written)');
    } catch (e) { console.error('placeholder append failed: ' + e.message); }
  " "$AGENT" "$ANALYZER" "$HISTORY" || true
  exit 0
fi

# Run the per-step analyzer. The compute-<agent>-step-cost.js scripts emit
# JSON to stdout shaped { run_meta, per_step, unattributed, tool_result_buckets }
# (see compute-decider-step-cost.js header). They exit 0 on partial-data
# failures with degraded output rather than 1.
STEP_JSON=$(node "$HELPER" "${TRANSCRIPTS[@]}" 2>/dev/null)
if [ -z "$STEP_JSON" ]; then
  echo "write-self-step-cost: ${ANALYZER} produced no output; appending failure row" >&2
  node -e "
    const fs=require('fs');
    try {
      const row={
        agent: process.argv[1],
        run_at: new Date().toISOString(),
        analyzer: process.argv[2],
        transcript_path: process.argv[3],
        analyzer_failed: true,
        reason: 'no-stdout',
      };
      fs.appendFileSync(process.argv[4], JSON.stringify(row) + '\n');
    } catch (e) { console.error('failure append failed: ' + e.message); }
  " "$AGENT" "$ANALYZER" "$TRANSCRIPT" "$HISTORY" || true
  exit 0
fi

# Append one JSONL row containing the full per-step analyzer output, wrapped
# in {agent, run_at, transcript_path, step_cost}. Tinker's cross-run
# aggregator streams this file.
node -e "
  const fs=require('fs');
  try {
    const step=JSON.parse(process.argv[1]);
    const row={
      agent: process.argv[2],
      run_at: new Date().toISOString(),
      analyzer: process.argv[3],
      transcript_path: process.argv[4],
      step_cost: step,
    };
    fs.appendFileSync(process.argv[5], JSON.stringify(row) + '\n');
    const nSteps = (step.per_step || []).length;
    const total = step.run_meta && step.run_meta.total_cost_usd;
    console.log('write-self-step-cost append: ' + process.argv[2] + ' steps=' + nSteps + ' total_usd=' + total);
  } catch (e) {
    console.error('write-self-step-cost append failed: ' + (e && e.message));
    process.exit(0); // non-fatal
  }
" "$STEP_JSON" "$AGENT" "$ANALYZER" "$TRANSCRIPT_LIST" "$HISTORY" || true

exit 0
