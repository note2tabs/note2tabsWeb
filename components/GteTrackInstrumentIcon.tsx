import type { EditorSnapshot } from "../types/gte";
import { trackInstrumentIconKind } from "../lib/gteTrackInstrumentIcon";

// Standard Lucide icons (ISC): https://github.com/lucide-icons/lucide
// Copyright (c) 2026 Lucide Icons and Contributors.
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

export default function GteTrackInstrumentIcon({ lane, className = "h-5 w-5" }: {
  lane: Pick<EditorSnapshot, "instrumentId" | "trackType" | "editorType" | "type">;
  className?: string;
}) {
  const kind = trackInstrumentIconKind(lane);
  return <svg viewBox="0 0 24 24" className={`${className} shrink-0 fill-none stroke-current`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "guitar" || kind === "bass" ? <>
      <path d="m11.9 12.1 4.514-4.514" />
      <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z" />
      <path d="m6 16 2 2M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z" />
    </> : kind === "drums" ? <><path d="m2 2 8 8m12-8-8 8" /><ellipse cx="12" cy="9" rx="10" ry="5" /><path d="M7 13.4v7.9M12 14v8M17 13.4v7.9M2 9v8a10 5 0 0 0 20 0V9" /></>
      : kind === "piano" ? <><path d="M10 13v4M14 13v4M18 13v4M2 13h20M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2zM6 13v4" /></>
      : kind === "synth" ? <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="M6 8h4M14 8h.01M18 8h.01M2 12h20M6 12v4M10 12v4M14 12v4M18 12v4" /></>
      : <path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3" />}
  </svg>;
}
