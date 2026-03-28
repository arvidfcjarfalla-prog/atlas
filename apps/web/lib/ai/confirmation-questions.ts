/**
 * Builds mandatory confirmation questions shown after data resolution
 * and before map generation. Lets the user steer map type, value field,
 * and geographic focus before the AI generates a manifest.
 */

import type { DatasetProfile, ClarificationQuestion } from "./types";

// ─── Question builder ────────────────────────────────────────

export function buildConfirmationQuestions(
  profile: DatasetProfile | null,
  _prompt: string,
): ClarificationQuestion[] {
  if (!profile) return [];

  const questions: ClarificationQuestion[] = [];

  // 1. Map type — always shown
  questions.push(buildMapTypeQuestion(profile.geometryType));

  // 2. Value to visualize — if ≥2 numeric attributes
  const numericAttrs = profile.attributes.filter((a) => a.type === "number");
  if (numericAttrs.length >= 2) {
    const options = numericAttrs.slice(0, 4).map((a) => a.name);
    questions.push({
      id: "confirm_metric",
      question: "Vilket värde vill du visualisera?",
      options,
      recommended: options[0],
      aspect: "metric",
    });
  }

  // 3. Basemap style — always shown
  questions.push({
    id: "confirm_basemap",
    question: "Vilken bakgrundsstil vill du ha?",
    options: ["Mörk", "Ljus", "Automatisk"],
    recommended: "Automatisk",
    aspect: "basemap",
  });

  // 4. Geographic focus — if bounds span large area
  const [[south, west], [north, east]] = profile.bounds;
  const latSpan = north - south;
  const lngSpan = east - west;
  if (latSpan > 30 || lngSpan > 60) {
    const focusOptions = buildGeographicFocusOptions(profile.bounds);
    if (focusOptions.length > 1) {
      questions.push({
        id: "confirm_geography",
        question: "Geografiskt fokus?",
        options: focusOptions,
        recommended: focusOptions[0],
        aspect: "geography",
      });
    }
  }

  return questions;
}

function buildMapTypeQuestion(
  geometryType: DatasetProfile["geometryType"],
): ClarificationQuestion {
  let options: string[];

  switch (geometryType) {
    case "Polygon":
    case "MultiPolygon":
      options = ["Koroplet", "Extrudering", "Värmekarta"];
      break;
    case "Point":
    case "MultiPoint":
      options = ["Punktkarta", "Kluster", "Värmekarta"];
      break;
    case "LineString":
    case "MultiLineString":
      options = ["Flödeskarta"];
      break;
    default:
      options = ["Koroplet", "Punktkarta", "Värmekarta"];
      break;
  }

  return {
    id: "confirm_visualization",
    question: "Vilken karttyp vill du använda?",
    options,
    recommended: options[0],
    aspect: "visualization",
  };
}

function buildGeographicFocusOptions(
  bounds: [[number, number], [number, number]],
): string[] {
  const [[south, west], [north, east]] = bounds;
  const options: string[] = ["Hela området"];

  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;

  // Detect broad continental regions from centroid
  if (midLat > 35 && midLat < 72 && midLng > -25 && midLng < 45) {
    options.push("Europa");
  }
  if (midLat > -35 && midLat < 37 && midLng > -20 && midLng < 55) {
    options.push("Afrika");
  }
  if (midLat > 5 && midLat < 55 && midLng > 60 && midLng < 150) {
    options.push("Asien");
  }
  if (midLat > 15 && midLat < 72 && midLng > -170 && midLng < -50) {
    options.push("Nordamerika");
  }
  if (midLat > -56 && midLat < 15 && midLng > -85 && midLng < -30) {
    options.push("Sydamerika");
  }

  return options;
}

// ─── Preference formatting ───────────────────────────────────

const VISUALIZATION_MAP: Record<string, string> = {
  Koroplet: "choropleth",
  Extrudering: "extrusion",
  Värmekarta: "heatmap",
  Punktkarta: "point",
  Kluster: "cluster",
  Flödeskarta: "flow",
};

const BASEMAP_MAP: Record<string, string> = {
  Mörk: "dark",
  Ljus: "paper",
  Automatisk: "auto",
};

/**
 * Maps user-selected Swedish labels back to English values
 * that the AI generation can interpret as hard constraints.
 */
export function formatPreferences(
  answers: Record<string, string>,
  questions: ClarificationQuestion[],
): Record<string, string> {
  const prefs: Record<string, string> = {};

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer) continue;

    switch (q.aspect) {
      case "visualization":
        prefs.mapFamily = VISUALIZATION_MAP[answer] ?? answer;
        break;
      case "metric":
        prefs.colorField = answer;
        break;
      case "geography":
        prefs.region = answer;
        break;
      case "basemap":
        prefs.basemapStyle = BASEMAP_MAP[answer] ?? answer;
        break;
    }
  }

  return prefs;
}
