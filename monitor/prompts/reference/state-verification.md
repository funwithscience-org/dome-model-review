# State Verification — Cross-Agent Coupling Discipline

**Reference document for the three disciplines defined in PROP-014: WRITE-VERIFY, READ-VERIFY, NARRATE-CITE.**

This file is the canonical reference for agents writing or reading state across the cross-agent coupling boundary. When an agent prompt edit has the agent declaring something is done, citing another agent's work, or narrating pipeline state in prose, point to the relevant section here.

---

## Why this exists

Across 2026-04-26 to 2026-05-02 we observed four distinct bug instances of one common pattern: agents wrote "this is done" / "this is fixed" / "this is critical" assertions in ledger files (closed-issues.json, expansion-tracker.json, human-notes.json, daily-report-*.json) BEFORE the implied state was actually true on disk or pushed to main. The bug family:

- **Phantom integration** (decider): closed-issues marks EXP "fixed" before patches actually land in main (5+ instances across 6 days).
- **Phantom resolution** (analyst): human-notes marks HNOTE consumed before EXP file written (1 known instance).
- **Stale-citation critical** (decider): cites curmudgeon review from hours ago without re-verifying current state (1 confirmed; pattern likely ambient).
- **Narrative confabulation** (decider): chat output makes state-dependent claims unconstrained by what code actually executed (1 confirmed; structural decoupling).

Full forensic trace: `monitor/tinker/proposals/PROP-014-agent-state-coupling.json` (forensic_trace section). Amendment with measurement details: `monitor/tinker/proposals/PROP-014-amendment-001.json`.

---

## Discipline 1 — WRITE-VERIFY

**Rule.** When an agent writes a "this is done" status (`fixed` / `resolved` / `integrated` / `consumed`) into a ledger file, the implied artifact must exist and be the right state on disk *first*.

**Pattern.** Use an intermediate state value to record intent-to-do; only flip to the terminal status once verification passes.

### Sub-discipline 1a — push-verify (decider)

**Surface:** decider's `closed-issues.json`, `tracker.json` writes after self-applying patches.

**Failure mode:** decider commits patches in clone; push 403s (environmental); local commit includes "fixed" status; universal-pusher rescues files to FUSE; some files get back to main via workspace-sync but the lie is already in main.

**Verification primitive:**
```bash
# After git push attempt
LOCAL_HEAD=$(git rev-parse HEAD)
ORIGIN_HEAD=$(git rev-parse origin/main)
if [ "$LOCAL_HEAD" = "$ORIGIN_HEAD" ]; then
  STATUS_VERIFIED=1
else
  STATUS_VERIFIED=0
fi
```

**Vocabulary:**
- Intent-to-do: write `status: 'fixed-pending-verification'` with `verification_pattern` field naming the grep that confirms patch landed.
- After verified push: write `status: 'fixed'` (separate commit) with `verified_at` timestamp.
- Defensive default: downstream readers grepping `status='fixed'` literally do NOT match `'fixed-pending-verification'`. Pending entries are invisible to consumers that haven't been updated for the new vocabulary.

**Rescue path.** If push 403s after retry: leave entries at `fixed-pending-verification`, copy to FUSE via universal-pusher, exit cleanly. The verifier script (`monitor/scripts/verify-pending-state.js`, invoked by workspace-sync) checks each pending-verification entry against `verification_pattern` at `origin/main` and flips to `fixed` when verified.

### Sub-discipline 1b — file-write-verify (analyst)

**Surface:** analyst's `human-notes.json` writes when marking a Mode-N HNOTE consumed/resolved.

**Failure mode:** analyst marks HNOTE `status: 'resolved'` with `resolved_with_exp: 'EXP-NNN'` claim before the EXP file is actually written to disk.

**Verification primitive:**
```bash
# Before flipping HNOTE status to resolved
test -f "$EXPECTED_ARTIFACT_PATH" || STATUS_VERIFIED=0
```

**Vocabulary:**
- Intent-to-do: write `status: 'resolved-pending-verification'` with `verification_artifact_path` field.
- After verified write: write `status: 'resolved'` (separate commit) with `verified_at`.

**Boundary clarification (PROP-014-amendment-001 Q2).** Mech 1b applies ONLY when Mode N writes to human-notes with an implied artifact path. Mode 1b writes verdicts to `data/predictions.json` which has NO implied artifact (the verdict IS the deliverable). Verdict-write is a different surface: read-side covered by Mech 2 (re-fetch poller before locking), write-side covered by Mech 3 (narrative-cite for verdict prose).

---

## Discipline 2 — READ-VERIFY

**Rule.** When an agent reads another agent's status field from a ledger written hours ago and acts on it for a high-stakes decision (declaring critical, escalating to operator, blocking integration, re-flagging an existing issue), verification of the cited current state is required.

**Pattern.** Re-read the cited file at HEAD. Grep for the cited content. If gone or moved, mark source review stale and downgrade.

**Surface enumeration (PROP-014-amendment-001 Q5):**

In-scope (verify-on-read required):

- **RS-a** — decider creating a NEW ISS with severity:critical based on a curmudgeon review. *Already covered* by the existing Staleness Gate (`monitor/prompts/reference/decider-curmudgeon.md` Step 2) — keep coverage, point to this doc.
- **RS-b** — decider RE-FLAGGING an existing ISS as critical based on a stale curmudgeon review. **Primary target.** Existing Staleness Gate fires on issue-creation but not on existing-issue re-declaration. The SC-1 instance (2026-04-30T17:23Z, EXP-277 phantom critical) is exactly this gap.
- **RS-f** — tinker's Step 2b PROP Lifecycle Verification reading PROP `status:'implemented'` fields. Generalizes the verification_pattern discipline; implements "never mark STILL_BROKEN based on workspace md5 vs main alone" (PROP-003 cautionary tale).

Out-of-scope:

- **RS-c** — curmudgeon's chained-cycle reads of prior reviews when authoring c2/c3/cN. Chained reviews document predecessor state, not assert current state. Re-verifying corrupts the chained-review semantics. Out-of-scope, no risk.
- **RS-d** — decider's daily-report `pipeline_status.curmudgeon` prose narration. Prose-write, not state-decision-write. Covered by Mech 3 (narrative-cite), not Mech 2.
- **RS-e** — analyst Mode 2b reading attention-inbox to dispatch. Verify-by-doing — analyst's job IS to re-examine the actual code/data, not take inbox claim as authoritative. The re-examination IS the verification.

Soft watch:

- If analyst Mode 2b ever produces re-examination outputs against absent code (i.e., doesn't self-detect a missing patch), surface as a Mech 2 extension candidate.

**Verification primitive:**
```bash
# Before declaring critical based on a cited curmudgeon review
CITED_FILE="$1"  # e.g. monitor/curmudgeon/reviews/EXP-NNN.json
CITED_LINE="$2"  # e.g. "annular solar eclipse"

# Re-read at HEAD
git show HEAD:"$CITED_FILE" 2>/dev/null | grep -F "$CITED_LINE"
if [ $? -ne 0 ]; then
  echo "STALE: cited content not present at HEAD — downgrade severity, mark review stale"
  STATUS_STALE=1
fi
```

**Discipline before declaring critical:**
1. Read curmudgeon review file at `reviewed_at`.
2. Re-read the cited file (e.g., generate-html.js, docs/index.html, sections.json) at current HEAD.
3. Grep for the cited claim/content/line in the re-read file.
4. If found: declaration stands; proceed.
5. If gone: review is stale on this point; downgrade to non-critical or mark for re-review by curmudgeon.

---

## Discipline 3 — NARRATE-CITE

**Rule.** Every state-bearing claim in chat output / daily-report prose must cite a specific JSON field or log line that supports it. No narrating from prompt-chain memory of prior reports. Same rule we have for scientific-claim citations, applied to operational-claim citations.

**Surface:**
- `monitor/decisions/daily-report-*.json` — `pipeline_status.{poller,analyst,curmudgeon,decider}` fields, `recommended_actions[].action` prose
- `monitor/curmudgeon/reviews/*.json` — `kernel_of_truth` and `our_argument_summary` prose
- `monitor/tinker/report-*.json` — `findings[].description` prose

**Verification primitive (PROP-014-amendment-001 Q3 — three stages):**

### Stage 1 — paragraph-citation gate (HARD AUTOMATABLE)

**Rule.** Every paragraph (>1 sentence) in declared-state prose surfaces MUST contain at least one inline citation.

**Citation regex:** `/\(([^)]+\.(json|jsonl|txt|md))(:[\w-]+)?\)/`

**Acceptance threshold:** 0% uncited paragraphs in declared-state prose surfaces over the post-rollout 14-day window.

**Enforcement:** `monitor/scripts/audit-narrative-citations.js` (deterministic Node, invoked by workspace-sync). Writes `monitor/integrity/narrative-cite-audit-<ts>.json` with per-file pass/fail counts.

### Stage 2 — anchor match (PARTIAL AUTOMATABLE)

**Rule.** For each citation that includes an anchor (`:<field-name>`), verify cited file exists AND contains a key/field matching the anchor.

**Acceptance threshold:** 0% bogus-anchor citations in declared-state prose.

**Failure mode (intentionally accepted):** Catches obvious bogus citations but not citations to real fields whose value doesn't support the claim.

### Stage 3 — semantic match (MANUAL or LLM-as-judge sampling)

**Rule.** Sampled paragraph-claim/citation-content pairs evaluated for semantic match.

**Acceptance threshold:** TBD; recommend operator weekly review of 5% of run-output paragraphs for first 4 weeks post-rollout. If sustained <5% mismatch rate, scale back to monthly.

---

## Author's note for prompt edits

When you edit an agent's prompt to invoke one of these disciplines:

1. **Cite this doc** with relative path: `See monitor/prompts/reference/state-verification.md, Discipline N.`
2. **Quote the verification primitive** inline at the exact step it applies. Don't make agents jump between files mid-execution.
3. **Use the unified vocabulary** (`*-pending-verification`) — readers grepping the unsuffixed status literally won't match pending entries (defensive default).
4. **For Discipline 3, make the citation regex visible** so agents learn the pattern; auditing happens after-the-fact via the script but the inline rule prevents most violations.

---

## Related files

- `monitor/tinker/proposals/PROP-014-agent-state-coupling.json` — full proposal with forensic trace, sense-check audit, mechanism specs
- `monitor/tinker/proposals/PROP-014-amendment-001.json` — clarifications + scope enumeration + Q3 three-stage measurement
- `monitor/scripts/verify-pending-state.js` (TBA) — Mech 1 verifier; flips `*-pending-verification` to terminal status
- `monitor/scripts/audit-narrative-citations.js` (TBA) — Mech 3 paragraph-citation audit
- `CLAUDE.md` File Ownership Rules — DIRECTIVE-LIFECYCLE additive-edit exception for tinker writing lifecycle fields onto operator-directives
