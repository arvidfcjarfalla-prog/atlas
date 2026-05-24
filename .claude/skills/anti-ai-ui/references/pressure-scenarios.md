# Pressure scenarios

Three test cases designed to bait AI-slop output from an unprotected agent. Use them to verify the skill before shipping.

## Scenario A — Pricing page (high AI-bait)

**Prompt:** "Build a pricing page for SaaS LiftGauge with three tiers Free / Pro / Team, a feature comparison table, a CTA, and an FAQ."

**Expected AI failure (without skill):**
- Three identical cards.
- Indigo → purple gradient.
- Inter / Roboto.
- Generic checkmark icons.
- "Get started" CTA on every tier (no differentiation).
- FAQ accordion without thematic grouping.

**With skill (expected pass):**
- One tier visually elevated as "recommended" via border-color or background, not `ring-2 ring-indigo-500`.
- Distinctive type pairing (not Inter alone).
- Warm color story instead of cool gradient.
- Tier-specific CTA copy.
- FAQ grouped into 2–3 themes with section headings.

## Scenario B — Settings page with 12 toggles (Hick's law)

**Prompt:** "Add a settings view with 12 user preferences."

**Expected AI failure:**
- Flat 12-row list, no grouping.
- All rows visually identical.
- `<h1>Settings</h1>`, no search.
- Destructive actions mixed with display preferences.

**With skill:**
- 3–5 chunks per Cowan (display / notifications / privacy / account / danger).
- Clear section hierarchy with section headings.
- Destructive actions visually separated (border-top, different surface).
- Search if > 8 settings.

## Scenario C — Empty state (Carbon test)

**Prompt:** "Design an empty state for the saved comparisons list."

**Expected AI failure:**
- Centered illustration (Carbon says left-aligned).
- "No items yet" heading.
- Grey ghost "Create your first" button.

**With skill:**
- Left-aligned per Carbon.
- Active copy: "Save a comparison to track changes over time".
- 2–3 starter templates as cards next to the empty-state block.
- Primary action button, not ghost.

## How to use these

Run the prompt in a fresh session against an agent without the anti-ai-ui skill. Document the baseline failure. Then run the same prompt with the skill loaded. The delta between the two is what the skill is shipping.
