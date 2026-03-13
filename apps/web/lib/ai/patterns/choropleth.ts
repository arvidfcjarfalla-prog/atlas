import type { MapPattern } from "../types";

export const choropleth: MapPattern = {
  id: "choropleth",
  family: "choropleth",
  name: "Choropleth Map",
  description:
    "Polygons filled with color representing a statistical value. Best for rates, percentages, and normalized regional comparisons.",
  validGeometry: ["polygon", "multi-polygon"],
  validTasks: [
    "compare-regions",
    "show-distribution",
    "rank-areas",
    "policy-analysis",
  ],
  antiPatterns: [
    "Never use choropleth for raw counts — normalize first (per-capita, per-area)",
    "Choropleth on point data is invalid — use proportional symbols instead",
    "More than 7 classes cannot be visually distinguished",
    "Equal-interval classification on skewed data hides variation",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "zone",
        label: "",
        sourceType: "geojson-url",
        geometryType: "polygon",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          classification: { method: "quantile", classes: 5 },
          color: { scheme: "blues", colorblindSafe: true },
          fillOpacity: 0.85,
          strokeColor: "rgba(255,255,255,0.3)",
          strokeWidth: 1,
        },
        legend: { title: "", type: "gradient" },
        interaction: {
          clickBehavior: "detail-panel",
          hoverEffect: "highlight",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "choropleth-needs-polygon",
      severity: "error",
      message: "Choropleth requires polygon or multi-polygon geometry",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "choropleth" ||
            !l.geometryType ||
            l.geometryType === "polygon" ||
            l.geometryType === "multi-polygon",
        ),
    },
    {
      id: "choropleth-normalize",
      severity: "warning",
      message: "Choropleth without normalization may be misleading for raw counts",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "choropleth" ||
            l.style.normalization !== undefined,
        ),
    },
    {
      id: "choropleth-max-classes",
      severity: "error",
      message: "Classification must use 2–7 classes",
      check: (m) =>
        m.layers.every((l) => {
          const c = l.style?.classification?.classes;
          return c === undefined || (c >= 2 && c <= 7);
        }),
    },
  ],
};
