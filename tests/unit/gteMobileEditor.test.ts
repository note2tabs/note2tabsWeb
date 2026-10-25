import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../../lib/i18n/react";
import GteNotationToolbar from "../../components/GteNotationToolbar";

const noop = () => undefined;
const toolbar = (compact: boolean) => renderToStaticMarkup(
  React.createElement(LocaleProvider, { path: "/gte/local", children: React.createElement(GteNotationToolbar, {
    compact, mode: "select", denominator: 4, dotted: false, accidental: null, disabled: false, voice: 1, tieActive: false, slurActive: false,
    canTie: false, canSlur: false, onDuration: noop, onDot: noop, onAccidental: noop, onVoice: noop, onTie: noop, onSlur: noop, onDelete: noop,
    onUndo: noop, onRedo: noop,
  }) }),
);

describe("mobile editor layout", () => {
  it("lays the notation palette out as a slim touch-sized side rail on phones", () => {
    const html = toolbar(true);
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain("w-11");
    expect(html).not.toContain("w-[124px]");
    expect(html).toContain("min-h-11");
    // Undo/redo live in the bottom dock on phones.
    expect(html).not.toContain('aria-label="History"');
  });

  it("keeps the vertical palette on desktop", () => {
    const html = toolbar(false);
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain("w-[124px]");
    expect(html).toContain('aria-label="History"');
  });

  it("gives phones a transport for piano and drum-notation tracks, and hides keyboard-only practice help", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "pages/gte/[editor_id].tsx"), "utf8");
    expect(page).toContain('data-gte-shared-transport="mobile"');
    expect(page).toMatch(/isMobileViewport && canvas && \(notationTrackActive \|\| \(drumTrackActive && \(practiceModeEnabled \|\| tabViewEnabled\)\)\)/);
    expect(page).toContain("{!isMobileViewport && renderPracticeHelp()}");
  });

  it("exposes MIDI view as a third mode on phones for piano tracks only", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "pages/gte/[editor_id].tsx"), "utf8");
    expect(page).toContain("const showMiddleView = !compact || notationTrackActive;");
  });

  it("moves undo/redo to a bottom dock level with playback, and the track bar plus track settings up top", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "pages/gte/[editor_id].tsx"), "utf8");
    expect(page).toContain('data-gte-mobile-history="true"');
    expect(page).toContain("createPortal(renderMobileHistoryDock(), document.body)");
    expect(page).toContain("{!practiceModeEnabled && renderMobileTrackBar()}");
    expect(page).toContain("const renderMobileTrackSettings = () => {");
    expect(page).not.toContain("renderMobileHistoryControls");
  });

  it("keeps a sticky notation rail beside the score on phones and compacts landscape chrome", () => {
    const workspace = fs.readFileSync(path.join(process.cwd(), "components/GteNotationWorkspace.tsx"), "utf8");
    expect(workspace).toContain("maxHeight: `calc(100dvh - ${toolbarTop}px - 6rem)`");
    const page = fs.readFileSync(path.join(process.cwd(), "pages/gte/[editor_id].tsx"), "utf8");
    expect(page).toContain("[@media(max-height:500px)]:flex-row");
  });

  it("supports touch panning and pinch zoom in the MIDI piano roll", () => {
    const midi = fs.readFileSync(path.join(process.cwd(), "components/GteMidiWorkspace.tsx"), "utf8");
    expect(midi).toContain("touchPan");
    expect(midi).toContain("pinch.current");
  });
});
