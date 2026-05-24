---
name: responsive-qa
description: Use to verify a UI change renders correctly at 1440 / 768 / 375 viewport widths. Runs Playwright (if installed) and captures screenshots.
when_to_use: After implement-page and before critique-ui, or any time the user asks "is this responsive".
allowed-tools: Read, Bash
context: fork
agent: frontend-design-engineer
model: haiku
effort: medium
user-invocable: true
disable-model-invocation: false
---

Verify the current change renders at three breakpoints: 1440 (desktop), 768 (tablet), 375 (mobile small).

Steps:
1. Detect whether Playwright is installed (`pnpm list @playwright/test` or check `node_modules/@playwright`).
2. If installed: write a one-off Playwright script that loads the affected route at all three widths and screenshots to `tmp/responsive-qa/<feature>-<width>.png`.
3. If not installed: report that Playwright is not available and stop — do not install it.
4. Inspect the screenshots and report layout problems: horizontal scroll, overlapping content, unreachable touch targets, illegible text.

No additional code changes. Read-only verification.
