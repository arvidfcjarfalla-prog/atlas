import type { MapPattern } from "../types";

export const flow: MapPattern = {
  id: "flow-map",
  family: "flow",
  name: "Flow Map",
  description:
    "Lines connecting origins to destinations, with width proportional to volume. For migration, commuting, trade, and transport.",
  validGeometry: ["line"],
  validTasks: [
    "show-movement",
    "compare-flows",
    "trace-routes",
    "visualize-connections",
  ],
  antiPatterns: [
    "Using flow for unrelated points — lines imply a relationship between origin and destination",
    "Too many flows (> 200) without filtering creates visual spaghetti",
    "Missing weightField produces uniform-width lines with no information hierarchy",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "route",
        label: "",
        sourceType: "geojson-url",
        geometryType: "line",
        style: {
          markerShape: "circle",
          mapFamily: "flow",
          color: { scheme: "blues", colorblindSafe: true },
          fillOpacity: 0.7,
          strokeWidth: 1,
        },
        flow: {
          originField: "",
          destinationField: "",
          minWidth: 1,
          maxWidth: 8,
        },
        interaction: {
          clickBehavior: "detail-panel",
          hoverEffect: "highlight",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "flow-requires-line",
      severity: "error",
      message: "Flow map requires line geometry",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "flow" ||
            !l.geometryType ||
            l.geometryType === "line",
        ),
    },
    {
      id: "flow-missing-weight",
      severity: "warning",
      message: "Flow without weightField — all lines will have equal width",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "flow" || !!l.flow?.weightField,
        ),
    },
  ],
};
