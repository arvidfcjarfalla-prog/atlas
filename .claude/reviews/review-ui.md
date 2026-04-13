# ui

Thin primitives package. Two real issues: a dead `Sheet` family (exports + `vaul`-backed implementation with zero consumers) and a resize handle with no keyboard path. Plus two entirely unused Radix packages in `dependencies`.

## Fix These (breaks things or hides bugs)

- **Sidebar resize handle is mouse-only, no keyboard path** — `packages/ui/src/layout/sidebar-layout.tsx:85-96`. The handle is a bare `<div>` with only `onMouseDown`; no `tabIndex`, no `role`, no `aria-label`, no key handlers. Keyboard-only and screen-reader users cannot resize. Fix: add `role="separator"` (or `role="slider"` with min/max), `tabIndex={0}`, `aria-label="Resize sidebar"`, and an `onKeyDown` that adjusts width on `ArrowLeft`/`ArrowRight` (± 16 px is a reasonable default).

## Clean Up (dead code, unused stuff)

- **`@radix-ui/react-dialog` dependency is never imported** — `packages/ui/package.json:11`. `rg "@radix-ui/react-dialog"` hits only this file. Fix: remove from `dependencies` and run `pnpm install` to drop from the lockfile.

- **`@radix-ui/react-tooltip` dependency is never imported** — `packages/ui/package.json:14`. Same: only shows up in its own `package.json` entry and the lockfile, no source import. Fix: remove from `dependencies`.

- **`Sheet`/`SheetTrigger`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetDescription` exports are unused** — `packages/ui/src/index.ts:6-13` (approximate block; the sheet re-exports live here), implementation in `packages/ui/src/components/sheet.tsx`. `rg "Sheet(Content|Trigger|Title|Description|Header)?" apps/ packages/` returns zero consumers outside this package (docs/plan files that mention the name are not code). The `vaul` dependency (`packages/ui/package.json:19`) exists solely to back this dead component. Fix: delete `sheet.tsx`, drop the exports from `index.ts`, and remove `vaul` from `dependencies`. (Earlier audit already removed `vaul` from `apps/web` — this closes the loop.)

- **Badge has focus styles on a non-focusable `<div>`** — `packages/ui/src/components/badge.tsx:8,29`. `cva` adds `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`, but `Badge` renders a `<div>` with no `tabIndex` or `role`. The focus classes are dead. Fix: remove the three `focus:*` classes, or change the tag to `<span>` / add `tabIndex={0}` if Badge was ever meant to be interactive.

## Nice to Have (style, consistency)

- **Undocumented `exhaustive-deps` disable in `SidebarLayout`** — `packages/ui/src/layout/sidebar-layout.tsx:68-69`. `width` is intentionally captured by closure at drag-start, but the reason is implicit. Fix: replace the comment with `// width captured at drag-start — intentionally stale so the listener doesn't re-register on every pixel move`.

- **`ScrollArea.displayName` copies from the Radix primitive** — `packages/ui/src/components/scroll-area.tsx:28`. Works, but most components in this package use a string literal. Fix: `ScrollArea.displayName = "ScrollArea"` for consistency.

## Looks Good

- `packages/ui/src/components/button.tsx` — correct `forwardRef`, `asChild` slot support, proper `displayName`.
- `packages/ui/src/components/card.tsx` — semantic HTML (`h3`, `p`), all subcomponents forwarded.
- `packages/ui/src/components/utils.ts` — thin `cn` helper; nothing to flag.
- `packages/ui/src/components/scroll-area.tsx` — Radix wrapper is idiomatic.
- `packages/ui/tailwind.config.ts` — content globs correctly scan `apps/*/app`, `apps/*/components`, and `packages/*/src`.
- `packages/ui/src/tokens/themes.css` — imported by `apps/web/app/globals.css`; structure is fine.
- External consumers of live primitives: `Button` (map-core `map-controls.tsx`), `Badge`/`ScrollArea`/`cn` (map-modules `detail-panel.tsx`, multiple legend files, timeline), `SidebarLayout` (map-core `map-shell.tsx`), `ScrollArea` (disasters page). All pulling their weight.
