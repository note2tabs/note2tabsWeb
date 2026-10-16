import { useEffect, useRef, useState, type ReactNode } from "react";

type Point = { x: number; y: number };

function insideTriangle(point: Point, a: Point, b: Point, c: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const signs = [cross(point, a, b), cross(point, b, c), cross(point, c, a)];
  return !(signs.some((value) => value < 0) && signs.some((value) => value > 0));
}

function insideReturnCorridor(point: Point, origin: Point, bounds: DOMRect) {
  const margin = 12;
  // Include a small area around the selection point before narrowing toward the panel.
  if (Math.abs(point.x - origin.x) <= margin && Math.abs(point.y - origin.y) <= margin) return true;
  if (origin.y > bounds.bottom) {
    return insideTriangle(point, { x: origin.x, y: origin.y + margin },
      { x: bounds.left - margin, y: bounds.bottom - margin },
      { x: bounds.right + margin, y: bounds.bottom - margin });
  }
  if (origin.y < bounds.top) {
    return insideTriangle(point, { x: origin.x, y: origin.y - margin },
      { x: bounds.left - margin, y: bounds.top + margin },
      { x: bounds.right + margin, y: bounds.top + margin });
  }
  const fromLeft = origin.x < bounds.left;
  const edge = fromLeft ? bounds.left + margin : bounds.right - margin;
  return insideTriangle(point, { x: origin.x + (fromLeft ? -margin : margin), y: origin.y },
    { x: edge, y: bounds.top - margin }, { x: edge, y: bounds.bottom + margin });
}

export default function HoverSettingsDropdown({ summary, children, panelTitle, closeLabel, pushRight = false, panelIcon = "music" }: {
  summary: ReactNode;
  children: ReactNode;
  panelTitle?: string;
  closeLabel?: string;
  pushRight?: boolean;
  panelIcon?: "music" | "editing";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<{ point: Point; at: number } | null>(null);
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });
  const returnCorridorRef = useRef<{ origin: Point; awaitingPointer: boolean } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const point = { x: event.clientX, y: event.clientY };
      const previousPoint = lastPointerRef.current;
      lastPointerRef.current = point;
      const panelBounds = panelRef.current?.getBoundingClientRect();
      const summaryBounds = rootRef.current?.querySelector("summary")?.getBoundingClientRect();
      const containsPoint = (bounds?: DOMRect) => bounds && point.x >= bounds.left &&
        point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
      // Native selects may keep the event target captured after their popup
      // closes. Use actual pointer coordinates rather than target containment.
      if (containsPoint(panelBounds) || containsPoint(summaryBounds)) {
        leaveRef.current = null;
        returnCorridorRef.current = null;
        cancelClose();
        return;
      }
      const corridor = returnCorridorRef.current;
      if (corridor) {
        // Native select menus do not expose the option-click coordinates. The
        // first pointer event after selection supplies the actual return origin.
        if (corridor.awaitingPointer) {
          corridor.origin = point;
          corridor.awaitingPointer = false;
        }
        const bounds = panelRef.current?.getBoundingClientRect();
        if (bounds && insideReturnCorridor(point, corridor.origin, bounds)) {
          cancelClose();
        } else if (closeTimerRef.current === null) {
          closeTimerRef.current = setTimeout(() => setOpen(false), 80);
        }
        return;
      }
      const leave = leaveRef.current ?? { point: previousPoint, at: Date.now() };
      leaveRef.current = leave;
      const bounds = panelRef.current?.getBoundingClientRect();
      const safe = bounds && Date.now() - leave.at < 350 && insideTriangle(
        { x: event.clientX, y: event.clientY },
        leave.point,
        { x: bounds.left - 8, y: bounds.top + 8 },
        { x: bounds.right + 8, y: bounds.top + 8 },
      );
      if (!safe && closeTimerRef.current === null) {
        closeTimerRef.current = setTimeout(() => setOpen(false), 80);
      }
    };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      cancelClose();
      leaveRef.current = null;
      returnCorridorRef.current = null;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <details
      ref={rootRef}
      data-gte-settings-panel={panelTitle ? "true" : undefined}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") lastPointerRef.current = { x: event.clientX, y: event.clientY };
      }}
      onChangeCapture={(event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        cancelClose();
        leaveRef.current = null;
        returnCorridorRef.current = { origin: lastPointerRef.current, awaitingPointer: true };
      }}
      onPointerEnter={() => { leaveRef.current = null; cancelClose(); }}
      onPointerLeave={(event) => {
        if (!open || event.pointerType !== "mouse") return;
        if (returnCorridorRef.current) return;
        leaveRef.current = { point: { x: event.clientX, y: event.clientY }, at: Date.now() };
        cancelClose();
        closeTimerRef.current = setTimeout(() => setOpen(false), 150);
      }}
      onBlur={(event) => {
        // Select handlers blur after committing; that must not dismiss the panel.
        if (event.relatedTarget === null && event.target instanceof HTMLSelectElement) return;
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className={`group relative order-[7] w-fit max-w-full rounded-lg border border-slate-200 bg-white shadow-sm ${pushRight ? "ml-auto" : "ml-2"}`}
    >
      <summary className="flex h-9 cursor-pointer list-none items-center gap-3 px-3.5 text-sm text-slate-600">
        {summary}
      </summary>
      <div ref={panelRef} className={`absolute right-0 top-full z-[10000] mt-1 max-w-[calc(100vw-3rem)] rounded-lg border border-slate-200 bg-white shadow-xl ${panelTitle ? "w-[18rem] p-3" : "flex w-max flex-wrap items-end gap-3 p-3"}`}>
        {panelTitle ? (
          <>
            <div className="mb-4 flex h-11 items-center justify-between border-b border-slate-100 pb-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current text-slate-500" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {panelIcon === "editing" ? (
                    <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z" />
                  ) : <><path d="M9 18V4l10 3v11M9 8l10 3" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="16" cy="18" rx="3" ry="2" /></>}
                </svg>
                {panelTitle}
              </span>
              <button type="button" aria-label={closeLabel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => {
                setOpen(false);
                rootRef.current?.querySelector("summary")?.focus();
              }}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3">{children}</div>
          </>
        ) : children}
      </div>
    </details>
  );
}
