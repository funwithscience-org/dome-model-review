# Font Licenses

This directory contains self-hosted web fonts used by funwithscience.net/dome-model-review/.

## Source Serif 4
- Author: Frank Grießhammer (Google Fonts)
- License: SIL Open Font License 1.1
- Source: https://fonts.google.com/specimen/Source+Serif+4
- Repository: https://github.com/adobe-fonts/source-serif

## Inter
- Author: Rasmus Andersson
- License: SIL Open Font License 1.1
- Source: https://fonts.google.com/specimen/Inter
- Repository: https://github.com/rsms/inter

## JetBrains Mono
- Author: JetBrains
- License: SIL Open Font License 1.1
- Source: https://fonts.google.com/specimen/JetBrains+Mono
- Repository: https://github.com/JetBrains/JetBrainsMono

---

SIL Open Font License 1.1 summary: You are free to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font Software, provided that:
(1) the Font Software is not sold by itself, and (2) modified versions must be distributed
under the same or similar license, and (3) the font name must not be used to promote products
without permission of the copyright holder. See https://scripts.sil.org/OFL for full license text.

---

NOTE: WOFF2 font files are not yet committed to this repository. To complete EXP-202
integration, download variable WOFF2 subsets (latin) for each family and place them here:
  - source-serif-4-variable.woff2
  - inter-variable.woff2
  - jetbrains-mono-variable.woff2

Use pyftsubset (fonttools) to subset to U+0000-U+00FF (Basic Latin + Latin-1 Supplement).
Recommended target: ≤150KB per file, ≤350KB aggregate.
