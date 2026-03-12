import type { GeoEntity } from "./base";

/** Entity for static/semi-static assets: infrastructure, military bases, power plants. */
export interface AssetEntity extends GeoEntity {
  kind: "asset";
  operator?: string;
  capacity?: string;
  builtYear?: number;
  status?: "active" | "inactive" | "under-construction" | "decommissioned";
  country?: string;
}
