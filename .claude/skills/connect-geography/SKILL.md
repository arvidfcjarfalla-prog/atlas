---
name: connect-geography
description: Build geography plugins for new countries so PxWeb/SDMX data joins to map geometry. Reads geometry files + API responses, generates a plugin following the Norway SSB pattern. Use when saying "geography plugin", "connect geometry", "ny geo-plugin", or "lägg till land".
triggers:
  - /connect-geography
  - geography plugin
  - connect geometry
  - ny geo-plugin
  - lägg till land
  - add country geometry
---

# Connect Geography

Build a GeographyPlugin for a new country so data from its statistical API can join to map geometry.

## Prerequisites

Read these files before starting:
1. `apps/web/lib/ai/tools/geography-plugins.ts` — interface + existing plugins (Sweden SCB, Norway SSB, Denmark DST are the templates)
2. The country's geometry file: `apps/web/public/geo/{iso2}/admin1.geojson` (or municipalities.geojson if available)
3. The country's PxWeb API response (one table with regional data) to understand dimension naming and code formats

## Research phase (mandatory before writing code)

For each country, the agent MUST gather:

### 1. Geometry properties
Read the GeoJSON file and extract:
- What properties exist on features? (name, iso_3166_2, admin_code, etc.)
- What are the feature names? (English? Local language? Both?)
- How many features? (this determines if it's admin1 or municipality level)

```bash
# Example: inspect Estonia geometry
node -e "const g=require('./apps/web/public/geo/ee/admin1.geojson'); console.log(g.features[0].properties); console.log('count:', g.features.length)"
```

### 2. PxWeb dimension naming
Fetch a table listing and a sample table's metadata from the API:
- What is the geography dimension called? ("Region", "Område", "Area"?)
- What do region codes look like? (2-digit, 4-digit, ISO-style?)
- Do codes match geometry properties directly or need mapping?

```bash
# Example: fetch Estonia PxWeb table metadata
curl -s "https://andmed.stat.ee/api/v1/en/stat/RV/RV04/RV042/RV0422.px" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).variables?.map(v=>({code:v.code,text:v.text,values:v.values?.slice(0,5)}))))"
```

### 3. Code mapping
Determine the join strategy:
- **direct_code**: source codes match geometry property exactly (e.g., FIPS codes)
- **alias_crosswalk**: source codes map to geometry names via lookup table
- **label_match**: source labels match geometry names (fragile, last resort)

## Learned patterns (from Iceland, Estonia, Slovenia builds)

These patterns were discovered empirically. Use them to skip research for common cases.

### Geometry property patterns
| Property | Found in | Meaning |
|---|---|---|
| `iso_3166_2` | Almost all admin1 files | **Best join key** — use `direct_code` strategy with ISO prefix (e.g., "IS-1", "EE-44", "SI03") |
| `name` | All files | Fallback — use `alias_crosswalk` or `label_match`. Unreliable for non-English names. |
| `admin_code` | Some admin2 files | Numeric code — check if it matches PxWeb codes directly |
| (no numeric code) | Most admin2/municipality files | **Common case** — must use label crosswalk. This is the norm, not the exception. |

### PxWeb dimension naming
| Language | Region dimension name | Municipality dimension name |
|---|---|---|
| English | "Region" | "Municipality" |
| Icelandic | "Landshluti" | "Sveitarfélag" |
| Estonian | "Maakond" | "Omavalitsus" |
| Slovenian | "Kohezijska regija" / "Statistična regija" | "Občine" |
| Norwegian | "Region" | "Region" (disambiguated by code pattern) |
| Swedish | "Region" | "Kommun" |

### Code format patterns
| Country | Admin1 codes | Join strategy |
|---|---|---|
| Iceland | Single digit "1"–"8" | Prefix with "IS-" → match `iso_3166_2` |
| Estonia | 2-digit EHAK "37"–"87" | Hardcoded crosswalk to ISO (EHAK ≠ ISO suffix) |
| Slovenia | NUTS1 "SI03"/"SI04" or NUTS3 "SI011"–"SI044" | Direct match on `iso_3166_2` |
| Norway | 2-digit "03"–"56" | Crosswalk to county names |
| Sweden | 2-digit SCB "01"–"25" | Crosswalk to county names or `scb_code` |

### Key insight: admin2 almost never has numeric codes
Municipality/admin2 geometry files typically only have `name`. This means:
- Municipality-level join ALWAYS needs `alias_crosswalk` via dimension labels
- The PxWeb table's label (not code) must match the geometry feature name
- A label cleanup normalizer is usually needed (strip parenthetical suffixes, bilingual labels)

## Plugin structure

Follow the Norway SSB plugin pattern exactly. Each plugin exports:

```typescript
export const {country}Plugin: GeographyPlugin = {
  id: "pxweb-{iso2}-{agency}",
  name: "{Country} {Agency} (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) { /* match by sourceId or countryHints */ },
  matchCodes(codes, dimension) { /* recognize code patterns */ },
  knownDimensions() { /* return dimension ID → level mappings */ },
  joinKeyFamilies() { /* return source→target code family mappings */ },
  aliasNormalizers() { /* return code transformation functions */ },
  knownTables() { /* optional: hardcoded table IDs for common topics */ },
};
```

## Registration

After creating the plugin, add it to the `ALL_PLUGINS` array at the bottom of `geography-plugins.ts`:

```typescript
export const ALL_PLUGINS: GeographyPlugin[] = [
  swedenScbPlugin,
  norwaySsbPlugin,
  denmarkDstPlugin,
  // ... existing plugins
  {country}Plugin,  // ← add here
];
```

## Verification

1. `pnpm typecheck` — must pass
2. `pnpm test` — must pass (especially geography-plugins.test.ts)
3. Manual: fetch one regional table from the API, check that codes match geometry properties

## Batch mode

When adding plugins for multiple countries, use `/subagent-tasks`:
- One agent per country
- Each agent reads: this skill + Norway plugin (template) + the country's geometry file + one API response
- Agents work independently — no inter-country dependencies

## Key files

| File | Purpose |
|---|---|
| `apps/web/lib/ai/tools/geography-plugins.ts` | Plugin interface + all plugins |
| `apps/web/public/geo/{iso2}/admin1.geojson` | Country admin1 boundaries |
| `apps/web/public/geo/{iso2}/municipalities.geojson` | Municipality boundaries (if available) |
| `apps/web/lib/ai/tools/geography-detector.ts` | Generic detector (plugins enrich, not replace) |
| `apps/web/lib/ai/tools/join-planner.ts` | Join strategy selection |

## Rules

- NEVER bypass the generic detector — plugins only ENRICH detection
- ALWAYS include `matchCodes` — this is how the detector recognizes the country's codes
- ALWAYS include `aliasNormalizers` if codes don't directly match geometry properties
- Prefer `direct_code` join strategy over `alias_crosswalk` over `label_match`
- Include `knownTables` only if the country's PxWeb search is known to be unreliable
