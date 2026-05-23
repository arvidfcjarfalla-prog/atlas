# Handoff: anti-ai-ui Claude Code-skill — v3, 2026-05-23

**Status:** Inget byggt än. Research konsoliderad och deltakorrigerad. Denna fil ersätter v2.

**Varför v3:** v2 baserades på antaganden som visade sig fel eller ofullständiga vid empirisk verifiering mot officiella docs. Kritiskt: agent-hooks fungerar inte som v2 antog (de refererar inte namngivna subagenter), subagenter kan inte spawna subagenter, och `paths:`-vs-`globs:`-frågan är inte avgjord. Plus: hela Rauno Freibergs interface guidelines (56 regler) och DISTILLED_AESTHETICS_PROMPT är nu hämtade verbatim.

**Branch (förberedd, ej committed):** `claude/anti-ai-ui-skill-F3R3b` i `arvidfcjarfalla-prog/atlas` och `arvidfcjarfalla-prog/liftcalc`. Byggai out-of-scope.

---

## 0. Ändringar mot v2

| Avsnitt | Ändring | Konsekvens |
|---|---|---|
| Stop-hook arkitektur | `type: "agent"` tar INTE subagent-namn — tar inline prompt | Design-critic-logik måste dupliceras eller använda `type: "command"` + Claude SDK |
| Subagent-orchestrering | Subagenter kan inte spawna subagenter | Orchestreringen körs i main thread eller via skills med `context: fork` |
| Skills-arkitektur | NYTT fynd: `context: fork` + `agent: X` på skills | Kan slå ihop 8 skills + 5 agents till färre filer |
| Subagent-fält | NYA fält: `memory`, `maxTurns`, `permissionMode`, `skills` (preload), `isolation: worktree`, `effort`, `hooks` | Förbättrar critic + frontend-engineer |
| `paths:` vs `globs:` | Docs säger `paths:`. Issue #17204 säger `paths:` YAML-list silently failar och `globs:` funkar. Atlas använder `globs:` men ingen har verifierat triggning | Canary-test behövs |
| DISTILLED_AESTHETICS_PROMPT | Hämtad verbatim — innehåller "Space Grotesk"-varning som saknades i v2 | Använd hela texten i `ANTI_AI_UI.md` |
| Rauno-regler | Komplett 56-regler-lista hämtad (7 kategorier) | Direkt paste-ready till rules-filer |
| Kowalski-regler | Konkreta easing-curves + timing distillerade | Direkt paste-ready till motion-rule |
| Hook decision-control | Verifierad: Stop-hook kan blocka via JSON `{"decision":"block","reason":"..."}` ELLER exit 2 + stderr | Två fungerande implementationsvägar |
| Visibility-flaggor | `disable-model-invocation: true` + `user-invocable: false` båda bekräftade | Använd båda enligt v2 |

---

## 1. Vad vi bygger och varför (oförändrat)

En Claude Code-skill som tvingar Claude att producera UI som inte ser AI-genererad ut. Ersätter "skriv snygg UI"-prompter med en hård process: rollseparerade agenter går igenom ett designflöde, en blockerande Stop-hook hindrar Claude från att säga "klar" tills en kritiker godkänt resultatet.

**100% generisk.** Inga atlas-/liftcalc-antaganden. Stack-detaljer läses från projektets `CLAUDE.md` vid körning. Skillen committas identiskt till båda repos som distributions-vektor.

**Antagen default-stack:** shadcn/ui + Tailwind.

---

## 2. Arkitekturbeslut (REVIDERAT)

### 2.1 Fyra-fas-flöde med rollseparation (oförändrat principiellt)

| Fas | Agent | Får göra | Får INTE |
|---|---|---|---|
| 1 | `product-designer` | Read, Grep, Glob | Skriva kod, MCP-anrop |
| 2 | `ux-architect` | Read, Grep, Glob, Write specs i `docs/`, MCP `registry-directory` | Skriva komponentkod |
| 3 | `frontend-design-engineer` | Read, Write, Edit, Bash, MCP `shadcn` | Hoppa över kritik |
| 4 | `design-critic` | Read, Grep, Glob, Bash | Skriva, redigera |

Read-only-rollernas värde: product-designer kan fysiskt inte skriva kod ens om han försöker. Critic kan bara peka — Stop-hook förmedlar hans bedömning som blockering.

### 2.2 Distribution (oförändrat)

| Vad | Var |
|---|---|
| Skill-källkod | `.claude/skills/anti-ai-ui/`, `.claude/rules/`, `.claude/agents/`, `.claude/hooks/` |
| Repos | `arvidfcjarfalla-prog/atlas` + `arvidfcjarfalla-prog/liftcalc` |
| Branch | `claude/anti-ai-ui-skill-F3R3b` |

Liftcalc saknar `.claude/` helt — bootstrappa. Atlas har redan 5 rules + 24 skills + hooks + learned-rules.

### 2.3 MCP-uppsättning (oförändrat sedan v2)

**INKLUDERAR:** shadcn MCP (frontend-engineer) + registry-directory MCP (ux-architect).
**EXKLUDERAR:** 21st.dev Magic.

### 2.4 NYTT: Hur agent-hooks faktiskt fungerar

Verifierat via raw hooks-docs. Korrekt schema:

```json
{
  "type": "agent",
  "prompt": "Verify that <criteria>. $ARGUMENTS",
  "timeout": 120,
  "model": "haiku"
}
```

Detta spawnar **en ephemeral subagent** med:
- Default tools (Read, Grep, Glob och liknande)
- Max **50 turns**
- `$ARGUMENTS` ersätts med hook-event-JSON

Subagenten returnerar:
```json
{ "ok": true }                        // allow stop
{ "ok": false, "reason": "..." }      // block stop
```

**Viktigt:** prompt-strängen är inline. Den refererar INTE `.claude/agents/design-critic.md`. Personalityn måste vara i prompt-strängen själv.

**Docs säger:** *"Agent hooks are experimental. Behavior and configuration may change in future releases. For production workflows, prefer command hooks."* Lägg in en kommentar i hook-konfigen om detta.

**Alternativ implementation (mer robust, single source of truth):**
```json
{
  "type": "command",
  "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/design-critic.sh"
}
```
där `design-critic.sh` kör en subagent-flow via Claude SDK headless (`claude --agent design-critic -p "review the current diff"`) och returnerar exit 2 + stderr om critic säger nej. Mer komplext, men ändras inte med agent-hook-API.

### 2.5 NYTT: Subagenter kan inte spawna subagenter

Direkt citat docs: *"Subagents cannot spawn other subagents. If your workflow requires nested delegation, use Skills or chain subagents from the main conversation."*

Implikation: 4-fas-flödet är inte "en orchestrator-subagent som kör fyra". Orkestrering sker i main thread, eller via en skill som sekventiellt invokerar fyra fork-skills.

### 2.6 NYTT: Skills med `context: fork` + `agent:` som orchestrerings-primitive

Docs-bekräftat mönster:

```yaml
---
name: critique-ui
description: Review the current UI against anti-AI-slop rules
context: fork
agent: design-critic
allowed-tools: Read, Grep, Glob, Bash
---

Review the current diff and check:
- ...
```

Skill-content blir prompt till subagenten. Subagenten ärver inte main conversation history (förutom om vi använder rena forks utan named agent).

**Konsekvens för mappstruktur:** vi behöver inte separata "skill för att invokera agent" + "subagent". Skill-filen `discover/SKILL.md` kan ha `context: fork, agent: product-designer` och bli den enda inkörningspunkten.

---

## 3. Verifierad Claude Code internals

### 3.1 `paths:` vs `globs:` — ÄNNU EJ AVGJORT

| Källa | Säger |
|---|---|
| Aktuella docs `/en/memory` | `paths:` är dokumenterat fält, exempel använder YAML-list |
| Aktuella docs `/en/skills` | Skill-`paths:` "uses the same format as path-specific rules" |
| Issue #17204 (closed not-planned, stale) | `paths:` YAML-list silently failar, undokumenterat `globs:` funkar |
| Atlas `.claude/rules/*.md` (5 filer) | Alla använder `globs:` + YAML-list |
| Atlas-rules empiriskt verifierade att laddas | **Nej, ingen har testat** |

**Rekommendation:** kör canary-test (avsnitt 9). Default: följ docs och använd `paths:`. Om canary visar att det failar, byt till `globs:` på alla 6 rules-filer.

### 3.2 Skill frontmatter — bekräftade fält

Från `/en/skills`:

| Fält | Användning för anti-ai-ui |
|---|---|
| `name` | filnamn → directory |
| `description` | "Use when…"-prompt-match (medvetet pushig) |
| `disable-model-invocation: true` | `/critique-ui`, `/anti-ai-review` — bara user-trigger |
| `user-invocable: false` | design-critic-only-from-hooks-skill |
| `allowed-tools` | space-separated eller YAML-list |
| `paths` | path-scoping (samma format som rules) |
| `context: fork` | kör i isolerad subagent-context |
| `agent: <name>` | väljer vilken subagent context-fork använder |
| `hooks` | skill-scoped hooks |
| `model` / `effort` | override per skill |
| `arguments` + `$0`/`$1`/`$ARGUMENTS` | named/positional args |
| `argument-hint` | autocomplete hint |

### 3.3 Subagent frontmatter — bekräftade fält

Från `/en/sub-agents`:

| Fält | Användning |
|---|---|
| `name`, `description` | krävs |
| `tools` (komma-sep) | allowlist |
| `disallowedTools` (komma-sep) | denylist (appliceras före `tools`) |
| `model` | `sonnet`/`opus`/`haiku`/full-ID/`inherit` |
| `permissionMode` | `default`/`acceptEdits`/`auto`/`dontAsk`/`bypassPermissions`/`plan` |
| `maxTurns` | hindrar hängande agenter |
| `skills` (preload) | injicerar skill-content i subagent-start-context |
| `mcpServers` | YAML-list: strings eller inline `.mcp.json`-shape |
| `hooks` | subagent-scoped hooks (PreToolUse/PostToolUse/Stop) |
| `memory` | `user`/`project`/`local` — persistent agent memory |
| `isolation: worktree` | kör i temp git worktree |
| `effort` | low/medium/high/xhigh/max |
| `color` | UI-färg i transcript |
| `initialPrompt` | bara när agenten körs som main session via `--agent` |

**Subagent kan INTE spawna andra subagenter.**

**Atlas-specifik gotcha:** plugin-subagenter ignorerar `hooks`, `mcpServers`, `permissionMode`. Inte relevant för oss eftersom vi inte distribuerar som plugin.

### 3.4 Agent-hook full spec

Se 2.4. Bekräftade fält:

```
type: "agent"      (required)
prompt: "..."      (required, supports $ARGUMENTS)
timeout: 120       (default 60s)
model: "haiku"     (optional, defaults to fast model)
```

Response: `{ "ok": true | false, "reason": "..." }`. Max 50 turns.

### 3.5 Hook decision-control + exit codes

**Decision-control-tabell (relevanta events):**

| Event | Decision pattern | Key fields |
|---|---|---|
| Stop, SubagentStop | Top-level `decision` | `decision: "block"`, `reason` |
| PreToolUse | `hookSpecificOutput` | `permissionDecision` (allow/deny/ask/defer) |
| UserPromptSubmit, PostToolUse, PreCompact | Top-level `decision` | `decision: "block"`, `reason` |
| SessionStart, SubagentStart | Context only | `hookSpecificOutput.additionalContext` |

**Exit codes:**

| Code | Behavior |
|---|---|
| 0 | Success. Stdout parsed as JSON output. |
| 2 | Blocking. Stdout ignored. Stderr fed back to Claude som error. Blockerar event. |
| övriga | Non-blocking error. Transcript visar hook-error-notice. |

**Stop-hook med exit 2 → "Prevents Claude from stopping, continues the conversation".**

### 3.6 Issue #23478 + `stop_hook_active`

**#23478:** Path-based rules triggar bara på `Read`, inte på `Write`/`Edit`. Closed-not-planned, confirmed bug.

**Workaround:** PostToolUse-hook med `matcher: Write|Edit` som forcerar Read efter Write:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-write-rules-loader.sh"
      }]
    }]
  }
}
```

`post-write-rules-loader.sh` läser hook-input-JSON, extraherar `tool_input.file_path`, och kör `cat` på filen som biverkning (vilket triggar `Read`-tool-pathway om vi gör det via Bash som Claude sedan ser).

Egentligen är detta klumpigt — alternativ: lägg kritiska anti-ai-ui-regler i `CLAUDE.md` (alltid laddat) snarare än `.claude/rules/` med paths-scoping. Tradeoff: mer kontext-kostnad men inga triggning-problem.

**`stop_hook_active`-flaggan:** odokumenterad i nuvarande docs men **atlas använder den redan** i `stop-checkpoint.sh`:

```bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi
```

Detta är vår recursion-guard. Hook-input-JSON innehåller `stop_hook_active: true` om vi redan är inne i en Stop-hook-körning. Alla Stop-hooks ska ha denna check först för att undvika infinite loop.

---

## 4. Designkällor — verifierade

### 4.1 DISTILLED_AESTHETICS_PROMPT verbatim

Hämtad från `raw.githubusercontent.com/anthropics/claude-cookbooks/main/coding/prompting_for_frontend_aesthetics.ipynb`. Den exakta variabeldefinitionen:

```
DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
```

Sista stycket nämner **Space Grotesk** som specifik fälla — saknades i v2.

Cookbook använder `BASE_SYSTEM_PROMPT + DISTILLED_AESTHETICS_PROMPT` ihop, inte aesthetics ensam. BASE specificerar vanilla HTML/CSS/JS + Tailwind. För vår skill kan vi paragrafera om för React/Next.js men behåll aesthetics-blocket verbatim.

### 4.2 Rauno Freiberg — 56 regler i 7 kategorier (komplett)

Hämtat från `raw.githubusercontent.com/raunofreiberg/interfaces/main/README.md`. Komplett lista:

**Interactivity (11):**
1. Clicking the input label should focus the input field
2. Inputs should be wrapped with a `<form>` to submit by pressing Enter
3. Inputs should have an appropriate `type` like `password`, `email`, etc
4. Inputs should disable `spellcheck` and `autocomplete` attributes most of the time
5. Inputs should leverage HTML form validation by using the `required` attribute when appropriate
6. Input prefix and suffix decorations, such as icons, should be absolutely positioned on top of the text input with padding, not next to it, and trigger focus on the input
7. Toggles should immediately take effect, not require confirmation
8. Buttons should be disabled after submission to avoid duplicate network requests
9. Interactive elements should disable `user-select` for inner content
10. Decorative elements (glows, gradients) should disable `pointer-events` to not hijack events
11. Interactive elements in a vertical or horizontal list should have no dead areas between each element, instead, increase their `padding`

**Typography (9):**
1. Fonts should have `-webkit-font-smoothing: antialiased` applied for better legibility
2. Fonts should have `text-rendering: optimizeLegibility` applied for better legibility
3. Fonts should be subset based on the content, alphabet or relevant language(s)
4. Font weight should not change on hover or selected state to prevent layout shift
5. Font weights below 400 should not be used
6. Medium sized headings generally look best with a font weight between 500-600
7. Adjust values fluidly by using CSS `clamp()`, e.g. `clamp(48px, 5vw, 72px)`
8. Where available, tabular figures should be applied with `font-variant-numeric: tabular-nums`
9. Prevent text resizing unexpectedly in landscape mode on iOS with `-webkit-text-size-adjust: 100%`

**Motion (6):**
1. Switching themes should not trigger transitions and animations on elements
2. Animation duration should not be more than **200ms** for interactions to feel immediate
3. Animation values should be proportional to the trigger size
4. Actions that are frequent and low in novelty should avoid extraneous animations
5. Looping animations should pause when not visible on the screen to offload CPU and GPU usage
6. Use `scroll-behavior: smooth` for navigating to in-page anchors, with an appropriate offset

**Touch (6):**
1. Hover states should not be visible on touch press, use `@media (hover: hover)`
2. Font size for inputs should not be smaller than **16px** to prevent iOS zooming on focus
3. Inputs should not auto focus on touch devices as it will open the keyboard and cover the screen
4. Apply `muted` and `playsinline` to `<video />` tags to auto play on iOS
5. Disable `touch-action` for custom components that implement pan and zoom gestures
6. Disable the default iOS tap highlight with `-webkit-tap-highlight-color: rgba(0,0,0,0)`

**Optimizations (7):**
1. Large `blur()` values for `filter` and `backdrop-filter` may be slow
2. Scaling and blurring filled rectangles will cause banding, use radial gradients instead
3. Sparingly enable GPU rendering with `transform: translateZ(0)` for unperformant animations
4. Toggle `will-change` on unperformant scroll animations for the duration of the animation
5. Auto-playing too many videos on iOS will choke the device, pause or unmount off-screen videos
6. Bypass React's render lifecycle with refs for real-time values that can commit to DOM directly
7. Detect and adapt to the hardware and network capabilities of the user's device

**Accessibility (12):**
1. Disabled buttons should not have tooltips, they are not accessible
2. Box shadow should be used for focus rings, not outline which won't respect radius
3. Focusable elements in a sequential list should be navigable with ↑ ↓
4. Focusable elements in a sequential list should be deletable with ⌘ Backspace
5. Dropdown menus should trigger on `mousedown`, not `click` to open immediately on press
6. Use a svg favicon with a style tag that adheres to the system theme based on `prefers-color-scheme`
7. Icon only interactive elements should define an explicit `aria-label`
8. Tooltips triggered by hover should not contain interactive content
9. Images should always be rendered with `<img>` for screen readers and ease of copying
10. Illustrations built with HTML should have an explicit `aria-label`
11. Gradient text should unset the gradient on `::selection` state
12. When using nested menus, use a prediction cone to prevent accidental menu closing

**Design (5):**
1. Optimistically update data locally and roll back on server error with feedback
2. Authentication redirects should happen on the server before the client loads
3. Style the document selection state with `::selection`
4. Display feedback relative to its trigger
5. Empty states should prompt to create a new item, with optional templates

### 4.3 Emil Kowalski — 43 motion-regler distillerade

7 kategorier (officiella): Easing Selection, Timing & Duration, Property Selection, Transform Techniques, Interaction Patterns, Strategic Animation, Accessibility & Polish.

**Konkreta värden:**
- UI animations: **< 300ms** (Kowalski). Konflikt med Rauno 200ms — använd 200ms default, 300ms tak för micro-interactions.
- Drawer: **500ms**
- Easing curves verbatim:
  - UI interactions (default): `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out)
  - On-screen movement: `cubic-bezier(0.77, 0, 0.175, 1)` (strong ease-in-out)
  - iOS drawers: `cubic-bezier(0.32, 0.72, 0, 1)`
- **Never ease-in** — feels sluggish
- **Animate only transform + opacity** (perf)
- **Never animate keyboard-initiated actions** — feels disconnected

Full 43-regler-lista inte hämtad (rate-limit + 404 på direct path). Om mer behövs: `github.com/emilkowalski/skill/tree/main/skills` har skillerna men exakt path är inte verifierat.

### 4.4 DESIGN.md — 8 sektioner bekräftade

Från `raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md`:

1. **Overview** — brand personality, target audience, emotional response
2. **Colors** — required `primary` palette + optional, mapped to tokens
3. **Typography** — 9-15 levels (fontFamily/Size/Weight/lineHeight/letterSpacing)
4. **Layout** — grid models + spacing scales
5. **Elevation & Depth** — hierarchy via visual style
6. **Shapes** — corner radius tokens
7. **Components** — token guidance för buttons/inputs/etc
8. **Do's and Don'ts** — guardrails

### 4.5 Distillerade design-konstanter (oförändrade från v2)

| Princip | Källa | Konkret regel |
|---|---|---|
| Hierarki-chunkar | Cowan 2001 | 3-5 chunks per group |
| Spinner-tröskel | IBM Carbon | Vid > 3s vänta |
| Skeleton-tid | IBM Carbon | 1-3s, swap till real content |
| Skeleton-användning | IBM Carbon | Containers (tiles/lists/tables), aldrig buttons/inputs |
| Empty-state-anatomi | IBM Carbon | Illustration + heading + body + primary action, **left-aligned** |
| Reading age | GOV.UK | 9 år |
| Förbjudna ord | GOV.UK | "please", "sorry" |
| Error-pattern | GOV.UK | `[problem] — [what to do]` |
| Error-display | GOV.UK | Error-summary top + inline per field |
| Tap target — minimum | WCAG 2.5.8 AA | 24 × 24 CSS px |
| Tap target — Apple | Apple HIG | 44 × 44 pt |
| Tap target — Material | Material Design | 48 × 48 dp |
| Tap target — regel | sammanvägt | "24 minimum, 44-48 real target" |
| Aldrig svart | StyleSeed | Mörkaste text #2A2A2A |
| Kortskuggor | StyleSeed | 4-8% opacity |
| Siffror:enheter | StyleSeed | 2:1 ratio |
| Pill vs sida | StyleSeed | 2-4 val = pill, 5+ = egen sida |
| Glas/frost | Apple HIG + NN/g | Blur 10-25, EN glas-yta per vy, 4.5:1 efter blur |

NN/g glassmorphism-artikeln gick inte att verifiera (cert error). Värdena är distillerade från v2 — användbara men inte primärkälls-citerbara.

---

## 5. MCP-konfig — paste-ready

### 5.1 shadcn MCP

Verifierat via `npx shadcn@latest mcp init --client claude` (genererar exakt denna `.mcp.json`):

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

**7 tools (från source `packages/shadcn/src/mcp/index.ts`):**
1. `get_project_registries` — registry-namn från components.json
2. `list_items_in_registries` — pagination (registries[], limit?, offset?)
3. `search_items_in_registries` — fuzzy search (registries[], query, limit?, offset?)
4. `view_items_in_registries` — full detail (items[])
5. `get_item_examples_from_registries` — usage examples (registries[], query)
6. `get_add_command_for_items` — CLI-kommando att paste:a (items[])
7. `get_audit_checklist` — inbyggd verifierings-checklista

**Tool 7 är direkt relevant för design-critic** — den ger en standardiserad checklista efter komponent-skapande. Använd det.

### 5.2 registry-directory MCP

```json
{
  "mcpServers": {
    "registry-directory": {
      "command": "node",
      "args": ["/path/to/registry-directory-mcp/dist/index.js"]
    }
  }
}
```

Kräver: `git clone github.com/Microck/registry-directory-mcp && npm install && npm run build`.

**6 tools:** search_registries, search_components, get_registry_index, get_categories, recommend_best_components, get_component_details.

**Risk i web-only/remote container:** källkods-bygge är fragilt. Backup: hårdkoda registry-URLs i `references/registries.md` istället för MCP.

---

## 6. Pressure-scenarier (oförändrade från v2)

### 6.1 Scenario A — Pricing-page (high AI-bait)
Prompt: "Bygg pricing-page för SaaS LiftGauge, tre tiers Free/Pro/Team, feature-comparison + CTA + FAQ."

Förväntat AI-fail: tre lika cards, lila→blå gradient, Inter/Roboto, generic checkmarks, "Get started"-CTA på alla tre, FAQ utan tematisk gruppering.

Med skill: tydlig "rekommenderad" tier, distinkt typografi (inte Inter), warm color story, real differentiering, FAQ grupperad i 2-3 teman.

### 6.2 Scenario B — Settings 12 toggles (Hick's law)
Prompt: "Lägg till settings-vy med 12 user preferences."

Förväntat AI-fail: platt 12-rad-lista, ingen gruppering, samma visuella vikt, `<h1>Settings</h1>`, ingen sök.

Med skill: 3-5 chunks (Cowan), tydlig sektionhierarki, destruktiva actions visuellt separerade.

### 6.3 Scenario C — Empty state (Carbon-test)
Prompt: "Designa empty state för saved comparisons-lista."

Förväntat AI-fail: centered illustration (Carbon säger left-aligned), "No items yet"-heading, grå "Create your first"-knapp.

Med skill: Carbon left-aligned, aktiv copy ("Save a comparison to track changes over time"), 2-3 starter-templates.

---

## 7. Föreslagen mappstruktur (REVIDERAD — slimmare)

Givet att skills kan ha `context: fork, agent:` så slipper vi den dubbla skill+agent-strukturen för varje fas.

```
.claude/
│
├── agents/                                ← personalities + tools/MCP/memory
│   ├── product-designer.md                ← tools: Read, Grep, Glob
│   │                                        effort: high
│   │                                        maxTurns: 10
│   ├── ux-architect.md                    ← tools: Read, Grep, Glob, Write
│   │                                        mcpServers: [registry-directory]
│   ├── frontend-design-engineer.md        ← tools: Read, Write, Edit, Bash
│   │                                        mcpServers: [shadcn]
│   │                                        skills: [anti-ai-ui]   (preload)
│   │                                        permissionMode: acceptEdits
│   └── design-critic.md                   ← tools: Read, Grep, Glob, Bash
│                                            memory: project
│                                            maxTurns: 8
│
├── skills/
│   ├── anti-ai-ui/                        ← bibel, alltid-relevant kontext
│   │   ├── SKILL.md                       ← <500 rader, refererar references/
│   │   └── references/
│   │       ├── anti-ai-slop.md            ← DISTILLED_AESTHETICS_PROMPT verbatim
│   │       ├── design-sources.md          ← sektion 4.5 + URL-anchors
│   │       ├── rauno-rules.md             ← sektion 4.2 verbatim
│   │       ├── kowalski-motion.md         ← sektion 4.3 verbatim
│   │       ├── mcp-setup.md               ← sektion 5
│   │       ├── pressure-scenarios.md      ← sektion 6
│   │       ├── internals.md               ← sektion 3
│   │       └── security.md                ← ~/.claude plaintext + mitigations
│   │
│   ├── discover/SKILL.md                  ← /discover; context: fork, agent: product-designer
│   ├── ux-architecture/SKILL.md           ← /ux-architecture; context: fork, agent: ux-architect
│   ├── implement-page/SKILL.md            ← /implement-page; context: fork, agent: frontend-design-engineer
│   ├── critique-ui/SKILL.md               ← /critique-ui; context: fork, agent: design-critic
│   │                                        disable-model-invocation: true
│   ├── anti-ai-review/SKILL.md            ← /anti-ai-review; orchestrerar hela kedjan
│   │                                        disable-model-invocation: true
│   ├── responsive-qa/SKILL.md             ← /responsive-qa (Playwright 1440/768/375)
│   └── a11y-audit/SKILL.md                ← /a11y-audit (@axe-core/playwright)
│
├── rules/
│   ├── anti-ai-ui-interactivity.md        ← Rauno Interactivity 11 + paths: src/**/*.{tsx,jsx,vue}
│   ├── anti-ai-ui-typography.md           ← Rauno Typography 9 + paths
│   ├── anti-ai-ui-motion.md               ← Rauno Motion 6 + Kowalski values + paths
│   ├── anti-ai-ui-touch.md                ← Rauno Touch 6 + tap target rules
│   ├── anti-ai-ui-a11y.md                 ← Rauno A11y 12 + WCAG 2.5.8
│   └── anti-ai-ui-states.md               ← Rauno Design 5 + Carbon empty-state
│
├── hooks/
│   ├── design-critic.sh                   ← Stop-hook (command-type); kallar design-critic
│   │                                        via Claude SDK eller inline checklist
│   ├── design-critic-prompt.md            ← prompt-text för agent-hook-alternativet
│   ├── post-write-rules-loader.sh         ← #23478 workaround
│   └── pre-commit-format.sh               ← prettier/eslint
│
├── settings.json                           ← hooks-registrering
├── CLAUDE.md                               ← projektregler (kort referens till anti-ai-ui)
└── ANTI_AI_UI.md                           ← (optional: alias för references/anti-ai-slop.md)
```

**Total:** 4 agents + 8 skills + 6 rules + 3 hooks + 1 settings + 1 CLAUDE.md = 23 filer (mot v2:s ~30).

---

## 8. Slutprompt för skill-creator (REVIDERAD)

> Skapa en Claude Code-skill med namnet `anti-ai-ui` enligt strukturen i sektion 7. Följ Anthropics skill-authoring best practices: SKILL.md-body under 500 rader, progressive disclosure till `references/`, description i tredje person som börjar med "Use when…" och är medvetet pushig. Skillen är 100% generisk och stack-agnostisk — läser projektets `CLAUDE.md` för stack-detaljer. Default-antagande shadcn/ui + Tailwind.
>
> **Hård konfiguration (icke-förhandlingsbar):**
> - Rules-frontmatter: `description:` + `paths:` (YAML-list, docs-format). Om canary-test (sektion 9) visar att `paths:` failar i 2.1.150, byt globalt till `globs:`.
> - Skill-frontmatter: `allowed-tools:` (space-sep eller YAML-list); använd `disable-model-invocation: true` för `/`-only skills; `user-invocable: false` för hook-only skills; `context: fork` + `agent: <name>` för fas-skills.
> - Subagent-frontmatter: `tools:` (komma-sep). Använd `mcpServers:`-fält för shadcn (frontend) och registry-directory (ux-architect). Sätt `memory: project` på design-critic. Sätt `maxTurns: 8-10` på alla. Sätt `permissionMode: acceptEdits` på frontend-engineer.
> - Stop-hook: använd `type: "command"` som kallar `.claude/hooks/design-critic.sh`. Hook-skriptet kollar `stop_hook_active` flag först (jq `'.stop_hook_active // false'`), exitar 0 om true (recursion guard). Annars kör critic-flow och exit 2 + stderr om kritik finns. Behåll `type: "agent"`-alternativet i references/internals.md som dokumentation av experimental approach.
> - PostToolUse-hook med `matcher: Write|Edit` för #23478-workaround (post-write-rules-loader.sh).
>
> **MCP-scope:** shadcn (frontend-engineer via `mcpServers:` i agent) + registry-directory (ux-architect). INGEN 21st.dev Magic.
>
> **Distribution:** mirror identiskt till `arvidfcjarfalla-prog/atlas` och `arvidfcjarfalla-prog/liftcalc` på branch `claude/anti-ai-ui-skill-F3R3b`. Liftcalc bootstrappa `.claude/`.
>
> **Producera (komplett lista):**
> 1. `.claude/skills/anti-ai-ui/SKILL.md` + `references/` (anti-ai-slop.md med DISTILLED_AESTHETICS_PROMPT verbatim från sektion 4.1; rauno-rules.md från 4.2; kowalski-motion.md från 4.3; design-sources.md från 4.5; mcp-setup.md från 5; pressure-scenarios.md från 6; internals.md från 3; security.md med ~/.claude plaintext-varning).
> 2. 4 subagent-filer i `.claude/agents/` enligt sektion 7 med rätt frontmatter.
> 3. 7 skill-filer i `.claude/skills/` (discover, ux-architecture, implement-page, critique-ui, anti-ai-review, responsive-qa, a11y-audit) — använd `context: fork, agent:` mönstret för fas-skills.
> 4. 6 rules-filer i `.claude/rules/` med Rauno-reglerna paste:ade ordagrant + path-scoping enligt sektion 7.
> 5. Hooks: `design-critic.sh` (Stop-hook med stop_hook_active-guard), `post-write-rules-loader.sh` (#23478), `pre-commit-format.sh` (auto-format).
> 6. `settings.json` med hook-registrering (Stop + PostToolUse Write|Edit + PreCommit).
> 7. `CLAUDE.md`-uppdatering: 5-10 rader som refererar anti-ai-ui-skillen.
>
> **Regler:** Mekaniska checks (lint, kontrast, format) i hooks, inte i skill-text — skillen bär bara omdömesbeslut. Inga emojis i någon fil. Inget innehåll utanför den specificerade strukturen.

---

## 9. Öppna research-frågor (REDUCERADE)

### Prio 1 — innan filer skrivs

**1. Canary-test för `paths:` vs `globs:`** (enda kritiska luckan kvar):

```bash
cd /home/user/atlas   # eller liftcalc
mkdir -p .claude/rules
cat > .claude/rules/zz-canary.md <<'EOF'
---
description: Canary test for paths frontmatter
paths:
  - "**/zz-canary-trigger.txt"
---
# CANARY-RULE-SENTINEL-2026
If you can see this rule listed via /memory after touching a matching file,
then paths: with YAML-list works in CLI 2.1.150.
EOF
touch zz-canary-trigger.txt
# Start a fresh Claude Code session in this dir.
# Run /memory and look for "zz-canary" in the rules list.
# If listed → paths: works → keep as docs say.
# If NOT listed → repeat with globs: instead.
# Clean up zz-canary.md + zz-canary-trigger.txt after.
```

### Prio 2 — bör verifieras under bygge

2. Bekräfta att shadcn MCP `get_audit_checklist`-tool faktiskt returnerar något användbart för design-critic.
3. Bekräfta att registry-directory MCP byggbar i container — risken att vi måste fallback:a till statisk lista.
4. Bekräfta att Stop-hook `decision: "block"`-JSON faktiskt får Claude att fortsätta (inte bara stoppa med error).

### Prio 3 — nice-to-have

5. Emil Kowalski 43 regler full lista (inte hittade verbatim — hade konkreta värden, men kompletta listan saknas).
6. Carbon empty-states fullständig anatomi (spacing/illustration-size/heading-weight).
7. NN/g glass-research primärkälla (cert error vid hämtning).
8. Apple WWDC18 "Designing Fluid Interfaces" relevanta principer.

### Prio 4 — säkerhet

9. Atlas-data: har vi PII? Om ja, `cleanupPeriodDays: 7` + `permissions.deny`. Liftcalc har ingen.
10. `allowManagedMcpServersOnly: true` på user-level för att hindra accidentella MCP-anslutningar?

---

## 10. State på disk

```
/home/user/atlas/.claude/         (existerar, väl etablerat)
├── learned-rules.md              ← 73 rader, LÄS innan bygge
├── settings.json                 ← 107 rader, har redan hooks-config
├── rules/                        ← 5 filer, alla med globs: + YAML-list
│   ├── editorial-landing.md
│   ├── eval-modes.md
│   ├── node-script-imports.md
│   ├── pxweb-geography.md
│   └── testing-workflow.md
├── hooks/                        ← 6 hooks: auto-handover, check-doc-staleness,
│                                    post-compaction, pre-compact, session-start,
│                                    stop-checkpoint (denna använder stop_hook_active!)
└── skills/                       ← 24 skills (auto-research, build, codebase-review,
                                     connect-datasource, connect-geography, consensus,
                                     debate, deploy-to-vercel, documenter, handoff,
                                     live-qa, meta-agent, nextjs-supabase-auth,
                                     parallel-build, quick, reviewer, subagent-tasks,
                                     supabase-developer, supabase-postgres-best-practices,
                                     systematic-debugging, vercel-composition-patterns,
                                     vercel-react-best-practices, web-design-guidelines)

/home/user/liftcalc/              (ingen .claude/, ska bootstrappas)
├── CLAUDE.md                     ← 80 rader, vite + TypeScript + pnpm + vitest

/home/user/Byggai/                (out-of-scope)

Inga commits gjorda på claude/anti-ai-ui-skill-F3R3b än.
Denna fil (HANDOFF_anti-ai-ui_2026-05-23_v3.md) ligger i /home/user/ — ephemeral, måste committas.
```

**Verifierings-kommandon (nästa session):**
```bash
cd /home/user/atlas && git status && git log --oneline -5
cd /home/user/liftcalc && git status && git log --oneline -5
cat /home/user/atlas/.claude/learned-rules.md
cat /home/user/atlas/.claude/settings.json | head -50
cat /home/user/atlas/.claude/hooks/stop-checkpoint.sh   # se hur stop_hook_active används
claude --version
```

---

## 11. Glossary

- **anti-ai-ui** — denna skill
- **Anti-AI-UI** — kategorin av UI som inte ser AI-genererad ut
- **AI-slop** — generic AI-output (lila gradients, Inter, etc.)
- **Pressure-scenario** — test-case för att framkalla AI-slop hos en agent utan skill
- **Baseline-fail** — köra pressure-scenario utan skill för att dokumentera failet
- **Squint-test** — kisa mot designen, se om hierarki håller
- **DISTILLED_AESTHETICS_PROMPT** — variabelnamn i Anthropics cookbook
- **DESIGN.md** — Google Labs Stitch canonical design-spec-format (Apache 2.0)
- **Stop-hook** — hook när Claude försöker säga klar, kan blockera
- **Read-only role** — subagent med tools=Read,Grep,Glob — kan inte skriva kod
- **`context: fork`** — skill-egenskap, kör skill-content som prompt i en isolerad subagent
- **`stop_hook_active`** — flagga i hook-input-JSON, true om vi är inne i en Stop-hook-körning; använd som recursion-guard

---

## 12. Referenser

### Officiell Claude Code-docs (verifierade)
- Memory: https://code.claude.com/docs/en/memory
- Skills: https://code.claude.com/docs/en/skills
- Subagents: https://code.claude.com/docs/en/sub-agents
- Hooks (inkl. Agent-based hooks-sektionen): https://code.claude.com/docs/en/hooks
- Managed MCP: https://code.claude.com/docs/en/managed-mcp
- MCP: https://code.claude.com/docs/en/mcp
- Data usage: https://code.claude.com/docs/en/data-usage

### Designkällor (verifierade där möjligt)
- Anthropic anti-slop cookbook: https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb
- Rauno Freiberg interfaces (GitHub README har full lista): https://github.com/raunofreiberg/interfaces
- Emil Kowalski animations.dev: https://animations.dev (browser-blockerad här)
- DESIGN.md spec: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
- Carbon Loading: https://carbondesignsystem.com/components/loading/usage/
- Carbon Empty States: https://carbondesignsystem.com/patterns/empty-states-pattern/
- GOV.UK Error Message: https://design-system.service.gov.uk/components/error-message/
- Laws of UX: https://lawsofux.com

### MCP-källor
- shadcn MCP (via CLI `shadcn mcp init --client claude`): npx shadcn@latest mcp
- registry-directory MCP: https://github.com/Microck/registry-directory-mcp

### Issues / known bugs
- #17204 (paths:/globs: confusion, closed not-planned): https://github.com/anthropics/claude-code/issues/17204
- #23478 (rules don't trigger on Write, closed not-planned): https://github.com/anthropics/claude-code/issues/23478

---

**End of v3. Filen är committable men inte committad. Containern är ephemeral — committa till repo NU annars förlorad.**
