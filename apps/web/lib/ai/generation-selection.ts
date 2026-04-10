import { EXAMPLES, selectExamples, type FewShotExample } from "./example-bank";
import { classifyGenSkill, type GenSkill } from "./skills/router";
import type { AttributeProfile, DatasetProfile } from "./types";

export interface GenerationSelectionContext {
  genSkill: GenSkill;
  selectedExamples: FewShotExample[];
  selectedExampleIds: string[];
  primaryAnchorId: string | null;
}

const ISOCHRONE_PROMPT = /\b(isochrone|reachability|travel time|service area|how far|minutes?\s+(?:drive|driving|walk|walking|cycle|cycling)|(?:drive|driving|walk|walking|cycle|cycling)\s+\d+\s*minutes?)\b/i;
const BUFFER_PROMPT = /\b(buffer|bufferzon|within\s+\d+\s*(?:km|kilometers?|meter|meters?|miles?)|coverage zone|radius)\b/i;
const DENSITY_PROMPT =
  /\b(density|heatmap|hotspot|hotspots|concentration|densit|where .* most|var sker flest)\b/i;
const HEXBIN_PROMPT = /\b(hex|hexbin|hexagon)\b/i;
const LIVE_EVENT_PROMPT =
  /\b(earthquake|jordbävning|wildfire|fire|storm|incident|event|events|flight|flights|iss|magnitude|recent|latest|today|last (?:day|week|24 hours|7 days))\b/i;
const QUANTITATIVE_PROMPT =
  /\b(population|gdp|income|revenue|sales|value|count|per\s*capita|proportional|larger circle|circle size|sized by|size by|ranked)\b/i;
const PLACE_PROMPT =
  /\b(restaurant|cafe|park|hospital|school|hotel|shop|store|museum|airport|station|metro|subway|pharmacy|gym|cinema|theater|library|capital|charging station|charger|poi|place|location)\b/i;

const LIVE_EVENT_FIELDS = [
  "mag",
  "magnitude",
  "depth",
  "severity",
  "alert",
  "time",
  "timestamp",
  "updated",
  "updated_at",
  "occurred_at",
];

const PLACE_FIELDS = [
  "name",
  "category",
  "cuisine",
  "rating",
  "address",
  "operator",
  "brand",
  "amenity",
  "place",
  "city",
];

const QUANT_FIELDS = [
  "population",
  "pop",
  "pop_max",
  "gdp",
  "income",
  "revenue",
  "sales",
  "value",
  "count",
];

function hasAttribute(
  attributes: AttributeProfile[] | undefined,
  candidates: readonly string[],
): boolean {
  if (!attributes?.length) return false;
  return attributes.some((attribute) => {
    const name = attribute.name.toLowerCase();
    return candidates.some((candidate) => name === candidate || name.includes(candidate));
  });
}

function isPointLike(profile?: DatasetProfile | null): boolean {
  return (
    profile?.geometryType === "Point" ||
    profile?.geometryType === "MultiPoint" ||
    profile?.geometryType === "Mixed"
  );
}

function inferPreferredExampleIds(
  prompt: string,
  profile: DatasetProfile | null | undefined,
  genSkill: GenSkill,
): string[] {
  const lower = prompt.toLowerCase();
  const attributes = profile?.attributes ?? [];
  const pointLike = isPointLike(profile);
  const quantitativePointContext =
    pointLike ||
    PLACE_PROMPT.test(lower) ||
    /\b(circle|circles|symbol|symbols|marker|markers|city|cities|capital|capitals|point|points)\b/i.test(
      lower,
    );

  if (ISOCHRONE_PROMPT.test(lower)) {
    return ["isochrone-cycling", "school-buffer-zones", "restaurants"];
  }

  if (BUFFER_PROMPT.test(lower)) {
    return ["school-buffer-zones", "restaurants", "population"];
  }

  if (HEXBIN_PROMPT.test(lower)) {
    return ["taxi-hexbin", "burglaries", "population"];
  }

  if (DENSITY_PROMPT.test(lower)) {
    return ["burglaries", "taxi-hexbin", "population"];
  }

  if (LIVE_EVENT_PROMPT.test(lower) || hasAttribute(attributes, LIVE_EVENT_FIELDS)) {
    return [profile ? "earthquakes-daily" : "earthquakes-weekly", "population", "restaurants"];
  }

  if (
    QUANTITATIVE_PROMPT.test(lower) &&
    (quantitativePointContext || genSkill === "thematic")
  ) {
    return ["population", "housing-prices", "tax-rates"];
  }

  if (PLACE_PROMPT.test(lower) || hasAttribute(attributes, PLACE_FIELDS)) {
    return ["restaurants", "population", "burglaries"];
  }

  if (pointLike) {
    if (hasAttribute(attributes, QUANT_FIELDS)) {
      return ["population", "restaurants", "burglaries"];
    }
    return ["restaurants", "population", "burglaries"];
  }

  return [];
}

function reorderExamples(
  baseExamples: FewShotExample[],
  preferredIds: string[],
): FewShotExample[] {
  if (preferredIds.length === 0) return baseExamples;

  const ordered: FewShotExample[] = [];
  const pushUnique = (example: FewShotExample | undefined) => {
    if (!example || ordered.some((candidate) => candidate.id === example.id)) return;
    ordered.push(example);
  };

  for (const preferredId of preferredIds) {
    pushUnique(EXAMPLES.find((example) => example.id === preferredId));
  }

  for (const example of baseExamples) {
    pushUnique(example);
  }

  return ordered.slice(0, baseExamples.length);
}

/**
 * Computes the exact selection context used by AI map generation.
 * This is shared between route logging and tests so observability and
 * assertions stay tied to the same logic.
 */
export function getGenerationSelectionContext(
  prompt: string,
  profile?: DatasetProfile | null,
  skillOverride?: GenSkill,
): GenerationSelectionContext {
  const genSkill = skillOverride ?? classifyGenSkill(prompt, profile);
  const baseExamples = selectExamples(profile ?? undefined, undefined, genSkill);
  const selectedExamples = reorderExamples(
    baseExamples,
    inferPreferredExampleIds(prompt, profile, genSkill),
  );
  const selectedExampleIds = selectedExamples.map((example) => example.id);

  return {
    genSkill,
    selectedExamples,
    selectedExampleIds,
    primaryAnchorId: selectedExampleIds[0] ?? null,
  };
}
