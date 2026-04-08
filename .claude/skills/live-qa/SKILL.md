---
name: live-qa
description: Reverse prompt from localhost — agent acts as user, types prompts into the running app, screenshots the rendered maps, spawns map-judge for visual evaluation, and reports results. Use when the user says /live-qa, "testa live", "reverse prompt", "testa från localhost", or "kör QA mot appen".
triggers:
  - /live-qa
  - testa live
  - reverse prompt
  - testa från localhost
  - kör QA mot appen
---

# Live QA — Reverse Prompt from Localhost

Agent becomes the user. Types prompts into the real running app, waits for maps to render, screenshots the result, and spawns a fresh-context map-judge to evaluate visual quality. Reports findings. Does NOT mock API calls — exercises the full pipeline: prompt → AI → manifest → compile → render.

**When to use:** After building UI-facing features, after manifest compiler changes, after AI pipeline changes, or anytime you want to verify the app actually works end-to-end from a user's perspective.

**When NOT to use:** For non-UI changes (pure backend, types, tests). Use `pnpm test` instead.

## Pipeline

### 1. Ensure dev server

Check if localhost:3000 is reachable:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
- If `200`: server running, continue.
- If not: run `cd /Users/arvidhjartberg/atlas && pnpm dev &` and wait for startup (up to 60s).
- If server fails to start: STOP and report the error.

### 2. Generate test scenarios

Create 3-5 test prompts (or use user-provided ones). Each scenario needs:
- **name**: short identifier (e.g., "earthquakes-point")
- **prompt**: the natural language prompt to type (e.g., "show recent earthquakes worldwide by magnitude")
- **expected_family**: which map family should result (e.g., "proportional-symbol")
- **expected_region**: where the map should be centered (e.g., "global")

Default scenarios if none provided — pick 3-5 that cover different families:
- `"visa jordbävningar i Japan senaste veckan"` → point/cluster, Japan
- `"skapa en choropleth-karta över befolkningstäthet i Europa"` → choropleth, Europe
- `"visa flygrutter från Stockholm"` → flow, Scandinavia/Europe
- `"heatmap över brott i New York"` → heatmap, New York
- `"visa hur BNP förändrats i Asien sedan 2000"` → timeline/choropleth, Asia

If the user specifies prompts, use those instead.

### 3. Execute scenarios with Playwright

For EACH scenario, write and run a Playwright script:

```typescript
// tmp/live-qa/run-scenario.ts
import { chromium } from 'playwright';

const scenario = {
  name: process.argv[2],
  prompt: process.argv[3],
  outputDir: process.argv[4],
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Navigate to new map page
  await page.goto('http://localhost:3000/app/map/new', { timeout: 30000 });
  await page.screenshot({ path: `${scenario.outputDir}/01-page-loaded.png` });

  // Find and fill the prompt input
  const input = page.locator('input[type="text"]');
  await input.waitFor({ timeout: 10000 });
  await input.fill(scenario.prompt);
  await page.screenshot({ path: `${scenario.outputDir}/02-prompt-entered.png` });

  // Submit
  const sendButton = page.locator('button:has-text("Skicka")');
  await sendButton.click();
  await page.screenshot({ path: `${scenario.outputDir}/03-submitted.png` });

  // Wait for map canvas to appear (AI generation + data fetch + render)
  try {
    await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 90000 });
    // Let tiles and data settle
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${scenario.outputDir}/04-map-rendered.png` });

    // Try to capture just the map canvas area
    const canvas = page.locator('canvas.maplibregl-canvas');
    if (await canvas.isVisible()) {
      await canvas.screenshot({ path: `${scenario.outputDir}/05-canvas-only.png` });
    }
  } catch {
    // Map didn't render in time — capture error state
    await page.screenshot({ path: `${scenario.outputDir}/04-timeout-state.png` });
  }

  // Check for error overlays
  const hasError = await page.locator('[data-nextjs-error]').isVisible().catch(() => false);

  // Write metadata
  const meta = {
    name: scenario.name,
    prompt: scenario.prompt,
    hasError,
    consoleErrors: errors,
    timestamp: new Date().toISOString(),
  };
  require('fs').writeFileSync(
    `${scenario.outputDir}/meta.json`,
    JSON.stringify(meta, null, 2)
  );

  await browser.close();
})();
```

Run each scenario:
```bash
mkdir -p tmp/live-qa/{scenario-name}
npx tsx tmp/live-qa/run-scenario.ts "{name}" "{prompt}" "tmp/live-qa/{name}"
```

Important: Run scenarios sequentially (not parallel) since they share the dev server.

### 4. Evaluate with map-judge

For each scenario that produced a screenshot:

1. Read `tmp/live-qa/{name}/meta.json` — check for console errors and error states.
2. Spawn the `/map-judge` command with the final screenshot:
   ```
   /map-judge tmp/live-qa/{name}/04-map-rendered.png family:{expected_family} prompt:{prompt}
   ```
3. If the screenshot is `04-timeout-state.png` instead, still send it to map-judge — it will detect the error state.

Collect all map-judge verdicts.

### 5. Report

Present a summary table:

```
LIVE QA REPORT — {date}
Server: localhost:3000
Scenarios: {N}

| # | Scenario | Family | Verdict | Confidence | Issues |
|---|----------|--------|---------|------------|--------|
| 1 | earthquakes-point | point | PASS | 9/10 | None |
| 2 | europe-choropleth | choropleth | ISSUES | 6/10 | Uniform color (major) |
| 3 | flights-flow | flow | FAIL | 8/10 | Blank canvas (critical) |

DETAILS:
[For each non-PASS scenario, include the full map-judge output]

CONSOLE ERRORS:
[Any console errors captured across all scenarios]

SCREENSHOT TRAIL:
[List all screenshot paths for manual inspection]
```

### 5.5. Aggregate results

Append to `tmp/experience/visual-qa.md`:

```markdown
## {date} — {N scenarios}
| Family | Verdict | Failed checks |
|---|---|---|
| {family} | {PASS/ISSUES/FAIL} | {failed check IDs or "—"} |
```

Check recurring failures: read previous entries in `visual-qa.md`. If any universal check (U1-U8) or family-specific check has failed >3 times for the same family across all entries, note:
```
RECURRING: {check} has failed {N} times for {family}. Consider adding a validator rule.
```

### 6. Fix loop (if user approves)

After presenting the report, ask: "Ska jag fixa de identifierade problemen?"

If yes, for each issue (ordered by severity: critical → major → minor):
1. Read map-judge's RECOMMENDED FIXES
2. Diagnose the root cause in the actual code (manifest compiler, AI pipeline, components)
3. Fix the code
4. Re-run ONLY the failing scenario (step 3 again for that scenario)
5. Re-evaluate with map-judge
6. If still failing: try again (max 3 attempts per issue)
7. If fixed: move to next issue

After all fixes: re-run ALL scenarios once to confirm no regressions.

### 7. Learn

After the session:
- If any failures revealed non-obvious constraints: save to `.claude/learned-rules.md`
- Save selector/timeout knowledge to `tmp/experience/e2e.md`
- Clean up: `rm -rf tmp/live-qa/` (screenshots are transient)

## Execution details

- Default: 3 scenarios (user can override with specific prompts or "kör alla 14 familjer")
- Timeout per scenario: 90 seconds (AI generation can be slow)
- Screenshots saved to `tmp/live-qa/{scenario-name}/` (gitignored via tmp/)
- Map-judge runs with fresh context per evaluation (context: fork)
- Fix loop requires user approval before modifying code
- The Playwright script template above is a starting point — adapt selectors if the page structure has changed (read the actual components first)

## Important

- NEVER mock API calls. The point is to test the REAL pipeline.
- ALWAYS use Playwright for browser interaction. Do not "imagine" what the page looks like.
- ALWAYS spawn map-judge as a separate command for evaluation. Do not self-evaluate.
- Screenshots are the evidence. No screenshot = no evaluation.
- If the dev server requires auth, handle login first (check if auth cookies/tokens are needed).
