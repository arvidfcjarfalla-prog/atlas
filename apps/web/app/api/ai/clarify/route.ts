import { NextResponse } from "next/server";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MODELS } from "../../../../lib/ai/ai-client";
import { matchCatalog } from "../../../../lib/ai/data-catalog";
import { buildClarifyPrompt } from "../../../../lib/ai/clarify-prompt";
import { profileDataset } from "../../../../lib/ai/profiler";
import { resolveAmenityQuery, queryOverpass } from "../../../../lib/ai/tools/overpass";
import { searchPublicData, getCachedData, fetchGeoJSON, hasNumericProperties } from "../../../../lib/ai/tools/data-search";
import { searchWebDatasets } from "../../../../lib/ai/tools/web-dataset-search";
import { searchWebResearch } from "../../../../lib/ai/tools/web-research";
import { classifyIntent, type PromptIntent } from "../../../../lib/ai/tools/intent-classifier";
import { searchDataCommons } from "../../../../lib/ai/tools/data-commons";
import { searchEurostat } from "../../../../lib/ai/tools/eurostat";
import { extractIntent, checkRegistry } from "../../../../lib/ai/tools/dataset-registry";
import { resolveOfficialStatsSources, type ResolvedSource } from "../../../../lib/ai/tools/official-stats-resolver";
import { resolvePxWeb } from "../../../../lib/ai/tools/pxweb-resolution";
import { getStatsAdapter } from "../../../../lib/ai/tools/pxweb-client";
import { classifyPipelineResult, buildTabularFallbackResponse, type TabularStash } from "../../../../lib/ai/pipeline-decision";
import { generateTabularSuggestions, generateAlternativeSuggestions } from "../../../../lib/ai/tools/ai-suggestion-generator";
import type { ClarifyResponse, DatasetProfile } from "../../../../lib/ai/types";
import { normalizePrompt, getCachedClarify, storeClarifyResult, incrementCacheHit } from "../../../../lib/ai/clarify-cache";
import { storeResolution, findSimilarResolutions } from "../../../../lib/ai/clarify-resolution-store";
import { log, logDiagnostic } from "../../../../lib/logger";
import { reportError } from "../../../../lib/error-reporter";

const MAX_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 3;

// ─── Historical basemap resolution ──────────────────────────

/** Available years in the aourednik/historical-basemaps repo (sorted). */
const AVAILABLE_YEARS = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
  1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783,
  1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994,
  2000, 2010,
];

/** Snap a year to the nearest available basemap file. */
function snapToAvailableYear(year: number): string {
  let closest = AVAILABLE_YEARS[0];
  let minDist = Math.abs(year - closest);
  for (const y of AVAILABLE_YEARS) {
    const dist = Math.abs(year - y);
    if (dist < minDist) {
      minDist = dist;
      closest = y;
    }
  }
  return String(closest);
}

/** Map prompt keywords/years to historical-basemaps GeoJSON filenames. */
const HISTORICAL_YEAR_MAP: [RegExp, number][] = [
  // Explicit years — captured group parsed as number
  [/\b(19\d{2}|20[01]\d|1[0-8]\d{2})\b/, 0],
  // Named periods → representative years
  [/\b(ww2|world war (ii|2|two)|andra världskriget)\b/i, 1945],
  [/\b(ww1|world war (i|1|one)|first world war|första världskriget)\b/i, 1914],
  [/\b(cold war|kalla kriget)\b/i, 1960],
  [/\b(napoleon|napoleonic|napoleonkrigen)\b/i, 1815],
  [/\b(colonial|koloni)\b/i, 1880],
  [/\b(british empire|brittiska imperiet)\b/i, 1920],
  [/\b(ottoman|osmansk)\b/i, 1700],
  [/\b(mongol|mongoliska|genghis|djingis)\b/i, 1279],
  [/\b(roman empire|romerska riket|romarriket)\b/i, 100],
  [/\b(medieval|medeltid)\b/i, 1200],
  [/\b(ancient|antik)\b/i, 200],
  [/\b(1945|end of (ww2|world war))\b/i, 1945],
  [/\b(1938|pre.?war|förkrigs)\b/i, 1938],
  [/\b(aztec|aztek)\b/i, 1492],
  [/\b(persian|persiska)\b/i, 500],
  [/\b(viking)\b/i, 900],
  [/\b(byzantine|bysantinska)\b/i, 1000],
  [/\b(crusade|korståg)\b/i, 1200],
];

function resolveHistoricalYear(prompt: string): string {
  for (const [pattern, targetYear] of HISTORICAL_YEAR_MAP) {
    const m = prompt.match(pattern);
    if (m) {
      // targetYear 0 means use the captured explicit year
      const year = targetYear === 0 ? parseInt(m[1], 10) : targetYear;
      return snapToAvailableYear(year);
    }
  }
  return "1945"; // sensible default
}

// ─── Geocoding helpers ──────────────────────────────────────

interface CityCoords {
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // [south, west, north, east]
}

/**
 * Known cities for bounding box resolution.
 * Avoids external geocoding calls for common cities.
 */
const KNOWN_CITIES: Record<string, CityCoords> = {
  // Nordic
  stockholm: { lat: 59.33, lng: 18.07, bbox: [59.2, 17.8, 59.45, 18.3] },
  göteborg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  gothenburg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  malmö: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  malmo: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  uppsala: { lat: 59.86, lng: 17.64, bbox: [59.8, 17.5, 59.95, 17.8] },
  copenhagen: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  köpenhamn: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  oslo: { lat: 59.91, lng: 10.75, bbox: [59.8, 10.5, 60.0, 11.0] },
  helsinki: { lat: 60.17, lng: 24.94, bbox: [60.1, 24.7, 60.3, 25.2] },
  // Western Europe
  london: { lat: 51.51, lng: -0.13, bbox: [51.3, -0.5, 51.7, 0.3] },
  paris: { lat: 48.86, lng: 2.35, bbox: [48.8, 2.2, 48.95, 2.5] },
  berlin: { lat: 52.52, lng: 13.41, bbox: [52.35, 13.1, 52.7, 13.8] },
  amsterdam: { lat: 52.37, lng: 4.9, bbox: [52.3, 4.75, 52.45, 5.05] },
  utrecht: { lat: 52.09, lng: 5.12, bbox: [52.04, 5.03, 52.14, 5.2] },
  barcelona: { lat: 41.39, lng: 2.17, bbox: [41.3, 2.0, 41.5, 2.3] },
  rome: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  rom: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  madrid: { lat: 40.42, lng: -3.7, bbox: [40.3, -3.9, 40.55, -3.5] },
  munich: { lat: 48.14, lng: 11.58, bbox: [48.0, 11.35, 48.25, 11.8] },
  münchen: { lat: 48.14, lng: 11.58, bbox: [48.0, 11.35, 48.25, 11.8] },
  vienna: { lat: 48.21, lng: 16.37, bbox: [48.1, 16.2, 48.33, 16.55] },
  wien: { lat: 48.21, lng: 16.37, bbox: [48.1, 16.2, 48.33, 16.55] },
  prague: { lat: 50.08, lng: 14.44, bbox: [49.95, 14.25, 50.18, 14.65] },
  prag: { lat: 50.08, lng: 14.44, bbox: [49.95, 14.25, 50.18, 14.65] },
  lisbon: { lat: 38.72, lng: -9.14, bbox: [38.6, -9.3, 38.82, -9.0] },
  lissabon: { lat: 38.72, lng: -9.14, bbox: [38.6, -9.3, 38.82, -9.0] },
  dublin: { lat: 53.35, lng: -6.26, bbox: [53.25, -6.45, 53.45, -6.1] },
  zurich: { lat: 47.37, lng: 8.54, bbox: [47.3, 8.4, 47.44, 8.65] },
  zürich: { lat: 47.37, lng: 8.54, bbox: [47.3, 8.4, 47.44, 8.65] },
  brussels: { lat: 50.85, lng: 4.35, bbox: [50.78, 4.25, 50.92, 4.48] },
  bryssel: { lat: 50.85, lng: 4.35, bbox: [50.78, 4.25, 50.92, 4.48] },
  warsaw: { lat: 52.23, lng: 21.01, bbox: [52.1, 20.85, 52.35, 21.2] },
  budapest: { lat: 47.50, lng: 19.04, bbox: [47.35, 18.9, 47.6, 19.2] },
  athens: { lat: 37.98, lng: 23.73, bbox: [37.85, 23.6, 38.1, 23.9] },
  aten: { lat: 37.98, lng: 23.73, bbox: [37.85, 23.6, 38.1, 23.9] },
  edinburgh: { lat: 55.95, lng: -3.19, bbox: [55.88, -3.35, 56.02, -3.05] },
  milan: { lat: 45.46, lng: 9.19, bbox: [45.38, 9.05, 45.55, 9.35] },
  milano: { lat: 45.46, lng: 9.19, bbox: [45.38, 9.05, 45.55, 9.35] },
  istanbul: { lat: 41.01, lng: 28.98, bbox: [40.85, 28.6, 41.2, 29.35] },
  // Americas
  "new york": { lat: 40.71, lng: -74.01, bbox: [40.5, -74.3, 40.9, -73.7] },
  "los angeles": { lat: 34.05, lng: -118.24, bbox: [33.7, -118.7, 34.35, -117.9] },
  chicago: { lat: 41.88, lng: -87.63, bbox: [41.65, -87.85, 42.05, -87.4] },
  "san francisco": { lat: 37.77, lng: -122.42, bbox: [37.7, -122.55, 37.85, -122.35] },
  toronto: { lat: 43.65, lng: -79.38, bbox: [43.55, -79.55, 43.8, -79.2] },
  "mexico city": { lat: 19.43, lng: -99.13, bbox: [19.2, -99.4, 19.6, -98.9] },
  "buenos aires": { lat: -34.60, lng: -58.38, bbox: [-34.75, -58.55, -34.5, -58.25] },
  "são paulo": { lat: -23.55, lng: -46.63, bbox: [-23.75, -46.85, -23.35, -46.4] },
  "sao paulo": { lat: -23.55, lng: -46.63, bbox: [-23.75, -46.85, -23.35, -46.4] },
  "rio de janeiro": { lat: -22.91, lng: -43.17, bbox: [-23.1, -43.4, -22.75, -43.0] },
  bogota: { lat: 4.71, lng: -74.07, bbox: [4.5, -74.25, 4.85, -73.9] },
  bogotá: { lat: 4.71, lng: -74.07, bbox: [4.5, -74.25, 4.85, -73.9] },
  // Asia
  tokyo: { lat: 35.68, lng: 139.69, bbox: [35.5, 139.4, 35.85, 140.0] },
  mumbai: { lat: 19.08, lng: 72.88, bbox: [18.9, 72.75, 19.3, 73.05] },
  bangkok: { lat: 13.76, lng: 100.5, bbox: [13.6, 100.3, 13.9, 100.7] },
  singapore: { lat: 1.35, lng: 103.82, bbox: [1.2, 103.6, 1.5, 104.0] },
  seoul: { lat: 37.57, lng: 126.98, bbox: [37.43, 126.8, 37.7, 127.15] },
  beijing: { lat: 39.90, lng: 116.40, bbox: [39.7, 116.1, 40.1, 116.7] },
  peking: { lat: 39.90, lng: 116.40, bbox: [39.7, 116.1, 40.1, 116.7] },
  shanghai: { lat: 31.23, lng: 121.47, bbox: [31.05, 121.2, 31.4, 121.7] },
  dubai: { lat: 25.20, lng: 55.27, bbox: [25.0, 55.0, 25.35, 55.5] },
  "hong kong": { lat: 22.32, lng: 114.17, bbox: [22.15, 113.85, 22.55, 114.4] },
  delhi: { lat: 28.61, lng: 77.21, bbox: [28.4, 76.95, 28.85, 77.45] },
  // Africa & Oceania
  sydney: { lat: -33.87, lng: 151.21, bbox: [-34.1, 150.9, -33.6, 151.4] },
  melbourne: { lat: -37.81, lng: 144.96, bbox: [-38.0, 144.7, -37.6, 145.2] },
  "cape town": { lat: -33.93, lng: 18.42, bbox: [-34.1, 18.2, -33.75, 18.65] },
  kapstaden: { lat: -33.93, lng: 18.42, bbox: [-34.1, 18.2, -33.75, 18.65] },
  cairo: { lat: 30.04, lng: 31.24, bbox: [29.85, 31.0, 30.2, 31.5] },
  kairo: { lat: 30.04, lng: 31.24, bbox: [29.85, 31.0, 30.2, 31.5] },
  nairobi: { lat: -1.29, lng: 36.82, bbox: [-1.45, 36.65, -1.15, 37.0] },
};

/** Country-level bounding boxes for Overpass queries that target a whole country. */
const KNOWN_COUNTRIES: Record<string, CityCoords> = {
  france: { lat: 46.6, lng: 2.5, bbox: [41.3, -5.2, 51.1, 9.6] },
  frankrike: { lat: 46.6, lng: 2.5, bbox: [41.3, -5.2, 51.1, 9.6] },
  germany: { lat: 51.2, lng: 10.4, bbox: [47.3, 5.9, 55.1, 15.0] },
  tyskland: { lat: 51.2, lng: 10.4, bbox: [47.3, 5.9, 55.1, 15.0] },
  italy: { lat: 42.5, lng: 12.5, bbox: [36.6, 6.6, 47.1, 18.5] },
  italien: { lat: 42.5, lng: 12.5, bbox: [36.6, 6.6, 47.1, 18.5] },
  spain: { lat: 40.0, lng: -3.7, bbox: [36.0, -9.3, 43.8, 3.3] },
  spanien: { lat: 40.0, lng: -3.7, bbox: [36.0, -9.3, 43.8, 3.3] },
  sweden: { lat: 62.0, lng: 15.0, bbox: [55.3, 11.1, 69.1, 24.2] },
  sverige: { lat: 62.0, lng: 15.0, bbox: [55.3, 11.1, 69.1, 24.2] },
  norway: { lat: 64.5, lng: 12.0, bbox: [58.0, 4.6, 71.2, 31.1] },
  norge: { lat: 64.5, lng: 12.0, bbox: [58.0, 4.6, 71.2, 31.1] },
  denmark: { lat: 56.0, lng: 10.0, bbox: [54.6, 8.1, 57.8, 12.7] },
  danmark: { lat: 56.0, lng: 10.0, bbox: [54.6, 8.1, 57.8, 12.7] },
  finland: { lat: 64.0, lng: 26.0, bbox: [59.8, 20.6, 70.1, 31.6] },
  "united kingdom": { lat: 54.0, lng: -2.0, bbox: [49.9, -8.2, 60.9, 1.8] },
  uk: { lat: 54.0, lng: -2.0, bbox: [49.9, -8.2, 60.9, 1.8] },
  england: { lat: 52.5, lng: -1.5, bbox: [49.9, -5.7, 55.8, 1.8] },
  japan: { lat: 36.2, lng: 138.3, bbox: [24.4, 122.9, 45.6, 153.0] },
  netherlands: { lat: 52.2, lng: 5.3, bbox: [50.8, 3.4, 53.5, 7.2] },
  holland: { lat: 52.2, lng: 5.3, bbox: [50.8, 3.4, 53.5, 7.2] },
  portugal: { lat: 39.5, lng: -8.0, bbox: [37.0, -9.5, 42.2, -6.2] },
  switzerland: { lat: 46.8, lng: 8.2, bbox: [45.8, 5.9, 47.8, 10.5] },
  schweiz: { lat: 46.8, lng: 8.2, bbox: [45.8, 5.9, 47.8, 10.5] },
  austria: { lat: 47.5, lng: 14.6, bbox: [46.4, 9.5, 49.0, 17.2] },
  österrike: { lat: 47.5, lng: 14.6, bbox: [46.4, 9.5, 49.0, 17.2] },
  belgium: { lat: 50.5, lng: 4.5, bbox: [49.5, 2.5, 51.5, 6.4] },
  belgien: { lat: 50.5, lng: 4.5, bbox: [49.5, 2.5, 51.5, 6.4] },
  poland: { lat: 52.0, lng: 19.4, bbox: [49.0, 14.1, 54.8, 24.2] },
  polen: { lat: 52.0, lng: 19.4, bbox: [49.0, 14.1, 54.8, 24.2] },
  greece: { lat: 39.1, lng: 22.0, bbox: [34.8, 19.4, 41.7, 26.6] },
  grekland: { lat: 39.1, lng: 22.0, bbox: [34.8, 19.4, 41.7, 26.6] },
  australia: { lat: -25.3, lng: 133.8, bbox: [-43.6, 113.2, -10.7, 153.6] },
  australien: { lat: -25.3, lng: 133.8, bbox: [-43.6, 113.2, -10.7, 153.6] },
  brazil: { lat: -14.2, lng: -51.9, bbox: [-33.8, -73.9, 5.3, -34.8] },
  brasilien: { lat: -14.2, lng: -51.9, bbox: [-33.8, -73.9, 5.3, -34.8] },
  // Additional European countries
  ireland: { lat: 53.4, lng: -7.7, bbox: [51.4, -10.5, 55.4, -6.0] },
  irland: { lat: 53.4, lng: -7.7, bbox: [51.4, -10.5, 55.4, -6.0] },
  scotland: { lat: 56.8, lng: -4.2, bbox: [54.6, -7.6, 60.9, -0.7] },
  wales: { lat: 52.3, lng: -3.7, bbox: [51.4, -5.3, 53.4, -2.7] },
  iceland: { lat: 64.9, lng: -18.5, bbox: [63.3, -24.5, 66.6, -13.5] },
  island: { lat: 64.9, lng: -18.5, bbox: [63.3, -24.5, 66.6, -13.5] },
  croatia: { lat: 45.2, lng: 15.5, bbox: [42.4, 13.5, 46.6, 19.4] },
  kroatien: { lat: 45.2, lng: 15.5, bbox: [42.4, 13.5, 46.6, 19.4] },
  czechia: { lat: 49.8, lng: 15.5, bbox: [48.6, 12.1, 51.1, 18.9] },
  tjeckien: { lat: 49.8, lng: 15.5, bbox: [48.6, 12.1, 51.1, 18.9] },
  hungary: { lat: 47.2, lng: 19.5, bbox: [45.7, 16.1, 48.6, 22.9] },
  ungern: { lat: 47.2, lng: 19.5, bbox: [45.7, 16.1, 48.6, 22.9] },
  romania: { lat: 45.9, lng: 25.0, bbox: [43.6, 20.3, 48.3, 29.7] },
  rumänien: { lat: 45.9, lng: 25.0, bbox: [43.6, 20.3, 48.3, 29.7] },
  turkey: { lat: 39.0, lng: 35.2, bbox: [36.0, 26.0, 42.1, 44.8] },
  turkiet: { lat: 39.0, lng: 35.2, bbox: [36.0, 26.0, 42.1, 44.8] },
  // Asia
  "south korea": { lat: 36.5, lng: 128.0, bbox: [33.1, 124.6, 38.6, 131.9] },
  sydkorea: { lat: 36.5, lng: 128.0, bbox: [33.1, 124.6, 38.6, 131.9] },
  china: { lat: 35.9, lng: 104.2, bbox: [18.2, 73.5, 53.6, 135.1] },
  kina: { lat: 35.9, lng: 104.2, bbox: [18.2, 73.5, 53.6, 135.1] },
  india: { lat: 20.6, lng: 79.0, bbox: [6.7, 68.2, 35.5, 97.4] },
  indien: { lat: 20.6, lng: 79.0, bbox: [6.7, 68.2, 35.5, 97.4] },
  thailand: { lat: 15.9, lng: 100.9, bbox: [5.6, 97.3, 20.5, 105.6] },
  vietnam: { lat: 14.1, lng: 108.3, bbox: [8.4, 102.1, 23.4, 109.5] },
  indonesia: { lat: -0.8, lng: 114.0, bbox: [-11.0, 95.0, 6.1, 141.0] },
  indonesien: { lat: -0.8, lng: 114.0, bbox: [-11.0, 95.0, 6.1, 141.0] },
  malaysia: { lat: 4.2, lng: 108.0, bbox: [0.9, 100.1, 7.4, 119.3] },
  philippines: { lat: 12.9, lng: 122.0, bbox: [4.6, 116.9, 21.1, 126.6] },
  filippinerna: { lat: 12.9, lng: 122.0, bbox: [4.6, 116.9, 21.1, 126.6] },
  taiwan: { lat: 23.7, lng: 121.0, bbox: [21.9, 120.0, 25.3, 122.0] },
  // Americas
  canada: { lat: 56.1, lng: -106.3, bbox: [41.7, -141.0, 83.1, -52.6] },
  kanada: { lat: 56.1, lng: -106.3, bbox: [41.7, -141.0, 83.1, -52.6] },
  "united states": { lat: 37.1, lng: -95.7, bbox: [24.5, -124.8, 49.4, -66.9] },
  usa: { lat: 37.1, lng: -95.7, bbox: [24.5, -124.8, 49.4, -66.9] },
  mexico: { lat: 23.6, lng: -102.6, bbox: [14.5, -118.4, 32.7, -86.7] },
  mexiko: { lat: 23.6, lng: -102.6, bbox: [14.5, -118.4, 32.7, -86.7] },
  argentina: { lat: -38.4, lng: -63.6, bbox: [-55.1, -73.6, -21.8, -53.6] },
  colombia: { lat: 4.6, lng: -74.3, bbox: [-4.2, -79.0, 12.5, -66.9] },
  peru: { lat: -9.2, lng: -75.0, bbox: [-18.4, -81.3, -0.04, -68.7] },
  chile: { lat: -35.7, lng: -71.5, bbox: [-56.0, -75.6, -17.5, -66.4] },
  // Africa
  "south africa": { lat: -30.6, lng: 25.0, bbox: [-34.8, 16.5, -22.1, 32.9] },
  sydafrika: { lat: -30.6, lng: 25.0, bbox: [-34.8, 16.5, -22.1, 32.9] },
  egypt: { lat: 26.8, lng: 30.8, bbox: [22.0, 24.7, 31.7, 36.9] },
  egypten: { lat: 26.8, lng: 30.8, bbox: [22.0, 24.7, 31.7, 36.9] },
  kenya: { lat: -0.02, lng: 37.9, bbox: [-4.7, 33.9, 5.0, 41.9] },
  morocco: { lat: 31.8, lng: -7.1, bbox: [27.7, -13.2, 35.9, -1.0] },
  marocko: { lat: 31.8, lng: -7.1, bbox: [27.7, -13.2, 35.9, -1.0] },
  nigeria: { lat: 9.1, lng: 8.7, bbox: [4.3, 2.7, 13.9, 14.7] },
  ethiopia: { lat: 9.1, lng: 40.5, bbox: [3.4, 33.0, 14.9, 48.0] },
  etiopien: { lat: 9.1, lng: 40.5, bbox: [3.4, 33.0, 14.9, 48.0] },
  // Middle East
  "saudi arabia": { lat: 24.0, lng: 45.1, bbox: [16.4, 34.6, 32.2, 55.7] },
  saudiarabien: { lat: 24.0, lng: 45.1, bbox: [16.4, 34.6, 32.2, 55.7] },
  iran: { lat: 32.4, lng: 53.7, bbox: [25.1, 44.0, 39.8, 63.3] },
  iraq: { lat: 33.2, lng: 43.7, bbox: [29.1, 38.8, 37.4, 48.6] },
  irak: { lat: 33.2, lng: 43.7, bbox: [29.1, 38.8, 37.4, 48.6] },
  israel: { lat: 31.1, lng: 34.9, bbox: [29.5, 34.3, 33.3, 35.9] },
  // Oceania
  "new zealand": { lat: -40.9, lng: 174.9, bbox: [-47.3, 166.4, -34.4, 178.6] },
  "nya zeeland": { lat: -40.9, lng: 174.9, bbox: [-47.3, 166.4, -34.4, 178.6] },
  // Russia
  russia: { lat: 61.5, lng: 105.3, bbox: [41.2, 19.6, 81.9, 180.0] },
  ryssland: { lat: 61.5, lng: 105.3, bbox: [41.2, 19.6, 81.9, 180.0] },
};

function findCity(prompt: string): CityCoords | null {
  const lower = prompt.toLowerCase();
  // Sort longest names first so "new york" matches before "york"
  const sorted = Object.entries(KNOWN_CITIES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, coords] of sorted) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (regex.test(lower)) return coords;
  }
  // Fallback: check country-level bboxes
  const countrySorted = Object.entries(KNOWN_COUNTRIES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, coords] of countrySorted) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (regex.test(lower)) return coords;
  }
  return null;
}

// ─── Region detection ───────────────────────────────────

/** Map region keywords to continent/region values used in GeoJSON properties. */
const REGION_MAP: [string[], string][] = [
  [["europe", "european", "eu ", "europa", "nordic", "scandinavian", "norden", "skandinavien"], "Europe"],
  [["africa", "african", "afrika"], "Africa"],
  [["asia", "asian", "asien", "middle east", "mellanöstern"], "Asia"],
  [["south america", "sydamerika", "latinamerika", "latin america"], "South America"],
  [["north america", "nordamerika"], "North America"],
  [["oceania"], "Oceania"],
];

/** Detect which region the user is asking about from the prompt text. */
function detectRegionName(lowerPrompt: string): string | null {
  for (const [keywords, region] of REGION_MAP) {
    if (keywords.some((kw) => lowerPrompt.includes(kw))) return region;
  }
  return null;
}

// ─── Overpass resolution ────────────────────────────────────

/**
 * Try to resolve a prompt as a POI query.
 * Returns { dataUrl, profile } if successful.
 */
async function tryOverpassResolution(
  prompt: string,
  origin: string,
): Promise<{ dataUrl: string; profile: DatasetProfile } | null> {
  const city = findCity(prompt);
  if (!city) return null;

  const query = resolveAmenityQuery(prompt, city.bbox);
  if (!query) return null;

  const fc = await queryOverpass(query);
  if (!fc || fc.features.length === 0) return null;

  const profile = profileDataset(fc);
  const dataUrl = `/api/geo/overpass?type=${encodeURIComponent(query.value)}&bbox=${city.bbox.join(",")}`;

  return { dataUrl, profile };
}

// ─── Extracting JSON from AI response ───────────────────────

function extractJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ─── Route handler ──────────────────────────────────────────

export const maxDuration = 120; // seconds — web research with Sonnet can take 30-60s

export async function POST(request: Request): Promise<NextResponse> {
  const t0 = Date.now();
  let capturedPrompt: string | undefined;
  try {
    const body = await request.json();
    const prompt = body?.prompt;
    const answers: Record<string, string> = body?.answers ?? {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'prompt' field" },
        { status: 400 },
      );
    }

    const trimmedPrompt = prompt.trim();
    capturedPrompt = trimmedPrompt;
    const promptKey = normalizePrompt(trimmedPrompt);

    log("clarify.start", { prompt: trimmedPrompt.slice(0, 100) });

    // ── Cache lookup (before everything) ─────────────────────
    const cached = await getCachedClarify(promptKey);
    if (cached) {
      void incrementCacheHit(promptKey).catch(() => {});
      log("clarify.cache_hit", { promptKey, latencyMs: Date.now() - t0 });
      return NextResponse.json(cached.response);
    }

    // Start fetching few-shot examples and intent classification in parallel
    const fewShotPromise = findSimilarResolutions(trimmedPrompt, 3).catch(
      () => [] as Awaited<ReturnType<typeof findSimilarResolutions>>,
    );
    const intentPromise = process.env.ANTHROPIC_API_KEY
      ? Promise.race([
          classifyIntent(trimmedPrompt),
          new Promise<{ intent: PromptIntent }>((resolve) =>
            setTimeout(() => resolve({ intent: "general" }), 10_000),
          ),
        ])
      : Promise.resolve({ intent: "general" as PromptIntent });

    // Combine prompt with any previous answers
    const fullContext = Object.keys(answers).length > 0
      ? `${trimmedPrompt}\n\nUser clarifications:\n${Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join("\n")}`
      : trimmedPrompt;

    // Await intent (runs in parallel with few-shot fetch, ~200ms)
    const { intent: routingIntent } = await intentPromise;

    // Fire-and-forget: store result in cache + resolution store
    function storeSuccess(response: ClarifyResponse, sourceType: string) {
      void Promise.all([
        storeClarifyResult(promptKey, response),
        response.resolvedPrompt && response.dataUrl
          ? storeResolution(trimmedPrompt, promptKey, response.resolvedPrompt, response.dataUrl, sourceType)
          : undefined,
      ]).catch(() => {});
    }

    // ── Regional scope detection ───────────────────────────
    // Detect geographic scope keywords to prevent the global catalog
    // match from swallowing region-specific queries (e.g. "GDP in Europe").
    const REGION_KEYWORDS = [
      "europe", "european", "eu ", "europa",
      "africa", "african", "afrika",
      "asia", "asian", "asien",
      "south america", "latin america", "sydamerika", "latinamerika",
      "north america", "nordamerika",
      "nordic", "scandinavian", "norden", "skandinavien",
      "middle east", "mellanöstern",
      "oceania",
    ];
    const lowerPrompt = fullContext.toLowerCase();
    const hasRegionalScope = REGION_KEYWORDS.some((kw) => lowerPrompt.includes(kw));

    // Detect explicit global/worldwide scope — prevents Eurostat from
    // catching prompts like "CO2 per capita worldwide" that need global data.
    const GLOBAL_KEYWORDS = [
      "worldwide", "globally", "global", "all countries", "every country",
      "hela världen", "världen", "samtliga länder", "alla länder",
      "whole world", "around the world", "across the world",
    ];
    const hasGlobalScope = GLOBAL_KEYWORDS.some((kw) => lowerPrompt.includes(kw));

    // ── Fast path 0: Historical basemap ─────────────────────
    // Check BEFORE catalog — "World War 2" contains "world" which
    // falsely matches the world-countries catalog entry.
    const historicalYear = resolveHistoricalYear(fullContext);
    const isHistoricalPrompt = HISTORICAL_YEAR_MAP.some(([pattern]) => pattern.test(fullContext));
    if (isHistoricalPrompt) {
      const entry = matchCatalog("historical")[0];
      if (entry?.endpoint.endsWith("/")) {
        const endpointUrl = `${entry.endpoint}world_${historicalYear}.geojson`;
        let profile: DatasetProfile | null = null;
        try {
          const res = await fetch(endpointUrl, { signal: AbortSignal.timeout(15_000) });
          if (res.ok) {
            const geojson = await res.json();
            if (geojson?.type === "FeatureCollection") {
              profile = profileDataset(geojson);
            }
          }
        } catch { /* proceed without profile */ }
        const response: ClarifyResponse = {
          ready: true,
          resolvedPrompt: fullContext,
          dataUrl: endpointUrl,
          ...(profile ? { dataProfile: profile } : {}),
        };
        log("clarify.resolved", { source: "historical", latencyMs: Date.now() - t0 });
        storeSuccess(response, "catalog");
        return NextResponse.json(response);
      }
    }

    // ── Fast path 1: Catalog match ─────────────────────────
    // Catalog entries have curated geometry types (polygon for countries,
    // point for cities/earthquakes) — checked first to avoid REST Countries
    // returning Point geometry for queries that need polygons.
    const catalogMatches = matchCatalog(fullContext);
    if (catalogMatches.length > 0) {
      const best = catalogMatches[0];

      // Skip world-countries when prompt has regional scope — let
      // Eurostat/WorldBank handle region-specific queries instead.
      if (best.id === "world-countries" && hasRegionalScope) {
        // Fall through to Eurostat/WorldBank fast paths
      } else if (best.requiresEnv && !process.env[best.requiresEnv]) {
        // Skip this match — try other resolution paths
      } else {
        // Resolve endpoint URL — directory-style endpoints (e.g. historical-basemaps)
        // need a specific file appended based on prompt context.
        let endpointUrl = best.endpoint;
        if (best.endpoint.endsWith("/")) {
          const year = resolveHistoricalYear(fullContext);
          endpointUrl = `${best.endpoint}world_${year}.geojson`;
        }

        // Fetch and profile the data for the generation step
        let profile: DatasetProfile | null = null;
        const isExternal = endpointUrl.startsWith("http");
        try {
          const fetchUrl = isExternal
            ? endpointUrl
            : new URL(endpointUrl, request.url).toString();
          const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(15_000) });
          if (res.ok) {
            const geojson = await res.json();
            if (geojson?.type === "FeatureCollection") {
              profile = profileDataset(geojson);
            }
          }
        } catch {
          // Profiling failed — proceed without profile
        }

        const response: ClarifyResponse = {
          ready: true,
          resolvedPrompt: fullContext,
          dataUrl: endpointUrl,
          ...(profile ? { dataProfile: profile } : {}),
        };

        log("clarify.resolved", { source: "catalog", catalogId: best.id, latencyMs: Date.now() - t0 });
        storeSuccess(response, "catalog");
        return NextResponse.json(response);
      }
    }

    // ── Fast path 1.5: Overpass POI resolution ──────────────────
    // Runs early because POI queries (brewery, skatepark, café) are
    // unambiguous and should never be interpreted as country-level stats.
    // Returns null if no amenity mapping matches — safe to always try.
    {
      const overpassResult = await tryOverpassResolution(fullContext, request.url);
      if (overpassResult) {
        const response: ClarifyResponse = {
          ready: true,
          resolvedPrompt: fullContext,
          dataUrl: overpassResult.dataUrl,
          dataProfile: overpassResult.profile,
        };

        log("clarify.resolved", { source: "overpass", featureCount: overpassResult.profile?.featureCount ?? 0, latencyMs: Date.now() - t0 });
        storeSuccess(response, "overpass");
        return NextResponse.json(response);
      }
    }

    // ── Entity search shortcut ──────────────────────────────────
    // When intent classifier says "entity_search", skip all stats sources
    // and jump straight to web research. Saves 10-30s of wasted API calls.
    if (routingIntent === "entity_search") {
      const webApiKeyEntity = process.env.ANTHROPIC_API_KEY;
      if (webApiKeyEntity) {
        try {
          log("clarify.entity_search_shortcut", { prompt: fullContext.slice(0, 60) });
          const webResResult = await searchWebResearch(fullContext);
          if (webResResult.found && webResResult.cacheKey) {
            const dataUrl = `/api/geo/cached/${encodeURIComponent(webResResult.cacheKey)}`;
            const response: ClarifyResponse = {
              ready: true,
              resolvedPrompt: fullContext,
              dataUrl,
              dataProfile: webResResult.profile,
            };
            log("clarify.resolved", { source: "web-research", via: "entity_search", featureCount: webResResult.featureCount ?? 0, latencyMs: Date.now() - t0 });
            storeSuccess(response, "web-research");
            return NextResponse.json(response);
          }
        } catch (e) {
          logDiagnostic("warning", "clarify", "entity-search", e);
        }
      }
    }

    // ── Fast path 2: Official stats (PxWeb) ────────────────────
    // Run PxWeb FIRST when the prompt targets a country with a PxWeb source
    // (Norway/SSB, Sweden/SCB, etc.). This prevents Eurostat/DataCommons from
    // matching generic terms like "income" or "education" against Europe-wide
    // data when the user explicitly asked for subnational Norwegian data.
    const intent = extractIntent(fullContext);
    const officialSources = resolveOfficialStatsSources(intent, fullContext);

    let pxTabularFallback: TabularStash | null = null;

    if (officialSources.length > 0) {
      const topPxWeb = officialSources.find(
        (s) => getStatsAdapter(s.source) !== null,
      );
      if (topPxWeb) {
        try {
          const pxResolution = await resolvePxWeb(topPxWeb.source, fullContext);
          const decision = classifyPipelineResult(pxResolution, fullContext);

          if (decision.kind === "terminate") {
            if (decision.response.ready && decision.response.dataUrl) {
              log("clarify.resolved", { source: "pxweb", latencyMs: Date.now() - t0 });
              storeSuccess(decision.response, "pxweb");
            }
            return NextResponse.json(decision.response);
          }
          if (decision.kind === "stash_tabular") {
            pxTabularFallback = decision.stash;
          }
          // "continue": fall through to next fast path
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          log("clarify.error", { error: errMsg, phase: "pxweb", latencyMs: Date.now() - t0 });
          // PxWeb resolution failed — continue to next fast path
        }
      }
    }

    // ── Fast path 2.5: Data Commons (subnational statistics) ────
    // Runs BEFORE World Bank because DC uses AI intent extraction
    // that handles any language. If the prompt is subnational, DC
    // catches it here; if not, it returns { found: false } fast and
    // World Bank handles country-level queries below.
    //
    // Skip when PxWeb already found metric data — DC only provides admin1
    // (county-level) data for most countries and would give a coarser result
    // than what PxWeb found (e.g. 10 counties instead of 357 municipalities).
    const dcResult = !pxTabularFallback
      ? await searchDataCommons(fullContext).catch((e) => {
          logDiagnostic("warning", "clarify", "data-commons", e);
          return { found: false as const };
        })
      : { found: false as const };
    if (dcResult.found && dcResult.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(dcResult.cacheKey)}`;
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: dcResult.englishPrompt ?? fullContext,
        dataUrl,
        dataProfile: dcResult.profile,
      };
      log("clarify.resolved", { source: "data-commons", featureCount: dcResult.profile?.featureCount ?? 0, latencyMs: Date.now() - t0 });
      storeSuccess(response, "data-commons");
      return NextResponse.json(response);
    }

    // ── Fast path 3: Eurostat (European country-level statistics) ──
    // Uses AI intent extraction — handles any language.
    // Covers indicators World Bank lacks (minimum wage, Gini, etc.).
    // Skip when prompt explicitly asks for global/worldwide data.
    const eurostatResult = hasGlobalScope
      ? { found: false as const }
      : await searchEurostat(fullContext).catch((e) => {
          logDiagnostic("warning", "clarify", "eurostat", e);
          return { found: false as const };
        });
    if (eurostatResult.found && eurostatResult.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(eurostatResult.cacheKey)}`;
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: eurostatResult.englishPrompt ?? fullContext,
        dataUrl,
        dataProfile: eurostatResult.profile,
      };
      log("clarify.resolved", { source: "eurostat", featureCount: eurostatResult.profile?.featureCount ?? 0, latencyMs: Date.now() - t0 });
      storeSuccess(response, "eurostat");
      return NextResponse.json(response);
    }

    // ── Fast path 3.5: World Bank, EONET, REST Countries ────────
    // Country-level indicators (e.g. "GDP per capita").
    const directSearch = await searchPublicData(fullContext).catch((e) => {
      logDiagnostic("warning", "clarify", "worldbank", e);
      return { found: false as const };
    });
    if (directSearch.found && directSearch.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(directSearch.cacheKey)}`;
      // When the user asked for a specific region but World Bank returns global data,
      // add a scopeHint so generate-map can apply a filter.
      let scopeHint: ClarifyResponse["scopeHint"];
      if (hasRegionalScope) {
        const regionMatch = detectRegionName(lowerPrompt);
        if (regionMatch) {
          scopeHint = { region: regionMatch, filterField: "continent" };
        }
      }
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: fullContext,
        dataUrl,
        dataProfile: directSearch.profile,
        ...(scopeHint ? { scopeHint } : {}),
      };
      log("clarify.resolved", { source: "worldbank", featureCount: directSearch.profile?.featureCount ?? 0, latencyMs: Date.now() - t0 });
      storeSuccess(response, "worldbank");
      return NextResponse.json(response);
    }

    // ── Fast path 3.5: Dataset registry (previously discovered web datasets)
    // Skip when PxWeb already found metric data — the registry may return
    // unrelated cached geometry from a previous query.
    if (!pxTabularFallback) {
      const registryHit = await checkRegistry(intent);
      if (registryHit) {
        const registryCached = await getCachedData(registryHit.cacheKey);
        // Only serve cached data if it has actual numeric values (not boundary-only)
        if (registryCached && hasNumericProperties(registryCached.data)) {
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: fullContext,
            dataUrl: `/api/geo/cached/${encodeURIComponent(registryHit.cacheKey)}`,
            dataProfile: registryCached.profile,
          };
          log("clarify.resolved", { source: "registry", latencyMs: Date.now() - t0 });
          storeSuccess(response, "registry");
          return NextResponse.json(response);
        }
        // Data expired from cache or boundary-only — re-fetch from stored URL
        const refetched = await fetchGeoJSON(registryHit.datasetUrl, { requireNumericData: true });
        if (refetched.found && refetched.cacheKey) {
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: fullContext,
            dataUrl: `/api/geo/cached/${encodeURIComponent(refetched.cacheKey)}`,
            dataProfile: refetched.profile,
          };
          log("clarify.resolved", { source: "registry", via: "refetch", latencyMs: Date.now() - t0 });
          storeSuccess(response, "registry");
          return NextResponse.json(response);
        }
      }
    }

    // ── Agency hint: short-circuit before web search ──────────────
    // When a matched source covers the topic but has no adapter,
    // tell the user immediately which agency has the data instead of
    // spending 30-60s on web search that will likely fail.
    // Logic: find sources whose coverageTags overlap with the prompt's
    // topic tags but that have no working adapter. If such a source
    // exists and PxWeb didn't produce data, short-circuit.
    if (officialSources.length > 0 && !pxTabularFallback) {
      // Find an unconnected source that matched the prompt's topic.
      // Only short-circuit when no connected source covers the same tags —
      // otherwise let the connected source try first (it may just be slow).
      const connectedTags = new Set(
        officialSources
          .filter((s) => getStatsAdapter(s.source) !== null)
          .flatMap((s) => s.source.coverageTags),
      );
      const unconnectedWithTopic = officialSources.find((s) => {
        if (getStatsAdapter(s.source) !== null) return false;
        // Only short-circuit if this source covers a tag that no connected source covers
        return s.source.coverageTags.some((t) => !connectedTags.has(t));
      });
      if (unconnectedWithTopic) {
        const src = unconnectedWithTopic.source;
        const rawUrl = src.docsUrl ?? src.baseUrl;
        const portalUrl = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const response: ClarifyResponse = {
          ready: false,
          dataWarning:
            `Atlas has no automatic connection to ${src.agencyName}. ` +
            `You can download the data from their portal and upload it as CSV.`,
          suggestions: [],
          agencyHint: {
            agencyName: src.agencyName,
            portalUrl,
            countryName: src.countryName,
            coverageTags: src.coverageTags,
          },
        };
        log("clarify.agency_hint", {
          agency: src.agencyName,
          portalUrl,
          latencyMs: Date.now() - t0,
        });
        return NextResponse.json(response);
      }
    }

    // ── Fast path 4.5: Web research (entity extraction from web) ──
    // For prompts about specific entities (people, businesses, events, venues)
    // whose locations must be discovered via web search + Photon geocoding.
    const webApiKeyEarly = process.env.ANTHROPIC_API_KEY;
    if (webApiKeyEarly && process.env.ATLAS_DISABLE_WEB_SEARCH !== "true" && !pxTabularFallback) {
      try {
        log("clarify.web_research_start", { intent: routingIntent, prompt: fullContext.slice(0, 60) });
        const webResResult = await searchWebResearch(fullContext);
        log("clarify.web_research_result", { found: webResResult.found, featureCount: webResResult.featureCount ?? 0, error: webResResult.error ?? null });
        if (webResResult.found && webResResult.cacheKey) {
          const dataUrl = `/api/geo/cached/${encodeURIComponent(webResResult.cacheKey)}`;
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: fullContext,
            dataUrl,
            dataProfile: webResResult.profile,
          };
          log("clarify.resolved", { source: "web-research", featureCount: webResResult.featureCount ?? 0, latencyMs: Date.now() - t0 });
          storeSuccess(response, "web-research");
          return NextResponse.json(response);
        }
      } catch (e) {
        logDiagnostic("warning", "clarify", "web-research", e);
      }
    }

    // ── Fast path 5: Web dataset search ───────────────────────
    // All internal sources failed — try searching the internet for datasets
    // before falling back to the AI clarification loop.
    // If official sources were identified, enrich the search query.
    // Set ATLAS_DISABLE_WEB_SEARCH=true in .env.local to skip during development.
    //
    // Skip entirely when a PxWeb source was identified — web search would
    // find boundary-only GeoJSONs (e.g. GitHub municipality polygons) that
    // get cached and served on subsequent requests before PxWeb runs.
    const webApiKey = process.env.ANTHROPIC_API_KEY;
    const hasPxWebSource = officialSources.some(
      (s) => getStatsAdapter(s.source) !== null,
    );
    // Block web search only when PxWeb found usable tabular data (avoids
    // caching boundary-only GeoJSONs). When PxWeb had a source but fully
    // failed, allow web search to rescue the query.
    const pxWebProducedData = hasPxWebSource && pxTabularFallback !== null;
    if (webApiKey && process.env.ATLAS_DISABLE_WEB_SEARCH !== "true" && !pxWebProducedData) {
      try {
        const webQuery = fullContext;
        const sourceHints = officialSources.length > 0
          ? officialSources.slice(0, 3).map((s) => ({
              agencyName: s.source.agencyName,
              baseUrl: s.source.baseUrl,
              formats: s.source.formats,
            }))
          : undefined;
        const webResult = await searchWebDatasets(webQuery, sourceHints);
        if (webResult.found && webResult.cacheKey) {
          // If PxWeb already found metric data for this query, prefer the
          // tabular fallback — the web search may have found unrelated data
          // (e.g. boundary polygons or shipping routes instead of income).
          if (!pxTabularFallback) {
            const dataUrl = `/api/geo/cached/${encodeURIComponent(webResult.cacheKey)}`;
            const response: ClarifyResponse = {
              ready: true,
              resolvedPrompt: fullContext,
              dataUrl,
              dataProfile: webResult.profile,
            };
            log("clarify.resolved", { source: "web-search", featureCount: webResult.profile?.featureCount ?? 0, latencyMs: Date.now() - t0 });
            storeSuccess(response, "web-search");
            return NextResponse.json(response);
          }
          // Otherwise skip web result — tabular fallback has verified metric data
        }
      } catch (e) {
        logDiagnostic("warning", "clarify", "web-dataset-search", e);
      }
    }

    // ── Tabular fallback: PxWeb found data but no geometry ────
    // All map-capable fast paths exhausted. If PxWeb found tabular data,
    // surface it with resolutionStatus: "tabular_only" so the frontend
    // knows this is NOT a map-ready result.
    if (pxTabularFallback) {
      let suggestions: string[] = [];
      if (process.env.ANTHROPIC_API_KEY && pxTabularFallback.tableLabel) {
        suggestions = await generateTabularSuggestions(
          fullContext,
          pxTabularFallback.tableLabel,
          pxTabularFallback.reasons ?? [],
        );
      }
      return NextResponse.json(
        buildTabularFallbackResponse(pxTabularFallback, fullContext, suggestions),
      );
    }

    // ── Slow path: AI clarification with tool use ────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // No API key — return suggestions for built-in datasets
      const response: ClarifyResponse = {
        ready: false,
        dataWarning:
          "Atlas kunde inte hitta data för din sökning.",
        suggestions: [
          "Visa jordskalv senaste dygnet",
          "BNP per capita i världens länder",
          "Befolkningstäthet i Europa",
        ],
      };
      return NextResponse.json(response);
    }

    const officialSourceContext = officialSources.length > 0
      ? `\n\nNote: Relevant official statistics sources identified:\n${officialSources.slice(0, 5).map((s) => `- ${s.source.agencyName} (${s.source.baseUrl}) — topics: ${s.source.coverageTags.join(", ")}`).join("\n")}\nUse search_web_datasets to find downloadable data from these or similar sources.`
      : "";

    const fewShotExamples = await fewShotPromise;

    const aiResult = await generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS,
      system: buildClarifyPrompt(fewShotExamples),
      tools: {
        search_public_data: tool({
          description:
            "Search public data APIs for geographic datasets. Sources: World Bank (population, GDP, CO2, etc. with country polygons), NASA EONET (active wildfires, volcanoes, storms, floods as points), REST Countries (country metadata with capitals as points). Can also fetch/validate direct GeoJSON URLs.",
          inputSchema: z.object({
            query: z.string().describe("Search query describing the data needed"),
            url: z.string().optional().describe("Optional direct URL to a GeoJSON file to fetch and validate"),
          }),
          execute: async ({ query, url }) => {
            const r = await searchPublicData(query, url);
            return JSON.stringify(r);
          },
        }),
        search_web_datasets: tool({
          description:
            "Search the internet for downloadable geographic datasets (GeoJSON, CSV). Use AFTER search_public_data returns no results. Searches open data portals, GitHub, and government data sites.",
          inputSchema: z.object({
            query: z.string().describe("Descriptive search query including topic, metric, and geography"),
          }),
          execute: async ({ query }) => {
            const r = await searchWebDatasets(query);
            return JSON.stringify(r);
          },
        }),
      },
      stopWhen: stepCountIs(MAX_TOOL_ROUNDS + 1),
      messages: [
        { role: "user" as const, content: fullContext + officialSourceContext },
      ],
    });

    const aiText = aiResult.text;
    if (!aiText) {
      return NextResponse.json({
        ready: false,
        dataWarning: "Could not resolve data source. Try uploading your own data or use a built-in dataset.",
        questions: [
          {
            id: "data-source",
            question: "Would you like to upload your own data?",
            options: ["Upload CSV", "Show earthquakes", "World countries"],
            aspect: "data-source",
          },
        ],
      } satisfies ClarifyResponse);
    }

    try {
      const parsed = extractJSON(aiText) as {
        ready?: boolean;
        resolvedPrompt?: string;
        matchedCatalogId?: string;
        useOverpass?: { type: string; city: string };
        searchedData?: { cacheKey: string; description: string };
        questions?: Array<{
          id: string;
          question: string;
          options?: string[];
          recommended?: string;
          aspect?: string;
        }>;
        dataWarning?: string;
      };

      // If AI matched a catalog entry, resolve it
      if (parsed.matchedCatalogId) {
        const entry = catalogMatches.find((e) => e.id === parsed.matchedCatalogId)
          ?? matchCatalog(parsed.matchedCatalogId)[0];

        if (entry) {
          // Directory-style endpoints (e.g. historical-basemaps/) need a
          // concrete filename appended — same logic as the catalog fast path.
          let endpointUrl = entry.endpoint;
          if (endpointUrl.endsWith("/")) {
            const year = resolveHistoricalYear(parsed.resolvedPrompt ?? fullContext);
            endpointUrl = `${endpointUrl}world_${year}.geojson`;
          }
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
            dataUrl: endpointUrl,
          };
          storeSuccess(response, "ai");
          return NextResponse.json(response);
        }
      }

      // If AI suggested Overpass, try resolving
      if (parsed.useOverpass) {
        const city = findCity(parsed.useOverpass.city);
        if (city) {
          const query = resolveAmenityQuery(parsed.useOverpass.type, city.bbox);
          if (query) {
            const dataUrl = `/api/geo/overpass?type=${encodeURIComponent(query.value)}&bbox=${city.bbox.join(",")}`;
            const response: ClarifyResponse = {
              ready: true,
              resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
              dataUrl,
            };
            storeSuccess(response, "ai");
            return NextResponse.json(response);
          }
        }
      }

      // If AI used search_public_data and found data
      if (parsed.searchedData?.cacheKey) {
        const cachedData = await getCachedData(parsed.searchedData.cacheKey);
        // Only return ready if data actually exists in cache
        if (cachedData) {
          const dataUrl = `/api/geo/cached/${encodeURIComponent(parsed.searchedData.cacheKey)}`;
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
            dataUrl,
            dataProfile: cachedData.profile,
          };
          storeSuccess(response, "ai");
          return NextResponse.json(response);
        }
        // Cache miss — fall through to questions
      }

      // Reject ready:true when no code path above produced a dataUrl.
      // Previous branches (matchedCatalogId, useOverpass, searchedData) return
      // early on success — if we reach here, all of them either weren't set
      // or failed to resolve. The AI's ready:true is untrustworthy without data.
      if (parsed.ready) {
        parsed.ready = false;
        if (!parsed.dataWarning) {
          parsed.dataWarning = "Could not find a suitable data source. Try a more specific prompt or upload your own data.";
        }
      }

      // Instead of showing clarification questions, generate alternative
      // prompt suggestions that are close to what the user asked but
      // that Atlas can actually resolve.
      const warningText = parsed.dataWarning
        ?? "Atlas kunde inte hitta data för din sökning.";
      let suggestions: string[] = [];
      if (process.env.ANTHROPIC_API_KEY) {
        suggestions = await generateAlternativeSuggestions(
          trimmedPrompt,
          parsed.dataWarning,
        );
      }

      const response: ClarifyResponse = {
        ready: false,
        resolvedPrompt: parsed.resolvedPrompt ?? undefined,
        dataWarning: warningText,
        suggestions,
      };

      log("clarify.complete", { source: "ai-clarify", ready: false, suggestions: suggestions.length, latencyMs: Date.now() - t0 });
      return NextResponse.json(response);
    } catch {
      // JSON parse failed — generate alternative suggestions
      let suggestions: string[] = [];
      if (process.env.ANTHROPIC_API_KEY) {
        suggestions = await generateAlternativeSuggestions(trimmedPrompt);
      }
      const response: ClarifyResponse = {
        ready: false,
        dataWarning: "Atlas kunde inte hitta data för din sökning.",
        suggestions,
      };
      return NextResponse.json(response);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("clarify.error", { error: message, latencyMs: Date.now() - t0 });
    reportError(err, { route: "clarify", prompt: capturedPrompt?.slice(0, 100) });
    return NextResponse.json(
      { error: "Clarification failed", detail: message },
      { status: 500 },
    );
  }
}
