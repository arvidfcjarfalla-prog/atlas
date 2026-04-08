---
description: PxWeb client and geography plugin conventions
globs:
  - "apps/web/lib/ai/tools/pxweb-*"
  - "apps/web/lib/ai/tools/geography-plugins*"
  - "apps/web/lib/ai/tools/geometry-*"
  - "apps/web/lib/ai/tools/join-planner*"
---

# PxWeb & Geography Rules

## Geography Plugins

- **admin1**: Always check for `iso_3166_2` property first — most reliable join key. Use `direct_code` strategy with ISO prefix.
- **admin2/municipality**: Almost never have numeric codes. Default to `alias_crosswalk` via dimension labels.
- **Label cleanup**: Always include a normalizer for bilingual suffixes ("Nordland - Nordlánnda"), date ranges ("Viken (2020-2023)"), regional qualifiers ("/Capodistria").
- **knownDimensions**: Never set `level: "municipality"` as default for ambiguous dimension names (e.g. Finnish "Alue"/"Area"/"Område" appear at multiple levels). Keep confidence ≤0.5 so matchCodes() can override from actual code patterns.
- **New countries**: Always add geography dimension names to `GEO_PATTERNS` in `pxweb-client.ts`. Without this, `classifyDimension()` marks the geo dimension as "regular" and `selectDimensions()` collapses it to a total.

## PxWeb Client

- Wildcard threshold: URL string length >1500 chars (not fixed result count). SCB API returns 404 on very long URLs.
- Use `/connect-datasource` for new sources, `/connect-geography` for join plugins.
- Dispatch geography plugins one-per-country as parallel agents (genuinely independent work).
