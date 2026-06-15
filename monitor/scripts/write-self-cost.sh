#!/usr/bin/env bash
# write-self-cost.sh — PROP-101 Phase 1 (2026-06-14)
#
# End-of-run cost self-report for scheduled agents.
#
# Discovers the agent's own live JSONL transcript (the ONLY *.jsonl the agent
# can read across /sessions/ per PROP-101 Q1), prices it with
# compute-run-cost.js, and writes the result to the clone-side path so the
# agent's normal commit+push carries it to origin. Never writes to FUSE.
#
# Two modes:
#   merge <clone> <report-path>    — merge {self_cost,duration} into a per-run
#                                    JSON report file (tinker pattern).
#   append <clone> <agent>         — append one JSON line to
#                                    monitor/<agent>/cost-history.jsonl
#                                    (analyst + curmudgeon pattern).
#
# Exit codes:
#   0 = success or graceful no-op (no transcript found, partial parse, etc.)
#   1 = bad usage
#
# Non-fatal by design: a cost-self-report failure must never break the agent's
# main pipeline. All errors are logged to stderr but the exit code is 0 unless
# the CLI was invoked incorrectly.

set -u

MODE="${1:-}"
CLONE="${2:-}"
ARG3="${3:-}"

if [ -z "$MODE" ] || [ -z "$CLONE" ] || [ -z "$ARG3" ]; then
  echo "usage: write-self-cost.sh merge <clone> <report-path>" >&2
  echo "       write-self-cost.sh append <clone> <agent>" >&2
  exit 1
fi

HELPER="${CLONE}/monitor/scripts/compute-run-cost.js"
if [ ! -f "$HELPER" ]; then
  echo "write-self-cost: helper not found at $HELPER; skipping" >&2
  exit 0
fi

# Discover the live transcript. The agent can read exactly ONE *.jsonl under
# /sessions/*/mnt/.claude/projects/ — its own current run (PROP-101 Q1). All
# other sessions' mnt/ dirs are mode 750 owned by nobody:nogroup and EACCES.
TRANSCRIPT=$(find /sessions -path '*/.claude/projects/*' -name '*.jsonl' -readable 2>/dev/null | head -1)
if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  # 2026-06-15 hardening: poller's 00:09Z run hallucinated a row with the wrong
  # schema when the helper silent-skipped here. Always emit a row even on
  # discovery failure so the LLM has nothing to hallucinate AND tinker's
  # aggregator can detect discovery-failed agents as a class. Schema matches
  # successful runs minus the cost/token/duration fields, plus discovery_failed.
  if [ "$MODE" = "append" ]; then
    AGENT="$ARG3"
    HISTORY="${CLONE}/monitor/${AGENT}/cost-history.jsonl"
    mkdir -p "$(dirname "$HISTORY")" 2>/dev/null || true
    node -e "
      const fs=require('fs');
      try {
        const row={
          agent: process.argv[1],
          run_at: new Date().toISOString(),
          discovery_failed: true,
          reason: 'no-readable-jsonl-transcript-under-sessions',
        };
        fs.appendFileSync(process.argv[2], JSON.stringify(row) + '\n');
        console.log('write-self-cost append: ' + process.argv[1] + ' discovery_failed (placeholder row written)');
      } catch (e) { console.error('placeholder append failed: ' + e.message); }
    " "$AGENT" "$HISTORY" || true
  fi
  exit 0
fi

# Price it. compute-run-cost.js handles cache_creation 5m/1h split + cache_read.
COST_JSON=$(node "$HELPER" "$TRANSCRIPT" 2>/dev/null)
if [ -z "$COST_JSON" ]; then
  echo "write-self-cost: compute-run-cost.js produced no output; skipping" >&2
  exit 0
fi

case "$MODE" in
  merge)
    REPORT_PATH="$ARG3"
    if [ ! -f "$REPORT_PATH" ]; then
      echo "write-self-cost: report path $REPORT_PATH does not exist; skipping" >&2
      exit 0
    fi
    # Merge: load existing report JSON, add self_cost, write back. Atomic via
    # write-rename. Non-destructive if the report already contains self_cost
    # (overwrite — last write wins; final value reflects the complete run).
    node -e "
      const fs=require('fs');
      try {
        const p=process.argv[1];
        const c=JSON.parse(process.argv[2]);
        const r=JSON.parse(fs.readFileSync(p,'utf8'));
        r.self_cost=c;
        const tmp=p+'.cost-tmp';
        fs.writeFileSync(tmp, JSON.stringify(r, null, 2));
        fs.renameSync(tmp, p);
        console.log('write-self-cost merge: total_usd=' + (c.cost_usd && c.cost_usd.total_usd));
      } catch (e) {
        console.error('write-self-cost merge failed: ' + (e && e.message));
        process.exit(0); // non-fatal
      }
    " "$REPORT_PATH" "$COST_JSON" || true
    ;;
  append)
    AGENT="$ARG3"
    HISTORY="${CLONE}/monitor/${AGENT}/cost-history.jsonl"
    mkdir -p "$(dirname "$HISTORY")" 2>/dev/null || true
    # Append one JSON line. Each line is self-contained (transcript + agent +
    # cost + duration + model + run-end timestamp).
    node -e "
      const fs=require('fs');
      try {
        const c=JSON.parse(process.argv[1]);
        const row={
          agent: process.argv[2],
          run_at: new Date().toISOString(),
          ...c,
        };
        fs.appendFileSync(process.argv[3], JSON.stringify(row) + '\n');
        console.log('write-self-cost append: ' + process.argv[2] + ' total_usd=' + (c.cost_usd && c.cost_usd.total_usd));
      } catch (e) {
        console.error('write-self-cost append failed: ' + (e && e.message));
        process.exit(0); // non-fatal
      }
    " "$COST_JSON" "$AGENT" "$HISTORY" || true
    ;;
  *)
    echo "write-self-cost: unknown mode '$MODE' (expected merge or append)" >&2
    exit 1
    ;;
esac

exit 0
