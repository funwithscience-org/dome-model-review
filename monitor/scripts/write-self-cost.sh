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

# Discover the live transcript segment(s). The agent can read only its own
# session's *.jsonl files under /sessions/*/mnt/.claude/projects/ (PROP-101
# Q1: other sessions are EACCES). PROP-140 (2026-07-22): the harness can
# produce MORE THAN ONE segment per run (restart / rotation / subagent);
# the old `head -1` priced an arbitrary segment, understating multi-segment
# runs (8 of 15 decider rows 2026-07-05..07-21 were 4-12-msg fragments).
# Enumerate ALL readable segments and price the sum.
mapfile -t TRANSCRIPTS < <(find /sessions -path '*/.claude/projects/*' -name '*.jsonl' -readable 2>/dev/null | sort)
if [ "${#TRANSCRIPTS[@]}" -eq 0 ]; then
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

# Price ALL segments and sum (PROP-140). compute-run-cost.js handles the
# cache_creation 5m/1h split + cache_read per segment; the reducer below sums
# token buckets + USD across segments and records a per_segment breakdown for
# observability. cost_usd.total_usd stays the (now-correct) run total, so the
# row shape is backward-compatible with pre-PROP-140 consumers.
COST_JSON=$(node -e '
  const { execFileSync } = require("child_process");
  const path = require("path");
  const helper = process.argv[1];
  const files = process.argv.slice(2);
  const per = [];
  const sum = { input:0, output:0, cache_write_5m:0, cache_write_1h:0, cache_read:0 };
  const csum = { input_usd:0, output_usd:0, cache_write_5m_usd:0, cache_write_1h_usd:0, cache_read_usd:0, total_usd:0 };
  let model = null, msgs = 0, firstTs = null, lastTs = null, priced = 0;
  for (const f of files) {
    let r;
    try {
      r = JSON.parse(execFileSync("node", [helper, f], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) { continue; }
    priced++;
    if (r.model && !model) model = r.model;
    msgs += r.assistant_msgs || 0;
    for (const k of Object.keys(sum)) sum[k] += (r.tokens && r.tokens[k]) || 0;
    for (const k of Object.keys(csum)) csum[k] += (r.cost_usd && r.cost_usd[k]) || 0;
    if (r.first_ts && (!firstTs || r.first_ts < firstTs)) firstTs = r.first_ts;
    if (r.last_ts && (!lastTs || r.last_ts > lastTs)) lastTs = r.last_ts;
    per.push({ file_basename: path.basename(f), msgs: r.assistant_msgs || 0, model: r.model || null,
               total_usd: (r.cost_usd && r.cost_usd.total_usd) || 0,
               first_ts: r.first_ts || null, last_ts: r.last_ts || null });
  }
  if (!priced) process.exit(0); // empty stdout -> caller skips gracefully
  for (const k of Object.keys(csum)) csum[k] = +csum[k].toFixed(6);
  const dur = (firstTs && lastTs) ? +(((Date.parse(lastTs) - Date.parse(firstTs)) / 1000).toFixed(1)) : null;
  const out = {
    transcript: per.length === 1 ? per[0].file_basename : per[0].file_basename + " (+" + (per.length - 1) + " more)",
    model, assistant_msgs: msgs, tokens: sum, cost_usd: csum,
    transcript_duration_sec: dur, first_ts: firstTs, last_ts: lastTs,
    segments_found: files.length, segments_priced: priced, per_segment: per,
  };
  console.log(JSON.stringify(out));
' "$HELPER" "${TRANSCRIPTS[@]}" 2>/dev/null)
if [ -z "$COST_JSON" ]; then
  echo "write-self-cost: multi-segment pricing produced no output; skipping" >&2
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
