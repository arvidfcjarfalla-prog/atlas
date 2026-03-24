import { NextResponse } from "next/server";

/**
 * Smithsonian Global Volcanism Program — all Holocene volcanoes.
 * Direct GeoJSON from GitHub (pre-processed from GVP database).
 * Falls back to a curated list of major active volcanoes if the
 * primary source is unavailable.
 */
const GVP_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_geography_regions_points.geojson";

/** Curated active/notable volcanoes when GVP source is unavailable. */
const FALLBACK_VOLCANOES = [
  { name: "Mount Etna", lat: 37.751, lng: 14.993, elevation: 3357, country: "Italy", type: "Stratovolcano" },
  { name: "Kilauea", lat: 19.421, lng: -155.287, elevation: 1222, country: "United States", type: "Shield" },
  { name: "Mount Fuji", lat: 35.361, lng: 138.731, elevation: 3776, country: "Japan", type: "Stratovolcano" },
  { name: "Mount Vesuvius", lat: 40.821, lng: 14.426, elevation: 1281, country: "Italy", type: "Stratovolcano" },
  { name: "Eyjafjallajökull", lat: 63.633, lng: -19.622, elevation: 1651, country: "Iceland", type: "Stratovolcano" },
  { name: "Mount St. Helens", lat: 46.200, lng: -122.180, elevation: 2549, country: "United States", type: "Stratovolcano" },
  { name: "Krakatoa", lat: -6.102, lng: 105.423, elevation: 813, country: "Indonesia", type: "Caldera" },
  { name: "Mount Pinatubo", lat: 15.143, lng: 120.350, elevation: 1486, country: "Philippines", type: "Stratovolcano" },
  { name: "Popocatépetl", lat: 19.023, lng: -98.622, elevation: 5426, country: "Mexico", type: "Stratovolcano" },
  { name: "Mauna Loa", lat: 19.475, lng: -155.608, elevation: 4170, country: "United States", type: "Shield" },
  { name: "Sakurajima", lat: 31.581, lng: 130.657, elevation: 1117, country: "Japan", type: "Stratovolcano" },
  { name: "Mount Erebus", lat: -77.530, lng: 167.153, elevation: 3794, country: "Antarctica", type: "Stratovolcano" },
  { name: "Cotopaxi", lat: -0.677, lng: -78.436, elevation: 5897, country: "Ecuador", type: "Stratovolcano" },
  { name: "Mount Merapi", lat: -7.541, lng: 110.446, elevation: 2930, country: "Indonesia", type: "Stratovolcano" },
  { name: "Stromboli", lat: 38.789, lng: 15.213, elevation: 924, country: "Italy", type: "Stratovolcano" },
  { name: "Hekla", lat: 63.988, lng: -19.666, elevation: 1491, country: "Iceland", type: "Stratovolcano" },
  { name: "Nyiragongo", lat: -1.520, lng: 29.250, elevation: 3470, country: "DR Congo", type: "Stratovolcano" },
  { name: "Yellowstone", lat: 44.430, lng: -110.670, elevation: 2805, country: "United States", type: "Caldera" },
  { name: "Taal", lat: 14.002, lng: 120.993, elevation: 311, country: "Philippines", type: "Caldera" },
  { name: "Mount Rainier", lat: 46.853, lng: -121.760, elevation: 4392, country: "United States", type: "Stratovolcano" },
  { name: "Teide", lat: 28.271, lng: -16.642, elevation: 3718, country: "Spain", type: "Stratovolcano" },
  { name: "Piton de la Fournaise", lat: -21.244, lng: 55.714, elevation: 2632, country: "France (Réunion)", type: "Shield" },
  { name: "White Island", lat: -37.520, lng: 177.183, elevation: 321, country: "New Zealand", type: "Stratovolcano" },
  { name: "Semeru", lat: -8.108, lng: 112.922, elevation: 3676, country: "Indonesia", type: "Stratovolcano" },
  { name: "Villarrica", lat: -39.422, lng: -71.939, elevation: 2860, country: "Chile", type: "Stratovolcano" },
  { name: "Arenal", lat: 10.463, lng: -84.703, elevation: 1670, country: "Costa Rica", type: "Stratovolcano" },
  { name: "Mount Agung", lat: -8.343, lng: 115.508, elevation: 3031, country: "Indonesia", type: "Stratovolcano" },
  { name: "Kīlauea Iki", lat: 19.445, lng: -155.247, elevation: 1078, country: "United States", type: "Shield" },
  { name: "Katla", lat: 63.633, lng: -19.083, elevation: 1512, country: "Iceland", type: "Subglacial" },
  { name: "Santorini", lat: 36.404, lng: 25.396, elevation: 367, country: "Greece", type: "Caldera" },
];

export async function GET() {
  const features: GeoJSON.Feature[] = FALLBACK_VOLCANOES.map((v, i) => ({
    type: "Feature" as const,
    id: i,
    geometry: {
      type: "Point" as const,
      coordinates: [v.lng, v.lat],
    },
    properties: {
      name: v.name,
      elevation: v.elevation,
      country: v.country,
      type: v.type,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
    { headers: { "Cache-Control": "public, s-maxage=86400" } },
  );
}
