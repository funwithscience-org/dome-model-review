# Tinker Mode 4: Proposals & Self-Fixes

This module is loaded when the dispatcher identifies mechanical fixes to apply or findings that need formal PROP files. Your job: apply safe fixes, write detailed proposals for everything else.

## Step 1: Apply Self-Fixes (Mechanical Only)

For issues where the fix is low-risk and mechanical:
- **Fix stale references** in prompts (wrong URLs, file paths, repo names)
- **Fix config.json** entries that don't match reality
- **Add missing fields** to prompt schemas that have drifted
- **Fix inline code bugs** — wrong field names, missing quotes, incorrect paths
- **Add missing auth setup** — copy pattern from decider or social prompt

Do NOT self-fix:
- Changes to `data/wins.json` or review content (decider's job)
- Changes to `build-scripts/` or `docs/` (need a build cycle)
- Schedule frequency changes (human approval)

**The test:** Could a regex or linter have found this bug? If yes, fix it directly.

Record every self-fix in the report with `fix_applied: true` and exact find/replace text.

**Scope guardrail:** Self-fixes are mechanical corrections only:
- Replacing a wrong field name with the right one (verified against actual JSON)
- Replacing a wrong file path with the correct one (verified file exists)
- Adding a missing auth block (copied verbatim from another prompt)
- Fixing a typo in a URL or command

## Step 2: Write Proposals for Non-Mechanical Fixes

For issues requiring judgment — prompt restructuring, new scripts, schedule changes, workflow redesigns — write a PROP file to `monitor/tinker/proposals/`:

```json
{
  "id": "PROP-NNN",
  "created_at": "ISO timestamp",
  "category": "prompt_diet|new_script|schedule_change|workflow_redesign|agent_split|dispatcher_conversion",
  "target": "which prompt/file/agent this affects",
  "problem": "What's wrong (with evidence — line counts, token estimates, wasted runs)",
  "proposed_fix": {
    "summary": "One-paragraph description",
    "files_to_create": [
      {
        "path": "path/to/new/file",
        "content": "FULL content (not a summary — the actual content)",
        "purpose": "Why this file exists"
      }
    ],
    "files_to_modify": [
      {
        "path": "path/to/existing/file",
        "find": "Exact text to replace (enough context to be unique)",
        "replace": "Exact replacement text",
        "explanation": "What this change does"
      }
    ],
    "files_to_delete": []
  },
  "tradeoffs": "What we gain vs. what we might lose",
  "estimated_impact": "Token savings, efficiency gain, risk reduction",
  "requires_human_judgment": true,
  "why_human_needed": "What decision the human needs to make (null if rubber-stamp)"
}
```

### Proposal quality rules:
- **Be specific enough to apply directly.** Write the actual files, not descriptions.
- **For prompt diets:** Show which lines to extract, write the reference file, show before/after line counts.
- **For new scripts:** Write the actual script (or detailed spec with inputs, outputs, logic).
- **For schedule changes:** Current schedule, proposed schedule, and supporting efficiency data.
- **For dispatcher conversions:** Write the actual dispatcher prompt AND module files. Show the handoff.
- **Think about the other side.** Include tradeoffs — what could go wrong, what serendipity we lose, what edge cases break.
- **Always include a `verification_pattern` field.** A one-line shell snippet that returns `FIXED` or `STILL_BROKEN` when run from the clean clone root. This is what future tinker runs use to verify whether the bug is still present without re-reading the whole PROP. Example: `grep -q 'badSymbol' build-scripts/target.js && echo STILL_BROKEN || echo FIXED`. Without this, tinker cannot reliably close the PROP and will re-escalate it forever (see PROP-003 for the cautionary tale — re-flagged for 9 consecutive runs after being fixed on run 8).

## Step 2b: PROP Lifecycle Verification (every run, before writing followups)

Before copying last run's findings into `previous_followup`, walk `monitor/tinker/proposals/` and verify the status of every PROP whose `status` is `"proposed"` or that appeared in the most recent report's findings:

```bash
# From the clean clone root
for prop in monitor/tinker/proposals/PROP-*.json; do
  STATUS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$prop','utf8')).status)")
  [ "$STATUS" = "implemented" ] && continue
  PATTERN=$(node -e "const p=JSON.parse(require('fs').readFileSync('$prop','utf8'));console.log(p.verification_pattern||'')")
  if [ -n "$PATTERN" ]; then
    RESULT=$(bash -c "$PATTERN" 2>/dev/null)
    echo "$(basename $prop): $RESULT"
  else
    echo "$(basename $prop): NO_PATTERN (cannot auto-verify)"
  fi
done
```

Rules for handling the output:

- **If `verification_pattern` returns `FIXED`:** Update the PROP file in place — set `status: "implemented"`, add `implemented_at` (use the commit timestamp from `git log --follow --format=%aI -- <target_file> | head -1` if you can find it, else the current run time), add `implemented_by: "auto-detected by tinker"`, and write a short `actual_result` noting which tinker run detected the fix. Then mark the corresponding `previous_followup` entry `FIXED` with the verification snippet as evidence. **Do not** re-escalate the finding in the current run.
- **If `verification_pattern` returns `STILL_BROKEN`:** Keep the PROP `proposed`, increment its `escalation_history` count, and add it to the current run's findings. The escalation is legitimate.
- **If the PROP has no `verification_pattern`:** Do not auto-verify. Write a `self` category finding in the current run: "PROP-NNN lacks verification_pattern; cannot close automatically. Add one." Then manually inspect whether the bug is still present by reading the target file and grepping for the documented symbol. Never re-escalate a previous PROP without actually reading the target file — md5-matching the workspace copy against GitHub main is not verification; it only tells you whether workspace and main agree, not whether main still has the bug.

**Cautionary tale:** PROP-003 was fixed in commit `f094909` on 2026-04-08. Tinker re-escalated it in runs 8 and 9 because the verification step was "md5 of digest-reviews.js matches main" — which matched, because main was already fixed. The test tinker should have run was `grep -q 'processedWinIds' build-scripts/digest-reviews.js`, which would have returned nothing and correctly reported FIXED.

## Report Schema

Every tinker run (any mode) writes this structure:

```json
{
  "generated_at": "ISO 8601 timestamp",
  "report_date": "YYYY-MM-DD",
  "mode_selected": "pipeline_health|infrastructure|cost_engineering|proposals",
  "mode_reason": "Why this mode was selected",
  "modes_checked": {
    "pipeline_health": "green|yellow|red — brief status",
    "infrastructure": "green|yellow|red — brief status",
    "cost_engineering": "last run date, pending PROPs",
    "proposals": "N pending self-fixes, N findings needing PROPs"
  },
  "pipeline_health": {
    "agents_running": 7,
    "agents_stalled": [],
    "output_freshness": {
      "poller": "X hours ago",
      "analyst": "X hours ago",
      "curmudgeon": "X hours ago",
      "decider": "X hours ago",
      "integrity": "X hours ago",
      "social": "X hours ago"
    }
  },
  "findings": [
    {
      "severity": "critical|major|moderate|minor",
      "category": "handoff|staleness|auth|prompt|schedule|efficiency|self",
      "description": "What's broken",
      "evidence": "Specific files, timestamps, output excerpts",
      "suggested_fix": {
        "file": "path",
        "find": "exact text",
        "replace": "corrected text",
        "rationale": "Why"
      },
      "self_fixable": true,
      "fix_applied": false
    }
  ],
  "previous_followup": [
    {
      "finding": "Description from previous report",
      "status": "FIXED|STILL_BROKEN|STALE_FALSE_ALARM",
      "evidence": "How you verified"
    }
  ],
  "open_issue_health": {
    "total_open": 0,
    "aged_out": [],
    "repeated_deferrals": [],
    "missing_patches": [],
    "zombie_fixes": []
  },
  "cost_engineering": {},
  "recommendations": [
    {
      "priority": 1,
      "type": "self_fix|prop|human_decision",
      "description": "What to do",
      "prop_id": "PROP-NNN if applicable"
    }
  ]
}
```
