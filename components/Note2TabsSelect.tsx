import { useEffect, useId, useRef } from "react";

export type Note2TabsSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: Note2TabsSelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

export default function Note2TabsSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = "",
}: Props<T>) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) rootRef.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details
      className={`note2tabs-select ${disabled ? "note2tabs-select--disabled" : ""} ${className}`.trim()}
      ref={rootRef}
      onToggle={() => {
        if (disabled && rootRef.current) {
          rootRef.current.open = false;
          return;
        }
        if (rootRef.current?.open) {
          requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && rootRef.current) {
          rootRef.current.open = false;
          summaryRef.current?.focus();
        }
      }}
    >
      <summary
        ref={summaryRef}
        aria-label={`${label}: ${selected?.label || ""}`}
        aria-controls={listboxId}
        aria-disabled={disabled}
        onClick={(event) => { if (disabled) event.preventDefault(); }}
      >
        <span>{selected?.label}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </summary>
      <div id={listboxId} className="note2tabs-select__menu" role="listbox" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              if (rootRef.current) rootRef.current.open = false;
              summaryRef.current?.focus();
            }}
          >
            <span className="note2tabs-select__check" aria-hidden="true">
              {option.value === value && <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>}
            </span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
