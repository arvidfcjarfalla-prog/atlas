import type { MapManifest, MapFamily } from "@atlas/data-models";

export interface MapTemplate {
  id: string;
  title: string;
  description: string;
  family: MapFamily;
  manifest: MapManifest;
}

export const TEMPLATES: MapTemplate[] = [
  {
    id: "earthquakes-live",
    title: "Jordskalv — senaste dygnet",
    description: "Realtidsdata från USGS, uppdateras var 5:e minut",
    family: "point",
    manifest: {
      id: "earthquakes-live",
      title: "Jordskalv — senaste dygnet",
      description: "Realtidsdata från USGS (M2.5+)",
      theme: "editorial",
      version: 2,
      defaultCenter: [20, 0],
      defaultZoom: 2,
      basemap: { style: "dark" },
      layers: [
        {
          id: "quakes",
          kind: "event",
          label: "Jordskalv",
          sourceType: "api",
          sourceUrl: "/api/earthquakes",
          refreshIntervalMs: 300_000,
          geometryType: "point",
          style: {
            markerShape: "circle",
            mapFamily: "point",
            colorField: "mag",
            sizeField: "mag",
            color: { scheme: "magma" },
            classification: { method: "quantile", classes: 5 },
            fillOpacity: 0.8,
          },
          legend: { title: "Magnitud", type: "gradient" },
          interaction: {
            tooltipFields: ["title", "mag", "place"],
            hoverEffect: "enlarge",
          },
          attribution: "USGS Earthquake Hazards Program",
          attributionUrl: "https://earthquake.usgs.gov",
        },
      ],
    },
  },
  {
    id: "earthquakes-heat",
    title: "Jordskalv — värmevy",
    description: "Heatmap av seismisk aktivitet senaste dygnet",
    family: "heatmap",
    manifest: {
      id: "earthquakes-heat",
      title: "Jordskalv — värmevy",
      description: "Heatmap av seismisk aktivitet (M2.5+)",
      theme: "editorial",
      version: 2,
      defaultCenter: [20, 0],
      defaultZoom: 2,
      basemap: { style: "dark" },
      layers: [
        {
          id: "quakes-heat",
          kind: "event",
          label: "Seismisk aktivitet",
          sourceType: "api",
          sourceUrl: "/api/earthquakes",
          refreshIntervalMs: 300_000,
          geometryType: "point",
          style: {
            markerShape: "circle",
            mapFamily: "heatmap",
            colorField: "mag",
            color: { scheme: "magma" },
            fillOpacity: 0.7,
          },
          legend: { title: "Seismisk intensitet", type: "gradient" },
          attribution: "USGS Earthquake Hazards Program",
          attributionUrl: "https://earthquake.usgs.gov",
        },
      ],
    },
  },
  {
    id: "europe-density",
    title: "Europa — befolkningstäthet",
    description: "Choropleth-karta med invånare per km²",
    family: "choropleth",
    manifest: {
      id: "europe-density",
      title: "Europa — befolkningstäthet",
      description: "Invånare per km² i europeiska länder",
      theme: "editorial",
      version: 2,
      defaultCenter: [54, 15],
      defaultZoom: 3.5,
      basemap: { style: "dark" },
      layers: [
        {
          id: "density",
          kind: "zone",
          label: "Befolkningstäthet",
          sourceType: "geojson-url",
          sourceUrl: "/templates/european-countries.geojson",
          geometryType: "polygon",
          style: {
            markerShape: "circle",
            mapFamily: "choropleth",
            colorField: "density",
            color: { scheme: "blues" },
            classification: { method: "quantile", classes: 5 },
            fillOpacity: 0.75,
            strokeColor: "rgba(255,255,255,0.2)",
            strokeWidth: 1,
            labelField: "name",
          },
          legend: { title: "Inv./km²", type: "gradient" },
          interaction: {
            tooltipFields: ["name", "population", "density"],
            hoverEffect: "highlight",
          },
        },
      ],
    },
  },
  {
    id: "europe-capitals",
    title: "Europas huvudstäder",
    description: "Proportionella symboler efter befolkningsstorlek",
    family: "proportional-symbol",
    manifest: {
      id: "europe-capitals",
      title: "Europas huvudstäder",
      description: "Befolkning i europeiska huvudstäder",
      theme: "editorial",
      version: 2,
      defaultCenter: [54, 15],
      defaultZoom: 3.5,
      basemap: { style: "dark" },
      layers: [
        {
          id: "capitals",
          kind: "asset",
          label: "Huvudstäder",
          sourceType: "geojson-url",
          sourceUrl: "/templates/european-capitals.geojson",
          geometryType: "point",
          style: {
            markerShape: "circle",
            mapFamily: "proportional-symbol",
            colorField: "region",
            sizeField: "population",
            color: { scheme: "set2" },
            classification: { method: "categorical", classes: 4 },
            fillOpacity: 0.8,
            strokeColor: "rgba(255,255,255,0.3)",
            strokeWidth: 1,
            labelField: "name",
          },
          legend: { title: "Befolkning", type: "proportional", exampleValues: [500_000, 2_000_000, 5_000_000] },
          interaction: {
            tooltipFields: ["name", "country", "population"],
            hoverEffect: "enlarge",
          },
        },
      ],
    },
  },
  {
    id: "europe-trade",
    title: "Handelsflöden i Europa",
    description: "Flödeskarta med handelsvolymer mellan länder",
    family: "flow",
    manifest: {
      id: "europe-trade",
      title: "Handelsflöden i Europa",
      description: "Handelsvolymer mellan europeiska länder",
      theme: "editorial",
      version: 2,
      defaultCenter: [50, 10],
      defaultZoom: 3.8,
      basemap: { style: "dark" },
      layers: [
        {
          id: "trade",
          kind: "event",
          label: "Handelsflöden",
          sourceType: "geojson-url",
          sourceUrl: "/templates/european-trade.geojson",
          geometryType: "line",
          style: {
            markerShape: "circle",
            mapFamily: "flow",
            colorField: "category",
            color: { scheme: "set2" },
            classification: { method: "categorical", classes: 3 },
            fillOpacity: 0.7,
          },
          flow: {
            originField: "origin",
            destinationField: "destination",
            weightField: "volume",
            arc: true,
            minWidth: 1,
            maxWidth: 6,
          },
          legend: { title: "Handelsvolym", type: "flow" },
          interaction: {
            tooltipFields: ["origin", "destination", "volume", "category"],
            hoverEffect: "highlight",
          },
        },
      ],
    },
  },
];

export function getTemplate(id: string): MapTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
