# status.json two-writer race — fix design (DIRECTIVE-20260711-001)

Author: tinker run 2026-07-11T11-37 | Prior forensics: `workspace-sync-status-json-clobber-2026-07-10.md` (a88d026 chimera, ISS-2962)

## Part A — Options table

| Opt | Label | Feasibility | Effort | Detection / prevention latency | PROP-051-class risk |
|---|---|---|---|---|---|
| INST-1 | Integrity field-provenance canary (Section 9d + `check-status-json-provenance.js`) | High — read-only git-history walk; PROP-125 pattern reuse; shipped this run | Small (done: ~130-line script + prompt section) | Detection ≤24h (daily integrity run) | None — read-only, no new writer, integrity forbidden from auto-restore |
| INST-2 | workspace-sync pre-push field-regression sentinel (= **PROP-129** CHECK 4, authored 2026-07-11T02-40, pending operator review) | High for the lite (monotonic-timestamps-only) scope; generalizing to arbitrary fields is FP-heavy | Moderate (hook extension) | **Prevention at push time (immediate)** for monotonic fields | Low-moderate — touches the PROP-121/127 hot-path hook; must stay fail-open (a hook bug degrades to status quo, never blocks all syncs) |
| INST-3 | Poller self-audit formalization ("my fields since I last committed") | High, but marginal: poller ALREADY detects, self-heals, and records incident fields (proven 07-10, `status_json_workspace_sync_clobber_incident`) | Small (poller.md edit) | Detection ≤24h, same as today's implicit behavior | None |
| INST-4 | Decider status.json writes git-only (FUSE-write suppression) | Medium — removes the arming mechanism; partially landed organically (dc46773 shows decider git-syncing status.json) but decider's FUSE-write paths serve other purposes; mandating needs a side-effect audit | Small prompt edit, medium audit burden | Prevention (removes decider from the race); does nothing if a third writer appears | Low, but ripple-risk in decider's other FUSE writes; silent re-arming if any future agent writes status.json to FUSE |
| STRUCT-1 | Single-writer refactor (decider merges a poller-intermediate file) | Low-medium — big ripple across 3+ agent prompts | Large | Prevention by design | Moderate — new race between decider-read-of-intermediate and workspace-sync; could move the problem rather than eliminate it |
| STRUCT-2 | Split status.json into per-writer files | Low — every reader must merge N files | Very large | Prevention by design | Moderate — reader-merge bugs replace writer-race bugs; large test surface |
| STRUCT-3 | Field-level semantic merge in workspace-sync smart_copy | Medium mechanically, but JSON semantic merges are edge-case-heavy (arrays, null-vs-missing, legit resets) | Moderate-large | Prevention at sync time | **High — this is exactly the workspace-sync hot-path, LLM-adjacent code surface where the 2026-05-21 mass-delete disaster class lives (PROP-051)** |

## Part B — Recommendation

**Recommend INST-1 (shipped this run as PROP-130, self-applied) as the accepted fix, with INST-2 (PROP-129, already authored) offered for operator ratification as an optional prevention layer. Reject STRUCT-1/2/3. Fold INST-3/INST-4 into monitoring rather than mandates.** Reasoning: per the operator's explicit instruction, the ~24h self-heal status quo is operationally acceptable — what was missing is *visibility and attribution*. INST-1 closes that gap for the whole file (poller only audits its own fields) at zero race-surface cost: it is read-only, reuses the proven PROP-125 canary pattern, and its self-test fixture replicates the exact a88d026 chimera signature. INST-2/PROP-129 is genuinely complementary (prevention vs detection) but touches the pre-push hook hot path, so it should ride the normal operator-review lane rather than ship unilaterally — if ratified, the combination gives push-time blocking of monotonic reversions plus daily whole-file audit; if declined, INST-1 alone still bounds every recurrence to one visible, attributed, ≤24h incident. The structural options buy prevention the instrumentation already makes cheap to live without, at PROP-051-class risk (STRUCT-3) or large ripple (STRUCT-1/2) — disproportionate for a self-healing, non-disaster-class failure.

**Follow-up PROP shape (constraint satisfied):** PROP-130 — agent: integrity; prompt section: `structure-integrity.md` §9d + report-schema `checks.status_json_provenance`; verification: `node monitor/scripts/check-status-json-provenance.js --self-test && grep -q '### 9d' monitor/prompts/structure-integrity.md && echo FIXED` (grade A, ran PASS at ship time; live history rc=0 clean).

## Part C — Ship status

Shipped in this run (small-INST path per directive): script + Section 9d + schema extension committed together with this report. ISS-2962 left OPEN per directive constraint (`do_not_close_iss_2962_before_prop_ships` — close when PROP-130's integration is confirmed by integrity's next run writing `checks.status_json_provenance`, or operator-manual close on reviewing this design).
