---
description: Rauno Freiberg's 6 motion rules plus Emil Kowalski's easing curves and duration ceilings. Applied to animation and motion code.
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "**/animations.*"
  - "**/motion.*"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/**/*.css"
model: haiku
---

# Motion (Rauno Freiberg)

1. Switching themes should not trigger transitions and animations on elements.
2. Animation duration should not be more than **200ms** for interactions to feel immediate.
3. Animation values should be proportional to the trigger size.
4. Actions that are frequent and low in novelty should avoid extraneous animations.
5. Looping animations should pause when not visible on the screen to offload CPU and GPU usage.
6. Use `scroll-behavior: smooth` for navigating to in-page anchors, with an appropriate offset.

## Emil Kowalski values (additive)

- UI animations: < 300ms ceiling, 200ms default.
- Drawer: 500ms (the one exception).
- Easing curves:
  - UI default: `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out).
  - On-screen movement: `cubic-bezier(0.77, 0, 0.175, 1)` (strong ease-in-out).
  - iOS drawers: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Never use ease-in on UI — feels sluggish.
- Animate only `transform` and `opacity` for performance.
- Never animate keyboard-initiated actions — feels disconnected.

## Examples to flag

From `tells.json.composite_vibe_check`:
- `transition_all_duration_300_or_framer_duration_0_5_default`.

From `tells.json.structural_tells`:
- `transition_all_duration_300`.
- `framer_motion_duration_0_5_no_ease_override`.
- `animate_pulse_on_more_than_one_non_loading_element`.
