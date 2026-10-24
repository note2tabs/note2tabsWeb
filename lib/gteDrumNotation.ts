import type { EditorSnapshot } from "../types/gte";
import { getDrumVoiceForNote, type DrumVoiceId } from "./gteDrums";
import { materializeDrumLoopNotes } from "./gteDrumLoops";
import type { ScoreEvent } from "./gteNotation";
import { meterGroups, notationPitch, SCORE_WHOLE, spellInterval, type NotationScore, type ScorePitch, type ScoreToken } from "./gteNotationScore";

// Written staff positions only; source MIDI pitches and timing remain intact.
const positions: Record<DrumVoiceId, { midi: number; head?: string }> = {
  crash: { midi: 81, head: "x" }, ride: { midi: 77, head: "x" },
  closed_hi_hat: { midi: 79, head: "x" }, open_hi_hat: { midi: 79, head: "cx" },
  high_tom: { midi: 76 }, mid_tom: { midi: 74 }, snare: { midi: 72 },
  floor_tom: { midi: 69 }, kick: { midi: 65 },
};
type Region = { id: string; start: number; end: number; unit: number };
type Hit = { source: ScoreEvent; position: typeof positions[DrumVoiceId]; role: 0 | 1; raw: number; tick: number; triplet?: Region };

/** Percussion is onset-based. Sample duration is never a written rhythmic value. */
export function buildDrumNotationScore(snapshot: EditorSnapshot): NotationScore {
  const numerator = snapshot.timeSignature || 4, denominator = snapshot.timeSignatureBottom || 4;
  const framesPerBar = snapshot.framesPerMessure || 480, barTicks = Math.round(SCORE_WHOLE * numerator / denominator);
  const groups = meterGroups(numerator, denominator);
  const beatTicks = SCORE_WHOLE / denominator * (groups.every(value => value === 3) ? 3 : 1);
  const factor = barTicks / framesPerBar, baseGrid = SCORE_WHOLE / 16;
  const hits: Hit[] = materializeDrumLoopNotes(snapshot.notes, snapshot.drumLoops ?? [], snapshot.totalFrames).map(({ note, key }) => {
    const instrument = getDrumVoiceForNote(note), role = instrument.id === "kick" ? 1 : 0;
    return { role, position: positions[instrument.id], raw: Math.max(0, note.startTime * factor), tick: 0,
      source: { key: `drum:${key}`, noteId: note.id, member: 0, midi: instrument.midi, start: note.startTime,
        length: note.length, velocity: 100 / 127, staff: "treble", voice: role === 1 ? 2 : 1 } };
  });
  const byBar = new Map<number, Hit[]>();
  for (const hit of hits) { const bar = Math.floor(hit.raw / barTicks), list = byBar.get(bar) ?? []; list.push(hit); byBar.set(bar, list); }
  for (const [bar, list] of byBar) {
    // Default to sixteenths; refine if distinct repeated hits would collapse.
    let grid = baseGrid;
    for (const candidate of [baseGrid, baseGrid / 2, baseGrid / 4]) {
      grid = candidate;
      const cells = new Map<string, number>(); let collision = false;
      for (const hit of list) {
        const cell = `${hit.source.midi}:${Math.round((hit.raw - bar * barTicks) / grid)}`, previous = cells.get(cell);
        if (previous !== undefined && Math.abs(previous - hit.raw) > baseGrid * 0.15) collision = true;
        cells.set(cell, hit.raw);
      }
      const needsFinerGrid = list.some(hit => {
        const local = hit.raw - bar * barTicks;
        return Math.abs(local - Math.round(local / candidate) * candidate) > candidate * 0.25
          && [baseGrid / 2, baseGrid / 4].some(finer => finer < candidate && Math.abs(local - Math.round(local / finer) * finer) <= 1);
      });
      if (!collision && !needsFinerGrid) break;
    }
    const beats = new Map<number, Hit[]>();
    for (const hit of list) { const beat = Math.floor(hit.raw / beatTicks), members = beats.get(beat) ?? []; members.push(hit); beats.set(beat, members); }
    for (const [beat, members] of beats) {
      const start = beat * beatTicks, unit = beatTicks / 3, tolerance = Math.min(3, unit * 0.1);
      const triplet = denominator === 4 && [0, 1, 2].every(index => members.some(hit => Math.abs(hit.raw - start - index * unit) <= tolerance))
        && members.every(hit => Math.abs((hit.raw - start) / unit - Math.round((hit.raw - start) / unit)) * unit <= tolerance);
      for (const hit of members) {
        hit.tick = Math.max(0, triplet ? start + Math.round((hit.raw - start) / unit) * unit : bar * barTicks + Math.round((hit.raw - bar * barTicks) / grid) * grid);
        const roleHasTriplet = triplet && [0, 1, 2].every(index => members.some(other => other.role === hit.role && Math.abs(other.raw - start - index * unit) <= tolerance));
        if (roleHasTriplet) hit.triplet = { id: `drum-triplet:${beat}`, start, end: start + beatTicks, unit };
      }
    }
  }
  const score: NotationScore = { percussion: true, measures: [], framesPerBar, barTicks, beatTicks, numerator, denominator, key: "C", groups };
  const lastAttack = hits.reduce((last, hit) => Math.max(last, hit.tick + 1), 0);
  const count = Math.max(1, Math.ceil(Math.max(snapshot.totalFrames * factor, lastAttack) / barTicks));
  const attacks = new Map<string, Hit[]>();
  for (const hit of hits) { const key = `${Math.floor(hit.tick / barTicks)}:${hit.role}`, list = attacks.get(key) ?? []; list.push(hit); attacks.set(key, list); }
  for (let bar = 0; bar < count; bar++) {
    const start = bar * barTicks, end = start + barTicks;
    const voices = [0, 1].map(role => {
      const at = new Map<number, Hit[]>();
      for (const hit of attacks.get(`${bar}:${role}`) ?? []) { const group = at.get(hit.tick) ?? []; group.push(hit); at.set(hit.tick, group); }
      const ticks = [...at.keys()].sort((a, b) => a - b), tokens: ScoreToken[] = [];
      const emit = (left: number, right: number, members?: Hit[]) => {
        if (left >= right) return;
        const pitches = new Map<string, ScorePitch>();
        for (const hit of members ?? []) {
          const written = notationPitch(hit.position.midi, "C"); if (hit.position.head) written.key += `/${hit.position.head}`;
          const pitch = pitches.get(written.key) ?? { ...written, sources: [] }; pitch.sources.push(hit.source); pitches.set(written.key, pitch);
        }
        const region = members?.find(hit => hit.triplet)?.triplet;
        for (const part of spellInterval(left, right, !members, score, region)) {
          tokens.push({ ...part, id: `drum:${bar}:${role}:${part.tick}`, staff: "treble", voice: role,
            rest: !members, measureRest: false, hidden: false, pitches: [...pitches.values()].sort((a,b) => a.midi - b.midi),
            sources: members?.map(hit => hit.source) ?? [], tieIn: false, tieOut: false,
            tuplet: region ? `${region.id}:${role}` : undefined });
        }
      };
      if (!ticks.length) return [{ id: `drum:${bar}:${role}:rest`, staff: "treble" as const, voice: role, tick: start, ticks: barTicks,
        denominator: 1, dotted: false, rest: true, measureRest: true, hidden: role === 1, pitches: [], sources: [], tieIn: false, tieOut: false }];
      let cursor = start;
      ticks.forEach((tick, index) => {
        emit(cursor, tick);
        // Extend to the next hit in this beat, never to the sample's note-off.
        const boundary = Math.min(end, (Math.floor(tick / beatTicks) + 1) * beatTicks, ticks[index + 1] ?? end);
        emit(tick, boundary, at.get(tick)); cursor = boundary;
      });
      emit(cursor, end); return tokens;
    });
    if (voices[0].every(token => token.rest) && voices[1].some(token => !token.rest)) voices[0].forEach(token => { token.hidden = true; });
    score.measures.push({ index: bar, voices: { treble: voices, bass: [] } });
  }
  return score;
}
