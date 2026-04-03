# Crosswalk Lookup Tables

Static JSON files mapping national statistical codes to international standards (ISO 3166-2, NUTS, FIPS). Used by source adapters to join data to geographic boundary files.

## Files

| File | From → To | Entries | Use case |
|---|---|---|---|
| `iso2-to-iso3.json` | ISO 3166-1 alpha-2 → alpha-3 | 250 | UNESCO UIS, OpenAQ, any ISO2 source |
| `m49-to-iso3.json` | UN M49 numeric → ISO3 | 239 | UN SDG API |
| `us-state-fips.json` | US postal abbr → 2-digit FIPS | 56 | FRED, CDC, FBI |
| `wb-aggregate-blocklist.json` | World Bank aggregate codes | 46 | Filter WB response |
| `jp-jis-to-iso.json` | JIS X0401 → ISO 3166-2:JP | 47 | Japan e-Stat, RESAS |
| `kr-kosis-to-iso.json` | KOSIS 2-digit → ISO 3166-2:KR | 17 | Korea KOSIS |
| `br-ibge-to-iso.json` | IBGE 2-digit → ISO 3166-2:BR | 27 | Brazil IBGE |
| `mx-inegi-to-iso.json` | INEGI 2-digit → ISO 3166-2:MX | 32 | Mexico INEGI |
| `id-bps-to-iso.json` | BPS 2-digit → ISO 3166-2:ID | 38 | Indonesia BPS (post-2022 Papua split) |
| `ar-indec-to-iso.json` | INDEC 2-digit → ISO 3166-2:AR | 24 | Argentina datos.gob.ar |
| `de-ags-to-nuts.json` | AGS 2-digit → NUTS1 | 16 | Germany Destatis |
| `es-ccaa-to-nuts.json` | CCAA code → NUTS2 | 19 | Spain INE |
| `fr-dept-to-nuts.json` | Département → NUTS3 | 101 | France INSEE |
| `pl-teryt-to-nuts.json` | TERYT 2-digit → NUTS2 | 16 | Poland GUS BDL |
| `nuts2016-to-nuts2021.json` | NUTS version changes | ~40 | Eurostat time series |

## Usage

```typescript
import isoMap from "./crosswalks/iso2-to-iso3.json";
const iso3 = isoMap["SE"]; // "SWE"
```

Note: `pl-teryt-to-nuts.json` key `"14"` (Mazowieckie) returns an array `["PL91","PL92"]` — handle this case.

## Provenance

Each file contains `_description` and `_source` metadata fields. Built from official sources (Eurostat, Census Bureau, national statistical offices). Reviewed 2026-04-03.

## Related docs

- `DATA_SOURCE_RESEARCH.md` — Full API research for ~50 data sources
- `docs/source-integration-spec.md` — Joinability matrices and implementation plan
