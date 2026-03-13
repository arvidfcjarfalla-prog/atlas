import type { MapPattern } from "../types";

export const proportionalSymbol: MapPattern = {
  id: "proportional-symbol",
  family: "proportional-symbol",
  name: "Proportional Symbol Map",
  description:
    "Circles sized by a numeric value at each location. Best for showing magnitude differences across geography.",
  validGeometry: ["point"],
  validTasks: [
    "compare-magnitudes",
    "show-values-at-locations",
    "rank-places",
    "city-statistics",
  ],
  antiPatterns: [
    "sizeField must be numeric — categorical data should use color, not size",
    "Very large size ranges cause overlap — consider max-radius capping",
    "Proportional symbols on polygon data should use centroid placement",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "asset",
        label: "",
        sourceType: "geojson-url",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "proportional-symbol",
          color: { scheme: "blues", colorblindSafe: true },
          fillOpacity: 0.7,
          strokeColor: "rgba(255,255,255,0.5)",
          strokeWidth: 1,
        },
        legend: { title: "", type: "proportional", exampleValues: [10, 50, 100] },
        interaction: {
          clickBehavior: "detail-panel",
          hoverEffect: "enlarge",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "proportional-needs-size-field",
      severity: "error",
      message: "Proportional symbol requires sizeField",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "proportional-symbol" ||
            !!l.style.sizeField,
        ),
    },
  ],
};
