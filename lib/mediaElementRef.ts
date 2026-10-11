/** Release playback resources during React's ref detach, before a media node is discarded. */
export function createMediaElementRef<T extends HTMLMediaElement>() {
  let current: T | null = null;
  return (element: T | null) => {
    if (element === current) return;
    const previous = current;
    current = element;
    if (!previous) return;
    previous.pause();
    previous.removeAttribute("src");
    previous.load();
  };
}
