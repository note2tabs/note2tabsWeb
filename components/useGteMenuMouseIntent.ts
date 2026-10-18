import { useEffect, useRef, type MouseEvent } from "react";
import { insideMenuBounds, insideMenuCorridor } from "../lib/gteMenuMouseIntent";

export default function useGteMenuMouseIntent(closeMenu: () => void) {
  const pending = useRef<{ root: HTMLDetailsElement; origin: { x: number; y: number }; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(closeMenu);
  closeRef.current = closeMenu;
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null; pending.current = null;
  };
  const dismiss = () => {
    const root = pending.current?.root;
    cancel();
    if (root?.open) closeRef.current();
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const leave = pending.current;
      if (!leave || event.pointerType !== "mouse") return;
      const point = { x: event.clientX, y: event.clientY };
      const panels = Array.from(leave.root.querySelectorAll<HTMLElement>("summary, div"))
        .filter((element) => element === leave.root.querySelector("summary") || (element.parentElement instanceof HTMLDetailsElement && element.parentElement.open));
      if (panels.some((panel) => insideMenuBounds(point, panel.getBoundingClientRect()))) { cancel(); return; }
      const safe = Date.now() - leave.at < 400 && panels.some((panel) => panel.tagName !== "SUMMARY" && insideMenuCorridor(point, leave.origin, panel.getBoundingClientRect()));
      if (safe) {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(dismiss, Math.max(0, 400 - (Date.now() - leave.at)));
      } else {
        dismiss();
      }
    };
    document.addEventListener("pointermove", move, true);
    return () => { document.removeEventListener("pointermove", move, true); cancel(); };
  }, []);
  return {
    onMouseEnter: cancel,
    onMouseLeave: (event: MouseEvent<HTMLDetailsElement>) => {
      cancel();
      if (!event.currentTarget.open) return;
      pending.current = { root: event.currentTarget, origin: { x: event.clientX, y: event.clientY }, at: Date.now() };
      timer.current = setTimeout(dismiss, 120);
    },
  };
}
