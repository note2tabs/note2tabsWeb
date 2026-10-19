import { useCallback, useRef, useState, type SetStateAction } from "react";
import type { CanvasSnapshot } from "../types/gte";

/**
 * Editor transactions need the latest canvas before React renders (rapid edits,
 * undo/redo, and save revision checks). Resolve each transaction exactly once;
 * React receives a value, never a callback that mutates the history stacks.
 */
export function useGteCanvasState() {
  const [canvas, setRenderedCanvas] = useState<CanvasSnapshot | null>(null);
  const canvasRef = useRef<CanvasSnapshot | null>(null);
  const setCanvas = useCallback((update: SetStateAction<CanvasSnapshot | null>) => {
    const next = typeof update === "function" ? update(canvasRef.current) : update;
    canvasRef.current = next;
    setRenderedCanvas(next);
  }, []);
  return [canvas, setCanvas, canvasRef] as const;
}
