# Data Upload Research — Atlas

> Research genomförd 2026-04-01. Ingen kodändring — enbart underlag för implementationsbeslut.

Se även: [data-upload-ui-design.md](data-upload-ui-design.md) för UI-integrationen.

---

## Universella dataarketyper

All uppladdad data faller i en av sex arketyper, oavsett land/bransch/språk:

| # | Arketyp | Struktur | Förväntat resultat |
|---|---|---|---|
| 1 | Värden per region | Geo-kolumn + värdekolumner | Choropleth |
| 2 | Platser med attribut | Lat/lon + attribut | Punkt/cluster/heatmap |
| 3 | Flöden | Origin + destination + värde | Bågkarta |
| 4 | Händelser i tid+rum | Koordinat + tidsstämpel | Animerad/timeline |
| 5 | Redan spatial | GeoJSON/Shapefile/KML | Direkt rendering |
| 6 | Adresser | Textadresser utan koordinater | Geocoding → punktkarta |

### Automatisk identifiering

```
Fil är GeoJSON/Shapefile/KML?           → Arketyp 5
Koordinatkolumner finns?                → Arketyp 2 (eller 4 om tidskolumn)
Två geo-kolumner (from/to)?             → Arketyp 3
En geo-namnkolumn?                      → Arketyp 1
Adresskolumn (hög kardinalitet, text)?  → Arketyp 6
```

---

## Globala användartyper

| Typ | Andel | Tolerans | Tappar vid |
|---|---|---|---|
| Occasional Professional | 35% | 2-3 steg | GIS-terminologi, geo-match fail |
| Quick Mapper | 25% | 0-1 steg | >30 sek, grå karta |
| Explorer | 15% | 0 steg | Första fel |
| Analyst | 12% | 5-10 steg | Gömda beslut, ingen kontroll |
| Storyteller | 8% | Medium | Generisk design |
| Developer | 5% | Obegränsad (kod) | Inget API |

**75% har dålig data och noll tolerans för friktion.**

### Top 5 orsaker till misslyckade uploads

1. Geo-matchning hittar inget (40-50%)
2. Oklart vilken kolumn som är geografi
3. Nummer tolkas som text (decimalkomma, tusentalsavgränsare)
4. Kartan visar en enda färg (outlier dominerar)
5. Encoding-fel (semikolon som separator, Latin-1)

---

## Pipeline-arkitektur

### Universellt vs landsspecifikt

```
UNIVERSELLT (byggs EN gång)              PLUGIN (per land)
───────────────────────────              ──────────────────
Filparsing                               Geo-kod-matchning
Encoding-detection                       Admin-gränser
Kolumntyp-inference                      Namnaliaser
Numerisk normalisering                   Kodformat
Arketyp-klassificering
Visualiseringsval
Färgskala/klassindelning
```

### Pipeline-steg

```
File → FileParser 🔌 → RawTable
     → Profiler 🌍 → DataProfile
     → GeoResolver (PluginRegistry 🔌 + AI 🤖) → GeoResolution
     → VizSelector 🌍 → VizRecommendation
     → Joiner 🌍 → AtlasPayload
     → Befintlig Atlas-pipeline
```

### AI-anrop

| Anrop | Modell | Latens | Vad |
|---|---|---|---|
| Kolumnanalys | Haiku | <2 sek | Geo/värde på ALLA språk |
| Matchningsförklaring | Haiku | <1 sek | "Norska fylkesnamn före 2024" |
| Disambiguering | Haiku | <1 sek | "Georgia" = land/delstat? |
| Kartförklaring | Sonnet | 2-4 sek | "Gotland är outlier" |

---

## Visualiseringslogik

```
Regionkoder + andel/procent       → CHOROPLETH (Jenks, sekventiell)
Regionkoder + absolut tal         → PROPORTIONAL SYMBOL + varning
Två geo-kolumner + numerisk       → FLOW MAP
Koordinater < 50                  → POINT
Koordinater 50-500                → CLUSTER
Koordinater 500-10k               → HEATMAP / HEXBIN
Koordinater > 10k                 → SCREEN-GRID
Kategorier ≤ 8                    → KVALITATIV FÄRG
Kategorier > 8                    → Top 7 + "Övrigt"
Tidsserie 2-4 punkter             → SMALL MULTIPLES
Tidsserie 5+                      → ANIMERAD TIMELINE
```

---

## Verktyg och tjänster

### Geocoding

| Tjänst | Pris/1k | Gratis/mån | Batch | Caching |
|---|---|---|---|---|
| HERE | $0.83 | 30k | Ja | Ja |
| TomTom | $0.42 | 75k | Ja | Ja |
| Mapbox (perm) | $3.00 | 100k | Ja | Ja |
| Google | $5.00 | 40k | Nej | Nej |
| LocationIQ | $0.30 | 150k | Nej | Ja |

Stack: Nationella APIer → HERE fallback → Pelias self-hosted vid volym.

### Filparsing

| Kategori | Paket | Storlek |
|---|---|---|
| CSV | `papaparse` | 13 kB gz |
| Excel (läs) | `read-excel-file` | 55 kB gz |
| Shapefile | `shpjs` | 50 kB |
| KML/GPX | `@tmcw/togeojson` | 25 kB |
| TopoJSON | `topojson-client` | 20 kB |
| FlatGeobuf | `flatgeobuf` | 150 kB |
| Projektion | `proj4` | 40 kB gz |
| Geo-konvertering | `mapshaper` | 500 kB |

### Geometrikällor

| Nivå | Källa | Licens |
|---|---|---|
| Länder | Natural Earth | Public Domain |
| Regioner (admin-1) | geoBoundaries | PD/CC BY |
| Kommuner (admin-2) | GADM + GISCO LAU | Varierar / CC BY |
| EU statistik | Eurostat GISCO | CC BY |
| USA | Census TIGER/Line | Public Domain |

Hosting: GeoJSON → Mapshaper → Tippecanoe → PMTiles → Cloudflare R2 (~0 kr).

### Data enrichment (tier 1, gratis)

| Feature | Verktyg |
|---|---|
| Buffer, area, centroid | `turf.js` |
| Point-in-polygon | GADM + Turf |
| Befolkning per land | World Bank API |
| Per capita-normalisering | World Bank + Eurostat |
| Väderdata per punkt | Open-Meteo |

### Datavalidering

Pipeline: `zod` → `geojsonhint` + `geojson-rewind` → zip bomb check → `simple-statistics` (outliers) → `turf.unkinkPolygon` → fuzzy matching (`fastest-levenshtein` + `natural`).

### Numerisk normalisering

| Region | Decimal | Tusen | Exempel |
|---|---|---|---|
| USA/UK/Kina | `.` | `,` | 1,234.56 |
| DE/FR/BR | `,` | `.` | 1.234,56 |
| SE/NO/FI | `,` | ` ` | 1 234,56 |

Heuristik: sampla 20+ rader, sista avgränsaren avgör.

---

## Konkurrentgapet

Ingen plattform löser: (1) snabb onboarding + (2) egna geometrier + (3) AI-driven kartproduktion + (4) kartförklaring.

Atlas differentieringar:
1. **Intent-first upload** — "Vad vill du se?" styr kartval
2. **AI geo-matchning** — förslag med confidence, inte felmeddelanden
3. **Kartförklaring** — "Gotland är outlier — exkludera?"
4. **5 steg → 1** — Fil + prompt = karta

---

## MVP-scope

### Iteration 1 (4-6 veckor)
- CSV + GeoJSON i Web Worker
- Universell profiler
- AI kolumn-detection (Haiku)
- Preview med mini-karta + sidopanel
- Geo-matchning: befintliga plugins + länder
- Konvergens till befintligt Atlas-flöde

### Iteration 2
- XLSX, fuzzy matching, koordinat-join
- Fler geo-plugins (NUTS, US, globala admin-1)
- Per capita-normalisering
- Persistent lagring (Supabase + GDPR)

### Iteration 3
- Shapefile/KML, geocoding, isochrones
- Flödesdata, data enrichment
- Dataset-bibliotek
