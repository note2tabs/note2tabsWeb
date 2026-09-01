import type { ComponentProps } from "react";
import type GteWorkspace from "./GteWorkspace";

type Props = ComponentProps<typeof GteWorkspace>;

export default function GteNotationWorkspace({ snapshot, isActive, onFocusWorkspace }: Props) {
  return (
    <section
      className={`mx-auto my-4 flex min-h-52 w-[calc(100%-2rem)] max-w-5xl items-center justify-center rounded-2xl border bg-white px-6 text-center shadow-sm ${
        isActive ? "border-slate-300" : "border-slate-200"
      }`}
      onMouseDown={onFocusWorkspace}
      aria-label={`${snapshot.name || "Notation track"} score`}
    >
      <div>
        <div className="text-sm font-semibold text-slate-800">Notation editing is coming soon</div>
        <p className="mt-1 text-xs text-slate-500">
          This track keeps its original instrument and playback while score editing is being prepared.
        </p>
      </div>
    </section>
  );
}
