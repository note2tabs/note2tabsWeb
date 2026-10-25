type Hand = "bass" | "treble";
type HandEvent = { key: string; midi: number; start: number; length: number; staff: Hand };

/** Staff/hand allocation is separate from rhythmic voice identity. Keep explicit
 * imported/manual staves, but do not force automatic chords across middle C.
 * Include held notes when judging reach; preserve every pitch and release. */
export function allocateNotationHands<T extends HandEvent>(events: T[], explicit: ReadonlySet<string>): T[] {
  const ordered = [...events].sort((a,b) => a.start-b.start || a.midi-b.midi || a.key.localeCompare(b.key));
  const result = new Map<string, Hand>();
  let active: Array<{ midi: number; end: number; staff: Hand }> = [];
  const centers: Partial<Record<Hand, number>> = {};
  for (let index = 0; index < ordered.length;) {
    const start = ordered[index].start, group: T[] = [];
    while (index < ordered.length && ordered[index].start === start) group.push(ordered[index++]);
    active = active.filter(note => note.end > start);
    let bestCost = Infinity, best: Hand[] = [];
    for (let split = 0; split <= group.length; split++) {
      const hands = group.map((event,i): Hand => explicit.has(event.key) ? event.staff : i < split ? "bass" : "treble");
      let cost = 0;
      for (const hand of ["bass", "treble"] as const) {
        const incoming = group.filter((_,i) => hands[i] === hand).map(note => note.midi);
        const pitches = [...incoming, ...active.filter(note => note.staff === hand).map(note => note.midi)];
        if (!pitches.length) continue;
        const low = Math.min(...pitches), high = Math.max(...pitches), span = high-low;
        // Octave is a soft reach target, never a promise about an individual's
        // hand size. Beyond it is much worse than extra ledger lines or motion.
        cost += Math.max(0,span-12) ** 2 * 8 + span * 0.04;
        if (incoming.length) {
          const center = (Math.min(...incoming)+Math.max(...incoming))/2;
          cost += Math.abs(center-(hand === "bass" ? 48 : 72)) * 0.06;
          if (centers[hand] !== undefined) cost += Math.abs(center-centers[hand]!) * 0.12;
        }
      }
      if (cost < bestCost) { bestCost = cost; best = hands; }
    }
    group.forEach((event,i) => {
      const staff = best[i]; result.set(event.key,staff);
      active.push({ midi:event.midi, end:event.start+event.length, staff });
    });
    for (const hand of ["bass", "treble"] as const) {
      const pitches = group.filter((_,i) => best[i] === hand).map(note => note.midi);
      if (pitches.length) centers[hand] = (Math.min(...pitches)+Math.max(...pitches))/2;
    }
  }
  return events.map(event => ({ ...event, staff: result.get(event.key)! }));
}
