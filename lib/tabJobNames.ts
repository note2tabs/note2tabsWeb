const AUTO_NAME_SUFFIX_RE = /^(.*?)(\d{2,})$/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function labelKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

function looksLikeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
}

function isYouTubeUrl(value: string) {
  if (!looksLikeUrl(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

function stripFileExtension(value: string) {
  const trimmed = normalizeWhitespace(value);
  const basename = trimmed.split(/[\\/]/).pop() || trimmed;
  const clean = basename.split("?")[0].split("#")[0];
  const stripped = clean.replace(/\.[^.]+$/, "");
  return normalizeWhitespace(stripped || clean);
}

export function deriveTabJobBaseLabel(input: {
  sourceType?: string | null;
  explicitLabel?: string | null;
  songTitle?: string | null;
  artist?: string | null;
  jobId: string;
}) {
  const sourceType = normalizeWhitespace(input.sourceType || "").toLocaleUpperCase();
  const explicitLabel = normalizeWhitespace(input.explicitLabel || "");
  const songTitle = normalizeWhitespace(input.songTitle || "");
  const artist = normalizeWhitespace(input.artist || "");
  const titledLabel = [artist, songTitle].filter(Boolean).join(" - ");

  if (sourceType === "YOUTUBE" || isYouTubeUrl(explicitLabel)) {
    if (titledLabel) return titledLabel;
    if (songTitle) return songTitle;
  }

  if (sourceType === "FILE") {
    const fileLabel = stripFileExtension(explicitLabel);
    if (fileLabel) return fileLabel;
  }

  if (titledLabel) return titledLabel;
  if (songTitle) return songTitle;
  if (explicitLabel && !looksLikeUrl(explicitLabel)) {
    return sourceType === "FILE" ? stripFileExtension(explicitLabel) : explicitLabel;
  }
  return `Transcription ${input.jobId}`;
}

export function buildUniqueTabJobLabel(
  requestedLabel: string,
  existingLabels: string[],
  excludedLabel?: string | null
) {
  const baseRequestedLabel = normalizeWhitespace(requestedLabel) || "Untitled";
  const excludedKey = excludedLabel ? labelKey(excludedLabel) : null;
  const existing = new Set(
    existingLabels
      .map((label) => normalizeWhitespace(label))
      .filter((label) => label && labelKey(label) !== excludedKey)
      .map((label) => labelKey(label))
  );

  if (!existing.has(labelKey(baseRequestedLabel))) {
    return baseRequestedLabel;
  }

  const suffixMatch = baseRequestedLabel.match(AUTO_NAME_SUFFIX_RE);
  const root = normalizeWhitespace(suffixMatch?.[1] || baseRequestedLabel) || "Untitled";
  let suffix = suffixMatch ? Math.max(2, Number.parseInt(suffixMatch[2], 10) + 1) : 2;
  let candidate = `${root}${String(suffix).padStart(2, "0")}`;

  while (existing.has(labelKey(candidate))) {
    suffix += 1;
    candidate = `${root}${String(suffix).padStart(2, "0")}`;
  }

  return candidate;
}
