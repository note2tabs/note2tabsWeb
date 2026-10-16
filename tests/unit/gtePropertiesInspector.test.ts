import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChordFingerings, NoteFingerings } from "../../components/GtePropertiesInspector";
import { constrainInspectorPosition, inspectorStringFrets, placePropertiesInspector, sameInspectorFingering, transposeInspectorFrets, type InspectorRect } from "../../lib/gtePropertiesInspector";

const overlaps = (a: InspectorRect, b: InspectorRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe("properties inspector placement", () => {
  it.each([100, 1800])("opens at the opposite viewport edge for click x=%s", (x) => {
    const position = placePropertiesInspector({ width: 1920, height: 1080 }, [], { x, y: 400 });
    expect(position.left).toBe(x < 960 ? 1588 : 12);
  });
  it("allows manual positioning across the screen but never loses the panel offscreen", () => {
    const viewport = { width: 1200, height: 800 };
    expect(constrainInspectorPosition(400, 150, 320, 500, viewport)).toEqual({ left: 400, top: 150 });
    expect(constrainInspectorPosition(-100, -100, 320, 500, viewport)).toEqual({ left: 12, top: 12 });
    expect(constrainInspectorPosition(1500, 1000, 320, 500, viewport)).toEqual({ left: 868, top: 288 });
    expect(constrainInspectorPosition(1500, 1000, 320, 900, viewport)).toEqual({ left: 868, top: 12 });
  });
  it.each([
    [{ left: 1400, top: 400, right: 1850, bottom: 560 }],
    [{ left: 20, top: 20, right: 1900, bottom: 190 }],
    [{ left: 20, top: 800, right: 1900, bottom: 1000 }],
    [{ left: 400, top: 200, right: 800, bottom: 360 }, { left: 10, top: 390, right: 350, bottom: 550 }],
  ])("avoids every selected segment, including wrapped chords: %j", (...rects) => {
    const obstacles = rects as InspectorRect[];
    const position = placePropertiesInspector({ width: 1920, height: 1080 }, obstacles, { x: 1800, y: 480 });
    const bounds = { left: position.left, top: position.top, right: position.left + position.width, bottom: position.top + position.maxHeight };
    expect(position.width).toBe(320);
    expect(position.maxHeight).toBeGreaterThanOrEqual(160);
    expect(bounds.left).toBeGreaterThanOrEqual(12);
    expect(bounds.right).toBeLessThanOrEqual(1908);
    expect(bounds.bottom).toBeLessThanOrEqual(1068);
    for (const obstacle of obstacles) expect(overlaps(bounds, obstacle)).toBe(false);
  });

  it("keeps a constrained viewport's controls reachable", () => {
    const position = placePropertiesInspector({ width: 320, height: 240 }, [{ left: 0, top: 0, right: 320, bottom: 240 }], { x: 310, y: 230 });
    expect(position.width).toBe(296);
    expect(position.left + position.width).toBeLessThanOrEqual(308);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(228);
  });
  it("prefers space for the full collapsed menu over a closer, shorter placement", () => {
    const position = placePropertiesInspector(
      { width: 800, height: 800 },
      [{ left: 0, top: 400, right: 800, bottom: 430 }],
      { x: 750, y: 700 },
      350,
    );
    expect(position.maxHeight).toBeGreaterThanOrEqual(350);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(388);
  });
});

describe("fingering presentation", () => {
  it("compares positions without assuming option order or losing duplicates", () => {
    expect(sameInspectorFingering([[0, 0], [3, 7]], [[3, 7], [0, 0]])).toBe(true);
    expect(sameInspectorFingering([[0, 0], [0, 0]], [[0, 0], [3, 7]])).toBe(false);
  });
  it("supports actual instrument string counts, open and unplayed strings, and repeated positions", () => {
    expect(inspectorStringFrets([[0, 0], [3, 7], [3, 12]], 4)).toEqual([[0], [], [], [7, 12]]);
    expect(inspectorStringFrets([[0, 2], [6, 0]], 7)).toEqual([[2], [], [], [], [], [], [0]]);
  });
  it("renders a clearly selected note fingering, including when the generator omits the current option", () => {
    const html = renderToStaticMarkup(React.createElement(NoteFingerings, { tabs: [[2, 7]], blockedTabs: [], current: [0, 0], labels: ["E", "B", "G", "D", "A", "E"], onSelect: vi.fn() }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("E0");
    expect(html).toContain("G7");
    expect(html).not.toContain("amber");
  });
  it("keeps playing-coordinate order unchanged when selecting a different note fingering", () => {
    const options = { tabs: [[2, 7], [0, 0]] as [number, number][], blockedTabs: [[1, 3]] as [number, number][], orderedTabs: [[2, 7], [1, 3], [0, 0]] as [number, number][], labels: ["E", "B", "G"], onSelect: vi.fn() };
    for (const current of [[0, 0], [2, 7], [1, 3]] as [number, number][]) {
      const html = renderToStaticMarkup(React.createElement(NoteFingerings, { ...options, current }));
      expect(html.indexOf("G7")).toBeLessThan(html.indexOf("B3"));
      expect(html.indexOf("B3")).toBeLessThan(html.indexOf("E0"));
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    }
  });
  it("keeps edit fingering and bounded alternatives without the current fingering box", () => {
    const html = renderToStaticMarkup(React.createElement(ChordFingerings, {
      tabs: [[0, 0], [3, 7]], alternatives: [[[3, 7], [0, 0]], [[1, 5]], [[2, 6]], [[0, 8]], [[3, 12]]],
      labels: ["G", "D", "A", "E"], onSelect: vi.fn(), onEdit: vi.fn(),
    }));
    expect(html).not.toContain("Current fingering");
    expect(html).toContain("Edit fingering");
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(4);
    expect(html).toContain("Show all");
    expect(html).not.toContain("amber");
  });
});

// Run the real field with a minimal hook/JSX harness: no browser or live backend.
function componentHarness() {
  const source = readFileSync("components/GtePropertiesInspector.tsx", "utf8");
  const hookState: any[] = [];
  let cursor = 0;
  const context = {
    exports: {} as Record<string, any>,
    require: (name: string) => {
      if (name === "react") return {
        forwardRef: (fn: unknown) => fn,
        useState: (initial: unknown) => { const index = cursor++; if (!(index in hookState)) hookState[index] = initial; return [hookState[index], (next: any) => { hookState[index] = typeof next === "function" ? next(hookState[index]) : next; }]; },
        useRef: (initial: unknown) => { const index = cursor++; return hookState[index] ?? (hookState[index] = { current: initial }); },
        useEffect: (fn: () => void, deps: unknown[]) => { const index = cursor++; if (!hookState[index] || deps.some((dep, i) => dep !== hookState[index][i])) { hookState[index] = deps; fn(); } },
      };
      if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
      if (name.includes("i18n")) return { useLocale: () => ({ t: (value: string) => value }) };
      if (name.includes("gtePropertiesInspector")) return { transposeInspectorFrets };
      return {};
    },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { render: (name: string, props: Record<string, unknown>) => {
    cursor = 0; context.exports[name](props);
    cursor = 0; return context.exports[name](props);
  } };
}

function fieldHarness(initialValue = "0.1234", extraProps: Record<string, unknown> = {}) {
  const component = componentHarness();
  const commit = vi.fn();
  const renderTree = (value = initialValue) => {
    return component.render("PropertyNumberField", { label: "Duration", value, onCommit: commit, ...extraProps });
  };
  const render = (value = initialValue) => renderTree(value).props.children[1].props.children[0].props;
  render();
  return { commit, render, renderTree };
}

describe("inspector local field drafts", () => {
  it("does not round or persist an untouched precise duration", () => {
    const field = fieldHarness();
    field.render().onBlur();
    expect(field.commit).not.toHaveBeenCalled();
  });
  it("keeps typing local and commits exactly once on Enter/blur", () => {
    const field = fieldHarness();
    field.render().onChange({ target: { value: "0.234567" } });
    expect(field.commit).not.toHaveBeenCalled();
    const input = field.render();
    input.onKeyDown({ key: "Enter", preventDefault: vi.fn(), currentTarget: { blur: () => input.onBlur() } });
    expect(field.commit).toHaveBeenCalledExactlyOnceWith("0.234567");
  });
  it("discards uncommitted input on Escape without writing", () => {
    const field = fieldHarness();
    field.render().onChange({ target: { value: "9" } });
    const input = field.render();
    input.onKeyDown({ key: "Escape", preventDefault: vi.fn(), currentTarget: { blur: () => input.onBlur() } });
    expect(field.commit).not.toHaveBeenCalled();
    expect(field.render().value).toBe("0.1234");
  });
  it("refreshes its draft when selection values change", () => {
    const field = fieldHarness();
    field.render("0.5");
    expect(field.render("0.5").value).toBe("0.5");
  });
  it("applies chord-member plus/minus clicks immediately, repeatedly, and within fret bounds", () => {
    const h = actionHarness();
    const commitFret = realAction("commitChordNoteFret", h.context);
    const field = fieldHarness("5", { min: 0, max: 24, inlineStepper: true, onStep: (delta: number, value: string) => commitFret(String(Math.max(0, Math.min(24, Number(value) + delta)))) });
    const buttons = () => field.renderTree().props.children[1].props.children[2].props.children;
    expect(buttons()[0].props.children).toBe("−");
    expect(buttons()[1].props.children).toBe("+");
    buttons()[1].props.onClick();
    buttons()[1].props.onClick();
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 0], [2, 7], [5, 12]]);
    buttons()[0].props.onClick();
    expect(h.snapshot.chords[0].currentTabs[1][1]).toBe(6);
    for (let i = 0; i < 30; i++) buttons()[0].props.onClick();
    expect(h.snapshot.chords[0].currentTabs[1][1]).toBe(0);
    for (let i = 0; i < 30; i++) buttons()[1].props.onClick();
    expect(h.snapshot.chords[0].currentTabs[1][1]).toBe(24);
    expect(h.snapshot.chords[0].length).toBe(120);
  });
});

describe("chord transpose controls", () => {
  it("moves all frets uniformly and rejects a partial out-of-range transposition", () => {
    expect(transposeInspectorFrets([[0, 3], [2, 7]], 1, 22)).toEqual([[0, 4], [2, 8]]);
    expect(transposeInspectorFrets([[0, 0], [2, 7]], -1, 22)).toBeNull();
    expect(transposeInspectorFrets([[0, 3], [2, 22]], 1, 22)).toBeNull();
  });
  it("counts changes, follows undo/redo, and reopens at zero using the new frets", () => {
    let tabs: [number, number][] = [[0, 3], [2, 7]];
    const baseline = tabs.map((tab) => [...tab] as [number, number]);
    const props = () => ({ tabs, maxFret: 22, onTranspose: (delta: number) => { const next = transposeInspectorFrets(tabs, delta, 22); if (!next) return false; tabs = next; return true; } });
    const panel = componentHarness();
    const controls = () => panel.render("ChordTransposeControl", props()).props.children[1].props.children;
    expect(controls()[1].props.children).toBe(0);
    controls()[2].props.onClick();
    controls()[2].props.onClick();
    expect(controls()[1].props.children).toBe("+2");
    expect(tabs).toEqual([[0, 5], [2, 9]]);
    const transposed = tabs;
    tabs = baseline;
    expect(controls()[1].props.children).toBe(0);
    tabs = transposed;
    expect(controls()[1].props.children).toBe("+2");
    const reopened = componentHarness();
    expect(reopened.render("ChordTransposeControl", props()).props.children[1].props.children[1].props.children).toBe(0);
    expect(tabs).toEqual([[0, 5], [2, 9]]);
  });
  it("removes precise-duration fields from the note/chord inspector views", () => {
    expect(readFileSync("components/GteWorkspace.tsx", "utf8")).not.toContain("<DurationField");
  });
});

const workspaceSource = readFileSync("components/GteWorkspace.tsx", "utf8");
const workspaceAst = ts.createSourceFile("GteWorkspace.tsx", workspaceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function realAction(name: string, context: Record<string, any>) {
  let initializer: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(workspaceAst) === name && node.initializer) initializer = node.initializer.getText(workspaceAst);
    ts.forEachChild(node, visit);
  }
  visit(workspaceAst);
  if (!initializer) throw new Error(`Missing action ${name}`);
  return vm.runInNewContext(ts.transpileModule(`(${initializer})`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
}

function actionHarness() {
  const snapshot = {
    notes: [{ id: 1, length: 7, tab: [0, 3] }],
    chords: [{ id: 2, length: 120, startTime: 450, currentTabs: [[0, 0], [2, 5], [5, 12]] }],
  };
  const api = { setChordLength: vi.fn(), setChordTabs: vi.fn(), deleteChord: vi.fn(), setNoteLength: vi.fn(), deleteNote: vi.fn(), shiftChordOctave: vi.fn(), disbandChord: vi.fn() };
  const commits: Array<() => unknown> = [];
  const context: Record<string, any> = {
    selectedNote: snapshot.notes[0], selectedChord: snapshot.chords[0],
    snapshotRef: { current: snapshot },
    useCallback: (fn: unknown) => fn,
    noteMenuDraft: { length: "0.0292", fret: "3" }, chordMenuDraft: { length: "0.5" }, chordNoteMenuDraft: { length: "0.5", fret: "5" }, chordNoteMenuIndex: 1,
    allowBackend: true, maxFret: 24, editorId: "test", snapToGridEnabled: false,
    parseLengthSecondsToFrames: (value: string) => Number(value) > 0 ? Math.round(Number(value) * 240) : null,
    clampEventLength: (value: number) => Math.max(1, Math.min(999999, value)),
    snapLengthToGrid: (value: number) => value,
    resolveChordId: (id: number) => id, resolveNoteId: (id: number) => id,
    gteApi: api, setError: vi.fn(),
    enqueueOptimisticMutation: (operation: any) => { operation.apply(snapshot); commits.push(operation.commit); },
    runMutation: (commit: () => unknown, options: any) => { options.localApply(snapshot); commits.push(commit); },
    setChordTabsInSnapshot: (draft: typeof snapshot, id: number, tabs: number[][]) => { draft.chords.find((chord) => chord.id === id)!.currentTabs = tabs; },
    setSelectedNoteIds: vi.fn(), setSelectedChordIds: vi.fn(), setChordMenuAnchor: vi.fn(), setChordMenuChordId: vi.fn(), setChordMenuDraft: vi.fn(),
    setChordNoteMenuIndex: vi.fn(), setChordNoteMenuAnchor: vi.fn(), setChordNoteMenuDraft: vi.fn(), exitChordEdit: vi.fn(),
    removeChordFromSnapshot: (draft: typeof snapshot, id: number) => { draft.chords = draft.chords.filter((chord) => chord.id !== id); },
  };
  return { snapshot, api, commits, context };
}

describe("existing inspector mutation contracts", () => {
  it("transposes only the selected chord through its established mutation path", () => {
    const h = actionHarness();
    h.context.transposeInspectorFrets = transposeInspectorFrets;
    const transpose = realAction("handleTransposeChordFrets", h.context);
    expect(transpose(1)).toBe(true);
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 1], [2, 6], [5, 13]]);
    expect(h.snapshot.chords[0].length).toBe(120);
    expect(h.snapshot.notes[0].tab).toEqual([0, 3]);
    h.commits[0]();
    expect(h.api.setChordTabs).toHaveBeenCalledWith("test", 2, [[0, 1], [2, 6], [5, 13]]);
    expect(transpose(-2)).toBe(false);
    expect(h.commits).toHaveLength(1);
  });
  it("wires the primary chord fraction selector to the existing duration action", () => {
    const h = actionHarness();
    let changeHandler: string | undefined;
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(workspaceAst) === "MusicalDurationField" && node.getText(workspaceAst).includes('label={t("Chord duration")}')) {
        const change = node.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.getText(workspaceAst) === "onChange") as ts.JsxAttribute;
        changeHandler = (change.initializer as ts.JsxExpression).expression!.getText(workspaceAst);
      }
      ts.forEachChild(node, visit);
    }
    visit(workspaceAst);
    expect(changeHandler).toBeDefined();
    const context = {
      commitChordMenuLength: realAction("commitChordMenuLength", h.context),
      noteFractionDenominatorToFrames: realAction("noteFractionDenominatorToFrames", { ...h.context, framesPerMeasure: 480, timeSignature: 4, timeSignatureBottom: 4 }),
      formatLengthFramesAsSeconds: (frames: number) => String(frames / 240),
    };
    const change = vm.runInNewContext(ts.transpileModule(`(${changeHandler})`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
    change("16");
    expect(h.snapshot.chords[0].length).toBe(30);
    h.commits[0]();
    expect(h.api.setChordLength).toHaveBeenCalledWith("test", 2, 30, false);
  });
  it("commits a short standalone note duration using the established timing action", () => {
    const h = actionHarness();
    h.context.commitNoteMenuLengthValue = realAction("commitNoteMenuLengthValue", h.context);
    realAction("commitNoteMenuLength", h.context)("0.0125");
    expect(h.snapshot.notes[0].length).toBe(3);
    expect(h.snapshot.chords[0].length).toBe(120);
    h.commits[0]();
    expect(h.api.setNoteLength).toHaveBeenCalledWith("test", 1, 3, false);
  });
  it("changes only a chord's shared duration and retains overlapping independent notes", () => {
    const h = actionHarness();
    realAction("commitChordMenuLength", h.context)("0.0625");
    expect(h.snapshot.chords[0].length).toBe(15);
    expect(h.snapshot.chords[0].startTime).toBe(450);
    expect(h.snapshot.notes[0].length).toBe(7);
    h.commits[0]();
    expect(h.api.setChordLength).toHaveBeenCalledWith("test", 2, 15, false);
  });
  it("rejects an invalid duration without touching the snapshot", () => {
    const h = actionHarness();
    realAction("commitChordMenuLength", h.context)("-1");
    expect(h.snapshot.chords[0].length).toBe(120);
    expect(h.commits).toHaveLength(0);
    expect(h.context.setError).toHaveBeenCalled();
  });
  it("edits only the selected chord member's fret, preserving grouping and timing", () => {
    const h = actionHarness();
    realAction("commitChordNoteFret", h.context)("7");
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 0], [2, 7], [5, 12]]);
    expect(h.snapshot.chords[0].length).toBe(120);
    h.commits[0]();
    expect(h.api.setChordTabs).toHaveBeenCalledWith("test", 2, [[0, 0], [2, 7], [5, 12]]);
  });
  it("preserves newer edits to other members when the rendered selection is stale", () => {
    const h = actionHarness();
    h.context.selectedChord = structuredClone(h.snapshot.chords[0]);
    h.snapshot.chords[0].currentTabs[0][1] = 4;
    realAction("commitChordNoteFret", h.context)("8");
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 4], [2, 8], [5, 12]]);
  });
  it.each([1, -1])("scopes keyboard fret shortcuts to the chosen member (%s)", (delta) => {
    const h = actionHarness();
    let branch: string | undefined;
    function visit(node: ts.Node) {
      if (ts.isIfStatement(node) && node.expression.getText(workspaceAst) === "(isPlusKey || isMinusKey) && editingChordId !== null") branch = node.getText(workspaceAst);
      ts.forEachChild(node, visit);
    }
    visit(workspaceAst);
    expect(branch).toBeDefined();
    const context: Record<string, any> = { ...h.context, editingChordId: 2, isPlusKey: delta > 0, isMinusKey: delta < 0, event: { preventDefault: vi.fn() }, commitChordNoteFret: realAction("commitChordNoteFret", h.context) };
    vm.runInNewContext(ts.transpileModule(`(() => { ${branch} })()`, {}).outputText, context);
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 0], [2, 5 + delta], [5, 12]]);
    context.chordNoteMenuIndex = null;
    const count = h.commits.length;
    vm.runInNewContext(ts.transpileModule(`(() => { ${branch} })()`, {}).outputText, context);
    expect(h.commits).toHaveLength(count);
  });
  it("applies alternative fingerings through the existing command and validates range", () => {
    const h = actionHarness();
    h.context.snapshot = h.snapshot;
    h.context.isTabCoordValidForSnapshot = (_snapshot: unknown, tab: number[]) => tab[0] >= 0 && tab[0] < 6 && tab[1] >= 0 && tab[1] <= 24;
    const apply = realAction("handleApplyChordTabs", h.context);
    apply([[0, 2], [3, 4], [5, 0]]);
    h.commits[0]();
    expect(h.api.setChordTabs).toHaveBeenCalledWith("test", 2, [[0, 2], [3, 4], [5, 0]]);
    apply([[6, 90]]);
    expect(h.commits).toHaveLength(1);
    expect(h.context.setError).toHaveBeenCalled();
  });
  it("deletes a member without deleting the other chord notes", () => {
    const h = actionHarness();
    realAction("deleteChordNote", h.context)();
    expect(h.snapshot.chords[0].currentTabs).toEqual([[0, 0], [5, 12]]);
    expect(h.snapshot.notes).toHaveLength(1);
    h.commits[0]();
    expect(h.api.setChordTabs).toHaveBeenCalledOnce();
  });
  it("deletes a whole chord through the optimistic undo/persistence path", () => {
    const h = actionHarness();
    realAction("handleDeleteChord", h.context)();
    expect(h.snapshot.chords).toHaveLength(0);
    expect(h.snapshot.notes).toHaveLength(1);
    h.commits[0]();
    expect(h.api.deleteChord).toHaveBeenCalledWith("test", 2);
  });
  it("deletes only the standalone note through its existing optimistic action", () => {
    const h = actionHarness();
    h.context.removeNoteFromSnapshot = (draft: typeof h.snapshot, id: number) => { draft.notes = draft.notes.filter((note) => note.id !== id); };
    realAction("handleDeleteNote", h.context)();
    expect(h.snapshot.notes).toHaveLength(0);
    expect(h.snapshot.chords).toHaveLength(1);
    h.commits[0]();
    expect(h.api.deleteNote).toHaveBeenCalledWith("test", 1);
  });
  it.each([-1, 1])("uses the existing octave command (%s) without changing duration", (direction) => {
    const h = actionHarness();
    const transform = vi.fn();
    h.context.shiftChordOctaveInSnapshot = transform;
    realAction("handleChordOctaveShift", h.context)(direction);
    expect(transform).toHaveBeenCalledWith(h.snapshot, 2, direction);
    expect(h.snapshot.chords[0].length).toBe(120);
    h.commits[0]();
    expect(h.api.shiftChordOctave).toHaveBeenCalledWith("test", 2, direction);
  });
  it("ungroups through the existing command without clearing individual notes", () => {
    const h = actionHarness();
    h.context.disbandChordInSnapshot = vi.fn();
    realAction("handleDisbandChord", h.context)();
    expect(h.context.disbandChordInSnapshot).toHaveBeenCalledWith(h.snapshot, 2);
    expect(h.snapshot.notes).toHaveLength(1);
    h.commits[0]();
    expect(h.api.disbandChord).toHaveBeenCalledWith("test", 2);
  });
});

describe("inspector keyboard ownership", () => {
  it.each(["Tab", "Enter", " ", "Delete", "Escape", "ArrowUp", "3"])("leaves %s to focused inspector controls", (key) => {
    const blur = vi.fn();
    const handler = realAction("handleKeyDown", { isShortcutTextEntryTarget: () => false, blurFocusedShortcutControl: blur });
    // No canvas dependencies are supplied: reaching a canvas action would throw.
    expect(() => handler({ key, target: { closest: (selector: string) => selector.includes("properties-inspector") ? {} : null } })).not.toThrow();
    expect(blur).not.toHaveBeenCalled();
  });
  it("preserves editor undo while a non-text inspector control has focus", () => {
    const undo = vi.fn();
    const handler = realAction("handleKeyDown", { isShortcutTextEntryTarget: () => false, requestUndo: undo });
    handler({ key: "z", ctrlKey: true, preventDefault: vi.fn(), target: { closest: (selector: string) => selector.includes("properties-inspector") ? {} : null } });
    expect(undo).toHaveBeenCalledOnce();
  });
  it("keeps input undo local instead of undoing the song", () => {
    const undo = vi.fn();
    const handler = realAction("handleKeyDown", { isShortcutTextEntryTarget: () => true, requestUndo: undo });
    handler({ key: "z", ctrlKey: true, target: { closest: (selector: string) => selector.includes("properties-inspector") ? {} : null } });
    expect(undo).not.toHaveBeenCalled();
  });
});
