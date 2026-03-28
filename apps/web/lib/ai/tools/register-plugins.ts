/**
 * Register built-in geography plugins.
 *
 * Side-effect module — importing this file registers the plugins.
 * Guarded by pluginCount() to prevent double-registration.
 *
 * Import this from any module that needs plugins available at runtime
 * (e.g. pxweb-resolution.ts).
 */

import {
  registerPlugin,
  pluginCount,
  swedenScbPlugin,
  norwaySsbPlugin,
  denmarkDstPlugin,
  eurostatNutsPlugin,
  usFipsPlugin,
  pxwebGenericPlugin,
  countryAdminPlugin,
} from "./geography-plugins";

if (pluginCount() === 0) {
  registerPlugin(swedenScbPlugin);      // priority 10 — SE-specific
  registerPlugin(norwaySsbPlugin);      // priority 10 — NO-specific
  registerPlugin(denmarkDstPlugin);     // priority 10 — DK-specific
  registerPlugin(eurostatNutsPlugin);   // priority  5 — EU NUTS
  registerPlugin(usFipsPlugin);         // priority  5 — US FIPS
  registerPlugin(pxwebGenericPlugin);   // priority  3 — all PxWeb v2 sources
  registerPlugin(countryAdminPlugin);   // priority  1 — ISO alpha-2/3 fallback
}
