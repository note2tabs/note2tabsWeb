type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenToggleResult = "entered" | "exited" | "unsupported" | "failed";

export function getFullscreenElement(doc: Document): Element | null {
  const fullscreenDocument = doc as FullscreenDocument;
  return doc.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

export function supportsElementFullscreen(element: HTMLElement | null): boolean {
  if (!element) return false;
  const fullscreenElement = element as FullscreenElement;
  return (
    typeof element.requestFullscreen === "function" ||
    typeof fullscreenElement.webkitRequestFullscreen === "function"
  );
}

export async function toggleElementFullscreen(
  element: HTMLElement | null,
  doc: Document
): Promise<FullscreenToggleResult> {
  try {
    if (getFullscreenElement(doc)) {
      const fullscreenDocument = doc as FullscreenDocument;
      const exitFullscreen =
        typeof doc.exitFullscreen === "function"
          ? doc.exitFullscreen.bind(doc)
          : fullscreenDocument.webkitExitFullscreen?.bind(fullscreenDocument);
      if (!exitFullscreen) return "unsupported";
      await exitFullscreen();
      return "exited";
    }

    if (!element) return "unsupported";
    const fullscreenElement = element as FullscreenElement;
    const requestFullscreen =
      typeof element.requestFullscreen === "function"
        ? element.requestFullscreen.bind(element)
        : fullscreenElement.webkitRequestFullscreen?.bind(fullscreenElement);
    if (!requestFullscreen) return "unsupported";
    await requestFullscreen();
    return "entered";
  } catch {
    // Browser policy, permissions, and interrupted transitions may reject even
    // when the API exists. Keep that expected platform behavior out of the
    // application's unhandled-error stream.
    return "failed";
  }
}
