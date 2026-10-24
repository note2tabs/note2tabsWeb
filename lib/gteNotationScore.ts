import type { EditorSnapshot } from "../types/gte";
import { scoreEvents, type ScoreEvent } from "./gteNotation";

export const SCORE_WHOLE = 384;
export type ScoreStaff = "treble" | "bass";
export type ScorePitch = { midi: number; key: string; step: number; sources: ScoreEvent[] };
export type ScoreToken = {
  id: string; staff: ScoreStaff; voice: number; tick: number; ticks: number;
  denominator: number; dotted: boolean; rest: boolean; measureRest: boolean; hidden: boolean;
  pitches: ScorePitch[]; sources: ScoreEvent[]; tieIn: boolean; tieOut: boolean;
  tuplet?: string; beamGroup?: string;
};
export type ScoreMeasure = { index: number; voices: Record<ScoreStaff, ScoreToken[][]> };
export type NotationScore = {
  percussion?: boolean;
  connections?: { ties: Array<{ from: string; to: string }>; slurs: Array<{ from: string; to: string }> };
  measures: ScoreMeasure[]; framesPerBar: number; barTicks: number; beatTicks: number;
  numerator: number; denominator: number; key: string; groups: number[];
};
type TripletRegion = { id: string; start: number; end: number; unit: number };
type Group = { start: number; end: number; staff: ScoreStaff; events: ScoreEvent[]; region?: TripletRegion; tieIn?: boolean; tieOut?: boolean };

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"]);
const KEY_COUNTS: Record<string, number> = { C: 0, Am: 0, G: 1, Em: 1, D: 2, Bm: 2, A: 3, "F#m": 3, E: 4, "C#m": 4, B: 5, "G#m": 5, "F#": 6, "D#m": 6, F: -1, Dm: -1, Bb: -2, Gm: -2, Eb: -3, Cm: -3, Ab: -4, Fm: -4, Db: -5, Bbm: -5, Gb: -6, Ebm: -6 };
export function notationKeyAlteration(letter: string, key: string) {
  const count = key === "Cb" || key === "Abm" ? -7 : KEY_COUNTS[key] ?? 0;
  return (count >= 0 ? "fcgdaeb" : "beadgcf").slice(0, Math.abs(count)).includes(letter.toLowerCase()) ? Math.sign(count) : 0;
}
const SHARPS = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLATS = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

export function notationKey(base = 0, type = 0) {
  const root = ((Math.round(base) % 12) + 12) % 12;
  if ([1, 2, 3, 9].includes(type)) return MINOR_KEYS[root];
  const relative = type === 4 ? 10 : type === 5 ? 8 : type === 6 ? 7 : type === 7 ? 5 : 0;
  return MAJOR_KEYS[(root + relative) % 12];
}
export function notationPitch(midi: number, key: string): Omit<ScorePitch, "sources"> {
  const pitch = Math.max(0, Math.min(127, Math.round(midi))), octave = Math.floor(pitch / 12) - 1;
  const naturals = [0, 2, 4, 5, 7, 9, 11], letters = "cdefgab";
  // Prefer a diatonic spelling in this signature (including E# and Cb),
  // before falling back to a chromatic sharp/flat spelling.
  const diatonic = naturals.findIndex((value, index) => ((value + notationKeyAlteration(letters[index], key) + 12) % 12) === pitch % 12);
  if (diatonic >= 0) {
    const alteration = notationKeyAlteration(letters[diatonic], key);
    const writtenOctave = (pitch - naturals[diatonic] - alteration) / 12 - 1;
    return { midi: pitch, key: letters[diatonic] + (alteration > 0 ? "#" : alteration < 0 ? "b" : "") + "/" + writtenOctave, step: (writtenOctave + 1) * 7 + diatonic };
  }
  const name = (FLAT_KEYS.has(key) ? FLATS : SHARPS)[pitch % 12];
  return { midi: pitch, key: name + "/" + octave, step: (octave + 1) * 7 + letters.indexOf(name[0]) };
}
export function meterGroups(numerator: number, denominator: number) {
  if (denominator === 8 && numerator >= 6 && numerator % 3 === 0) return Array(numerator / 3).fill(3) as number[];
  if (denominator === 8 && numerator > 3 && numerator % 2) return [...Array(Math.floor((numerator - 3) / 2)).fill(2), 3] as number[];
  return Array(numerator).fill(1) as number[];
}

/** Detect complete three-way rhythmic patterns, not arbitrary off-grid individual notes. */
function detectTriplets(events: ScoreEvent[], factor: number, barTicks: number) {
  const regions: TripletRegion[] = [];
  const starts = [...new Set(events.map((event) => event.start * factor))].sort((a, b) => a - b);
  for (const span of [192, 96, 48]) {
    const step = span / 3, seen = new Set<number>();
    starts.forEach((onset) => {
      const start = Math.floor((onset + span * 0.04) / span) * span;
      if (seen.has(start) || Math.floor(start / barTicks) !== Math.floor((start + span - 0.01) / barTicks)) return;
      seen.add(start);
      const points = [start, start + step, start + step * 2];
      if (!points.every((point) => starts.some((value) => Math.abs(value - point) < step * 0.12))) return;
      const matching = events.filter((event) => points.some((point) => Math.abs(event.start * factor - point) < step * 0.12) && Math.abs(event.length * factor - step) < step * 0.2);
      if (matching.length < 3 || regions.some((region) => region.start < start + span && region.end > start)) return;
      regions.push({ id: "triplet:" + start + ":" + span, start, end: start + span, unit: step });
    });
  }
  return regions;
}

const BINARY_VALUES = [1, 2, 4, 8, 16, 32, 64, 128].flatMap((denominator) => [
  { denominator, dotted: true, ticks: SCORE_WHOLE / denominator * 1.5 },
  { denominator, dotted: false, ticks: SCORE_WHOLE / denominator },
]).sort((a, b) => b.ticks - a.ticks);

function quantizeEvents(events: ScoreEvent[], factor: number, barTicks: number): Group[] {
  const regions = detectTriplets(events, factor, barTicks);
  const groups = new Map<string, Group>();
  events.forEach((event) => {
    const rawStart = Math.max(0, event.start * factor), rawLength = event.length * factor;
    const region = regions.find((candidate) => rawStart >= candidate.start - 2 && rawStart < candidate.end - 2 && Math.abs(rawLength - candidate.unit) < candidate.unit * 0.2);
    const grid = region ? region.unit : rawLength <= 9 ? 6 : 12;
    const start = Math.max(0, region ? region.start + Math.round((rawStart - region.start) / grid) * grid : Math.round(rawStart / grid) * grid);
    const nearest = BINARY_VALUES.reduce((a, b) => Math.abs(a.ticks - rawLength) < Math.abs(b.ticks - rawLength) ? a : b);
    const length = region ? region.unit : Math.abs(nearest.ticks - rawLength) <= Math.max(3, nearest.ticks * 0.06)
      ? nearest.ticks : Math.max(6, Math.round(rawLength / grid) * grid);
    const end = start + length, groupKey = event.staff + ":" + start + ":" + end;
    const group = groups.get(groupKey) ?? { start, end, staff: event.staff, events: [], region };
    group.events.push(event); groups.set(groupKey, group);
  });
  return [...groups.values()].sort((a, b) => a.start - b.start || b.end - a.end);
}

/** A manually assigned voice is never repartitioned by pitch or overlap.
 * Split changing pitch sets into tied chord fragments instead, preserving every
 * source onset and release in the independent performance model. */
function voiceIntervals(groups: Group[]) {
  const boundaries = [...new Set(groups.flatMap((group) => [group.start, group.end]))].sort((a, b) => a - b);
  const starts = new Map<number, number[]>(), ends = new Map<number, number[]>();
  groups.forEach((group, index) => {
    const begin = starts.get(group.start) ?? []; begin.push(index); starts.set(group.start, begin);
    const finish = ends.get(group.end) ?? []; finish.push(index); ends.set(group.end, finish);
  });
  const sounding = new Set<number>();
  return boundaries.slice(0, -1).flatMap((start, index) => {
    for (const id of ends.get(start) ?? []) sounding.delete(id);
    for (const id of starts.get(start) ?? []) sounding.add(id);
    const end = boundaries[index + 1], active = [...sounding].sort((a,b) => a-b).map(id => groups[id]);
    return active.length ? [{ start, end, staff: active[0].staff, events: active.flatMap((group) => group.events), region: active.find((group) => group.region)?.region,
      tieIn: active.some((group) => group.start < start), tieOut: active.some((group) => group.end > end) }] : [];
  });
}

/** Spell each interval on a shared integer rhythmic lattice. No source note is modified. */
export function spellInterval(start: number, end: number, rest: boolean, score: NotationScore, region?: TripletRegion) {
  const result: Array<{ tick: number; ticks: number; denominator: number; dotted: boolean }> = [];
  const beat = score.beatTicks;
  while (start < end) {
    const local = start % score.barTicks;
    let boundary = end;
    if (!region) {
      if (local % beat !== 0) boundary = Math.min(boundary, start + beat - local % beat);
      // Do not obscure a strong half-bar boundary with a syncopated long value.
      if (score.numerator === 4 && score.denominator === 4 && local % 192 !== 0) boundary = Math.min(boundary, start + 192 - local % 192);
      if (rest && score.groups.every((value) => value === 1)) boundary = Math.min(boundary, local % 192 === 0 ? start + 192 : start + beat);
    }
    const values = BINARY_VALUES.map((value) => ({ ...value, ticks: region ? value.ticks * 2 / 3 : value.ticks }))
      .filter((value) => Number.isInteger(value.ticks) && (!rest || region || score.groups.some((value) => value === 3) || !value.dotted));
    const value = values.find((candidate) => candidate.ticks <= boundary - start) ?? values[values.length - 1];
    const ticks = Math.min(value.ticks, end - start);
    if (ticks <= 0) throw new Error("Invalid notation interval");
    result.push({ tick: start, ticks, denominator: value.denominator, dotted: value.dotted });
    start += ticks;
  }
  return result;
}

export function buildNotationScore(snapshot: EditorSnapshot, options: { keyBase?: number; keyType?: number; timelineEnd?: number } = {}): NotationScore {
  const numerator = snapshot.timeSignature || 4, denominator = snapshot.timeSignatureBottom || 4;
  const framesPerBar = snapshot.framesPerMessure || 480, barTicks = Math.round(SCORE_WHOLE * numerator / denominator);
  const groups = meterGroups(numerator, denominator);
  const score: NotationScore = { measures: [], framesPerBar, barTicks, numerator, denominator, key: notationKey(options.keyBase, options.keyType),
    beatTicks: SCORE_WHOLE / denominator * (groups.every((value) => value === 3) ? 3 : 1), groups };
  const events = scoreEvents(snapshot), factor = barTicks / framesPerBar;
  score.connections = { ties: snapshot.notation?.ties ?? [], slurs: snapshot.notation?.slurs ?? [] };
  const assigned = { treble: [1, 2].map((voice) => voiceIntervals(quantizeEvents(events.filter((event) => event.staff === "treble" && (event.voice ?? 1) === voice), factor, barTicks))),
    bass: [1, 2].map((voice) => voiceIntervals(quantizeEvents(events.filter((event) => event.staff === "bass" && (event.voice ?? 1) === voice), factor, barTicks))) };
  const timeline = Math.max(framesPerBar, snapshot.totalFrames, options.timelineEnd ?? 0);
  const nearestBar = Math.round(timeline / framesPerBar) * framesPerBar;
  const last = Math.abs(timeline - nearestBar) <= framesPerBar / 128 ? nearestBar : timeline;
  const quantizedEnd = Math.max(0, ...Object.values(assigned).flatMap((voices) => voices.flatMap((voice) => voice.map((group) => group.end))));
  const count = Math.max(1, Math.ceil(last / framesPerBar), Math.ceil(quantizedEnd / barTicks));
  for (let bar = 0; bar < count; bar++) {
    const measure: ScoreMeasure = { index: bar, voices: { treble: [], bass: [] } };
    for (const staff of ["treble", "bass"] as const) {
      const voiceGroups = assigned[staff].length ? assigned[staff] : [[]];
      voiceGroups.forEach((voice, voiceIndex) => {
        const start = bar * barTicks, end = start + barTicks;
        const active = voice.filter((group) => group.start < end && group.end > start);
        const tokens: ScoreToken[] = [];
        const emit = (left: number, right: number, group?: Group) => {
          if (right <= left) return;
          const regions = voice.filter((value) => value.region).map((value) => value.region!).filter((region, index, all) => all.findIndex((other) => other.id === region.id) === index && region.start < right && region.end > left);
          const boundaries = [...new Set([left, right, ...regions.flatMap((region) => [Math.max(left, region.start), Math.min(right, region.end)])])].sort((a, b) => a - b);
          boundaries.slice(0, -1).forEach((boundary, index) => {
            const finish = boundaries[index + 1], region = regions.find((value) => boundary >= value.start && finish <= value.end);
            const rhythm = !group && left === start && right === end && !active.length
              ? [{ tick: start, ticks: barTicks, denominator: 1, dotted: false }]
              : spellInterval(boundary, finish, !group, score, region);
            rhythm.forEach((part) => {
              const pitches = new Map<number, ScorePitch>();
              group?.events.forEach((event) => {
                const pitch = pitches.get(event.midi) ?? { ...notationPitch(event.midi, score.key), sources: [] };
                pitch.sources.push(event); pitches.set(event.midi, pitch);
              });
              const measureRest = !group && !active.length;
              const token: ScoreToken = { ...part, id: staff + ":" + voiceIndex + ":" + part.tick, staff, voice: voiceIndex,
                rest: !group, measureRest, hidden: measureRest && voiceIndex > 0, pitches: [...pitches.values()].sort((a, b) => a.midi - b.midi),
                sources: group?.events ?? [], tieIn: Boolean(group && (group.tieIn || part.tick > group.start)), tieOut: Boolean(group && (group.tieOut || part.tick + part.ticks < group.end)),
                tuplet: region && !measureRest ? staff + ":" + voiceIndex + ":" + region.id : undefined };
              if (!token.rest && token.denominator >= 8) token.beamGroup = staff + ":" + voiceIndex + ":" + Math.floor(part.tick / score.beatTicks);
              tokens.push(token);
            });
          });
        };
        let cursor = start;
        active.forEach((group) => { const left = Math.max(start, group.start), right = Math.min(end, group.end); emit(cursor, left); emit(left, right, group); cursor = right; });
        emit(cursor, end);
        // Explicit rests retain their entered value (including dots) where no
        // sounding note occupies the same voice. Other gaps remain implicit.
        for (const rest of snapshot.notation?.rests ?? []) {
          if (rest.staff !== staff || rest.voice !== voiceIndex + 1) continue;
          const restStart = Math.round(rest.start * factor), restEnd = Math.round((rest.start + rest.length) * factor);
          const left = Math.max(start, restStart), right = Math.min(end, restEnd);
          if (left >= right || active.some((group) => group.start < right && group.end > left)) continue;
          const replaced = tokens.filter((token) => token.tick < right && token.tick + token.ticks > left);
          if (!replaced.length || replaced.some((token) => !token.rest)) continue;
          const from = Math.min(...replaced.map((token) => token.tick)), to = Math.max(...replaced.map((token) => token.tick + token.ticks));
          const template = replaced[0];
          const make = (a: number, b: number) => spellInterval(a, b, true, score).map((part) => ({ ...template, ...part, id: template.id + ":" + part.tick, measureRest: false, hidden: false }));
          const explicit = restStart === left && restEnd === right
            ? [{ ...template, id: template.id + ":rest:" + rest.id, tick: left, ticks: right - left, denominator: rest.denominator, dotted: rest.dotted, measureRest: false, hidden: false }]
            : make(left, right);
          const replacement = [...make(from, left), ...explicit, ...make(right, to)];
          tokens.splice(tokens.indexOf(replaced[0]), replaced.length, ...replacement);
        }
        measure.voices[staff].push(tokens);
      });
    }
    score.measures.push(measure);
  }
  return score;
}
