# Adding a Data Source to Atlas

Reference for connecting new statistical APIs. Three tracks based on API type.

## Track A: PxWeb Source (Nordic/European statistical agencies)

**When:** Agency uses PxWeb API (v1 or v2). Check: `{baseUrl}/api/v1/en` or `{baseUrl}` returns table navigation JSON.

**Steps:**
1. Add entry to `OFFICIAL_STATS_REGISTRY` in `global-stats-registry.ts`
2. Set `apiType: "pxweb"`. The existing adapter handles v1 and v2 automatically.
3. Set `canaryQuery: { table: "<known-table-id>", query: "<search-term>" }`
4. Done — `getStatsAdapter()` already routes PxWeb sources.

**Registry entry shape:**
```ts
{
  id: "xx-agency",              // ISO-2 lowercase + agency abbreviation
  countryCode: "XX",            // ISO-2 uppercase, null for international
  countryName: "Country",
  agencyName: "Full Agency Name",
  baseUrl: "https://...",       // API root (no trailing slash)
  docsUrl: "https://...",       // Optional: link to API docs
  apiType: "pxweb",
  accessLevel: "official_api",
  auth: "none",                 // "none" | "api_key" | "oauth"
  formats: ["json", "json-stat", "csv"],
  languages: ["en"],
  coverageTags: ["population", "economy", "labor"],  // from: population, economy, labor, health, education, housing, environment, energy, transport, agriculture, regions, prices, trade, crime, justice, sdg, social
  geographyLevels: ["country", "region", "municipality"],
  verificationStatus: "provisional",
  priority: 80,                 // 78-100, higher = preferred
  canaryQuery: { table: "TAB001", query: "population" },
}
```

## Track B: SDMX Source

**When:** Agency uses SDMX REST API. Check: `{baseUrl}/dataflow` returns SDMX-JSON structure.

**Steps:**
1. Add `SdmxAgencyConfig` to `sdmx-client.ts` (see existing BIS_CONFIG, ABS_CONFIG, ECB_CONFIG)
2. Add config to `SDMX_CONFIGS` record in same file
3. Add registry entry in `global-stats-registry.ts` with `apiType: "sdmx"`
4. Done — `getStatsAdapter()` routes via `SDMX_CONFIGS[source.id]`

**SdmxAgencyConfig shape:**
```ts
{
  id: "xx-agency",                    // must match registry entry id
  baseUrl: "https://...",
  dataflowUrl: "https://.../dataflow",
  dataUrlTemplate: "https://.../data/{flow}",  // {flow} replaced at runtime
  acceptHeader: "application/json",
  geoDimensionIds: ["REF_AREA"],      // agency-specific geo dimension names
  timeDimensionIds: ["TIME_PERIOD"],
  keywords: { "gdp": "FLOW_ID", "unemployment": "FLOW_ID" },
}
```

## Track C: REST API Source (custom adapter needed)

**When:** Unique REST API (Census Bureau, BLS, FRED, etc.). No existing adapter fits.

**Steps:**
1. Add registry entry with `apiType: "rest"` in `global-stats-registry.ts`
2. Implement `StatsApiAdapter` in a new section of `pxweb-client.ts` or a dedicated file
3. Wire adapter in `getStatsAdapter()` with `if (source.id === "xx-agency") return myAdapter;`
4. Add unit test for the adapter's `searchTables` and `fetchData`

**StatsApiAdapter interface:**
```ts
interface StatsApiAdapter {
  searchTables(baseUrl: string, query: string, lang: string, pageSize?: number): Promise<PxTableInfo[]>;
  fetchMetadata(baseUrl: string, tableId: string, lang: string): Promise<PxTableMetadata | null>;
  fetchData(baseUrl: string, tableId: string, selections: PxDimensionSelection[], lang: string): Promise<PxJsonStat2Response | null>;
}
```

## NOT supported: Portal sources

Sources with `apiType: "portal"` have no programmatic API. They exist in the registry for agency-hint UX only. Do NOT write adapters for portal sources.

## Verification

After adding a source, verify:
1. `pnpm typecheck` passes
2. `canaryQuery` returns data (manual: run search query against the API)
3. Geography join produces >40% coverage on a reference query (if applicable)

Once verified, change `verificationStatus` from `"provisional"` to `"verified"`.

## Geography considerations

If the source covers a country not yet in `geography-plugins.ts`, the data will fetch but geometry joins may fail. Check `public/geo/` for available geometries. New country geometries are a separate task.
