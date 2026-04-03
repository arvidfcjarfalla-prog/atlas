# Data Upload — Debattresultat

> 5-perspektivs-debatt genomförd 2026-04-01. Syfte: hitta blinda fläckar i data-upload-research och UI-design.
>
> Perspektiv: Product Manager, Teknisk Arkitekt, Churning User, Dataskyddsombud (GDPR), Konkurrent (Datawrapper/Felt).

---

## Konsensus (alla 5 eniga)

### 1. Delning/export MÅSTE finnas i MVP

Alla perspektiv konvergerade hit oberoende av varandra.

- PM: "det är betalningströskeln"
- Konkurrent: "det är affärsmodellen — Datawrapper tjänar pengar på detta"
- Churning user: "utan det når användaren aldrig sitt mål"
- DPO: "delningslänk kräver egen rättslig grund"
- Arkitekt: godkände implicit

**En karta utan delningslänk är ett halvfärdigt flöde.** Användaren vill dela med chef/kollega/läsare — om det inte går finns inget skäl att komma tillbaka.

Minimum: delningslänk (read-only, inget konto krävs) + PNG-export.

### 2. Skippa AI-detection i v1

Tre oberoende skäl från tre perspektiv:

| Perspektiv | Skäl |
|---|---|
| DPO | Exempelrader till Anthropic = tredjelandsöverföring utan DPA = potentiellt olagligt |
| Konkurrent | AI som gissar fel kolumn förstör förtroendet mer än manuellt val |
| Arkitekt | Eliminerar en hel kategori edge cases, GDPR-compliance-arbete och latensrisker |

Istället: manuellt kolumnval med tydligt UI. AI-detection är roadmap iteration 2, efter DPA med Anthropic och PII-filtrering.

### 3. Avgränsa till Sverige + kommuner i MVP

Inte för att det är lättast — för att om det fungerar perfekt för en geo-nivå kan man bevisa hypotesen. Bred men medioker = omätbart.

MVP geo-scope:
- Sverige: kommuner (290) + län (21)
- Globalt: länder (Natural Earth)

### 4. Explicita scope-guardrails

När data inte stöds: säg det tydligt och länka vidare.

Tyst misslyckande (grå karta, 0% match utan förklaring) är det säkraste sättet att döda word-of-mouth.

Konkret: "Vi stöder just nu CSV-filer med svenska kommuner eller länder. Din fil verkar innehålla [postnummer / koordinater / franska regioner] — det stöder vi inte ännu."

---

## Genuina meningsskiljaktigheter (kräver beslut)

| Fråga | Sida A | Sida B |
|---|---|---|
| **XLSX i v1?** | Churning user: "säljchefen har .xlsx, inte CSV — 0% når ens upload-steget" | Konkurrent + Arkitekt: "CSV only, avsevärt enklare, Excel-stöd är 3+ veckors extra arbete" |
| **Tidsplan** | PM: "4-6 veckor fokuserat" | Arkitekt + Konkurrent: "3-4 månader realistiskt — CSV-parsing tog Datawrapper ett år" |
| **Postnummer i v1?** | Churning user: "35% av affärsdata har postnummer, inte kommuner" | Alla andra: "kommuner räcker för att testa hypotesen" |
| **AI helt borta vs syntetisk data?** | DPO: "skippa extern AI helt i v1" | Arkitekt: "skicka syntetiska exempelvärden istället för riktiga rader — krymper DPIA-ytan dramatiskt" |

---

## Outlier-insikter

### DPO: GDPR gäller från dag ett, inte iteration 2
"MVP utan persistens" skapar falsk trygghet. Behandling sker redan när data lämnar browsern (till server för parsing, till loggar, till error tracking). DPIA ska genomföras innan behandlingen påbörjas — inte planeras till senare.

### Konkurrent: Geo-matchning är underhåll, inte launch
Kommungränser ändras (Sverige 2019, Norge 2024). Namnaliaser ("Västra Götaland" / "VGR" / "Västra Götalands län") kräver redaktionellt underhåll. Planen saknar: vem på teamet äger geo-data löpande?

### Arkitekt: chardet gissar fel på svenska tecken
`chardet` misslyckas med ISO-8859-1 vs Windows-1252 i korta filer. Svenska tecken (å, ä, ö) är det vanligaste felfallet. Kommer hända i produktion dag ett.

### Churning user: Discovery-problemet
Folk vet inte vad de kan göra. En tom textruta hjälper inte. Klickbara exempelfrågor anpassade till datasetet behövs: "Visa befolkning per kommun" ska vara synligt direkt.

### PM: Retention-loop saknas
Varje upload är en engångshändelse. Ingen möjlighet att uppdatera data utan att göra om allt. Utan retention-loop = ingen abonnemangslogik.

---

## Mind changes (starka signaler)

| Vem | Ändring | Skäl |
|---|---|---|
| PM | Confidence 8→7, accepterade smalare scope | Churning users persona-analys visade att postnummer-usern inte ens når upload-steget |
| Konkurrent | Confidence 9→8, la till delning i sin MVP-def | PM:s poäng: "distribution är kärnvärde, inte parsing" |
| Arkitekt | Reviderade tidsplan 6-8v → 3-4 månader | Konkurrentens erfarenhet + GDPR-skiktet i arkitekturen |

---

## Reviderad MVP-scope

### Bygg

- CSV only (inte .xlsx)
- Sverige: kommuner + län
- Länder (globalt, Natural Earth)
- Manuell kolumnval (inte AI-detection)
- Preview med mini-karta + match-rate
- Delningslänk (read-only) + PNG-export
- Explicita guardrails vid icke-stödd data
- Klickbara exempelfrågor i onboarding

### Gör parallellt

- DPA med Anthropic (för iteration 2)
- DPIA (intern, IMY-mall)
- GADM-licensbeslut (byt till geoBoundaries/Natural Earth om kommersiell)
- Validera om syntetiska exempelvärden räcker för AI-kolumnanalys
- Definiera "temporär lagring" tekniskt (exakt vilka lagringsytor, TTL, verifiering)

### Iteration 2 (efter validerad MVP)

- AI-kolumndetection med PII-filtrering + DPA
- XLSX-stöd
- Postnummer (Sverige)
- Fler geo-plugins (NUTS, US counties)
- Retention: uppdatera data utan ny länk
- Per capita-normalisering
- Persistent lagring (Supabase + GDPR)

### Iteration 3

- Shapefile/KML, geocoding, isochrones
- Flödesdata, data enrichment
- Dataset-bibliotek
- API för Developer-segmentet
