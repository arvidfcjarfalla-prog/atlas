# Atlas Web App

## Design System

Three visual identities: Editorial (light, news blue), Explore (dark, product green), Decision (dark, action blue). Four UI modes set on `<html>`: discover, own, create, refine.

- **Accent:** Teal (HSL 197°) — used only on lines, surfaces, borders. Never on text.
- **Fonts:** Inter (sans), Georgia (display/serif), JetBrains Mono / Geist Mono (code/data)
- **Tokens:** `packages/ui/src/tokens/themes.css` — always read before changing colors or modes
- **Tailwind config:** `packages/ui/tailwind.config.ts` — font families, custom sizes, colors
- **Layout:** Map-dominant. Map canvas takes the majority of viewport. Sidebar 320px, panel 384px.

## Interaction Policy

- Direct manipulation only for spatial/visual actions (pan, zoom, rotate, drag layers)
- All data decisions via natural language in ChatPanel
- Accent never on text — only on surfaces, borders, and lines

## Pricing

Pricing tiers are defined in `apps/web/app/(marketing)/pricing/page.tsx`. Always read that file before touching pricing — do not hardcode tier names or prices elsewhere.
