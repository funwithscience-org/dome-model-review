# Rebrand-Resistance Strategy (SOCIAL-NOTE-001)

**Status:** draft — social analyst, 2026-04-09
**Requested by:** steve (editorial)
**Owner of commit:** decider / human

## Problem

The dome model's current name — "Ovoid Cavity Cosmological Model" (ECM) — collides with pre-existing legitimate scientific usage (the Extended Cavity Model in condensed matter; "ovoid cavity" in cosmic-void literature and in medical imaging). Our entire discoverability stack is anchored to those two strings. If the author rebrands, every search term, meta tag, and llms.txt reference pointing at "Ovoid Cavity" or "ECM" instantly becomes dead weight.

## Principle

Anchor the review to things that cannot be renamed. Names are marketing; physics, identity, and URLs are not.

## What survives a rebrand

1. **Author identity.** Nicholas Hughes. GitHub handle `john09289`. TikTok handle `@jesusrules27163822`. These only change if the author wipes and re-registers, which breaks his own backlinks.
2. **Canonical URLs.** `github.com/john09289/predictions` and `john09289.github.io/predictions`. Changing these destroys his own discoverability, so they are sticky.
3. **Distinctive numerical parameters.** Disc radius 20,015 km. Firmament height H(r) = 8,537 · exp(−r/8,619). Field-scaling length lambda_g = 8,619 km. Sun altitude 5,733 km. Moon altitude 2,534 km. These are the fingerprints of the specific model; they would have to be rederived to disappear, and rederiving them defeats the purpose of a rebrand.
4. **Distinctive vocabulary clusters.** "Aetheric refraction index n(r)", "firmament resonance", "field scaling factor", "toroidal architecture", "Finsler coordinates" applied to flat-earth cosmology, "dielectric coupling" in a dome context. Each individual word is common; the combination is not.
5. **Structural claims.** Flat-earth dome cosmology, local sun above a disc, Schumann cavity resonance from a finite dome, ~67–69 "confirmed predictions" with a ~94–95% headline accuracy. These describe the model's shape without naming it.
6. **Public falsification commitment.** PRED-ECLIPSE-TIER3, August 12, 2026. This date is in the author's own llms-full.txt and is a durable anchor: whatever he calls the model in August, it will still be the model that committed to this test.

## What does NOT survive a rebrand

- The literal strings "Ovoid Cavity", "ECM", "Ovoid Cavity Cosmological Model".
- Internal claim keys that reference the old model name (e.g., `ecm_v51_...`).
- Any prose that describes the model only by its current name without grounding it in the stable anchors above.

## Likely rebrand vectors

The author's existing vocabulary and ontology suggest several high-probability rename paths. We should be ready for all of these:

- **Keeps "dome":** "Aetheric Dome Cosmology", "Firmament Dome Model", "Dome Resonance Cosmology", "Dome Cavity Model" (just swapping "ovoid" for "dome" dodges the collision).
- **Keeps "cavity":** "Firmament Cavity Model", "Aetheric Cavity Cosmology", "Toroidal Cavity Model" — all of which are distinctive enough inside the dome context to remain searchable.
- **Rebuilds around the physics term:** "Aetheric Refraction Cosmology", "Field-Scaling Cosmology", "Finsler Dome Model". The author leans on these formulas; the rebrand might foreground one of them.
- **Rebuilds around the religious framing:** "Firmament Model", "Genesis Dome Model", "Scriptural Cosmology". Lower probability because the author markets the model as scientific, not religious, but non-zero.
- **Version-wash:** "ECM V52" or "Unified Dome Cosmology V1" — cosmetic rename without technical change. The version bump would give us an early warning in `ai_manifest.json.last_updated` and in GitHub commit messages.

The top three to preload in the keywords meta tag and llms.txt keywords block are, in priority order: "Dome Cosmology", "Aetheric Dome Model", "Firmament Cavity Model". All three are specific enough to be distinguishable from generic flat-earth content and loose enough to catch a rename.

## Concrete changes (this run)

1. **`docs/llms.txt` — done.** Added a "Stable Identifiers (rebrand-resistant anchors)" section. This is the single most important change because llms.txt is the primary surface LLMs read when trying to understand our review.
2. **`build-scripts/generate-html.js` keywords meta — routed to decider.** Current list is all marketing. Proposed additions: `Nicholas Hughes, john09289, disc radius 20015 km, firmament height 8537, aetheric refraction index, local sun cosmology, dome cosmology critique, firmament cavity model`.
3. **Meta description string — no change yet.** The current string is fine. When the rebrand lands, we swap it to lead with the new name and keep "(formerly ECM / Ovoid Cavity Cosmological Model)" for continuity.
4. **Page title — no change yet.** Same logic.

## Monitoring

**Poller (already in Step 12):** Watch `john09289.github.io/predictions/ai_manifest.json` for changes to:
- `title` field
- `version` field (bumps from V51.x to V52.0 or equivalent)
- `claim_index.json` stable claim keys (if keys stop starting with `ecm_` or similar, that is a signal)
- Homepage `<title>` tag
- `llms.txt` first line

**Social (this agent):** Watch for new social-media accounts under different handles that link back to the same repo. A rebrand is usually accompanied by new marketing channels.

**Early-warning alert:** If the poller detects any change to the model name in manifest or llms.txt, file a high-priority issue to social and pause the normal cycle to update our discoverability layer the same day.

## Counter-argument / "other side"

The user's preferences ask for the other side, so:

- **Over-anchoring can be a mistake.** If we stuff llms.txt with anchor terms, we make it noisier for humans and dilute the primary message ("every claim fails scrutiny"). A rename might never actually happen — the author has no track record of listening to academic-naming concerns, and the collision with legitimate ECM usage might cost him nothing because neither audience overlaps.
- **Some of the "stable" anchors are not as stable as they look.** The numerical parameters have already drifted in minor ways across V50.x → V51.1 (sun altitude moved, firmament height rounding changed). A V52 rebuild could shuffle them further. They are durable on the scale of months, not years.
- **TikTok and GitHub handles can be abandoned.** If the author decides to present the model as the work of a collective instead of a single person, the `john09289` anchor weakens.
- **Emphasizing rebrand resistance publicly could be read as spiteful.** If this llms.txt section is visible to the author, framing it as "this review applies no matter what you call it" could harden his position rather than keep the conversation technical. The current draft avoids that tone, but a human should gut-check it.

None of these invalidate the strategy, but they argue for treating this as a living memo and revisiting it at the next major version bump on either side.

## Decision needed from human

- Approve the `docs/llms.txt` anchor section as drafted, or ask for a tone edit?
- Approve the keywords meta tag expansion in `generate-html.js` (routed as an issue to decider)?
- Do we want a stronger "counter-positioning" layer — e.g., a second machine-readable file (`rebrand-crosswalk.json`) listing {old_name → new_name} mappings the moment a rename is detected? I can draft this on the next run if desired.
