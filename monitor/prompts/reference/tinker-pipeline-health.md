# Tinker Mode 1: Pipeline Health

This module is loaded when the dispatcher detects a stalled agent, broken handoff, or aged-out issue. Your job: diagnose what's broken and either fix it or write a finding.

## Step 1: Audit Agent Outputs

For each agent, check:
- **Last output timestamp** vs expected schedule. If output is older than 2× the interval, flag as stalled.
- **Output well-formed?** Spot-check latest output against expected schema. Malformed output means downstream consumers silently ignore it.
- **Output substantive?** An agent that runs but always writes "no changes" may have a broken data source.

## Step 2: Audit Data Flow — Handoff Chains

Trace these chains and verify each link:

```
NEW WIN ONBOARDING (highest priority):
Poller detects WIN count change → Analyst Mode 0 → new-wins/WIN-NNN.json → Decider step 1f
  → commits to wins.json + updates curmudgeon tracker (priority-new) + fingerprint tracker
  → Curmudgeon step 0b priority interrupt → first review

STANDARD CHAINS:
Poller → changes/ → Analyst
Poller → status.json → Decider
Curmudgeon → reviews/*.json → digest-reviews.js → pending-digest.json → Decider
Curmudgeon → alerts.txt → Decider
Curmudgeon → tracker.json → Decider
Curmudgeon Cycle 3+ → advocate_mode (defense_survives >= 3) → Decider creates EXP (category: defense) → Analyst Mode 3
Integrity → report-*.json → Decider
Analyst → external-reports/ → Decider
Analyst → category-proposals/ → Decider step 1g
Analyst → expansion-tracker.json (status: complete) → Decider step 2a
Decider → open-issues.json, suggested-patches-*.json
Social → search-rankings.json, drafts/ → Decider step 1h
```

For each chain:
- **Is the consumer reading what the producer writes?** Compare latest outputs. If curmudgeon flagged a critical hole and the decider's report doesn't mention it, that's broken.
- **Coverage gap (Curmudgeon → Decider).** Count curmudgeon reviews newer than decider's last daily report. Compare against `curmudgeon_reviews_processed` in decider's report. Gap = skipping input.
- **Orphaned outputs?** Data produced but never consumed = pipeline design gap.
- **Re-work signals?** Agent producing output for a target that was already completed by another agent = broken handoff causing wasted compute. See `tinker-cost-engineering.md` Step 1b for detailed detection scripts. If you spot re-work during a Mode 1 health check, note it and ensure Mode 3 picks it up.
- **Ignored fields?** Fields the producer populates that the consumer never references.

## Step 3: Verify Previous Findings

For each unresolved finding from the previous tinker report:
1. **Read the actual source file.** Has the code changed? Does it match the proposed fix?
2. **If fixed**, verify correctness — don't just assume it works.
3. **If NOT fixed**, re-check symptom, re-flag with increased urgency.
4. Update `previous_followup` with what you found.

**CRITICAL:** Do NOT carry forward findings based solely on symptom re-checking. A finding that says "still broken" when the code was already fixed is a false alarm. **Always cross-check against GitHub** — the workspace may serve stale files (see Mode 2).

## Step 4: Audit Open Issues

Read `monitor/decisions/open-issues.json`:
- **Age:** Major+ issues open > 7 days = red flag.
- **Repeated deferrals:** Same issue deferred across multiple reports = lazy deferral pattern.
- **Fixed but recurring:** Issue marked fixed but same problem reappears = fix didn't stick.
- **Issues without patches:** Every open issue with a clear fix should have find/replace text.

### Queue-level trend audit (PROP-030, landed 2026-05-11)

The four-pattern checks above are per-issue audits. Queue-level dynamics — total count over time, growth rate, age-distribution drift — are computed at dispatcher pre-flight (see `monitor/prompts/tinker.md` "Pre-flight: Backlog-Trend Computation"). This step reads the already-computed metrics and the threshold-tier finding (if any) from the run's findings[] array.

**If running in Mode 1 specifically** (pipeline health is the primary mode this run): the backlog-trend finding is the **headline check**, appearing above the existing Major+/age/deferrals/recurring/no-patch checks in the narrative. If a moderate-or-higher tier fires, treat as a primary surfacing in the run summary.

**If running in Mode 2/3/4**: the finding is already in `report.findings[]` from the dispatcher pre-flight. No separate Step 4 narrative needed — the metric is silently recorded and the alert lands in the findings array regardless.

**Threshold table (canonical, mirrors tinker.md pre-flight):**

| Tier | Triggers (ANY of) |
|---|---|
| info | open_issues_total grew >5% WoW |
| moderate | total > 200 OR grew >10% WoW OR net_velocity_7d < 0 for 2 consecutive runs OR assigned-analyst > 50 |
| major | total > 300 OR grew >20% WoW OR net_velocity_7d < 0 for 4 consecutive runs OR assigned-analyst > 100 OR age_ge_30d > 50 |
| operator_escalation | total > 400 OR negative velocity for 7 consecutive runs OR assigned-analyst > 150 |

If `operator_escalation` tier fires, append a one-line note to `monitor/tinker/latest-tinker-summary.txt`. The operator will see it in their morning summary read.

**Data sources** (all read once at pre-flight, cached for Step 4 reference):
- `monitor/decisions/open-issues.json` — current state
- `monitor/decisions/closed-issues.json` — recent closures
- `monitor/decisions/closure-ledger.jsonl` — PROP-026 closure audit trail
- `monitor/tinker/queue-history.jsonl` — append-only per-run metric log (tinker sole writer)

## Step 5: Prompt-Config Consistency (spot check 2-3 per run)

- **Stale references.** Prompts referencing files, URLs, or paths that don't exist.
- **Schema drift.** Prompts describing schemas that have been extended. If curmudgeon produces `code_analysis_tags` but decider prompt doesn't mention it → silent drop.
- **Missing fields.** New wins.json fields that not all consumers know about.
- **Schedule alignment.** Consumer should run AFTER producer. If integrity runs at 9 AM but decider at 6:30 AM, decider always sees yesterday's report.

## Step 6: Schedule Health

- **Failed runs.** Gaps in output timestamps = missed runs.
- **Overlapping runs.** Runtime > interval = potential state corruption.
- **Wasted runs.** Agent running at high frequency with nothing to process = recommend frequency reduction.
- **Metadata-vs-reality check.** Compare `priority-queue.json` `schedule_state.<agent>_current_interval_minutes` against actual cron for analyst/decider/curmudgeon. If they differ from `_default`, check for an explanatory override field BEFORE flagging:
  - `schedule_state.<agent>_override_reason` — short reason code (e.g., `fingerprint-backlog`, `churn-and-burn`, `catchup`)
  - `schedule_state.<agent>_override_clear_when` — condition under which the override should be lifted
  - `schedule_state.note` — human-readable explanation

  If an override field exists: verify the clear-when condition is still active (e.g., if it says "pending count = 0" and the count IS 0, the override is stale and should be flagged for revert). **Do not flag a current-vs-default mismatch as drift if there's a valid, still-active override documented.** Only flag as anomaly when: (a) current ≠ default AND (b) no override documented, OR (c) override exists but the clear-when condition is already met.

## Step 7: Cross-Check Agent Understanding (spot check 2-3 per run, rotate)

- **Curmudgeon:** Reviewed claim/finding fields alongside detail? Validated code_analysis_tags?
- **Decider:** Patches for ALL open issues? Patches target correct files (wins.json for WIN fields, sections.json for prose — NEVER generate-html.js)?
- **Integrity:** Searched entire HTML for cross-tab anchors?
- **Poller:** Using correct GitHub API endpoint?
- **Social:** Staying within ownership boundary? (Owns llms.txt, sitemap.xml, robots.txt — NOT wins.json, sections.json.) If social overstepped, did decider catch it?
