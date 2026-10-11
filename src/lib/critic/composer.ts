/**
 * Composer (§8.1): one review image — original on the left, the same photo with the
 * outline (red, ~2 px at working size) and feature lines (thinner) on the right.
 * Downscaled so the combined width ≤ maxWidth, encoded as JPEG.
 */
import type { FeatureGroup } from "../pipeline/features";
import type { Polyline } from "../pipeline/outline";

export function tracePolyline(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, pl: Polyline, s: number) {
  if (!pl.points.length) return;
  ctx.beginPath();
  ctx.moveTo(pl.points[0].x * s, pl.points[0].y * s);
  for (let i = 1; i < pl.points.length; i++) ctx.lineTo(pl.points[i].x * s, pl.points[i].y * s);
  if (pl.closed) ctx.closePath();
}

export function composeReviewImage(args: {
  source: CanvasImageSource;
  w: number;
  h: number;
  outline: Polyline[];
  features: FeatureGroup[];
  maxWidth: number;
  quality: number;
}): string {
  const { w, h } = args;
  const scale = Math.min(1, args.maxWidth / (2 * w));
  const cw = Math.max(2, Math.round(w * scale));
  const ch = Math.max(2, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw * 2;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(args.source, 0, 0, cw, ch);
  ctx.drawImage(args.source, cw, 0, cw, ch);
  ctx.save();
  ctx.translate(cw, 0);
  ctx.strokeStyle = "#ff1a1a";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, 2 * scale * (w / 1024) * 1.5);
  for (const pl of args.outline) { tracePolyline(ctx, pl, scale); ctx.stroke(); }
  ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.6);
  for (const g of args.features) for (const pl of g.polylines) { tracePolyline(ctx, pl, scale); ctx.stroke(); }
  ctx.restore();
  // separator
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cw - 1, 0, 2, ch);
  return canvas.toDataURL("image/jpeg", Math.min(1, Math.max(0.3, args.quality)));
}
