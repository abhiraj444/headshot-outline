/**
 * Export (§12): PNG (white / transparent) and SVG at the original image's resolution.
 * The contour is vector, so it is scaled up rather than the mask (§15).
 * SVG has separate <g id="outline"> and <g id="features"> groups.
 */
import type { FeatureGroup } from "../pipeline/features";
import { polylineToPath, type Polyline } from "../pipeline/outline";
import { tracePolyline } from "../critic/composer";

export interface ExportInput {
  outline: Polyline[];
  features: FeatureGroup[];
  workW: number;
  workH: number;
  origW: number;
  origH: number;
  strokePx: number;
  strokeRatio: number;
}

export function strokeAtOriginal(e: ExportInput) {
  const s = e.origW / e.workW;
  return { scale: s, outer: e.strokePx * s, feature: Math.max(1, e.strokePx * e.strokeRatio * s) };
}

export function buildSvg(e: ExportInput, background: "white" | "transparent" = "white"): string {
  const { scale, outer, feature } = strokeAtOriginal(e);
  const outlinePaths = e.outline.map((pl) => `    <path d="${polylineToPath(pl, scale, 1)}"/>`).join("\n");
  const featureGroups = e.features
    .map((g) => `    <g id="feature-${g.key}" data-part="${g.part}">\n${g.polylines.map((pl) => `      <path d="${polylineToPath(pl, scale, 1)}"/>`).join("\n")}\n    </g>`)
    .join("\n");
  const bg = background === "white" ? `  <rect width="100%" height="100%" fill="#ffffff"/>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${e.origW}" height="${e.origH}" viewBox="0 0 ${e.origW} ${e.origH}">
${bg}  <g id="outline" fill="none" stroke="#000000" stroke-width="${outer.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round">
${outlinePaths}
  </g>
  <g id="features" fill="none" stroke="#000000" stroke-width="${feature.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round">
${featureGroups}
  </g>
</svg>
`;
}

export async function buildPng(e: ExportInput, background: "white" | "transparent"): Promise<Blob> {
  const { scale, outer, feature } = strokeAtOriginal(e);
  const canvas = document.createElement("canvas");
  canvas.width = e.origW;
  canvas.height = e.origH;
  const ctx = canvas.getContext("2d")!;
  if (background === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, e.origW, e.origH);
  }
  ctx.strokeStyle = "#000000";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = outer;
  for (const pl of e.outline) { tracePolyline(ctx, pl, scale); ctx.stroke(); }
  ctx.lineWidth = feature;
  for (const g of e.features) for (const pl of g.polylines) { tracePolyline(ctx, pl, scale); ctx.stroke(); }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"));
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
