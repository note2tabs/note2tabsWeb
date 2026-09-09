import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EDITOR_TUTORIAL_CARDS,
  EDITOR_TUTORIAL_GUEST_STORAGE_KEY,
  type EditorTutorialCard,
} from "../lib/editorTutorial";

type Props = {
  hasAccount: boolean;
  passedTutorial: boolean;
  cards?: EditorTutorialCard[];
};

const EDITOR_TUTORIAL_OPEN_EVENT = "note2tabs:open-editor-tutorial";

export function EditorTutorialTrigger({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EDITOR_TUTORIAL_OPEN_EVENT))}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${className}`.trim()}
      aria-label="Open editor tutorial"
      title="Editor tutorial"
    >
      ?
    </button>
  );
}

const Arrow = ({ direction }: { direction: "left" | "right" }) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" aria-hidden="true">
    <path
      d={direction === "left" ? "m12.5 4.5-5.5 5.5 5.5 5.5" : "m7.5 4.5 5.5 5.5-5.5 5.5"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

export default function EditorTutorial({ hasAccount, passedTutorial, cards = EDITOR_TUTORIAL_CARDS }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const interactionRecorded = useRef(passedTutorial);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const recordInteraction = useCallback(() => {
    if (interactionRecorded.current) return;
    interactionRecorded.current = true;
    if (!hasAccount) {
      localStorage.setItem(EDITOR_TUTORIAL_GUEST_STORAGE_KEY, "true");
      return;
    }
    void fetch("/api/account/tutorial", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((response) => {
        if (!response.ok) interactionRecorded.current = false;
      })
      .catch(() => {
        interactionRecorded.current = false;
      });
  }, [hasAccount]);

  useEffect(() => {
    const guestAlreadyInteracted = !hasAccount && localStorage.getItem(EDITOR_TUTORIAL_GUEST_STORAGE_KEY) === "true";
    if (!passedTutorial && !guestAlreadyInteracted) setOpen(true);
  }, [hasAccount, passedTutorial]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      recordInteraction();
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, recordInteraction]);

  useEffect(() => {
    const onOpenTutorial = () => {
      recordInteraction();
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(EDITOR_TUTORIAL_OPEN_EVENT, onOpenTutorial);
    return () => window.removeEventListener(EDITOR_TUTORIAL_OPEN_EVENT, onOpenTutorial);
  }, [recordInteraction]);

  const interact = (action: () => void) => {
    recordInteraction();
    action();
  };
  const activeCard = cards[index] ?? cards[0];

  return (
    <>
      {open && activeCard && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            interact(() => setOpen(false));
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-tutorial-title"
            className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-slate-200 bg-[#fffdf8] shadow-[0_28px_90px_rgba(15,23,42,0.24)]"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => interact(() => setOpen(false))}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-xl font-light text-slate-700 shadow-sm backdrop-blur hover:bg-white"
              aria-label="Close tutorial"
            >
              ×
            </button>

            <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#eef2ec]">
              <Image
                key={activeCard.id}
                src={activeCard.imageSrc}
                alt={activeCard.imageAlt}
                fill
                priority={index === 0}
                sizes="(max-width: 640px) calc(100vw - 32px), 576px"
                className="object-cover"
                style={{ objectPosition: activeCard.imagePosition ?? "center" }}
              />
            </div>

            <div className="px-6 pb-5 pt-3 sm:px-8 sm:pb-7">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/70">
                {activeCard.eyebrow}
              </p>
              <h2 id="editor-tutorial-title" className="mb-0 mt-2 text-2xl font-semibold tracking-[-0.025em] text-slate-950">
                {activeCard.title}
              </h2>
              <p className="mb-0 mt-3 text-[15px] leading-6 text-slate-600">{activeCard.text}</p>

              <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => interact(() => setIndex((current) => Math.max(0, current - 1)))}
                  className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:invisible"
                >
                  <Arrow direction="left" /> Previous
                </button>

                <div className="flex items-center justify-center gap-2" aria-label={`Tutorial step ${index + 1} of ${cards.length}`}>
                  {cards.map((card, cardIndex) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => interact(() => setIndex(cardIndex))}
                      className={`rounded-full bg-slate-800 transition-all ${
                        cardIndex === index ? "h-2.5 w-2.5 opacity-90" : "h-2 w-2 opacity-25 hover:opacity-50"
                      }`}
                      aria-label={`Go to tutorial step ${cardIndex + 1}`}
                      aria-current={cardIndex === index ? "step" : undefined}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => interact(() => {
                    if (index === cards.length - 1) setOpen(false);
                    else setIndex((current) => Math.min(cards.length - 1, current + 1));
                  })}
                  className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  {index === cards.length - 1 ? "Done" : "Next"} <Arrow direction="right" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
