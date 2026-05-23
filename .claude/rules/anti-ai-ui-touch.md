---
description: Rauno Freiberg's 6 touch rules plus WCAG 2.5.8 / Apple HIG / Material tap target sizes.
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/**/*.css"
model: haiku
---

# Touch (Rauno Freiberg)

1. Hover states should not be visible on touch press, use `@media (hover: hover)`.
2. Font size for inputs should not be smaller than **16px** to prevent iOS zooming on focus.
3. Inputs should not auto focus on touch devices as it will open the keyboard and cover the screen.
4. Apply `muted` and `playsinline` to `<video />` tags to auto play on iOS.
5. Disable `touch-action` for custom components that implement pan and zoom gestures.
6. Disable the default iOS tap highlight with `-webkit-tap-highlight-color: rgba(0,0,0,0)`.

## Tap target sizes (additive)

- WCAG 2.5.8 AA minimum: 24 × 24 CSS px.
- Apple HIG: 44 × 44 pt.
- Material Design: 48 × 48 dp.
- Rule of thumb: 24 minimum, 44–48 real target.

## Examples to flag

- Buttons with `h-8 w-8` (32px) for primary actions — below Apple HIG.
- Icon-only buttons under 24×24.
- Anchor tags with no padding making the hit area only the text bounding box.
