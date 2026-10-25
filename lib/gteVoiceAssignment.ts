/** Deterministic, bounded voice separation. Times are notation ticks, not audio seconds. */
export type VoiceInputNote = { id: string; pitch: number; onset: number; duration: number; existingVoice?: 1 | 2; voiceLocked?: boolean };
export type VoiceAssignmentResult = { assignments: Array<{ noteId: string; voice: 1 | 2 }>; warnings: string[] };
export type VoiceWeights = { melody: number; rhythm: number; overlap: number; crossing: number; switching: number; complexity: number; chordSplit: number; span: number };
export const DEFAULT_VOICE_WEIGHTS: VoiceWeights = { melody: 1.6, rhythm: 0.6, overlap: 9, crossing: 0.8, switching: 1.4, complexity: 0.45, chordSplit: 2, span: 12 };
type Candidate = (1 | 2)[];
type Line = { low: number; high: number; onset: number; end: number; duration: number; spacing?: number };
type Active = { pitch: number; onset: number; end: number; voice: 1 | 2 };
type State = { cost: number; lines: [Line | undefined, Line | undefined]; active: Active[]; parent?: State; candidate?: Candidate; event?: VoiceInputNote[]; order: number };
const bounded = (value: number) => Math.min(1, Math.max(0, value));
export const melodicContinuityCost = (a: number, b: number) => Math.min(Math.abs(a - b), 12) / 12;
export const rhythmicContinuityCost = (a: number, b: number) => bounded(Math.abs(a - b) / Math.max(1, a, b));
export const durationOverlapCost = (a: Pick<VoiceInputNote, "onset" | "duration">, b: Pick<VoiceInputNote, "onset" | "duration">) =>
  a.onset === b.onset ? 0 : bounded((Math.min(a.onset + a.duration, b.onset + b.duration) - Math.max(a.onset, b.onset)) / Math.max(1, Math.min(a.duration, b.duration)));
export const voiceCrossingCost = (upper: number, lower: number) => bounded((lower - upper) / 12);
export const voiceSwitchingCost = (ownDistance: number, otherDistance: number) => bounded((ownDistance - otherDistance) / 12);
export const voiceComplexityCost = (candidate: Candidate) => candidate.includes(2) ? 1 : 0;
export function chordSplitCost(notes: VoiceInputNote[], candidate: Candidate) {
  const durations = new Map<number, Set<number>>();
  notes.forEach((note, index) => { const voices = durations.get(note.duration) ?? new Set(); voices.add(candidate[index]); durations.set(note.duration, voices); });
  return [...durations.values()].filter(voices => voices.size > 1).length / Math.max(1, durations.size);
}

/** Contiguous pitch partitions, their crossing variants, and duration-layer partitions.
 * Locks are applied to every candidate, so even dense locked/interleaved chords survive. */
export function generateVoiceCandidates(notes: VoiceInputNote[], cap = 16): Candidate[] {
  const result: Candidate[] = [], seen = new Set<string>();
  const add = (voices: Candidate) => {
    const locked = voices.map((voice, i) => notes[i].voiceLocked && notes[i].existingVoice ? notes[i].existingVoice! : voice);
    const key = locked.join("");
    if (!seen.has(key)) { seen.add(key); result.push(locked); }
  };
  add(notes.map(() => 1)); add(notes.map(() => 2));
  const durations = [...new Set(notes.map(note => note.duration))].sort((a, b) => b - a);
  for (const duration of durations) { add(notes.map(note => note.duration === duration ? 2 : 1)); add(notes.map(note => note.duration === duration ? 1 : 2)); }
  const splits = Array.from({ length: Math.max(0, notes.length - 1) }, (_, i) => i + 1)
    .sort((a, b) => (notes[b].pitch - notes[b - 1].pitch) - (notes[a].pitch - notes[a - 1].pitch) || a - b);
  for (const split of splits) { add(notes.map((_, i) => i < split ? 2 : 1)); add(notes.map((_, i) => i < split ? 1 : 2)); }
  return result.slice(0, Math.max(2, cap));
}

function transition(state: State, event: VoiceInputNote[], candidate: Candidate, weights: VoiceWeights, beat: number, order: number, independentContour = false, registerSplit?: number): State {
  const onset = event[0].onset, active = state.active.filter(note => note.end > onset);
  const lines: State["lines"] = [...state.lines];
  let melody = independentContour && new Set(candidate).size === 1 ? 2 : 0, rhythm = 0, overlap = 0, switching = 0;
  // Repeated, separated chordal registers are two lines even with identical
  // attack/release times. Compare the whole partition, not only its extremes.
  if (registerSplit !== undefined) melody += 3 * candidate.filter((voice, i) => voice !== (i < registerSplit ? 2 : 1)).length / event.length;
  for (const voice of [1, 2] as const) {
    const group = event.filter((_, i) => candidate[i] === voice);
    if (!group.length) continue;
    const low = Math.min(...group.map(note => note.pitch)), high = Math.max(...group.map(note => note.pitch));
    const duration = Math.max(...group.map(note => note.duration)), previous = lines[voice - 1], other = state.lines[2 - voice];
    if (previous) {
      const continuity = Math.exp(-Math.max(0, onset - previous.end) / (beat * 2));
      const distance = (Math.abs(low - previous.low) + Math.abs(high - previous.high)) / 2;
      melody += melodicContinuityCost(distance, 0) * continuity;
      rhythm += rhythmicContinuityCost(duration, previous.duration) * continuity;
      if (previous.spacing !== undefined) rhythm += rhythmicContinuityCost(onset - previous.onset, previous.spacing) * continuity * 0.5;
      if (other) {
        const otherDistance = (Math.abs(low - other.low) + Math.abs(high - other.high)) / 2;
        switching += voiceSwitchingCost(distance, otherDistance) * continuity;
      }
    }
    const sounding = active.filter(note => note.voice === voice);
    // One penalty per new rhythmic layer, independent of chord size.
    overlap += Math.max(0, ...group.flatMap(note => sounding.map(held => durationOverlapCost(note, { onset: held.onset, duration: held.end - held.onset }))));
    // Different release times at the same onset are evidence for separate layers.
    const shortest = Math.min(...group.map(note => note.duration));
    overlap += bounded((duration - shortest) / Math.max(1, duration));
    lines[voice - 1] = { low, high, onset, end: onset + duration, duration, spacing: previous ? onset - previous.onset : undefined };
  }
  const nextActive = [...active, ...event.map((note, i) => ({ pitch: note.pitch, onset, end: onset + note.duration, voice: candidate[i] }))];
  const upper = nextActive.filter(note => note.voice === 1), lower = nextActive.filter(note => note.voice === 2);
  const span = [upper, lower].reduce((cost, sounding) => {
    if (!sounding.length) return cost;
    const pitches = sounding.map(note => note.pitch);
    return cost + (Math.max(0, Math.max(...pitches)-Math.min(...pitches)-12)/12) ** 2;
  },0);
  const crossing = upper.length && lower.length ? voiceCrossingCost(Math.min(...upper.map(note => note.pitch)), Math.max(...lower.map(note => note.pitch))) : 0;
  // Favor upper-line identity at a simultaneous entrance, never impose a pitch cutoff.
  const complexity = voiceComplexityCost(candidate) * (state.lines[1] ? 1 : 5);
  const cost = span * weights.span + melody * weights.melody + rhythm * weights.rhythm + overlap * weights.overlap + crossing * weights.crossing + switching * weights.switching + complexity * weights.complexity + chordSplitCost(event, candidate) * weights.chordSplit * (independentContour ? 0.15 : 1);
  return { cost: state.cost + cost, lines, active: nextActive, parent: state, event, candidate, order };
}

export function assignNoteVoices(input: readonly VoiceInputNote[], options: { candidateCap?: number; beamWidth?: number; weights?: Partial<VoiceWeights>; beatTicks?: number } = {}): VoiceAssignmentResult {
  const notes = input.map(note => ({ ...note })).sort((a, b) => a.onset - b.onset || a.pitch - b.pitch || a.id.localeCompare(b.id));
  if (new Set(notes.map(note => note.id)).size !== notes.length) throw new Error("Voice assignment requires unique note IDs");
  if (notes.some(note => !Number.isFinite(note.pitch) || !Number.isFinite(note.onset) || !Number.isFinite(note.duration) || note.duration <= 0)) throw new Error("Invalid voice assignment note");
  const events: VoiceInputNote[][] = [];
  for (const note of notes) { if (events.at(-1)?.[0].onset === note.onset) events.at(-1)!.push(note); else events.push([note]); }
  // A recurring bass pattern under a moving melody is independent even when
  // attacks happen together. Require contextual contour evidence, not register
  // alone; otherwise ordinary homorhythmic chords stay intact.
  const independentContours = new Set<number>();
  const registerSplits = new Map<number, number>();
  const separated = events.map(event => {
    let split = -1, gap = 0;
    // Require chordal material on both sides; a lone bass plus an ordinary
    // chord is not by itself evidence of an independent second voice.
    for (let i = 2; i <= event.length - 2; i++) {
      const distance = event[i].pitch - event[i - 1].pitch;
      if (distance >= 7 && distance > gap) { split = i; gap = distance; }
    }
    return split < 0 ? undefined : { split, boundary: (event[split].pitch + event[split - 1].pitch) / 2 };
  });
  separated.forEach((partition, index) => {
    if (!partition) return;
    // Look locally, across bar boundaries. Do not infer two lines from one
    // unusually open voicing, or from unrelated passages far apart in time.
    const support = separated.slice(Math.max(0, index - 4), index + 5).filter((other, offset) => {
      const otherIndex = Math.max(0, index - 4) + offset;
      return other && Math.abs(other.boundary - partition.boundary) <= 5
        && Math.abs(events[otherIndex][0].onset - events[index][0].onset) <= (options.beatTicks ?? 96) * 8;
    }).length;
    if (support >= 3) { registerSplits.set(index, partition.split); independentContours.add(index); }
  });
  for (let index = 0; index + 3 < events.length; index++) {
    const window = events.slice(index, index + 4);
    if (!window.every(event => event.length === 2 && event[1].pitch - event[0].pitch >= 12)) continue;
    const lower = window.map(event => event[0].pitch), upper = window.map(event => event[1].pitch);
    const motion = (values: number[]) => values.slice(1).map((value, i) => value - values[i]);
    const lowMotion = motion(lower), highMotion = motion(upper);
    const recurringBass = new Set(lower).size === 2 && lower[0] === lower[2] && lower[1] === lower[3];
    const movingMelody = new Set(upper).size >= 3 && (highMotion.every(value => value >= 0) || highMotion.every(value => value <= 0));
    if (recurringBass && movingMelody && lowMotion.some((value, i) => Math.abs(value - highMotion[i]) >= 4)) for (let i = index; i < index + 4; i++) independentContours.add(i);
  }
  // The common single-voice case needs no search at all. A clean melody or a
  // sequence of equal-duration block chords is rhythmically unambiguous.
  let previousEnd = -Infinity;
  const singleVoice = !independentContours.size && !notes.some(note => note.voiceLocked && note.existingVoice === 2) && events.every(event => {
    const end = event[0].onset + event[0].duration;
    const fits = event[0].onset >= previousEnd && event.at(-1)!.pitch-event[0].pitch <= 12 && event.every(note => note.onset + note.duration === end);
    previousEnd = end; return fits;
  });
  if (singleVoice) return { assignments: notes.map(note => ({ noteId: note.id, voice: 1 as const })).sort((a, b) => a.noteId.localeCompare(b.noteId)), warnings: [] };
  const weights = { ...DEFAULT_VOICE_WEIGHTS, ...options.weights };
  let beam: State[] = [{ cost: 0, lines: [undefined, undefined], active: [], order: 0 }], order = 0;
  for (const [index, event] of events.entries()) {
    const candidates = generateVoiceCandidates(event, options.candidateCap ?? 16);
    const next = beam.flatMap(state => candidates.map(candidate => transition(state, event, candidate, weights, options.beatTicks ?? 96, order++, independentContours.has(index), registerSplits.get(index))));
    next.sort((a, b) => a.cost - b.cost || a.order - b.order);
    const seen = new Set<string>();
    beam = [];
    for (const state of next) {
      const key = JSON.stringify([state.lines, state.active]);
      if (seen.has(key)) continue;
      seen.add(key); beam.push(state);
      if (beam.length >= (options.beamWidth ?? 64)) break;
    }
  }
  const assignments: VoiceAssignmentResult["assignments"] = [];
  let best = beam[0];
  while (best?.event && best.candidate) {
    best.event.forEach((note, i) => assignments.push({ noteId: note.id, voice: best.candidate![i] }));
    best = best.parent!;
  }
  assignments.sort((a, b) => a.noteId.localeCompare(b.noteId));
  const byId = new Map(assignments.map(note => [note.noteId, note.voice]));
  const warnings: string[] = [];
  // Report irreducible rhythmic conflicts after fitting two voices, without discarding music.
  const active: VoiceInputNote[][] = [[], []];
  for (const event of events) for (const note of event) {
    const index = byId.get(note.id)! - 1;
    active[index] = active[index].filter(held => held.onset + held.duration > note.onset);
    if (active[index].some(held => held.onset !== note.onset)) {
      if (!warnings.length) warnings.push("Some overlapping rhythmic layers need more than two voices, or conflict with preserved voice choices. All notes were retained.");
    }
    active[index].push(note);
  }
  const soundingHands: VoiceInputNote[] = [];
  for (const event of events) {
    for (let i = soundingHands.length-1; i >= 0; i--) if (soundingHands[i].onset+soundingHands[i].duration <= event[0].onset) soundingHands.splice(i,1);
    soundingHands.push(...event);
    // Detect inherently excessive total reach even after the best ordered
    // two-hand split. Do not silently drop/transplant pitches to make it fit.
    const pitches = soundingHands.map(note => note.pitch).sort((a,b) => a-b);
    const possible = pitches.some((_,i) => pitches[i]-pitches[0] <= 12 && (i === pitches.length-1 || pitches.at(-1)!-pitches[i+1] <= 12));
    if (!possible) { warnings.push("Some simultaneous notes cannot fit within an octave per hand. All pitches were retained; these passages need manual arrangement."); break; }
  }
  return { assignments, warnings };
}
