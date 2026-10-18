import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Mode = "length" | "start" | "both";
export default function GteScaleModeMenu({ value, onChange, disabled, label, options }: {
  value: Mode; onChange: (value: Mode) => void; disabled: boolean; label: string;
  options: Array<{ value: Mode; label: string }>;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => { setPosition(null); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setPosition(null);
    };
    const dismiss = () => setPosition(null);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [position]);
  useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, rect.left - 168), top: Math.max(8, Math.min(window.innerHeight - 124, rect.top)) });
  };
  return <>
    <button ref={triggerRef} type="button" aria-label={label} title={`${label}: ${options.find((option) => option.value === value)?.label}`}
      aria-haspopup="menu" aria-expanded={Boolean(position)} disabled={disabled} data-scale-mode-select="true" data-gte-scale-mode-menu="true"
      className="flex h-8 w-3 items-center justify-center rounded hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-30"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => position ? close() : open()}
      onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); open(); } }}>
      <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-current" strokeWidth={1.5} aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    {position && createPortal(<div ref={menuRef} role="menu" aria-label={label} data-gte-floating-ui="true" data-gte-toolbar-ui="true" data-gte-scale-mode-menu="true"
      className="fixed z-[10005] w-40 rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg" style={position}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") { setPosition(null); triggerRef.current?.focus(); }
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      {options.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={value === option.value} tabIndex={-1}
        onClick={() => { onChange(option.value); close(); }}
        className={`flex h-8 w-full items-center justify-between rounded-md px-2 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${value === option.value ? "text-sky-700" : ""}`}>
        {option.label}{value === option.value && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.7} aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
      </button>)}
    </div>, document.body)}
  </>;
}
