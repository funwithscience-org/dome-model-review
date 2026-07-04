# PROP-Graph Archaeology + Pending-Directive Audit

**Directive:** DIRECTIVE-20260704-001 (supersedes false-closed DIRECTIVE-20260628-004)
**Run:** tinker 2026-07-04T15-03
**Scope:** 132 PROPs + 19 pre-existing pending operator-directives

Bucket key: **A** = trivially superseded (shipped PROP fulfills the ask, mechanical close); **B** = genuinely still owed; **C** = aged out; **D** = unclear (operator question).

## Part A — Pending-Directive Audit

| directive_id | age | class | evidence | action |
|---|---|---|---|---|
| DIRECTIVE-20260603-003 | ~31d | A | PROP-078 implemented, directive_id back-ref correct; CLAUDE.md confirms Part B landed 06-03. Zombie only because directive file lacks a directive_id field (see Root-Cause). | CLOSED this run |
| DIRECTIVE-20260607-002 | ~27d | A | PROP-083 implemented (directive_id=this); CLAUDE.md confirms pre-push hook forensics shipped 06-07. Same missing-directive_id zombie. | CLOSED this run |
| DIRECTIVE-20260619-001 | 15d | A | PROP-108 phase-0-shadow-shipped AND directive-auto-close-enforce.flag PRESENT — the mechanism this directive commissioned is live and ran this cycle. | CLOSED this run |
| DIRECTIVE-20260620-001 | 14d | A? | PROP-110 phase-1a-shipped — workspace-sync cost audit delivered + cadence cut shipped. | HNOTE ratify |
| DIRECTIVE-20260620-002 | 14d | A? | PROP-111 phase-0-and-1a-shipped — integrity cost audit + measurement shipped. | HNOTE ratify |
| DIRECTIVE-20260620-003 | 14d | A? | PROP-112 phase-0-shipped — decider STEP_MARKER cost analysis delivered. | HNOTE ratify |
| DIRECTIVE-20260622-001 | 12d | A? | PROP-113 phase-P3-shipped — design doc authored + fixes shipped. | HNOTE ratify |
| DIRECTIVE-20260623-001 | 11d | A? | PROP-114 phase-P2-shipped — amendment + root-cause authored + shipped. | HNOTE ratify |
| DIRECTIVE-20260613-004 | 21d | A?/B | PROP-097 approved-mech-1-implemented — diagnosis + fix mech-1 shipped, mech-2 pending. | HNOTE ratify (partial) |
| DIRECTIVE-20260614-003 | 19d | B | PROP-102 phase-0-implemented-phase-1-pending — the very PROP whose enforce-flip readiness is under review in Part C. | keep pending |
| DIRECTIVE-20260613-003 | 21d | B | PROP-096 pending (proposal exists, not shipped). human-notes schema reconciliation still owed. | keep pending |
| DIRECTIVE-20260531-008 | old | B | Blocked: PROP-069 is design-pending-operator-review; implementation cannot proceed until operator reviews the design. | keep pending (blocked-on-operator) |
| DIRECTIVE-20260613-001 | 21d | B | PROP-107 (pending, directive_id=null) addresses this — prune-integrity push-gap fix designed but not shipped, and not linked. High-prio infra debt. | keep pending; backfill link recommended |
| DIRECTIVE-20260610-002 | 24d | B/D | No PROP. dome-mirror delete-propagation gap. Possibly overlaps PROP-113/114 dome-mirror work — needs confirmation. | surface |
| DIRECTIVE-20260612-001 | 22d | B/D | No PROP. dome-mirror overwrite-mode propagation gap. Same overlap question. | surface |
| DIRECTIVE-20260608-002 | 26d | B/D | No PROP. analyst.md Mode 2b broken-schema fallback hardening. Same defect family as PROP-093/096 but no dedicated PROP. | surface |
| DIRECTIVE-20260609-001 | 25d | C/D | Investigate-only directive re: verify's 06-09 queue-schema complaint. Likely OBE (no recurrence in 25d), but no artifact confirms the investigation ran. | surface as C-candidate |
| DIRECTIVE-20260628-005 | 6d | B | No PROP. Deep-dive #4 Candidate D (Disaster-Recovery Playbook). auto_close_when_deliverable_proposed=true, recent — genuinely still owed. | keep pending |

**Summary:** 3 firm-A closed this run; 6 A?-ratify batched to operator HNOTE; ~9 B/C/D surfaced. Ratio ~16% firm-close / ~32% ratify-candidate / ~47% still-owed-or-unclear — close to operator's prior, with the "ratify" batch being the conservative treatment of phase-shipped (non-terminal) PROPs.

## Part B — PROP-Graph Archaeology (132 PROPs)

**Status distribution:** 65 implemented, 10 superseded, 8 integrated, 2 applied, 1 self-applied; remainder phased/partial/deferred/proposed/pending (43 distinct status strings — high status-vocabulary entropy, a minor concern in itself).

### (a) OBE-but-not-marked
- **PROP-100** (proposed, "EXP-id unconditional archive-aware clamp") is OBE. **PROP-106** ("EXP allocator single-write-path", phase-0-shadow-shipped) shipped allocate-exp-ids.js + lint-exp-allocations.js (both in repo) and CLAUDE.md documents PROP-106 as the canonical EXP allocator. PROP-106 mentions PROP-100; PROP-100 does not mention PROP-106. Recommend: `node monitor/scripts/mark-prop-superseded.js PROP-100 by PROP-106`.
- **PROP-087** (approved, "decider-write-site schema lint") is status-lagged. lint-decider-surfaces.js is shipped and CLAUDE.md documents PROP-087/089 as implemented 2026-06-10, wired into the PROP-083 pre-push hook chain. VP replay could not run here (commit 3d9675d is outside the depth-50 clone). Recommend: advance to implemented after full-history VP replay confirms.

### (b) wrongly-marked-implemented
No over-marked PROP in the spot-check. **A full verification_pattern sweep of all 65 implemented PROPs was NOT performed this run** (budget + shallow-clone VP-replay limits). Deferred — this is the load-bearing evidence gap for the Part C PROP-102 recommendation.

### (c) broken-chain
Mechanical supersedes-graph walk: **zero** dangling supersedes_props edges. The only missing edge is the undeclared PROP-100 to PROP-106 supersession in (a).

### (d) mislink false-close risk
- **DIRECTIVE-20260628-004 <- PROP-120** — the seed. Single-claim, wrong-intent. Already known; this directive supersedes it. Not auto-detectable (needs semantic match).
- **DIRECTIVE-20260628-002 <- PROP-117 + PROP-118** — benign multi-PROP-from-one-commission; both integrated.
- **Structural bug (Root-Cause):** the 3 legacy directives with a missing directive_id field produce filename-derived ids that never match a PROP short-form back-ref — a false-negative (auto-close can never reach them), mirror of the PROP-120 false-positive.

### Root-Cause: legacy directives lack a directive_id field
directive-auto-close.js computes `directiveId = d.directive_id || filename`. DIRECTIVE-20260603-003, -20260607-002, -20260531-008 have no directive_id field, so the id resolves to the full filename, which never equals a PROP short-form directive_id. Result: perpetual zombies even when the linked PROP is terminal. Fix (recommend PROP): normalize the filename-derived id to its DIRECTIVE-\d{8}-\d{3} prefix before matching, OR backfill the directive_id field on legacy files. This run closed the two OBE zombies manually.

## Part C — Trust-Graph Recommendation

**PROP-108 (directive auto-close) enforce mode -> KEEP ON, add one hardening PROP.**
The conservative terminal-only whitelist held for every phase-shipped directive this run (0 premature closes; would_close=0). The single realized false-close (PROP-120 -> DIRECTIVE-20260628-004) came from a defensible opportunistic directive_id declaration, not a whitelist failure, and is now corrected by supersession. The active defect is the opposite failure mode (legacy zombies that CANNOT close), which is safe but noisy. Keep enforce ON; ship the filename-id-normalization fix; no per-directive semantic vetting gate needed yet.

**PROP-102 (PROP auto-close) enforce-flip -> NOT READY, keep SHADOW.**
Mechanism A flips a PROP to implemented when its VP passes. The risk is a VP that passes on unshipped work (false-positive close). This run did not complete the full VP sweep, so zero false-positives cannot be certified. The two status inaccuracies found (PROP-100, PROP-087) are both in the safe (under-marked) direction — encouraging but not sufficient. Do the full VP sweep first; flip to enforce only after it comes back clean.

**Both recommendations are advisory. Operator flips the flag files.**

## Deferred to follow-up run (per directive split allowance)
Full verification_pattern sweep of all 65 implemented PROPs (category (b) certification) — the shallow depth-50 clone cannot replay historic commits referenced in some VPs; needs a full clone. Progress tracked in prop-graph-archaeology-progress.json.
