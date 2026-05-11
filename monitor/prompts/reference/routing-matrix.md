# M1 Routing Matrix and Class-Hint Propagation (PROP-027)

Canonical reference for the M1 stale-issue sweep's decision tree. Replaces PROP-026's three-action matrix with a five-action tree. Landed 2026-05-10.

**Mode-aware age threshold** (operator amendment 2026-05-10 post-PROP-027):
- **BAU mode:** 21d threshold. Steady-state, gives c4→c5 cycle time.
- **Burndown mode:** 7d threshold. Aggressive drain of the 7-21d cohort during backlog clearance.
- The 48h recently-touched guard protects active curmudgeon-decider cycle items regardless of threshold.

**See also:**
- `monitor/prompts/decider.md` Priority 5b — where the matrix is invoked
- `monitor/prompts/reference/decider-curmudgeon.md` Step 8c — M3 carry-over enforcement uses the same action set
- `monitor/prompts/reference/analyst-mode1-expansions.md` — analyst class_hint intake at EXP authoring time
- `monitor/tinker/proposals/PROP-027-routing-matrix-with-class-propagation.json` — full proposal

---

## The 5-action decision tree

For each M1 candidate (or M3 carry-over), apply the decision tree top-down. **First match wins.** The bash helper writes a default-intent ledger entry; the decider LLM walks per-issue and writes corrective ledger lines for overrides.

| Step | Rule | Action | Notes |
|---|---|---|---|
| 1 | severity ∈ {major, critical} | **ESCALATE-TO-HUMAN** | Invariant. Never auto-close major/critical. |
| 2 | re-grep negative AND severity ∈ {minor, info} | **WONTFIX-WITH-RATIONALE** | Forbidden on moderate (route-to-analyst instead). Re-grep evidence required in ledger. |
| 3 | Three-rule narrowness gate passes (see below) | **PATCH** (minor/info) or **NARROW-PATCH** (moderate) | Mechanical fix. Step 5 self-apply pushes class='verification' per PROP-025. |
| 4 | NEVER_PUSH file modification, physical-world verification, legal/strategic/personal knowledge required | **ESCALATE-TO-HUMAN** | Genuine operator-only territory. ISS-1089, ISS-1924 are canonical examples. |
| 5 | Issue is curmudgeon-raised AND next action is curmudgeon adversarial re-attack (rare — most need analyst defense) | **ROUTE-TO-CURMUDGEON** | Push to priority-queue with class derived per PROP-025. Set `iss.routed_to_curmudgeon_queue_id` to prevent re-trigger. |
| 6 | Default | **ROUTE-TO-ANALYST** | Status → `assigned-analyst`. Optional `class_hint` field. **PROP-029: ALSO write corresponding expansion-tracker.json entry** (source='decider-m1-route', issue_ids=[iss.id], review_class=class_hint, status='pending'). Analyst Mode 1 dispatcher fires on the tracker entry and Mode 1 procedure picks up. |

---

## The narrowness gate (NARROW-PATCH on moderate)

All three rules must hold (conjunctive):

1. **NARROWNESS** — ISS body explicitly identifies a single-field correction, single-line text replacement, 2-3-character fix, or one-token rename. LLM has line-level evidence in description (or via re-read of source). Multi-paragraph rewrites or phrasing-judgment changes do NOT pass.

   *Pass example:* ISS-1043 — `code_analysis.monitoring: 'none' → 'hardcoded'` on WIN-044. Single field, value pinned.
   *Fail example:* "Section 4 framing should better acknowledge the methodology caveat" — phrasing judgment.

2. **RE-GREP** — Run `grep -n 'exact_text' <target_file>` against the live target. Text must still be present. Zero hits → route to WONTFIX-WITH-RATIONALE (step 2 in the tree, not narrow-patch).

3. **NOT_NEVER_PUSH** — Target file MUST NOT be in `monitor/prompts/workspace-sync.md` NEVER_PUSH list. NEVER_PUSH targets (build-scripts/, generate-html.js, build.js, test.js, monitor/prompts/*.md, CLAUDE.md, etc.) require operator-applied patches → step 4 ESCALATE-TO-HUMAN. **Sub-rule:** `docs/index.html` is in NEVER_PUSH but is generated from sections.json — if the patch can target sections.json instead, NOT_NEVER_PUSH passes.

If gate fails, fall through to next decision step (NEVER_PUSH check or default route-to-analyst).

---

## Class-hint propagation chain

Tracks an advisory tag from M1 → ISS → analyst EXP → queue push → curmudgeon batchability gate.

```
M1 routing decision (decider)
    ↓
sets iss.class_hint: 'verification' | 'deep-attack' | 'holistic' | null
    ↓
analyst Mode 2 intake reads iss.class_hint
    ↓
analyst authors EXP with review_class (PROP-025 — analyst is authoritative)
    ↓
decider integrates EXP, reads exp.review_class
    ↓
queue push with class = exp.review_class
    ↓
curmudgeon Step 8a batchability gate reads queue_item.class
    ↓
verification → batchable; deep-attack/holistic → singleton
```

**Where the hint lives:**
- Primary: `iss.class_hint` field on open-issues.json entry
- Audit mirror: `closure_evidence.class_hint` on the M1 ledger entry
- NOT in routing_reason free-text (parser brittleness rejected)

**Decider sets the hint at routing time:**
- `'verification'` if work is narrow-correction / value-fact-check / single-source-investigation
- `'deep-attack'` if work is EXP revision / new argument / defender-pivot / curmudgeon-raised-concern-needing-defense
- `'holistic'` if multi-WIN or cross-section work
- `null` if uncertain (analyst decides per PROP-025)

**Binding:** advisory only. Analyst's `review_class` on the EXP file is authoritative per PROP-025. The hint saves analyst cognitive load when routing context already implies a class.

---

## Source-based hint defaults (decider's quick reference)

| ISS source / found_by | Most common routing | Default class_hint |
|---|---|---|
| `expansion-integration` (ready/pending forwarding ticket) | route-to-analyst (verify EXP integrated) OR auto-close via M2 | verification |
| `curmudgeon` (curmudgeon-raised hole) | route-to-analyst (analyst defends or revises) | deep-attack |
| `curmudgeon-EXP-NNN-proposal` (proposal review feedback) | route-to-analyst (revise proposal) | deep-attack |
| `decider` (decider-flagged from earlier run) | varies — read description | per scope |
| `analyst` (analyst-self-flagged for follow-up) | route-to-analyst | per scope |
| `integrity` (integrity-detected drift) | route-to-analyst (verify still real) | verification |

These are defaults; decider LLM overrides per ISS.

---

## When to route ANALYST vs CURMUDGEON

The "blurs the line" question (per DIRECTIVE-20260510-002): a curmudgeon-raised ISS could go either direction.

**Decision rule: focus on what the next action IS, not who raised the issue.**

- **Next action = defense / revision / new prose** → ROUTE-TO-ANALYST. (Analyst writes EXP defending or revising.)
- **Next action = adversarial re-attack on a proposal** → ROUTE-TO-CURMUDGEON. (Curmudgeon re-reviews the proposal.)
- **Next action = verify a patch landed cleanly** → ROUTE-TO-CURMUDGEON with class='verification'. (Standard post-patch verification cycle.)

Today's 9-ISS batch (2026-05-10): 0 routed to curmudgeon; 8 routed to analyst (curmudgeon raised some, but the next action was analyst defense, not curmudgeon re-attack); 1 narrow-patch (ISS-1043).

---

## Worked examples (from 2026-05-10 9-ISS batch)

Each ISS's matrix walk under PROP-027:

| ISS | sev | matrix walk | revised action | class_hint |
|---|---|---|---|---|
| ISS-1043 | moderate | step 3 narrowness gate passes (single field, re-grep present, NOT_NEVER_PUSH) | NARROW-PATCH | N/A |
| ISS-1087 | moderate | step 3 fails (multi-word framing); step 6 default | ROUTE-TO-ANALYST | verification |
| ISS-1088 | moderate | step 3 fails (framing replacement); step 6 default | ROUTE-TO-ANALYST | verification |
| ISS-1089 | moderate | step 3 fails (NOT_NEVER_PUSH — generate-html.js); step 4 fires | ESCALATE-TO-HUMAN | N/A |
| ISS-1130 | moderate | step 3 fails (multi-field schema); step 6 default | ROUTE-TO-ANALYST | deep-attack |
| ISS-1132 | moderate | step 3 fails (multi-source investigation); step 6 default | ROUTE-TO-ANALYST | verification |
| ISS-1147 | minor | step 3 fails (multi-field); step 6 default | ROUTE-TO-ANALYST | deep-attack |
| ISS-1164 | moderate | step 5 N/A (next action is analyst defense, not curmudgeon re-attack); step 6 default | ROUTE-TO-ANALYST | deep-attack |
| ISS-1165 | minor | step 3 partial (count clarification — single-source but analyst-class); step 6 default | ROUTE-TO-ANALYST | verification |
| ISS-1166 | minor | step 5 N/A; step 6 default | ROUTE-TO-ANALYST | deep-attack |

**Result:** 8 ROUTE-TO-ANALYST, 1 NARROW-PATCH, 1 ESCALATE-TO-HUMAN, 0 ROUTE-TO-CURMUDGEON. Compare to first burndown fire's 9/9 escalate-to-human result before PROP-027.

---

## Ledger schema extension

`closure-ledger.jsonl` schema (PROP-027):

```json
{
  "closed_at": "ISO",
  "closed_by_run": "<run_id>",
  "closed_by_mechanism": "M1" | "M2" | "M3",
  "iss_id": "ISS-NNNN",
  "prior_status": "open" | ...,
  "closure_reason": "<text>",
  "action_taken": "patch" | "narrow-patch" | "wontfix" | "route-to-analyst" | "route-to-curmudgeon" | "escalate",
  "closure_evidence": {
    "age_days": <int>,
    "severity": "minor" | "moderate" | "major" | "critical" | "info",
    "rationale": "<text>",
    "class_hint": "verification" | "deep-attack" | "holistic" | null,
    "description_excerpt": "<≤120 chars>"
  },
  "patch_file": "<path>" (when action_taken='patch' or 'narrow-patch'),
  "wontfix_rationale": "<text>" (when action_taken='wontfix'),
  "route_queue_id": <int> (when action_taken='route-to-curmudgeon'),
  "can_revert": true,
  "dryrun": false
}
```

**Override pattern:** when LLM overrides the bash default-intent, write a NEW ledger line with the corrective action_taken (don't mutate the original line). Audit consumers reading by `closed_by_run` should take the LATEST line for each iss_id within a run as the canonical action.

---

## Open-issues schema extension (M1 routing fields)

When M1 routes:

| Field | Type | When set |
|---|---|---|
| `class_hint` | enum or null | M1 ROUTE-TO-ANALYST (per matrix); analyst reads at intake |
| `routed_at` | ISO | M1 ROUTE-TO-ANALYST or ROUTE-TO-CURMUDGEON |
| `routed_by_run` | string | same |
| `routing_reason` | string | same |
| `routed_to_curmudgeon_queue_id` | int | M1 ROUTE-TO-CURMUDGEON only — prevents re-trigger |
| `escalation_reason` | string | M1 ESCALATE-TO-HUMAN |
| `escalated_by_run` | string | same |
| `escalated_at` | ISO | same |

These are additive to existing fields. No removal.
