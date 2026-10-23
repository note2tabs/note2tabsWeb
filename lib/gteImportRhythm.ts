import type { CanvasSnapshot, EditorSnapshot, TimingMapV2 } from "../types/gte";
import { frameToSeconds } from "./gteTiming";

/** Count rhythmic events, not chord tones, in power-of-two duration buckets. */
export function estimateImportRhythmScale(canvas: CanvasSnapshot, importedIds?: readonly string[]) {
  const lanes = canvas.editors.filter(lane => !importedIds?.length || importedIds.includes(lane.id));
  const pitched = lanes.filter(lane => !["drum", "drums"].includes(lane.trackType ?? lane.editorType ?? lane.type ?? ""));
  const votes = new Map<number, number>();
  for (const lane of pitched.length ? pitched : lanes) {
    const events = [...lane.notes, ...lane.chords];
    const durations = pitched.length ? events.map(event => ({ start: event.startTime, length: event.length })) : (() => {
      const starts = [...new Set(events.map(event => event.startTime))].sort((a,b) => a-b);
      return starts.slice(0,-1).map((start,index) => ({ start, length: starts[index+1] - start }));
    })();
    const seen = new Set<string>();
    for (const event of durations) {
      if (!(event.length > 0) || !Number.isFinite(event.length)) continue;
      const key = event.start + ":" + event.length; if (seen.has(key)) continue; seen.add(key);
      const bar = canvas.timingMap?.bars[Math.min(canvas.timingMap.bars.length - 1, Math.floor(event.start / 480))];
      const numerator = bar?.timeSignature.numerator ?? lane.timeSignature ?? 4;
      const denominator = bar?.timeSignature.denominator ?? lane.timeSignatureBottom ?? 4;
      const eighthFrames = (lane.framesPerMessure || 480) * denominator / numerator / 8;
      // Whole through 64th notes; longer sustains and tiny artifacts don't
      // manufacture extreme tempo changes outside that supported range.
      const rawExponent = Math.log2(eighthFrames / event.length);
      if (rawExponent < -3.5 || rawExponent > 3.5) continue;
      const exponent = Math.max(-3, Math.min(3, Math.round(rawExponent)));
      votes.set(exponent, (votes.get(exponent) ?? 0) + 1);
    }
  }
  const winner = [...votes].sort((a,b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]) || a[0] - b[0])[0];
  return winner ? 2 ** winner[0] : 1;
}

/** Rebar the same seconds timeline. Preserve every old tempo/anchor boundary. */
export function scaleImportTimingMap(map: TimingMapV2, scale: number, allowManual = false): TimingMapV2 {
  if (scale === 1 || !map.bars.length) return map;
  const signature = map.bars[0].timeSignature;
  // A changed meter is musical structure; don't merge unlike measures.
  if (map.bars.some(bar => (!allowManual && bar.source === "manual") || bar.timeSignature.numerator !== signature.numerator || bar.timeSignature.denominator !== signature.denominator)) return map;
  const points = [...new Set(map.bars.flatMap(bar => [bar.startFrame, ...bar.anchors.map(anchor => bar.startFrame + anchor.tick), bar.endFrame]).map(frame => frame * scale))].sort((a,b) => a-b);
  let pointIndex = 0;
  const count = Math.max(1, Math.ceil(map.bars.length * scale));
  const seconds = (frame: number) => frameToSeconds(map, frame / scale) - map.audioOffsetSeconds;
  const bars = Array.from({ length: count }, (_, index) => {
    const startFrame = index * 480, endFrame = startFrame + 480;
    const source = map.bars[Math.min(map.bars.length - 1, Math.floor(startFrame / scale / 480))];
    const ticks = [0];
    while (pointIndex < points.length && points[pointIndex] <= startFrame) pointIndex++;
    while (pointIndex < points.length && points[pointIndex] < endFrame) ticks.push(points[pointIndex++] - startFrame);
    ticks.push(480);
    const startSeconds = seconds(startFrame), endSeconds = seconds(endFrame);
    return { ...source, id: `bar-${index+1}`, index, startFrame, endFrame, startSeconds, endSeconds,
      quarterNoteBpm: 60 * signature.numerator * 4 / signature.denominator / (endSeconds - startSeconds),
      anchors: ticks.map(tick => ({ tick, seconds: seconds(startFrame + tick) })) };
  });
  return { ...map, bars };
}

export function scaleImportedLane(lane: EditorSnapshot, scale: number, secondsPerBar: number): EditorSnapshot {
  if (scale === 1) return lane;
  return { ...lane, secondsPerBar,
    timelineOffsetFrames: (lane.timelineOffsetFrames ?? 0) * scale,
    totalFrames: Math.max(480, Math.ceil(lane.totalFrames * scale / 480) * 480),
    notes: lane.notes.map(note => ({ ...note, startTime: note.startTime * scale, length: note.length * scale })),
    chords: lane.chords.map(chord => ({ ...chord, startTime: chord.startTime * scale, length: chord.length * scale,
      strums: chord.strums?.map(strum => ({ ...strum, time: strum.time * scale })) })),
    cutPositionsWithCoords: lane.cutPositionsWithCoords.map(([range,coord]) => [[range[0]*scale,range[1]*scale],coord]),
    optimalsByTime: Object.fromEntries(Object.entries(lane.optimalsByTime).map(([frame,value]) => [String(Number(frame)*scale),value])),
    drumLoops: lane.drumLoops?.map(loop => ({ ...loop, sourceStart: loop.sourceStart*scale, sourceEnd: loop.sourceEnd*scale, loopEnd: loop.loopEnd*scale })),
    notation: lane.notation ? { ...lane.notation, rests: lane.notation.rests?.map(rest => ({ ...rest, start: rest.start*scale, length: rest.length*scale,
      denominator: rest.denominator / scale,
    })) } : undefined,
  };
}
