// Entry Script Module. Kept tiny: it only finds viewers on the page and loads the heavy
// viewer or flipbook (pdf.js) when one scrolls into view or is clicked.
import { format, readConfig, strings, type ViewerConfig } from "./config";

export type { ViewerConfig };

type Unmount = () => void;

const mounted = new WeakMap<HTMLElement, Promise<Unmount>>();

/** Creates the viewer or flipbook for `config` without caching. */
async function create(el: HTMLElement, config: ViewerConfig, close?: () => void): Promise<Unmount> {
  if (config.mode === "flipbook") {
    const { createFlipbook } = await import("./flipbook");
    return createFlipbook(el, config, {
      close,
      // Swap to the document viewer in the same frame for search, zoom and annotations
      // (not in a lightbox, which has no room for the viewer's own controls to close it).
      openViewer: close ? undefined : () => {
        const current = mounted.get(el);
        mounted.delete(el);
        void current?.then((unmount) => {
          unmount();
          void mount(el, { ...config, mode: "viewer" });
        });
      },
    });
  }
  const { createViewer } = await import("./app");
  return createViewer(el, config);
}

/** Mounts a viewer into `el`. Returns a function that tears it down. */
export function mount(el: HTMLElement, config: ViewerConfig, close?: () => void): Promise<Unmount> {
  let existing = mounted.get(el);
  if (!existing) {
    existing = create(el, config, close).then((unmount) => () => {
      mounted.delete(el);
      unmount();
    });
    mounted.set(el, existing);
  }
  return existing;
}

/**
 * Creates an independent viewer (no caching), e.g. for the block editor preview.
 * Call the returned function to tear it down; safe to call before loading finished.
 */
export async function render(el: HTMLElement, config: ViewerConfig): Promise<Unmount> {
  if (config.mode === "flipbook") {
    const { createFlipbook } = await import("./flipbook");
    return createFlipbook(el, config);
  }
  const { createViewer } = await import("./app");
  return createViewer(el, config);
}

function showClickToLoad(frame: HTMLElement, config: ViewerConfig): void {
  const t = strings();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "yape-pdf__load";
  button.textContent = t.loadPdf;
  if (config.title) button.setAttribute("aria-label", `${t.loadPdf}: ${config.title}`);
  button.addEventListener("click", () => {
    button.disabled = true;
    void mount(frame, config).then(() => button.remove());
  });
  frame.append(button);
}

/**
 * Lightbox flipbook: the server prints a cover link to the PDF. Clicking it opens the
 * flipbook in a modal dialog; without JavaScript the link simply opens the PDF.
 */
function setupLightbox(frame: HTMLElement, config: ViewerConfig): void {
  const t = strings();
  const link = frame.querySelector<HTMLAnchorElement>(".yape-pdf__cover");
  if (!link) return;
  const label = config.title || t.flipbook;
  link.setAttribute("aria-label", format(t.openFlipbook, label));
  link.setAttribute("aria-haspopup", "dialog");

  const art = link.querySelector<HTMLElement>(".yape-pdf__cover-art");
  if (art && !art.querySelector("img")) {
    // No preview image on the server: draw page 1 once the cover is near the screen.
    const draw = () =>
      void import("./flipbook").then((m) => m.renderCover(art, config, art.clientWidth || 240));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          draw();
        }
      }, { rootMargin: "200px 0px" });
      io.observe(art);
    } else draw();
  }

  link.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const figure = frame.closest<HTMLElement>(".yape-pdf");
    const theme = Array.from(figure?.classList ?? []).find((c) => c.startsWith("is-theme-")) ?? "is-theme-light";
    const dialog = document.createElement("dialog");
    dialog.className = "yape-lightbox";
    dialog.setAttribute("aria-label", label);
    const box = document.createElement("figure");
    box.className = `yape-pdf ${theme}`;
    const inner = document.createElement("div");
    inner.className = "yape-pdf__frame";
    box.append(inner);
    dialog.append(box);
    document.body.append(dialog);

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      void mounted.get(inner)?.then((unmount) => unmount());
      if (dialog.open) dialog.close();
      dialog.remove();
      link.focus();
    };
    dialog.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      close();
    });
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) close();
    });
    dialog.showModal();
    void mount(inner, { ...config, flipbook: { ...config.flipbook, lightbox: false } }, close).then(() => {
      inner.querySelector<HTMLElement>(".yape-flip__stage")?.focus();
    });
  });
}

function init(): void {
  const frames = document.querySelectorAll<HTMLElement>(".yape-pdf__frame[data-yape]");
  if (!frames.length) return;

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              observer?.unobserve(entry.target);
              const frame = entry.target as HTMLElement;
              const config = readConfig(frame);
              if (config) void mount(frame, config);
            }
          },
          { rootMargin: "400px 0px" },
        )
      : null;

  frames.forEach((frame) => {
    const config = readConfig(frame);
    if (!config) return;
    if (config.mode === "flipbook" && config.flipbook?.lightbox) setupLightbox(frame, config);
    else if (config.load === "click") showClickToLoad(frame, config);
    else if (observer) observer.observe(frame);
    else void mount(frame, config);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
