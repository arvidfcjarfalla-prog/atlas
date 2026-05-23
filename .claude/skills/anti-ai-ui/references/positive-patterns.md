# Positive patterns

What taste-tier UI looks like. The single source of truth for positive signals is `../tells.json` (`positive_signals` block). This doc is the human-readable companion.

## 1. Easing curves (Emil Kowalski + Vaul + Linear)

```css
:root {
  --ease-ui:        cubic-bezier(0.23, 1, 0.32, 1);   /* Kowalski default — strong ease-out */
  --ease-snap:      cubic-bezier(0.16, 1, 0.3, 1);     /* Linear-style snap */
  --ease-drawer:    cubic-bezier(0.32, 0.72, 0, 1);    /* Vaul / iOS sheet — drawers only */
  --ease-reveal:    cubic-bezier(0.77, 0, 0.175, 1);   /* Image / hero reveal */
  --ease-overshoot: cubic-bezier(0.34, 1.56, 0.64, 1); /* Subtle pop, not bouncy */
}
```

## 2. Kowalski's rules

- UI feedback ≤ 200ms. Absolute max 300ms.
- Drawer 500ms is the only exception.
- Never `ease-in` on UI — the delay reads as sluggish.
- Animate only `transform` and `opacity`. Everything else jitters.
- Never animate keyboard-initiated actions — feels disconnected from the keypress.
- **Cubic-bezier for chrome (fades, scales, opacity). Springs for physical objects (drawers being dragged, toasts entering, cursor-tracked, drag-reorder).** Spring configs live in section 11 and `examples/positive/motion-springs.tsx`.

## 3. Tailwind v4 OKLCH `@theme` example

```css
@theme {
  --color-bg:        oklch(0.985 0.005 85);   /* warm off-white, not pure white */
  --color-fg:        oklch(0.18  0.015 250);  /* not pure black */
  --color-muted:     oklch(0.55  0.01  250);
  --color-accent-9:  oklch(0.65  0.20  245);  /* Radix step-9 equivalent */
  --color-accent-10: oklch(0.58  0.22  245);
  --color-accent-11: oklch(0.45  0.18  245);
}
```

OKLCH > HSL because perceptual lightness lines up across hues. The middle tier of the accent goes to text against tinted backgrounds.

## 4. Font-stack tier list

| Tier | What it looks like | Notes |
|---|---|---|
| AI-tier | Inter alone, font-weight 600 on everything | Don't ship this |
| Mid-tier | Inter + Instrument Serif italic accent | 2026 cliché — explicitly avoid |
| Mid-tier | Anything with Space Grotesk | Anthropic cookbook warned about this — most-converged font |
| Taste | Geist (Vercel), Söhne (Klim, paid), ABC Diatype, GT America, PP Neue Montreal | Distinctive, well-engineered |
| Data UI | Berkeley Mono, JetBrains Mono | For metrics, code, IDs |

Inter is acceptable **only** when paired with `font-feature-settings: "ss01" 1, "cv11" 1, "tnum" 1` (alt-1, single-storey a, tabular nums).

## 5. Radix Colors 12-step semantic scale

| Step | Use |
|---|---|
| 1–2 | App + subtle backgrounds |
| 3 | Component background (normal) |
| 4 | Hover |
| 5 | Active / selected |
| 6 | Subtle border |
| 7 | UI element border |
| 8 | Stronger border, focus ring |
| 9 | Solid backgrounds (the brand color slot) |
| 10 | Hovered solid backgrounds |
| 11 | Text against tinted background |
| 12 | High-contrast text |

Step 9 is the only place where the brand hue appears at full saturation.

## 6. Modern CSS features that signal effort

| Feature | One-line example |
|---|---|
| `@property` | Animate gradient angles without keyframes |
| `color-mix(in oklch, ...)` | Tint elements without a second token |
| `:has()` | `form:has(input:invalid) .submit { opacity: .5 }` |
| `@starting-style` | Mount animations without JS |
| View Transitions API | Cross-document fades for free |
| `animation-timeline: view()` | Scroll-driven entries on compositor |
| Container queries (`container-type: inline-size`) | Component-local breakpoints |
| `text-wrap: pretty` / `balance` | Better headlines |
| `hanging-punctuation: first` | Optical alignment for pull-quotes |
| `initial-letter` | Drop caps without absolute positioning |
| `font-variant-numeric: tabular-nums` | Aligned digits in tables |
| `font-feature-settings` | Stylistic sets to break Inter-default look |
| `@font-feature-values` | Named character variants (`character-variant(alt-one)`) — `examples/positive/font-variation-hover.css` |
| `font-variation-settings` axis animation | Animate weight on hover without layout shift — same file |
| `clip-path: inset(...)` reveals | Sharper than opacity fade — `examples/positive/clip-path-reveal.css` |

## 7. Component library tier list

| Tier | What |
|---|---|
| AI-tier | shadcn defaults unmodified |
| Mid | shadcn with custom radii, spacing, and colors |
| Taste | Radix primitives + custom Tailwind, no shadcn wrapper |
| Vibecoder canon | Vaul for drawers, Sonner for toasts, cmdk for command palette, Radix HoverCard with `openDelay={300} closeDelay={150}`, react-aria-components for production a11y |

## 8. Cross-canon recurring patterns

- Single column with generous measure (60–75ch reading width).
- Fixed monospace nav with variable-weight body — the nav reads like an editor's chrome.
- Hover reveals underline-thickness change, not color change.
- Inline code chips use `color-mix(in oklch, var(--color-accent-9) 12%, transparent)` for the background tint.
- Footnotes and marginalia over block quotes for asides.
- `tabular-nums` in all metadata, prices, timestamps.

## 9. Spacing ladder (Fibonacci-ish)

`2 / 4 / 6 / 10 / 14 / 22 / 36 / 58` — not Tailwind's default `4 / 8 / 12 / 16 / 24`. Break the grid intentionally with arbitrary values (`pt-[27px]`) when optical balance needs it.

## 10. Border-radius discipline

4–12px for chrome. Never `rounded-2xl` (16px) on small elements. Buttons live at 4–8px. Cards at 8–12px. Modals can reach 16px. Above 16px on a small element reads as cartoonish AI default.

## 11. Spring configs (for animation libraries with spring physics)

Use springs for physical objects. Use cubic-beziers (section 1) for chrome. Bounce > 0.3 reads as AI overdoing it.

| Purpose | Config | Source |
|---|---|---|
| Cursor-tracked / mouse-follow | `{ stiffness: 300, damping: 30, mass: 1 }` | Emil Kowalski |
| Toast enter / exit | `{ stiffness: 140, damping: 18, mass: 1 }` | Sonner default |
| Drag reorder | `{ stiffness: 500, damping: 40, mass: 1 }` | Tight, anchored |
| Apple-modern declarative | `{ type: "spring", duration: 0.5, bounce: 0.2 }` | Bounce 0.1–0.3 ceiling |
| Drawer / sheet | **Use cubic-bezier `0.32, 0.72, 0, 1`**, not spring | Vaul / iOS |

Source-of-truth: `tells.json → positive_signals.framer_motion_springs`. Paste-ready snippets: `examples/positive/motion-springs.tsx`.

**Do not emit:**
- `{ type: "spring" }` with no overrides (default bounce too high).
- `{ stiffness: 800+ }` (jittery, expensive).
- `{ bounce: 0.5+ }` (cartoonish).
- Springs on fade/opacity transitions — use cubic-bezier instead.
- `transition={{ duration: 0.5 }}` with no easing — the tutorial default, single most-recognised AI motion tell.

## 12. Paste-ready example files

All under `.claude/skills/anti-ai-ui/examples/positive/`:

| File | What it covers |
|---|---|
| `easing-tokens.css` | CSS vars for the 5 canonical cubic-beziers + duration scale |
| `oklch-theme.css` | Tailwind v4 `@theme` block with OKLCH + fibonacci spacing + tracking |
| `font-feature-settings.css` | Inter with stylistic sets enabled + heading-weight discipline |
| `starting-style-toast.css` | `@starting-style` + `@property` + `color-mix` + `:has()` |
| `view-transition-route.css` | View Transitions API + scroll-driven `animation-timeline: view()` |
| `clip-path-reveal.css` | clip-path reveals with `@starting-style` and scroll-driven variant |
| `font-variation-hover.css` | Variable font axis animation on hover + `@font-feature-values` |
| `motion-springs.tsx` | Framer Motion / Motion spring configs (cursor, toast, drag, Apple) |
