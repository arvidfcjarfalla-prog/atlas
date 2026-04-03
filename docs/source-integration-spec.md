<!-- last-reviewed: 2026-04-03 -->
# Source Integration Spec — Atlas

> Research + systemkartläggning + implementeringsspec.
> Produced 2026-04-02. Updated 2026-04-03 with extended source research + crosswalk tables.
> Read-only analysis — no runtime changes.

**Related files:**
- `apps/web/lib/ai/tools/crosswalks/` — 15 static JSON crosswalk tables (built from this spec)
- `apps/web/lib/ai/tools/DATA_SOURCE_RESEARCH.md` — Detailed API research for ~50 sources

---

## 1. Nuvarande Atlas Source-Arkitektur

### 1.1 Pipeline Overview

```
User prompt
  → Intent classification (Haiku)
  → Source resolution waterfall (clarify/route.ts)
      → SourceAdapter.fetch() → NormalizedSourceResult
      → Geography detection (geography-detector.ts)
      → Join planning (join-planner.ts)
      → Join execution (geometry-join.ts)
      → Cache write (data-search.ts)
      → Artifact write (dataset-storage.ts)
  → Deterministic path OR AI generation
  → MapManifest → MapLibre
```

### 1.2 Centrala filer

| Fil | Roll |
|---|---|
| `clarify/route.ts` | Huvudorkestrering — waterfall, caching, logging |
| `source-adapter.ts` | Universal adapter-kontrakt + PxWeb-normalisering |
| `normalized-result.ts` | Layer 1-typer: `NormalizedSourceResult`, `NormalizedDimension`, `NormalizedRow`, `GeographyLevel`, `CodeFamily` |
| `data-search.ts` | Tvålagercache (memory 1h + Supabase 24h), `getCachedData`, `setCache` |
| `pxweb-client.ts` | PxWeb API-klient, tabellsökning, dimensionsval |
| `pxweb-resolution.ts` | Multi-table pipeline med retry |
| `worldbank-client.ts` | World Bank indikator-adapter |
| `eurostat.ts` | Eurostat SDMX-adapter |
| `sdmx-client.ts` | Generisk SDMX REST-klient (BIS, ABS, OECD definierade men otestade) |
| `data-commons.ts` | Data Commons-adapter |
| `overpass.ts` | OSM Overpass-adapter (POI) |
| `web-dataset-search.ts` | Websök efter externa dataset |
| `web-research.ts` | Websök efter entiteter |
| `geography-detector.ts` | Universell geo-detektion: kodform, kardinalitet, pluginenrichment |
| `join-planner.ts` | Join-strategival: direct_code, alias_crosswalk, normalized_name, fuzzy_name, inline, none |
| `geometry-registry.ts` | Boundary layer-katalog (20+ entries: NE, Eurostat GISCO, SE, NO, FI, DK, IS, EE, LV, LT, SI, CH, US) |
| `geometry-loader.ts` | Hämtar geometri (api_route, cdn_url, local_file) |
| `geometry-join.ts` | Utför join: data × geometri → features med `_atlas_*` properties |
| `geography-plugins.ts` | Plugin-interface + 13 plugins (SE, NO, FI, DK, IS, EE, LV, LT, SI, CH, Eurostat, US FIPS, PxWeb generic) |
| `deterministic-manifest.ts` | No-AI choropleth: polygon + `_atlas_value` → manifest, 0 tokens |
| `resolution-memory.ts` | Lärande: sparar framgångsrika source+table-kombinationer |
| `resolution-logger.ts` | Loggar resolution_sessions + resolution_attempts till Supabase |
| `global-stats-registry.ts` | Read-only katalog: officiella sources per land/topic |
| `dataset-registry.ts` | Persistent webdataset-registry |
| `official-stats-resolver.ts` | Rankar sources per land/topic |
| `intent-classifier.ts` | Haiku-routing: statistics, poi, entity_search, general |
| `dataset-storage.ts` | Artifact-persistering, fingerprint, content hash |

### 1.3 Resolution Waterfall (exakt ordning)

```
1. Cache check           → getCachedData()
2. Historical resolution → resolution-memory
3. Data catalog          → dataset-registry
4. Overpass              → queryOverpass() (om POI-intent)
5. Entity search         → (om entity_search-intent)
6. PxWeb                 → resolvePxWeb() med multi-table loop
7. Data Commons          → searchDataCommons()
8. Eurostat              → searchEurostat()
9. World Bank            → searchPublicData()
10. Dataset registry     → checkRegistry()
11. Web research         → searchWebResearch()
12. Web dataset search   → searchWebDatasets()
13. Agency hint          → agency_hint UX
14. Tabular fallback     → tabular-only resultat
15. AI clarification     → shouldAsk gate → fråga användaren
```

### 1.4 Universal Adapter Contract

```typescript
interface SourceAdapter {
  readonly family: AdapterFamily;  // "pxweb" | "public_api" | "csv" | "overpass" | "geojson"
  readonly name: string;
  fetch(prompt: string, context: AdapterContext): Promise<NormalizedSourceResult>;
}

interface NormalizedSourceResult {
  adapterStatus: "ok" | "no_data" | "no_geo_dimension" | "error";
  dimensions: NormalizedDimension[];       // geo, time, metric, filter
  rows: NormalizedRow[];                   // { dimensionValues: {dimId: code}, value: number|null }
  candidateMetricFields: string[];
  countryHints: string[];                  // ISO codes
  geographyHints: GeographyLevel[];
  sourceMetadata: SourceMetadata;          // sourceId, sourceName, tableId, fetchedAt
  diagnostics: QueryDiagnostics;           // originalPrompt, searchQuery, warnings
  confidence: number;                      // 0.0–1.0
  cacheKey?: string;
  profile?: DatasetProfile;
  candidates?: DatasetCandidate[];
  error?: string;
}
```

### 1.5 Vad som fungerar bra

1. **Tydlig separation**: Adapters hämtar+normaliserar. Detector analyserar geografi. Planner väljer join-strategi. Executor joinar. Pipeline orkestrerar.
2. **Universellt kontrakt**: Alla sources returnerar `NormalizedSourceResult`. Ny source = ny adapter, resten av pipelinen funkar.
3. **Plugin-extensibility**: 13 geography plugins lägger till domänkunskap utan att hårdkoda. Plugins bidrar med code matchers, known dimensions, alias normalizers.
4. **Deterministisk fast path**: Polygon + `_atlas_value` → choropleth utan AI, <1s, 0 tokens.
5. **Lärande**: `resolution-memory` sparar framgångsrika kombinationer för framtida reuse.

### 1.6 Vad som är splittrat, duplicerat eller inkonsekvent

1. **Confidence scoring uppfinns om i 4 steg** — adapter (0.7 bas), detector (shape match), planner (join strategy score), executor (coverage ratio). Ingen unified modell.
2. **Geografisk nivå-inferens spridd** — `pxweb-client.ts:extractGeoLevelHint()`, `source-adapter.ts:inferPxGeographyHints()`, `geography-detector.ts:inferLevelFromCodeShape()`. Tre separata logiker.
3. **Cache-nyckelgenerering ad hoc** — varje source uppfinner sin egen MD5-hash. Ingen standardiserad fingerprint.
4. **5 separata statushierarkier** — `AdapterResultStatus` (4 värden), `DetectionResult.renderHint` (3), `JoinStrategy` (6), `JoinExecutionStatus` (3), `AttemptStatus` (7). Oklart samband.
5. **Source-lookup duplicerat** — `global-stats-registry.ts`, `dataset-registry.ts`, `resolution-memory.ts`. Ingen unified "ranked candidate list".
6. **Code matching-logik repeterad** — `classifyCodeShape()` i detector, plugin `matchCodes()` i varje plugin. Inget delat scoring-ramverk.

### 1.7 Halvimplementerat eller dött

1. **SDMX-klient** — `sdmx-client.ts` finns, BIS/ABS/OECD definierade, men otestade. Ingen plugin eller integration.
2. **Fuzzy name join** — definierad i `JoinStrategy` men hard-rejected i `geometry-join.ts:UNSUPPORTED_STRATEGIES`.
3. **Custom polygon** — `GeographyLevel` inkluderar "custom_polygon", `CodeFamily` har `{ family: "custom" }`, men `geometry-loader.ts` rejectar `loaderType: "generated"`.
4. **Timeline/temporal** — `NormalizedDimension` har role="time", men deterministisk manifest-generator säger "timeline not supported yet".
5. **DatasetProfile.geometry** — fältet finns men läses/valideras aldrig.

### 1.8 Blockerare för nya sources

1. **Ingen quick-start-mall** — ny source kräver att man förstår hela kontraktet, dimensionsklassificering, confidence-beräkning.
2. **Multi-table loopen är PxWeb-specifik** — `resolvePxWeb()` kan inte återanvändas för andra sources.
3. **Adapter har ingen kontroll över join-strategi** — om geometry registry saknar matchande property, faller join planner tillbaka till fuzzy_name (rejected).
4. **Inga integrationstester för nya sources** — testning kräver full pipeline.
5. **Ingen programmatisk source-registrering** — kräver hand-edit av JSON + plugin-entry + hardcoded tables.

---

## 2. Source-by-Source Research

### 2.1 PxWeb

**Status i Atlas:** Primär source. Fullt integrerat med multi-table pipeline, 13 country plugins, v2-stöd för SCB och SSB.

#### API

| | |
|---|---|
| Docs | https://www.pxtools.net/PxWebApi/documentation/user-guide/ |
| Auth | Ingen. Öppen data. |
| Rate limits | Per-instance konfigurerat. HTTP 429 vid throttle. |
| Format | REST GET/POST. JSON-stat v2 (default), CSV, PX, XLSX, Parquet. |
| Pagination | `pageSize` + `pageNumber` för `/tables`. Data ej paginerat. |

**v1 vs v2:** SCB och SSB har v2. Finland, Island, Estland, Lettland, Slovenien har fortfarande v1. Helt olika endpoint-syntax och query-modell.

**v2 selection expressions:** `*`, `?`, `top(n)`, `bottom(n)`, `range(a,b)`, `from(a)`, `to(a)`. Kombinerbara.

**v2 codelists:** `vs_`-prefix = valueset, `agg_`-prefix = gruppering. Kritiskt för geografisk filtrering — t.ex. `codelist[Region]=vs_Kommuner` för att bara få kommuner ur en blandad Region-dimension.

**Kritiska gotchas:**
- URL-gräns ~2100 tecken → 404 (inte 400). Använd POST eller `*` wildcard.
- `elimination: false`-variabler (tid, contents) MÅSTE selekteras.
- Danmark (DST) har ett helt separat custom API (`api.statbank.dk/v1`), inte PxWeb.
- Finland har dubbla kommunkoder: gamla `091` och nya `KU091` — samexisterar i olika tabeller.
- Norges fylkesreform 2024 — nya fylkeskoder. `agg_Fylker2024` krävs för korrekta joins mot aktuella gränser.

#### Normalisering

JSON-stat v2 → `NormalizedSourceResult`:
- `_atlas_code` ← Region-dimensionens category index key (t.ex. `"0180"`)
- `_atlas_value` ← flat value-array, avkodad via dimension-size-produkt
- `_atlas_metric_label` ← ContentsCode category label
- `_atlas_unit` ← `extension.unit[contentsCode].base`
- `_atlas_time` ← Tid-dimensionens label

Source-specifika transformationer: decode flat array med dimension-indexering, null-check (suppressed celler), strip parentetiska suffix från labels.

#### Joinability

| Instans | Land | Län/County | Kommun |
|---|---|---|---|
| SCB (Sverige) | robust-direct (hardcoded ISO) | robust-crosswalk (SCB→NUTS3) | **robust-direct** (4-siffrig kod) |
| SSB (Norge) | robust-direct | robust-direct (2-siffrig fylkeskod) | **robust-direct** (4-siffrig kommunenummer) |
| StatFin (Finland) | robust-direct | robust-crosswalk (maakunta→NUTS3) | **robust-direct** (KU-prefix) |
| DST (Danmark) | robust-direct | robust-direct (3-teckens regionkod) | **robust-direct** (3-siffrig kommunekod) |
| Island | robust-direct | label-based (liten risk) | label-based |
| Estland/Lettland/Slovenien | robust-crosswalk | label-based | label-based / impractical |

**Rekommendation:** SCB och SSB kommuner = happy path. Finland KU-koder = stöd. DST = stöd via crosswalk. Island/Baltikum = varna.

---

### 2.2 Eurostat / SDMX

**Status i Atlas:** Integrerat via `eurostat.ts` + `sdmx-client.ts`. Använder Haiku för att tolka prompts. Returnerar NUTS0 (country level). NUTS2/NUTS3 ej implementerat.

#### API

| | |
|---|---|
| Docs | https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access |
| Auth | Ingen. |
| Rate limits | Ej publicerade. Implementera caching + backoff på 503. |
| Format | 3 API:er: Statistics API (JSON-stat v2), SDMX 2.1, SDMX 3.0. |

**Tre API:er:**
1. Statistics API: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{datasetCode}` — enklast, JSON-stat v2
2. SDMX 2.1: nyckelbaserad query med punkt-separerade dimensionsvärden
3. SDMX 3.0: `c[GEO]=...` filter — ergonomisk, rekommenderas för ny kod. `geoLevel=nuts2` filter.

**Dataset naming:** `DEMO_R_*` (R = Regional) = NUTS-baserade. Utan `_R_` = country-level only.

**Kritiska gotchas:**
- GEO-dimensionen blandar länder, NUTS1, NUTS2, NUTS3 och EU/EEA-aggregat i samma response. Måste filtreras.
- NUTS-versionsblandning: 2006, 2010, 2013, 2016, 2021. Samma dataset kan ha koder från olika versioner i tidsserier.
- UK-data (UK*) saknas efter 2020 i de flesta indikatorer (Brexit).
- LAU (kommuner) finns som separat dataset, inte via standard SDMX.

#### Joinability

| Nivå | Tillförlitlighet | Anmärkning |
|---|---|---|
| Country (NUTS0) | **robust-direct** | ISO2 = NUTS0 |
| NUTS1 | **robust-direct** | Stabila inom NUTS-version |
| NUTS2 | **robust-direct** | Stabila inom NUTS-version |
| NUTS3 | **robust-direct** | Några ändringar mellan versioner |
| LAU (kommun) | robust-crosswalk | Separat LAU→NUTS crosswalk-fil |

**Primär risk:** NUTS-versionsmismatch. Behöver version-crosswalk-tabell (Eurostat publicerar `NUTS2016-NUTS2021.xlsx`).

**Rekommendation:** NUTS2 och NUTS3 som primära Europa-choropleth-nivåer. Pinna NUTS-version per dataset. Bundla version-crosswalk i Atlas.

---

### 2.3 World Bank

**Status i Atlas:** Integrerat via `worldbank-client.ts` + `data-search.ts`. 40+ indikatorer. Returnerar country-level GeoJSON med world admin0.

#### API

| | |
|---|---|
| Docs | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392 |
| Auth | Ingen. |
| Rate limits | Liberala. |
| Format | REST GET. Custom JSON array. |
| Base URL | `https://api.worldbank.org/v2` |

**Response:** 2-element JSON array: `[0]` = pagination metadata, `[1]` = data array. `per_page=300` för att minska sidantal.

**Kritiska gotchas:**
- Response inkluderar regionala aggregat (EAS, LCN, ARB etc.) blandat med länder. Blocklista behövs.
- `value: null` = saknad data. Behandla aldrig som 0.
- `unit`-fältet är oftast tom sträng — enheter bara i indicator metadata.
- `EN.ATM.CO2E.PC` är ARKIVERAD — använd `EN.GHG.CO2.PC.CE.AR5` (redan fixat i Atlas).
- `mrnev=1` triggar intermittent XML-response. Atlas har XML-guards.
- Subnational data finns INTE i standard Indicators API.

#### Joinability

| Nivå | Tillförlitlighet |
|---|---|
| Country | **robust-direct** (ISO3 via `countryiso3code`) |
| Subnational | **impractical** (inget API) |

**Rekommendation:** Country-level only. ISO3 direkt-join. Filtrera aggregat-koder.

---

### 2.4 Data Commons

**Status i Atlas:** Integrerat via `data-commons.ts`. Använder catalog-sökning.

#### API

| | |
|---|---|
| Docs | https://docs.datacommons.org/api/rest/v2/ |
| Auth | API-nyckel krävs. Gratis från https://apikeys.datacommons.org |
| Rate limits | Ej publicerade. Moderat. |
| Format | REST GET/POST. Djupt nästlad JSON. |

**Key endpoints:** `/v2/observation` (data), `/v2/resolve` (extern ID → DCID), `/v2/node` (grafutforskning).

**Kritiska gotchas:**
- DCID-format inkonsekvent: `country/SWE` vs `geoId/06` vs `wikidataId/Q1159`. Ingen enhetlig format.
- Multi-source: samma variabel har flera `orderedFacets` från olika källor (WB, UN, Census). Använd `facets[0]`.
- Variabelnamn är långa: `Amount_EconomicActivity_GrossNationalIncome_PurchasingPowerParity_PerCapita`.
- Tunn täckning utanför US/Europa.

#### Joinability

| Nivå | Tillförlitlighet |
|---|---|
| Country | robust-crosswalk (DCID→ISO3 via `/v2/resolve`) |
| US States | robust-crosswalk (DCID→FIPS) |
| US Counties | robust-crosswalk (DCID→FIPS5) |
| EU NUTS | robust-crosswalk (nutsCode property) |
| Övrig admin1/2 | label-based eller impractical |

**Rekommendation:** Country-level globalt + US states/counties. EU = använd Eurostat direkt. Bygg DCID→ISO3 resolution table vid startup, cacha.

---

### 2.5 Overpass / OSM

**Status i Atlas:** Integrerat via `overpass.ts`. POI-queries (amenities, infrastruktur). Returnerar punkt-features.

#### API

| | |
|---|---|
| Docs | https://wiki.openstreetmap.org/wiki/Overpass_API |
| Auth | Ingen. |
| Rate limits | Slot-baserat: max 2 samtida queries per IP. |
| Format | POST. OSM JSON (INTE GeoJSON). Kräver osmtogeojson-konvertering. |

**Kritiska gotchas:**
- `admin_level` är landsspecifikt: level 7 i Sverige = kommun, i Tyskland = Gemeindeverbände.
- OSM-data har ingen statistik — bara geometri + crowd-sourced taggar.
- Relation-geometri är komplex (outer/inner rings). `osmtogeojson` hanterar det.
- Boundary-queries returnerar enorma responses (50-200MB för alla kommuner i ett land).

#### Joinability

| Nivå | Tillförlitlighet |
|---|---|
| Country | robust-direct (`ISO3166-1` tag) |
| Admin1 | robust-crosswalk (`ISO3166-2` om taggad) |
| Admin2/Kommun | spatial-join eller label-based |

**Rekommendation:** Använd INTE som statistisk källa. Använd för:
- Geometry acquisition (gränser som saknas i standard-filer)
- POI-data (amenity density maps)
- Bättre alternativ för gränser: Geofabrik admin boundary shapefiles.

---

### 2.6 UN SDG API

**Status i Atlas:** Ej integrerat.

#### API

| | |
|---|---|
| Docs | https://unstats.un.org/sdgs/files/SDMX_SDG_API_MANUAL.pdf |
| Auth | Ingen. |
| Rate limits | Ej publicerade. Konservativ användning. |
| Format | SDMX REST. SDMX-JSON. |
| Base URL | `http://data.un.org/WS/rest/data/` |
| Dataflow | `IAEG-SDGs,DF_SDG_GLH,1.0` |

**Kritiska gotchas:**
- Använder M49-koder (UN), INTE ISO3. Crosswalk krävs.
- Data-coverage extremt ojämn. Tier 1-indikatorer har bred täckning; Tier 3 kan ha <20 länder.
- SDG-indikatornummer (1.1.1) mappar till series-koder (SI_POV_DAY1) — ej intuitivt.
- SDMX-JSON kräver komplex position-index-avkodning.

#### Joinability

| Nivå | Tillförlitlighet |
|---|---|
| Country | robust-crosswalk (M49→ISO3 via UNSD-tabell) |
| Subnational | impractical |

**Rekommendation:** Country-level only. Bundla M49→ISO3 crosswalk. Varna om tunn täckning (<50 länder med data). Nischvärde: SDG-specifika indikatorer som saknas i WB/Eurostat.

---

### 2.7 OECD

**Status i Atlas:** `sdmx-client.ts` har OECD-config definierad men otestad. Ingen integration.

#### API

| | |
|---|---|
| Docs | https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html |
| Auth | Ingen. |
| Rate limits | **20 queries/minut per IP.** Signifikant begränsning. |
| Format | SDMX REST. SDMX-JSON. |
| Base URL | `https://sdmx.oecd.org/public/rest` |

**OBS:** Gamla `stats.oecd.org` avvecklades permanent 2024-07-01.

**Kritiska gotchas:**
- Agency-identifierare är OECD-interna organisationsenheter (t.ex. `OECD.SDD.NAD`), inte bara `OECD`.
- Dimension key-ordning är DSD-specifik. Måste hämta DSD före query-konstruktion.
- `lastNObservations` blockerat för stora dataset (TiVA, CRS) sedan oktober 2025.
- TL2/TL3-regionkoder ≠ NUTS2/NUTS3 för Belgien, Frankrike, Tyskland, UK.

#### Joinability

| Nivå | Tillförlitlighet |
|---|---|
| Country | **robust-direct** (ISO3 i `REF_AREA`) |
| TL2 (EU) | robust-crosswalk (TL2→NUTS2, ~90% match) |
| TL2 (icke-EU) | robust-crosswalk (TL2→nationella admin1-koder via OECD-tabell) |
| TL3 | robust-crosswalk (EU) / label-based (icke-EU) |

**Rekommendation:** Country-level = utmärkt, direkt ISO3. TL2/TL3 = stöd med crosswalk, dokumentera BE/FR/DE/UK-undantag. Rate limit kräver aggressiv caching.

---

## 3. Joinability — Sammanfattande Matris

### 3.1 Tillförlitlighet per source × nivå

| Source | Country | Admin1/NUTS | Admin2/Kommun | Stad/Punkt |
|---|---|---|---|---|
| PxWeb (SCB, SSB) | robust-direct | robust-direct | **robust-direct** | n/a |
| PxWeb (Finland) | robust-direct | robust-crosswalk | robust-direct (KU) | n/a |
| PxWeb (Danmark) | robust-direct | robust-direct | robust-direct | n/a |
| PxWeb (Island/Baltikum) | robust-direct | label-based | label-based | n/a |
| Eurostat | robust-direct | **robust-direct** (NUTS) | robust-crosswalk (LAU) | impractical |
| World Bank | **robust-direct** | impractical | impractical | impractical |
| Data Commons | robust-crosswalk | robust-crosswalk (US) | robust-crosswalk (US) | label-based |
| Overpass/OSM | robust-direct | robust-crosswalk | spatial-join | spatial-join |
| UN SDG | robust-crosswalk (M49) | impractical | impractical | impractical |
| OECD | **robust-direct** | robust-crosswalk (TL) | label-based | impractical |

### 3.2 Happy Path per geografisk nivå

| Nivå | Bästa source | Join-strategi |
|---|---|---|
| Globalt land | World Bank → OECD → UN SDG | ISO3 direct |
| Europa NUTS2/3 | Eurostat | NUTS direct |
| Sverige kommun | PxWeb SCB | 4-siffrig SCB-kod direct |
| Norge kommun | PxWeb SSB | 4-siffrig kommunenummer direct |
| Finland kommun | PxWeb StatFin | KU-prefix direct |
| Danmark kommun | PxWeb DST | 3-siffrig kommunekod direct |
| US states/counties | Data Commons | FIPS direct |

### 3.3 Kritiska joinrisker

1. **NUTS-versionsmismatch (Eurostat):** Data från 2015 använder NUTS2013-koder; boundary-fil har NUTS2021. Löses med version-crosswalk.
2. **Norges fylkesreform 2024:** Historiska serier har gamla koder. Kräver `agg_Fylker2024` codelist.
3. **Finlands dubbla kommunkoder:** `091` vs `KU091` samexisterar. Detection måste hantera båda.
4. **Blandad Region-dimension (SCB):** Kommun + län i samma kolumn utan codelist-filtrering. Kräver `vs_Kommuner` / `vs_Lan`.
5. **World Bank aggregat:** EAS, LCN, ARB etc. blandat med länder. Blocklista.
6. **OECD TL ≠ NUTS:** BE, FR, DE, UK har dokumenterade avvikelser.
7. **M49 ≠ ISO3:** UN SDG kräver crosswalk, vissa territorier saknar ISO3.

---

## 4. Gemensamt Adapter-Kontrakt

### 4.1 Befintligt kontrakt (bra)

`NormalizedSourceResult` är redan ett starkt universellt kontrakt. Alla sources bör mappa till det.

### 4.2 Obligatoriska fält (ingen förändring)

```typescript
interface NormalizedSourceResult {
  adapterStatus: "ok" | "no_data" | "no_geo_dimension" | "error";
  dimensions: NormalizedDimension[];
  rows: NormalizedRow[];
  candidateMetricFields: string[];
  countryHints: string[];
  geographyHints: GeographyLevel[];
  sourceMetadata: SourceMetadata;
  diagnostics: QueryDiagnostics;
  confidence: number;
}
```

### 4.3 Föreslagna tillägg

```typescript
interface NormalizedSourceResult {
  // ... befintliga fält ...

  // NYTT: Explicit join-riktlinjer från adaptern
  joinHints?: JoinHint[];
}

interface JoinHint {
  geoDimensionId: string;           // Vilken dimension som har geo-koder
  codeFamily: CodeFamily;           // Kodsystem (iso, national, eurostat, fips, m49)
  level: GeographyLevel;            // Förväntad nivå
  confidence: number;               // Adapternas confidence i denna hint
  knownCrosswalks?: string[];       // T.ex. ["m49-to-iso3", "scb-to-nuts3"]
}
```

**Motivering:** Idag har adaptern ingen möjlighet att kommunicera join-information till planner utom via `geographyHints` (en ren nivålista) och `countryHints`. `JoinHint` låter adaptern säga "dessa koder är M49, använd m49-to-iso3 crosswalk" — istället för att geography-detector ska gissa.

### 4.4 Valfria fält (redan existerande, behöver dokumentation)

```typescript
// Dessa finns redan men saknar tydlig dokumentation:
cacheKey?: string;                  // Förberäknad cache-nyckel
profile?: DatasetProfile;           // Dataset-profil
candidates?: DatasetCandidate[];    // Alternativa tabeller/dataset
error?: string;                     // Felmeddelande
```

### 4.5 Hur joinbarhet ska uttryckas

Adaptern producerar:
1. `geographyHints: GeographyLevel[]` — förväntade nivåer
2. `countryHints: string[]` — ISO-koder
3. `joinHints: JoinHint[]` — explicit kodsystem + crosswalk-info (NYTT)

Detector använder:
1. Adapter-hints som input
2. Plugin-enrichment
3. Code shape analysis (fallback)

Planner använder:
1. Detector-output
2. Plugin joinKeyFamilies + aliasNormalizers
3. Geometry registry lookup

### 4.6 Coverage / confidence / geography-level

Redan implicit i kontraktet:
- `confidence: number` (0.0–1.0) — adaptens bedömning
- `geographyHints: GeographyLevel[]` — förväntad nivå
- Join coverage mäts i `geometry-join.ts` (min 50% för map_ready)

**Saknas:** Explicit coverage-uppskattning från adaptern. Lösning: låt `JoinHint.confidence` signalera förväntad coverage.

---

## 5. Exakta Kodändringar

### 5.1 Standardiserad cache-nyckel

**Problem:** Varje source uppfinner sin egen cache-nyckel med ad hoc MD5.

**Lösning:** Centraliserad `computeCacheKey()` i `normalized-result.ts`:

```typescript
export function computeCacheKey(result: NormalizedSourceResult): string {
  const canonical = {
    sourceId: result.sourceMetadata.sourceId,
    tableId: result.sourceMetadata.tableId ?? null,
    geoDim: result.dimensions.find(d => d.role === "geo")?.id ?? null,
    timeDim: result.dimensions.find(d => d.role === "time")?.values[0]?.code ?? null,
    metricDim: result.candidateMetricFields[0] ?? null,
    rowCount: result.rows.length,
  };
  return md5(JSON.stringify(canonical)).slice(0, 16);
}
```

**Filer att ändra:** `normalized-result.ts` (lägg till), `data-search.ts` (använd), `pxweb-resolution.ts` (ta bort ad hoc key).

### 5.2 Generaliserad multi-source resolution loop

**Problem:** `resolvePxWeb()` i `pxweb-resolution.ts` är PxWeb-specifik men innehåller generisk logik (detect → plan → join → evaluate).

**Lösning:** Extrahera den generiska loopen till `resolveFromNormalized()`:

```typescript
// Ny funktion i en ny fil: source-resolution.ts
export async function resolveFromNormalized(
  normalized: NormalizedSourceResult,
  plugins: readonly GeographyPlugin[],
): Promise<MapResolutionResult> {
  const detection = await detectGeographyWithPlugins(normalized, plugins);
  const plan = planJoinWithPlugins(detection, normalized.countryHints, plugins);
  if (!plan.mapReady) return { status: "tabular_only", ... };
  
  const geometry = await loadGeometry(plan.geometryLayerId!);
  const joinResult = executeJoin(plan, normalized.rows, geometry, ...);
  return joinResult;
}
```

**Filer att ändra:** Ny fil `source-resolution.ts`. `pxweb-resolution.ts` refaktoreras att använda den. `clarify/route.ts` kan använda den för alla sources.

### 5.3 JoinHint i adapter-kontraktet

**Filer att ändra:**
- `normalized-result.ts`: Lägg till `JoinHint` interface och `joinHints?` på `NormalizedSourceResult`
- `geography-detector.ts`: Läs `joinHints` som stark signal (väg högre än code shape analysis)
- `source-adapter.ts`: PxWeb-adaptern sätter `joinHints` baserat på plugin-kunskap

### 5.4 Eurostat NUTS-nivåstöd

**Problem:** Nuvarande `eurostat.ts` returnerar bara NUTS0 (country). Saknar NUTS2/NUTS3.

**Filer att ändra:**
- `eurostat.ts`: Lägg till `geoLevel` parameter, SDMX 3.0 `c[GEO]` filter
- `geometry-registry.ts`: Entries för `eurostat:nuts2` och `eurostat:nuts3` finns redan
- Ny geography plugin: `eurostat-nuts` (finns redan delvis i `register-plugins.ts`)

### 5.5 OECD-adapter

**Problem:** `sdmx-client.ts` har OECD-config men ingen adapter-implementation.

**Filer att skapa:**
- `oecd-client.ts`: Adapter som hämtar DSD, bygger query, dekodar SDMX-JSON
- Geography plugin: `oecd` (TL→NUTS crosswalk)

**Filer att ändra:**
- `clarify/route.ts`: Lägg till OECD i waterfall (efter Eurostat, före WB)
- `global-stats-registry.ts`: Lägg till OECD sources

### 5.6 UN SDG-adapter

**Filer att skapa:**
- `unsdg-client.ts`: SDMX-adapter med M49→ISO3 crosswalk
- `crosswalks/m49-to-iso3.json`: Statisk crosswalk-fil

### 5.7 Unified confidence model (framtida)

**Problem:** 4 separata confidence-beräkningar.

**Observation:** Inte en blockerare för nya sources. Dokumentera befintlig modell nu, refaktorera senare.

---

## 6. Prioriterad Rekommendation

### 6.1 Top 3 strukturella förändringar

1. **Extrahera `resolveFromNormalized()`** — generisk detect→plan→join loop som alla sources kan använda. Minskar duplicering, gör nya adapters 3× snabbare att integrera. **Högst impact per insats.**

2. **Lägg till `JoinHint` i adapter-kontraktet** — låter adapters kommunicera kodsystem och crosswalk-behov explicit istället för att detector ska gissa. Löser joinproblem för M49, DCID, och OECD TL.

3. **Standardisera cache-nyckelgenerering** — `computeCacheKey()` centraliserat. Eliminerar ad hoc MD5 per source. Gör debugging av cache-träffar möjligt.

### 6.2 Nästa source att implementera eller städa

**Eurostat NUTS2/NUTS3** — redan halvintegrerat, geometry entries finns, plugin finns delvis. Lägger till Europa-choropleth på regional nivå. Hög efterfrågan, lågt motstånd.

**Sedan OECD** — country-level med ISO3 direkt-join. SDMX-klienten finns redan. Rate limit kräver caching men det finns redan.

### 6.3 Steg-för-steg: lägga till ny source

1. **Läs `docs/adapter-guide.md`** (befintlig guide)
2. **Skapa adapter-fil** i `apps/web/lib/ai/tools/` — implementera `SourceAdapter.fetch()`
3. **Returnera `NormalizedSourceResult`** med korrekt `dimensions`, `rows`, `geographyHints`, `countryHints`, `joinHints`
4. **Testa adapter isolerat** — verifiera att `validateAdapterOutput()` passerar
5. **Kör `resolveFromNormalized()`** (efter refaktorering) — verifiera detect → plan → join
6. **Lägg till i waterfall** i `clarify/route.ts`
7. **Lägg till geography plugin** om source har landsspecifika koder
8. **Lägg till i `global-stats-registry.ts`** om relevant
9. **Skriv integrationstest** med fixture-data

---

## 7. Kvarvarande Osäkerheter

### 7.1 Kräver verifiering i verklig miljö

- **Eurostat SDMX 3.0 `geoLevel` parameter** — dokumenterat men otillgänglighetsstatus oklar. Testa mot produktions-API.
- **OECD rate limit (20/min)** — tillräckligt för Atlas? Beror på hur many parallella kartor som genereras.
- **Data Commons facet-ranking** — är `orderedFacets[0]` alltid den bästa? Empirisk verifiering behövs.
- **PxWeb v2 codelist-API** — alla instanser exponerar inte alla codelists. SCB gör det, men gör Island det?

### 7.2 Svårt att avgöra utan live API

- **UN SDG coverage per indikator** — varierar enormt. Måste querya per indikator för att veta hur många länder som har data.
- **OECD DSD-stabilitet** — ändras agency/dataflow/version-triplets vid dataset-uppdateringar?
- **Finland KU-prefix prevalens** — hur stor andel av StatFin-tabeller har migrerat till KU-prefix?
- **Overpass slot-baserad rate limiting** — exakt beteende vid hög belastning.

### 7.3 Sources som kräver extra försiktighet

| Source | Risk | Anledning |
|---|---|---|
| PxWeb v1 (Island, Baltikum) | Medel | Annan endpoint-syntax, begränsad testning, label-based join |
| UN SDG | Hög | M49-koder, tunn coverage, komplex SDMX-JSON |
| OECD regional (TL2/TL3) | Hög | TL ≠ NUTS, crosswalk krävs, undantag per land |
| Data Commons admin1/2 (utanför US) | Hög | Inkonsekvent DCID-format, tunn coverage |
| Overpass boundaries | Medel | Stor response, admin_level landsspecifikt, ingen statistik |

### 7.4 Designbeslut som inte tagits

- **Ska Atlas bundla NUTS version-crosswalk?** Eller ladda dynamiskt? (Rekommendation: bundla, den ändras sällan.)
- **Ska M49→ISO3 crosswalk vara en statisk fil eller en lookup-funktion?** (Rekommendation: statisk JSON-fil, ~250 rader.)
- **Ska adapters ha en `discover()` method** för dataset-discovery, eller är det enbart intent-classifierns jobb?
- **Ska `resolveFromNormalized()` vara sync eller async?** (Async — geometry loading är I/O.)

---

## 8. Utökad Source-Research: Europeiska Nationella Statistikbyråer

### 8.0 Joinability per europeisk source

| # | Source | Land | Bästa nivå | Kodsystem | Boundary | Verdict |
|---|---|---|---|---|---|---|
| 1 | **UK ONS** | GB | LAD (GSS 9-tecken) | GSS: E07000223 | geoportal.statistics.gov.uk | **Ready** |
| 2 | **NL CBS** | NL | Gemeente (GM+4) | GM0363 | CBS/PDOK | **Ready** |
| 3 | **Spain INE** | ES | Province/Kommun (2/5-siffrig) | CCAA=13, Mun=28079 | INE/IGN | **Ready** |
| 4 | **DE Destatis** | DE | Kreis (AGS 5-siffrig) | 09162 | BKG VG250 | **Ready** |
| 5 | **FR INSEE** | FR | Département/Commune (5-siffrig) | 75056 | IGN Admin Express | **Ready** |
| 6 | **PL GUS BDL** | PL | Voivodeship (TERYT 2-siffrig) | 14 | GUGiK PRG | **Ready** |
| 7 | **IE CSO** | IE | NUTS3/County | CSO-intern → NUTS crosswalk | CSO/OSi | Feasible |
| 8 | **BE Statbel** | BE | Municipality (NIS 5-siffrig) | 71066 | Statbel SHP | **Ready** |
| 9 | **PT INE** | PT | NUTS3/Municipality (DICO 4-siffrig) | 0101 | INE/DGT | Feasible |
| 10 | **RS SORS** | RS | NSTJ2 (5 regioner) | RS11 | SORS GIS | Country-only |
| 11 | **NOMIS** | GB | LAD/Ward/LSOA (GSS) | E07000223 | geoportal.statistics.gov.uk | **Ready** |
| 12 | **Fingertips** | GB | LA/Region (GSS) | E10000003 | geoportal.statistics.gov.uk | **Ready** |
| 13 | **Sotkanet** | FI | Municipality (kuntakoodi) | 91 (Helsinki) | StatFin/MML | **Ready** |
| 14 | **Nordic Stats** | Norden | Country only | ISO2 | Natural Earth | Country-only |

### 8.0.1 Nyckelinsikter Europa

**UK (ONS/NOMIS/Fingertips):** Alla tre delar GSS-kodsystemet (9-tecken, t.ex. `E07000223`). Boundary-filer från geoportal.statistics.gov.uk. En adapter + en boundary-källa täcker alla tre.

**NUTS-mapping:** De flesta europeiska byråer har egna nationella koder som mappar till NUTS:
- ES: CCAA ≈ NUTS2, Province ≈ NUTS3 (undantag: Kanarieöarna, Balearerna)
- DE: AGS 2-siffrig = NUTS1, AGS 5-siffrig ≈ NUTS3 (stadsstats-undantag)
- FR: Région = NUTS2, Département = NUTS3
- PL: Voivodeship = NUTS2 (1:1)
- BE: Region = NUTS1, Province = NUTS2 (via Statbel NUTS-REFNIS tabell)

**Sotkanet (FI):** Kuntakoodi-koderna är identiska med Statistics Finland — delar boundary-filer med PxWeb StatFin.

**Locale-varning:** Portugal INE formaterar tal med punkt som tusentalsavgränsare (`"10.290.103"`). Måste strippas före parsing.

---

## 9. Utökad Source-Research: US Statistical APIs

### 9.1 Delad infrastruktur: FIPS-koder

Alla US-sources joinar via FIPS:
- State: 2-siffrig zero-padded sträng (`"06"` = California)
- County: 5-siffrig (`"06037"` = LA County)
- Tract: 11-siffrig, Block Group: 12-siffrig

**State abbreviation → FIPS crosswalk** behövs för FRED, CDC, FBI (51 rader, stabil).

**Boundary-filer att bundla:**
- `cb_2024_us_state_500k` (~500 KB GeoJSON, 52 features)
- `cb_2024_us_county_500k` (~8 MB, 3234 features)
- Källa: Census Bureau Cartographic Boundary Files

### 9.2 Joinability per US-source

| Source | Auth | State | County | Sub-county | Format quirks |
|---|---|---|---|---|---|
| **Census ACS** | Valfri nyckel | robust-direct (FIPS) | robust-direct (FIPS) | robust-direct (tract) | 2D JSON array, null=`-666666666` |
| **BLS** | Valfri nyckel | robust-direct (ur Series ID) | robust-direct (ur Series ID) | — | Strängar, `"-"`=null, 50 series/request |
| **BEA** | Nyckel krävs | robust-direct (`GeoFips.slice(0,2)`) | robust-direct (5-siffrig GeoFips) | — | Komma-formaterade tal, `"(D)"`=suppressed |
| **FRED/GeoFRED** | Nyckel krävs | robust-direct (FIPS i `code`) | robust-direct (FIPS) | — | `"."`=null, XML default |
| **CDC PLACES** | Valfri token | robust-crosswalk (abbr→FIPS) | robust-direct (`locationid`) | robust-direct (tract) | SoQL, 50k rader/sida |
| **FBI Crime** | Nyckel krävs | robust-crosswalk (abbr→FIPS) | impractical (ORI, ej county) | — | 2021 ofullständig (SRS→NIBRS) |
| **Census Reporter** | Ingen | robust-direct (TIGER GEO ID) | robust-direct | robust-direct | Inkluderar boundary GeoJSON |
| **Data USA** | Ingen | robust-direct (FIPS) | robust-direct (FIPS) | — | Aggregerar ACS+BLS+BEA |

### 9.3 US-rekommendation

- **State**: Census ACS (demografi), BLS (arbetslöshet), BEA (GDP/inkomst) — alla robust-direct
- **County**: Census ACS + CDC PLACES (hälsa) + BEA (ekonomi) — alla robust-direct
- **Sub-county**: Census ACS tracts, CDC PLACES tracts — feasible men kräver tract-boundaries
- **Delad crosswalk**: Bundla state-abbreviation→FIPS (51 rader) + `cb_2024_us_state_500k` + `cb_2024_us_county_500k`

---

## 10. Utökad Source-Research: Asien-Stillahavet & Latinamerika

### 10.1 Joinability per source

| Source | Land | Happy Path | Koder | Boundary | Crosswalk | Verdict |
|---|---|---|---|---|---|---|
| **Japan e-Stat** | JP | Prefecture (47) | JIS X0401 5-siffrig | MLIT N03 | 47-rad JIS→ISO 3166-2:JP | Feasible with work |
| **Japan RESAS** | JP | Prefecture (47) | JIS 2-siffrig (pad till 5) | MLIT N03 (delad) | Samma som e-Stat | Feasible with work |
| **Korea KOSIS** | KR | Si-do (17) | 2-siffrig KOSIS | southkorea-maps/SGIS | 17-rad KOSIS→ISO 3166-2:KR | Feasible with work |
| **Indonesia BPS** | ID | Province (38) | BPS 2-siffrig | HDX COD-AB / BIG | 38-rad BPS→ISO 3166-2:ID | Feasible with work |
| **India data.gov.in** | IN | State (36) — label only | Namn, ej kod | GADM v4.1 | Namn→LGD→ISO (36 rad) | Country-level only |
| **Singapore** | SG | Planning Area (55) | Textnamn | URA MP2019 GeoJSON | Namnnormalisering | Feasible with work |
| **Mexico INEGI** | MX | State (32) | 2-siffrig INEGI | INEGI Marco Geo 2020 | 32-rad INEGI→ISO 3166-2:MX | Feasible with work |
| **Thailand NSO** | TH | Changwat (77) | 2-siffrig = ISO-suffix | HDX COD-AB | Ingen (direkt ISO) | Feasible with work |
| **NZ Stats** | NZ | Territorial Auth (67) | 3-siffrig TA-kod | Stats NZ GDS | Ingen | **Ready for Atlas** |
| **Australia ABS** | AU | STE (8) / SA4 (107) | 1-siffrig STE / 3-siffrig SA4 | ABS ASGS Ed3 | 8-rad STE→ISO 3166-2:AU | **Ready for Atlas** |
| **Brazil IBGE** | BR | State (27) | 2-siffrig IBGE | IBGE Geociências | 27-rad IBGE→ISO 3166-2:BR | **Ready for Atlas** |
| **Argentina datos.gob.ar** | AR | Province (24) — svårt | Serie-ID-lookup | IGN / HDX | 24-rad INDEC→ISO 3166-2:AR | Country-level only |
| **CEPALSTAT** | LAC | Country (~46) | ISO3 | Natural Earth | Ingen | Country-level only |

### 10.2 Crosswalk-tabeller som behövs

| Crosswalk | Rader | Stabilitet | Källa |
|---|---|---|---|
| JIS-5 → ISO 3166-2:JP | 47 | Stabil sedan 1947 | statoids.com/ujp.html |
| KOSIS-2 → ISO 3166-2:KR | 17 | Stabil | — |
| BPS-2 → ISO 3166-2:ID | 38 | Papua-split 2022 | sig.bps.go.id |
| INEGI-2 → ISO 3166-2:MX | 32 | Stabil | github.com/prikhi/mx-state-codes |
| IBGE-2 → ISO 3166-2:BR | 27 | Stabil | github.com/datasets-br/state-codes |
| India namn→LGD→ISO | 36 | Namnvarianter | lgdirectory.gov.in |
| INDEC-2 → ISO 3166-2:AR | 24 | Stabil | Georef API `iso_id` |

### 10.3 Boundary-filer per land

| Land | Fil | URL | Format |
|---|---|---|---|
| Japan | MLIT N03-2024 | nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html | GML/SHP |
| Korea | southkorea-maps | github.com/southkorea/southkorea-maps | GeoJSON |
| Indonesien | HDX COD-AB | data.humdata.org/dataset/cod-ab-idn | SHP/GeoJSON |
| Indien | GADM v4.1 | gadm.org/download_country.html | GPKG/SHP |
| Singapore | URA MP2019 | data.gov.sg/collections/2104/view | GeoJSON |
| Mexiko | INEGI MGN 2020 | inegi.org.mx/temas/mg/ | SHP |
| Thailand | HDX COD-AB | data.humdata.org/dataset/cod-ab-tha | SHP/GeoJSON |
| Nya Zeeland | Stats NZ GDS TA 2025 | datafinder.stats.govt.nz/layer/120963 | GeoJSON/SHP |
| Australien | ABS ASGS Ed3 | abs.gov.au/.../digital-boundary-files | GPKG/SHP |
| Brasilien | IBGE Municipal Mesh | ibge.gov.br/.../18890-municipal-mesh.html | SHP |
| Argentina | IGN | datosgobar.github.io/georef-ar-api/shapefiles/ | SHP |

---

## 11. Utökad Source-Research: Globala Aggregatorer & Tematiska API:er

### 11.1 Joinability per source

| Source | Scope | Kod | Nivå | Join | Verdict |
|---|---|---|---|---|---|
| **FAOSTAT** | Global jordbruk | ISO3 (via `area_cs=ISO3`) | Land | robust-direct | **Ready for Atlas** |
| **WHO GHO** | Global hälsa | ISO3 (`SpatialDim`) | Land | robust-direct | Feasible (deprecation-risk) |
| **UNICEF DW** | Barn/hälsa | ISO3 (`REF_AREA`) | Land | robust-direct | **Ready for Atlas** (land) |
| **UNESCO UIS** | Utbildning | ISO2 (`REF_AREA`) | Land | robust-direct + ISO2→3 | Feasible with work |
| **HDX HAPI** | Humanitärt | ISO3 + p-codes | Land + Admin1 | robust-direct/crosswalk | **Ready** (land), Feasible (admin1) |
| **StatCan WDS** | Kanada | SGC numerisk | Provins/CD/CSD | robust-direct | **Ready for Atlas** (provins) |
| **OpenAQ** | Global luft | ISO2 + lat/lon | Land (aggregerat) | robust-direct + spatial | Feasible with work |
| **Global Forest Watch** | Avskogning | ISO3 + GADM | Land + Admin1 | robust-direct/crosswalk | **Ready** (land), Feasible (GADM) |
| **ARDECO** | EU regioner | NUTS-koder | NUTS0–3 | robust-direct | Feasible (ingen REST) |
| **Kolada** | Sverige kommun | SCB 4-siffrig | Kommun/Län | robust-direct | **Ready for Atlas** |
| **Wikidata SPARQL** | Globalt entitetsräkning | ISO3 (via P298) | Land | robust-direct | Feasible (timeout-risk) |
| **OWID** | Globalt allt | ISO3 (`Code` kolumn) | Land | robust-direct | **Ready for Atlas** |
| **Socrata/SODA** | US-städer | Varierar (ZIP/FIPS/text) | Stads-subgeo | varierar | Not recommended (generellt) |

### 11.2 Rekommenderad integrationsprioritet (alla ~50 källor)

**Omedelbar (zero-crosswalk, hög kvalitet):**
1. **OWID** — 5000+ charts, trivial CSV, ISO3 direkt
2. **FAOSTAT** — Jordbruk/mat/mark, ISO3, bulk CSV
3. **Kolada** — Sverige kommun, identiska SCB-koder
4. **UNICEF DW** — Barn/hälsa, ISO3 i SDMX CSV

**Andra omgången (crosswalk behövs, hög kvalitet):**
5. **Australia ABS** — STE/SA4, no auth, SDMX, excellent boundaries
6. **NZ Stats** — TA, SDMX, excellent boundaries
7. **Brazil IBGE** — State, no auth, IBGE boundaries
8. **HDX HAPI** — Humanitärt, Admin1 via COD-AB
9. **StatCan WDS** — Kanada provins, SGC-koder
10. **Census ACS + CDC PLACES** — US state/county/tract, FIPS direkt

**Tredje omgången (mer arbete):**
11. Japan e-Stat + RESAS — Prefecture, JIS-koder, N03 boundaries
12. Korea KOSIS — Si-do, 17-rad crosswalk
13. Mexico INEGI — State, 32-rad crosswalk
14. Indonesia BPS — Province, 38-rad crosswalk
15. GFW — Avskogning, GADM admin1
16. ARDECO — EU NUTS, no REST (CSV export)
17. UNESCO UIS — ISO2→ISO3 crosswalk + auth
18. Wikidata SPARQL — Entitetsräkning, timeout-hantering

**Skjut upp eller undvik:**
- India data.gov.in — Label-based, landsspecifikt
- Argentina datos.gob.ar — Serie-ID-lookup per indikator
- CEPALSTAT — Country-only, inget mervärde utöver WB
- WHO GHO — Deprecation-risk
- Socrata/SODA — Per-dataset schema, ej skalbart
- FBI Crime — Bara state via API, county kräver bulk
