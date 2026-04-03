<!-- last-reviewed: 2026-04-03 -->
# Atlas Platform Plan

> Sammanställning av research: målgrupper, konkurrenter, gap-analys, Datawrapper deep-dive,
> datauppladdnings-design, blueprint-status, och 5-perspektiv consensus review.
>
> Reviderad efter consensus: locator map framflyttad, team-features borttagna,
> delningslänk + CMS-export tillagda i fas 1, activation metric definierad.

---

## Vad Atlas är

En AI-driven kartplattform. Skriv en mening → få en publicerbar karta med riktig data.
Ingen annan plattform gör detta. Datawrapper kräver CSV + manuellt kolumnval + 15 min arbete.
Atlas kräver en mening.

## Vem Atlas är till för

**Primärt:** Journalister och kommunikatörer som behöver kartor men inte kan GIS.
81% kodar inte. Behöver karta på <15 min. Budget: $0–200/mån.

**Sekundärt:** Analytiker och forskare — högre betalningsvilja, mer smärta kring
"data finns men ingen karta". Atlas 70+ inbyggda datakällor matchar deras workflow.

**Inte nu:** GIS-proffs (har ArcGIS), utvecklare (har Mapbox).

## Hotet

- **Google Earth AI + Gemini** — NL→karta redan lanserat. 1.5 miljarder Maps-användare.
  Realistiskt fönster: **6–12 månader** (inte 12–18 — Google kan vara snabbare).
- **Datawrapper** — Äger 10K+ redaktioner. Att lägga till NL-prompting tar dem 6–12 mån.
- **Flourish/Canva** — $26B, 200M+ användare, AI pågår.

**Försvar som håller:** Djup integration med officiella datakällor (SCB, Eurostat, PxWeb)
+ kartografisk kvalitet + AI-intelligens. Generisk NL→karta blir commodity — data-moaten gör det inte.

## Activation metric

> **En användare är aktiverad när deras karta bäddats in eller delats.**

Datawrappers virala loop: gör karta → embed → artikel publiceras → kollegor ser → signerar upp.
Atlas behöver samma loop. Mätning: `share_count` och `embed_count` per användare.
Allt i planen prioriteras mot: "leder detta till fler delade kartor?"

---

## Vad Atlas har som ingen annan har

| Fördel | Detalj |
|--------|--------|
| NL→karta | Prompt → data → rendering. Datawrapper har 0% AI. |
| Inbyggda datakällor | 70+ (PxWeb, Eurostat, World Bank, Overpass) — ingen CSV-upload behövs |
| 14 kartfamiljer | vs Datawrapper 5. Heatmap, flow, 3D, timeline, hexbin — allt saknas hos DW |
| Chat-redigering | "Gör den blåare" fungerar. DW kräver manuell UI-interaktion |
| AI-driven kartintelligens | Väljer kartfamilj, färger, klassificering automatiskt |
| Jämför-vy | Side-by-side med delare. DW har inte detta |
| Multi-layer | Choropleth + punkter + flöden i samma karta. DW: max 1 layer |

---

## Planen: 4 faser

### Fas 1: Begriplighet + delning (0–6 veckor)

> Gör Atlas begripligt, delbart, och professionellt. Fokus: nya användare förstår vad de
> kan göra, och kartor de skapar kan publiceras och delas direkt.

**1.1 Onboarding**
- First-time-detection (localStorage)
- Visuella exempel: "Vilken typ av karta?" med bilder av choropleths, punkter, heatmaps
- Promptförslag på engelska (idag bara svenska)
- Kort animation: "Skriv en mening → se kartan"

**1.2 Templates (10–12 st)**
- Täck de viktigaste kartfamiljerna (choropleth, point, heatmap, flow, proportional-symbol,
  timeline — inte nödvändigtvis alla 14)
- Use-case-fokus: valresultat, kriminalitet, BNP-jämförelse, klimat, befolkning
- Riktiga data — Norden, Europa, Afrika, USA (inte bara jordbävningar)

**1.3 Kartografisk hygien**
- Automatisk colorblind-check (skanna alla färgpar, varna vid problem)
- Visa match-rate i editorn ("289/290 kommuner matchade")

**1.4 Delning och export**
- Delningslänk (read-only, inget konto krävs för att visa)
- One-click embed-kod med CMS-hints (responsive wrapper, WordPress-kompatibel)
- PNG-export (redan finns — säkerställ att det funkar sömlöst)
- SVG/PDF-export (Pro-feature)

**1.5 Mobil viewer**
- `/m/[slug]` ska fungera bra på telefon (karta + legend + metadata)
- Embed-sidor responsiva

**Berör:** `apps/web/components/`, `apps/web/app/app/(hub)/`, `apps/web/lib/templates.ts`,
`packages/data-models/`. **Berör inte** AI-pipeline eller tools/.

---

### Fas 2: Egen data + locator map (6–14 veckor)

> Två stora lås-upp: (1) de som har egen data i CSV/Excel, och (2) journalisters
> näst vanligaste karta — "var hände detta?".

**Prereq:** GDPR DPA go/no-go-datum satt innan fas 2 startar.
Om DPA inte klar → fas 2.1–2.2 levereras utan AI-anrop (manuellt kolumnval).
Fas 2.3 skjuts tills DPA klar.

**2.1 Upload MVP (CSV only)**
- 📎-ikon i promptfältet + drag-and-drop
- Parsing i Web Worker (PapaParse)
- Manuellt kolumnval (geo + värde) — inte AI (GDPR-blocker)
- Preview med mini-karta + match-rate (grön/röd tabell)
- Explicita felmeddelanden: "Din fil verkar innehålla postnummer — det stöder vi inte ännu"
- Geo-scope: Sverige kommuner/län + länder globalt

**2.2 Upload + Prompt**
- Kombinera: ladda upp CSV + skriv "visa som heatmap, bara Norrland"
- AI genererar manifest baserat på data + prompt

**2.3 Locator map (ny kartfamilj)**
- OSM-tiles + punkt-/linje-/area-markörer + callout-lines
- Journalisters #2 karttyp — "var hände detta?"
- Naturlig partner till CSV-upload med lat/lng-data

**2.4 AI-driven data-cleaning (efter DPA)**
- Omatchade rader → Haiku: "Matcha ['Sthlm', 'Gbg'] mot ['Stockholm', 'Göteborg']"
- Disambiguering: "Georgia — menade du landet eller delstaten?"
- Preview: gult = AI-förslag, användaren bekräftar
- Aldrig tyst accept av osäker match

**2.5 XLSX-stöd**
- `read-excel-file` (55 kB)
- Arkväljare om filen har flera ark
- Konkret mål: levereras innan fas 2 stängs (inte "later")

**Berör:** `apps/web/app/app/(editor)/map/new/page.tsx`, nytt `UploadFlow`-komponentträd,
`apps/web/lib/ai/tools/csv-*.ts`, `packages/map-core/` (locator-compiler).

---

### Fas 3: Live-data + intelligens (14–24 veckor)

> Kartor som lever. Systemet som lär sig. De unika saker Google inte kan kopiera snabbt.

**3.1 Live-data**
- Google Sheets-koppling: URL → auto-refresh (1 min → 1h → 30 dagar, som Datawrapper)
- "Uppdatera data"-knapp i editorn
- Freshness-metadata: "Data hämtad: 3 mars. Källa uppdateras kvartalsvis."
- Kräver: blueprint fas 1 (artifacts) klart + ny artifact-version vid content_hash-ändring

**3.2 Spike + Arrow maps**
- **Spike map** — vertikal encoding, populärt för val/befolkning
- **Arrow/swing map** — riktningsförändring, kritiskt för valbevakning

**3.3 AI kartförklaring (unikt — framflyttat från fas 4)**
- AI genererar textsammanfattning: "Gotland har högst värde (892k). Medianen är 234k."
- "Exkludera Gotland som outlier?" — actionable förslag
- Flytta hit eftersom det är det mest unika Atlas kan erbjuda — det Google inte kopierar snabbt

**3.4 Artifact switchover (framflyttat från fas 4)**
- Nya kartor pekar på artifacts istället för cache
- Legacy-kartor fallback till geojson_url
- Staleness-detection med content_hash
- En karta som dör för att cachen försvinner är ett förtroende-mord. Infrastruktur, inte feature.

**3.5 Outcome-tracking (Blueprint fas 3)**
- `resolution_outcomes` — spåra saved/abandoned/deleted
- `generation_records` — spåra hur manifest producerades
- Kräver: blueprint fas 2 (sessions + attempts) klart

**3.6 House style presets (Pro-feature)**
- Redaktion laddar upp palett + font en gång → varje karta matchar automatiskt
- Datawrapper tar $599/mån för custom themes. Atlas kan ge det på Pro ($29/mån).
- Skapar inlåsning — svårt att byta bort när alla kartor matchar husstilen.

**Berör:** Supabase-schema, `apps/web/app/api/`, `packages/map-core/` (nya familjer),
`packages/data-models/` (house style types).

---

### Fas 4: Lärande system (24–40 veckor)

> Atlas blir bättre av varje användning. Rätt tabell väljs oftare, rätt karta föreslås snabbare.

**4.1 Table scores + ranking (Blueprint fas 4)**
- `table_scores` per (source, table, topic) — lär sig vilka PxWeb-tabeller som funkar
- Incremental update + 15-min full rebuild
- A/B-test: gammal ranking vs ny ranking

**4.2 Fler datakällor**
- Koppling av nya källor via `/connect-datasource`
- Fler geography plugins via `/connect-geography`
- Baserat på prioritering i `docs/source-integration-spec.md`
- Fokus: utöka data-moaten — detta är det som inte blir commodity

**4.3 Telemetri-validering (Blueprint fas 6)**
- Analysera first-followup-data
- Aktivera ranking-vikter om 70% classifier accuracy + statistisk korrelation

**4.4 Team-funktioner (om efterfrågan finns)**
- Team/workspace med roller (ägare/editor/viewer)
- Inbjudningar, delade mappar, kommentarer
- Byggs BARA om betalande användare efterfrågar det — inte spekulativt

---

## Vad som INTE är med

- **Billing/Stripe** — behövs men är inte produkt-differentiering
- **SSO/SAML** — enterprise-feature, inte MVP
- **Blog/docs-sajt** — content marketing, separat arbete
- **Undo/redo** — nice-to-have, inte blockerande
- **Custom basemap styles** — 3 themes räcker nu
- **3D terrain** — konturer finns redan som overlay
- **Print layout** — PDF-export täcker behovet
- **Real-time co-editing (Figma-stil)** — overkill, delningslänk + house style räcker
- **Versionshistorik-UI** — API finns, men inte tillräckligt high-impact för fas 1.
  Byggs när det behövs.

---

## Beroenden

```
Fas 1 ──────────────────────────────────────→ Oberoende, kan starta direkt
Fas 2 ──────────────────────────────────────→ Oberoende av fas 1, kan köras parallellt
  └─ 2.4 (AI cleaning) beror på DPA med Anthropic — go/no-go-datum krävs
  └─ 2.3 (locator) beror på ny compiler i map-core
Fas 3 ──────────────────────────────────────→ Beror delvis på blueprint fas 1–2
  └─ 3.1 (live-data) beror på artifact-versioning (blueprint fas 1)
  └─ 3.4 (artifact switchover) beror på blueprint fas 1 + storage bucket
  └─ 3.5 (outcomes) beror på sessions/attempts (blueprint fas 2)
Fas 4 ──────────────────────────────────────→ Beror på fas 3 + blueprint fas 2–3
  └─ 4.1 (table scores) beror på outcomes (fas 3.5)
  └─ 4.3 (telemetri) beror på 200+ sessions med first_followup
```

Blueprint-arbetet (PxWeb-buggar → sessions/attempts → outcomes) körs parallellt med
plattformsarbetet (fas 1–2). De rör olika filer och krockar inte.

---

## Mätpunkter

| Fas | Activation metric | Mätbart mål |
|-----|-------------------|-------------|
| 1 | Ny användare → delad karta | >30% av nya användare delar minst 1 karta inom 7 dagar |
| 2 | CSV-upload → publicerad karta | >80% match-rate utan att lämna Atlas, >50% av uploads leder till delning |
| 3 | Karta uppdateras live | >100 kartor kopplade till Google Sheets inom 60 dagar |
| 4 | Bättre first-attempt | +10% first-attempt success rate för PxWeb (mätt via table_scores) |

---

## Consensus-logg

5-perspektiv consensus genomförd 2026-04-03 (neutral, risk-averse, user-empathy, contrarian,
resource-constrained).

**Konsensus (4–5/5):**
- Locator map framflyttad till fas 2 (journalisters #2 karttyp)
- Team-features borttagna från fas 3 (för stort scope, bygg vid efterfrågan)
- Activation metric definierad (delad/embeddad karta)

**Divergens (kräver löpande beslut):**
- CSV-upload kontra att dubbla datakällorna (beslut: båda behövs, men Atlas story är
  "skriv en mening" — inte "ladda upp en fil")
- Journalister kontra analytiker/forskare som primärt segment (beslut: journalister som
  entry point för word-of-mouth, analytiker som betalande segment)

**Outlier-insikter inkorporerade:**
- House style presets → fas 3 som Pro-feature (inlåsning)
- AI kartförklaring → framflyttad till fas 3 (det mest unika, svårt att kopiera)
- Artifact switchover → framflyttad till fas 3 (infrastruktur-korrekthet, inte feature)
- Konkurrensfönstret justerat till 6–12 mån (inte 12–18)
- GDPR DPA som hård prereq med go/no-go-datum

---

## Sammanfattning

Atlas har redan det svåraste — AI som förstår vad du menar och hittar rätt data.
Det som saknas är det som gör en produkt till en plattform:

1. **Begriplighet + delning** (fas 1) — nya användare förstår, skapar, delar
2. **Egen data + locator** (fas 2) — CSV-upload + "var hände detta?"
3. **Live-data + intelligens** (fas 3) — kartor som lever, AI som förklarar, data som håller
4. **Lärande system** (fas 4) — systemet blir bättre av varje användning
