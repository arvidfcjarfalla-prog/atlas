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

/** Export the MapLibre canvas as a PNG image at a given DPI scale. */
export function exportPNG(
  canvas: HTMLCanvasElement,
  title: string,
  scale = 1,
) {
  if (scale === 1) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${slugify(title)}.png`);
    }, "image/png");
    return;
  }

  // Higher DPI: render to an offscreen canvas at the scaled resolution
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(canvas, 0, 0, w, h);
  offscreen.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${slugify(title)}@${scale}x.png`);
  }, "image/png");
}

/** Export the MapLibre canvas as SVG (via canvas → PNG embedded in SVG). */
export function exportSVG(canvas: HTMLCanvasElement, title: string) {
  const dataUrl = canvas.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
  <image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  downloadBlob(blob, `${slugify(title)}.svg`);
}

/** Export the MapLibre canvas as a PDF (dynamically imports jspdf). */
export async function exportPDF(
  canvas: HTMLCanvasElement,
  title: string,
  attribution?: string,
) {
  const { jsPDF } = await import("jspdf");
  const imgData = canvas.toDataURL("image/png");
  const landscape = canvas.width > canvas.height;
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height + 40],
  });

  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

  // Title + attribution stamp at bottom
  pdf.setFontSize(14);
  pdf.setTextColor(60, 60, 60);
  pdf.text(title, 16, canvas.height + 20);
  if (attribution) {
    pdf.setFontSize(9);
    pdf.setTextColor(140, 140, 140);
    pdf.text(attribution, 16, canvas.height + 32);
  }

  pdf.save(`${slugify(title)}.pdf`);
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
