# Atlas Data Sources — Non-PxWeb API Research (2026-04-01)

Comprehensive research on all non-PxWeb data sources in the Atlas platform.
10 parallel research agents covered: Denmark DST, SDMX standard, US APIs, European REST APIs, International org APIs, Asia-Pacific APIs, Overpass + web data sources, Nordic/European aggregators, Global aggregators, City/regional open data platforms.

**Related files:**
- `crosswalks/*.json` — 15 static crosswalk tables built from this research (code→ISO/NUTS/FIPS mappings)
- `docs/source-integration-spec.md` — Joinability analysis, adapter contract spec, and implementation plan synthesized from this research

---

## Table of Contents

1. [Critical Fixes for Existing Adapters](#1-critical-fixes-for-existing-adapters)
2. [Sources Missing Adapters — Prioritized](#2-sources-missing-adapters--prioritized)
3. [Key Insights per API Category](#3-key-insights-per-api-category)
4. [Recommended Implementation Order](#4-recommended-implementation-order)
5. [Detailed API References](#5-detailed-api-references)
   - [5.1 Denmark DST StatBank](#51-denmark-dst-statbank)
   - [5.2 SDMX Standard & Agency Deviations](#52-sdmx-standard--agency-deviations)
   - [5.3 US Statistical APIs](#53-us-statistical-apis)
   - [5.4 European REST APIs](#54-european-rest-apis)
   - [5.5 International Organization APIs](#55-international-organization-apis)
   - [5.6 Asia-Pacific APIs](#56-asia-pacific-apis)
   - [5.7 Overpass & Web Dataset Sources](#57-overpass--web-dataset-sources)
6. [Aggregator Databases](#6-aggregator-databases)
7. [Wikidata SPARQL Integration](#7-wikidata-sparql-integration)

---

## 1. Critical Fixes for Existing Adapters

These are bugs/issues in code that is already running:

| Problem | File | Fix |
|---|---|---|
| **ILO URL changed** | `sdmx-client.ts` ILOSTAT_CONFIG | `www.ilo.org/sdmx/rest` → `sdmx.ilo.org/rest` (old URL is dead) |
| **Thailand NSO wrong host** | `sdmx-client.ts` (missing) | `sdmx.nso.go.th/rest/` → `ns1-stathub.nso.go.th/rest/` (registry is on different host than data API) |
| **ISTAT rate limit** | `sdmx-client.ts` | 5 req/min — exceeding → 1-2 day IP block. Needs throttling (15s floor between requests). |
| **ISTAT endPeriod bug** | `sdmx-client.ts` | `endPeriod=2023` returns data through 2024. Requires off-by-one correction. |
| **ECB structure=XML only** | `sdmx-client.ts` ECB_CONFIG | JSON Accept header for structure endpoints returns 406. Must use XML for structure queries. |
| **IMF new endpoint** | `sdmx-client.ts` IMF_CONFIG | `sdmxcentral.imf.org/sdmx/v2` is the new primary; old `api.imf.org` works but is less capable |
| **NZ Stats — old API dead** | `global-stats-registry.ts` | `api.stats.govt.nz` closed Aug 2024. New: `api.data.stats.govt.nz/rest/` (SDMX 2.1, requires subscription key) |

---

## 2. Sources Missing Adapters — Prioritized

### Tier 1: High priority (large country, good API, no auth)

| Source | API type | Auth | Difficulty | Notes |
|---|---|---|---|---|
| **se-kolada** (Sweden) | REST | None | **Easy** | `api.kolada.se/v2` — search KPIs, fetch per municipality with SCB 4-digit codes. Perfect match to existing Swedish geometry. |
| **br-ibge** (Brazil) | REST | None | **Medium** | `servicodados.ibge.gov.br/api/v3/agregados/` — well-structured, `?localidades=N3[all]` for states. All responses in Portuguese. |
| **gb-ons** (UK) | REST | None | **Medium** | `api.beta.ons.gov.uk/v1` — CMD datasets + observations. GSS codes for geography. Beta but stable. |
| **us-census** (USA) | REST | Optional key | **Medium** | `api.census.gov/data/2022/acs/acs5` — ACS 5-year, population/income/poverty per state/county. FIPS codes. |
| **nl-cbs** (Netherlands) | OData v4 | None | **Medium** | `beta.opendata.cbs.nl/OData/{TABLE}/Observations` — GM codes for municipalities. |
| **ie-cso** (Ireland) | JSON-RPC | None | **Easy** | `ws.cso.ie/public/api.jsonrpc` — PxStat, returns JSON-stat 2.0. No server-side filtering. |
| **ar-datosgobar** (Argentina) | REST | None | **Easy** | `apis.datos.gob.ar/series/api/series/?ids=X` — time series, CSV/JSON. No geo filter though. |

### Tier 2: Medium priority (requires API key or more complex)

| Source | API type | Auth | Difficulty | Notes |
|---|---|---|---|---|
| **us-fred** (partially exists) | REST | API key | **Medium** | Adapter exists but GeoFRED missing. `geofred/regional/data` gives snapshot per state with FIPS codes. |
| **us-bls** (USA) | REST | Optional key | **Medium** | POST `api.bls.gov/publicAPI/v2/timeseries/data/` — LAUST series per state. 50 states = 1 request. |
| **us-bea** (USA) | REST | API key | **Medium** | `apps.bea.gov/api/data?method=GetData&datasetname=Regional` — GDP per state. GeoFips format. |
| **es-ine** (Spain) | REST | None | **Medium-Hard** | Tempus3 API. `servicios.ine.es/wstempus/js/EN/DATOS_TABLA/{id}?nult=5`. Requires tv-filter with internal IDs. |
| **de-destatis** (Germany) | REST | GAST/key | **Hard** | GENESIS REST 2020. GAST credentials work for public data. AGS 8-digit geocodes. |
| **kr-kostat** (South Korea) | REST | API key | **Medium** | `kosis.kr/openapi/` — KOSIS API. `kostat.go.kr` domain unreliable after 2024 reorganization. |
| **jp-estat** (Japan) | REST | API key | **Hard** | `api.e-stat.go.jp/rest/3.0/` — 2-step flow (getStatsList → getStatsData). Japanese labels. |
| **pl-stat** (Poland) | REST | Optional key | **Medium** | `bdl.stat.gov.pl/api/v1` — BDL API, TERYT codes, pagination max 100/page. |
| **mx-inegi** (Mexico) | REST | Token in URL | **Medium** | Token is URL segment, not query param. 2-digit state codes. |

### Tier 3: Lower priority (limited API or requires OAuth)

| Source | API type | Auth | Difficulty | Notes |
|---|---|---|---|---|
| **fr-insee** (France) | REST | OAuth2 (BDM) / None (MELODI) | **Hard** | Two APIs: BDM SDMX (100k+ series, requires OAuth) + MELODI (75 datasets, no auth, 30 req/min). |
| **id-bps** (Indonesia) | REST | API key | **Medium** | `webapi.bps.go.id/v1/api/` — 2-digit province codes. |
| **sg-datagovsg** (Singapore) | REST | Optional key | **Medium** | 2-step download (initiate → poll). API key mandatory after Dec 2025. |
| **in-datagovin** (India) | REST (not CKAN) | API key | **Medium** | Custom `/resource/{uuid}` endpoint, not standard CKAN. Slow (5-15s). |
| **il-cbs** (Israel) | REST | None | **Easy but limited** | Price indices only. `api.cbs.gov.il/index/data/price_all`. |
| **pt-ine** (Portugal) | REST | None | **Medium** | `ine.pt/ine/json_indicador/pindica.jsp` — Portuguese number formatting (dot = thousands separator). |
| **be-statbel** (Belgium) | REST | None | **Easy but limited** | UUID-based views, no server-side filtering. Entire dataset returned. |
| **rs-stat** (Serbia) | OData | None | **Medium** | `opendata.stat.gov.rs/odata/` — OData filter, limited dataset offering. |
| **us-cdc** (USA) | SODA/REST | Optional token | **Medium** | `data.cdc.gov/resource/{id}.json` — SoQL queries. Health data per state. |
| **us-fbi-ucr** (USA) | REST | API key | **Medium** | `api.usa.gov/crime/fbi/cde` — state abbreviations in uppercase required. 2021 data incomplete. |

### Tier 4: Portals without API (cannot build adapter)

| Source | Status | Alternative |
|---|---|---|
| se-bra (BRÅ) | Portal, CSV download | Web dataset search fallback |
| cl-ine (Chile) | DNS doesn't resolve | Dead |
| co-dane (Colombia) | DNS doesn't resolve | Dead |
| pe-inei (Peru) | Timeout | Dead |
| lt-stat (Lithuania) | 403 Forbidden | Requires browser session |
| za-statssa (South Africa) | Portal | Web dataset search |
| ph-psa (Philippines) | 403 Forbidden | Blocks automation |
| np-nso (Nepal) | SSL cert expired | Inaccessible |
| at-stat (Austria) | Subscription/portal | STATcube requires account |
| jo-dos (Jordan) | Timeout | Inaccessible |

---

## 3. Key Insights per API Category

### SDMX (existing adapter — needs updates)

- **BIS** now runs SDMX 3.0 (REST v2) at `/api/v2` — current adapter works but can be upgraded
- **OECD** runs SDMX 3.0 with complex flow ID syntax (`OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA`) — `@` in flow ID requires correct URL handling
- **Eurostat** now also has SDMX 3.0 endpoint at `/sdmx/3.0` — separate from 2.1
- **WHO GHO is NOT SDMX** — it's OData (`ghoapi.azureedge.net/api/`). Needs its own OData adapter.
- **Statistics Canada SDMX** — correct endpoint is `www150.statcan.gc.ca/t1/wds/sdmx/statcan/rest/`, agency ID is `SC`
- **SDMX-JSON v1 vs v2** — BIS at `/api/v2` and IMF at SDMX Central may return v2 format where observations are keyed maps, not positional arrays

### US APIs (all require custom adapters)

All six US APIs (Census, BLS, BEA, FRED, CDC, FBI) return data with FIPS codes or state abbreviations. A shared `STATE_ABBR_TO_FIPS` lookup is needed. Census returns 2D array, BLS/BEA/FRED return nested JSON, CDC returns flat JSON array.

### Kolada (Sweden)

Perfect candidate — `api.kolada.se/v2`, no keys, SCB 4-digit municipality codes that already match existing Swedish geometry. Endpoints: `/kpi` (search), `/municipality` (list), `/data/kpi/{id}/municipality/{ids}/year/{years}` (data).

### Overpass (existing — works well)

Current implementation is correct. Alternative endpoint `overpass.kumi.systems` can be used as fallback on 429 errors. Max 10k req/day is the limit.

### Web Dataset Search (existing — works)

OWID data has direct CSV URLs with `iso_code` column (ISO3). HDX has CKAN API. USGS earthquake has GeoJSON feeds. All work through the web-search adapter already.

---

## 4. Recommended Implementation Order

**Phase 1 — Fixes (no new adapters, just bugs):**
1. Update ILO base URL
2. Fix Thailand NSO host
3. Add ISTAT rate limiting
4. Update NZ Stats registry entry

**Phase 2 — Quick wins (simple adapter, high value):**
1. **Kolada** — Sweden, no keys, matches existing geometry
2. **Ireland CSO** — JSON-stat 2.0 direct, no keys
3. **Argentina datos.gob.ar** — simple time series API, no keys
4. **Brazil IBGE** — no keys, good geo support

**Phase 3 — Medium effort, high value:**
1. **US Census** — high demand, FIPS codes
2. **UK ONS** — observations API
3. **Netherlands CBS** — OData v4
4. **US BLS + BEA + FRED GeoFRED** — can share FIPS lookup

**Phase 4 — Requires more work:**
1. Spain INE Tempus3
2. Germany Destatis GENESIS
3. France INSEE (MELODI + BDM)
4. Japan e-Stat, Korea KOSIS
5. WHO GHO OData adapter

---

## 5. Detailed API References

### 5.1 Denmark DST StatBank

**Base URL:** `https://api.statbank.dk/v1`
**Auth:** None
**Rate limits:** None documented. Cell limit: 1,000,000 cells per non-streaming request.

#### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/subjects` | POST | Browse subject hierarchy |
| `/v1/tables` | POST | List/search tables |
| `/v1/tableinfo` | POST | Full table schema (variables, values) |
| `/v1/data` | POST | Fetch data |

Always use POST with `Content-Type: application/json` (GET breaks on Danish characters æ, ø, å).

#### Table Search
```json
POST https://api.statbank.dk/v1/tables
{
  "lang": "en",
  "searchText": "population"
}
```

Response per table: `id`, `text`, `unit`, `updated`, `firstPeriod`, `latestPeriod`, `active`, `variables[]`.

#### Table Metadata
```json
POST https://api.statbank.dk/v1/tableinfo
{
  "id": "FOLK1A",
  "lang": "en"
}
```

Returns variables array. Each variable has:
- `id` — code to use in data requests (e.g., `OMRÅDE`, `KØN`)
- `text` — human label
- `elimination` — if true, can be omitted (aggregated); if false, must supply values
- `time` — if true, this is the time dimension
- `map` — if present, a cartographic layer reference (e.g., `DK_MUN2024`)
- `values[]` — array of `{id, text}` pairs

#### Data Fetch
```json
POST https://api.statbank.dk/v1/data
{
  "table": "FOLK1A",
  "format": "JSONSTAT",
  "lang": "en",
  "variables": [
    { "code": "OMRÅDE", "values": ["*"] },
    { "code": "KØN", "values": ["*"] },
    { "code": "ALDER", "values": ["IALT"] },
    { "code": "CIVILSTAND", "values": ["TOT"] },
    { "code": "TID", "values": ["2026Q1"] }
  ]
}
```

Use `"*"` for all values of a variable. `format` options: `JSON`, `JSONSTAT`, `CSV`, `BULK` (streaming, no cell limit), `SDMXCOMPACT`, `SDMXGENERIC`.

#### Geographic Codes

| Code range | Level |
|---|---|
| `000` | All Denmark (national) |
| `081`–`085` | 5 regions |
| `101`–`791` | 98 municipalities (kommuner) |

Municipality codes are official Danish kommunekoder (post-2007 reform).

#### Known Quirks

- CSV uses semicolons, not commas (Nordic convention)
- Variable codes are case-insensitive but may return mixed case
- Time formats: quarterly `2025Q1`, annual `2025`, monthly `2025M01`
- `elimination: false` variables are mandatory in data calls
- 1,000,000 cell limit applies to Cartesian product of selected values — use `BULK` format for full extracts

---

### 5.2 SDMX Standard & Agency Deviations

#### Version Taxonomy

| SDMX Standard | REST API Version | Key milestone |
|---|---|---|
| SDMX 2.1 | REST API v1.x (v1.5.0 stable) | Most agencies still run this |
| SDMX 3.0 | REST API v2.x (v2.0.0 Jan 2024) | Multi-measure, new URL scheme |

"SDMX 2.1 REST API" = "REST v1.5". "SDMX 3.0 REST API" = "REST v2".

#### URL Differences v1 vs v2

**v1 data:** `{base}/data/{agencyID},{flowID},{version}/{key}`
**v2 data:** `{base}/data/{context}/{agencyID}+{flowID}+{version}/{key}`

Structure resources in v2 are under `/structure/` prefix. Version wildcard: v1 uses `all`, v2 uses `~`.

#### SDMX-JSON v1 vs v2

- **v1**: Single measure per observation. Observations are positional arrays: `[value, status, ...]`
- **v2**: Multi-measure support. Observations are keyed maps: `{"0": 1.23, "1": "flag"}`
- Detect version from `Content-Type` header or `schema` field before parsing

#### Accept Headers

| Format | Accept header |
|---|---|
| SDMX-JSON v1 (data) | `application/vnd.sdmx.data+json;version=1.0.0` |
| SDMX-JSON v2 (data) | `application/vnd.sdmx.data+json;version=2.0.0` |
| SDMX-JSON v1 (structure) | `application/vnd.sdmx.structure+json;version=1.0.0` |
| SDMX-ML structure | `application/vnd.sdmx.structure+xml;version=2.1` |

#### Data Filtering

Key-based (v1): `/data/ECB,EXR,1.0/A.USD+GBP.EUR.SP00.A` (dot-separated, `+` for multiple values)
Parameter-based (v2): `?c[FREQ]=A&c[CURRENCY]=USD+GBP`
Time: `startPeriod=2020-Q1&endPeriod=2023-Q4`
Observation limit: `lastNObservations=5`

#### Per-Agency Comparison

| Agency | Base URL | REST version | Flow ID format | JSON | Rate limit | Major quirk |
|---|---|---|---|---|---|---|
| BIS | `stats.bis.org/api/v2` | v2 (3.0) | `BIS,{flow},{ver}` | Yes (v2) | None | v1 still works at `/api/v1` |
| ABS | `data.api.abs.gov.au/rest` | v1.5 (2.1) | `ABS,{flow},{ver}` | Yes (v1) | None | URL changed from `api.data.abs.gov.au` |
| ECB | `data-api.ecb.europa.eu/service` | v1.5 (2.1) | `ECB,{flow},{ver}` | Data only | None | **Structure is XML-only; JSON returns 406** |
| OECD | `sdmx.oecd.org/public/rest` | v2 (3.0) | `OECD.SDD.xxx,DSD@DF_zzz` | Yes | None | Compound agency IDs; `@` in flow ID; legacy OECD.Stat dead July 2024 |
| IMF (new) | `sdmxcentral.imf.org/sdmx/v2` | v2 (3.0) | `IMF,{flow},{ver}` | Yes (v2) | None | Also v1 at `/ws/public/sdmxapi/rest` |
| IMF (old) | `api.imf.org/external/sdmx/2.1` | v1 (2.1) | `IMF,{flow},{ver}` | Limited | None | Older, prefer sdmxcentral |
| ISTAT | `esploradati.istat.it/SDMXWS/rest` | v1 (2.1) | `IT1,{flow},{ver}` | Yes | **5 req/min; 1-2 day block** | `endPeriod` off-by-one bug |
| Eurostat | `.../sdmx/2.1` | v1 (2.1) | `ESTAT,{flow},{ver}` | Yes | None | Async for large datasets; also has `/sdmx/3.0` |
| Stats Canada | `www150.statcan.gc.ca/.../rest` | v1 (2.1) | `SC,{flow},{ver}` | Yes | None | Separate WDS for bulk CSV |
| ILO | `sdmx.ilo.org/rest` | v1 (2.1) | `ILO,{flow},{ver}` | Yes | None | **Base URL changed silently in 2024** |
| Malta NSO | FMR-based | v1 (2.1) | `MT1,{flow},{ver}` | Yes | None | Small, FMR-based |
| Thailand NSO | `ns1-stathub.nso.go.th/rest` | v1 (2.1) | `TNSO,{flow},{ver}` | Yes | None | **`sdmx.nso.go.th/rest/` is wrong host** |

#### WHO GHO — NOT SDMX

WHO GHO uses **OData**, not SDMX:
- Current API: `https://ghoapi.azureedge.net/api/`
- Indicators list: `https://ghoapi.azureedge.net/api/Indicator`
- Data: `https://ghoapi.azureedge.net/api/WHOSIS_000001?$filter=SpatialDim eq 'SWE'`
- Flagged for deprecation near end of 2025; new OData backend in migration

---

### 5.3 US Statistical APIs

#### FIPS Code Reference (Cross-API Join Key)

All US APIs join to geometry via FIPS codes:
- State: 2-digit zero-padded string (e.g., `"06"` = California)
- County: 5-digit (state 2 + county 3, e.g., `"06037"` = LA County)

State abbreviation → FIPS lookup needed for FRED, CDC, FBI:
```
AL:01, AK:02, AZ:04, AR:05, CA:06, CO:08, CT:09, DE:10, DC:11, FL:12,
GA:13, HI:15, ID:16, IL:17, IN:18, IA:19, KS:20, KY:21, LA:22, ME:23,
MD:24, MA:25, MI:26, MN:27, MS:28, MO:29, MT:30, NE:31, NV:32, NH:33,
NJ:34, NM:35, NY:36, NC:37, ND:38, OH:39, OK:40, OR:41, PA:42, RI:44,
SC:45, SD:46, TN:47, TX:48, UT:49, VT:50, VA:51, WA:53, WV:54, WI:55, WY:56
```

#### 5.3.1 US Census Bureau

**Base URL:** `https://api.census.gov/data`
**Auth:** Optional API key (500 req/day without, unlimited with)

**ACS 5-year:** `https://api.census.gov/data/{year}/acs/acs5?get={vars}&for={geo}&key={key}`

Key variables:
- `B01003_001E` — Total population
- `B19013_001E` — Median household income
- `B17001_002E` — Population below poverty
- `NAME` — Geographic name

Geography syntax:
```
?for=state:*                        # All states
?for=county:*&in=state:06           # All counties in CA
?for=tract:*&in=state:06 county:037 # All tracts in LA County
```

Response: 2D JSON array, first row = headers. FIPS in `state` field (already 2-digit).

Max 50 variables per request. Null values: `-666666666` or `-999999999`.

#### 5.3.2 Bureau of Labor Statistics

**Base URL:** `https://api.bls.gov/publicAPI/v2`
**Auth:** Optional (25 req/day without, 500/day with key)

```
POST /timeseries/data/
{ "seriesid": ["LAUST060000000000003"], "startyear": "2020", "endyear": "2024", "registrationkey": "KEY" }
```

LAUST series ID format: `LAUST{2-digit-state-FIPS}0000000000003` (unemployment rate)
- California: `LAUST060000000000003`
- Texas: `LAUST480000000000003`

All 50 states in one request = 50 series (max per registered request).

Values are strings. `"-"` = not available. `"M13"` period = annual average.

#### 5.3.3 Bureau of Economic Analysis

**Base URL:** `https://apps.bea.gov/api/data`
**Auth:** Required (free API key)

```
GET ?UserID={key}&method=GetData&datasetname=Regional&TableName=SAGDP2N&LineCode=1&GeoFips=STATE&Year=2022&ResultFormat=JSON
```

`GeoFips=STATE` returns all states. State GeoFips format: `{2-digit}000` (e.g., `01000` for Alabama). Truncate to 2 chars for FIPS join.

`DataValue` is comma-formatted string: strip commas. `"(D)"` = suppressed, `"(NA)"` = not available.

#### 5.3.4 FRED

**Base URL:** `https://api.stlouisfed.org/fred`
**Auth:** Required (free key). Rate: 120 req/min.

Series observations:
```
GET /series/observations?series_id=CAUR&api_key=KEY&file_type=json
```

State unemployment: `{ABBR}UR` (e.g., `CAUR`, `TXUR`). Uses postal abbreviations, not FIPS.

**GeoFRED** (geographic snapshots):
```
GET https://api.stlouisfed.org/geofred/regional/data?series_group={GROUP_ID}&date=2024-01-01&region_type=state&api_key=KEY&file_type=json
```
Response includes `code` field = FIPS code directly.

Missing values: `"."` string. Default format is XML — always specify `file_type=json`.

#### 5.3.5 CDC SODA API

**Base URL:** `https://data.cdc.gov/resource/{dataset_id}.json`
**Auth:** Optional app token (1000 req/hour with token)

SoQL query language (SQL-like):
```
GET /resource/g4ie-h725.json?$where=topic='Diabetes' AND yearstart=2021&$select=locationabbr,datavalue&$limit=100
```

Max 50,000 rows per request. Paginate with `$limit` and `$offset`.

`locationabbr` = postal abbreviation → needs FIPS lookup.

Key dataset: `g4ie-h725` (US Chronic Disease Indicators).

#### 5.3.6 FBI Crime Data

**Base URL:** `https://api.usa.gov/crime/fbi/cde`
**Auth:** Required (free key from api.data.gov)

```
GET /api/summarized/state/CA/homicide/2018/2022?api_key=KEY
```

State abbreviation MUST be uppercase. Years are path segments, not query params.

Response includes `rate_per_100k`. Uses `state_abbr` → needs FIPS lookup.

**Critical:** 2021 data is incomplete due to SRS→NIBRS transition. Always check `/participation/state/{abbr}` first.

#### Null Value Reference

| API | Null indicators |
|---|---|
| Census | `-666666666`, `-999999999`, null |
| BLS | `"-"` string |
| BEA | `"(D)"`, `"(NA)"`, `"(L)"` |
| FRED | `"."` string |
| CDC | Empty field or absent key |
| FBI | `null` JSON value |

---

### 5.4 European REST APIs

#### 5.4.1 UK ONS

**Base URL:** `https://api.beta.ons.gov.uk/v1`
**Auth:** None

Two tracks:
- **CMD datasets:** `/v1/datasets/{id}/editions/{ed}/versions/{v}/observations?{dim}={val}&{dim2}=*`
- **Census 2021:** `/v1/population-types/{type}/...`

Only one wildcard `*` per observations call. GSS codes for geography (E/W/S/K prefixes).

Discovery: `/v1/datasets` → `/v1/datasets/{id}/editions/{ed}/versions/{v}/dimensions` → dimension options.

#### 5.4.2 Netherlands CBS OData

**v4 Base:** `https://beta.opendata.cbs.nl/OData/{TABLE}/`
**v3 Base:** `https://opendata.cbs.nl/ODataApi/odata/{TABLE}/`
**Auth:** None

v4 (recommended):
```
GET /OData/83765NED/Observations?$filter=WijkenEnBuurten eq 'GM0363'&$select=WijkenEnBuurten,Measure,Value
```

v3 row limit: 10,000. v4: up to 50,000 with `$top`.

Geographic codes: `GM{4-digit}` (municipality), `PV{2-digit}` (province), `CR{2-digit}` (COROP/NUTS3).

v3 scheduled for deprecation but no firm date. Some tables only in v3.

#### 5.4.3 Ireland CSO PxStat

**RESTful:** `https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/{TABLE}/JSON-stat/2.0/en`
**JSON-RPC:** `POST https://ws.cso.ie/public/api.jsonrpc`
**Auth:** None

JSON-RPC for table listing:
```json
{ "method": "PxStat.Data.Cube_API.ReadCollection", "params": {"language": {"code": "en"}, "class": "collection"} }
```

Returns JSON-stat 2.0 directly. No server-side filtering — full dataset returned.

#### 5.4.4 Spain INE Tempus3

**Base URL:** `https://servicios.ine.es/wstempus/js/{lang}/{FUNCTION}/{id}`
**Auth:** None

Key endpoints:
```
GET /EN/OPERACIONES_DISPONIBLES            # List all operations
GET /EN/TABLAS_OPERACION/{op_id}           # Tables in operation
GET /EN/DATOS_TABLA/{table_id}?nult=5      # Data (last 5 observations)
GET /EN/DATOS_TABLA/{table_id}?tv=3:74     # Data filtered by variable
```

Geographic variable IDs are table-specific — must call `VARIABLES_OPERACION` first. CCAA codes, province codes, INE 5-digit municipality codes.

#### 5.4.5 Germany Destatis GENESIS

**Base URL:** `https://www-genesis.destatis.de/genesisWS/rest/2020`
**Auth:** `?username=GAST&password=GAST` for public data (or registered account)

Key endpoints:
```
GET /find/find?query={term}&category=tables&username=GAST&password=GAST&language=en
GET /catalogue/tables?selection={prefix}*&username=GAST&password=GAST
GET /data/tablefile?name={code}&format=ffcsv&username=GAST&password=GAST
```

`format=ffcsv` = flat file CSV (tidy data). AGS codes: 2-digit Bundesland, 5-digit Kreis, 8-digit Gemeinde.

GAST access limited to public tables. `regionalvariable` name is table-specific.

#### 5.4.6 France INSEE

Two APIs:

**BDM SDMX (legacy, still active):**
- Base: `https://api.insee.fr/series/BDM/V1`
- Auth: OAuth2 client credentials via `POST https://portail-api.insee.fr/token`
- Data: `GET /data/SERIES_BDM/{idbank}?startPeriod=2015` with Bearer token
- 100k+ macroeconomic series. XML responses.

**MELODI (new, no auth):**
- Base: `https://api.insee.fr/melodi/V2`
- Auth: None. Rate: 30 req/min.
- `GET /catalog/all` — list ~75 datasets
- `GET /data/{dataset_id}?GEO_OBJECT_TYPE=COM&GEO_OBJECT=75056` — filter by commune
- INSEE commune codes (5-digit: 2 dept + 3 commune)

#### 5.4.7 Belgium Statbel

**Base URL:** `https://bestat.statbel.fgov.be/bestat/api/`
**Auth:** None

```
GET /views/                          # List all views (UUID-based)
GET /views/{uuid}/result/JSON        # Full dataset
```

No server-side filtering — entire view returned. NIS codes for geography.

#### 5.4.8 Portugal INE

**Base URL:** `https://www.ine.pt`
**Auth:** None

```
GET /ine/json_indicador/pindicaLista.jsp?lang=EN    # All indicators
GET /ine/json_indicador/pindicaMeta.jsp?varcd={code}&lang=EN   # Metadata
GET /ine/json_indicador/pindica.jsp?op=2&varcd={code}&Dim1=S7A2022&lang=EN  # Data
```

Values are locale-formatted: `"10.290.103"` (dot = thousands separator). Parse with `.replace('.','').replace(',','.')`.

#### 5.4.9 Poland GUS BDL

**Base URL:** `https://bdl.stat.gov.pl/api/v1`
**Auth:** Optional `X-ClientId` header

```
GET /subjects?lang=en                    # Theme tree
GET /variables?subject-id={id}&lang=en   # Variables
GET /data/by-variable/{var_id}?year=2022&unit-level=2&lang=en&page=0&page-size=100
```

TERYT codes: 2-digit voivodeship, 4-digit powiat, 7-digit gmina. Pagination max 100/page.

#### 5.4.10 Serbia SORS OData

**Base URL:** `https://opendata.stat.gov.rs/odata/`
**Auth:** None

```
GET /odata/                     # Service document (entity sets)
GET /odata/$metadata            # Full schema
GET /odata/{EntitySet}?$filter=Municipality eq '11000'&$format=json
```

Limited dataset coverage. Property names may be in Serbian.

---

### 5.5 International Organization APIs

#### 5.5.1 World Bank v2 (existing adapter)

**Base URL:** `https://api.worldbank.org/v2`
**Auth:** None

Key patterns:
```
GET /v2/country/all/indicator/{code}?format=json&per_page=500&mrv=5
```

- `countryiso3code` = ISO3. `country.id` = ISO2.
- Aggregate filtering: drop rows where `capitalCity == ""` or `region.id == "NA"`
- `mrnev=1` = most recent non-empty value
- No v3 announced as of early 2026

#### 5.5.2 UN SDG API

**Base URL:** `https://unstats.un.org/SDGAPI/v1/sdg`
**Auth:** None

```
GET /Indicator/Data?indicator=1.1.1&geoAreaCode=752
```

Uses **M49 numeric codes**, not ISO3 (Sweden = 752, USA = 840). Get mapping from `/GeoArea/List`.

#### 5.5.3 FAOSTAT

**REST API:** `https://fenixservices.fao.org/faostat/api/v1/{lang}/data/{domainCode}?{params}`
**Bulk:** `https://bulks-faostat.fao.org/production/`
**Auth:** None

```
GET /en/data/QCL?area_cs=ISO3&area=SWE&element=2510&item=15&year=2022&output_type=objects&limit=-1
```

`area_cs=ISO3` enables ISO3 area codes. `output_type=objects` for named-field JSON. Key domains: `QCL` (crops), `FBS` (food supply), `GCE` (emissions), `RL` (land use).

#### 5.5.4 CEPALSTAT / ECLAC

**Base URL:** `https://api-cepalstat.cepal.org/cepalstat/api/v1`
**Auth:** Developer registration required
**Coverage:** Latin America & Caribbean only (~46 countries)

```
GET /thematic-tree?format=json&lang=en       # Indicator hierarchy
GET /indicator/{id}/data?format=json&lang=en  # Data
```

Uses ISO3 codes. Registration requirement is the main friction point.

#### 5.5.5 Data Commons v2 (existing integration)

**Base URL:** `https://api.datacommons.org/v2`
**Auth:** API key required (free)

Observation endpoint:
```
POST /v2/observation
{ "entity": {"expression": "country/SWE<-containedInPlace+{typeOf:AdministrativeArea1}"},
  "variable": {"dcids": ["Count_Person"]}, "date": "LATEST",
  "select": ["date","value","entity","variable"] }
```

Entity DCIDs: `country/{ISO3}`, US states: `geoId/{FIPS2}`.

Admin types per country: `State` (US/BR/IN), `AdministrativeArea1` (SE/NO/DK/FI/FR/GB), `EurostatNUTS1/2` (DE/ES/IT/PL), `Province` (CA/ID/TR/NL), `Prefecture` (JP).

#### 5.5.6 Eurostat Statistics API (existing integration)

**Base URL:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data`
**Auth:** None

```
GET /{datasetCode}?geo=SE&geo=NO&lastTimePeriod=10&geoLevel=country&lang=EN
```

JSON-stat 2.0 response. `geoLevel`: `country`, `nuts1`, `nuts2`, `nuts3`, `aggregate`. Max 50 sub-indicators per request.

#### 5.5.7 Kolada (Swedish municipal database)

**Base URL:** `https://api.kolada.se/v2`
**Auth:** None

```
GET /v2/kpi?title=kostnad                    # Search KPIs
GET /v2/municipality                          # List all municipalities
GET /v2/data/kpi/{kpi_ids}/municipality/{mun_ids}/year/{years}  # Data
```

Municipality codes = SCB 4-digit codes (zero-padded, e.g., `0180` = Stockholm).
`gender` values: `T` (total), `K` (female), `M` (male).
Pagination via `next_page` URLs.

---

### 5.6 Asia-Pacific APIs

#### 5.6.1 Japan e-Stat

**Base URL:** `https://api.e-stat.go.jp/rest/3.0/app/json/`
**Auth:** `appId` query param (free registration)

Two-step flow:
1. `getStatsList?searchWord=population&lang=E` → get `STATS_DATA_ID`
2. `getStatsData?statsDataId={id}&cdArea=13000` → get data

Prefecture codes: JIS X0401 (2-digit, padded to 5 with zeros: `13000` = Tokyo).
English label coverage is partial. Pagination via `NEXT_KEY`.

#### 5.6.2 Singapore data.gov.sg

**v1:** `https://api-open.data.gov.sg/v1/public/api/`
**v2:** `https://api-production.data.gov.sg/v2/public/api/`
**Auth:** Optional key (mandatory after Dec 31, 2025). 5 req/min without key.

Static data: 2-step async download (initiate → poll → download URL).
Real-time data: direct JSON response.

#### 5.6.3 India data.gov.in

**Base URL:** `https://api.data.gov.in/resource/{resource_id}`
**Auth:** `api-key` query param (free registration)

Custom endpoint, NOT standard CKAN. `filters[state]=Maharashtra` for geographic filtering. Responses can be slow (5-15s).

#### 5.6.4 Indonesia BPS

**Base URL:** `https://webapi.bps.go.id/v1/api/`
**Auth:** `key` query param (free registration)

`domain` = 2-digit province or 4-digit regency code. `0000` = national.
Static and dynamic tables available.

#### 5.6.5 Israel CBS

**Base URL:** `https://api.cbs.gov.il/index/data/`
**Auth:** None

Limited to price indices only: `price_all`, `cpi`, `housing`, `inputs`.
```
GET /index/data/price_all?lang=en&format=json
```

#### 5.6.6 South Korea KOSIS

**Base URL:** `https://kosis.kr/openapi/`
**Auth:** `apiKey` param (free registration)

Use `kosis.kr` directly — `kostat.go.kr` is unreliable after 2024 agency reorganization.
Classification dimension params `objL1`–`objL8` must be set to `ALL` for full retrieval.

#### 5.6.7 Mexico INEGI

**Base URL:** `https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/`
**Auth:** Token in URL path (not query param)

```
/INDICATOR/{indicator_key}/{lang}/{geo_code}/{recent}/{source}/{version}/{token}?type=json
```

2-digit state codes (01–32). Indicator keys only discoverable via web UI.

#### 5.6.8 Brazil IBGE

**Base URL:** `https://servicodados.ibge.gov.br/api/v3/agregados/`
**Auth:** None

```
GET /agregados/1301/periodos/2022/variaveis/93?localidades=N3[all]
```

Locality syntax: `N3[all]` (all states), `N6[all]` (all municipalities), `N6[N3[35]]` (all municipalities in SP).
7-digit IBGE municipality codes. Portuguese-only responses.

#### 5.6.9 Argentina datos.gob.ar

**Base URL:** `https://apis.datos.gob.ar/series/api/`
**Auth:** None

```
GET /series/?ids=143.3_NO_D_NLACTE_2TRIM_39&format=json&start_date=2010-01-01
```

30,000+ time series. `data` is 2D array (column 0 = date). No geo filter — geography encoded in series ID. Max 1000 records/request, paginate with `start`.

Full catalog: `GET /dump/series-tiempo-metadatos.csv`

#### 5.6.10 New Zealand Stats (Aotearoa Data Explorer)

**Base URL:** `https://api.data.stats.govt.nz/rest/`
**Auth:** `Ocp-Apim-Subscription-Key` header (free tier at portal.apis.stats.govt.nz)

SDMX 2.1 compliant. Agency ID: `STATSNZ`. Old `api.stats.govt.nz` OData endpoint is dead since Aug 2024.

#### 5.6.11 Thailand NSO

**Working data endpoint:** `https://ns1-stathub.nso.go.th/rest/`
**Registry (wrong for data):** `https://sdmx.nso.go.th/FusionMetadataRegistry/`
**Auth:** None. Agency: `TNSO`.

Limited dataset coverage. Expanding in collaboration with UNESCAP.

---

### 5.7 Overpass & Web Dataset Sources

#### Overpass API

**URL:** `https://overpass-api.de/api/interpreter`
**Alt:** `https://overpass.kumi.systems/api/interpreter`
**Rate:** ~10,000 req/day, ~1 GB/day

Slot-based throttling. Check `GET /api/status` for available slots.
`Retry-After` header on 429 responses.

Output verbs: `out center` (point per way), `out geom` (full geometry), `out count` (pre-flight).

#### Our World in Data

Direct CSV via Grapher: `https://ourworldindata.org/grapher/{slug}.csv`
Dedicated repos: `https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv`
All CSVs include `iso_code` (ISO3) column.

#### HDX (Humanitarian Data Exchange)

CKAN API: `https://data.humdata.org/api/3/action/package_search?q={query}`
Download URL in `resources[].url`. Filter by format: `fq=res_format:GeoJSON`.

#### Natural Earth

Pre-built GeoJSON: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`
CDN for ZIP: `https://naciscdn.org/naturalearth/{scale}/{category}/{filename}.zip`
(Note: `naturalearthdata.com` returns 406 for programmatic access — use `naciscdn.org`)

#### USGS Earthquake

Real-time GeoJSON feeds: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{filter}_{timeframe}.geojson`
Historical: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2024-01-01&minmagnitude=6`

#### Wikidata SPARQL

Endpoint: `https://query.wikidata.org/sparql?query={SPARQL}&format=json`
Key property: `P625` (coordinate location). 60-second query timeout.

---

## 6. Aggregator Databases (Kolada-liknande)

Research on databases that compile data from multiple sources into a single API — similar to Sweden's Kolada.

### 6.1 Nordic/European Aggregators

#### Sotkanet (Finland) — THL Welfare Indicators

**Base URL:** `https://sotkanet.fi/rest/1.1/`
**Auth:** None
**Indicators:** ~3,700 welfare/health/social indicators
**Coverage:** All Finnish municipalities, wellbeing counties (hyvinvointialueet), hospital districts, NUTS regions. Data from 1990+.

Key endpoints:
```
GET /indicators                    # All ~3,700 indicators
GET /indicators/{id}               # Single indicator metadata
GET /regions                       # All geographic regions
GET /json?indicator=127&years=2009,2010&genders=total&region=832   # Data query
```

Response: array of `{indicator, region, year, gender, value, absolute_value}`.

Geographic codes: Finnish municipality codes (KUNTA), provinces (MAAKUNTA), wellbeing areas (HYVINVOINTIALUE), hospital districts (SAIRAANHOITOPIIRI), NUTS levels.

Formats: JSON, JSON-stat, CSV. License: CC BY 4.0.

**Assessment: Excellent Kolada equivalent for Finland. Same pattern — subnational KPIs, no auth, REST/JSON.**

---

#### NOMIS (UK Labour Market Statistics)

**Base URL:** `https://www.nomisweb.co.uk/api/v01/`
**Auth:** Optional free key (25K rows without, 100K with)
**Indicators:** ~1,300 datasets (Census 2021, LFS, APS, DWP benefits, ASHE earnings)
**Coverage:** England, Wales, Scotland, Northern Ireland at LA district, ward, LSOA/MSOA level

Key endpoints:
```
GET /dataset                                  # All datasets
GET /dataset/{id}.def.sdmx.json               # Dataset definition
GET /dataset/NM_17_1.data.csv?geography=TYPE448&cell=403&measures=20100&time=latest
```

`TYPE448` = local authority districts, `TYPE499` = wards.

Formats: SDMX-JSON, CSV, Excel, RSS.

**Assessment: UK's closest equivalent to Kolada. Deep subnational coverage, free, REST API.**

---

#### Fingertips (England Public Health)

**Base URL:** `https://fingertips.phe.org.uk/api/`
**Auth:** None
**Indicators:** ~1,000+ public health indicators across ~80 profiles
**Coverage:** GP practice, ICB, county/unitary authority, district level (England only)

Key endpoints:
```
GET /profiles                                 # All profiles
GET /area_types                               # Geographic levels
GET /areas/by_area_type?area_type_id=202      # Areas at district level
GET /latest_data/by_indicator_id?indicator_id=10101&area_type_id=202
GET /all_data/csv/by_indicator_id?indicator_id=10101&area_type_id=202  # Full CSV
```

Area type IDs: `101`=GP practice, `153`=ICB, `201`=county/UA, `202`=district/UA.

Swagger docs at `https://fingertips.phe.org.uk/api`.

**Assessment: Excellent for health data. ~1000 indicators, no auth, REST/JSON, subnational.**

---

#### data.police.uk (UK Crime Data)

**Base URL:** `https://data.police.uk/api/`
**Auth:** None
**Rate limit:** 15 req/s sustained
**Coverage:** England, Wales, Northern Ireland — street-level crime by force/neighbourhood

Key endpoints:
```
GET /crimes-street?lat=51.5&lng=-0.1&date=2024-01
GET /forces                           # All police forces
GET /forces/{force}/neighbourhoods    # Neighbourhoods in force
GET /crime-categories?date=2024-01
```

Categories: `anti-social-behaviour`, `burglary`, `violent-crime`, `vehicle-crime`, etc.

**Assessment: Good for crime maps. Point-based queries, no auth, monthly data since 2010.**

---

#### Nordic Statistics Database (Cross-Nordic)

**Base URL:** `https://pxweb.nordicstatistics.org/api/v1/en/`
**Auth:** None
**Rate limit:** 10 calls per 10 seconds, max 1000 values per call
**Coverage:** All Nordic countries (SE, NO, DK, FI, IS + Faroe Islands, Greenland, Åland) at national, regional, and municipal levels

Standard PxWeb API — POST with selection JSON to retrieve data. Harmonized cross-Nordic indicators from all national statistical institutes + Eurostat + OECD.

**Assessment: Unique cross-Nordic comparison data. PxWeb format (already supported).**

---

#### ARDECO (EU JRC Regional Database)

**Base URL:** `https://territorial.ec.europa.eu/ardeco/`
**Auth:** None
**Coverage:** EU + EFTA + candidate countries at NUTS1/2/3 + metro region level
**Variables:** ~100 variables — demography, employment, GDP, capital formation — with long time series

Access via R package `ARDECO` or direct API. JRC applies harmonization and gap-filling beyond what Eurostat provides.

**Assessment: Curated, cleaned EU regional data. Closer to Kolada in philosophy than raw Eurostat.**

---

#### OECD Regional Well-Being

**Base URL:** `https://sdmx.oecd.org/public/rest/`
**Auth:** None
**Coverage:** ~2,200 TL3 regions across 38 OECD member countries, 11 well-being dimensions

SDMX format. Dataflows under agency `OECD.CFE.EDS`. Use Data Explorer UI to generate query URLs.

**Assessment: Good for cross-country regional comparisons but only NUTS3-equivalent granularity.**

---

### 6.2 Global Aggregators with APIs

#### Census Reporter (US)

**Base URL:** `https://api.censusreporter.org/1.0/`
**Auth:** None
**Coverage:** All US geographies from state to block group (ACS data)

```
GET /1.0/data/show/latest?table_ids=B01001&geo_ids=16000US5367000
GET /1.0/geo/search?q=Seattle&sumlevs=160
GET /1.0/geo/tiger2020/{GEO_ID}?geom=true   # Boundary + metadata
```

Uses TIGER GEO IDs (FIPS-based). All ACS tables (~20K variables). Open source, self-hostable.

**Assessment: Best simplified US Census API. Free, no auth, includes boundary GeoJSON.**

---

#### Data USA (Tesseract API)

**Base URL:** `https://api.datausa.io/tesseract/`
**Auth:** None

```
GET /tesseract/cubes                           # All datasets
GET /tesseract/data.jsonrecords?cube=acs_yg_total_population_5&drilldowns=State,Year&measures=Population
```

Aggregates ACS, BLS, BEA, Dept of Education. FIPS codes as dimension members. Formats: JSON, CSV, Parquet.

**Assessment: Good US cross-source aggregator. Simple query interface, no auth.**

---

#### HDX HAPI (Humanitarian API)

**Base URL:** `https://hapi.humdata.org/api/v1/`
**Auth:** Free app identifier (no account needed)

```
GET /api/v1/metadata/admin1?location_code=SWE
GET /api/v1/coordination-context/food-security
GET /api/v1/food/food-price
```

Standardized humanitarian indicators: food security, food prices, conflict events, population, health. Uses UN COD p-codes + ISO alpha-3. 44+ indicators, expanded to global coverage 2025.

**Assessment: Good for crisis/development data. Pre-harmonized, standard geo codes.**

---

#### UNESCO UIS Data API

**Base URL:** `https://api.uis.unesco.org/` (via subscription key from databrowser)
**Auth:** Free subscription key

4,000+ education, science, culture indicators. 200+ countries (ISO alpha-3). JSON format. 100K record limit per request.

**Assessment: Good for education statistics. Free key, broad coverage.**

---

#### UNICEF Data Warehouse (SDMX)

**Base URL:** `https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/`
**Auth:** None

```
GET /dataflow/UNICEF/all/latest               # All dataflows
GET /data/UNICEF,DM,1.0/all                   # Demographics
GET /data/UNICEF,PT,1.0/SWE..                 # Child protection, Sweden
```

Child welfare indicators: protection, nutrition, MNCH, HIV, education. 235 countries (ISO alpha-3). SDMX format.

**Assessment: Niche but authoritative for child welfare data.**

---

#### OpenAQ (Air Quality)

**Base URL:** `https://api.openaq.org/v3/`
**Auth:** Free API key (`X-API-Key` header)

```
GET /v3/locations?country_id=SE&limit=100     # Monitoring stations
GET /v3/measurements?location_id={ID}         # Raw measurements
GET /v3/parameters                            # Pollutant types
```

30,000+ monitoring locations in 100+ countries. PM2.5, PM10, NO2, O3, SO2, CO. Lat/lon coordinates + ISO country codes.

**V1/V2 retired Jan 2025 — use V3 only.**

**Assessment: Excellent for environmental maps. Real-time point data, global coverage.**

---

#### Global Forest Watch

**Base URL:** `https://data-api.globalforestwatch.org/`
**Auth:** Free API key (register at globalforestwatch.org, expires after 1 year)

```
GET /dataset                                  # All datasets
GET /dataset/{NAME}/latest/query              # Query dataset
POST /dataset/{NAME}/latest/query             # POST with GeoJSON polygon
```

Tree cover loss/gain, deforestation alerts, carbon stocks. ISO/GADM codes or custom GeoJSON polygon.

**Assessment: Good for environmental/land use maps. Supports custom area queries.**

---

#### Japan RESAS (Regional Economy)

**Base URL:** `https://opendata.resas-portal.go.jp/api/v1/`
**Auth:** Free API key (`X-API-KEY` header)

```
GET /api/v1/prefectures
GET /api/v1/cities?prefCode=13
GET /api/v1/population/composition/perYear?prefCode=13&cityCode=-
```

Regional economic data: industry, population projections, real estate, tourism, agriculture. Prefecture + municipality level (JIS codes). Primarily Japanese.

**Assessment: Kolada-like for Japan. Pre-aggregated regional indicators, subnational.**

---

#### Statistics Canada WDS

**Base URL:** `https://www150.statcan.gc.ca/t1/wds/rest/`
**Auth:** None

```
GET /getAllCubesListLite                         # All 15,000+ tables
POST /getDataFromCubePidCoordAndLatestNPeriods   # Data by table+coordinate
POST /getBulkVectorDataByRange                   # Bulk series by date range
```

15,000+ tables. Province/territory, census division, CMA, census subdivision. JSON format.

**Assessment: Good Canadian aggregator. Broad coverage, no auth, JSON.**

---

### 6.3 City/Regional Open Data Platforms

#### Socrata/SODA API (US cities)

Standard SODA 2 pattern: `GET https://{domain}/resource/{4x4-id}.json?$where=...&$limit=1000`
SODA 3 (new): `GET https://{domain}/api/v3/{4x4-id}/query.json` (requires app token)

Discovery API: `https://api.us.socrata.com/api/catalog/v1` — search across all Socrata portals.

| Portal | URL | Notable datasets |
|---|---|---|
| NYC | `data.cityofnewyork.us` | 2,500+ datasets; crimes, 311, permits |
| Chicago | `data.cityofchicago.org` | Crimes, transit, permits, boundaries |
| San Francisco | `data.sfgov.org` | Permits, transit, neighborhoods |
| LA | `data.lacity.gov` | + `geohub.lacity.org` for spatial |
| Seattle | `data.seattle.gov` | Wages, permits, 311 |
| NY State | `data.ny.gov` | State health, education, economy |
| Texas | `data.texas.gov` | State agency datasets |

SoQL query language: `$select`, `$where`, `$group`, `$order`, `$limit`, `$offset`. Geo operators: `within_box()`, `within_circle()`.

Max 50,000 rows/request (SODA 2.1). Rate limit with token: 1,000 req/rolling period.

---

#### Opendatasoft (French/European cities)

Standard pattern: `GET https://{portal}.opendatasoft.com/api/explore/v2.1/catalog/datasets/{id}/records?where={odsql}&limit=100`

Native GeoJSON export: `/catalog/datasets/{id}/exports/geojson`

| Portal | URL |
|---|---|
| Paris | `opendata.paris.fr` |
| Toulouse | `toulouse-metropole.opendatasoft.com` |
| Bordeaux | `opendata.bordeaux-metropole.fr` |
| Rennes | `rennes-metropole.opendatasoft.com` |

Geographic granularity: arrondissement, quartier, IRIS (French census unit).

---

#### Amsterdam DSO-API

**Base URL:** `https://api.data.amsterdam.nl/v1/`
**Auth:** None

```
GET /v1/gebieden/buurten/?_format=geojson    # Neighbourhood boundaries
GET /v1/bbga/statistieken/                    # Area statistics by neighbourhood
```

Excellent buurt/wijk/stadsdeel hierarchy. GeoJSON native. Dutch field names.

---

#### CKAN Portals (Global)

Standard pattern: `GET https://{host}/api/3/action/package_search?q={query}`

| Portal | URL | Coverage |
|---|---|---|
| data.gov.uk | `data.gov.uk` | 50K+ UK gov datasets |
| data.gov.au | `data.gov.au` | 800+ AU orgs |
| open.canada.ca | `open.canada.ca` | CA federal + provincial |
| data.europa.eu | `data.europa.eu` | 1.6M+ EU datasets |
| data.ca.gov | `data.ca.gov` | California |
| data.london.gov.uk | `data.london.gov.uk` | London boroughs |
| daten.berlin.de | `daten.berlin.de` | Berlin |

---

### 6.4 Summary: Best New Aggregator Sources for Atlas

**Tier 1 — High value, easy integration (Kolada-pattern):**

| Source | Country | API | Auth | Indicators | Subnational | Geo codes |
|---|---|---|---|---|---|---|
| **Sotkanet** | Finland | REST/JSON | None | ~3,700 | Municipality, wellbeing area | FI municipality codes |
| **Fingertips** | England | REST/JSON | None | ~1,000 | LA district, GP practice | GSS codes |
| **NOMIS** | UK | REST/SDMX | Optional key | ~1,300 datasets | LA, ward, LSOA | ONS codes |
| **Census Reporter** | US | REST/JSON | None | All ACS tables | State to block group | FIPS |
| **Data USA** | US | REST/JSON | None | Multi-source cubes | State, county, metro | FIPS |
| **OpenAQ** | Global | REST/JSON | Free key | 12+ air quality params | Station lat/lon | ISO + coords |

**Tier 2 — Good value, moderate effort:**

| Source | Country | API | Auth | Notes |
|---|---|---|---|---|
| **RESAS** | Japan | REST/JSON | Free key | Regional economy, prefecture+city |
| **HDX HAPI** | Global | REST/JSON | Free app ID | Humanitarian indicators, p-codes |
| **StatCan WDS** | Canada | REST/JSON | None | 15K+ tables, province to CSD |
| **ARDECO** | EU | REST/R pkg | None | Curated NUTS-level regional data |
| **data.police.uk** | UK | REST/JSON | None | Street-level crime, monthly |
| **Nordic Statistics** | Nordic | PxWeb | None | Cross-Nordic comparisons |

**Tier 3 — Niche but useful:**

| Source | Notes |
|---|---|
| UNESCO UIS | Education stats, 200+ countries, free key |
| UNICEF SDMX | Child welfare, 235 countries, no auth |
| Global Forest Watch | Deforestation, free key, custom GeoJSON queries |
| Amsterdam DSO-API | Neighbourhood stats, GeoJSON native |
| Socrata/NYC/Chicago | City-level datasets, SoQL queries |

**Confirmed download-only (no REST API):**
Gapminder, V-Dem, Freedom House, Transparency International, Global Terrorism Database, IHME GBD, Global Carbon Project, Opportunity Insights, County Health Rankings, USAFacts, Brazil Atlas do Desenvolvimento Humano, Teleport (likely defunct).

---

## 7. Wikipedia / Wikidata API Evaluation

### Overview

The Wikimedia ecosystem offers one genuinely valuable integration: **Wikidata via SPARQL**. It covers a category of "encyclopedic" map data (heritage sites, volcanoes, battles, landmarks) that no existing Atlas integration addresses. Wikipedia REST APIs add modest value for article enrichment. DBpedia and PageViews are not useful.

### API Inventory

| API | Base URL | Auth | Map value |
|---|---|---|---|
| **Wikidata SPARQL** | `https://query.wikidata.org/sparql` | None (User-Agent required) | **High** — thematic point maps |
| Wikidata REST v1 | `https://www.wikidata.org/w/rest.php/wikibase/v1` | None | Low — single entity lookup only |
| Wikipedia GeoSearch | `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` | None | Low — article overlay |
| Wikipedia REST summary | `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` | None | Low — popup enrichment |
| Commons GeoSearch | `https://commons.wikimedia.org/w/api.php?list=geosearch` | None | Low — photo enrichment |
| DBpedia SPARQL | `http://dbpedia.org/sparql` | None | Skip — Wikidata is better source |
| PageViews API | `https://wikimedia.org/api/rest_v1/metrics/pageviews/` | None | None — no geographic resolution |

### Wikidata SPARQL — Key Geographic Properties

| Property | Label | Use |
|---|---|---|
| P625 | coordinate location | Primary point for all items |
| P1082 | population | Demographic data |
| P2046 | area | Size in km² |
| P2044 | elevation | Terrain height |
| P2048 | height | Building/structure height |
| P297 | ISO 3166-1 alpha-2 | 2-letter country code |
| P298 | ISO 3166-1 alpha-3 | 3-letter country code |
| P605 | NUTS code | European regional code |
| P238 | IATA airport code | Airport identifier |
| P1435 | heritage designation | UNESCO etc. |
| P782 | Swedish municipality code | SCB 4-digit code |
| P131 | located in admin entity | Admin hierarchy |
| P17 | country | Country link |

### SPARQL Limits

| Constraint | Value |
|---|---|
| Hard query timeout | 60 seconds |
| CPU time per minute/IP | 60 seconds (burst: 120s) |
| GET request cache | 5 minutes |
| Max safe result rows | ~200,000 |

### Use Case Evaluations

#### UNESCO World Heritage Sites — STRONG FIT
```sparql
SELECT ?site ?siteLabel ?coord ?countryLabel ?year WHERE {
  ?site wdt:P1435 wd:Q9259 ;
        wdt:P625 ?coord .
  OPTIONAL { ?site wdt:P17 ?country . }
  OPTIONAL { ?site wdt:P571 ?inception . BIND(YEAR(?inception) AS ?year) }
  ?country wdt:P30 wd:Q46 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
```
~1,150 sites globally, ~90% with coordinates. Execution: 5-15s. **No equivalent in Atlas.**

#### Historical Battles — STRONG FIT
```sparql
SELECT ?battle ?battleLabel ?coord ?date WHERE {
  ?battle wdt:P31 wd:Q178561 ;
          wdt:P625 ?coord ;
          wdt:P361 wd:Q361 .        # part of: World War I
  OPTIONAL { ?battle wdt:P585 ?date . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY ?date
```
200-400 results per major conflict. **No equivalent in Atlas.**

#### Volcanoes — STRONG FIT
```sparql
SELECT ?volcano ?volcanoLabel ?coord ?elevation ?countryLabel WHERE {
  ?volcano wdt:P31/wdt:P279* wd:Q8072 ;
           wdt:P625 ?coord .
  OPTIONAL { ?volcano wdt:P2044 ?elevation . }
  OPTIONAL { ?volcano wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
```
800-1,500 results. ~70-80% have elevation. **No equivalent in Atlas.**

#### Swedish Municipalities (population) — FUNCTIONAL
```sparql
SELECT ?mun ?munLabel ?coord ?population ?munCode WHERE {
  ?mun wdt:P31 wd:Q127448 ;
       wdt:P17 wd:Q34 ;
       wdt:P625 ?coord .
  OPTIONAL { ?mun wdt:P1082 ?population . }
  OPTIONAL { ?mun wdt:P782 ?munCode . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "sv,en" }
}
```
290 results, ~100% coordinate coverage, ~85-90% population. P782 gives SCB 4-digit codes. But SCB/Kolada are more authoritative for this.

#### Universities in Germany — GOOD
```sparql
SELECT ?uni ?uniLabel ?coord ?students ?founded WHERE {
  ?uni wdt:P31/wdt:P279* wd:Q3918 ;
       wdt:P17 wd:Q183 ;
       wdt:P625 ?coord .
  OPTIONAL { ?uni wdt:P2196 ?students . }
  OPTIONAL { ?uni wdt:P571 ?founded . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
```
80-90% of major unis. Student count ~40-60%. Better than Overpass (which lacks attributes).

#### Airports with IATA codes — GOOD
```sparql
SELECT ?airport ?airportLabel ?iata ?coord ?countryLabel WHERE {
  VALUES ?country { wd:Q334 wd:Q836 wd:Q869 wd:Q878 wd:Q928 wd:Q843 }
  ?airport wdt:P31/wdt:P279* wd:Q1248784 ;
           wdt:P17 ?country ;
           wdt:P625 ?coord .
  OPTIONAL { ?airport wdt:P238 ?iata . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
```
~70% IATA coverage among results.

#### GDP per Capita — DO NOT USE
Only ~120-140 countries, inconsistent reference years. World Bank API is far superior.

### Where Wikidata Wins vs Existing Atlas Sources

| Query type | Best source | Why Wikidata? |
|---|---|---|
| UNESCO sites | **Wikidata** | Not in Overpass, World Bank, or Data Commons |
| Historical battles | **Wikidata** | No existing Atlas source at all |
| Volcanoes globally | **Wikidata** | Not in Overpass well; no GVP in Atlas |
| Castles, ruins, forts | **Wikidata** | More structured than Overpass tags |
| Mountain peaks with elevation | **Wikidata** | Better coverage than Overpass for attributes |
| National parks globally | **Wikidata** | Overpass has boundaries but Wikidata adds metadata |

### Where Existing Sources Are Better

| Query type | Better source | Why not Wikidata? |
|---|---|---|
| Restaurants, cafés, shops | **Overpass (OSM)** | Millions vs Wikidata's thousands |
| GDP/population choropleth | **World Bank / Data Commons** | More authoritative, consistent dates |
| Transit/roads | **OSM** | Wikidata has no network data |
| Real-time data | **Web search** | Wikidata is community-updated |

### Infrastructure Risk

Wikidata SPARQL runs on Blazegraph, which Wikimedia Foundation acknowledges is "unsuited for Wikidata's current scale" (16B+ triples). Replacement not expected until 2027. Implications:

1. Design with health check + graceful fallback to cached results
2. Pre-warm cache nightly for all query templates
3. Never use as sole source for promised map types
4. Monitor Wikidata tech mailing list

### Recommended Integration Architecture

**Approach: Pre-built SPARQL query templates matched by AI**

```typescript
interface WikidataQueryTemplate {
  id: string;                    // "unesco_world_heritage"
  label: string;                 // "UNESCO World Heritage Sites"
  keywords: string[];            // ["unesco", "world heritage", "cultural site"]
  sparqlTemplate: string;        // Parameterized SPARQL
  params: string[];              // ["continent", "country"]
  mapType: "point" | "choropleth";
  cacheHours: number;
  coverageNote: string;
}
```

Start with 15-20 templates. AI matches user prompt to template. Only fall through to LLM-generated SPARQL as experimental tier.

**SPARQL optimization tips:**
1. Avoid `wdt:P31/wdt:P279*` in large queries — enumerate specific QIDs with `VALUES`
2. Use `wikibase:box` or `wikibase:around` as first pattern for geographic filtering
3. Wrap expensive subqueries with `LIMIT` before applying labels
4. Use GET for cached (5 min TTL), POST for fresh data

**Caching strategy:**

| Data type | Cache TTL |
|---|---|
| Static features (volcanoes, mountains) | 30 days |
| Heritage sites | 7 days |
| Airports, universities | 7-14 days |
| Population data | 24 hours |
| Historical battles | 30 days |

**Required request headers:**
```
User-Agent: Atlas/1.0 (https://yourdomain.com; contact@example.com)
Accept: application/sparql-results+json
```

### Wikipedia GeoSearch (supplementary)

```
GET https://en.wikipedia.org/w/api.php
  ?action=query&list=geosearch
  &gscoord=59.33|18.07&gsradius=10000&gslimit=50&format=json
```

Returns article titles near a coordinate (10km max radius). Useful for popup enrichment on existing maps — not for data generation.

### Wikipedia REST Summary (supplementary)

```
GET https://en.wikipedia.org/api/rest_v1/page/summary/Stockholm
```

Returns title, description, coordinates, thumbnail, extract. Good for info popups when user clicks a map feature.

### Debate Conclusion on Wikidata Integration

4 agents debated (Pragmatist, Skeptic, User Advocate, Future Thinker). All converged to confidence 7/10 in Round 2. Consensus:

1. **Build it** — 5-8 SPARQL templates, not 15-20
2. **Circuit breaker** — 3-5 failures/60s → open 5 min
3. **Cache** — 14 days (statistics), 30 days (structural/historical)
4. **WikidataQueryAdapter** — separate from StatsApiAdapter
5. **Log unresolved queries first** to validate demand
6. **Coordinate sanity checks** per template (bounding box)
7. **Visible attribution** — "Source: Wikidata, retrieved {date}"
8. **No LLM-generated SPARQL now** — door left open architecturally
9. **Feature flag** off by default, staged rollout
10. **Static GeoJSON extracts** as parallel fallback for highest-traffic queries

Recommended phases:
- Fas 0 (2v): Log unresolved queries, build WikidataQueryAdapter interface
- Fas 1 (4v): 5-8 templates (UNESCO, vulkaner, slag, berg, slott), circuit breaker, cache, feature flag
- Fas 2 (3 mån in): Evaluate P402→Overpass fusion, expand templates from logs, image markers
