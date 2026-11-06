/** Position of the transcription "write head" in seconds of music, or null when
 * nothing is streaming. Kept outside React state so the ~8 Hz head movement only
 * re-renders the small caret component, never the whole editor. */
let head: number | null = null;
const listeners = new Set<() => void>();
export const setStreamingHead = (seconds: number | null) => {
  if (seconds === head) return;
  head = seconds;
  listeners.forEach(listener => listener());
};
export const subscribeStreamingHead = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getStreamingHead = () => head;
