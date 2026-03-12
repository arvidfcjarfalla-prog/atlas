import type { AgeBracket } from "./entities/base";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/** Classify how old an entity is for visual fading. */
export function getAgeBracket(updatedAt: string): AgeBracket {
  const age = Date.now() - new Date(updatedAt).getTime();
  if (age < TWO_HOURS) return "fresh";
  if (age < EIGHT_HOURS) return "recent";
  if (age < TWENTY_FOUR_HOURS) return "aging";
  return "stale";
}

/**
 * Deterministic coordinate jitter so entities in the same location
 * spread out visually. Uses djb2 hash of ID for stable offset.
 * Max radius ~3-6km depending on confidence.
 */
export function jitterCoordinates(
  id: string,
  coords: [number, number],
  geoConfidence = 0.75,
): [number, number] {
  if (geoConfidence <= 0.25) return coords;

  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i);
    h = h >>> 0;
  }

  const jitterScale = geoConfidence >= 0.85 ? 0.04 : 0.06;
  const latOff = ((h & 0xffff) / 0xffff - 0.5) * jitterScale * 2;
  const lngOff = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * jitterScale * 2;

  return [coords[0] + latOff, coords[1] + lngOff];
}
