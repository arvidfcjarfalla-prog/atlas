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
