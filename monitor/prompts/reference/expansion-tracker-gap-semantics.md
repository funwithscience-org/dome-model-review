# Expansion-tracker gap semantics

**Purpose:** explain what a "gap" in `monitor/analyst/expansion-tracker.json` actually means, so readers (and the integrity agent) don't misclassify benign bulk-reservation drift as lost work.

**Authoritative re-classifier:** `build-scripts/audit-exp-tracker-gaps.js` — PROP-053.

## 1. The tracker is multi-writer

Three agents claim and write to the tracker:

- **analyst** (Opus, BAU 4h) — claims EXP IDs for deep-attack and holistic expansions
- **analyst-baby** (Sonnet, twice-daily) — claims EXP IDs for verification-class consolidations
- **decider** (Opus, BAU 4h) — claims EXP IDs when integrating curmudgeon findings or routing new work

Each writer advances `next_id` when it claims an ID. The corresponding `items[]` entry is written back at the end of the run (or when the integration completes). Live entries also get archived to `expansion-tracker-archive.jsonl` once they reach a terminal state, so the canonical "present" set is the union of live `items[]` ∪ archive lines.

## 2. How gaps form

A gap is any integer `n ∈ [1, next_id)` for which **no `items[]` entry and no archive line exists** with `id = "EXP-NNN"`.

Gaps appear when:

- **Aborted run.** Agent advanced `next_id`, then crashed or hit a safety gate before writing the tracker item back. The write was never restored on retry because retry attempts allocate a *new* ID rather than re-using the abandoned one.
- **Race / concurrent claim.** Two writers advance `next_id` simultaneously; one of them wins the file write, the other writes a different ID, and the loser's intermediate slot stays empty.
- **Skipped write.** Agent advanced `next_id`, did the work, but the tracker append was dropped (FUSE write failure, malformed JSON gate, integrity rejection at push).
- **Superseded mid-flight.** Agent claimed an ID, started the EXP, then merged the work into a sibling EXP and never wrote the original slot.

## 3. Gap density is NOT evidence of lost work

A common misreading is to count gaps and report "N missing EXP IDs" as a structural integrity finding. This conflates four very different things. Always cross-check before flagging.

`audit-exp-tracker-gaps.js` classifies every gap into one of four buckets:

| Category | Meaning | Severity |
|----------|---------|----------|
| **orphan_file** | An expansion file exists at `monitor/analyst/expansions/EXP-NNN*.json` but no tracker entry. The work was done; the tracker write was skipped. **This is the only category that represents real work loss visible to the tracker.** Backfill is appropriate. | MODERATE if count > 5 |
| **tracker_referenced_no_file** | No tracker entry and no expansion file, but the ID is referenced ≥3 times across `monitor/decisions/`, `monitor/curmudgeon/reviews/`, or `data/`. The work likely got rolled into a batch EXP or was superseded; the references are stale pointers. | INFO |
| **mentioned_only** | Light trace (1–2 references) and no file. Probably superseded mid-flight; the references are vestigial. | INFO |
| **no_trace** | No artifact found anywhere. Pure bulk-reservation drift — the ID was allocated but never used. | INFO |

The 2026-05-25 baseline (PROP-053 audit) found **94 gaps** with this distribution: 7 orphan_file (real, backfillable), 44 tracker_referenced_no_file, 2 mentioned_only, 41 no_trace. **86 of 94 are benign drift, not lost work.**

## 4. Integrity reporting policy

When the daily integrity check sees gaps in the tracker:

1. Run `node build-scripts/audit-exp-tracker-gaps.js --json-out monitor/integrity/exp-tracker-audit.json`.
2. Read the JSON output.
3. Report `severity_hint` directly: `MODERATE` if `by_category.orphan_file.length > 5`, otherwise `INFO`.
4. Use the `summary` field verbatim in the finding text. **Do not** invent a raw "N missing IDs" count from `missing_total` alone — that's the misreading this doc is designed to prevent.

The PROP-053 fix to `monitor/prompts/structure-integrity.md` wires this directly into the integrity cycle.

## 5. Recommended writer discipline (prevents future drift)

The simplest prevention is for every writer to follow the same claim-then-write idiom:

```js
// Pseudocode for analyst / analyst-baby / decider
const claimedId = tracker.next_id;
tracker.next_id += 1;
fs.writeFileSync(TRACKER, JSON.stringify(tracker, null, 2));  // commit the claim FIRST
try {
  doTheWork(claimedId);
  tracker.items.push({ id: 'EXP-' + pad(claimedId), status: '...', ... });
  fs.writeFileSync(TRACKER, JSON.stringify(tracker, null, 2));  // commit the result
} catch (e) {
  // Leave a "claimed_but_aborted" tracker entry rather than vanishing the ID.
  tracker.items.push({ id: 'EXP-' + pad(claimedId), status: 'aborted', reason: String(e).slice(0,200) });
  fs.writeFileSync(TRACKER, JSON.stringify(tracker, null, 2));
}
```

This converts "no_trace" gaps into explicit `status='aborted'` items, which are visible in the audit but distinguishable from real work. PROP-053 does not enforce this; it is recommended for future analyst/decider prompt updates.

## 6. Related files

- `monitor/analyst/expansion-tracker.json` — canonical live tracker
- `monitor/analyst/expansion-tracker-archive.jsonl` — historical archive (read alongside live for "present" set)
- `monitor/analyst/expansions/EXP-NNN*.json` — the actual expansion files
- `build-scripts/audit-exp-tracker-gaps.js` — re-classifier (this PROP)
- `monitor/prompts/structure-integrity.md` — integrity prompt that wires the audit into the daily check
- `monitor/tinker/proposals/PROP-053-exp-tracker-gap-audit-and-prevention.json` — the originating proposal
