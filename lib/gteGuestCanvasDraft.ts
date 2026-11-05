import type { CanvasSnapshot } from "../types/gte";
export const GTE_GUEST_CANVAS_STORAGE_KEY = "note2tabs:gte:guest-canvas:v1";
type GuestCanvasDraftRecord = {
  version: 1;
  savedAt: string;
  canvas: CanvasSnapshot;
};

export const readGuestCanvasDraft = (): CanvasSnapshot | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GTE_GUEST_CANVAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestCanvasDraftRecord | CanvasSnapshot;
    const canvas =
      parsed && typeof parsed === "object" && "canvas" in parsed
        ? (parsed as GuestCanvasDraftRecord).canvas
        : (parsed as CanvasSnapshot);
    if (!canvas || typeof canvas !== "object" || !Array.isArray(canvas.editors)) return null;
    return canvas;
  } catch {
    return null;
  }
};

export const writeGuestCanvasDraft = (canvas: CanvasSnapshot) => {
  if (typeof window === "undefined") return;
  const payload: GuestCanvasDraftRecord = {
    version: 1,
    savedAt: new Date().toISOString(),
    canvas,
  };
  window.localStorage.setItem(GTE_GUEST_CANVAS_STORAGE_KEY, JSON.stringify(payload));
};


export function clearGuestCanvasDraft() {
 if (typeof window !== "undefined") window.localStorage.removeItem(GTE_GUEST_CANVAS_STORAGE_KEY);
}
