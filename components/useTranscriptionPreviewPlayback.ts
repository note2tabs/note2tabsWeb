import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasSnapshot } from "../types/gte";
import { scoreEvents } from "../lib/gteNotation";
import { createPlaybackLookaheadScheduler } from "../lib/gtePlaybackLookahead";
import { prepareTrackInstrument, schedulePreparedTrackNote } from "../lib/gteSamplePlayback";
import { prepareDrumKit, schedulePreparedDrumHit } from "../lib/gteDrumPlayback";
import { getDrumVoiceByMidi } from "../lib/gteDrums";

/** Preview transport shares the sample banks and lookahead scheduler with the editor.
 * Its clock is independent of arrival/optimization of new preview snapshots. */
export function useTranscriptionPreviewPlayback(canvas: CanvasSnapshot | null) {
  const context = useRef<AudioContext | null>(null);
  const requested = useRef(false);
  const clock = useRef({ seconds: 0, started: 0, running: false, speed: 1 });
  const latest = useRef(canvas); latest.current = canvas;
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [position, setPosition] = useState(0);
  const [seekEpoch, setSeekEpoch] = useState(0);
  const [error, setError] = useState("");
  const seconds = useCallback(() => clock.current.seconds + (clock.current.running && context.current ? Math.max(0, context.current.currentTime - clock.current.started) * clock.current.speed : 0), []);
  const getFrame = useCallback(() => seconds() * 480 / (latest.current?.secondsPerBar ?? 2), [seconds]);
  const pause = useCallback(() => { clock.current.seconds = seconds(); clock.current.running = false; requested.current = false; setPosition(clock.current.seconds); setPlaying(false); }, [seconds]);
  const seek = useCallback((value: number) => { clock.current.seconds = Math.max(0, value); clock.current.started = context.current?.currentTime ?? 0; setPosition(Math.max(0, value)); }, []);
  const toggle = useCallback(async () => {
    if (requested.current) { pause(); return; }
    requested.current = true;
    try {
      const end = latest.current?.editors.reduce((maximum, lane) => scoreEvents(lane).reduce((laneEnd, event) => Math.max(laneEnd, (event.start + event.length) / lane.fps), maximum), 0) ?? 0;
      if (end > 0 && seconds() >= end) { clock.current.seconds = 0; setPosition(0); }
      context.current ??= new AudioContext();
      await context.current.resume();
      if (requested.current) setPlaying(true);
    } catch {
      requested.current = false;
      setError("Could not start preview sound. Please try playback again.");
    }
  }, [pause, seconds]);
  const changeSpeed = useCallback((value: number) => {
    clock.current.seconds = seconds(); clock.current.started = context.current?.currentTime ?? 0;
    clock.current.speed = value; setSpeed(value);
  }, [seconds]);
  useEffect(() => () => { void context.current?.close(); }, []);
  useEffect(() => {
    if (!playing || !canvas || !context.current) return;
    const ctx = context.current, master = ctx.createGain(); master.gain.value = .7; master.connect(ctx.destination);
    let cancelled = false, timer: ReturnType<typeof setInterval> | undefined;
    const instruments = canvas.editors.map(async lane => ({ lane, instrument: lane.instrumentType === "drums" ? null : await prepareTrackInstrument(ctx, lane.instrumentId, scoreEvents(lane).map(event => event.midi)) }));
    void Promise.all([Promise.all(instruments), canvas.editors.some(lane => lane.instrumentType === "drums") ? prepareDrumKit(ctx) : null]).then(([prepared, kit]) => {
      if (cancelled) return;
      setError("");
      const origin = seconds(), audioOrigin = ctx.currentTime + .03;
      clock.current.seconds = origin; clock.current.started = audioOrigin; clock.current.running = true;
      const fps = 480 / (canvas.secondsPerBar ?? 2);
      const events = prepared.flatMap(({ lane, instrument }) => scoreEvents(lane).map(event => ({ ...event,
        start: event.start / fps, end: (event.start + event.length) / fps, lane, instrument }))).filter(event => event.end > origin);
      const pump = createPlaybackLookaheadScheduler(events, event => {
        const start = Math.max(origin, event.start), startTime = audioOrigin + (start - origin) / speed;
        if (event.lane.instrumentType === "drums") {
          const voice = getDrumVoiceByMidi(event.midi);
          if (kit && voice && event.start >= origin) schedulePreparedDrumHit({ ctx, destination: master, kit, voiceId: voice.id, gain: .7, startTime });
        } else if (event.instrument) schedulePreparedTrackNote({ ctx, destination: master, instrument: event.instrument, midi: event.midi, gain: 100 / 127, startTime, duration: (event.end - start) / speed });
      }, .5);
      const end = Math.max(origin, ...events.map(event => event.end));
      timer = setInterval(() => { const now = seconds(); pump(now); if (now >= end) pause(); }, 30); pump(origin);
    }).catch(() => { if (!cancelled) { setError("Could not load preview sound. Please try playback again."); pause(); } });
    return () => { cancelled = true; if (timer) clearInterval(timer); master.disconnect(); };
  }, [canvas, playing, seekEpoch, speed, seconds, pause]);
  // Seeking rebuilds the short scheduling window without changing play/pause.
  const seekPlayback = useCallback((value: number) => { seek(value); setSeekEpoch(epoch => epoch + 1); }, [seek]);

  return { playing, speed, position, getFrame, getSeconds: seconds, toggle, pause, seek: seekPlayback, changeSpeed, error, seekEpoch };
}
