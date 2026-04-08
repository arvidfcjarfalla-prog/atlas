---
description: Editorial and marketing section conventions (landing page, hub, thumbnails)
globs:
  - "apps/web/components/marketing/**"
  - "apps/web/app/(marketing)/**"
  - "apps/web/components/MapTypeBlock*"
  - "apps/web/components/family-meta*"
  - "apps/web/components/block-backgrounds*"
  - "apps/web/lib/editorial-tokens*"
  - "apps/web/app/app/(hub)/**"
---

# Editorial & Landing Rules

## Palette

- Warm-light editorial palette in `apps/web/lib/editorial-tokens.ts`: `ink`, `inkMuted`, `sage`, `gold`, `paper`, `contour`.
- Separate from `packages/ui/src/tokens/themes.css` dark palette.

## CSS

- All CSS inlined via `<style dangerouslySetInnerHTML>` with `arp-` prefix. No CSS modules in apps/web.

## Animation

- framer-motion `^12.38.0` is installed. Use `useInView`, `useScroll`, `useTransform`, `motion.*` freely.
- Always honor `prefers-reduced-motion` with BOTH observer skip AND `transition: none`.

## Thumbnails

- Always use real GeoJSON data projected at build time — never hand-draw abstract polygons.
- Never use green (sage) palette for choropleth thumbnails. Gold on dark = premium.
- Never render family-level map SVGs inside per-template example cards (geographic scope mismatch).
- Generator scripts: `apps/web/scripts/generate-*-thumbnails.mjs`.

## Design

- Never add decorative vertical spines or "atlas binding" metaphors — reads as over-designed.
- Let typography carry weight. Geist + Georgia + Geist Mono.
