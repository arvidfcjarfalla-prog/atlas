---
description: Rauno Freiberg's 9 typography rules plus the anti-ai-ui font tier list. Applied to component and stylesheet files.
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "app/**/*.tsx"
  - "app/**/*.css"
  - "components/**/*.tsx"
  - "**/globals.css"
  - "tailwind.config.*"
  - "apps/**/*.css"
  - "packages/**/*.css"
model: haiku
---

# Typography (Rauno Freiberg)

1. Fonts should have `-webkit-font-smoothing: antialiased` applied for better legibility.
2. Fonts should have `text-rendering: optimizeLegibility` applied for better legibility.
3. Fonts should be subset based on the content, alphabet or relevant language(s).
4. Font weight should not change on hover or selected state to prevent layout shift.
5. Font weights below 400 should not be used.
6. Medium sized headings generally look best with a font weight between 500-600.
7. Adjust values fluidly by using CSS `clamp()`, e.g. `clamp(48px, 5vw, 72px)`.
8. Where available, tabular figures should be applied with `font-variant-numeric: tabular-nums`.
9. Prevent text resizing unexpectedly in landscape mode on iOS with `-webkit-text-size-adjust: 100%`.

## Examples to flag

From `tells.json.font_pairing_red_flags`:
- `Inter_alone_no_feature_settings` — Inter without `font-feature-settings: "ss01" 1, "cv11" 1, "tnum" 1`.
- `Inter_plus_Instrument_Serif_italic_accent` — the 2026 cliché.
- `Inter_plus_Space_Grotesk` — Space Grotesk is the most-converged AI font choice (Anthropic cookbook warning).
- `Roboto_anywhere`, `Arial_anywhere`.

From `tells.json.composite_vibe_check`:
- `inter_as_sole_font`.
- `font_weight_600_on_majority_of_text`.
