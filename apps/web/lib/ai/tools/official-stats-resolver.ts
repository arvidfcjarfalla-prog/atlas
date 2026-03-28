/**
 * Official statistics resolver.
 *
 * Given a DatasetIntent (topic, metric, geography, timeframe),
 * matches against the global stats registry and returns ranked
 * candidate sources.
 *
 * Pipeline position: after public APIs, before persistent dataset registry.
 */

import type { DatasetIntent } from "./dataset-registry";
import {
  OFFICIAL_STATS_REGISTRY,
  getSourcesForCountry,
  getInternationalSources,
  sourcesByCoverageTag,
  type OfficialStatsSource,
} from "./global-stats-registry";

// ─── Types ──────────────────────────────────────────────────

export interface ResolvedSource {
  source: OfficialStatsSource;
  score: number;
  matchReasons: string[];
}

// ─── Country detection ──────────────────────────────────────

/**
 * Map of common country/region names → ISO-2 codes.
 * Includes English and Swedish variants.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Nordic
  sweden: "SE", sverige: "SE", swedish: "SE", svenska: "SE", svensk: "SE",
  // Swedish admin terms — unambiguously imply Sweden
  kommun: "SE", kommunerna: "SE", län: "SE",
  norway: "NO", norge: "NO", norwegian: "NO", norska: "NO", norsk: "NO",
  // Norwegian admin terms — unambiguously imply Norway
  kommune: "NO", fylke: "NO", fylker: "NO",
  denmark: "DK", danmark: "DK", danish: "DK", danska: "DK", dansk: "DK",
  finland: "FI", finnish: "FI", finska: "FI", finsk: "FI",
  iceland: "IS", island: "IS", isländska: "IS",
  // Europe
  uk: "GB", "united kingdom": "GB", britain: "GB", british: "GB", england: "GB",
  germany: "DE", deutschland: "DE", german: "DE", tysk: "DE", tyskland: "DE",
  france: "FR", french: "FR", frankrike: "FR",
  spain: "ES", spanish: "ES", spanien: "ES",
  italy: "IT", italian: "IT", italien: "IT",
  netherlands: "NL", holland: "NL", dutch: "NL", nederländerna: "NL",
  belgium: "BE", belgian: "BE", belgien: "BE",
  switzerland: "CH", swiss: "CH", schweiz: "CH",
  austria: "AT", austrian: "AT", österrike: "AT",
  poland: "PL", polish: "PL", polen: "PL",
  portugal: "PT", portuguese: "PT",
  ireland: "IE", irish: "IE", irland: "IE",
  estonia: "EE", estonian: "EE", estland: "EE",
  latvia: "LV", latvian: "LV", lettland: "LV",
  lithuania: "LT", lithuanian: "LT", litauen: "LT",
  slovenia: "SI", slovenian: "SI", slovenien: "SI",
  serbia: "RS", serbian: "RS", serbien: "RS",
  cyprus: "CY", cypriot: "CY", cypern: "CY",
  malta: "MT", maltese: "MT",
  "north macedonia": "MK", macedonia: "MK", makedonien: "MK",
  armenia: "AM", armenian: "AM", armenien: "AM",
  jordan: "JO", jordanian: "JO", jordanien: "JO",
  // Americas
  us: "US", usa: "US", "united states": "US", american: "US", amerika: "US",
  canada: "CA", canadian: "CA", kanada: "CA",
  mexico: "MX", mexican: "MX", mexiko: "MX",
  brazil: "BR", brazilian: "BR", brasilien: "BR",
  argentina: "AR", argentinian: "AR",
  chile: "CL", chilean: "CL",
  colombia: "CO", colombian: "CO",
  peru: "PE", peruvian: "PE",
  // Asia
  japan: "JP", japanese: "JP",
  singapore: "SG", singaporean: "SG",
  india: "IN", indian: "IN", indien: "IN",
  indonesia: "ID", indonesian: "ID", indonesien: "ID",
  china: "CN", chinese: "CN", kina: "CN",
  "south korea": "KR", korea: "KR", korean: "KR",
  israel: "IL", israeli: "IL",
  thailand: "TH", thai: "TH",
  philippines: "PH", philippine: "PH", filipino: "PH", filippinerna: "PH",
  nepal: "NP", nepalese: "NP",
  // Africa
  "south africa": "ZA", sydafrika: "ZA",
  nigeria: "NG", nigerian: "NG",
  ghana: "GH", ghanaian: "GH",
  // Oceania
  australia: "AU", australian: "AU", australien: "AU",
  "new zealand": "NZ", nz: "NZ", nya: "NZ",
};

/**
 * Regional group → list of country codes.
 */
const REGION_TO_COUNTRIES: Record<string, string[]> = {
  europe: ["SE", "NO", "DK", "FI", "IS", "GB", "DE", "FR", "ES", "IT", "NL", "BE", "CH", "AT", "PL", "PT", "IE", "EE", "LV", "LT", "SI", "CY", "MK", "RS", "MT", "AM"],
  nordic: ["SE", "NO", "DK", "FI", "IS"],
  scandinavia: ["SE", "NO", "DK"],
  norden: ["SE", "NO", "DK", "FI", "IS"],
  skandinavien: ["SE", "NO", "DK"],
  "latin america": ["MX", "BR", "AR", "CL", "CO", "PE"],
  "south america": ["BR", "AR", "CL", "CO", "PE"],
  "north america": ["US", "CA", "MX"],
  asia: ["JP", "SG", "IN", "ID", "KR", "IL", "TH", "PH", "NP", "JO"],
  africa: ["ZA", "NG", "GH"],
  oceania: ["AU", "NZ"],
};

/** Test if `word` appears as a whole word in `text` (word boundary match). */
function wordMatch(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Detect country codes from a prompt string.
 * Uses word-boundary matching to avoid false positives
 * (e.g. "housing" should not match "us").
 * Returns array of ISO-2 codes (may be empty for global queries).
 */
export function detectCountries(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const codes = new Set<string>();

  // Check individual country names first (longer names first to match "south korea" before "korea")
  const sortedNames = Object.entries(COUNTRY_NAME_TO_CODE)
    .sort(([a], [b]) => b.length - a.length);

  const matchedCountryNames: string[] = [];
  for (const [name, code] of sortedNames) {
    if (wordMatch(lower, name)) {
      codes.add(code);
      matchedCountryNames.push(name);
    }
  }

  // Check region groups (e.g. "europe", "nordic")
  // Skip if the region word is part of an already-matched country name
  // (e.g. "south africa" should not expand to all of "africa")
  const sortedRegions = Object.entries(REGION_TO_COUNTRIES)
    .sort(([a], [b]) => b.length - a.length);

  for (const [region, countryCodes] of sortedRegions) {
    // Skip if region is a substring of an already-matched country name
    const partOfCountry = matchedCountryNames.some((cn) => cn.includes(region));
    if (partOfCountry) continue;

    if (wordMatch(lower, region)) {
      for (const code of countryCodes) codes.add(code);
    }
  }

  return [...codes];
}

// ─── Topic matching ─────────────────────────────────────────

/**
 * Map of common topic words → coverage tags in the registry.
 */
const TOPIC_TO_TAGS: Record<string, string[]> = {
  // Population & demographics
  population: ["population", "demographics"],
  demographics: ["demographics", "population"],
  fertility: ["demographics", "health"],
  mortality: ["demographics", "health"],
  "life expectancy": ["health", "demographics"],
  birth: ["demographics", "health"],
  death: ["demographics", "health"],
  immigration: ["demographics", "social"],
  migration: ["demographics", "social"],
  // Economy
  gdp: ["economy"],
  "gross domestic product": ["economy"],
  income: ["economy", "labor"],
  inkomst: ["economy", "labor"],
  förvärvsinkomst: ["economy", "labor"],
  medianinkomst: ["economy", "labor"],
  medelinkomst: ["economy", "labor"],
  lön: ["labor", "economy"],
  löner: ["labor", "economy"],
  poverty: ["poverty", "economy", "social"],
  fattigdom: ["poverty", "economy", "social"],
  inflation: ["economy", "prices"],
  prices: ["prices", "economy"],
  wages: ["labor", "economy"],
  salary: ["labor", "economy"],
  // Labor
  unemployment: ["labor", "economy"],
  employment: ["labor", "economy"],
  jobs: ["labor", "economy"],
  labor: ["labor"],
  workforce: ["labor"],
  "labour market": ["labor"],
  arbetsmarknad: ["labor"],
  arbetslöshet: ["labor"],
  // Trade
  trade: ["trade", "economy"],
  exports: ["trade"],
  imports: ["trade"],
  // Housing
  housing: ["housing"],
  rent: ["housing", "prices"],
  "real estate": ["housing"],
  bostäder: ["housing"],
  // Education
  education: ["education"],
  schools: ["education"],
  literacy: ["education"],
  utbildning: ["education"],
  // Health
  health: ["health"],
  disease: ["health", "disease"],
  healthcare: ["health"],
  covid: ["health", "disease"],
  hälsa: ["health"],
  // Environment
  environment: ["environment"],
  climate: ["environment"],
  co2: ["environment"],
  emissions: ["environment"],
  energy: ["energy", "environment"],
  "renewable energy": ["energy", "environment"],
  forest: ["environment"],
  deforestation: ["environment"],
  miljö: ["environment"],
  // Agriculture
  agriculture: ["agriculture"],
  farming: ["agriculture"],
  food: ["food", "agriculture"],
  jordbruk: ["agriculture"],
  // Industry
  industry: ["industry"],
  manufacturing: ["industry"],
  production: ["industry", "economy"],
  industri: ["industry"],
  // Social
  crime: ["crime", "social"],
  social: ["social"],
  gender: ["gender", "social"],
  tourism: ["tourism"],
  transport: ["transport"],
  // Finance
  finance: ["finance", "economy", "financial"],
  debt: ["finance", "economy", "financial"],
  banking: ["banking", "financial", "finance"],
  "balance of payments": ["bop", "finance", "macroeconomy"],
  monetary: ["monetary", "finance", "prices"],
  "exchange rate": ["fx", "monetary", "finance"],
  credit: ["credit", "banking", "financial"],
  // Development
  development: ["development", "sdg"],
  sdg: ["sdg", "development"],
  "sustainable development": ["sdg", "development"],
  // Pets / niche
  dog: ["social", "demographics"],
  hundägare: ["social", "demographics"],
  pet: ["social", "demographics"],
  husdjur: ["social", "demographics"],
  // Nordic languages (Norwegian / Danish)
  befolkning: ["population", "demographics"],
  folkemengde: ["population", "demographics"],
  folketal: ["population", "demographics"],
  innbyggere: ["population", "demographics"],
  innvandring: ["demographics", "social"],
  utvandring: ["demographics", "social"],
  sysselsetting: ["labor", "economy"],
  arbeidsledighet: ["labor", "economy"],
  inntekt: ["economy", "labor"],
  bolig: ["housing"],
  utdanning: ["education"],
  helse: ["health"],
  // Finnish
  väestö: ["population", "demographics"],
  työttömyys: ["labor", "economy"],
  tulot: ["economy", "labor"],
  // Icelandic
  íbúar: ["population", "demographics"],
  mannfjöldi: ["population", "demographics"],
};

/**
 * Extract coverage tags from a prompt.
 * Matches topic words against known tag mappings.
 */
export function extractCoverageTags(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const tags = new Set<string>();

  // Sort by key length descending to match longer phrases first
  const sorted = Object.entries(TOPIC_TO_TAGS)
    .sort(([a], [b]) => b.length - a.length);

  for (const [keyword, mappedTags] of sorted) {
    if (lower.includes(keyword)) {
      for (const tag of mappedTags) tags.add(tag);
    }
  }

  return [...tags];
}

// ─── Scoring ────────────────────────────────────────────────

function scoreSource(
  source: OfficialStatsSource,
  countryCodes: string[],
  coverageTags: string[],
  intent: DatasetIntent,
): ResolvedSource | null {
  let score = 0;
  const reasons: string[] = [];

  // Country match: strong signal
  if (countryCodes.length > 0) {
    if (source.countryCode && countryCodes.includes(source.countryCode)) {
      score += 40;
      reasons.push(`country:${source.countryCode}`);
    } else if (source.countryCode === null) {
      // International source — lower score than country-specific
      score += 15;
      reasons.push("international-fallback");
    } else {
      // Wrong country — skip
      return null;
    }
  } else {
    // No country specified → prefer international sources
    if (source.countryCode === null) {
      score += 30;
      reasons.push("international-for-global");
    } else {
      // Country-specific source for a global query — low relevance
      score += 5;
      reasons.push("country-source-for-global");
    }
  }

  // Coverage tag match
  const tagOverlap = coverageTags.filter((t) =>
    source.coverageTags.includes(t),
  );
  if (tagOverlap.length > 0) {
    score += Math.min(tagOverlap.length * 15, 40);
    reasons.push(`tags:${tagOverlap.join(",")}`);
  } else if (coverageTags.length > 0) {
    // No tag match at all — heavily penalize
    score -= 20;
  }

  // Geography level match for sub-national queries
  if (intent.geography) {
    const geoLower = intent.geography.toLowerCase();
    const wantsSubnational = ["states", "provinces", "counties", "municipalities", "cities"].some(
      (g) => geoLower.includes(g),
    );
    if (wantsSubnational && source.geographyLevels) {
      const hasSubnational = source.geographyLevels.some(
        (l) => l !== "country",
      );
      if (hasSubnational) {
        score += 10;
        reasons.push("has-subnational");
      }
    }
  }

  // API accessibility bonus
  if (source.accessLevel === "official_api") {
    score += 10;
    reasons.push("has-api");
  } else if (source.accessLevel === "official_portal") {
    score += 2;
  }

  // Auth penalty
  if (source.auth === "api_key") {
    score -= 5;
    reasons.push("needs-api-key");
  } else if (source.auth === "oauth") {
    score -= 10;
    reasons.push("needs-oauth");
  }

  // Verification bonus
  if (source.verificationStatus === "verified") {
    score += 5;
    reasons.push("verified");
  } else if (source.verificationStatus === "needs_review") {
    score -= 5;
  }

  // Priority bonus (higher priority = better, 78–100 scale)
  score += Math.round((source.priority - 78) / 4);

  // No-auth JSON format bonus (easier to consume programmatically)
  if (source.auth === "none" && source.formats.includes("json")) {
    score += 5;
    reasons.push("json-no-auth");
  }

  if (score <= 0) return null;

  return { source, score, matchReasons: reasons };
}

// ─── Main resolver ──────────────────────────────────────────

/**
 * Resolve official statistics sources for a given intent.
 *
 * Returns ranked candidates sorted by score (highest first).
 * Only returns sources with score > 0.
 *
 * @param intent - Structured intent from extractIntent()
 * @param prompt - Raw prompt string for additional pattern matching
 * @param maxResults - Maximum number of results to return (default 5)
 */
export function resolveOfficialStatsSources(
  intent: DatasetIntent,
  prompt: string,
  maxResults = 5,
): ResolvedSource[] {
  const countryCodes = detectCountries(prompt);
  const coverageTags = extractCoverageTags(prompt);

  // If no tags found, not much we can match on — return empty
  if (coverageTags.length === 0 && countryCodes.length === 0) {
    return [];
  }

  const candidates: ResolvedSource[] = [];

  for (const source of OFFICIAL_STATS_REGISTRY) {
    const result = scoreSource(source, countryCodes, coverageTags, intent);
    if (result) {
      candidates.push(result);
    }
  }

  // Sort by score descending, then by priority descending (higher = better)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.source.priority - a.source.priority;
  });

  return candidates.slice(0, maxResults);
}

/**
 * Check if we have any viable official sources for the given prompt.
 * Quick check without full scoring — useful for pipeline gating.
 */
export function hasOfficialSources(prompt: string): boolean {
  const countryCodes = detectCountries(prompt);
  const coverageTags = extractCoverageTags(prompt);

  if (coverageTags.length === 0 && countryCodes.length === 0) {
    return false;
  }

  // Check if any source has both country and tag overlap
  for (const source of OFFICIAL_STATS_REGISTRY) {
    const countryMatch =
      countryCodes.length === 0
        ? source.countryCode === null
        : source.countryCode !== null && countryCodes.includes(source.countryCode);

    const tagMatch =
      coverageTags.length === 0 ||
      coverageTags.some((t) => source.coverageTags.includes(t));

    if (countryMatch && tagMatch) return true;
  }

  return false;
}
