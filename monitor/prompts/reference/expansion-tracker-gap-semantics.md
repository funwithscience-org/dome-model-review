# Expansion-Tracker Gap Semantics

> **Reference for PROP-053 (EXP-515).** Explains the four gap categories produced by
> `build-scripts/audit-exp-tracker-gaps.js` and what each means for follow-up.

## Background

`monitor/analyst/expansion-tracker.json` was introduced in mid-project to track EXP
work items. Before its introduction, EXPs were written directly to
`monitor/analyst/expansions/` without tracker entries. As of 2026-05-31, the tracker
has ~53 items covering recent work; the expansions directory has ~400+ files covering
the full project history.

The audit script cross-references three sources:
1. **Files on disk** — `monitor/analyst/expansions/EXP-NNN*.json`
2. **Tracker entries** — `monitor/analyst/expansion-tracker.json items[].id`
3. **Cross-references** — EXP-NNN IDs mentioned inside other expansion files

## Gap Categories

### `ok` — File + Tracker Entry Both Present
No gap. The EXP is tracked and has a deliverable file. No action needed.

### `orphan_file` — File on Disk, No Tracker Entry
A deliverable file exists but no corresponding tracker entry. There are **two sub-types**:

| Sub-type | Description | Action |
|---|---|---|
| **Pre-tracker EXP** (EXP-001 through ~EXP-450) | Written before the tracker existed. These are benign — the work is done, the file is the record. | None. Do NOT create retroactive tracker entries. |
| **Genuine lost work** | A recent EXP (EXP-451+) exists on disk but the decider never picked it up, integrated it, or marked it in the tracker. The most likely cause: the analyst wrote the file but the associated issue-proposal was never submitted, or the decider skipped it. | Investigate. Check whether an issue-proposal exists in `monitor/analyst/issue-proposals/`. If not, file one. |

**Key heuristic:** EXP-001 through ~EXP-450 = pre-tracker, benign. EXP-451+ without a tracker entry = potentially lost work. 86 of 94 gaps found in the original PROP-053 audit (2026-05-31) were pre-tracker EXPs — benign bulk-reservation drift.

### `tracker_only` — Tracker Entry, No File
A tracker item exists but no matching deliverable file. There are two sub-types:

| Sub-type | Description | Action |
|---|---|---|
| **Pending / in-flight** | The decider created a tracker entry for work that hasn't been done yet (status=pending or claimed). | Normal — no action until the analyst delivers the EXP. |
| **Lost deliverable** | The tracker shows status=complete but no file exists. The analyst may have written to a different path, or workspace-sync failed to rescue the file. | Check git log for the EXP file. If not in git, the file was lost — re-route as a new pending item. |

### `mentioned_only` — Cross-Referenced But No File or Tracker Entry
Another EXP or review file mentions EXP-NNN, but there is no standalone file and no tracker entry for that ID. Two sub-types:

| Sub-type | Description | Action |
|---|---|---|
| **Reference to planned EXP** | An analyst wrote "see EXP-NNN" for an EXP they planned to create but never did. | May need follow-up — check if the referenced work was actually needed. |
| **Typo / renumbered EXP** | The cross-reference is a typo (EXP-123 → EXP-132) or the EXP was renumbered before filing. | No action. |

## Running the Audit

```bash
# Summary report
node build-scripts/audit-exp-tracker-gaps.js

# JSON output for programmatic consumption
node build-scripts/audit-exp-tracker-gaps.js --json

# Only show orphan files (quickest triage check)
node build-scripts/audit-exp-tracker-gaps.js --orphans-only
```

## Triage Priority

For routine operation, scan only:
1. **`orphan_file` with EXP-451+** — potential lost recent work
2. **`tracker_only` with status=complete** — deliverable may be missing

Pre-tracker EXPs (EXP-001 through ~EXP-450) appearing as orphan_file are expected and require no action.
