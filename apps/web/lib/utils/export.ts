import { slugify } from "./slugify";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export the MapLibre canvas as a PNG image. */
export function exportPNG(canvas: HTMLCanvasElement, title: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${slugify(title)}.png`);
  }, "image/png");
}

/** Export a GeoJSON FeatureCollection as a .geojson file. */
export function exportGeoJSON(
  data: GeoJSON.FeatureCollection,
  title: string,
) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/geo+json" });
  downloadBlob(blob, `${slugify(title)}.geojson`);
}
