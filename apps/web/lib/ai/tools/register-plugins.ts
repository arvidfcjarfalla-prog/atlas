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
  eurostatNutsPlugin,
  usFipsPlugin,
  countryAdminPlugin,
} from "./geography-plugins";

if (pluginCount() === 0) {
  registerPlugin(swedenScbPlugin);
  registerPlugin(eurostatNutsPlugin);
  registerPlugin(usFipsPlugin);
  registerPlugin(countryAdminPlugin);
}
