// Entry Script Module. Kept tiny: it only finds viewers on the page and loads the heavy
// viewer (pdf.js) when one scrolls into view or is clicked.
import { readConfig, strings, type ViewerConfig } from "./config";

export type { ViewerConfig };

type Unmount = () => void;

const mounted = new WeakMap<HTMLElement, Promise<Unmount>>();

/** Mounts a viewer into `el`. Returns a function that tears it down. */
export function mount(el: HTMLElement, config: ViewerConfig): Promise<Unmount> {
  let existing = mounted.get(el);
  if (!existing) {
    existing = import("./app")
      .then((m) => m.createViewer(el, config))
      .then((unmount) => () => {
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
    if (config.load === "click") showClickToLoad(frame, config);
    else if (observer) observer.observe(frame);
    else void mount(frame, config);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
