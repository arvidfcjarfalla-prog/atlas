import type { MapFamily } from "@atlas/data-models";
import type { MapPattern } from "../types";
import { clusteredPoints } from "./clustered-points";
import { choropleth } from "./choropleth";
import { heatmap } from "./heatmap";
import { proportionalSymbol } from "./proportional-symbol";
import { simplePoint } from "./simple-point";
import { flow } from "./flow";
import { isochrone } from "./isochrone";

export const PATTERNS: MapPattern[] = [
  clusteredPoints,
  choropleth,
  heatmap,
  proportionalSymbol,
  simplePoint,
  flow,
  isochrone,
];

/** Find a pattern by map family. Returns undefined if no match. */
export function findPattern(family: MapFamily): MapPattern | undefined {
  return PATTERNS.find((p) => p.family === family);
}

export {
  clusteredPoints,
  choropleth,
  heatmap,
  proportionalSymbol,
  simplePoint,
  flow,
  isochrone,
};
