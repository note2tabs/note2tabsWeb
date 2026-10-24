import { useLocale } from "../lib/i18n/react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Note2TabsSelectOption<T extends string = string> = {
  value: T;
  label: string;
  group?: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  value: T;
  options: Note2TabsSelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  portal?: boolean;
};

export default function Note2TabsSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = "",
  portal = false,
}: Props<T>) {
  const { t } = useLocale();
  const rootRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) rootRef.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!open || !portal) return;
    const update = () => {
      const rect = summaryRef.current?.getBoundingClientRect(); if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
      const height = Math.min(280, Math.max(80, Math.max(below, above)));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), top: below >= Math.min(280, above) ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), width: rect.width, maxHeight: height });
    };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, portal]);
  const closeMenu = () => { if (rootRef.current) rootRef.current.open = false; setOpen(false); summaryRef.current?.focus(); };
  const menu = <div ref={menuRef} id={listboxId} className={`note2tabs-select__menu${className.includes("gte-track-select") ? " gte-track-select-menu" : ""}`} role="listbox" aria-label={t(label)}
    data-gte-floating-ui={portal ? "true" : undefined}
    onMouseDown={event => { if (portal) event.stopPropagation(); }}
    style={portal ? { position: "fixed", ...position, minWidth: position.width, maxWidth: "calc(100vw - 16px)", zIndex: 10060, bottom: "auto" } : undefined}
    onKeyDown={event => {
      if (portal) event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>
    {options.map((option, index) => <Fragment key={option.value}>
      {option.group && option.group !== options[index - 1]?.group && <div role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t(option.group)}</div>}
      <button type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); closeMenu(); }}>
        <span className="note2tabs-select__check" aria-hidden="true">{option.value === value && <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>}</span><span>{t(option.label)}</span>
      </button>
    </Fragment>)}
  </div>;

  return (
    <details
      className={`note2tabs-select ${disabled ? "note2tabs-select--disabled" : ""} ${className}`.trim()}
      ref={rootRef}
      onToggle={() => {
        setOpen(Boolean(rootRef.current?.open) && !disabled);
        if (disabled && rootRef.current) {
          rootRef.current.open = false;
          return;
        }
        if (rootRef.current?.open) {
          requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && rootRef.current) {
          event.stopPropagation();
          rootRef.current.open = false;
          summaryRef.current?.focus();
        }
      }}
    >
      <summary
        ref={summaryRef}
        aria-label={`${t(label)}: ${t(selected?.label || "")}`}
        aria-controls={listboxId}
        aria-disabled={disabled}
        onClick={(event) => { if (disabled) event.preventDefault(); }}
      >
        <span>{t(selected?.label || "")}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </summary>
      {portal ? open && typeof document !== "undefined" ? createPortal(menu, document.body) : null : menu}
    </details>
  );
}
