import {
  Accidental, Beam, Curve, Dot, Formatter, Fraction, GhostNote, Stave, StaveConnector, StaveNote, StaveTie, Stem, Tuplet, Voice,
  type RenderContext, type StemmableNote,
} from "vexflow/bravura";
import { notationKeyAlteration, SCORE_WHOLE, type NotationScore, type ScoreMeasure, type ScoreStaff, type ScoreToken } from "./gteNotationScore";
import { validNotationTie, type ScoreEvent } from "./gteNotation";

export type ScoreBox = { x: number; y: number; width: number; height: number };
export type EngravedHit = { token: ScoreToken; box: ScoreBox; heads: Array<{ x: number; y: number; midi: number }>; x: number };
export type EngravedMeasure = {
  index: number; x: number; width: number; top: number; bottom: number;
  staffBottom: Record<ScoreStaff, number>; startX: number; endX: number; columns: Array<{ tick: number; x: number }>;
};
export type EngravedLayout = { width: number; height: number; hits: EngravedHit[]; measures: EngravedMeasure[]; beamCount: number; tupletCount: number; tieCount: number };
type Built = ReturnType<typeof buildMeasure>;

function buildMeasure(model: ScoreMeasure, score: NotationScore, first: boolean) {
  const staves = { treble: new Stave(0, 20, 500), bass: new Stave(0, 140, 500) };
  if (first) for (const staff of ["treble", "bass"] as const) staves[staff].addClef(staff).addKeySignature(score.key).addTimeSignature(score.numerator + "/" + score.denominator);
  const records: Array<{ token: ScoreToken; note: StemmableNote }> = [], voices: Voice[] = [], beams: Beam[] = [], tuplets: Tuplet[] = [];
  const formatter = new Formatter();
  for (const staff of ["treble", "bass"] as const) {
    const bothVoices = model.voices[staff].every((voice) => voice.some((token) => !token.rest));
    const staffVoices = model.voices[staff].map((tokens, voiceIndex) => {
      const tupletNotes = new Map<string, StemmableNote[]>();
      const notes = tokens.map((token) => {
        const structure = { duration: String(token.denominator) + (token.rest ? "r" : ""), dots: token.dotted ? 1 : 0,
          durationOverride: token.tuplet ? undefined : new Fraction(token.ticks, SCORE_WHOLE) };
        const note = token.hidden ? new GhostNote(structure) : new StaveNote({
          ...structure, clef: staff, keys: token.rest ? [staff === "bass" ? "d/3" : "b/4"] : token.pitches.map((pitch) => pitch.key),
          alignCenter: token.measureRest,
          autoStem: !bothVoices,
          stemDirection: bothVoices ? voiceIndex % 2 === 0 ? Stem.UP : Stem.DOWN : undefined,
        });
        note.setStave(staves[staff]);
        if (token.dotted && !token.hidden) Dot.buildAndAttach([note], { all: true });
        if (token.tuplet) { const group = tupletNotes.get(token.tuplet) ?? []; group.push(note); tupletNotes.set(token.tuplet, group); }
        records.push({ token, note });
        return note;
      });
      tupletNotes.forEach((group) => { tuplets.push(new Tuplet(group, { numNotes: 3, notesOccupied: 2, location: voiceIndex % 2 ? -1 : 1 })); });
      const voice = new Voice({ numBeats: score.numerator, beatValue: score.denominator }).addTickables(notes);
      beams.push(...Beam.generateBeams(notes, {
        groups: score.groups.map((value) => new Fraction(value, score.denominator)),
        maintainStemDirections: bothVoices,
        beamRests: false,
      }));
      return voice;
    });
    Accidental.applyAccidentals(staffVoices, score.key);
    formatter.joinVoices(staffVoices);
    voices.push(...staffVoices);
  }
  const minNotes = formatter.preCalculateMinTotalWidth(voices);
  const start = Math.max(staves.treble.getNoteStartX(), staves.bass.getNoteStartX());
  const minWidth = Math.ceil(minNotes + start + 28);
  return { model, staves, records, voices, beams, tuplets, formatter, minWidth, start };
}

/** Pack by measured engraving widths. Sparse measures have a bounded expansion budget. */
export function distributeNotationMeasures(minima: number[], available: number, maxBars = Infinity) {
  const systems: Array<Array<{ index: number; width: number }>> = [];
  let index = 0;
  while (index < minima.length) {
    const system: Array<{ index: number; width: number }> = [];
    let used = 0;
    while (index < minima.length && system.length < maxBars) {
      const width = minima[index] + (system.length === 0 ? 90 : 0);
      if (system.length && used + width > available) break;
      system.push({ index, width }); used += width; index++;
    }
    const budget = Math.max(0, available - used), weight = system.reduce((sum, item) => sum + minima[item.index], 0);
    // Justify complete systems to the page. Don't stretch a short final system
    // into a whole page of empty space.
    system.forEach((item) => {
      const share = budget * minima[item.index] / Math.max(1, weight);
      item.width += maxBars === Infinity && index < minima.length ? share : Math.min(minima[item.index] * 0.5, share);
    });
    systems.push(system);
  }
  return systems;
}

export function prepareNotationEngraving(score: NotationScore, viewportWidth: number, maxBars = Infinity) {
  const models = score.measures.map((measure) => buildMeasure(measure, score, false));
  // Reserve space for the brace as well as the staff, including on narrow views.
  const leftInset = 40;
  const automatic = maxBars === Infinity;
  // Minimum engraving widths avoid collisions, but are too tight for comfortable
  // reading. Leave rhythmic breathing room before choosing the system breaks.
  const systems = distributeNotationMeasures(models.map((measure) => automatic ? Math.max(112, measure.minWidth * 1.35) : Math.max(72, measure.minWidth)), Math.max(1, viewportWidth - leftInset - 16), Math.max(1, maxBars));
  const layout: EngravedLayout = { width: viewportWidth, height: 0, hits: [], measures: [], beamCount: 0, tupletCount: 0, tieCount: 0 };
  const built: Built[] = [];
  let systemY = 12;
  systems.forEach((system) => {
    const pitches = system.flatMap((item) => score.measures[item.index].voices.treble.flatMap((voice) => voice.flatMap((token) => token.pitches)));
    const bassPitches = system.flatMap((item) => score.measures[item.index].voices.bass.flatMap((voice) => voice.flatMap((token) => token.pitches)));
    const topStep = Math.max(45, ...pitches.map((pitch) => pitch.step)), lowStep = Math.min(35, ...pitches.map((pitch) => pitch.step));
    const bassHigh = Math.max(33, ...bassPitches.map((pitch) => pitch.step));
    const trebleY = systemY + Math.max(24, (topStep - 45) * 5 + 24);
    const bassY = trebleY + Math.max(110, (37 - lowStep) * 5 + (bassHigh - 25) * 5 + 65);
    let x = leftInset, bottom = bassY + 100;
    system.forEach((item, position) => {
      const measure = position === 0 ? buildMeasure(score.measures[item.index], score, true) : models[item.index];
      // The actual prefix width is known from the clef, key and time signature metrics.
      const width = Math.max(item.width, measure.minWidth);
      for (const staff of ["treble", "bass"] as const) measure.staves[staff].setX(x).setY(staff === "treble" ? trebleY : bassY).setWidth(width);
      const startX = Math.max(measure.staves.treble.getNoteStartX(), measure.staves.bass.getNoteStartX());
      const endX = Math.min(measure.staves.treble.getNoteEndX(), measure.staves.bass.getNoteEndX());
      for (const staff of ["treble", "bass"] as const) measure.staves[staff].setNoteStartX(startX);
      measure.records.forEach(({ token, note }) => note.setStave(measure.staves[token.staff]));
      measure.formatter.format(measure.voices, Math.max(1, endX - startX - 12), { alignRests: false });
      measure.beams.forEach((beam) => beam.postFormat());
      // Formatter only separates simultaneous tick contexts. A rest in one
      // voice can also collide with a held note from another tick context.
      const visible = measure.records.filter(({ token, note }) => !token.hidden && note instanceof StaveNote);
      visible.forEach(({ token, note }) => {
        if (token.rest && note instanceof StaveNote && measure.model.voices[token.staff][1]?.some((item) => !item.hidden)) {
          note.setKeyLine(0, token.voice === 0 ? 4.5 : 1.5);
        }
      });
      visible.forEach(({ note }) => {
        if (note instanceof StaveNote) note.noteHeads.forEach((head) => head.setX(note.getNoteHeadBeginX()));
      });
      visible.forEach(({ token, note }) => {
        if (!token.rest || !(note instanceof StaveNote)) return;
        const obstacles = visible.filter((other) => !other.token.rest && other.token.staff === token.staff);
        for (let attempt = 0; attempt < 16; attempt++) {
          // Modifier bounds (especially a dot) retain their pre-draw origin.
          // Use the movable rest glyph itself, not their union, to avoid
          // repeatedly shifting a dotted rest far outside its staff.
          const box = note.noteHeads[0].getBoundingBox();
          const collision = obstacles.some(({ note: other }) => other instanceof StaveNote && other.noteHeads.some((head, index) =>
            box.getX() < head.getAbsoluteX() + head.getWidth() + 3 && box.getX() + box.getW() > head.getAbsoluteX() - 3 &&
            box.getY() < other.getYs()[index] + 7 && box.getY() + box.getH() > other.getYs()[index] - 7));
          if (!collision) break;
          note.setKeyLine(0, note.getKeyProps()[0].line + (note.getStemDirection() === Stem.DOWN ? -1 : 1));
          note.noteHeads.forEach((head) => head.setX(note.getNoteHeadBeginX()));
        }
      });
      const columns = new Map<number, number>();
      measure.records.forEach(({ token, note }) => {
        const nx = note.getAbsoluteX();
        if (!token.measureRest) columns.set(token.tick, Math.max(columns.get(token.tick) ?? -Infinity, nx));
        if (note instanceof StaveNote && !token.hidden) {
          // VexFlow normally initializes these only during draw(). Hit testing and
          // bounds are needed before drawing, so seed the same final head origin.
          note.noteHeads.forEach((head) => head.setX(note.getNoteHeadBeginX()));
          const box = note.getBoundingBox();
          bottom = Math.max(bottom, box.getY() + box.getH() + 24);
          if (!token.rest) layout.hits.push({ token, x: nx, box: { x: box.getX(), y: box.getY(), width: box.getW(), height: box.getH() },
            heads: note.noteHeads.map((head, index) => ({ x: head.getAbsoluteX(), y: note.getYs()[index], midi: token.pitches[index].midi })) });
        }
      });
      if (!columns.has(item.index * score.barTicks)) columns.set(item.index * score.barTicks, startX + 10);
      columns.set((item.index + 1) * score.barTicks, endX - 8);
      layout.measures.push({ index: item.index, x, width, top: trebleY + 22, bottom: bassY + 90, startX, endX,
        staffBottom: { treble: measure.staves.treble.getYForLine(4), bass: measure.staves.bass.getYForLine(4) },
        columns: [...columns].map(([tick, x]) => ({ tick, x })).sort((a, b) => a.tick - b.tick) });
      built.push(measure);
      layout.beamCount += measure.beams.length; layout.tupletCount += measure.tuplets.length;
      x += width;
    });
    layout.width = Math.max(layout.width, x + 16);
    systemY = bottom + 34;
  });
  layout.height = systemY;
  const draw = (context: RenderContext) => {
    context.setFillStyle("#263c32").setStrokeStyle("#263c32");
    type Endpoint = { note: StaveNote; index: number; end: number; source: ScoreEvent; systemY: number };
    const lastBySource = new Map<string, Endpoint>(), firstBySource = new Map<string, Endpoint>();
    built.forEach((measure) => {
      measure.staves.treble.setContext(context).draw(); measure.staves.bass.setContext(context).draw();
      new StaveConnector(measure.staves.treble, measure.staves.bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
      if (measure.staves.treble.getX() === leftInset) new StaveConnector(measure.staves.treble, measure.staves.bass).setType(StaveConnector.type.BRACE).setContext(context).draw();
      measure.voices.forEach((voice) => voice.draw(context));
      measure.beams.forEach((beam) => beam.setContext(context).draw());
      measure.tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
      measure.records.forEach(({ token, note }) => {
        if (!(note instanceof StaveNote) || token.rest) return;
        token.pitches.forEach((pitch, index) => pitch.sources.forEach((source) => {
          const previous = lastBySource.get(source.key);
          if (previous && previous.end === token.tick) {
            if (previous.note.getStave()?.getY() === note.getStave()?.getY()) new StaveTie({ firstNote: previous.note, lastNote: note, firstIndexes: [previous.index], lastIndexes: [index] }).setContext(context).draw();
            else {
              new StaveTie({ firstNote: previous.note, firstIndexes: [previous.index], lastIndexes: [index] }).setContext(context).draw();
              new StaveTie({ lastNote: note, firstIndexes: [previous.index], lastIndexes: [index] }).setContext(context).draw();
            }
            layout.tieCount++;
          }
          const endpoint = { note, index, end: token.tick + token.ticks, source, systemY: measure.staves.treble.getY() };
          lastBySource.set(source.key, endpoint);
          if (!firstBySource.has(source.key)) firstBySource.set(source.key, endpoint);
        }));
      });
    });
    for (const kind of ["ties", "slurs"] as const) for (const link of score.connections?.[kind] ?? []) {
      const from = lastBySource.get(link.from), to = firstBySource.get(link.to);
      if (!from || !to || (kind === "ties" && !validNotationTie(from.source, to.source)) || from.source.start >= to.source.start) continue;
      const sameSystem = from.systemY === to.systemY;
      if (kind === "ties") {
        const indexes = { firstIndexes: [from.index], lastIndexes: [to.index] };
        if (sameSystem) new StaveTie({ firstNote: from.note, lastNote: to.note, ...indexes }).setContext(context).draw();
        else {
          new StaveTie({ firstNote: from.note, ...indexes }).setContext(context).draw();
          new StaveTie({ lastNote: to.note, ...indexes }).setContext(context).draw();
        }
        layout.tieCount++;
      } else if (sameSystem) new Curve(from.note, to.note, { openingDirection: "down", position: Curve.Position.NEAR_TOP, positionEnd: Curve.Position.NEAR_TOP, cps: [{ x: 0, y: 14 }, { x: 0, y: 14 }] }).setContext(context).draw();
      else {
        new Curve(from.note, undefined, {}).setContext(context).draw();
        new Curve(undefined, to.note, {}).setContext(context).draw();
      }
    }
  };
  return { layout, draw, built };
}

export function engravingXAt(layout: EngravedLayout, score: NotationScore, frame: number) {
  const tick = frame / score.framesPerBar * score.barTicks;
  const measure = layout.measures[Math.floor(tick / score.barTicks)];
  if (!measure) return null;
  const right = measure.columns.find((column) => column.tick >= tick), left = [...measure.columns].reverse().find((column) => column.tick <= tick);
  if (!left || !right) return { measure, x: measure.startX + 10 };
  const ratio = right.tick === left.tick ? 0 : (tick - left.tick) / (right.tick - left.tick);
  return { measure, x: left.x + ratio * (right.x - left.x) };
}

export function engravingPoint(layout: EngravedLayout, score: NotationScore, x: number, y: number, stepFrames: number, snap = true) {
  const measure = layout.measures.find((item) => x >= item.x && x < item.x + item.width && y >= item.top - 30 && y <= item.bottom + 20);
  if (!measure || x < measure.startX || x > measure.endX) return null;
  const columns = measure.columns, right = columns.find((column) => column.x >= x) ?? columns[columns.length - 1], left = [...columns].reverse().find((column) => column.x <= x) ?? columns[0];
  const ratio = right.x === left.x ? 0 : Math.max(0, Math.min(1, (x - left.x) / (right.x - left.x)));
  let frame = (left.tick + ratio * (right.tick - left.tick)) / score.barTicks * score.framesPerBar;
  const barStart = measure.index * score.framesPerBar, step = Math.max(1, stepFrames);
  frame = snap ? barStart + Math.max(0, Math.min(Math.floor((score.framesPerBar - 1) / step) * step, Math.round((frame - barStart) / step) * step)) : Math.round(Math.max(barStart, Math.min(barStart + score.framesPerBar - 1, frame)));
  const staff: ScoreStaff = Math.abs(y - (measure.staffBottom.bass - 20)) < Math.abs(y - (measure.staffBottom.treble - 20)) ? "bass" : "treble";
  const pitchStep = (staff === "bass" ? 25 : 37) + Math.round((measure.staffBottom[staff] - y) / 5);
  const naturals = [0, 2, 4, 5, 7, 9, 11], safe = Math.max(0, Math.min(74, pitchStep));
  const midi = Math.max(0, Math.min(127, Math.floor(safe / 7) * 12 + naturals[safe % 7] + notationKeyAlteration("cdefgab"[safe % 7], score.key)));
  return { frame, midi, staff, measure };
}
