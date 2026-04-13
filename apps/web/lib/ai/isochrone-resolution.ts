export type IsochroneMode = "driving" | "walking" | "cycling" | "transit";
export type IsochroneUnit = "minutes" | "kilometers";

export interface IsochroneOrigin {
  lat: number;
  lng: number;
  label?: string;
}

export interface ParsedIsochronePrompt {
  locationQuery: string;
  mode: IsochroneMode;
  breaks: number[];
  unit: IsochroneUnit;
}

const EXPLICIT_ISOCHRONE_PROMPT =
  /\b(isochrone|isochrones|reachability|reachable|service area|service areas|travel[- ]time (?:zone|zones|area|areas)|drive[- ]time (?:zone|zones|area|areas)|walk[- ]time (?:zone|zones|area|areas)|bike[- ]time (?:zone|zones|area|areas)|cycling[- ]time (?:zone|zones|area|areas)|restidszon(?:er)?|restidsområde(?:n)?|räckvidd)\b/i;

const REACHABILITY_QUESTION_PROMPT =
  /\b(how far can (?:you|i|we) (?:get|go|reach)|how far is reachable|hur långt når man|hur långt kan man nå|vad kan man nå från|vad når man från)\b/i;

const DURATION_MODE_PROMPT =
  /\b(?:\d{1,3}\s*(?:minute|minutes|minuter|min)\s+(?:drive|driving|walk|walking|cycle|cycling)|(?:drive|driving|walk|walking|cycle|cycling)\s+\d{1,3}\s*(?:minute|minutes|minuter|min))\b/i;

const REACHABLE_AREA_PROMPT =
  /\b(?:areas?\s+reachable|reachable\s+(?:areas?|within|in)|reachability\s+(?:area|areas|zone|zones)?)\b/i;

const POI_REACHABILITY_PROMPT =
  /\b(restaurants?|cafes?|parks?|hospitals?|schools?|hotels?|shops?|stores?|museums?|pharmacies?|gyms?|cinemas?|theaters?|libraries?|charging stations?|chargers?)\b/i;

const LOCATION_PATTERNS = [
  /\bfrom\s+(.+?)(?=(?:\s+(?:in|within|using|by|with|for)\b)|[?.!,]|$)/i,
  /\bfrån\s+(.+?)(?=(?:\s+på\s+\d|\s+med\b)|[?.!,]|$)/i,
];

const KNOWN_ISOCHRONE_ORIGINS: Record<string, IsochroneOrigin> = {
  "gothenburg airport": {
    lat: 57.6628,
    lng: 12.2798,
    label: "Gothenburg Landvetter Airport (GOT), Sweden",
  },
  "gothenburg landvetter airport": {
    lat: 57.6628,
    lng: 12.2798,
    label: "Gothenburg Landvetter Airport (GOT), Sweden",
  },
  "landvetter airport": {
    lat: 57.6628,
    lng: 12.2798,
    label: "Gothenburg Landvetter Airport (GOT), Sweden",
  },
  "malmö centralstation": {
    lat: 55.609,
    lng: 13.0008,
    label: "Malmö Centralstation, Sweden",
  },
  "malmo central station": {
    lat: 55.609,
    lng: 13.0008,
    label: "Malmö Centralstation, Sweden",
  },
  "malmö central station": {
    lat: 55.609,
    lng: 13.0008,
    label: "Malmö Centralstation, Sweden",
  },
  "stockholm arlanda airport": {
    lat: 59.6498,
    lng: 17.9238,
    label: "Stockholm Arlanda Airport (ARN), Sweden",
  },
  "arlanda airport": {
    lat: 59.6498,
    lng: 17.9238,
    label: "Stockholm Arlanda Airport (ARN), Sweden",
  },
};

export function looksLikeIsochronePrompt(prompt: string): boolean {
  const locationQuery = extractLocationQuery(prompt);
  const hasReachabilityIntent =
    EXPLICIT_ISOCHRONE_PROMPT.test(prompt) ||
    REACHABILITY_QUESTION_PROMPT.test(prompt) ||
    DURATION_MODE_PROMPT.test(prompt) ||
    REACHABLE_AREA_PROMPT.test(prompt);

  if (!hasReachabilityIntent) return false;

  const scrubbedPrompt = locationQuery
    ? prompt.replace(new RegExp(escapeRegExp(locationQuery), "ig"), " ")
    : prompt;

  return !POI_REACHABILITY_PROMPT.test(scrubbedPrompt);
}

export function parseIsochronePrompt(prompt: string): ParsedIsochronePrompt | null {
  if (!looksLikeIsochronePrompt(prompt)) return null;

  const locationQuery = extractLocationQuery(prompt);
  if (!locationQuery) return null;

  const unit = extractUnit(prompt);
  const breaks = extractBreaks(prompt, locationQuery, unit);
  if (breaks.length === 0) return null;

  return {
    locationQuery,
    mode: extractMode(prompt),
    breaks,
    unit,
  };
}

export function resolveKnownIsochroneOrigin(query: string): IsochroneOrigin | null {
  const lower = normalizeSpace(query.toLowerCase());
  const sorted = Object.entries(KNOWN_ISOCHRONE_ORIGINS).sort((a, b) => b[0].length - a[0].length);

  for (const [name, origin] of sorted) {
    if (lower === name || lower.includes(name) || name.includes(lower)) {
      return origin;
    }
  }

  return null;
}

export function buildIsochroneDataUrl(
  request: ParsedIsochronePrompt & { origin: IsochroneOrigin },
): string {
  const params = new URLSearchParams({
    origin: `${request.origin.lat},${request.origin.lng}`,
    mode: request.mode,
    breaks: request.breaks.join(","),
  });

  if (request.unit === "kilometers") {
    params.set("unit", request.unit);
  }

  return `/api/isochrone?${params.toString()}`;
}

export function applyResolvedOriginLabel(
  prompt: string,
  locationQuery: string,
  label?: string,
): string {
  if (!label) return prompt;

  const pattern = new RegExp(escapeRegExp(locationQuery), "i");
  return pattern.test(prompt) ? prompt.replace(pattern, label) : prompt;
}

function extractLocationQuery(prompt: string): string | null {
  for (const pattern of LOCATION_PATTERNS) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      return normalizeLocation(match[1]);
    }
  }

  const lower = prompt.toLowerCase();
  const known = Object.keys(KNOWN_ISOCHRONE_ORIGINS)
    .sort((a, b) => b.length - a.length)
    .find((name) => lower.includes(name));

  return known ?? null;
}

function extractMode(prompt: string): IsochroneMode {
  const lower = prompt.toLowerCase();

  if (/\b(walk|walking|foot|till fots|gå|gång)\b/i.test(lower)) return "walking";
  if (/\b(cycle|cycling|bike|bicycle|cykel|cycling)\b/i.test(lower)) return "cycling";
  if (/\b(transit|public transport|bus|train|subway|metro|kollektivtrafik)\b/i.test(lower)) {
    return "transit";
  }

  return "driving";
}

function extractUnit(prompt: string): IsochroneUnit {
  return /\b(km|kilometers?|kilometres?)\b/i.test(prompt) ? "kilometers" : "minutes";
}

function extractBreaks(
  prompt: string,
  locationQuery: string,
  unit: IsochroneUnit,
): number[] {
  const scrubbedPrompt = prompt.replace(new RegExp(escapeRegExp(locationQuery), "ig"), " ");
  const listPattern = unit === "kilometers"
    ? /((?:\d{1,3}\s*(?:,|\band\b|\boch\b)?\s*)+)\s*(?:km|kilometers?|kilometres?)\b/gi
    : /((?:\d{1,3}\s*(?:,|\band\b|\boch\b)?\s*)+)\s*(?:minute|minutes|minuter|min)\b/gi;

  const numbers = [...scrubbedPrompt.matchAll(listPattern)]
    .flatMap((match) => match[1]?.match(/\b\d{1,3}\b/g) ?? [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 120);

  return [...new Set(numbers)].sort((a, b) => a - b);
}

function normalizeLocation(value: string): string {
  return normalizeSpace(value.replace(/[?.!,]+$/g, ""));
}

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
