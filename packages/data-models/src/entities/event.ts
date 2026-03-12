import type { GeoEntity, AgeBracket } from "./base";

/** Entity for time-based events: earthquakes, explosions, incidents, news. */
export interface EventEntity extends GeoEntity {
  kind: "event";
  isBreaking?: boolean;
  ageBracket: AgeBracket;
  confidence?: number;
  source?: string;
  sourceUrl?: string;
}
