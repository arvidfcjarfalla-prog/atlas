---
name: a11y-audit
description: Use to audit the current UI for WCAG violations with @axe-core/playwright. Reports contrast failures, missing labels, focus traps, and tap-target violations.
when_to_use: After implement-page, before critique-ui, or any time the user asks "is this accessible".
allowed-tools: Read, Bash
context: fork
agent: design-critic
model: haiku
effort: medium
user-invocable: true
disable-model-invocation: false
---

Audit the current UI for accessibility violations.

Steps:
1. Detect whether `@axe-core/playwright` is installed.
2. If installed: write a one-off Playwright script that loads the affected route and runs axe. Save the report to `tmp/a11y/<feature>.json`.
3. If not installed: report that the tools are not available and stop.
4. Summarise critical and serious violations with selector + rule + recommended fix.
5. Tap-target rule: WCAG 2.5.8 minimum 24×24 CSS px. Real target 44–48. Flag any interactive element under 24×24.
6. Contrast rule: 4.5:1 for body text, 3:1 for large text. Flag failures with the actual ratio.

No code changes. Read-only audit.
