export async function fetchYouTubeVideoTitle(videoId: string | null): Promise<string | null> {
  if (!videoId) return null;
  try {
    const response = await fetch(`/api/youtube-title?videoId=${encodeURIComponent(videoId)}`);
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { title?: unknown } | null;
    return typeof data?.title === "string" && data.title.trim() ? data.title.trim() : null;
  } catch {
    return null;
  }
}
