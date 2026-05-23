# Anti-AI UI fingerprint

This document explains what AI-generated UI looks like and why. The single source of truth for the regex patterns is `../tells.json`. This doc is the human-readable companion.

## 1. Why the same palette every time

Adam Wathan publicly apologized for `bg-indigo-500` being the Tailwind UI button default — that default seeded every Tailwind tutorial 2019–2024, which seeded every AI training corpus. The result: every model defaults to indigo → purple → pink gradients on white. See https://x.com/adamwathan/status/1953510802159219096 (2025-08-08).

That is the root cause of the most-recognised AI tell. Strip the indigo/violet/purple gradient and half of the AI-look is gone.

## 2. Color fingerprint (hex)

| Hex | Tailwind name | Where it appears |
|---|---|---|
| `#6366f1` | indigo-500 | Default gradient start |
| `#4f46e5` | indigo-600 | Default solid CTA |
| `#8b5cf6` | violet-500 | Gradient middle |
| `#a855f7` | purple-500 | Gradient middle |
| `#ec4899` | pink-500 | Gradient end |
| `#3b82f6` | blue-500 | "Tech" accent |
| `#7c3aed` | violet-600 | Dark variant |
| `#d946ef` | fuchsia-500 | "Vibrant" accent |

Any of these in a new file = block.

## 3. shadcn HSL default fingerprint

`globals.css` straight from `npx shadcn init` contains these exact strings:

- `222.2 84% 4.9%`
- `217.2 32.6% 17.5%`
- `210 40% 98%`
- `222.2 47.4% 11.2%`
- `215 20.2% 65.1%`

If `globals.css` contains any of these unmodified, the theme has not been customised. Block.

## 4. Tailwind class fingerprints

| Pattern | Why it is a tell |
|---|---|
| `from-indigo-* to-purple-*` | The canonical AI gradient |
| `via-purple-*`, `to-pink-*`, `to-fuchsia-*` | Same family |
| `bg-indigo-500` / `bg-indigo-600` | Default button color |
| `text-indigo-600` | Default link color |
| `ring-2 ring-indigo-500` | Default focus ring |
| `bg-gradient-to-br ... blur-3xl` | Default hero glow |
| `text-balance tracking-tight bg-clip-text` | Gradient-text headline cliché |

## 5. Copy phrasebook (banlist)

Verbs and phrases that signal AI-written marketing copy:

- **Verbs to cut.** unlock, seamlessly, empower, supercharge, streamline, elevate, harness, leverage, revolutionize, powerful.
- **Phrases to cut.** beautifully crafted, lightning-fast, next-gen(eration), built for the future, trusted by teams, loved by developers, "it's not just X, it's Y", the future of X, your all-in-one platform, scale without limits, world-class, state-of-the-art, cutting-edge.
- **Replacement strategy.** Replace abstract verbs with a concrete noun + verb: "supercharge your workflow" → "save the search and rerun it tomorrow". Cut adjectives entirely when in doubt.

## 6. Em-dash density

AI marketing copy is em-dash heavy. Threshold: if `—` density > 1 per 100 words in a `.md` or `.mdx` marketing file, flag. Specs and notes are exempt.

## 7. Structural clichés

- Centered hero with pill badge + dual CTA + "trusted by" logo row.
- Section two = three feature cards in a row, each with a Lucide icon at size 24 stroke-1.5, a heading, a paragraph.
- Bento grid as section two as an attempt to vary section two.
- `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` on every section.
- Pricing page with three tiers, middle tier wrapped in `ring-2 ring-indigo-500`.
- FAQ accordion right before footer.
- Footer with four columns of links plus an email signup.

## 8. Component default fingerprints

- shadcn `Card` and `Button` straight from `npx shadcn add`, no altered radius, padding, or color.
- Lucide icons everywhere at `size={24}` `strokeWidth={1.5}`.
- `cn()` from `@/lib/utils` imported without any other utilities — signals shadcn-scaffolded but un-customised.

## 9. Composite vibe-check (the gate)

A file fails if it hits **3 or more** of these in one component:

1. Inter as the sole font.
2. Any indigo / violet / purple gradient.
3. Three-card feature row with Lucide 24 stroke-1.5.
4. Hero pill badge + `text-balance` + gradient-text headline.
5. shadcn `Card` or `Button` defaults unmodified.
6. Copy contains two or more banned verbs.
7. `transition-all duration-300` or framer-motion `duration: 0.5` without `ease` override.
8. Bento grid as section two.
9. `max-w-7xl mx-auto` on every section.
10. Pure white `#ffffff` or pure black `#000000` — no warm off-whites.

This is the threshold `composite-vibe-check.sh` enforces. The Stop-hook calls it. The design-critic calls it.
