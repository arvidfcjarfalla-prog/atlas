# Distilled design constants

These are the cross-source constants the design-critic checks against. Each is sourced from a documented design system or research paper.

| Principle | Source | Concrete rule |
|---|---|---|
| Hierarchy chunks | Cowan 2001 | 3–5 chunks per group |
| Spinner threshold | IBM Carbon | Show spinner at > 3s wait |
| Skeleton time | IBM Carbon | 1–3s, swap to real content |
| Skeleton usage | IBM Carbon | Containers (tiles/lists/tables), never buttons/inputs |
| Empty-state anatomy | IBM Carbon | Illustration + heading + body + primary action, **left-aligned** |
| Reading age | GOV.UK | 9 years |
| Forbidden words | GOV.UK | "please", "sorry" |
| Error pattern | GOV.UK | `[problem] — [what to do]` |
| Error display | GOV.UK | Error-summary top + inline per field |
| Tap target — minimum | WCAG 2.5.8 AA | 24 × 24 CSS px |
| Tap target — Apple | Apple HIG | 44 × 44 pt |
| Tap target — Material | Material Design | 48 × 48 dp |
| Tap target — rule | Combined | "24 minimum, 44–48 real target" |
| Never pure black | StyleSeed | Darkest text `#2A2A2A` |
| Card shadows | StyleSeed | 4–8% opacity |
| Numbers:units | StyleSeed | 2:1 ratio |
| Pill vs page | StyleSeed | 2–4 choices = pill, 5+ = own page |
| Glass / frost | Apple HIG + NN/g | Blur 10–25, one glass surface per view, 4.5:1 contrast after blur |

## References

- Cowan N. (2001) — *The magical number 4 in short-term memory*
- IBM Carbon Loading: https://carbondesignsystem.com/components/loading/usage/
- IBM Carbon Empty States: https://carbondesignsystem.com/patterns/empty-states-pattern/
- GOV.UK Error Message: https://design-system.service.gov.uk/components/error-message/
- WCAG 2.5.8 Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- Apple Human Interface Guidelines — Layout
- Material Design — Touch targets
- StyleSeed (StaffEng / Refactoring UI heuristics)

## DESIGN.md spec sections (Google Labs Stitch canonical format)

1. Overview — brand personality, target audience, emotional response
2. Colors — required `primary` palette + optional, mapped to tokens
3. Typography — 9-15 levels (fontFamily / Size / Weight / lineHeight / letterSpacing)
4. Layout — grid models + spacing scales
5. Elevation & Depth — hierarchy via visual style
6. Shapes — corner radius tokens
7. Components — token guidance for buttons / inputs / etc
8. Do's and Don'ts — guardrails

Source: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
