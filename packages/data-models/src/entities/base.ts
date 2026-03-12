export type Severity = "low" | "medium" | "high" | "critical";
export type AgeBracket = "fresh" | "recent" | "aging" | "stale";
export type EntityKind = "event" | "asset" | "route" | "zone" | "project";

/** Base type for all geo-referenced entities across all maps. */
export interface GeoEntity {
  id: string;
  kind: EntityKind;
  title: string;
  description?: string;
  coordinates: [number, number]; // [lat, lng]
  category: string;
  severity?: Severity;
  sourceCount?: number;
  occurredAt?: string;
  updatedAt?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
}
