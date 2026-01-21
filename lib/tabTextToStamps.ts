type TabCoord = [number, number];
type Stamp = [number, TabCoord, number];

function stripLinePrefix(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/^([eEBDGA])\s*[\|:]/);
  if (match) {
    return trimmed.slice(match[0].length);
  }
  return trimmed;
}

function normalizeSegmentLines(segment: string[]): string[] {
  const lines = segment.filter((line) => line && line.trim().length > 0);
  if (lines.length === 0) return [];
  const labeled = lines.filter((line) => /^[eEBDGA]/.test(line.trim()));
  const pick = labeled.length >= 6 ? labeled.slice(0, 6) : lines.slice(0, 6);
  return pick.map((line) => stripLinePrefix(line).replace(/\s+/g, ""));
}

export function tabSegmentsToStamps(segments: string[][]): { stamps: Stamp[]; totalFrames: number } {
  const stamps: Stamp[] = [];
  let timeOffset = 0;

  for (const segment of segments) {
    const lines = normalizeSegmentLines(segment);
    if (lines.length === 0) continue;
    const paddedLines = Array.from({ length: 6 }, (_, idx) => lines[idx] || "");
    const maxLen = Math.max(...paddedLines.map((line) => line.length), 0);
    const normalized = paddedLines.map((line) => line.padEnd(maxLen, "-"));

    normalized.forEach((line, stringIndex) => {
      let col = 0;
      while (col < line.length) {
        const char = line[col];
        if (char >= "0" && char <= "9") {
          let end = col + 1;
          while (end < line.length && line[end] >= "0" && line[end] <= "9") {
            end += 1;
          }
          const fret = Number(line.slice(col, end));
          if (!Number.isNaN(fret)) {
            stamps.push([timeOffset + col, [stringIndex, fret], 1]);
          }
          col = end;
          continue;
        }
        col += 1;
      }
    });

    timeOffset += maxLen + 1;
  }

  return { stamps, totalFrames: Math.max(0, timeOffset) };
}

export function tabsToTabText(segments: string[][]): string {
  const lines = segments.map((segment) => segment.join("\n")).join("\n\n");
  return lines;
}

export function normalizeTabSegments(segments: string[][]): string[][] {
  return segments
    .map((segment) => segment.filter((line) => line.trim().length > 0))
    .filter((segment) => segment.length > 0);
}
