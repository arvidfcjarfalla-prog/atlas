---
description: Node scripts must import from source files, not barrel exports (CSS parse errors)
globs:
  - "scripts/**/*.ts"
  - "scripts/**/*.mjs"
  - "apps/web/scripts/**"
---

# Import Caveat for Node Scripts

`@atlas/map-core` barrel export imports MapLibre CSS. Scripts running in Node must import directly from source files to avoid CSS parse errors:

```typescript
// WRONG — causes CSS parse error in Node
import { compileLayer } from "@atlas/map-core";

// CORRECT — import from source
import { compileLayer } from "../../../packages/map-core/src/manifest-compiler.js";
```
