# Font Licenses

This directory contains self-hosted web fonts used by funwithscience.net/dome-model-review/.
All three families are distributed under the SIL Open Font License 1.1 (OFL-1.1).

## Source Serif 4
- Version shipped: 4.005R (April 2024)
- Author: Frank Grießhammer
- License: SIL Open Font License 1.1
- Source: https://github.com/adobe-fonts/source-serif/releases/tag/4.005R
- Files:
  - `source-serif-4-variable.woff2` (upstream `VAR/SourceSerif4Variable-Roman.ttf.woff2`)
  - `source-serif-4-variable-italic.woff2` (upstream `VAR/SourceSerif4Variable-Italic.ttf.woff2`)

## Inter
- Version shipped: 4.0 (2023-08)
- Author: Rasmus Andersson
- License: SIL Open Font License 1.1
- Source: https://github.com/rsms/inter/releases/tag/v4.0
- Files:
  - `inter-variable.woff2` (upstream `web/InterVariable.woff2`)
  - `inter-variable-italic.woff2` (upstream `web/InterVariable-Italic.woff2`)
  - Static fallbacks: `Inter-Regular.woff2`, `Inter-Italic.woff2`, `Inter-Bold.woff2`, `Inter-BoldItalic.woff2`

## JetBrains Mono
- Version shipped: 2.304 (2023-10)
- Author: JetBrains
- License: SIL Open Font License 1.1
- Source: https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304
- Files:
  - `jetbrains-mono-variable.woff2` (converted from upstream `fonts/variable/JetBrainsMono[wght].ttf` via fontTools, flavor=woff2)
  - `jetbrains-mono-variable-italic.woff2` (converted from upstream `fonts/variable/JetBrainsMono-Italic[wght].ttf`)
  - Static fallbacks: `JetBrainsMono-Regular.woff2`, `JetBrainsMono-Italic.woff2`, `JetBrainsMono-Bold.woff2`, `JetBrainsMono-BoldItalic.woff2`

---

SIL Open Font License 1.1 summary: You are free to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font Software, provided that:
(1) the Font Software is not sold by itself, and (2) modified versions must be distributed
under the same or similar license, and (3) the font name must not be used to promote products
without permission of the copyright holder. See https://scripts.sil.org/OFL for full license text.

---

## Build history

- **2026-04-23** — Fonts committed to repo, closing EXP-202 integration TODO. Variable WOFF2
  primaries + italics + static Regular/Bold/Italic/BoldItalic fallbacks. Full Latin coverage
  (no subsetting applied — the variable-font byte overhead is acceptable for a predominantly
  English-language site, and a future EXP may revisit subsetting for performance). See
  `build-scripts/generate-html.js` `@font-face` block for CSS wiring.
