export const trimSlash = (s: string) => s.replace(/\/+$/, "");
export function splitDataUrl(dataUrl: string): { mime: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  return m ? { mime: m[1], data: m[2] } : { mime: "image/jpeg", data: dataUrl };
}
