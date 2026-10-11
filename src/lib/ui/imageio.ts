/**
 * ImageIO (§3): load (EXIF orientation via createImageBitmap's imageOrientation),
 * downscale for processing (long side ≈ 1024), keep original size for export.
 */
export interface LoadedImage {
  id: string;
  name: string;
  origW: number;
  origH: number;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** working-size canvas for display / composer */
  canvas: HTMLCanvasElement;
  url: string;
}

export const WORKING_LONG_SIDE = 1024;

export async function loadImage(file: Blob, name = "photo", longSide = WORKING_LONG_SIDE): Promise<LoadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const origW = bmp.width, origH = bmp.height;
  const s = Math.min(1, longSide / Math.max(origW, origH));
  const w = Math.max(1, Math.round(origW * s)), h = Math.max(1, Math.round(origH * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const url = canvas.toDataURL("image/jpeg", 0.92);
  const id = `${name}-${origW}x${origH}-${file.size}-${Date.now()}`;
  return { id, name, origW, origH, w, h, rgba, canvas, url };
}

export async function downscale(img: LoadedImage, longSide: number): Promise<LoadedImage> {
  const blob: Blob = await new Promise((r) => img.canvas.toBlob((b) => r(b!), "image/png"));
  const out = await loadImage(blob, img.name, longSide);
  return { ...out, origW: img.origW, origH: img.origH };
}
