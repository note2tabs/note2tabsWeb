export const MAX_BACKEND_FILENAME_LENGTH = 80;

export function normalizeUploadFilename(fileName: string, maxLength = MAX_BACKEND_FILENAME_LENGTH) {
  const leafName = fileName.split(/[\\/]/).pop() || "audio-upload";
  const cleaned = leafName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const safeName = cleaned || "audio-upload";
  if (safeName.length <= maxLength) return safeName;

  const dotIndex = safeName.lastIndexOf(".");
  const extension = dotIndex > 0 ? safeName.slice(dotIndex, dotIndex + 13) : "";
  const stem = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const availableStemLength = Math.max(1, maxLength - extension.length);
  return `${stem.slice(0, availableStemLength).trimEnd()}${extension}`;
}
