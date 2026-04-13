import { EXAMPLES, selectExamples, type FewShotExample } from "./example-bank";
import { looksLikeIsochronePrompt } from "./isochrone-resolution";
import { classifyGenSkill, type GenSkill } from "./skills/router";
import type { AttributeProfile, DatasetProfile } from "./types";

export interface GenerationSelectionContext {
  genSkill: GenSkill;
  selectedExamples: FewShotExample[];
  selectedExampleIds: string[];
  primaryAnchorId: string | null;
}

const BUFFER_PROMPT = /\b(buffer|bufferzon|within\s+\d+\s*(?:km|kilometers?|meter|meters?|miles?)|coverage zone|radius)\b/i;
const DENSITY_PROMPT =
  /\b(density|heatmap|hotspot|hotspots|concentration|densit|where .* most|var sker flest)\b/i;
const HEXBIN_PROMPT = /\b(hex|hexbin|hexagon)\b/i;
const LIVE_EVENT_PROMPT =
  /\b(earthquake|jordbävning|wildfire|fire|storm|incident|event|events|flight|flights|iss|magnitude|recent|latest|today|last (?:day|week|24 hours|7 days))\b/i;
const QUANTITATIVE_PROMPT =
  /\b(population|gdp|income|revenue|sales|value|count|per\s*capita|proportional|larger circle|circle size|sized by|size by|ranked)\b/i;
const PLACE_PROMPT =
  /\b(restaurants?|cafes?|parks?|hospitals?|schools?|hotels?|shops?|stores?|museums?|airports?|stations?|metros?|subways?|pharmacies?|gyms?|cinemas?|theaters?|libraries?|capitals?|charging stations?|chargers?|poi|places?|locations?)\b/i;

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

const PROFILE_PLACE_ANCHOR = "heritage-sites-profile";
const PROFILE_QUANT_ANCHOR = "world-cities-profile";
const PROFILE_EVENT_ANCHOR = "earthquakes-daily";
const PROFILE_DENSITY_ANCHOR = "taxi-hexbin";
const PROFILE_TRANSFORM_ANCHOR = "school-buffer-zones";

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

function geometryGroup(
  geometryType: DatasetProfile["geometryType"],
): "point" | "polygon" | "line" {
  switch (geometryType) {
    case "Point":
    case "MultiPoint":
    case "Mixed":
      return "point";
    case "Polygon":
    case "MultiPolygon":
      return "polygon";
    case "LineString":
    case "MultiLineString":
      return "line";
  }
}

function exampleMatchesProfileGeometry(
  example: FewShotExample,
  profile: DatasetProfile,
): boolean {
  const profileGroup = geometryGroup(profile.geometryType);
  return example.geometryTypes.some((geometryType) => geometryGroup(geometryType) === profileGroup);
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

  if (profile && looksLikeIsochronePrompt(prompt)) {
    return [PROFILE_TRANSFORM_ANCHOR, PROFILE_PLACE_ANCHOR, PROFILE_QUANT_ANCHOR];
  }

  if (looksLikeIsochronePrompt(prompt)) {
    return ["isochrone-cycling", "school-buffer-zones", "restaurants"];
  }

  if (profile && BUFFER_PROMPT.test(lower)) {
    return [PROFILE_TRANSFORM_ANCHOR, PROFILE_PLACE_ANCHOR, PROFILE_QUANT_ANCHOR];
  }

  if (BUFFER_PROMPT.test(lower)) {
    return ["school-buffer-zones", "restaurants", "population"];
  }

  if (profile && HEXBIN_PROMPT.test(lower)) {
    return [PROFILE_DENSITY_ANCHOR, PROFILE_QUANT_ANCHOR, PROFILE_EVENT_ANCHOR];
  }

  if (HEXBIN_PROMPT.test(lower)) {
    return ["taxi-hexbin", "burglaries", "population"];
  }

  if (profile && DENSITY_PROMPT.test(lower)) {
    return [PROFILE_DENSITY_ANCHOR, PROFILE_QUANT_ANCHOR, PROFILE_EVENT_ANCHOR];
  }

  if (DENSITY_PROMPT.test(lower)) {
    return ["burglaries", "taxi-hexbin", "population"];
  }

  if (LIVE_EVENT_PROMPT.test(lower) || hasAttribute(attributes, LIVE_EVENT_FIELDS)) {
    if (profile) {
      return [PROFILE_EVENT_ANCHOR, PROFILE_QUANT_ANCHOR, PROFILE_PLACE_ANCHOR];
    }
    return ["earthquakes-weekly", "population", "restaurants"];
  }

  if (
    QUANTITATIVE_PROMPT.test(lower) &&
    (quantitativePointContext || genSkill === "thematic")
  ) {
    if (profile) {
      return [PROFILE_QUANT_ANCHOR, PROFILE_PLACE_ANCHOR, PROFILE_EVENT_ANCHOR];
    }
    return ["population", "housing-prices", "tax-rates"];
  }

  if (PLACE_PROMPT.test(lower) || hasAttribute(attributes, PLACE_FIELDS)) {
    if (profile) {
      return [PROFILE_PLACE_ANCHOR, PROFILE_QUANT_ANCHOR, PROFILE_EVENT_ANCHOR];
    }
    return ["restaurants", "population", "burglaries"];
  }

  if (pointLike) {
    if (hasAttribute(attributes, QUANT_FIELDS)) {
      if (profile) {
        return [PROFILE_QUANT_ANCHOR, PROFILE_PLACE_ANCHOR, PROFILE_EVENT_ANCHOR];
      }
      return ["population", "restaurants", "burglaries"];
    }
    if (profile) {
      return [PROFILE_PLACE_ANCHOR, PROFILE_QUANT_ANCHOR, PROFILE_EVENT_ANCHOR];
    }
    return ["restaurants", "population", "burglaries"];
  }

  return [];
}

function constrainPreferredIdsForProfile(
  preferredIds: string[],
  profile: DatasetProfile | null | undefined,
): string[] {
  if (!profile) return preferredIds;

  return preferredIds.filter((preferredId) => {
    const example = EXAMPLES.find((candidate) => candidate.id === preferredId);
    return Boolean(example?.hasProfile && exampleMatchesProfileGeometry(example, profile));
  });
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
    constrainPreferredIdsForProfile(
      inferPreferredExampleIds(prompt, profile, genSkill),
      profile,
    ),
  );
  const selectedExampleIds = selectedExamples.map((example) => example.id);

  return {
    genSkill,
    selectedExamples,
    selectedExampleIds,
    primaryAnchorId: selectedExampleIds[0] ?? null,
  };
}
