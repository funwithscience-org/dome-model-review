# FUSE unlink() EPERM Investigation — DIRECTIVE-20260708-001

**Run:** tinker 2026-07-08T20-16 | **Status:** complete | **Method:** text-based investigation only (no permission experiments, per directive constraint)

## Recommendation (Part C)

**Adopt FIX-5 (accept steady state + canary), with FIX-3 reduced to an optional calendar reminder.** The EPERM is not a bug and not a dome-mirror defect — it is the platform's deny-by-default FUSE unlink policy, which is only lifted by the interactive `mcp__cowork__allow_cowork_file_delete` grant, and that grant requires a present human to approve it. Scheduled sessions have no present human, so no scheduled agent can hold the grant, which rules out FIX-1 and FIX-2 outright and hollows out FIX-3 and FIX-4 (each just relocates the same wall). More importantly, Q5 comes back with a strong "don't fight this": the no-unlink default is the reason FUSE held a complete independent file set through the 2026-05-21 git mass-delete disaster, and recovery "would not have been possible" without it (SESSION-CONTEXT.md L723). Handing standing delete rights to an unattended scheduled agent would remove that property from exactly the sessions most likely to need it as a backstop. The honest posture is: automated deletion from scheduled contexts is structurally unavailable AND undesirable; the manifest-only fallback is the correct design, and the operator drain (proven twice: 2026-06-13, 2026-07-08) is the deletion mechanism. This report ships a read-only canary script (`monitor/scripts/check-delete-propagation-backlog.js`, RC=3 at ≥200 candidates) and PROP-125 proposes the one-line integrity-agent hookup plus the documented drain playbook. At the projected post-quiet-era inflow (~10–15 candidates/day once the June high-cadence tail finishes aging through retention; observed +30/day pre-drain), a 200-candidate canary gives roughly 3–4 weeks of operator lead time before the 500 abort gate — a drain every 1–2 months, a few seconds each.

---

## Part A — Root Cause (Q1–Q5)

### Q1 — Why does unlink() succeed from cowork but fail from scheduled sessions?

**Answer: (a) — a per-session permission grant, with one refinement: the discriminator is granted-vs-ungranted, not cowork-vs-scheduled.** Cowork sessions *without* the grant fail exactly the same way.

Evidence chain:

1. **The grant exists and is session-scoped.** CLAUDE.md §Two-Repo Architecture: "FUSE workspace can't be `unlink()`'d normally. The cowork `mcp__cowork__allow_cowork_file_delete` tool grants permission to delete files in the workspace folder, **persisting for the session**."
2. **Cowork sessions WITHOUT the grant also EPERM.** PROP-065 (`operator_action_recommended`): deletion "currently **blocked by allow_cowork_file_delete rejection** in the parent session — operator can grant if desired." Tinker report-2026-05-31T05-42.json: "FUSE unlink not permitted (allow_cowork_file_delete **declined** in parent session)." Both are cowork sessions failing for lack of a grant — so session type per se is not the mechanism.
3. **Every documented FUSE-delete success coincides with an explicit grant.** 2026-05-19 WIN-070 loop kill (CLAUDE.md: "`allow_cowork_file_delete` + `rm` of the FUSE copy"); 2026-06-13 narrative-cite drain of 462 orphans (DIRECTIVE-20260613-001: "mcp__cowork__allow_cowork_file_delete + xargs rm"); 2026-07-08 bulk drain of 1,137 files (this directive's evidence block).
4. **It is a policy deny, not a read-only mount.** Writes work fine from scheduled sessions: dome-mirror's own sentinel (2026-07-08T08:35Z) records `files_copied: 114` in the same cycle that unlink EPERM'd, and the PROP-092 config note records empirically that "fs.copyFileSync truncate-write WORKS on FUSE (no unlink dependency)." A uid/gid or mount-namespace difference (options c/d) would not produce write-allowed/unlink-denied asymmetry that flips per-session with a grant tool.

Options (b)/(c)/(d) cannot be 100% excluded without live probing (forbidden by this directive's constraints), but every observable in the record is explained by (a) and none requires (b)–(d).

### Q2 — Can `allow_cowork_file_delete` be programmatically requested at the start of a scheduled run?

**Answer: the tool can be *called* from any session, but the grant is an interactive human-approval flow — and scheduled runs have no human present.** The vocabulary in the record proves the human decision point: the grant was "**declined**" (report-2026-05-31) and "**rejection**" occurred (PROP-065) — tools that agents self-grant don't get declined. The scheduled-task harness contract states explicitly that "the user is not present to answer questions," so an approval prompt raised mid-run has nobody to approve it.

Why dome-mirror.md doesn't already request it: **this was a deliberate deferral, not an oversight.** PROP-091's `fuse_unlink_caveat` says verbatim: "Whether to grant dome-mirror automated delete permission is **an operator decision** — see why_human_needed," and the shipped docstring (sync-workspace-step4c.js L102–108) designed the EPERM fallback in from day one. Phase 2's T6 probe (PROP-091 test plan) explicitly anticipated both outcomes and called both "safe." Confirming whether a scheduled session could ever hold the grant would require the experimentation this directive forbids — noted and stopped, per constraint.

### Q3 — Do other agents ever need FUSE unlink?

**Answer: no. Every deletion in the pipeline happens git-side, in clones on the normal filesystem. dome-mirror's delete-propagation pass is the first and only automated FUSE-unlink consumer in the project's history.**

Survey: poller/analyst/curmudgeon/social write new files (append-only dirs); decider commits from its clone; prune-integrity archives + deletes **inside its clone** and pushes; workspace-sync is copy-only FUSE→git (its NEVER_PUSH/GIT_APPEND_ONLY logic skips, never deletes); integrity/tinker are read-and-report. The known FUSE-unlink needs are all historical *operator* actions (WIN-070 2026-05-19, narrative-cite 2026-06-13, bulk drain 2026-07-08). CLAUDE.md even documents the workaround culture for the constraint: "FUSE cannot unlink files, so processed proposals persist as orphans; **the ledger deduplicates**" (`processed-proposals.json`). There is no established scheduled-agent FUSE-delete pattern because the platform has never permitted one.

### Q4 — What does prune-integrity do that works?

**Answer: it deletes where it has real permissions — in its git clone — and lets git carry the deletion.** `prune-integrity.js` appends each artifact to the retention JSONL archive, then `fs.unlinkSync(m.full)` where `m.full` is a **clone path on ext4**, not FUSE (script L303–311; the archive-append-before-delete ordering plus "do NOT delete if archive append failed" guard), then commits and pushes. No FUSE permission is ever needed.

That is the pattern to copy *for git-side state* — and it is already fully copied: git-side is clean. Its structural blind spot is exactly what PROP-091 was built for: `build.js sync-workspace` is create-only, so files prune deletes from git **persist in FUSE forever** with no automated remover. Q4's lesson is therefore double-edged: the delete-via-git pattern works because git is the medium; there is no equivalent medium for the FUSE side — someone with unlink rights must eventually touch FUSE, and per Q1/Q2 that someone is only ever a granted interactive session.

### Q5 — Is there a reason scheduled agents SHOULDN'T unlink FUSE?

**Answer: yes, and this project is itself the best evidence.** The deny-by-default unlink policy makes the FUSE workspace an independent, agent-tamper-resistant copy of the corpus. On 2026-05-21, workspace-sync's improvised fallback mass-deleted 4,733 of 4,755 tree entries **on the git side**; SESSION-CONTEXT.md L723: "Recovery would not have been possible without FUSE holding the full file set independently of git — the dual-storage architecture proved itself in production." The reason FUSE held the full set is precisely that no scheduled agent *could* delete from it. Granting standing unlink rights to an unattended scheduled agent — the same class of actor that caused the disaster — would remove the independence property from the recovery copy. PROP-051's whole gate architecture treats agent-side deletion as the top disaster class. This is a strong signal, per the directive's own framing, to relocate or accept rather than enable.

**Bonus finding (adjacent, evidence from the same sentinel series):** PROP-124's Option B1 (temporary `abort_abs=1500` for self-drain) could never have drained the backlog even without the EPERM. The 2026-07-08T04:34Z sentinel shows `candidates=1135, aborted="delete-sanity gate: 1135 candidates exceeds abort_abs=1500 or 50% of category"` — 1135 < 1500, so it was the `abort_pct_of_category=50` gate that fired. Any future bulk-drain plan must account for BOTH gates. The operator's manual B2 drain was not just faster; it was the only path that worked.

---

## Part B — Fix-Path Inventory

| Fix | Feasibility | Effort | Risk | Solves or moves? |
|---|---|---|---|---|
| **FIX-1** — dome-mirror requests `allow_cowork_file_delete` at run start | **Low/none.** Grant requires interactive human approval (Q2); scheduled runs have no human. Unverifiable without forbidden experimentation. | Tiny (prompt block) + one supervised test | **High.** Standing delete rights in an unattended agent removes the human gate that is load-bearing for disaster recovery (Q5). A bugged DELETE_PATTERNS entry becomes automated data loss on the user's iCloud-synced workspace. PROP-051-class. | Would solve IF the platform allowed it — all evidence says it doesn't, and shouldn't. |
| **FIX-2** — move delete-propagation into workspace-sync | **Low.** The discriminator is grant-vs-no-grant, not agent identity (Q1 #2); workspace-sync is an equally ungrantable scheduled session. | Medium | **High.** Reverses PROP-074's architectural separation (the fix for an ~85% silent-skip bug class) and puts a delete path back into the agent that caused the 2026-05-21 disaster. | **Moves it**, almost certainly to the identical EPERM. |
| **FIX-3** — scheduled task that fires a cowork session to drain periodically | **Uncertain-to-low as specified.** A *scheduled* cowork session still runs unattended, so the grant approval still lacks a human (Q2). What's actually proven is an *interactive* operator drain. | Low | Low | **Degrades honestly to FIX-5 + a calendar reminder** — which is fine, and is folded into the recommendation. |
| **FIX-4** — git-side reconciliation only | **Moot.** Git-side reconciliation already exists and works (prune-integrity, Q4). The residual problem is exclusively FUSE-side, and any FUSE unlink from a scheduled context hits the same wall. | High (redesign) | Medium (touches workspace-sync's write path) | **Moves it** — the directive's own text predicted this: "Might just push the EPERM problem to workspace-sync." Correct. |
| **FIX-5** — accept steady state; canary at 200 candidates; documented periodic operator drain | **Full.** Zero platform dependencies; drain proven twice (06-13, 07-08). | Tiny — canary script ships with this report; PROP-125 proposes the 1-line integrity hookup + playbook doc | **Minimal.** Read-only canary. Residual risk = operator misses the alert; at projected inflow (~10–15/day steady state; +30/day observed during the June-era tail) a 200 threshold leaves ~3–4 weeks before the 500 abort gate. | **Solves** — by explicitly accepting a constraint that Q5 shows is a feature, and instrumenting it. |

---

## Follow-up shipped with this run

- **Canary script:** `monitor/scripts/check-delete-propagation-backlog.js` — reads the newest `monitor/integrity/sync-workspace-runs-*.json` sentinel; RC=3 if `delete_propagation.candidates ≥ threshold` (default 200), RC=2 if no sentinel within 48h (dome-mirror liveness signal), RC=0 clean. Read-only.
- **PROP-125** — `monitor/tinker/proposals/PROP-125-delete-propagation-steady-state-acceptance.json`: adopt FIX-5 formally; wire the canary into the integrity agent's daily run; document the operator drain playbook (grant → three-guard-rule replication → rm → verify next sentinel).
- **Config/code untouched** per directive constraints: `sync-workspace-step4c.js`, `dome-mirror.md`, and the config were not modified. `delete_propagation.enabled=true` stays as-is — the EPERM fallback to manifest-only is graceful, costs one wasted unlink attempt per cycle, and preserves the deletion queue visibility that Phase 0 established.
