---
description: Rauno Freiberg's 11 interactivity rules for forms, inputs, buttons, and hit areas. Applied to React/Vue component files.
paths:
  - "src/**/*.tsx"
  - "src/**/*.jsx"
  - "src/**/*.vue"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/**/*.tsx"
  - "packages/**/*.tsx"
model: haiku
---

# Interactivity (Rauno Freiberg)

1. Clicking the input label should focus the input field.
2. Inputs should be wrapped with a `<form>` to submit by pressing Enter.
3. Inputs should have an appropriate `type` like `password`, `email`, etc.
4. Inputs should disable `spellcheck` and `autocomplete` attributes most of the time.
5. Inputs should leverage HTML form validation by using the `required` attribute when appropriate.
6. Input prefix and suffix decorations, such as icons, should be absolutely positioned on top of the text input with padding, not next to it, and trigger focus on the input.
7. Toggles should immediately take effect, not require confirmation.
8. Buttons should be disabled after submission to avoid duplicate network requests.
9. Interactive elements should disable `user-select` for inner content.
10. Decorative elements (glows, gradients) should disable `pointer-events` to not hijack events.
11. Interactive elements in a vertical or horizontal list should have no dead areas between each element, instead, increase their `padding`.

## Examples to flag

From `tells.json.tailwind_class_patterns`:
- `ring-2 ring-indigo-500` on focus rings — use `box-shadow` ring with semantic color instead.

From `tells.json.composite_vibe_check`:
- `shadcn_card_or_button_defaults_unmodified` — `Button` and `Card` straight from `npx shadcn add` without altered radius, padding, or color.
