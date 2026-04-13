/**
 * Source-contract tests for useMapPipeline.
 *
 * The Atlas web app does not have a React Testing Library / jsdom setup,
 * so behavioral hook tests would require adding new infrastructure. These
 * structural tests guard the invariants that matter most after extracting
 * the hook from /new/page.tsx — the things that would silently regress if
 * a future refactor moves code around.
 */
import { describe, it, expect, beforeAll } from "vitest";

let source: string;
let pageSource: string;

beforeAll(async () => {
  const fs = await import("node:fs/promises");
  source = await fs.readFile(
    new URL("../use-map-pipeline.ts", import.meta.url),
    "utf-8",
  );
  pageSource = await fs.readFile(
    new URL("../../../app/app/(editor)/map/new/page.tsx", import.meta.url),
    "utf-8",
  );
});

describe("useMapPipeline — strict-mode guard", () => {
  it("uses pipelineRanRef to gate both entry effects", () => {
    const refMatches = source.match(/pipelineRanRef\.current/g) ?? [];
    // ref is set true in both effects, reset false in handleAnswer + retry,
    // and read in both effect guards => >= 6 references.
    expect(refMatches.length).toBeGreaterThanOrEqual(6);
  });

  it("template effect guards on pipelineRanRef before mutating it", () => {
    const idx = source.indexOf("// Template loading");
    const block = source.slice(idx, idx + 1200);
    expect(block).toMatch(/if \(!templateId \|\| pipelineRanRef\.current\) return;/);
    expect(block).toMatch(/pipelineRanRef\.current = true;/);
  });

  it("prompt effect skips when templateId present", () => {
    const idx = source.indexOf("// AI prompt pipeline");
    const block = source.slice(idx, idx + 400);
    expect(block).toMatch(/if \(templateId\) return;/);
    expect(block).toMatch(/if \(!prompt \|\| pipelineRanRef\.current\) return;/);
  });
});

describe("useMapPipeline — retry semantics", () => {
  it("RetryableError handled in runPipeline (re-clarifies then re-generates)", () => {
    const idx = source.indexOf("const runPipeline");
    const block = source.slice(idx, source.indexOf("const handleAnswer"));
    expect(block).toContain("e instanceof RetryableError");
    expect(block).toMatch(/freshClarify = await callClarify\(promptText, answers\)/);
    expect(block).toMatch(/decideClarifyAction\(freshClarify, promptText\)/);
  });

  it("RetryableError handled in handleConfirmSubmit", () => {
    const idx = source.indexOf("const handleConfirmSubmit");
    const block = source.slice(idx, source.indexOf("const retry"));
    expect(block).toContain("e instanceof RetryableError");
    expect(block).toMatch(/freshClarify = await callClarify\(prompt\)/);
  });

  it("auto-answer loop bounded by MAX_AUTO_ANSWER_ROUNDS", () => {
    expect(source).toMatch(
      /while \(action\.kind === "auto_answer" && autoRounds < MAX_AUTO_ANSWER_ROUNDS\)/,
    );
  });

  it("retry() resets pipelineRanRef so prompt effect can rerun", () => {
    const idx = source.indexOf("const retry = useCallback");
    const block = source.slice(idx, idx + 300);
    expect(block).toContain("pipelineRanRef.current = false");
    expect(block).toContain("runPipeline(prompt)");
  });
});

describe("useMapPipeline — save behavior", () => {
  it("auto-saves when user is signed in (AI pipeline path)", () => {
    const idx = source.indexOf("const runPipeline");
    const block = source.slice(idx, source.indexOf("const handleAnswer"));
    // user check followed by saveAndRedirect call
    expect(block).toMatch(/if \(user\)\s*{\s*setStage\("saving"\);\s*const saveResult = await saveAndRedirect\(/);
  });

  it("shows toast on save failure (AI pipeline path)", () => {
    const idx = source.indexOf("const runPipeline");
    const block = source.slice(idx, source.indexOf("const handleAnswer"));
    expect(block).toContain('showToast("Kunde inte spara kartan", "error")');
  });

  it("template path stays silent on save failure (no toast)", () => {
    const idx = source.indexOf("// Template loading");
    const block = source.slice(idx, source.indexOf("// AI prompt pipeline"));
    expect(block).not.toContain("showToast(");
  });
});

describe("useMapPipeline — phase 4.5 fixes", () => {
  it("handleSuggestion resets pipelineRanRef before navigating", () => {
    // Without the reset, a suggestion click changes the URL/prompt but the
    // prompt effect bails (ref is still true from the first run) and the
    // user is stuck on needs_input with the new prompt loaded but not run.
    const idx = source.indexOf("const handleSuggestion");
    const block = source.slice(idx, idx + 400);
    const refIdx = block.indexOf("pipelineRanRef.current = false");
    const navIdx = block.indexOf("router.replace(");
    expect(refIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeLessThan(navIdx);
  });

  it("template loadTemplate() rejection surfaces as error stage", () => {
    // Without the .catch, a fetchGeoJSON failure on the template path
    // becomes an unhandled rejection and the UI is stuck on clarifying.
    const idx = source.indexOf("// Template loading");
    const block = source.slice(idx, source.indexOf("// AI prompt pipeline"));
    expect(block).toMatch(/loadTemplate\(\)\.catch\(/);
    expect(block).toMatch(/setStage\("error"\)/);
  });
});

describe("useMapPipeline — clarify routing", () => {
  it("ask_questions transitions to needs_input stage", () => {
    expect(source).toMatch(
      /if \(action\.kind === "ask_questions"\)[\s\S]{0,300}setStage\("needs_input"\)/,
    );
  });

  it("tabular_warning transitions to needs_input stage with suggestions", () => {
    expect(source).toMatch(
      /if \(action\.kind === "tabular_warning"\)[\s\S]{0,400}setStage\("needs_input"\)/,
    );
  });

  it("buildConfirmationQuestions decides when to enter confirming stage", () => {
    expect(source).toMatch(
      /buildConfirmationQuestions\(action\.dataProfile, promptText\)[\s\S]{0,500}setStage\("confirming"\)/,
    );
  });
});

describe("useMapPipeline — page integration", () => {
  it("page.tsx imports and calls useMapPipeline with all required args", () => {
    expect(pageSource).toContain('from "@/lib/hooks/use-map-pipeline"');
    expect(pageSource).toMatch(
      /useMapPipeline\(\{\s*prompt,\s*templateId,\s*artifactId,\s*user,\s*saveAndRedirect,\s*showToast\s*\}\)/,
    );
  });

  it("page.tsx no longer owns pipeline state", () => {
    // These belonged to the inline pipeline; they must be gone from the page.
    expect(pageSource).not.toContain("pipelineRanRef");
    expect(pageSource).not.toContain("const callClarify");
    expect(pageSource).not.toContain("const generateAndRender");
    expect(pageSource).not.toContain("const runPipeline");
  });

  it("error-state retry button uses the hook's retry callback", () => {
    expect(pageSource).toMatch(/onClick=\{retry\}/);
  });

  it("page keeps page-owned auth modal + legend state", () => {
    expect(pageSource).toContain("const [authModalOpen, setAuthModalOpen]");
    expect(pageSource).toContain("const [legendItems, setLegendItems]");
    expect(pageSource).toContain("handleAuthSuccess");
  });
});
