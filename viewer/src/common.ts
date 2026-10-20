// Helpers shared by the document viewer (app.ts) and the flipbook (flipbook.ts): opening
// the PDF with pdf.js, small DOM helpers, download and full screen.
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { Strings, ViewerConfig } from "./config";
import { icons } from "./icons";

export const assetBase = new URL("../pdfjs/", import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.js", assetBase).href;

export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children);
  return el;
}

export function fileName(config: ViewerConfig): string {
  try {
    const last = new URL(config.url, location.href).pathname.split("/").pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // Fall through.
  }
  return (config.title || "document").replace(/[\\/:*?"<>|]+/g, "-") + ".pdf";
}

/** Starts a download of `href` without leaving the page. */
export function download(doc: Document, href: string, name: string): void {
  const a = h(doc, "a", { href, download: name, rel: "noopener" });
  doc.body.append(a);
  a.click();
  a.remove();
}

/**
 * pdf.js getDocument() parameters, with runtime data served from the plugin. Fonts load
 * into `doc`, which matters in the block editor: its canvas lives in an iframe.
 */
export function documentParams(url: string, doc: Document) {
  return {
    url,
    ownerDocument: doc,
    cMapUrl: new URL("cmaps/", assetBase).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", assetBase).href,
    wasmUrl: new URL("wasm/", assetBase).href,
    iccUrl: new URL("iccs/", assetBase).href,
    enableXfa: false,
  };
}

/**
 * Opens the PDF, showing progress and a password form in `message`. Resolves with the
 * document, or null after showing an error (or when the task was destroyed).
 */
export async function openDocument(
  doc: Document,
  config: ViewerConfig,
  message: HTMLElement,
  t: Strings,
): Promise<{ task: PDFDocumentLoadingTask; pdf: PDFDocumentProxy | null }> {
  const task = pdfjsLib.getDocument(documentParams(config.url, doc));
  task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total > 0) message.textContent = `${t.loading} ${Math.min(100, Math.round((loaded / total) * 100))}%`;
  };
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    const wrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
    const input = h(doc, "input", { type: "password", "aria-label": t.password, autocomplete: "off" });
    const form = h(doc, "form", { class: "yape-password" },
      h(doc, "p", {}, wrong ? t.passwordWrong : t.passwordPrompt),
      input,
      h(doc, "button", { type: "submit", class: "yape-btn yape-btn--text" }, t.open));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      message.replaceChildren(t.loading);
      update(input.value);
    });
    message.hidden = false;
    message.replaceChildren(form);
    input.focus();
  };

  try {
    return { task, pdf: await task.promise };
  } catch (err) {
    if ((err as Error)?.name !== "AbortException") {
      message.replaceChildren(
        h(doc, "p", {}, t.error),
        h(doc, "a", { href: config.url, target: "_blank", rel: "noopener" }, t.openDirectly),
      );
      message.classList.add("is-error");
      console.error("[yape] PDF load failed", err);
    }
    return { task, pdf: null };
  }
}

type On = <T extends EventTarget>(target: T, type: string, fn: (e: any) => void) => void;

/**
 * Full screen for the whole figure, with a CSS fallback where the Fullscreen API is
 * missing (iPhone Safari). `onChange` runs after every switch.
 */
export function bindFullscreen(
  doc: Document,
  figure: HTMLElement,
  button: HTMLButtonElement,
  t: Strings,
  on: On,
  onChange: () => void,
): void {
  const isFullscreen = () => doc.fullscreenElement === figure || figure.classList.contains("yape-pdf--fs");
  const sync = () => {
    const fs = isFullscreen();
    button.innerHTML = fs ? icons.exitFullscreen : icons.fullscreen;
    button.setAttribute("aria-label", fs ? t.exitFullscreen : t.fullscreen);
    button.title = fs ? t.exitFullscreen : t.fullscreen;
    onChange();
  };
  on(button, "click", async () => {
    if (doc.fullscreenElement === figure) await doc.exitFullscreen();
    else if (figure.classList.contains("yape-pdf--fs")) figure.classList.remove("yape-pdf--fs");
    else if (figure.requestFullscreen && doc.fullscreenEnabled) await figure.requestFullscreen().catch(() => figure.classList.add("yape-pdf--fs"));
    else figure.classList.add("yape-pdf--fs");
    sync();
  });
  on(doc, "fullscreenchange", sync);
  on(doc, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && figure.classList.contains("yape-pdf--fs")) {
      figure.classList.remove("yape-pdf--fs");
      sync();
    }
  });
}
