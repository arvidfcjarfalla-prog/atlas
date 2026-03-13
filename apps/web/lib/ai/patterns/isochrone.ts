import type { MapPattern } from "../types";

export const isochrone: MapPattern = {
  id: "isochrone-map",
  family: "isochrone",
  name: "Isochrone Map",
  description:
    "Concentric polygons showing areas reachable within time or distance thresholds. For accessibility analysis, service area coverage, and travel time comparison.",
  validGeometry: ["polygon", "multi-polygon"],
  validTasks: [
    "show-accessibility",
    "compare-coverage",
    "analyze-service-area",
    "measure-reach",
  ],
  antiPatterns: [
    "Using more than 6 breakpoints makes zones hard to distinguish",
    "Isochrone polygons must be pre-computed by a routing engine — the manifest describes them, not generates them",
    "Very large breakpoints (> 120 min) produce noisy polygons that overlap other regions",
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
          mapFamily: "isochrone",
          color: { scheme: "blues", colorblindSafe: true },
          fillOpacity: 0.5,
          strokeColor: "rgba(255,255,255,0.5)",
          strokeWidth: 1,
        },
        isochrone: {
          mode: "driving",
          breakpoints: [5, 10, 15, 30],
          unit: "minutes",
        },
        interaction: {
          clickBehavior: "popup",
          hoverEffect: "highlight",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "isochrone-requires-polygon",
      severity: "error",
      message: "Isochrone map requires polygon geometry",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "isochrone" ||
            !l.geometryType ||
            l.geometryType === "polygon" ||
            l.geometryType === "multi-polygon",
        ),
    },
    {
      id: "isochrone-breakpoint-count",
      severity: "warning",
      message: "More than 6 isochrone breakpoints may be hard to distinguish",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "isochrone" ||
            !l.isochrone?.breakpoints ||
            l.isochrone.breakpoints.length <= 6,
        ),
    },
  ],
};
