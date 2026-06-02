const STYLE_ID = "noblocks-smile-override";
const TEXT_DARK = "#ffffff";
const TEXT_LIGHT = "#2D2B2A";
const SMILE_ALERT_BLUE = /#151F72/gi;
const SMILE_DESCRIPTION_DARK = /var\(--neutral-off-black,\s*#2D2B2A\)/gi;
const SMILE_MOBILE_100VH = /height:\s*100vh/gi;

function resolveSmileTextColor(): string {
  return document.documentElement.classList.contains("dark")
    ? TEXT_DARK
    : TEXT_LIGHT;
}

function buildOverrideCss(textColor: string): string {
  return `
  .alert-message,
  .alert-message .alert-title,
  .description {
    color: ${textColor} !important;
  }

  /*
   * Landscape ID capture draws the camera feed to a sibling <canvas>.
   * Smile still unhides an empty .id-video (white background) — hide it.
   */
  .id-video-container > canvas {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    aspect-ratio: 16 / 9;
    max-height: min(45dvh, 280px) !important;
    background: #000 !important;
  }

  .id-video-container:has(> canvas) .id-video:empty,
  .id-video-container:has(> canvas) .id-video:not(:has(video)) {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: transparent !important;
    border: none !important;
  }

  .id-video:has(video) {
    width: 100% !important;
    max-height: min(45dvh, 280px) !important;
    background: #000 !important;
  }

  .id-video:has(video) video {
    width: 100% !important;
    max-height: min(45dvh, 280px) !important;
    object-fit: cover !important;
  }

  @media (max-width: 600px) {
    .section {
      width: 99% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      justify-content: flex-start !important;
    }

    .id-camera-screen {
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }

    #document-capture-screen,
    #back-of-document-capture-screen {
      height: auto !important;
      min-height: 0 !important;
      max-block-size: none !important;
      padding: 0.75rem !important;
    }

    .id-video-container {
      max-height: none !important;
      overflow: visible !important;
    }

    .id-video-container > canvas {
      max-height: min(40dvh, 240px) !important;
    }

    .circle-progress {
      height: auto !important;
      min-height: 0 !important;
    }

    .video-footer.sticky {
      position: relative !important;
    }

    document-capture-screens,
    selfie-capture-screens,
    document-capture-instructions,
    selfie-capture-instructions {
      height: auto !important;
      max-height: min(70dvh, 32rem) !important;
    }
  }
`;
}

const installedSheets = new WeakMap<ShadowRoot, CSSStyleSheet>();
const installedStyleTags = new WeakSet<ShadowRoot>();

/** Walk shadow roots and nested custom-element light DOM (Smile: screens → wrapper → capture UI). */
function walkSmileDom(
  host: HTMLElement,
  visitShadow: (shadowRoot: ShadowRoot) => void,
  textColor: string,
): void {
  if (!host.shadowRoot) return;

  const visitElement = (el: HTMLElement) => {
    if (el instanceof HTMLStyleElement) {
      const text = el.textContent;
      if (text) {
        const patched = patchStyleText(text, textColor);
        if (patched !== text) el.textContent = patched;
      }
      return;
    }
    if (el.shadowRoot) {
      visitShadow(el.shadowRoot);
      patchSmileStyleTags(el.shadowRoot, textColor);
      for (const child of Array.from(el.shadowRoot.children)) {
        if (child instanceof HTMLElement) visitElement(child);
      }
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) visitElement(child);
    }
  };

  for (const child of Array.from(host.shadowRoot.children)) {
    if (child instanceof HTMLElement) visitElement(child);
  }
}

function patchStyleText(text: string, textColor: string): string {
  let next = text;
  if (next.includes(".alert-message")) {
    next = next.replace(SMILE_ALERT_BLUE, textColor);
  }
  if (next.includes(".description")) {
    next = next.replace(SMILE_DESCRIPTION_DARK, textColor);
  }
  if (
    next.includes(".section") ||
    next.includes("id-camera-screen") ||
    next.includes("document-capture-screens")
  ) {
    if (SMILE_MOBILE_100VH.test(next)) {
      next = next.replace(SMILE_MOBILE_100VH, "height: auto");
    }
    if (next.includes("document-capture-screens")) {
      next = next.replace(
        /(document-capture-screens[^}]*?)height:\s*100%/g,
        "$1height: auto",
      );
    }
  }
  return next;
}

function patchSmileStyleTags(root: ParentNode, textColor: string): void {
  root.querySelectorAll("style").forEach((node) => {
    const text = node.textContent;
    if (!text) return;
    const patched = patchStyleText(text, textColor);
    if (patched !== text) node.textContent = patched;
  });
}

/** Smile landscape mode uses canvas + empty .id-video; collapse the placeholder. */
function patchDocumentCaptureLayout(shadowRoot: ShadowRoot): void {
  shadowRoot.querySelectorAll(".id-video-container").forEach((container) => {
    const canvas = container.querySelector(":scope > canvas");
    const idVideo = container.querySelector(".id-video");
    if (!(idVideo instanceof HTMLElement)) return;

    if (canvas && !idVideo.querySelector("video")) {
      idVideo.style.setProperty("display", "none", "important");
      idVideo.hidden = true;
    } else if (idVideo.querySelector("video")) {
      idVideo.style.removeProperty("display");
      idVideo.hidden = false;
    }
  });
}

function patchTextElements(shadowRoot: ShadowRoot, textColor: string): void {
  shadowRoot.querySelectorAll(".alert-message").forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty("color", textColor, "important");
    el.querySelectorAll(".alert-title").forEach((title) => {
      (title as HTMLElement).style.setProperty("color", textColor, "important");
    });
  });

  shadowRoot.querySelectorAll(".description").forEach((node) => {
    (node as HTMLElement).style.setProperty("color", textColor, "important");
  });
}

function installOverrideSheet(shadowRoot: ShadowRoot, textColor: string): void {
  const css = buildOverrideCss(textColor);
  const existing = installedSheets.get(shadowRoot);

  if (existing) {
    existing.replaceSync(css);
    return;
  }

  if (typeof CSSStyleSheet !== "undefined" && "adoptedStyleSheets" in shadowRoot) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      installedSheets.set(shadowRoot, sheet);
      return;
    } catch {
      // Fall through to <style> tag (older WebViews).
    }
  }

  let style = shadowRoot.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    shadowRoot.appendChild(style);
    installedStyleTags.add(shadowRoot);
  }
  style.textContent = css;
}

function applySmileCameraFixes(host: HTMLElement): void {
  const textColor = resolveSmileTextColor();

  walkSmileDom(
    host,
    (shadowRoot) => {
      patchTextElements(shadowRoot, textColor);
      patchDocumentCaptureLayout(shadowRoot);
      installOverrideSheet(shadowRoot, textColor);
    },
    textColor,
  );
  if (host.shadowRoot) {
    patchSmileStyleTags(host.shadowRoot, textColor);
  }
}

function uninstallOverrideSheets(host: HTMLElement): void {
  walkSmileDom(
    host,
    (shadowRoot) => {
      const sheet = installedSheets.get(shadowRoot);
      if (sheet) {
        shadowRoot.adoptedStyleSheets = shadowRoot.adoptedStyleSheets.filter(
          (s) => s !== sheet,
        );
        installedSheets.delete(shadowRoot);
      }
      if (installedStyleTags.has(shadowRoot)) {
        shadowRoot.getElementById(STYLE_ID)?.remove();
        installedStyleTags.delete(shadowRoot);
      }
    },
    resolveSmileTextColor(),
  );
}

/**
 * Smile capture overrides (text color, mobile document layout) without patching the SDK.
 */
export function startSmileCameraAlertStyleFix(host: HTMLElement): () => void {
  let frameId = 0;

  const tick = () => {
    if (!host.isConnected) {
      frameId = 0;
      return;
    }
    applySmileCameraFixes(host);
    frameId = requestAnimationFrame(tick);
  };

  frameId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frameId);
    uninstallOverrideSheets(host);
  };
}

/** @deprecated Use startSmileCameraAlertStyleFix */
export function injectSmileCameraAlertStyles(host: HTMLElement): void {
  applySmileCameraFixes(host);
}

/** @deprecated Use startSmileCameraAlertStyleFix */
export function observeSmileCameraAlertStyles(
  host: HTMLElement,
  onCleanup: (disconnect: () => void) => void,
): void {
  onCleanup(startSmileCameraAlertStyleFix(host));
}
