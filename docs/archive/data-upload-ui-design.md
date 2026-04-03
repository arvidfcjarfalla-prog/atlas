# Data Upload — UI-design

> Hur uppladdning av egen data integreras i Atlas befintliga gränssnitt.

---

## Nuläge

Atlas har idag **ett enda entry point**: en prompt-ruta.

- **Landing page** (`/`): Hero med prompt-input + typewriter-exempel
- **App hub** (`/app`): Prompt bar (fixed bottom) + template-grid
- **Flöde**: Prompt → clarify → confirm → generate → render

Det här fungerar för användare som vet vad de vill ha och litar på att Atlas hittar data. Men det utesluter:

- Den som redan **har** sin data i en Excel/CSV
- Den som inte vet hur man formulerar en prompt
- Den som vill se **sin egen** försäljningsdata, inte offentlig statistik
- Den som inte litar på att AI väljer rätt data

---

## Designprincip

**Prompt och upload är inte separata flöden — de är två ingångar till samma pipeline.**

Slutresultatet är alltid: GeoJSON med properties → AI genererar MapManifest → MapLibre renderar. Upload-flödet är ett pre-processing-steg som konvergerar mot samma pipeline.

Därför ska upload **inte** vara en separat sektion/sida. Den ska vara **jämbördig med prompten** — lika synlig, lika snabb.

---

## Entry points — var syns upload?

### 1. Landing page (`/`)

**Nu:** Hero med prompt-input.

**Nytt:** Prompt-inputen utökas med ett visuellt val.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│         Maps that think for themselves                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Beskriv en karta, eller släpp en fil...       →  │  │
│  │                                          📎       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│   Har du egen data?  [Ladda upp fil]                     │
│                                                          │
│   Free to start · CSV, Excel, GeoJSON                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Ändringar:
- **📎-ikon** i promptfältet (höger sida, före submit-pilen). Klick öppnar filväljare.
- **Drag-and-drop** direkt på promptfältet. Släpper man en fil → startar upload-flödet.
- **Textlänk under** prompten: "Har du egen data? Ladda upp fil" — för de som inte ser 📎.
- Placeholder-texten ändras till: "Beskriv en karta, eller släpp en fil..."
- Typewriter-exemplen utökas med: "Ladda upp din Excel och se den på karta"

**Interaktion:**
- Fil dras över → prompt-fältet får en blå dashed border + text "Släpp fil här"
- Fil släpps → redirect till `/app/map/new?upload=true` med filen i state
- 📎 klickas → native filväljare, sedan samma redirect
- Prompt skrivs → befintligt flöde, oförändrat

### 2. App hub (`/app`)

**Nu:** Prompt bar (fixed bottom) + templates.

**Nytt:** Upload blir en **jämbördig CTA** bredvid prompten.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Mall:        │  │  Mall:        │  │  Mall:        │  │
│  │  Befolkning   │  │  Valresultat  │  │  Företag...   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│                  ─── eller ───                            │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                                                     │ │
│  │     ┌─────────────────────────────┐                 │ │
│  │     │  Släpp din fil här           │                 │ │
│  │     │  CSV · Excel · GeoJSON       │                 │ │
│  │     │                              │                 │ │
│  │     │     [ Välj fil ]             │                 │ │
│  │     └─────────────────────────────┘                 │ │
│  │                                                     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Beskriv din nästa karta...                  →   │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Ändringar:
- **Drop zone** visas ovanför prompt bar, under templates
- Visuellt dämpad (dashed border, subtle) men tydligt klickbar
- Texten: "Släpp din fil här — CSV · Excel · GeoJSON"
- "Välj fil"-knapp inuti zonen
- Suggestion pills under prompten inkluderar: "Ladda upp egen data"

**Alternativ (enklare):** Ingen separat drop zone — bara samma 📎-ikon i prompt bar som på landing. Fördel: renare. Nackdel: mindre synligt. Rekommendation: testa båda.

### 3. Prompt bar — universell förändring

Oavsett sida ska prompt bar alltid ha:
- 📎-ikon (attachment) till höger om textfältet
- Drag-and-drop-stöd
- Hover-state på 📎: tooltip "Ladda upp CSV, Excel eller GeoJSON"

### 4. Gallery (`/app/gallery`)

**"+ Ny karta"**-knapp (redan befintlig?). Klick → modal med två val:

```
┌──────────────────────────────────┐
│                                  │
│  Hur vill du skapa din karta?    │
│                                  │
│  ┌────────────┐  ┌────────────┐  │
│  │   ✏️        │  │   📄        │  │
│  │  Beskriv   │  │  Ladda upp │  │
│  │  med text  │  │  egen data │  │
│  └────────────┘  └────────────┘  │
│                                  │
└──────────────────────────────────┘
```

"Beskriv med text" → prompt flow (befintligt).
"Ladda upp egen data" → upload flow.

---

## Upload-flödet — steg för steg

### Steg 0: Fil vald

Användaren har dragit en fil eller klickat 📎. Filen finns i minnet.

**Routing:** `/app/map/new` (samma route som prompt-flödet).

Query param `?mode=upload` särskiljer. Komponenten `NewMapPage` renderar upload-UI istället för chat-UI baserat på state.

### Steg 1: Parsing + profiling (0-3 sek)

**Vad användaren ser:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─ Map canvas (tom, grå bakgrundskarta) ──────────────┐ │
│  │                                                      │ │
│  │                                                      │ │
│  │          [Spinner]                                    │ │
│  │          Läser in försäljning_2024.xlsx...            │ │
│  │                                                      │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌─ Sidopanel (384px, höger) ──────────────────────────┐ │
│  │                                                      │ │
│  │  📄 försäljning_2024.xlsx                            │ │
│  │  Läser in...                                         │ │
│  │                                                      │ │
│  │  ░░░░░░░░░░░░░░░░░░░░░░ (progress)                  │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Vad systemet gör (parallellt):**
- Parsear fil (PapaParse / read-excel-file i Web Worker)
- Kör profiler (kolumntyper, kardinalitet, fill rate)
- AI-anrop (Haiku): kolumnnamn + 5 rader → geo/värde/språk
- Probar alla geo-plugins

### Steg 2: Preview (huvud-interaktion)

**Vad användaren ser:**

Samma layout som kartediton (MapShell + sidopanel), men sidopanelen visar upload-preview istället för chat.

```
┌──────────────────────────────────────────────────────────┐
│  ┌─ EditorToolbar ─────────────────────────────────────┐ │
│  │  ← Tillbaka   "Ny karta från data"        [Skapa]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Map canvas ──────────────────┐ ┌─ Sidopanel ──────┐ │
│  │                                │ │                  │ │
│  │   [Mini-karta med matchade     │ │  📄 försäljning  │ │
│  │    geometrier redan ifyllda,   │ │     _2024.xlsx   │ │
│  │    choropleth-preview med      │ │                  │ │
│  │    default-färgskala]          │ │  290 rader       │ │
│  │                                │ │  8 kolumner      │ │
│  │                                │ │                  │ │
│  │                                │ │ ── Geografi ──   │ │
│  │   287 av 290 matchade ✓        │ │  🔵 kommun_kod   │ │
│  │   Legend: Omsättning (tkr)     │ │     287/290 ✓    │ │
│  │                                │ │     [Ändra ▾]    │ │
│  │                                │ │                  │ │
│  │                                │ │ ── Värde ──      │ │
│  │                                │ │  🟢 omsattning   │ │
│  │                                │ │     12k–892k     │ │
│  │                                │ │     [Ändra ▾]    │ │
│  │                                │ │                  │ │
│  │                                │ │ ── Förhandsgr. ──│ │
│  │                                │ │  kommun  | oms.  │ │
│  │                                │ │  0180    | 892k  │ │
│  │                                │ │  1480    | 654k  │ │
│  │                                │ │  0380    | 421k  │ │
│  │                                │ │  ...5 rader till │ │
│  │                                │ │                  │ │
│  │                                │ │ ┌──────────────┐ │ │
│  │                                │ │ │ Skapa karta →│ │ │
│  │                                │ │ └──────────────┘ │ │
│  │                                │ │                  │ │
│  │                                │ │  Eller beskriv:  │ │
│  │                                │ │  ┌────────────┐  │ │
│  │                                │ │  │ "Visa som   │  │ │
│  │                                │ │  │  heatmap"   │  │ │
│  │                                │ │  └────────────┘  │ │
│  └────────────────────────────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Sidopanelens innehåll (uppifrån och ner):**

1. **Filinfo** — namn, radantal, kolumnantal
2. **Geografi-sektion**
   - Vilken kolumn Atlas valt som geo-nyckel (blå badge)
   - Match-rate: "287 av 290 matchade ✓" (grön) eller "142 av 290" (orange)
   - [Ändra ▾] dropdown — byt kolumn
3. **Värde-sektion**
   - Vilken kolumn som visualiseras (grön badge)
   - Min-max-intervall
   - [Ändra ▾] dropdown — byt kolumn
4. **Förhandsgranskningstabell** — 5-8 rader, sorterade efter värde
5. **"Skapa karta →"** — primär CTA, stor, grön
6. **Prompt-fält** — "Eller beskriv hur du vill se din data"
   - Här kan användaren skriva: "visa som heatmap", "normalisera per capita", "visa bara Norrland"
   - Kombinerar upload + prompt-kraft

**Kartan (vänster) visar redan en preview:**
- Om geo-matchning lyckades: choropleth med default-färgskala
- Om punktdata: markörer/kluster
- Match-rate badge i kartan: "287/290"
- Omatchade rader markerade (röda i tabellen, inte på kartan)

### Steg 2b: Problem-state (låg match-rate)

Om match-rate < 60%:

```
┌─ Sidopanel ──────────────────────┐
│                                  │
│  ⚠️ Geografi                     │
│  🔵 region                       │
│     42 av 290 matchade           │
│                                  │
│  Atlas hittade inte alla.        │
│  Värdena ser ut som norska       │
│  fylkesnamn. Stämmer det?        │
│                                  │
│  [Ja, matcha mot Norge]          │
│  [Nej, välj kolumn manuellt ▾]  │
│                                  │
└──────────────────────────────────┘
```

AI-genererat förslag. Actionable — inte ett felmeddelande utan en fråga med knappar.

### Steg 2c: Ingen geo-match alls

```
┌─ Sidopanel ──────────────────────┐
│                                  │
│  📄 data.csv — 1 200 rader      │
│                                  │
│  Atlas hittade ingen geografi    │
│  i din data.                     │
│                                  │
│  Har din data:                   │
│  ○ Regionnamn eller koder?       │
│    → Välj kolumn: [▾]            │
│  ○ Koordinater (lat/lon)?        │
│    → Välj kolumner: [▾] [▾]     │
│  ○ Adresser?                     │
│    → Välj kolumn: [▾]            │
│    (kräver geocoding)            │
│                                  │
└──────────────────────────────────┘
```

Tydlig guide istället för "Error: no geography found".

### Steg 3: Karta skapad

Användaren klickar "Skapa karta →". Två möjliga vägar:

**Väg A — Utan prompt (default):**
- Atlas genererar MapManifest direkt från DataProfile + VizRecommendation
- Ingen AI-generation behövs för enkel choropleth
- Kartan renderas på < 1 sekund
- Sidopanelen byter till vanliga ChatPanel (befintligt)
- Användaren kan nu chatta med kartan: "ändra till blå skala", "visa bara > 500k"

**Väg B — Med prompt:**
- Användaren skrev i prompt-fältet under preview
- Data + prompt skickas till befintlig AI-pipeline
- AI genererar MapManifest med hänsyn till prompten
- "Visa som proportional symbols med logaritmisk skala" → AI tolkar

**I båda fallen landar man i den befintliga kartediton** (`/app/map/[id]`). Upload-specifik UI försvinner. ChatPanel tar över.

---

## Hur upload + prompt samverkar

Det kraftfulla: användaren kan **kombinera** sin fil med en prompt.

### Scenario 1: Fil utan prompt
- Ladda upp `kommuner.csv` → Atlas auto-detekterar → choropleth
- Snabbaste vägen till karta

### Scenario 2: Fil + prompt
- Ladda upp `kommuner.csv` + skriv "visa bara kommuner i Norrland med omsättning > 500k som proportional symbols"
- AI använder datan + prompten

### Scenario 3: Prompt som refererar till fil
- I prompt bar: "Visa min försäljningsdata per kommun" + dra fil
- AI förstår att filen är datan och prompten är instruktionen

### Scenario 4: Fil som komplement till offentlig data
- Ladda upp `mina_butiker.csv` (punkter) + skriv "visa mina butiker ovanpå befolkningstäthet per kommun"
- AI hämtar befolkningsdata, lägger till användarens butiker som overlay

---

## Sidopanelen — upload state vs chat state

Sidopanelen (384px, höger) har idag ett **enda läge**: ChatPanel.

Med upload får den **två lägen** med smooth transition:

```
Upload-state                        Chat-state
┌────────────┐                     ┌────────────┐
│ Filinfo    │                     │ Meddelande │
│ Geografi   │   [Skapa karta]    │ Meddelande │
│ Värde      │   ─────────→       │ Meddelande │
│ Tabell     │                     │            │
│ Prompt     │                     │ [Input]    │
│ [Skapa →]  │                     │            │
└────────────┘                     └────────────┘
```

- Upload-state visas under steg 1-2
- Chat-state visas efter steg 3 (karta skapad)
- Transition: sidopanelens innehåll slide-animeras
- Första chat-meddelandet (automatiskt): "Karta skapad från `försäljning_2024.xlsx`. 287 kommuner matchade. Skriv för att justera."

---

## Responsivitet

### Desktop (>1024px)
Layout som ovan — karta + sidopanel.

### Tablet (768-1024px)
- Sidopanelen blir bottom sheet (dras upp underifrån)
- Kartan tar hela skärmen
- Preview-tabellen kollapsar till sammanfattning

### Mobil (<768px)
- Full-screen steg-flöde (inte split view)
- Steg 1: Filval (stor drop zone)
- Steg 2: Sammanfattning (geografi + värde + match-rate)
- Steg 3: Karta (full screen)
- Sidopanel = bottom sheet med chat

---

## Animationer och mikrointeraktioner

### Drag-over
- Prompt bar / drop zone: dashed border animeras in (border-color transition 150ms)
- Bakgrund: subtle pulse (opacity 0.03 → 0.06, 600ms ease)
- Text ändras till "Släpp fil här"

### Match-rate counter
- Siffran räknar upp: 0 → 287 (400ms, ease-out)
- Grön checkmark fade in vid >80%
- Orange warning vid <60%

### Karta-preview
- Polygoner fade in en i taget (staggered, 20ms delay per polygon, 300ms duration)
- Färgskalan "fylls" från ljust till mörkt

### Steg-transition
- Parsing → Preview: sidopanel slide-in från höger (200ms)
- Preview → Karta skapad: sidopanel crossfade till ChatPanel (300ms)

---

## Tillgänglighet

- Drop zone: `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space)
- Filinfo: `aria-live="polite"` för progress-uppdateringar
- Match-rate: screen reader: "287 av 290 regioner matchade"
- Kolumn-dropdowns: standard `<select>` under huven, styled
- CTA-knapp: `aria-label="Skapa karta från uppladdad data"`
- Drag-and-drop: keyboard-fallback via "Välj fil"-knapp (alltid synlig)

---

## Edge cases

### Excel med flera ark (sheets)
Visa en extra prompt i steg 1:
```
Filen har 3 ark:
○ Försäljning (290 rader)    ← auto-vald (flest rader)
○ Budget (12 rader)
○ Metadata (3 rader)
```

### Fil + prompt redan i landing
Användaren skriver "visa min data på karta" OCH drar en fil. Båda skickas till `/app/map/new`. Prompten visas som första meddelande i chatten, filen processas parallellt.

### Användaren ångrar sig
"Byt fil"-länk alltid synlig i sidopanelen under upload-state. Klick → tillbaka till drop zone med ny filväljare. Befintlig data rensas ur minnet.

### Stor fil (>10 MB)
Steg 1 tar längre. Visa progress bar istället för spinner. Kör server-side parsing (Next.js Route Handler). Användaren ser: "Stor fil — bearbetar på servern..."

---

## Teknisk integration

### Routing
- Ingen ny route. `/app/map/new` hanterar båda flöden.
- Query param `?mode=upload` (optional, sätts vid fil-drop)
- State hanteras i `NewMapPage` component via React state, inte URL

### State management
```typescript
type NewMapMode =
  | { kind: "prompt" }                    // befintligt
  | { kind: "upload"; file: File; stage: UploadStage }

type UploadStage =
  | { step: "parsing" }
  | { step: "preview"; profile: DataProfile; geoResult: GeoResolution }
  | { step: "creating" }
```

### Konvergens med befintligt flöde
Upload-flödet producerar en `AtlasPayload` (GeoJSON + meta). Den matas in i:
1. `profileDataset()` — befintlig profiler, nu med färdiga properties
2. AI → MapManifest (om prompt angavs) ELLER direkt manifest-generering
3. `validateManifest()` → `compileLayer()` → MapLibre GL

Inget i rendering-pipelinen behöver ändras.

### Ny komponent-hierarki
```
NewMapPage
├── PromptFlow (befintlig)
│   └── ChatPanel, MapShell, etc.
└── UploadFlow (ny)
    ├── UploadDropZone
    ├── UploadParsingState
    ├── UploadPreviewPanel
    │   ├── FileInfoSection
    │   ├── GeoMatchSection
    │   ├── ValueColumnSection
    │   ├── DataPreviewTable
    │   └── UploadPromptInput
    └── → konvergerar till befintlig MapEditor
```
