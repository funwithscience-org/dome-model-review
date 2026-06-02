# Expansion-Tracker Gap Semantics

> **Reference for PROP-053 + PROP-053-rev2 (EXP-515).** Explains the four gap
> categories produced by `build-scripts/audit-exp-tracker-gaps.js` and what
> each means for follow-up.

## Errata (added by PROP-053-rev2, 2026-06-02)

Earlier versions of this document described EXP-001 through ~EXP-450 as a
"pre-tracker era" where EXPs were "written directly to monitor/analyst/expansions/
without tracker entries". **That framing was incorrect.** There is no pre-tracker
era. The tracker has always existed in this project; EXP-001 has an archive
entry today (`expansion-tracker-archive.jsonl` line 1). The old framing was a
post-hoc rationalization of an archive-blind bug in the audit script (ISS-2434):
the script read only `expansion-tracker.json items[]` (~63 live items as of
2026-06-02) and ignored `expansion-tracker-archive.jsonl` (433 entries), so it
reported ~389 phantom orphan_file gaps. The "EXP-001..~EXP-450 = benign" heuristic
mapped almost 1:1 onto the range of IDs the buggy script mis-classified. This
document has been rewritten against the actual architecture.

## Background

`monitor/analyst/expansion-tracker.json` has tracked EXP work items throughout
this project. Under PROP-022 phase 4 (2026-05-07), the tracker was split into:

1. **Live** — `monitor/analyst/expansion-tracker.json items[]` — pending and
   in-flight items.
2. **Archive** — `monitor/analyst/expansion-tracker-archive.jsonl` — terminal-state
   items moved out of live by the verifier or decider integration writer.
   Append-only. Holds all integrated, cancelled, superseded, and subsumed items.

Both files are part of the tracker. **Any audit that distinguishes orphan files
from benign reservation drift MUST read both.** The script ships archive-aware
as of PROP-053-rev2.

The audit script cross-references four sources:
1. **Files on disk** — `monitor/analyst/expansions/EXP-NNN*.json` (loose regex; suffixed working-name variants like `EXP-NNN-<descriptor>.json` count as a trace).
2. **Tracker entries** — `items[].id` from live AND `id` from each archive line.
3. **Cross-references inside expansion files** — EXP-NNN regex matches.
4. **Cross-references in `monitor/decisions/` and `monitor/curmudgeon/reviews/`** — EXP-NNN regex matches.

## Gap Categories

A "gap" is any EXP-N id in `1..(next_id-1)` that is not in the `ok` category
below. The script classifies each candidate id into exactly one of these
buckets.

### `ok` — File + Tracker Entry Both Present
No gap. The EXP is tracked (live OR archive) and has at least one file on disk.
No action needed.

### `orphan_file` — File on Disk, No Tracker Entry Anywhere
A file matching `EXP-N*` exists in `monitor/analyst/expansions/` but `EXP-N` is
in NEITHER the live `items[]` NOR the archive JSONL. **This is real lost-work
candidate**: the analyst wrote the deliverable but the tracker write never
happened (aborted run, race, write skipped). Action: investigate, file a tracker
backfill if the work was genuinely completed. The post-rev2 baseline is ~60
orphans (down from a ~389 phantom over-report under the archive-blind bug).
The 60 are dominated by suffixed working-name files (e.g.,
`EXP-300-WIN-033-polaris-luminosity-propagate.json`) where the analyst wrote
the file but skipped the tracker entry; these are the genuine backfill cohort.

### `tracker_referenced_no_file` — Tracker Entry (Live or Archive), No File
The tracker (live or archive) carries an `EXP-N` entry but no file on disk
matches the loose regex. Two common sub-types:

| Sub-type | Description | Action |
|---|---|---|
| **Rolled into batch** | Multiple tracker items integrated into a single batch EXP file with a different ID. The archive entry persists as an audit trail; the file lives under the batch ID. | None — benign. |
| **Lost deliverable** | The tracker shows `status: complete` and a `target` field referencing a deliverable, but no file exists. The analyst may have written to a different path, or workspace-sync failed to rescue the file. | Check git log for the EXP file. If not in git, the file was lost — re-route as a new pending item. |

The `tracker_referenced_no_file` category previously appeared under the name
`tracker_only`. PROP-053-rev2 renamed it to match the PROP-053 spec.

### `mentioned_only` — Cross-Reference, No File, No Tracker Entry
Another expansion file, decision file, or curmudgeon review mentions `EXP-N`
but there is no file matching the loose regex and no tracker entry in either
live or archive. Two common sub-types:

| Sub-type | Description | Action |
|---|---|---|
| **Reference to planned EXP** | An analyst wrote "see EXP-N" for an EXP they planned to create but never did. | May need follow-up — check if the referenced work was actually needed. |
| **Typo / renumbered EXP** | The cross-reference is a typo (EXP-123 → EXP-132) or the EXP was renumbered before filing. | No action. |

### `no_trace` — Allocated ID with No Artifact Anywhere
`EXP-N` is inside the allocated range `1..(next_id-1)` and appears in none of
the four sources (no file, no live entry, no archive entry, no mention).
**This is the bulk-reservation drift signal.** It forms when a writer
advanced `next_id` but never wrote the corresponding item back (aborted run,
race, write skipped without leaving a file artifact).

`no_trace` is the LARGEST category in normal operation (~117 entries as of
2026-06-02). The post-rev2 baseline is dominated by multi-writer drift in
EXP-310..EXP-560 ranges. Gap density here is NOT evidence of lost work —
it's evidence of the multi-writer allocator's append-only nature.

## Audit Output Schema (PROP-053-rev2)

The `--json` mode emits this top-level object:

```json
{
  "total_slots": <next_id - 1>,
  "present": <ids with file OR tracker entry>,
  "missing_total": <ids with neither file NOR tracker entry>,
  "missing_ranges": [{"start": N, "end": M, "size": K}, ...],
  "missing_in_context": <mentioned_only count>,
  "by_category": {
    "orphan_file": [{"id": "EXP-N", "file": "..."}],
    "tracker_referenced_no_file": [{"id": "EXP-N", "where": "live|archive", "status": "...", "target": "..."}],
    "mentioned_only": [{"id": "EXP-N"}],
    "no_trace": [{"id": "EXP-N"}]
  },
  "summary": "<one-line summary>",
  "severity_hint": "MODERATE | INFO"
}
```

The `severity_hint` is `MODERATE` when `orphan_file.length > 5`, else `INFO`.

## Running the Audit

```bash
# Full human-readable report
node build-scripts/audit-exp-tracker-gaps.js

# JSON output for programmatic consumption (integrity, tinker)
node build-scripts/audit-exp-tracker-gaps.js --json

# Quick triage: orphans first, then one-line summaries of the other three buckets + severity_hint
node build-scripts/audit-exp-tracker-gaps.js --orphans-only
```

## Triage Priority

The integrity check should focus on:
1. **`orphan_file` > 0** — potential lost-work. The severity_hint encodes the
   triage gate: MODERATE when >5 (warrants attention), INFO when ≤5 (handle in
   normal cadence).
2. **`tracker_referenced_no_file` with `where: 'live'` and `status: 'complete'`** — deliverable may be missing. Check git log.
3. **`tracker_referenced_no_file` with `where: 'archive'`** — almost always benign (rolled into batch). Skim only.
4. **`no_trace`** — bulk-reservation drift signal. Volume is informational; spikes within a short window may indicate an analyst-side write bug. Otherwise no action.
5. **`mentioned_only`** — usually typos or planned-but-not-created. Spot-check the larger entries.

## Integrity Integration

`monitor/prompts/structure-integrity.md` Section 7 invokes the audit script and
classifies orphan_file findings using the `severity_hint` field rather than the
older MAJOR-on-orphan rule. The MAJOR classification remains for:
- live-archive disjointness violations
- `next_id` inversions (collision-imminent)
- ID gaps detected at integrity-prompt scan time (different surface from
  `no_trace`, which is the script's view)

Pure bulk-reservation drift (`no_trace`) is not a structural integrity issue
and is not surfaced as a finding.
