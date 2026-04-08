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

## Spara session (handoff)

```
/handoff
spara session
```

**Vad som händer:** Agenten skriver en strukturerad sammanfattning av sessionen till `.claude/handovers/`. Nästa session kan läsa filen och fortsätta där du slutade.

**När:** Innan du stänger en lång session, innan en paus, eller när kontext börjar bli lång.

---

## Saker som sker automatiskt

- **Auto-commit** — efter varje svar committas alla ändringar lokalt som en checkpoint. Du tappar aldrig arbete. Push förblir manuellt.
- **Auto-handover** — om >3 filer ändrats och ingen handover skrivits senaste 30 min, sparas en mini-handover automatiskt. Safety net, inte ersättning för `/handoff`.
- **Session-start** — vid sessionstart injiceras: hela `learned-rules.md`, senaste handovern, `key-files-reference.md`, `ai-tools-reference.md`, och en pekare till `STATUS.md`. Staleness-varning visas om >10 okompilerade learned rules.
- **Prompt-routing** — varje prompt klassificeras automatiskt som QUICK eller BUILD via AI-classifier. Quick: direkt action. Build: kör /build-pipeline. Båda returnerar ok:true (aldrig ok:false — det blockerar prompten helt). QUICK är default vid osäkerhet.
- **Verifierings-nudge** — om kod ändras utan att typecheck/test körs, påminns agenten automatiskt.
- **Smart test-routing** — `smart-test.sh` mappar ändrade filer till minimalt testset. Full suite körs bara vid final verification.
- **Eval regression gate** — vid `/build`, om AI-pipeline-filer ändrats (compiler, scorer, validators, examples), körs `pnpm eval` automatiskt och jämförs mot baseline. Flaggar vid >2 poängs nedgång.
- **Kontextbevarande** — innan kontext komprimeras sparas en snapshot till `.claude/handovers/`.
- **Path-scoped regler** — PxWeb-regler laddas bara när PxWeb-filer redigeras. Eval-regler bara vid eval-arbete. Etc.
- **Learned rules** — när du korrigerar agenten sparas en regel med P0-P3 severity i `.claude/learned-rules.md`. P0 = data/security, P1 = build/pipeline, P2 = quality, P3 = style. Nästa session injicerar hela filen vid start.
- **Handover pruning** — handovers äldre än 7 dagar raderas automatiskt vid session-start.
- **Experience docs** — clarify-svar sparas till `tmp/experience/{domain}.md` med `last-verified` datum. Staleness-varning efter 14 dagar. Flywheel: varje uppgift gör nästa snabbare.
- **Contract verification** — vid `/build` bockas varje FAILURE-villkor av med bevis innan leverans.
- **Resolver** — om reviewern hittar issues, spawnas en separat resolver-agent som ser både originalkod och kritik.

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
│   ├── handoff/SKILL.md   # Spara session för nästa session
│   ├── live-qa/SKILL.md   # Reverse prompt från localhost
│   ├── parallel-build/SKILL.md
│   ├── reviewer/SKILL.md  # Reviewer-beskrivning
│   ├── documenter/SKILL.md
│   ├── meta-agent/SKILL.md
│   ├── consensus/SKILL.md
│   ├── debate/SKILL.md
│   ├── subagent-tasks/SKILL.md
│   ├── auto-research/SKILL.md
│   ├── connect-datasource/SKILL.md
│   ├── connect-geography/SKILL.md
│   ├── systematic-debugging/SKILL.md
│   └── ... (+ external framework skills)
├── hooks/
│   ├── session-start.sh       # Injicerar full kontext: learned rules, handover, key-files, ai-tools
│   ├── post-compaction.sh     # Återinjecterar kontext efter komprimering
│   ├── check-doc-staleness.sh # Varnar om docs >60 dagar gamla
│   ├── stop-checkpoint.sh     # Auto-committar efter varje svar
│   ├── auto-handover.sh       # Skriver mini-handover om >3 filer ändrats
│   └── pre-compact.sh         # Sparar kontext innan komprimering
├── scripts/
│   └── smart-test.sh          # Mappar ändrade filer → minimalt testset
├── rules/                     # Path-scoped regler (laddas bara vid behov)
│   ├── eval-modes.md          # Offline/online eval-semantik
│   ├── testing-workflow.md    # Fokuserade tester, verifieringsgate
│   ├── node-script-imports.md # Barrel import-caveat
│   ├── pxweb-geography.md    # PxWeb + geography-plugin regler
│   └── editorial-landing.md   # Editorial tokens, thumbnails, animation
├── docs/
│   ├── key-files-reference.md # Alla viktiga filer i projektet
│   └── ai-tools-reference.md  # AI-verktyg per kategori
├── handovers/                 # Session-överlämningar (gitignored)
├── learned-rules.md           # Ackumulerade regler
└── WORKFLOW-GUIDE.md          # ← denna fil

atlas/tmp/
├── experience/            # Flywheel — ackumulerad domänkunskap
│   └── e2e.md             # Kända selektorer, timeouts, mönster
└── live-qa/               # Screenshots från live QA (transient, gitignored)
```
