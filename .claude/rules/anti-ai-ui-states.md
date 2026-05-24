---
description: Rauno Freiberg's 5 design rules plus IBM Carbon empty-state pattern and GOV.UK error pattern.
paths:
  - "src/**/*.tsx"
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "apps/**/*.tsx"
  - "packages/**/*.tsx"
model: haiku
---

# Design (Rauno Freiberg)

1. Optimistically update data locally and roll back on server error with feedback.
2. Authentication redirects should happen on the server before the client loads.
3. Style the document selection state with `::selection`.
4. Display feedback relative to its trigger.
5. Empty states should prompt to create a new item, with optional templates.

## Carbon empty-state anatomy

- Illustration + heading + body + primary action.
- Left-aligned, not centered.
- Copy is active and specific ("Save a comparison to track changes over time"), not passive ("No items yet").
- 2–3 starter templates when applicable.

## GOV.UK error pattern

- Pattern: `[problem] — [what to do]`.
- Error-summary at the top of the form + inline message per field.
- No "please" or "sorry" — direct, clear language.
- Reading age: 9.

## Examples to flag

- "No items yet" empty state with a grey ghost button.
- Centered empty states (Carbon says left-aligned).
- Forms with only inline errors and no top-of-form summary.
- Error messages starting with "Sorry, " or "Please ".
