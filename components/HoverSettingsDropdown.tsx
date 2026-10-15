import { useEffect, useRef, useState, type ReactNode } from "react";

type Point = { x: number; y: number };

function insideTriangle(point: Point, a: Point, b: Point, c: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const signs = [cross(point, a, b), cross(point, b, c), cross(point, c, a)];
  return !(signs.some((value) => value < 0) && signs.some((value) => value > 0));
}

export default function HoverSettingsDropdown({ summary, children }: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<{ point: Point; at: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        leaveRef.current = null;
        cancelClose();
        return;
      }
      const leave = leaveRef.current;
      if (!leave) return;
      const bounds = panelRef.current?.getBoundingClientRect();
      const safe = bounds && Date.now() - leave.at < 700 && insideTriangle(
        { x: event.clientX, y: event.clientY },
        leave.point,
        { x: bounds.left - 8, y: bounds.top + 8 },
        { x: bounds.right + 8, y: bounds.top + 8 },
      );
      if (!safe) {
        cancelClose();
        closeTimerRef.current = setTimeout(() => setOpen(false), 180);
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
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      cancelClose();
      leaveRef.current = null;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <details
      ref={rootRef}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onPointerEnter={() => { leaveRef.current = null; cancelClose(); }}
      onPointerLeave={(event) => {
        if (!open || event.pointerType !== "mouse") return;
        leaveRef.current = { point: { x: event.clientX, y: event.clientY }, at: Date.now() };
        cancelClose();
        closeTimerRef.current = setTimeout(() => setOpen(false), 700);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className="group relative order-[7] ml-2 w-fit max-w-full rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-1.5 text-xs text-slate-600">
        {summary}
      </summary>
      <div ref={panelRef} className="absolute left-0 top-full z-[10000] mt-1 flex w-max max-w-[calc(100vw-3rem)] flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
        {children}
      </div>
    </details>
  );
}
