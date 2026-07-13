# Tracker Status Vocabulary Drift — Design Report
**Directive:** DIRECTIVE-20260712-001 | **Run:** tinker 2026-07-13T02-40 | **PROP:** PROP-133 (shipped in-run)

## Recommendation (Part B)

**OPT-1, shipped this run.** Widen the decider Priority 4 filter to accept `'ready-for-integration'` alongside `'complete'` and `'revised'`. Rationale: (a) no current prompt *writes* `ready-for-integration` — the vocabulary is legacy (2026-04-27 vintage; verified by whole-prompt grep, the only reference is analyst.md:287's read-side staleness fallback) — so OPT-2 has nothing left to normalize and would churn a prompt for zero future benefit; (b) OPT-3's prompt-enum parser is heuristic and false-positive-prone against markdown prose, and the honest class detector isn't vocabulary-based at all — a stuck-item detector (any non-terminal, non-integrated tracker item untouched >14d) would have caught EXP-626 in 14 days instead of 75 and also catches every *future* stuck-item cause, vocabulary or not. That data-side check is noted below as an optional follow-up shape for operator consideration, but is deliberately NOT bundled here (directive scope: "add ONE integrity check for this class", and the instrumentation-friendly minimum is the filter fix). One clear recommendation: OPT-1.

**Material discovery during implementation: the "one-line" filter is actually THREE coordinated sites.** The identical filter expression is duplicated in `decider.md:248` (trigger check), `decider-curmudgeon-pq-mechanics.md:3` (load-condition doc sentence), and `decider-curmudgeon-pq-mechanics.md:13` (the Step 2a enumeration decider actually iterates). Widening only decider.md:248 would have made Priority 4 *fire* while Step 2a's enumeration still *skipped* RFI items — a brand-new cross-prompt drift of exactly the class this directive is about. All three sites were widened in the same commit. This is itself the best evidence that the drift class is real: the fix for a vocabulary drift almost shipped a duplication drift.

## Options table (Part A)

| Option | Shape | Cost | Risk | Verdict |
|---|---|---|---|---|
| OPT-1 widen decider filter | Same string edit at 3 sites (decider.md:248, pq-mechanics.md:3+13) | Minimal | Very low — widening never blocks legit items; fixture-verified | **RECOMMENDED + SHIPPED** |
| OPT-2 normalize analyst vocab | Prompt edit + tracker sweep | Small | No current write-site exists — pure churn; analyst.md:287 fallback text would still need to stay for legacy entries | Rejected: fixes nothing forward-looking |
| OPT-3 integrity prompt-enum drift check | New parser + integrity section | Moderate | Prompts aren't machine-readable; heuristics → false positives; misses non-vocabulary stuck causes | Rejected as specified; better class fix is data-side staleness (see note) |
| OPT-4 = OPT-1 + OPT-3 | Sum of both | Moderate | Low, but inherits OPT-3's false-positive tax | Rejected: OPT-3 half not worth it in current shape |

**Optional follow-up (not authored, operator may commission):** integrity Section 9f "tracker stuck-item canary" — flag any expansion-tracker item where status ∉ {integrated-terminal set, consolidated-into-*, escalated, draft_awaiting_human_group_review, pending} AND !integrated AND last-touch >14d. ~15 lines, data-side, no prompt parsing. Would have caught this bug in 14 days and catches the whole stuck-item class regardless of cause.

## Ship record (Part C)

- Shipped in-run per part_C_ship_or_follow_up (OPT-1 qualifies). Edits minimal; no Priority 4 refactor; workspace-sync untouched.
- Fixture verification (Grade B, also encoded in PROP-133 verification_pattern): 7-item fixture {complete/revised/RFI × integrated-flag variants + pending + consolidated} → widened filter catches exactly {complete&!int, revised&!int, RFI&!int}, excludes integrated/pending/consolidated. PASS. Existing behavior preserved (complete/revised semantics unchanged — pure widening).
- Live effect check: under the widened filter the tracker currently surfaces exactly one item — EXP-626.

## ⚠️ EXP-626 hazard window (operator action needed before 2026-07-14T02:07Z)

Now that the filter is widened, **decider's next Priority 4 run (~2026-07-14T02:07Z) WILL pick up EXP-626 and integrate it via Step 2a** — it has no `no_op:true` marker, so Step 2a's no-op guard will not hold it back. Per the directive, EXP-626 needs an operator content cross-check first (may be OBE-integrated with a stale tracker). Before 2026-07-14T02:07Z, either: (a) complete the EXP-626 content check and mark `integrated:true` + `integration_mode:'obe-stale-tracker'` if already present, or (b) park it out of the filter (flip status to `'escalated'`) until the check is done. Doing nothing = decider integrates it as-is tomorrow.

## EXP-650/651/652/653 status (context)

Operator's same-commit flip worked as intended: all four were integrated by decider 2026-07-12T08:03Z (commit 544fdf7) and archived. The immediate unblock needed no tinker action; this directive's residue was only the durable fix + EXP-626.
