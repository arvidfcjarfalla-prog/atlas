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
  icelandPlugin,
  denmarkDstPlugin,
  finlandPlugin,
  estoniaPlugin,
  sloveniaPlugin,
  latviaCsbPlugin,
  switzerlandFsoPlugin,
  eurostatNutsPlugin,
  usFipsPlugin,
  pxwebGenericPlugin,
  countryAdminPlugin,
} from "./geography-plugins";

if (pluginCount() === 0) {
  registerPlugin(swedenScbPlugin);      // priority 10 — SE-specific
  registerPlugin(norwaySsbPlugin);      // priority 10 — NO-specific
  registerPlugin(icelandPlugin);        // priority 10 — IS-specific
  registerPlugin(denmarkDstPlugin);     // priority 10 — DK-specific
  registerPlugin(finlandPlugin);        // priority 10 — FI-specific
  registerPlugin(estoniaPlugin);        // priority 10 — EE-specific
  registerPlugin(sloveniaPlugin);       // priority 10 — SI-specific
  registerPlugin(latviaCsbPlugin);      // priority 10 — LV-specific
  registerPlugin(switzerlandFsoPlugin); // priority 10 — CH-specific
  registerPlugin(eurostatNutsPlugin);   // priority  5 — EU NUTS
  registerPlugin(usFipsPlugin);         // priority  5 — US FIPS
  registerPlugin(pxwebGenericPlugin);   // priority  3 — all PxWeb v2 sources
  registerPlugin(countryAdminPlugin);   // priority  1 — ISO alpha-2/3 fallback
}
