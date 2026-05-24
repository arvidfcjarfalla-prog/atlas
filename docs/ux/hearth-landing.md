# UX spec — Hearth landing page

## Context and constraints

This is Hearth's own marketing page. It must embody the product philosophy it describes: one strong claim, short proof, contact point. No template structure. The reader is a seed-stage hardware founder who will smell a templated page from the first scroll. The page itself is the evidence.

User job: A founder hears about Hearth at a meetup, visits the URL on their phone that evening. In under 90 seconds they need to understand what Hearth does, believe it is not another no-code vanity tool, and find a way to try it or ask a question.

---

## Information architecture

Cowan chunks: 4 named sections, in scroll order and priority order.

### Section 1 — Claim
Purpose: State what Hearth is in a single declarative sentence. No hedging, no verb fragments ("helping founders"), no em-dash rhythm. The sentence should survive being read aloud in a hallway.

Content:
- Wordmark / logotype (not a full nav bar — no links, no hamburger)
- One primary claim sentence, left-aligned, set large enough to read as a heading but typeset as prose — not a stacked hero headline with a sub-headline below it
- A secondary line: one sentence of mechanical description (what the output is, not what it "enables")
- Single CTA: a short, concrete action verb + object — e.g. "Build your page" or "Start with your product". Not "Get started for free →". Not a dual-CTA pair.

Empty state: Not applicable (the claim is always present; there is no collection here).

Error state: Not applicable (this section has no form input).

Interaction:
- The wordmark is the only interactive element above the CTA. It does not link out.
- CTA launches the intake flow (separate feature, out of scope for this spec).

Hick's law application: Only one visible action. The intake flow is behind the CTA — not a second button beside it. No "Learn more" anchor competing for the click.

### Section 2 — Proof
Purpose: Show one real founder page (not a mockup, not a placeholder screenshot) produced by Hearth. Let the artifact argue; do not describe it.

Content:
- A single artifact display: the live output of Hearth — rendered inline or as a high-fidelity static capture of an actual founder page. It must be a real-world product (hardware, food, materials, or textiles domain) not a fictional "Acme Corp" stand-in.
- Beneath the artifact: a two-line caption in reduced type weight identifying the founder + product. Not a testimonial block. Not a pull-quote with large decorative punctuation. Not a star rating.
- No "as seen in" logo row.
- No feature-grid below the artifact.

Empty state: If no real founder page is available at launch, show the intake form output for Hearth's own page, captioned as such. Do not substitute a synthetic example without disclosing it.

Error state: If the artifact fails to load (broken image / iframe timeout), show the caption only with a text note that the page is live at the subdomain — never a broken-image placeholder.

Hick's law application: No interactive controls on the artifact. No carousel. No "view more examples" link competing at this position — that deferred secondary affordance belongs in section 4.

### Section 3 — Mechanics
Purpose: Answer the two questions a skeptical founder asks before clicking a CTA: "How does this actually work?" and "What am I giving up control of?"

Content:
- Three sequential steps presented as a numbered vertical list — not cards, not icons. Each step is one line of label + one sentence of explanation. Steps are:
  1. Intake: describe your product (short form, AI drafts the claim sentence)
  2. Edit: click directly on the live page to revise any text yourself
  3. Publish: the page lives at a subdomain; custom domain is available

- A short disclosure below the list: "The structure is fixed. One claim, one proof section, one contact point. There is no template marketplace and no drag-and-drop editor."

This disclosure is load-bearing. It answers the "what am I giving up?" question honestly and filters out the wrong user.

Empty state: Not applicable.

Error state: Not applicable (static copy, no input).

Hick's law application: Three steps, in order. No branching, no optional paths shown. The custom domain mention is deferred inside step 3 as a parenthetical, not a second list item.

### Section 4 — Contact point
Purpose: Give the founder a way to reach a human if the CTA does not feel right. This is also the page's logical end, so it carries a secondary (quieter) repeat of the primary CTA.

Content:
- A plain email address or single-field email form (behavior: "send us a note"). Not a contact form with five fields. Not a chat widget with a floating button. Not a Calendly embed.
- Below it: a very short closing line — the founder's name, city, and a one-sentence origin story for Hearth in plain prose. No "built with love by a team of passionate engineers" copy.
- Repeated primary CTA in a reduced treatment (same label, smaller visual weight than section 1 — it is a reminder, not a second pitch).

Empty state: If the email form has no input, the send button is visually disabled or absent (show only the field with a placeholder label).

Error state:
- Error-summary location: inline, immediately below the email field. One sentence, no bullet list, no icon. Example direction: "That address doesn't look right — try again."
- Inline rule: validate format on blur, not on keystroke. Show the error message only after the user has finished typing and moved focus.
- On successful send: replace the field and button with a single confirmation line. No modal. No toast stack.

### Not a section — footer
A footer is present but is not a section. It contains:
- Copyright line
- One link: Privacy policy
- No social icons
- No newsletter signup
- No four-column link grid

---

## Interaction map

| Trigger | Result | Feedback timing |
|---|---|---|
| Page load | Claim section visible immediately; sections 2–4 load progressively as user scrolls | Content-driven, no loading spinner |
| Scroll past fold | Artifact in section 2 enters view | Scroll-driven reveal using `animation-timeline: view()` on the compositor; no JS scroll listener |
| Click primary CTA (section 1 or section 4) | Intake flow opens (out of scope for this spec) | Immediate — ≤100ms to first visual change |
| Focus email field (section 4) | Field expands to show send button | ≤200ms, opacity + transform only |
| Blur email field with invalid input | Inline error message appears below the field | Immediate on blur, not on keystroke |
| Blur email field with valid input | Error clears silently | Immediate |
| Submit email form | Field + button replaced by confirmation line | ≤200ms, no toast, no modal |
| Page width narrows below single-column breakpoint | Section 2 artifact scales to fill column width; all sections remain single-column | Not an interaction — responsive layout, no toggle |

---

## Component pattern selection

| Pattern | Behavior | Notes for implementer |
|---|---|---|
| Wordmark | Static text or SVG logotype, no link behavior | Not a shadcn component — bespoke. Set using a display-weight type token, not an `<img>` tag unless the logo is multi-color |
| Primary claim block | Single column, left-aligned, prose typesetting at display scale | No shadcn `Card` wrapper — raw `<section>` with typographic tokens. Set `text-wrap: pretty` on the claim sentence. `hanging-punctuation: first` if the sentence opens with a quote. |
| CTA button | Single contained action, not a link-button pair | Use Radix `<Button>` primitive with custom radius (4–8px), not shadcn Button defaults. Avoid `rounded-full`. |
| Artifact display | Full-width static capture or live iframe of a real founder page | No carousel, no lightbox. If static image: use `<figure>` + `<figcaption>`. If iframe: sandbox appropriately and set a fixed aspect ratio container with a CSS fallback. |
| Figcaption | Two-line text, founder name + product | Plain `<figcaption>` with a reduced type-weight token. No decorative punctuation. |
| Numbered mechanics list | Vertical ordered list, three items | Plain `<ol>` with typographic counter styling via `counter-reset` / `counter-increment`. Not a shadcn `Card` per item. Each item: label + one-sentence explanation on the same or next line. |
| Disclosure paragraph | Static copy, visually distinct from the numbered list | Slightly reduced optical weight — not a sidebar, not a callout box. A single `<p>` following the `<ol>`. |
| Email field | Single `<input type="email">` with a paired send control | No shadcn `Input` defaults unmodified. Use Radix `<TextField>` or a bare input with custom focus ring via `outline-offset`. Validate on blur only. |
| Inline error message | One sentence below the email field, conditionally rendered | GOV.UK pattern: `role="alert"` on the error container, `aria-describedby` linking the input to the message. No icon, no color-only signal — the message text is the signal. |
| Confirmation state | Replaces field + button on successful send | Plain text, same type scale as the field label. No toast (Sonner) — the replacement is in-place and does not float. |
| Footer | Copyright + privacy link only | Plain `<footer>` with a single `<nav>` containing one `<a>`. No grid. |
| Scroll-driven section reveals | Sections 2–4 enter with a subtle upward translate + opacity | `animation-timeline: view()` with `animation-range: entry 0% entry 30%`. Animate `transform` and `opacity` only. Wrap in `@media (prefers-reduced-motion: no-preference)` — static display at all other times. Implementer picks easing from the positive-patterns reference (image-reveal curve is appropriate here). |

---

## Out of scope for this spec

- Colors, exact typographic scale, specific font names — defer to the positive-patterns reference (`anti-ai-ui`). The implementer should pick a display serif or high-quality grotesque for the claim sentence; the font-stack tier list in the positive-patterns reference gives the allowed set.
- Exact spacing values — use the Fibonacci-ish ladder from the positive-patterns reference.
- Motion easing and spring configs — use the canonical curve set from the positive-patterns reference. Do not emit `transition: all 0.3s` or `duration: 0.5` without an easing override.
- Intake flow (the short form + AI draft step) — a separate UX spec.
- Inline editor (WYSIWYG click-to-edit on the founder's live page) — a separate UX spec.
- Custom domain upgrade flow — a separate UX spec.
- Mobile viewport breakpoints below the single-column threshold — the layout is single-column throughout; the implementer resolves the artifact aspect ratio for small screens without a separate spec.
- Analytics instrumentation, SEO meta tags, Open Graph.
- Copy — final wording lives in implementation. This spec provides label scaffolds only (e.g., "Build your page" is directional, not final).
