# Analyst Mode 1: Section Expansion Queue + Human Notes

## Human Notes (check first, every Mode 1/2 run)

Read `monitor/analyst/human-notes.json` if it exists. For each note with `status: "pending"`:

1. **If the note targets a pending expansion** — incorporate it when you work on that item.
2. **If the note targets a COMPLETED expansion** — create a revision. Read the completed output, apply the insight, overwrite the output file. Update tracker: `status: "revised"`, add `revised_at` and `revision_notes`.
3. **Cross-cutting notes** (no specific target) — factor into current work.

After incorporating: set note `status` to `"consumed"`, add `consumed_at` timestamp and `consumed_by` note (e.g., `"consumed_by": "EXP-003 revision — added π×R critique to paragraph 3"`).

**PROP-014 Mech 1b — WRITE-VERIFY discipline (added 2026-05-02).** Per `monitor/prompts/reference/state-verification.md` Discipline 1b (file-write-verify), if the consumption claim implies an artifact was written (the most common case — `consumed_by: "EXP-NNN revision"` or `resolved_with_exp: "EXP-NNN"` etc.), you MUST set `verification_artifact_path` pointing to the file you wrote, AND verify the file actually exists on disk before flipping status to `consumed` / `resolved`. The phantom-resolution failure (PR-1: HNOTE-OPERATOR-MODE5-ECLIPSE-FROZEN-PRED-001 marked resolved with `resolved_with_exp: 'EXP-283'` before EXP-283 was written) is exactly what this discipline prevents.

Pattern:
```bash
# Step 1: write the artifact (your normal expansion / revision flow)
# ... node -e "fs.writeFileSync('monitor/analyst/expansions/EXP-NNN.json', ...)"

# Step 2: self-verify with test -f BEFORE marking note consumed
ARTIFACT_PATH="monitor/analyst/expansions/EXP-NNN.json"
if [ -f "$ARTIFACT_PATH" ]; then
  STATUS_TO_WRITE="consumed"   # or "resolved" depending on the field convention used by this human-notes file
else
  STATUS_TO_WRITE="consumed-pending-verification"
fi

# Step 3: write the note status (terminal: append to archive + remove from live;
#         non-terminal 'consumed-pending-verification': mutate in place in live)
node -e "
const fs=require('fs');
const livePath='monitor/analyst/human-notes.json';
const archivePath='monitor/analyst/human-notes-archive.jsonl';
const data=JSON.parse(fs.readFileSync(livePath,'utf8'));
const note=data.notes.find(n=>n.id==='HNOTE-XXX');
note.status='$STATUS_TO_WRITE';
note.consumed_at=new Date().toISOString();
note.consumed_by='EXP-NNN revision — <brief reason>';
note.verification_artifact_path='$ARTIFACT_PATH';   // REQUIRED for Mech 1b

if(note.status==='consumed' || note.status==='resolved'){
  // Terminal state: append to archive (JSONL), remove from live.
  // Per state-file-archives.md (PROP-022, phase 1).
  fs.appendFileSync(archivePath, JSON.stringify(note)+'\n');
  data.notes=data.notes.filter(n=>n.id!==note.id);
} else {
  // Non-terminal (consumed-pending-verification): keep in live so workspace-sync
  // verifier can flip status. The verifier will trigger the archive-append/live-remove
  // when it confirms the artifact and flips to 'consumed'.
}
data.last_updated=new Date().toISOString();
fs.writeFileSync(livePath,JSON.stringify(data,null,2));
"
```

If you wrote `consumed-pending-verification`, the workspace-sync verifier will flip to `consumed` once the artifact is observed at `verification_artifact_path` (handles atomic-write race + universal-pusher rescue cases). The verifier ALSO handles the archive-append/live-remove transition at flip time per the state-file-archives.md convention. If you wrote `consumed` directly because self-verify passed, this snippet already moved the note to the archive — entry is terminal and not in the live file anymore.

**Archive convention (PROP-022 phase 1, 2026-05-06):** terminal notes are stored in `monitor/analyst/human-notes-archive.jsonl` as append-only JSONL (one record per line). The live `human-notes.json` carries only `status: pending` and `status: consumed-pending-verification` notes. See `monitor/prompts/reference/state-file-archives.md` for the full convention. Lookup-by-id (e.g., decider verifier) reads archive via `grep id | tail -1`.

For HNOTEs that genuinely don't imply an artifact (e.g., a cross-cutting note you absorbed into ambient context, with no specific output file), set `verification_artifact_path: null` explicitly and the verifier will skip the entry. Don't omit the field — explicit null > absence (the verifier's `defensive default` would log a missing-pattern error otherwise).

## Check for Orphaned Issues

**Role under PROP-029 (2026-05-11):** This orphan-check is a SAFETY NET, not the primary intake path. Under PROP-029, decider writes an expansion-tracker entry every time it routes an ISS to status='assigned-analyst' in M1 Priority 5b. The dispatcher fires on the tracker pending count and Mode 1 enters normally — analyst works the decider-authored entries by ID. The orphan-check then runs and finds zero orphans in steady state.

**When this check fires (orphan count > 0):** it's a structural-signal-of-failure. Possible causes: (a) decider's tracker-write failed transiently for these ISSs, (b) a manual operator reroute set status='assigned-analyst' without writing the tracker (last known instance: commit d44e2670 on 2026-05-10 — predates PROP-029), (c) a future agent variant introduced a new code path that sets status without tracker write. In all three cases, handle the orphans per the existing procedure (group, create EXP, work in priority order) AND emit an attention-inbox notice:

```json
{
  "id": "PROP029-ORPHAN-DETECTED-<YYYY-MM-DD>",
  "detected_at": "<ISO now>",
  "orphan_count": <N>,
  "orphan_iss_ids": [<list>],
  "orphan_routed_by_run": [<unique routed_by_run values from the orphan set>],
  "action_recommended": "tinker investigates: did decider tracker-write fail, or was this a manual operator reroute? Either way, root-cause and patch the decoupling.",
  "action_taken_this_run": "<N> orphans grouped into <M> EXP entries and worked normally; tracker decoupling root-cause TBD.",
  "resolved": false
}
```

The decider may assign issues to you without creating a matching expansion entry:

```bash
node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const t=JSON.parse(require('fs').readFileSync('monitor/analyst/expansion-tracker.json','utf8'));const tracked=new Set(t.items.flatMap(i=>i.issue_ids||[]));const orphans=o.issues.filter(i=>i.status==='assigned-analyst'&&!tracked.has(i.id));if(orphans.length)console.log('ORPHANED:',orphans.length);else console.log('ALL TRACKED')"
```

If orphaned: group related issues, create new EXP entries, work in priority order.

**class_hint intake (PROP-027, landed 2026-05-10):** When picking up an `assigned-analyst` ISS, also read `iss.class_hint` and `iss.routing_reason` (set by decider M1 at routing time per `monitor/prompts/reference/routing-matrix.md`). The hint values are `'verification' | 'deep-attack' | 'holistic' | null`:
- **`'verification'` hint** → routing context implies your eventual EXP will be narrow / value-fact-check / single-source-investigation. Strongly consider `review_class: 'verification'` on the EXP (batchable in curmudgeon Step 8a).
- **`'deep-attack'` hint** → routing context implies EXP-revision / new-argument / defender-pivot / curmudgeon-raised-concern-needing-defense. Strongly consider `review_class: 'deep-attack'` (singleton).
- **`'holistic'` hint** → multi-WIN or cross-section work. Strongly consider `review_class: 'holistic'`.
- **`null` hint** → decider couldn't classify; you decide per PROP-025 author guidance.

The hint is **advisory only** — your `review_class` declaration on the EXP file is authoritative per PROP-025. Override the hint when the EXP's actual scope-of-work disagrees with the routing context (e.g., hint='verification' but you discovered during investigation that the work needs new arguments → set `review_class: 'deep-attack'` and note the override in your `summary_for_decider`).

**PROP-034 Phase 1 — baby ownership boundary.** When an item arrives at you (Opus analyst) but matches the baby-owned rule, escalate-or-skip rather than producing a deep-attack EXP for a BAU-drain item. Baby-owned rule:

- `review_class === 'verification'` (declared) → baby owns it.
- `review_class == null` AND `source` IN {`decider-bau-route`, `decider-m1-route`, `decider-m3-carry-over`} → baby owns it.
- Orphan ISSs of severity `minor` or `moderate` (no tracker entry, `status==='assigned-analyst'`) → baby owns them.

If you encounter a baby-owned item in your tracker pending list (e.g., baby's last run was budget-pre-empted and didn't claim everything), DO NOT process it. Instead: set `assigned_to: 'analyst-baby'` on the tracker entry if not already present, leave `claimed_by` clear, and move on. Baby will pick it up on its next 2h cycle.

Conversely: if you're DECLARING `review_class: 'deep-attack'` on an EXP you authored for an item that originally arrived via a baby-owned source — note the override in your `summary_for_decider` field and explain WHY it needed deep-attack scope rather than verification (this is the same override discipline as the class_hint override above; the audit signal is the same).

## Expansion Procedure

Work **one item per run** (first pending item). After completing, continue to check for dome changes.

### For each expansion:

1. **Read the curmudgeon review** — the tracker gives the file path. Study every hole, severity, and recommended fixes.

2. **Read the current section text** — from `data/wins.json` (WIN detail fields) or `data/sections.json` (prose sections).

3. **Read the dome source material** — fetch the relevant dome page(s). The curmudgeon often finds we're attacking a strawman. Get the dome's real position.

4. **Apply the Kernel of Truth standard.** Find what the dome got right, acknowledge it, then show why it fails.

5. **Write the replacement text** to `monitor/analyst/expansions/{item-id}.json`:
```json
{
  "item_id": "EXP-001",
  "target": "description of what section this replaces",
  "curmudgeon_review": "monitor/curmudgeon/reviews/WIN-NNN.json",
  "current_word_count": 100,
  "replacement_word_count": 500,
  "replacement_html": "<p>The full replacement HTML text...</p>",
  "holes_addressed": ["hole 1", "hole 2"],
  "new_evidence_added": ["source 1", "source 2"],
  "anticipated_objections": ["objection 1 → rebuttal", "objection 2 → rebuttal"],
  "kernel_of_truth": "What the dome genuinely gets right about this topic",
  "review_class": "verification"
}
```

**`review_class` field (PROP-025, landed 2026-05-10):** declares what kind of curmudgeon attention the post-integration review needs. Values:
- `"verification"` — refinement, wordsmithing, citation fixes, small additions to existing arguments. The deep adversarial work was done in a prior cycle (or already in this EXP's authoring); curmudgeon's job at re-review is just confirming the change landed cleanly. **Batchable** — multiple `verification` items can be reviewed together (up to 3 per run, ≤20 KB combined diff-to-read), saving Opus startup overhead.
- `"deep-attack"` — new argument introduced, new sub-section under an existing WIN, defender-pivot adding a previously-absent cross-reference, verdict-changing rewrite. Curmudgeon needs fresh adversarial argumentation. **Singleton** — gets a full review run to itself.
- `"holistic"` — cross-WIN or cross-section work (kill-shot rewrites touching multiple WINs, MOND-grouping verdict reviews). **Singleton.**

**Author guidance:** be honest about which one this EXP is. A `verification` review is cheap (batches with neighbors); a `deep-attack` review is expensive (consumes a whole curmudgeon run). Marking a refinement EXP as `deep-attack` wastes attention budget; marking a new-argument EXP as `verification` lets it slip past curmudgeon's deeper scrutiny. Default if you omit the field: decider treats as `deep-attack` (singleton — same behavior we had pre-PROP-025, no regression). Only declare `verification` when you're confident the work is closing-out content the curmudgeon has already attacked.

6. **VALIDATE JSON — mandatory, do not skip.** Before marking anything complete, run:
```bash
node -e "JSON.parse(require('fs').readFileSync('monitor/analyst/expansions/EXP-NNN.json','utf8'));console.log('valid')" || echo "INVALID JSON — MUST FIX BEFORE CONTINUING"
```
If the output is not exactly `valid`, the file has a JSON syntax error — most commonly a missing `}` after a nested object inside an array, a trailing comma, or an unescaped quote inside a string value. **Open the file, find and fix the error, and re-run the validation command. Do not proceed to step 7 until validation prints `valid`.** Writing invalid JSON crashes the decider on its next run and blocks the entire integration pipeline. This is non-negotiable.

Common failure modes to check:
- Nested arrays of objects (e.g., `anticipated_objections: [{objection, response}, ...]`) — easy to forget a `}` on the last object before the `]`
- Long string values spanning multiple logical lines — watch for unescaped `"` inside strings
- Trailing commas after the last array element or object property
- Mixed quote styles (`"` vs `'`) — JSON requires double quotes only

**Alternative safer pattern:** instead of hand-writing the whole JSON file, build the object in a small node -e script and let `JSON.stringify(obj, null, 2)` serialize it. This eliminates entire classes of syntax errors:
```bash
node -e "
const fs=require('fs');
const exp={
  item_id: 'EXP-NNN',
  target: '...',
  replacement_html: '...',
  anticipated_objections: [
    {objection: '...', response: '...'},
    {objection: '...', response: '...'}
  ]
};
fs.writeFileSync('monitor/analyst/expansions/EXP-NNN.json', JSON.stringify(exp, null, 2));
"
```
Use hand-written JSON only when the content is short and obviously correct. For anything with nested arrays or multi-paragraph string fields, use the `JSON.stringify` pattern.

7. **Mark item complete** in tracker (`status: "complete"`, `completed_at`, `output_file` path). Only do this AFTER step 6 validation passed.

## Progressive Disclosure Format (mandatory for all replacement_html)

All `replacement_html` output MUST use the site's progressive disclosure wrapper. **Do not write bare `<h2>` tags or ad-hoc `<details>` structures.** The canonical format is:

```html
<details id="unique-id"><summary class="ps-summary"><h2>N.N Section Title</h2><p class="ps-tldr">2–3 sentence plain-language TLDR. Punchline first, then why in one sentence.</p></summary><div class="ps-detail">
...full prose content here...
</div></details>
```

**Checklist — every expansion that writes or replaces a section must have:**
- `<details id="...">` — unique, slug-style ID (e.g., `section-1-8`, `p2-self-contradictions`)
- `<summary class="ps-summary">` — not `ps-cascade`, not bare `<summary>`
- `<h2>` inside the `<summary>`, before the TLDR
- `<p class="ps-tldr">` — the TLDR paragraph, inside `<summary>`, after the `<h2>`
- `<div class="ps-detail">` — wraps ALL body content after `</summary>`
- Closing `</div></details>` at the end
- No `open` attribute on `<details>` (sections start collapsed)

**For replacement patches to existing sections:** keep the existing `<details id="...">` and classes. Only change content inside `<div class="ps-detail">` and update the `<p class="ps-tldr">` if the argument changed.

**For new section insertions:** write the full wrapper. Copy an adjacent section's structure if unsure.

See `reference/BUILD-AND-CHANGE.md` "Progressive Disclosure" section for the complete spec including CSS classes, TLDR writing rules, and nested disclosure patterns.

## What Makes a Good Expansion

- **Engage with the dome's actual claim**, not a strawman. Read their page.
- **Lead with the strongest argument**, not the weakest.
- **Include specific numbers** — ratios, measurements, citations.
- **Anticipate escape hatches** (aetheric refraction, n(r), "future version will fix it") and close them pre-emptively.
- **Match tone and depth** of our best sections (Kill-Shot #1 is the gold standard).
- **Cross-reference other sections** where relevant.
