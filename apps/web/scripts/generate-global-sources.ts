#!/usr/bin/env tsx
/**
 * generate-global-sources.ts
 *
 * Fetches geoBoundaries API metadata for all countries and generates:
 *   - apps/web/scripts/geometry-sources-generated.ts  (GeometrySource[])
 *   - apps/web/lib/ai/tools/geometry-registry-generated.ts  (GeometryEntry[])
 *
 * Run with: pnpm tsx apps/web/scripts/generate-global-sources.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const REPO_ROOT = join(__dirname, "..", "..", "..");

const OUTPUT_SOURCES = join(REPO_ROOT, "apps/web/scripts/geometry-sources-generated.ts");
const OUTPUT_REGISTRY = join(
  REPO_ROOT,
  "apps/web/lib/ai/tools/geometry-registry-generated.ts",
);

const GB_API_BASE = "https://www.geoboundaries.org/api/current/gbOpen";

// ISO2 codes already covered by hand-tuned entries in geometry-sources.ts.
// Keep this in sync with the skip list comment in the prompt.
const SKIP_ISO2 = new Set([
  "SE", "NO", "DK", "FI", "DE", "FR", "GB", "NL", "ES", "IT",
  "PL", "US", "CA", "MX", "BR", "JP", "KR", "CN", "IN", "ID",
  "AU", "ZA", "NG", "TR", "RU",
]);

// ═══════════════════════════════════════════════════════════════
// Complete ISO 3166-1 alpha-3 → alpha-2 lookup table
// ═══════════════════════════════════════════════════════════════

const ISO3_TO_ISO2: Record<string, string> = {
  ABW: "AW", AFG: "AF", AGO: "AO", AIA: "AI", ALA: "AX", ALB: "AL",
  AND: "AD", ARE: "AE", ARG: "AR", ARM: "AM", ASM: "AS", ATA: "AQ",
  ATF: "TF", ATG: "AG", AUS: "AU", AUT: "AT", AZE: "AZ", BDI: "BI",
  BEL: "BE", BEN: "BJ", BES: "BQ", BFA: "BF", BGD: "BD", BGR: "BG",
  BHR: "BH", BHS: "BS", BIH: "BA", BLM: "BL", BLR: "BY", BLZ: "BZ",
  BMU: "BM", BOL: "BO", BRA: "BR", BRB: "BB", BRN: "BN", BTN: "BT",
  BVT: "BV", BWA: "BW", CAF: "CF", CAN: "CA", CCK: "CC", CHE: "CH",
  CHL: "CL", CHN: "CN", CIV: "CI", CMR: "CM", COD: "CD", COG: "CG",
  COK: "CK", COL: "CO", COM: "KM", CPV: "CV", CRI: "CR", CUB: "CU",
  CUW: "CW", CXR: "CX", CYM: "KY", CYP: "CY", CZE: "CZ", DEU: "DE",
  DJI: "DJ", DMA: "DM", DNK: "DK", DOM: "DO", DZA: "DZ", ECU: "EC",
  EGY: "EG", ERI: "ER", ESH: "EH", ESP: "ES", EST: "EE", ETH: "ET",
  FIN: "FI", FJI: "FJ", FLK: "FK", FRA: "FR", FRO: "FO", FSM: "FM",
  GAB: "GA", GBR: "GB", GEO: "GE", GGY: "GG", GHA: "GH", GIB: "GI",
  GIN: "GN", GLP: "GP", GMB: "GM", GNB: "GW", GNQ: "GQ", GRC: "GR",
  GRD: "GD", GRL: "GL", GTM: "GT", GUF: "GF", GUM: "GU", GUY: "GY",
  HKG: "HK", HMD: "HM", HND: "HN", HRV: "HR", HTI: "HT", HUN: "HU",
  IDN: "ID", IMN: "IM", IND: "IN", IOT: "IO", IRL: "IE", IRN: "IR",
  IRQ: "IQ", ISL: "IS", ISR: "IL", ITA: "IT", JAM: "JM", JEY: "JE",
  JOR: "JO", JPN: "JP", KAZ: "KZ", KEN: "KE", KGZ: "KG", KHM: "KH",
  KIR: "KI", KNA: "KN", KOR: "KR", KWT: "KW", LAO: "LA", LBN: "LB",
  LBR: "LR", LBY: "LY", LCA: "LC", LIE: "LI", LKA: "LK", LSO: "LS",
  LTU: "LT", LUX: "LU", LVA: "LV", MAC: "MO", MAF: "MF", MAR: "MA",
  MCO: "MC", MDA: "MD", MDG: "MG", MDV: "MV", MEX: "MX", MHL: "MH",
  MKD: "MK", MLI: "ML", MLT: "MT", MMR: "MM", MNE: "ME", MNG: "MN",
  MNP: "MP", MOZ: "MZ", MRT: "MR", MSR: "MS", MTQ: "MQ", MUS: "MU",
  MWI: "MW", MYS: "MY", MYT: "YT", NAM: "NA", NCL: "NC", NER: "NE",
  NFK: "NF", NGA: "NG", NIC: "NI", NIU: "NU", NLD: "NL", NOR: "NO",
  NPL: "NP", NRU: "NR", NZL: "NZ", OMN: "OM", PAK: "PK", PAN: "PA",
  PCN: "PN", PER: "PE", PHL: "PH", PLW: "PW", PNG: "PG", POL: "PL",
  PRI: "PR", PRK: "KP", PRT: "PT", PRY: "PY", PSE: "PS", PYF: "PF",
  QAT: "QA", REU: "RE", ROU: "RO", RUS: "RU", RWA: "RW", SAU: "SA",
  SDN: "SD", SEN: "SN", SGP: "SG", SGS: "GS", SHN: "SH", SJM: "SJ",
  SLB: "SB", SLE: "SL", SLV: "SV", SMR: "SM", SOM: "SO", SPM: "PM",
  SRB: "RS", SSD: "SS", STP: "ST", SUR: "SR", SVK: "SK", SVN: "SI",
  SWE: "SE", SWZ: "SZ", SXM: "SX", SYC: "SC", SYR: "SY", TCA: "TC",
  TCD: "TD", TGO: "TG", THA: "TH", TJK: "TJ", TKL: "TK", TKM: "TM",
  TLS: "TL", TON: "TO", TTO: "TT", TUN: "TN", TUR: "TR", TUV: "TV",
  TWN: "TW", TZA: "TZ", UGA: "UG", UKR: "UA", UMI: "UM", URY: "UY",
  USA: "US", UZB: "UZ", VAT: "VA", VCT: "VC", VEN: "VE", VGB: "VG",
  VIR: "VI", VNM: "VN", VUT: "VU", WLF: "WF", WSM: "WS", XKX: "XK",
  YEM: "YE", ZAF: "ZA", ZMB: "ZM", ZWE: "ZW",
};

// ═══════════════════════════════════════════════════════════════
// geoBoundaries API types
// ═══════════════════════════════════════════════════════════════

interface GbEntry {
  boundaryISO: string;
  boundaryType: string;
  boundaryCanonical: string;
  admUnitCount: string;
  Continent: string;
  gjDownloadURL?: string;
  simplifiedGeometryGeoJSON?: string;
}

// ═══════════════════════════════════════════════════════════════
// Fetch helpers
// ═══════════════════════════════════════════════════════════════

async function fetchWithRetry(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      console.warn(`  Retry (attempt ${attempt} failed): ${url}`);
      // brief pause before retry
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  // unreachable — loop always throws on second failure
  throw new Error("unreachable");
}

async function fetchLevel(level: "ADM1" | "ADM2"): Promise<GbEntry[]> {
  const url = `${GB_API_BASE}/ALL/${level}/`;
  console.log(`Fetching ${level} index: ${url}`);
  const data = await fetchWithRetry(url);
  if (!Array.isArray(data)) {
    throw new Error(`Expected array from ${url}, got ${typeof data}`);
  }
  return data as GbEntry[];
}

// ═══════════════════════════════════════════════════════════════
// Code generation helpers
// ═══════════════════════════════════════════════════════════════

/** Escape a string for safe embedding in single-quoted TypeScript string literals. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── GeometrySource entry codegen ───────────────────────────

interface SourceEntry {
  iso3: string;
  iso2: string;
  canonical: string;
  level: "ADM1" | "ADM2";
  admUnitCount: number;
}

function renderSourceEntry(e: SourceEntry): string[] {
  const iso2Lower = e.iso2.toLowerCase();
  const levelSlug = e.level === "ADM1" ? "admin1" : "admin2";
  const id = `${iso2Lower}:${levelSlug}`;
  const outputPath = `geo/${iso2Lower}/${levelSlug}.geojson`;
  const tolerance = e.level === "ADM1" ? "0.005" : "0.001";
  const propsConst = e.level === "ADM1" ? "GB_ADM1_PROPS" : "GB_ADM2_PROPS";

  return [
    `  {`,
    `    id: '${esc(id)}',`,
    `    url: gb('${esc(e.iso3)}', '${e.level}'),`,
    `    isGeoBoundariesApi: true,`,
    `    useSimplified: true,`,
    `    outputPath: '${esc(outputPath)}',`,
    `    simplifyTolerance: ${tolerance},`,
    `    coordinatePrecision: 5,`,
    `    propertyMap: ${propsConst},`,
    `    expectedFeatures: ${e.admUnitCount},`,
    `  },`,
  ];
}

// ─── GeometryEntry registry codegen ─────────────────────────

function renderRegistryEntry(e: SourceEntry): string[] {
  const iso2Lower = e.iso2.toLowerCase();
  const levelSlug = e.level === "ADM1" ? "admin1" : "admin2";
  const id = `${iso2Lower}:${levelSlug}`;
  const loaderTarget = `geo/${iso2Lower}/${levelSlug}.geojson`;
  const levelValue = e.level === "ADM1" ? "admin1" : "admin2";
  const keysConst = e.level === "ADM1" ? "GB_ADM1_KEYS" : "GB_ADM2_KEYS";
  const featureIdProp = e.level === "ADM1" ? "iso_3166_2" : "name";
  const adminLabel = e.level === "ADM1" ? "Admin 1" : "Admin 2";
  const entryName = `${esc(e.canonical)} ${adminLabel}`;

  return [
    `  {`,
    `    id: '${esc(id)}',`,
    `    name: '${entryName}',`,
    `    level: '${levelValue}',`,
    `    scope: { regionCode: '${esc(e.iso2)}' },`,
    `    loaderType: 'local_file',`,
    `    loaderTarget: '${esc(loaderTarget)}',`,
    `    joinKeys: ${keysConst},`,
    `    featureIdProperty: '${featureIdProp}',`,
    `    featureCount: ${e.admUnitCount},`,
    `    resolution: 'medium',`,
    `    status: 'provisional',`,
    `  },`,
  ];
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // Fetch both levels in parallel
  const [adm1Raw, adm2Raw] = await Promise.all([
    fetchLevel("ADM1"),
    fetchLevel("ADM2"),
  ]);

  console.log(`ADM1 entries from API: ${adm1Raw.length}`);
  console.log(`ADM2 entries from API: ${adm2Raw.length}`);

  const sourceEntries: SourceEntry[] = [];
  let skippedCount = 0;
  let unknownIso3Count = 0;

  function process(raw: GbEntry[], level: "ADM1" | "ADM2"): void {
    for (const entry of raw) {
      const iso3 = entry.boundaryISO?.trim().toUpperCase();
      if (!iso3) continue;

      const iso2 = ISO3_TO_ISO2[iso3];
      if (!iso2) {
        console.warn(`  Unknown ISO3 '${iso3}' (${entry.boundaryCanonical}) — skipping`);
        unknownIso3Count++;
        continue;
      }

      if (SKIP_ISO2.has(iso2)) {
        skippedCount++;
        continue;
      }

      const admUnitCount = parseInt(entry.admUnitCount ?? "0", 10) || 0;

      sourceEntries.push({
        iso3,
        iso2,
        canonical: entry.boundaryCanonical?.trim() ?? iso2,
        level,
        admUnitCount,
      });
    }
  }

  process(adm1Raw, "ADM1");
  process(adm2Raw, "ADM2");

  // Sort deterministically: by ISO2 then level
  sourceEntries.sort((a, b) => {
    const cmp = a.iso2.localeCompare(b.iso2);
    if (cmp !== 0) return cmp;
    return a.level.localeCompare(b.level);
  });

  const adm1Count = sourceEntries.filter((e) => e.level === "ADM1").length;
  const adm2Count = sourceEntries.filter((e) => e.level === "ADM2").length;

  console.log(`\nGenerated entries:`);
  console.log(`  ADM1: ${adm1Count}`);
  console.log(`  ADM2: ${adm2Count}`);
  console.log(`  Skipped (already in geometry-sources.ts): ${skippedCount} pairs`);
  console.log(`  Unknown ISO3 codes: ${unknownIso3Count}`);

  // ── Write geometry-sources-generated.ts ───────────────────

  const sourceLines: string[] = [
    "// AUTO-GENERATED by generate-global-sources.ts — do not edit manually",
    `// Generated: ${new Date().toISOString()}`,
    "",
    "import type { GeometrySource } from './geometry-sources';",
    "",
    "// ═══════════════════════════════════════════════════════════════",
    "// geoBoundaries helper (mirrors geometry-sources.ts)",
    "// ═══════════════════════════════════════════════════════════════",
    "",
    "function gb(iso3: string, level: 'ADM1' | 'ADM2'): string {",
    "  return `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${level}/`;",
    "}",
    "",
    "// ═══════════════════════════════════════════════════════════════",
    "// Property maps",
    "// ═══════════════════════════════════════════════════════════════",
    "",
    "const GB_ADM1_PROPS: Record<string, string> = {",
    "  shapeName: 'name',",
    "  shapeISO: 'iso_3166_2',",
    "  shapeGroup: 'iso_a3',",
    "};",
    "",
    "const GB_ADM2_PROPS: Record<string, string> = {",
    "  shapeName: 'name',",
    "  shapeGroup: 'iso_a3',",
    "};",
    "",
    "// ═══════════════════════════════════════════════════════════════",
    "// Generated sources",
    "// ═══════════════════════════════════════════════════════════════",
    "",
    "export const GENERATED_SOURCES: GeometrySource[] = [",
  ];

  for (const e of sourceEntries) {
    sourceLines.push(...renderSourceEntry(e));
    sourceLines.push("");
  }

  // Remove trailing blank line before closing bracket
  if (sourceLines[sourceLines.length - 1] === "") {
    sourceLines.pop();
  }
  sourceLines.push("];", "");

  writeFileSync(OUTPUT_SOURCES, sourceLines.join("\n"), "utf-8");
  console.log(`\nWrote: ${OUTPUT_SOURCES}`);

  // ── Write geometry-registry-generated.ts ──────────────────

  const registryLines: string[] = [
    "// AUTO-GENERATED by generate-global-sources.ts — do not edit manually",
    `// Generated: ${new Date().toISOString()}`,
    "",
    "import type { GeometryEntry, JoinKeyConfig } from './geometry-registry';",
    "",
    "// ═══════════════════════════════════════════════════════════════",
    "// Standard join key configs (mirrors geometry-registry.ts)",
    "// ═══════════════════════════════════════════════════════════════",
    "",
    "const GB_ADM1_KEYS: JoinKeyConfig[] = [",
    "  { geometryProperty: 'iso_3166_2', codeFamily: { family: 'iso', namespace: '3166-2' } },",
    "  { geometryProperty: 'name', codeFamily: { family: 'name' } },",
    "];",
    "",
    "const GB_ADM2_KEYS: JoinKeyConfig[] = [",
    "  { geometryProperty: 'name', codeFamily: { family: 'name' } },",
    "];",
    "",
    "// ═══════════════════════════════════════════════════════════════",
    "// Generated registry entries",
    "// ═══════════════════════════════════════════════════════════════",
    "",
    "export const GENERATED_ENTRIES: GeometryEntry[] = [",
  ];

  for (const e of sourceEntries) {
    registryLines.push(...renderRegistryEntry(e));
    registryLines.push("");
  }

  if (registryLines[registryLines.length - 1] === "") {
    registryLines.pop();
  }
  registryLines.push("];", "");

  writeFileSync(OUTPUT_REGISTRY, registryLines.join("\n"), "utf-8");
  console.log(`Wrote: ${OUTPUT_REGISTRY}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
