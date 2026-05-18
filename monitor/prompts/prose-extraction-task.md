# One-Time Task: Extract Prose into data/sections.json

You are performing a structural refactor of the dome model critical review. Your goal is to eliminate prose duplication between `generate-html.js` and `build-doc-v4.js` by extracting all narrative prose into `data/sections.json` — a single source of truth for prose content, just as `data/wins.json` is the single source of truth for WIN data.

## Context

The review site has 11 prose sections hardcoded as template literal strings in `build-scripts/generate-html.js` (lines 615–1640). The same content is independently hardcoded in `build-scripts/build-doc-v4.js`. This duplication means every prose edit must be made in two files — exactly the kind of drift the review criticizes in the dome model.

After this refactor:
- `data/sections.json` holds all prose content
- `generate-html.js` reads from sections.json and injects computed values
- `build-doc-v4.js` reads from sections.json and generates DOCX paragraphs
- Editing prose requires changing ONE file

## Known Prose Errors (fix during extraction)

The following errors exist in the current `generate-html.js` prose. Fix them AS you extract — do not copy them into sections.json:

1. **ISS-412 (MAJOR):** Section 4.5 says "A local sun at fixed height H ≈ 8,537 km" — WRONG. 8,537 km is the firmament apex height H(r=0). The dome's sun altitude is 5,733 km (from inject_ai_layer.py). Fix to: "A local sun at fixed height H ≈ 5,733 km"

2. **ISS-413 (MAJOR):** Section 4.5 says "using the globe formula g = GM / r²" — WRONG. The dome uses WGS84 latitude-dependent gravity (g ≈ 9.78–9.83 m/s²), not point-mass free-fall. Section 4.5.8 of this same document correctly identifies this. Fix to reference WGS84 surface gravity values.

3. **ISS-368:** Section 4.9 (aetheric refraction) lists WIN-056 among refraction-dependent WINs — WRONG. WIN-056's issue is using the globe's declination formula (Self-Contradicted), not refraction. Remove WIN-056 from the refraction list and add WIN-065 (Polaris) instead.

4. **ISS-395:** A kill-shot section says "140–103° from epicenter" — WRONG order. Should be "104°–140°" to match WIN-064's detail_claim and the kill-shot analysis section.

5. **ISS-415 (CRITICAL):** Section 4.5.9, point 1 in the "What actually happens" list says "d_geo is undefined. The page never specifies whether d_geo is the globe geodesic distance, the Euclidean distance on the disc, or something else." — **FACTUALLY WRONG.** V13 explicitly defines d_geo: `EW_arc = 4×a×E(e²)×(Δlon/360)×(r_avg/a)`, `NS = |r₁−r₂|`, `d_geo = √(NS²+EW²)` with a=20,015 km, e=0.66.

   **Rewrite point 1 to this critique instead:**
   d_geo IS defined — but the definition encodes globe geometry. The semi-major axis a = 20,015 km equals π × R_Earth (the pole-to-antipode distance along a sphere's surface). This value has no derivation from flat-disc physics: on a flat disc, the pole-to-rim distance is a straight radial line, and there is no geometric reason it would equal π times anything. The π is the fingerprint of the spherical surface integral the number was derived from. The eccentricity e = 0.66 evolved through five versions (V5–V9: b/a = 0.70→0.90, described as "converging") — the language of iterative fitting, not physical measurement. Every input to the formula (Δlon, r) is derived from WGS84 globe coordinates. And n(r) — the final divisor — remains unpublished, providing an unconstrained free function to absorb remaining error. The formula is geometrically valid for an elliptical disc, but the disc whose dimensions were reverse-engineered from globe geography via a parameter (π × R) that only arises from spherical geometry.

6. **DOCX gap — Sections 5.14, 5.15, 5.16 missing from Word document.** These three sections (Repository Infrastructure: Steering AI, The Repository Is the Model, The Monitoring Infrastructure) exist in `generate-html.js` but have no corresponding builder in `build-doc-v4.js`. After extraction into sections.json, verify that the DOCX builder picks them up. This is the whole point of the refactor — one source, both outputs.

## Analyst Expansions — Integrate During Extraction

Three analyst expansion rewrites are complete and should be integrated into sections.json INSTEAD of copying the old text from generate-html.js. For these sections, use the analyst's `replacement_html` as the sections.json content:

1. **EXP-001 → Part 4.3 (Kill-Shot: Gaia Astrometry)**
   - File: `monitor/analyst/expansions/EXP-001.json` → read `replacement_html` field
   - Replaces the current ~97-word Kill-Shot #3 section with a ~680-word expansion
   - Fixes strawman (local sun → firmament wobble), adds New Horizons, 4.7B ratio, adjacent-star argument

2. **EXP-002 → Part 4.2 (Kill-Shot: GPS Accuracy and Relativity)**
   - File: `monitor/analyst/expansions/EXP-002.json` → read `replacement_html` field
   - Replaces the current ~254-word section with ~780 words
   - Fixes SR direction error, adds 3-leg structure (altitude, clocks, visibility), Ashby (2003) citation

3. **EXP-003 → Section 4.5.9 (V13 Coordinate System)**
   - File: `monitor/analyst/expansions/EXP-003.json` → read `replacement_html` field
   - Replaces the current ~1,480-word section with ~1,650 words
   - Fixes the CRITICAL ISS-415 error (d_geo IS defined). This replaces known error #5 above — the analyst's version is the complete rewrite.

**Important:** When integrating EXP-003, use the analyst's full replacement_html instead of the ISS-415 manual rewrite in known error #5 above. The analyst's version is more comprehensive and has been verified against the dome's actual formulas.

**For EXP-004 (Section 4.8 Solar Angular Diameter):** This expansion is still pending. Use the CURRENT text from generate-html.js for Section 4.8 — it will be swapped in later when the analyst completes it.

## Working Environment

- **Clean clone (for git):** `/sessions/peaceful-gallant-rubin/dome-review-clean/`
- **Workspace (for agents):** `/sessions/peaceful-gallant-rubin/mnt/dome-model-review/`
- All edits go in the clean clone. After success, run `node build.js publish` to push and sync.

## Pre-Work Already Done

1. `build-scripts/extract-sections.js --dry-run` has been run. Output shows:
   - 11 sections, 89 interpolations, ~1000 lines of prose total
   - Unique interpolation patterns have been cataloged (counts, tally, sectionNav, generatePieChart, formatTableRow, formatWinDetail, etc.)
2. `generate-html.js` already declares `SECTIONS_PATH` (line 19) but never reads it
3. Agent prompts (decider, integrity, tinker) have been updated to look for sections.json
4. `test.js` has a Section 6 that validates sections.json schema when it exists
5. `.github/workflows/ci.yml` is in place

## Step-by-Step Procedure

### Phase 1: Extract (create sections.json)

1. **Read generate-html.js** completely. Identify the 11 section boundaries by searching for `<h1 id="part` markers (line numbers below are approximate and may have shifted due to recent edits — always search, don't trust line numbers):
   - part1 (~line 615), part1b (~724), part2 (~749), part3 (~797), part3b (~1041), part4 (~1157), part4b (~1230), part4c (~1311), part5 (~1352), part6 (~1456), part7 (~1496)

2. **For each section**, extract the HTML content and classify every `${...}` interpolation:

   **Type A — Simple computed counts** (replace with `{{PLACEHOLDER}}`):
   - `${counts.total}` → `{{TOTAL_WINS}}`
   - `${counts.newInV51}` → `{{NEW_IN_V51}}`
   - `${counts.selfContradicted}` → `{{SELF_CONTRADICTED}}`
   - `${counts.unfalsifiable}` → `{{UNFALSIFIABLE}}`
   - `${wins.length}` → `{{TOTAL_WINS}}`
   - `${tally['Verdict Name'] || 0}` → `{{TALLY_REFUTED}}`, `{{TALLY_STD}}`, etc.
   - `${counts.codeAnalysis.reviewed}` → `{{CA_REVIEWED}}`
   - `${counts.codeAnalysis.pending}` → `{{CA_PENDING}}`
   - `${counts.codeAnalysis.monitoring.hardcoded}` → `{{CA_HARDCODED}}`
   - `${counts.codeAnalysis.monitoring.liveFetch}` → `{{CA_LIVE}}`
   - `${counts.codeAnalysis.monitoring.none}` → `{{CA_NONE}}`
   - `${counts.codeAnalysis.relabelsStandard}` → `{{CA_RELABELS}}`
   - `${counts.codeAnalysis.postHoc}` → `{{CA_POSTHOC}}`
   - `${counts.codeAnalysis.derivesFromDome}` → `{{CA_DOME}}`
   - Computed expressions like `${counts.codeAnalysis.monitoring.hardcoded + counts.codeAnalysis.monitoring.none}` → `{{CA_HARDCODED_PLUS_NONE}}`
   - `${Math.round(counts.codeAnalysis.reviewed / counts.total * 100)}` → `{{CA_REVIEWED_PCT}}`

   **Type B — Generated content blocks** (keep as special markers, NOT in sections.json):
   - `${generatePieChart(tally, wins.length)}` — generated at build time
   - `${wins.map(formatTableRow).join('\n')}` — the WIN summary table
   - `${(winsByVerdict['X'] || []).map(formatWinDetail).join('\n')}` — detail sections per verdict
   - `${sectionNav(...)}` — inter-section navigation

   Type B items should be represented as `{{PIE_CHART}}`, `{{WIN_TABLE}}`, `{{DETAILS_REFUTED}}`, `{{SECTION_NAV}}` etc. in sections.json, and the generator resolves them at build time.

3. **Write data/sections.json** with this schema:
   ```json
   {
     "_meta": {
       "description": "Prose content for the dome model critical review. Single source of truth.",
       "last_modified": "2026-04-06",
       "placeholders": {
         "{{TOTAL_WINS}}": "Computed from wins.json length",
         "{{NEW_IN_V51}}": "Count of wins where new_in_v51 is true",
         ...
       }
     },
     "part1": {
       "id": "part1",
       "title": "Part 1: What Is the Ovoid Cavity Cosmological Model?",
       "tab": "overview",
       "html": "... prose with {{PLACEHOLDER}} tokens ..."
     },
     ...
   }
   ```

### Progress Log — UPDATE AFTER EVERY SECTION

Maintain a progress log at `monitor/tinker/prose-extraction-progress.json`. **Write to this file after EVERY section attempt**, not just at the end. If the session dies mid-run, this is our only record of what happened.

```json
{
  "started_at": "ISO timestamp",
  "last_updated": "ISO timestamp",
  "baseline_html_size": 12345,
  "current_html_size": 12345,
  "html_matches_baseline": true,
  "test_results": { "passed": 0, "failed": 0 },  // ← fill in from `node test.js` output
  "sections_attempted": [
    {
      "id": "part4b",
      "status": "success|failed|skipped",
      "interpolations_found": 0,
      "placeholders_created": [],
      "html_diff_lines": 0,
      "test_passed": true,
      "notes": "Pure prose, no interpolations. Extracted cleanly."
    }
  ],
  "generator_approach": "Brief description of the loader/resolver pattern you chose",
  "sections_remaining": ["part4", "part1", "..."],
  "blockers": [],
  "build_doc_v4_status": "not_started|in_progress|complete|skipped"
}
```

**Write this file BEFORE you start each section** (with status "in_progress") and **update it AFTER** (with the result). This way, even if the session terminates unexpectedly, we know exactly which section it was working on and what state the codebase is in.

### Phase 2: Integrate (modify generators) — INCREMENTAL STRATEGY

**Critical: Do NOT attempt all 11 sections at once.** Work one section at a time, rebuilding and testing after each. This way, if section 8 breaks, you keep sections 1–7.

4. **Save baseline first:**
   ```bash
   cp docs/index.html docs/index.html.baseline
   ```

5. **For EACH section (start with the simplest — part4b has 0 interpolations):**
   a. Extract the prose from generate-html.js into sections.json
   b. Add/update the section loader in generate-html.js to read this section from JSON
   c. Rebuild: `node build.js html`
   d. Diff: `diff docs/index.html.baseline docs/index.html` — must be zero diff
   e. Test: `node test.js` — must pass
   f. If it passes, move to the next section
   g. If it fails, fix it before moving on — read the test failure message carefully, it will tell you WHAT broke

   **Recommended order (simplest to hardest by interpolation count):**
   1. part4b (0 interpolations — pure prose, easiest)
   2. part4 (1 interpolation)
   3. part1 (1 interpolation)
   4. part3 (4 interpolations)
   5. part1b (4 interpolations)
   6. part5 (4 interpolations)
   7. part7 (6 interpolations — includes sectionNav and output path)
   8. part3b (12 interpolations)
   9. part6 (16 interpolations — conclusion with many computed counts)
   10. part2 (16 interpolations — the WIN table and detail blocks)
   11. part4c (25 interpolations — code analysis section with many computed stats)

6. **Modify generate-html.js:**
   - Add a section loader that reads sections.json
   - Create a `resolvePlaceholders(html, context)` function that replaces `{{...}}` tokens with computed values
   - Replace each inline prose block with: load section from JSON → resolve placeholders → inject into template
   - Keep Type B generators (pie chart, WIN table, detail sections, sectionNav) as code — they produce dynamic content that isn't prose. These stay as function calls in the generator. The section's html in sections.json should have a `{{PIE_CHART}}` or `{{WIN_TABLE}}` placeholder where these blocks go, and the generator replaces those with the function output.
   - The SECTIONS_PATH constant already exists (line 19)

7. **Handling sectionNav calls:**
   sectionNav calls are in the prose blocks but they're generated navigation, not content. Two options:
   - Put `{{SECTION_NAV}}` placeholder in sections.json; generator resolves it with the correct prev/next pair for that section
   - OR keep sectionNav calls in the generator and append them after injecting the section prose
   Either works. Pick whichever produces cleaner code.

8. **Handling interpolations embedded in function calls:**
   Watch for patterns like `sectionNav('wins', counts.total + ' Wins Reviewed', ...)` where a computed value is INSIDE a function argument. These can't be naively replaced. The sectionNav function should look up the tab titles itself (or receive them from the placeholder resolution context), not from embedded prose.

9. **build-doc-v4.js:**
   - This is OPTIONAL for tonight. If you complete the HTML generator migration, that alone is a major win.
   - If you attempt it: the DOCX generator uses `new Paragraph(...)` API calls — it can't just inject raw HTML. The simplest approach is to have it read the PROSE TEXT from sections.json, strip HTML tags for the text content, and keep the Paragraph/TextRun construction in code. This decouples the *words* (from JSON) from the *formatting* (in code).
   - If it's too complex, leave it with a TODO comment and report what you found.

### Phase 3: Verify

10. **After all sections are migrated**, run the full verification:
    ```bash
    diff docs/index.html.baseline docs/index.html    # Must be zero diff
    node test.js                                       # Must pass all tests
    ```

    The test suite (run `node test.js` to get current count) validates:
    - **Section 6**: sections.json has all 11 sections, valid tabs, no broken placeholders, no raw ${} interpolations, no <script> tags, minimum content length per section
    - **Section 7**: Every Part heading exists in HTML, every tab has substantial content, 9 canary phrases must appear (Schumann, H(r), monitor.py, etc.), no unresolved {{PLACEHOLDER}} tokens in final HTML, no leaked template literals

    **If a test fails, READ THE FAILURE MESSAGE.** The tests are designed to tell you specifically what's wrong:
    - "Section 'partX' has no raw ${...} interpolations" → you left a template literal in sections.json
    - "HTML contains canary phrase 'Schumann resonance'" → content was dropped from a section
    - "HTML has no unresolved {{PLACEHOLDER}} tokens" → a placeholder wasn't resolved by the generator
    - "HTML has no leaked template literals" → the generator is outputting raw ${...} instead of values

### Autonomy and Problem-Solving

**You have full autonomy to:**
- Modify test.js if you find tests that are too strict or too loose for the refactored architecture (document why)
- Change the placeholder naming scheme if you find a better pattern
- Restructure how the generator loads and resolves sections if the prescribed approach doesn't work cleanly
- Skip build-doc-v4.js entirely if the HTML migration is taking the full session
- Create helper functions or utility scripts if they make the migration cleaner
- Re-order sections if you discover dependencies the task prompt didn't anticipate

**You must NOT:**
- Modify data/wins.json
- Change the HTML output (byte-identical to baseline, except whitespace)
- Skip the test suite
- Commit without passing tests

9. **Build DOCX** (if build-doc-v4.js was modified):
   ```bash
   node build.js docx
   ```
   Open the DOCX and spot-check that prose content matches the HTML version.

### Phase 4: Publish

10. If all checks pass:
    ```bash
    node build.js publish
    ```
    This commits, pushes, and syncs to the workspace.

11. **If Phase 2 for build-doc-v4.js is too complex** in one session, it's acceptable to:
    - Complete the generate-html.js integration (HTML reads from sections.json)
    - Leave build-doc-v4.js for a follow-up task
    - Add a TODO comment at the top of build-doc-v4.js noting it should be migrated
    - This is still a major improvement — the HTML generator is the primary output

## Rollback Plan

**Per-section rollback (preferred):** If section N breaks, revert only that section's changes in generate-html.js (restore the inline prose block) and remove the section from sections.json. The previous sections stay migrated.

**Full rollback (last resort):** If the incremental state is too tangled:
1. `git checkout -- build-scripts/generate-html.js build-scripts/build-doc-v4.js`
2. The data/sections.json file can stay — it doesn't affect anything if the generators don't read it
3. Rebuild: `node build.js html` and verify tests pass

**Always update the progress log:** The progress log at `monitor/tinker/prose-extraction-progress.json` should already be up to date if you've been writing after every section. On rollback, add a `"rollback"` entry to the `sections_attempted` array explaining what happened.

**Final report:** At the END of the session (success or failure), write `monitor/tinker/prose-extraction-report.json` with:
- Final status: "complete", "partial" (N/11 sections), or "rolled_back"
- Which sections were successfully migrated
- Which section failed and why (exact test failure messages, diff output snippet)
- The generator_approach you used (so the next attempt doesn't start from scratch)
- The state of the codebase: is generate-html.js partially migrated? Is sections.json complete but the generator not yet updated? Are there uncommitted changes?
- What you'd recommend for the next attempt — specific, actionable, not vague

## What Success Looks Like

- `data/sections.json` exists with all 11 sections
- `generate-html.js` reads prose from sections.json
- `node build.js html` produces identical output to the baseline
- `node test.js` passes with 0 failures
- The prose duplication criticism from the maturity review is resolved (at least for HTML)
