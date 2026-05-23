# Rauno Freiberg — 56 interface rules (verbatim)

Source: `github.com/raunofreiberg/interfaces`. Pasted exactly across seven categories.

## Interactivity (11)

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

## Typography (9)

1. Fonts should have `-webkit-font-smoothing: antialiased` applied for better legibility
2. Fonts should have `text-rendering: optimizeLegibility` applied for better legibility
3. Fonts should be subset based on the content, alphabet or relevant language(s)
4. Font weight should not change on hover or selected state to prevent layout shift
5. Font weights below 400 should not be used
6. Medium sized headings generally look best with a font weight between 500-600
7. Adjust values fluidly by using CSS `clamp()`, e.g. `clamp(48px, 5vw, 72px)`
8. Where available, tabular figures should be applied with `font-variant-numeric: tabular-nums`
9. Prevent text resizing unexpectedly in landscape mode on iOS with `-webkit-text-size-adjust: 100%`

## Motion (6)

1. Switching themes should not trigger transitions and animations on elements
2. Animation duration should not be more than **200ms** for interactions to feel immediate
3. Animation values should be proportional to the trigger size
4. Actions that are frequent and low in novelty should avoid extraneous animations
5. Looping animations should pause when not visible on the screen to offload CPU and GPU usage
6. Use `scroll-behavior: smooth` for navigating to in-page anchors, with an appropriate offset

## Touch (6)

1. Hover states should not be visible on touch press, use `@media (hover: hover)`
2. Font size for inputs should not be smaller than **16px** to prevent iOS zooming on focus
3. Inputs should not auto focus on touch devices as it will open the keyboard and cover the screen
4. Apply `muted` and `playsinline` to `<video />` tags to auto play on iOS
5. Disable `touch-action` for custom components that implement pan and zoom gestures
6. Disable the default iOS tap highlight with `-webkit-tap-highlight-color: rgba(0,0,0,0)`

## Optimizations (7)

1. Large `blur()` values for `filter` and `backdrop-filter` may be slow
2. Scaling and blurring filled rectangles will cause banding, use radial gradients instead
3. Sparingly enable GPU rendering with `transform: translateZ(0)` for unperformant animations
4. Toggle `will-change` on unperformant scroll animations for the duration of the animation
5. Auto-playing too many videos on iOS will choke the device, pause or unmount off-screen videos
6. Bypass React's render lifecycle with refs for real-time values that can commit to DOM directly
7. Detect and adapt to the hardware and network capabilities of the user's device

## Accessibility (12)

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

## Design (5)

1. Optimistically update data locally and roll back on server error with feedback
2. Authentication redirects should happen on the server before the client loads
3. Style the document selection state with `::selection`
4. Display feedback relative to its trigger
5. Empty states should prompt to create a new item, with optional templates
