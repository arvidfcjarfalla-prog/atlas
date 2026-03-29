# Workflow Guide — Atlas

Lathund för att använda det agentic workflow vi satt upp. Allt triggas via naturligt språk eller kommandon.

---

## Dagligt arbete

### Bygga något (features, refactoring, ny funktionalitet)

Säg något i stil med:

```
bygg en sidebar som visar map layers
implementera CSV-import för datasets
skapa en delningsmodal för kartor
```

Eller kör `/build` explicit.

**Vad som händer:** Full pipeline — clarify-frågor → contract → plan → build → test → verify → review → document. Du godkänner contractet och planen innan något byggs.

**Tips:**
- Du behöver inte vara formell. "fixa så att choropleth-kartor får en legend" triggar samma pipeline.
- Om du ger en detaljerad spec skippar agenten clarify-frågorna.
- Contractet visas alltid innan implementation — säg "kör" för att godkänna eller ändra det du vill.

### Snabba ändringar (bugfixar, småjusteringar)

```
/quick fixa typo i landing page
/quick byt färg på hover-state i sidebar
```

**Vad som händer:** Plan → build → test → done. Ingen contract, ingen review, ingen documenter. Snabbt.

**Tumregel:** Om ändringen tar < 5 minuter och inte påverkar publika API:er, kör `/quick`.

---

## Kodgranskning

### Granska senaste ändringar

```
/review
```

**Vad som händer:** En separat agent med fresh context (ingen historik) läser dina ändrade filer och returnerar en strukturerad verdict med severity-nivåer (critical/major/minor/nit).

### Granska specifika filer

```
/review packages/map-core/src/manifest-compiler.ts apps/web/lib/ai/profiler.ts
```

---

## Dokumentationscheck

```
/document
```

**Vad som händer:** En separat agent kontrollerar att CLAUDE.md och STATUS.md matchar koden. Flaggar drift.

---

## Parallell implementation

### Bygg flera varianter samtidigt (parallel build)

Bra när det finns flera rimliga sätt att bygga något och du inte vet vilket som är bäst.

```
parallel build: implementera caching för MapManifest
testa flera approaches för real-time sync
bygg tre varianter av export-funktionen
```

**Vad som händer:** 3 sub-agenter bygger samma feature med olika approaches i isolerade `tmp/`-mappar. Alla testas. Du får en jämförelsetabell och väljer vinnaren. Förlorarna raderas.

**Skillnad mot consensus:** Consensus utforskar *idéer*. Parallel build bygger *kod* — faktiska implementationer som kan testas och mätas.

---

## Visuell QA — Live QA & Map Judge

### Testa appen live (reverse prompt)

Agenten agerar som en användare — navigerar localhost, skriver prompts, screenshotar kartorna, och bedömer resultatet.

```
/live-qa
testa live med 5 prompts
reverse prompt: testa alla kartfamiljer
testa från localhost
```

**Vad som händer:** Agenten startar dev-servern (om den inte redan kör), genererar 3-5 testprompts, navigerar till `/app/map/new` via Playwright, skriver prompten, väntar på att kartan renderas, tar screenshots, och skickar dem till en separat `map-judge`-agent för visuell utvärdering. Resultatet presenteras som en tabell med PASS/ISSUES/FAIL per scenario.

**Tips:**
- Du kan ge egna prompts: `testa live med "visa jordbävningar i Japan"`
- Kör efter ändringar i manifest-compilern, AI-pipelinen, eller UI-komponenter.
- Agenten använder riktiga API-anrop — hela kedjan testas, ingen mocking.

### Bedöm en screenshot manuellt

```
/map-judge tmp/screenshot.png family:choropleth prompt:"befolkningstäthet i Europa"
```

**Vad som händer:** En separat agent med fresh context (ingen bias) inspekterar screenshoten visuellt och bedömer den mot familjespecifika kvalitetskriterier. Returnerar PASS/ISSUES/FAIL med detaljerad checklist.

**Alla 14 kartfamiljer täckta** — agenten vet hur varje familj ska se ut och vilka vanliga fel som uppstår.

### Integration med /build

Live QA körs automatiskt som steg 5.5 i `/build`-pipelinen — men bara för UI-facing ändringar (filer under `app/`, `components/`, `packages/map-core/`, `packages/map-modules/`). Backend-ändringar skippar steget.

---

## Beslutsstöd

### Utforska alternativ (consensus)

Bra när du har en öppen fråga med flera möjliga svar.

```
ge mig approaches för att hantera real-time uppdateringar av kartor
utforska alternativ för att cacha MapManifest
consensus: ska vi använda Supabase Realtime eller Server-Sent Events?
```

**Vad som händer:** 5 sub-agenter med olika perspektiv (konservativ, aggressiv, UX-fokuserad, etc.) analyserar frågan parallellt. Resultaten aggregeras som consensus/divergence/outlier.

### Debattera ett beslut (debate)

Bra när du har 2-3 alternativ och vill stresstesta dem.

```
debattera: ska vi ha map state i URL eller i Supabase?
vilka perspektiv missar jag kring vår auth-arkitektur?
devil's advocate på vår caching-strategi
```

**Vad som händer:** 3-5 agenter med rollerna pragmatiker/skeptiker/user advocate etc. debatterar i 3 rundor. De läser varandras argument och ändrar sig om motargumenten är starkare.

**Skillnad consensus vs debate:**
- **Consensus** = bred utforskning, "vad finns det för alternativ?"
- **Debate** = djup analys, "vilket alternativ är bäst och varför?"

---

## Skapa nya skills

```
skapa en skill för att migrera databasschema
ny skill: performance benchmarking
```

**Vad som händer:** Meta-agenten läser alla befintliga skills, förstår formatet, och genererar en ny SKILL.md. Du godkänner innan den sparas.

---

## Saker som sker automatiskt

- **Learned rules** — när du korrigerar agenten sparas en regel i `.claude/learned-rules.md`. Nästa session läser den reglerna först.
- **Experience docs** — när du svarar på clarify-frågor sparas Q&A till `tmp/experience/{domain}.md`. Nästa gång du jobbar med samma domän läser agenten filen först och skippar redan besvarade frågor. Flywheel: varje uppgift gör nästa snabbare.
- **Contract verification** — vid `/build` bockas varje FAILURE-villkor av med bevis innan leverans.
- **Resolver** — om reviewern hittar issues, spawnas en separat resolver-agent som ser både originalkod och kritik.
- **Session start** — CLAUDE.md instruerar agenten att läsa learned-rules.md innan den gör något.

---

## Vanliga misstag att undvika

| Misstag | Gör istället |
|---------|-------------|
| Skriva långa specs | Säg vad du vill i en mening. Clarify-frågorna fyller i detaljerna. |
| Godkänna contract utan att läsa FAILURE | FAILURE-klausulen är det viktigaste. Den förhindrar genvägar. |
| Använda `/build` för typo-fixar | Kör `/quick` — full pipeline är overkill för triviala ändringar. |
| Ignorera reviewer-warnings | Warnings är reella. Fixa eller ta ett aktivt beslut att skippa. |
| Ge instruktioner mitt i build | Vänta tills contractet visas. Där ändrar du scope. |

---

## Filstruktur

```
atlas/.claude/
├── commands/
│   ├── review.md          # Kodgransknings-subagent
│   ├── resolve.md         # Resolver-subagent (fixar review-issues)
│   ├── document.md        # Dokumentations-subagent
│   └── map-judge.md       # Visuell QA — bedömer kartscreenshots
├── skills/
│   ├── build/SKILL.md     # Full pipeline (inkl. live QA steg 5.5)
│   ├── quick/SKILL.md     # Snabb pipeline
│   ├── live-qa/SKILL.md   # Reverse prompt från localhost
│   ├── parallel-build/SKILL.md
│   ├── reviewer/SKILL.md  # Reviewer-beskrivning
│   ├── documenter/SKILL.md
│   ├── meta-agent/SKILL.md
│   ├── consensus/SKILL.md
│   └── debate/SKILL.md
├── learned-rules.md       # Ackumulerade regler
└── WORKFLOW-GUIDE.md      # ← denna fil

atlas/tmp/
├── experience/            # Flywheel — ackumulerad domänkunskap
│   └── e2e.md             # Kända selektorer, timeouts, mönster
└── live-qa/               # Screenshots från live QA (transient, gitignored)
```
