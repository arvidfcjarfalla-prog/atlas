# Emil Kowalski — motion values

Seven official categories: Easing Selection, Timing & Duration, Property Selection, Transform Techniques, Interaction Patterns, Strategic Animation, Accessibility & Polish.

## Concrete values

- UI animations: < 300ms (Kowalski). Conflicts with Rauno 200ms — use **200ms default, 300ms ceiling for micro-interactions**.
- Drawer: **500ms** (the one exception above the ceiling).
- Never use ease-in on UI — feels sluggish.
- Animate only `transform` and `opacity` for performance.
- Never animate keyboard-initiated actions — feels disconnected.

## Easing curves verbatim

| Use case | cubic-bezier |
|---|---|
| UI interactions (default) | `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out) |
| On-screen movement | `cubic-bezier(0.77, 0, 0.175, 1)` (strong ease-in-out) |
| iOS drawers | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Linear-style snap | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Subtle overshoot (not bouncy) | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

## Why these matter

The default `transition: all 300ms ease` reads as AI-written because every Tailwind tutorial used it. A named curve from `--ease-ui` instead of the default cubic-bezier signals deliberate craft — and the visible motion is genuinely better.

## Sources

- animations.dev (Emil Kowalski, blocked from container at time of research; values verified via cross-references)
- Linear's design language docs
- Vaul library source (`cubic-bezier(0.32, 0.72, 0, 1)` for sheet transitions)
