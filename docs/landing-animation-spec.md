# Landing Animation Spec — AtlasRenderPipeline

**Status:** Implemented and iterated. The AS-BUILT section below is authoritative for current reality. The rest of this document (from "Purpose" onward) is preserved as the pre-build contract + multi-round debate record that led to the first implementation. Several decisions in that history have since shifted — see the "Divergences from original spec" table below.
**Last reviewed:** 2026-04-05
**Implementation:** `apps/web/components/marketing/AtlasRenderPipeline.tsx` + `apps/web/components/marketing/render-pipeline/*`
**Integration:** Embedded in `apps/web/app/(marketing)/landing.tsx` (replaced the old 3-step "How it works" grid).

---

## AS BUILT (2026-04-05)

### Stage structure — 5 stages, not 4
1. **Describe** — plain-language prompt parsing (topic / metric / geography / admin level / map family)
2. **Source** — official sources + user upload, editorial ledger sub-viz
3. **Render** — full interactive choropleth, legend, controls, source chip, Stockholm marker
4. **Refine** — chat-back iteration, filter dim effect on the map, chat transcript sub-viz
5. **Export** — format chips, shimmer sweep, corner selection marks, destination mockups

Stage data lives in `apps/web/components/marketing/render-pipeline/stages.ts` (types, content, `DENSITY_RAMP`, `RANK_BY_FILL`, `RANK_VALUE_LABELS`).

### Architecture
- **Outer component:** `AtlasRenderPipeline.tsx` — 3-column grid (`StageList` sticky left, `MapBlueprint` sticky center, `StageText` scrolling right), IntersectionObserver with `rootMargin: "-45% 0px -45% 0px"` advances `activeStage` as text blocks scroll through the viewport.
- **Sticky map:** `MapBlueprint.tsx` — single SVG with 4 layers (graticule / municipality outlines / choropleth fills / Stockholm marker) driven by `data-stage` attribute on the card. On-map chrome appears stage-by-stage: source chip (stage 2+), legend + pan/zoom controls (stage 3+), refine bar + rank-based dim filter (stage 4), export format chips + shimmer sweep + corner marks (stage 5).
- **Text column:** `StageText.tsx` — each stage block renders via `forwardRef` and has its own sub-viz: `VizDescribe` (prompt + parsed chips), `VizSources` (editorial ledger, see below), `VizFeatures` (rendered-feature checklist), `VizChat` (chat transcript), `VizDestinations` (slide / article / report mockups).
- **Nav:** `StageList.tsx` — sticky left column, click-to-jump via `scrollIntoView` (honors `prefers-reduced-motion`).

### Typography (not Fraunces, not Courier Prime)
- `"Geist", -apple-system, system-ui, ...` — sans body + UI
- `Georgia, "Times New Roman", serif` — editorial display + italic copy
- `"Geist Mono", ui-monospace, monospace` — eyebrows, labels, source names, map data

### Palette (CSS custom properties inside the component)
- `--paper: #f5f4f0` (section background) / `--paper-2: #fafaf7` / `--paper-3: #ffffff`
- `--ink: #1a1f1c` / `--ink-2: #3c4149` / `--ink-3: #6f6e77` / `--ink-4: #9a968e` / `--ink-5: #c9c6bd`
- `--gold-deep: #9a6f3f` / `--gold-tint: rgba(196, 145, 90, 0.08)`
- `--hairline-1/2/3` — subtle ink alpha dividers
- No `registration-red`, no sage. The "SCB source stamp signature moment" in the original spec is not implemented as a registration-red stamp; source attribution is a small editorial `.arp-source-chip` hairline pill.

### Motion (no framer-motion)
- `framer-motion ^12.38.0` is listed in `apps/web/package.json` but **not imported** anywhere in `components/marketing/`. All motion is CSS transitions + `@keyframes` triggered by IntersectionObserver state or local per-sub-viz observers that flip a `data-active` attribute.
- Per-path staggered reveals use a CSS custom property `--i` on each path and `transition-delay: calc(var(--i, 0) * 4ms)` to sweep from north to south.
- `prefers-reduced-motion: reduce` is honored globally at the bottom of the inline stylesheet: all `.arp-root *` transitions/animations drop to `0.01ms`.

### Stage 2 Source sub-viz — `VizSources` (editorial ledger)
Replaces earlier dual-card design (deleted: `.arp-viz-sources`, `.arp-src-path`, `.arp-src-head`, `.arp-src-title`, `.arp-src-list`, `.arp-src-more`). Current structure:
- 2×32px `--gold-deep` top rule
- 2-column grid (`1.55fr` + `1px` divider + `1fr`), collapses to single column at ≤1024px with a hairline between stacked columns
- Left: mono eyebrow `OFFICIELLA KÄLLOR` → Georgia italic `70+` at 72px → mono list `SCB EUROSTAT WORLD BANK FRED OECD SMHI +64`
- Right: mono eyebrow `ELLER DIN EGEN` → Georgia italic `Din data.` at 28px → mono list `CSV XLSX JSON PARQUET`
- Bottom claim line (centered, Georgia italic 22px, hairline-1 top border): *"Varje karta visar sin källa."*
- Staggered entrance triggered by a **local** IntersectionObserver (threshold 0.4, fires once) that flips `data-active="true"` on the root. Nine `transition-delay` steps from 0 → 560ms. Informed by a 4-role debate (Editorial Purist / Interactive Maximalist / Conversion Marketer / Implementation Engineer). Swedish copy chosen for target audience (Swedish journalists / researchers / civil servants).

### Divergences from original spec
| Original spec | As built | Reason |
|---|---|---|
| 4 stages (Prompt → Understand → Source → Render) | 5 stages (Describe → Source → Render → **Refine** → **Export**) | User feedback: Prompt + Understand were redundant; Refine (chat-back) and Export were missing from the narrative |
| Fraunces Variable display | Georgia italic display | Matches existing `/app` editorial section; Fraunces was never wired into Next.js font config |
| Courier Prime for labels | Geist Mono | Already loaded via Next.js font stack; one fewer font to ship |
| framer-motion scroll triggers | IntersectionObserver + CSS transitions | framer-motion is installed but unused here — pure CSS is sufficient for scroll-triggered (not scroll-linked) reveals, simpler to maintain |
| SCB registration-red stamp at stage 3 | Editorial `.arp-source-chip` (hairline pill, stage 2+) | Registration red clashed with warm editorial palette; hairline chip reads as "cited" without being decorative |
| "Zero new deps beyond framer-motion" | Zero new deps AND framer-motion unused | IntersectionObserver solved every case we needed it for |
| Hoverable choropleth at Render (debate decision) | Hoverable at Render **and** Refine **and** Export with rank-based tooltip | Hover is cheap and the `RANK_VALUE_LABELS` map made per-rank density estimates free |
| One sticky map card, plain | Sticky card + rich on-map chrome layered by stage (legend, controls, source chip, refine bar, export chips, corner marks, shimmer sweep) | User feedback round 4: stage 3 bullets listed features that weren't visually present on the map; on-map chrome fixed the disconnect |

---

## Purpose

A scroll-driven marketing section on the Atlas landing page (`/`) that shows the product's value proposition — "from prompt to live interactive map" — as a progressive rendering sequence. Same architectural pattern as rocket.new's hero scrollytelling, but with cartographic content and Atlas's own editorial visual language.

The section is the **first time a visitor sees what Atlas does**. It must land the "right data AND right visualization, picked automatically" claim that separates Atlas from generic LLM wrappers.

---

## Research findings (source-verified)

### rocket.new's animation architecture

rocket.new's hero animation is driven by Rive (`@rive-app/canvas`). The `.riv` file has:

- **1 state machine:** `Scroll Controller`
- **4 triggers** (not booleans — verified against bundle source): `Scroll Section 1`, `Scroll Section 2`, `Scroll Section 3`, `Scroll Section 4`
- **4 named animations** tied to state transitions
- As the user scrolls into each of the 4 sections on the page, React code fires the corresponding trigger via `input.fire()`. The state machine transitions to that section's pose.

### The visual metaphor (key insight)

The 4 stages are **not** a component-assembly sequence. They are **progressive rendering** of the same subject:

1. **Stage 1** — Technical blueprint (linework only, no fill, callouts and measurement marks visible)
2. **Stage 2** — Blueprint + shaded body panels (dimensional rendering added on top of the line art)
3. **Stage 3** — Fully rendered (full color, textured surfaces, weathered detail)
4. **Stage 4** — Fully rendered + motion (launching, flames)

Pedagogically this says: *from idea/blueprint to fully realized/launched*. The metaphor is "your concept becomes a real live thing through our pipeline".

### Why this translates 1:1 to Atlas

Maps are blueprints. Cartographic work literally starts as line drawings (graticule, coastlines) and is filled in with data. The rocket.new metaphor becomes Atlas's actual product pipeline visualized:

| rocket.new stage | Atlas stage | Visual content |
|---|---|---|
| Blueprint (linework only) | **Prompt** | Empty cartographic blueprint: graticule 5° grid, scale bar, compass rose, corner tick marks, measurement callouts. No data, no regions. |
| Shaded body added | **Understand** | Region boundaries drawn in as thin ink lines (country/admin1 borders). Still no data, but the geographic subject is now identified. |
| Fully rendered | **Source** | Choropleth data fills the regions. Source stamp (SCB / Eurostat) lands on the legend. |
| Launching | **Render** | Full interactive map: legend, hover tooltip visible on one region, annotation callouts pointing to data points. The "launching" equivalent is the map coming alive. |

---

## Rive API reference (verified against `@rive-app/canvas@2.21.6` bundle source)

**DO NOT GUESS THESE VALUES.** They were verified by grepping the actual bundle at `lines 4075–4077`:

```
StateMachineInputType.Number  = 56
StateMachineInputType.Trigger = 58
StateMachineInputType.Boolean = 59
```

SMIInput class (`lines 4100–4120`):
- `inp.value` — getter/setter for Number and Boolean inputs only
- `inp.fire()` — fires a trigger. **Source comment:** *"does nothing on Number or Boolean input types"*

**The canonical pattern for Rive triggers:**

```js
const r = new rive.Rive({
  src: "...",
  canvas: canvasEl,
  autoplay: true,
  stateMachines: "State Machine Name",  // string, not array
  onLoad: () => {
    r.resizeDrawingSurfaceToCanvas();
    const inputs = r.stateMachineInputs("State Machine Name");
    const T = rive.StateMachineInputType;
    inputs.forEach((inp) => {
      if (inp.type === T.Trigger) {
        // Use inp.fire() to advance the state machine
      } else if (inp.type === T.Boolean) {
        // inp.value = true/false
      }
    });
  },
});
```

Triggers **cannot be un-fired**. To reset a trigger-driven animation, cleanup and recreate the Rive instance.

---

## Atlas architecture — what to build

**We do NOT use Rive for Atlas.** Rive would require someone to author `.riv` files in the Rive editor, and the rocket.new metaphor (progressive rendering of line art) is trivial to implement in pure SVG + framer-motion. The Rive decoding of rocket.new was research to understand the architecture and the visual grammar — not a dependency we adopt.

### Dependencies (already in place)

- `framer-motion ^12.38.0` — installed in `apps/web/package.json` during this session
- No other new dependencies needed

### Component structure

```
apps/web/components/marketing/
├── AtlasRenderPipeline.tsx          # Outer section with 3-column layout + scroll logic
├── render-pipeline/
│   ├── StageList.tsx                # Left column: 4-item step list with active indicator
│   ├── MapBlueprint.tsx             # Center column sticky: SVG map with 4 rendering layers
│   ├── StageText.tsx                # Right column: scroll-driven text panels per stage
│   └── stages.ts                    # Data: stage content (title, description, bullets, CTA)
```

### Layout (mirrors rocket.new's pattern)

```
┌─────────────────────────────────────────────────────────┐
│  [StageList]     [MapBlueprint sticky]   [StageText]    │
│  • 01 Prompt      ┌──────────────────┐    Prompt        │
│    02 Understand  │  warm-light      │    Big title     │
│    03 Source     │  SVG blueprint,  │    Description   │
│    04 Render      │  4 layers,       │                  │
│                   │  progressive     │    1.1 ...       │
│                   │  reveal via      │    1.2 ...       │
│                   │  framer-motion   │                  │
│                   └──────────────────┘    [CTA]         │
│                                                         │
│                                           Understand    │
│                                           ...           │
│                                           (scrolls)     │
└─────────────────────────────────────────────────────────┘
```

- **Outer grid:** `grid-template-columns: 180px minmax(0, 1.1fr) minmax(0, 0.9fr)`, 80px gap
- **StageList:** `position: sticky; top: 120px;` — small, always visible on the left
- **MapBlueprint:** `position: sticky; top: 120px;` — the hero of the section
- **StageText:** each stage block `min-height: 85vh` — scrolls past the sticky column, triggers stage changes via `useInView`

### Scroll logic

- Use framer-motion's `useInView` per stage block in StageText column
- When a block enters the viewport threshold (`amount: 0.5`), set `activeStage` state to that stage number
- `MapBlueprint` accepts `stage: 0 | 1 | 2 | 3 | 4` as a prop
- `StageList` highlights the matching step with a filled bullet

### MapBlueprint — 4 layer stack

Each layer has `animate={{ opacity, ... }}` driven by `stage`:

| Layer | Visible from stage | Content |
|---|---|---|
| **A. Graticule + frame** | Always (stage 0+) | 5° or 10° lat/lon grid, scale bar, compass rose, 4 corner tick marks, "ATLAS / PLATE 0X" slug in Geist Mono at top-left. Pure `stroke: #1a1f1c` at 0.6–1px, no fill. |
| **B. Region boundaries** | Stage 2+ | Reuse `SWEDEN_CHOROPLETH_PATHS` from `apps/web/components/generated/sweden-choropleth.ts`. Render with `fill: none; stroke: #1a1f1c; stroke-width: 0.5`. `stroke-dashoffset` draw-in transition. |
| **C. Choropleth fill** | Stage 3+ | Same paths, now with gold sequential ramp fill. Add SCB source stamp in upper-right corner — registration-red `#c0392b` circle with "SCB · BE0101" in Courier Prime. |
| **D. Interactive layer** | Stage 4 | Legend below the map (gold 6-class ramp, Geist Mono labels), one persistent tooltip on a region with Courier Prime label + value + year, annotation callouts with hairlines pointing to 1–2 regions. |

### Visual language (locked from prior debate synthesis)

- **Palette:** Warm-light matching `/app` editorial section
  - `paper` `#f5f4f0` — section background
  - `ink` `#1a1f1c` — all linework and text
  - `gold` `#c4915a` — data ramp, active step bullet, emphasis
  - `registration-red` `#c0392b` — used exactly twice: SCB source stamp and active tooltip stroke
  - NO sage accent in this section (it's Linear's color; we keep gold as Atlas's data color)

- **Typography:**
  - **Fraunces Variable** (Google Fonts, free) — display face for stage titles
    - `opsz 144, wght 420, SOFT 40` at `clamp(56px, 7vw, 104px)`
  - **Georgia** — body copy
  - **Courier Prime** — prompt voice, map labels, SCB stamp text, callouts
  - **Geist Mono** — marginalia and step numbers only

- **Motion (locked from Motion Craft debate position):**
  - Primary easing: `cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo)
  - Secondary easing: `cubic-bezier(0.32, 0.72, 0, 1)` (Apple sheet) for SCB stamp impression
  - Durations: 420ms in / 340ms out / 120ms overlap / 60ms stagger for sub-elements
  - Scroll-**triggered**, not scroll-linked. `useInView` threshold 0.5. Ideas snap; objects scrub. Atlas is ideas.
  - Reduced-motion: opacity crossfades only, no transforms, SCB stamp becomes instant state change

### Signature moment (the thing that goes on Twitter)

**The SCB source stamp.** A circular registration-red stamp that lands at stage 3 (Source) with a 280ms down-press + 180ms settle, Courier Prime text "SCB · BE0101 · 2024". This is the single frame someone screenshots — the moment Atlas proves it's pulling real data from a real Swedish government archive.

---

## Reusable assets already in the repo

- `apps/web/components/generated/sweden-choropleth.ts` — 279 Swedish municipalities, pre-projected SVG paths (141 KB). Reuse for region layer.
- `apps/web/components/generated/family-thumbnails.ts` — world outline, Europe outline, cities. Available if we expand beyond Sweden.
- `apps/web/lib/editorial-tokens.ts` — the warm-light palette. Import directly.
- `apps/web/components/family-meta.tsx` — `ThumbnailFrame` helper with registration tick marks. Pattern to follow.

---

## Research artifacts (reference only, NOT to adopt as-is)

These live in `tmp/rocket-mirror/` for visual reference during the build. Do not import from them into the Atlas codebase.

- `tmp/rocket-mirror/www.rocket.new/index.html` — mirrored landing HTML
- `tmp/rocket-mirror/assets.rocket.new/_next/static/chunks/` — 48 JS bundles + 4 CSS files, grepable for patterns
- `tmp/rocket-mirror/assets.rocket.new/rocket/rocket_animation.riv` — the 287 KB Rive file
- `tmp/rocket-mirror/preview.html` — local Rive previewer with trigger stage buttons (requires `python3 -m http.server 8765` running in the dir)

Clean up after the build is done: `rm -rf /Users/arvidhjartberg/atlas/tmp/rocket-mirror`.

---

## Contract (draft — to be refined before /build)

**GOAL:** Ship a new marketing section on `/` that visually demonstrates Atlas's 4-stage pipeline (Prompt → Understand → Source → Render) as a progressive SVG blueprint rendering, using warm-light editorial palette, Fraunces display, framer-motion scroll triggers. Replaces the current small 3-step "How it works" grid.

**CONSTRAINTS:**
- Only modify: `apps/web/app/(marketing)/landing.tsx` and new files under `apps/web/components/marketing/`
- Reuse existing `SWEDEN_CHOROPLETH_PATHS` for region data — do not regenerate geometry
- Use `framer-motion` (already installed) — no other new dependencies
- Match `/app` editorial palette exactly — no new color tokens
- Must pass `pnpm typecheck && pnpm test` from `apps/web`
- Must honor `prefers-reduced-motion` (opacity only, no transforms)
- Must be responsive: 3-column collapses to stacked on viewports <1024px

**FORMAT:**
- 1 new section component + ~3 subcomponents + 1 data file
- Integrated into `landing.tsx` in place of rows 207–223 (the tiny 3-step grid)
- No changes to `apps/web/app/app/(hub)/page.tsx` or any `/app` code

**FAILURE (any of these = not done):**
1. Scroll-linked scrubbing instead of trigger-based. Must snap per stage.
2. Dark palette instead of warm-light. Must match `/app`.
3. Generic sans-serif (Inter/Roboto) instead of Fraunces display.
4. No SCB source stamp at stage 3, OR stamp uses a color other than `#c0392b`.
5. Hand-drawn region shapes instead of reusing `SWEDEN_CHOROPLETH_PATHS`.
6. Any new dependency beyond `framer-motion` (already installed).
7. Reduced-motion not honored (transforms fire when user has opted out).
8. Layout breaks below 1024px (3-column doesn't collapse cleanly).
9. `pnpm typecheck` or `pnpm test` fails.
10. Step text uses AI-generic fluff ("Atlas thinks", "AI magic") instead of Atlas terminology (MapManifest, SCB, Eurostat, choropleth, etc.).

---

## Prior debate record (summary of decisions that fed this spec)

Two multi-round debates informed this spec:

1. **Step count debate** (A=3 / B=4 / C=5 stages). Consensus picked B=4: Prompt → Understand → Source → Render. Compile step dropped as technical plumbing. Select step merged into Render as micro-sequence.

2. **Execution quality debate** (5 perspectives: Bencium UX, Frontend-Design, Vercel/Linear, 21st.dev, Motion Craft). Round 2 converged on:
   - Warm-light `/app` palette (Vercel/Linear conceded from dark)
   - Fraunces + Georgia + Courier Prime typography (Bencium conceded from 3-face mixed stack)
   - 420/340ms easeOutExpo `cubic-bezier(0.16, 1, 0.3, 1)` (Frontend-Design conceded from 520ms)
   - Scroll-triggered, not scroll-linked (Motion Craft held)
   - SCB stamp as signature moment (Motion Craft's constellation fan-out demoted to supporting)
   - Physics chip toy rejected (21st.dev conceded — shifted to hoverable choropleth at Render)
   - 4 separate sticky scenes, not 1 sticky card (Vercel/Linear's card pattern rejected as feature-list pattern, wrong for causal pipeline)

Orchestrator call on 3 residual splits: 4 scenes / YES hoverable choropleth / NO misregistration.

The rocket.new Rive inspection came AFTER the debate and validated the 4-stage architecture directly (rocket.new literally does 4 scroll-triggered stages via their own Rive state machine — confirming Motion Craft's "ideas snap" doctrine was correct).

---

## Next step when resuming

Run `/build` with this spec as the contract input. Skip clarify (already done via debate). Go straight to refined contract → plan → build.
