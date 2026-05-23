---
description: Rauno Freiberg's 12 accessibility rules plus WCAG 2.5.8.
paths:
  - "src/**/*.tsx"
  - "src/**/*.jsx"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/**/*.tsx"
  - "packages/**/*.tsx"
model: haiku
---

# Accessibility (Rauno Freiberg)

1. Disabled buttons should not have tooltips, they are not accessible.
2. Box shadow should be used for focus rings, not outline which won't respect radius.
3. Focusable elements in a sequential list should be navigable with ↑ ↓.
4. Focusable elements in a sequential list should be deletable with ⌘ Backspace.
5. Dropdown menus should trigger on `mousedown`, not `click` to open immediately on press.
6. Use a svg favicon with a style tag that adheres to the system theme based on `prefers-color-scheme`.
7. Icon only interactive elements should define an explicit `aria-label`.
8. Tooltips triggered by hover should not contain interactive content.
9. Images should always be rendered with `<img>` for screen readers and ease of copying.
10. Illustrations built with HTML should have an explicit `aria-label`.
11. Gradient text should unset the gradient on `::selection` state.
12. When using nested menus, use a prediction cone to prevent accidental menu closing.

## WCAG 2.5.8

- Target size minimum 24 × 24 CSS px for any interactive element.

## Examples to flag

- Icon buttons with no `aria-label`.
- `outline: 2px solid` focus rings on rounded elements (use `box-shadow` ring instead).
- `disabled` buttons wrapped in `<Tooltip>`.
- Gradient headlines without `::selection { background: ...; -webkit-text-fill-color: initial; }`.
