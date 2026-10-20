// The flipbook: pdf.js renders the pages, StPageFlip turns them. Only the open spread and
// its neighbours are drawn; pages far away are dropped again to save memory.
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { PageFlip } from "page-flip/dist/js/page-flip.module.js";
import { format, strings, type ViewerConfig } from "./config";
import { icons } from "./icons";
import { printDocument } from "./print";
import { bindFullscreen, documentParams, download, fileName, h, openDocument } from "./common";

export interface FlipbookOptions {
  /** Switches this frame to the document viewer (search, zoom, annotate). */
  openViewer?: () => void;
  /** Closes the lightbox the flipbook is shown in. */
  close?: () => void;
}

type Toolbar = Exclude<ViewerConfig["toolbar"], false | undefined>;

/** Pages kept rendered on each side of the current one; anything further is dropped. */
const KEEP = 8;

interface Sheet {
  el: HTMLDivElement;
  content: HTMLDivElement;
  width: number;
  task: RenderTask | null;
  extras: boolean;
}

export async function createFlipbook(
  frame: HTMLElement,
  config: ViewerConfig,
  opts: FlipbookOptions = {},
): Promise<() => void> {
  const doc = frame.ownerDocument;
  const win = doc.defaultView ?? window;
  const t = strings();
  const fb = config.flipbook ?? {};
  const rtl = !!fb.rtl;
  const tb: Toolbar | null =
    config.toolbar === false && !opts.close
      ? null
      : { sidebar: true, search: true, zoom: true, download: true, print: true, fullscreen: true, annotate: true, ...(config.toolbar || {}) };
  const figure = (frame.closest(".yape-pdf") as HTMLElement | null) ?? frame;
  const reduceMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const cleanups: (() => void)[] = [];
  const on = <T extends EventTarget>(target: T, type: string, fn: (e: any) => void, o?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, o);
    cleanups.push(() => target.removeEventListener(type, fn, o));
  };

  // ---------- DOM skeleton ----------
  const original = Array.from(frame.childNodes);
  const btn = (label: string, icon: string, extra: Record<string, string | boolean> = {}) =>
    h(doc, "button", { type: "button", class: "yape-btn", "aria-label": label, title: label, html: icon, ...extra });

  const thumbsBtn = btn(t.thumbnails, icons.sidebar, { "aria-expanded": "false" });
  const prevBtn = btn(t.previous, rtl ? icons.next : icons.prev);
  const nextBtn = btn(t.next, rtl ? icons.prev : icons.next);
  const pageInput = h(doc, "input", { class: "yape-page-input", type: "text", inputmode: "numeric", "aria-label": t.page, value: "1", size: "3" });
  const pageCount = h(doc, "span", { class: "yape-page-count" });
  const viewerBtn = btn(t.openViewer, icons.document);
  const downloadBtn = btn(t.download, icons.download);
  const printBtn = btn(t.print, icons.print);
  const fsBtn = btn(t.fullscreen, icons.fullscreen);
  const closeBtn = btn(t.close, icons.close);
  const canOpenViewer = !!opts.openViewer && !!tb && (tb.search || tb.zoom || tb.annotate);

  // RTL books still list their controls left to right: "previous" stays on the right.
  const toolbar = h(
    doc,
    "div",
    { class: "yape-toolbar", role: "toolbar", "aria-label": config.title ? `${t.toolbar}: ${config.title}` : t.toolbar },
    h(doc, "div", { class: "yape-group" }, ...(tb?.sidebar ? [thumbsBtn] : []),
      ...(rtl ? [nextBtn] : [prevBtn]), h(doc, "span", { class: "yape-page" }, pageInput, pageCount), ...(rtl ? [prevBtn] : [nextBtn])),
    h(doc, "div", { class: "yape-group yape-group--end" },
      ...(canOpenViewer ? [viewerBtn] : []),
      ...(tb?.download ? [downloadBtn] : []),
      ...(tb?.print ? [printBtn] : []),
      ...(tb?.fullscreen ? [fsBtn] : []),
      ...(opts.close ? [closeBtn] : [])),
  );

  // Big edge arrows for the mouse; keyboard and screen reader users get the toolbar buttons.
  const sideAttrs: Record<string, string> = tb ? { tabindex: "-1", "aria-hidden": "true" } : {};
  const leftArrow = btn(rtl ? t.next : t.previous, icons.prev, { class: "yape-btn yape-flip__arrow yape-flip__arrow--left", ...sideAttrs });
  const rightArrow = btn(rtl ? t.previous : t.next, icons.next, { class: "yape-btn yape-flip__arrow yape-flip__arrow--right", ...sideAttrs });

  const book = h(doc, "div", { class: "yape-flip__book" });
  const stage = h(doc, "div", {
    class: "yape-flip__stage",
    tabindex: "0",
    role: "region",
    "aria-roledescription": t.flipbook,
    "aria-label": config.title || t.flipbook,
  }, book);
  const message = h(doc, "div", { class: "yape-message", role: "status" }, t.loading);
  const main = h(doc, "div", { class: "yape-main" }, stage, leftArrow, rightArrow, message);
  const thumbs = h(doc, "div", { class: "yape-flip__thumbs", hidden: true, role: "list", "aria-label": t.thumbnails, dir: rtl ? "rtl" : "ltr" });
  const live = h(doc, "div", { class: "yape-sr", "aria-live": "polite" });
  const root = h(doc, "div", { class: "yape-viewer yape-flipbook" + (rtl ? " is-rtl" : "") }, ...(tb ? [toolbar] : []),
    h(doc, "div", { class: "yape-body" }, main), thumbs, live);

  frame.replaceChildren(root);
  frame.classList.add("is-mounted");

  const restore = () => {
    cleanups.forEach((fn) => fn());
    figure.classList.remove("yape-pdf--fs");
    frame.replaceChildren(...original);
    frame.classList.remove("is-mounted");
  };

  const { task: loadingTask, pdf: loaded } = await openDocument(doc, config, message, t);
  if (!loaded) {
    on(closeBtn, "click", () => opts.close?.());
    return () => {
      void loadingTask.destroy();
      restore();
    };
  }
  const pdf: PDFDocumentProxy = loaded;
  const total = pdf.numPages;
  const firstView = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const ratio = firstView.width / firstView.height;

  // Book index (StPageFlip, 0-based) <-> PDF page number. RTL books are built back to front,
  // so turning "forward" in the library reads backwards through the PDF.
  const pdfNum = (i: number) => (rtl ? total - i : i + 1);
  const bookIndex = (n: number) => (rtl ? total - n : n - 1);
  // StPageFlip pairs pages after a lone cover, or from the start. Reversing an RTL book
  // flips that pairing when the page count is odd, so compensate to keep the same spreads.
  const cover = fb.cover !== false;
  const libCover = rtl && total % 2 === 1 ? !cover : cover;

  // ---------- pages ----------
  const sheets: Sheet[] = [];
  for (let i = 0; i < total; i++) {
    const content = h(doc, "div", { class: "yape-flip__content" });
    const el = h(doc, "div", { class: "yape-flip__page", role: "group", "aria-label": format(t.pageThumbnail, pdfNum(i)) },
      content);
    sheets.push({ el, content, width: 0, task: null, extras: false });
  }

  message.hidden = true;
  const startIndex = bookIndex(Math.min(Math.max(config.page ?? 1, 1), total));
  const flip = new PageFlip(book, {
    width: Math.round(firstView.width),
    height: Math.round(firstView.height),
    size: "stretch",
    minWidth: 240,
    maxWidth: 4000,
    minHeight: 100,
    maxHeight: 4000,
    autoSize: false,
    showCover: libCover,
    usePortrait: true,
    startPage: startIndex,
    flippingTime: reduceMotion ? 1 : 700,
    drawShadow: !reduceMotion,
    maxShadowOpacity: 0.4,
    showPageCorners: !reduceMotion,
    mobileScrollSupport: true,
    swipeDistance: 30,
  });
  flip.loadFromHTML(sheets.map((s) => s.el));

  /** Book indexes on screen for a given current index. */
  const spreadOf = (i: number): number[] => {
    if (flip.getOrientation() === "portrait") return [i];
    if (libCover && i === 0) return [0];
    const left = libCover ? i - ((i + 1) % 2) : i - (i % 2);
    return left + 1 < total ? [left, left + 1] : [left];
  };
  const visiblePages = () => spreadOf(flip.getCurrentPageIndex()).map(pdfNum).sort((a, b) => a - b);

  // ---------- rendering ----------
  const pixelRatio = () => Math.min(win.devicePixelRatio || 1, 2);
  let queue: number[] = [];
  let working = false;
  let destroyed = false;

  async function addExtras(sheet: Sheet, page: PDFPageProxy, view: { width: number; height: number }) {
    sheet.extras = true;
    const [annotations, text] = await Promise.all([
      page.getAnnotations({ intent: "display" }).catch(() => []),
      page.getTextContent().catch(() => null),
    ]);
    const base = page.getViewport({ scale: 1 });
    const links = h(doc, "div", { class: "yape-flip__links" });
    for (const a of annotations as { subtype?: string; rect?: number[]; url?: string; dest?: unknown }[]) {
      if (a.subtype !== "Link" || !a.rect || (!a.url && !a.dest)) continue;
      const [x1, y1] = base.convertToViewportPoint(a.rect[0], a.rect[1]) as number[];
      const [x2, y2] = base.convertToViewportPoint(a.rect[2], a.rect[3]) as number[];
      const style = `left:${(Math.min(x1, x2) / view.width) * 100}%;top:${(Math.min(y1, y2) / view.height) * 100}%;` +
        `width:${(Math.abs(x2 - x1) / view.width) * 100}%;height:${(Math.abs(y2 - y1) / view.height) * 100}%`;
      if (a.url) {
        links.append(h(doc, "a", {
          href: a.url,
          style,
          target: config.newTab === false ? "_self" : "_blank",
          rel: "noopener noreferrer nofollow",
          "aria-label": a.url,
        }));
      } else {
        const link = h(doc, "a", { href: "#", style, "aria-label": t.page });
        link.addEventListener("click", (e) => {
          e.preventDefault();
          void goToDest(a.dest);
        });
        links.append(link);
      }
    }
    sheet.content.append(links);
    if (text) {
      const words = text.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
      if (words) sheet.el.append(h(doc, "div", { class: "yape-sr" }, words));
    }
  }

  async function renderSheet(i: number) {
    const sheet = sheets[i];
    const pageWidth = flip.getBoundsRect().pageWidth;
    if (!pageWidth) return;
    const target = pageWidth * pixelRatio();
    if (sheet.width >= target * 0.95) return;

    const page = await pdf.getPage(pdfNum(i));
    const base = page.getViewport({ scale: 1 });
    // Pages with another shape than page 1 are fitted inside the book page, not stretched.
    const boxHeight = pageWidth / ratio;
    const fit = Math.min(pageWidth / base.width, boxHeight / base.height);
    const view = { width: base.width * fit, height: base.height * fit };
    sheet.content.style.width = `${(view.width / pageWidth) * 100}%`;
    sheet.content.style.height = `${(view.height / boxHeight) * 100}%`;

    const viewport = page.getViewport({ scale: fit * pixelRatio() });
    const canvas = h(doc, "canvas", { "aria-hidden": "true" });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    sheet.task = page.render({ canvas, viewport });
    try {
      await sheet.task.promise;
    } catch {
      return; // Cancelled.
    } finally {
      sheet.task = null;
    }
    sheet.content.querySelector("canvas")?.remove();
    sheet.content.prepend(canvas);
    sheet.width = target;
    if (!sheet.extras) void addExtras(sheet, page, base);
  }

  function dropFarSheets(current: number) {
    sheets.forEach((sheet, i) => {
      if (Math.abs(i - current) <= KEEP || !sheet.width) return;
      sheet.task?.cancel();
      const canvas = sheet.content.querySelector("canvas");
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
      }
      sheet.width = 0;
    });
  }

  /** Renders the open spread first, then the pages either side of it. */
  function schedule() {
    const current = flip.getCurrentPageIndex();
    const order: number[] = [...spreadOf(current)];
    for (let d = 1; d <= 3; d++) order.push(current + d + 1, current - d);
    queue = order.filter((i, k) => i >= 0 && i < total && order.indexOf(i) === k);
    dropFarSheets(current);
    if (!working) void work();
  }

  async function work() {
    working = true;
    while (queue.length) {
      const i = queue.shift()!;
      try {
        await renderSheet(i);
      } catch (err) {
        if (!destroyed) console.error("[yape] page render failed", err);
      }
      if (destroyed) break;
    }
    working = false;
  }

  // ---------- navigation ----------
  const announce = (text: string) => {
    live.textContent = "";
    win.setTimeout(() => (live.textContent = text), 50);
  };
  const thumbButtons: HTMLButtonElement[] = [];
  const sync = (speak = false) => {
    const pages = visiblePages();
    const lo = pages[0];
    const hi = pages[pages.length - 1];
    pageInput.value = String(lo);
    prevBtn.disabled = lo <= 1;
    nextBtn.disabled = hi >= total;
    leftArrow.disabled = rtl ? hi >= total : lo <= 1;
    rightArrow.disabled = rtl ? lo <= 1 : hi >= total;
    thumbButtons.forEach((b, k) => (pages.includes(k + 1) ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (!thumbs.hidden) thumbButtons[lo - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (speak) announce(lo === hi ? format(t.pageOf, lo, total) : format(t.pagesOf, lo, hi, total));
  };

  // "Forward" and "back" in reading order; the library's own next/prev are visual.
  const forward = () => (rtl ? flip.flipPrev() : flip.flipNext());
  const back = () => (rtl ? flip.flipNext() : flip.flipPrev());
  const goTo = (n: number) => {
    const page = Math.min(Math.max(1, Math.round(n)), total);
    if (visiblePages().includes(page)) return;
    if (reduceMotion) flip.turnToPage(bookIndex(page));
    else flip.flip(bookIndex(page));
    if (reduceMotion) {
      sync(true);
      schedule();
    }
  };

  flip.on("flip", () => {
    sync(true);
    schedule();
  });
  flip.on("changeOrientation", () => {
    sync();
    schedule();
  });

  pageCount.textContent = format(t.ofPages, total);
  pageInput.size = Math.max(2, String(total).length);
  sync();
  schedule();

  on(prevBtn, "click", back);
  on(nextBtn, "click", forward);
  on(leftArrow, "click", () => flip.flipPrev());
  on(rightArrow, "click", () => flip.flipNext());
  on(pageInput, "change", () => {
    const n = Number.parseInt(pageInput.value, 10);
    if (Number.isFinite(n)) goTo(n);
    else sync();
  });
  on(pageInput, "focus", () => pageInput.select());
  on(root, "keydown", (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => flip.flipPrev(),
      ArrowRight: () => flip.flipNext(),
      PageUp: back,
      PageDown: forward,
      Home: () => goTo(1),
      End: () => goTo(total),
    };
    const fn = keys[e.key];
    if (fn && (e.target === stage || e.target === root || e.key.startsWith("Page") || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      fn();
    }
  });

  async function goToDest(dest: unknown) {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : (dest as unknown[]);
      const ref = explicit?.[0];
      if (ref == null) return;
      const index = typeof ref === "object" ? await pdf.getPageIndex(ref as { num: number; gen: number }) : Number(ref);
      if (Number.isFinite(index)) goTo(index + 1);
    } catch {
      // Broken destination: ignore the click.
    }
  }

  // Keep the book fitted when the frame changes size (full screen, window, editor).
  let resizeFrame = 0;
  const resizeObserver = new (win as typeof window).ResizeObserver(() => {
    win.cancelAnimationFrame(resizeFrame);
    resizeFrame = win.requestAnimationFrame(() => {
      flip.update();
      sync();
      schedule();
    });
  });
  resizeObserver.observe(stage);
  cleanups.push(() => {
    resizeObserver.disconnect();
    win.cancelAnimationFrame(resizeFrame);
  });

  // ---------- thumbnails ----------
  let thumbObserver: IntersectionObserver | null = null;
  async function renderThumb(button: HTMLButtonElement, n: number) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: ((button.clientWidth || 80) / base.width) * pixelRatio() });
    const canvas = h(doc, "canvas", { "aria-hidden": "true" });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    button.querySelector(".yape-thumb__img")?.replaceChildren(canvas);
  }
  function buildThumbs() {
    if (thumbButtons.length) return;
    thumbObserver = new (win as typeof window).IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          thumbObserver?.unobserve(entry.target);
          const b = entry.target as HTMLButtonElement;
          void renderThumb(b, Number(b.dataset.page)).catch(() => {});
        }
      },
      { root: thumbs, rootMargin: "0px 200px" },
    );
    for (let n = 1; n <= total; n++) {
      const b = h(doc, "button", { type: "button", class: "yape-thumb", role: "listitem", "data-page": String(n), "aria-label": format(t.pageThumbnail, n) },
        h(doc, "span", { class: "yape-thumb__img", style: `aspect-ratio:${firstView.width}/${firstView.height}` }),
        h(doc, "span", { class: "yape-thumb__num", "aria-hidden": "true" }, String(n)));
      b.addEventListener("click", () => goTo(n));
      thumbButtons.push(b);
      thumbs.append(b);
      thumbObserver.observe(b);
    }
  }
  const toggleThumbs = (open = thumbs.hidden) => {
    thumbs.hidden = !open;
    thumbsBtn.setAttribute("aria-expanded", String(open));
    if (open) buildThumbs();
    sync();
  };
  on(thumbsBtn, "click", () => toggleThumbs());
  if (tb?.sidebar && config.sidebarOpen) toggleThumbs(true);

  // ---------- toolbar actions ----------
  on(viewerBtn, "click", () => opts.openViewer?.());
  on(closeBtn, "click", () => opts.close?.());
  on(downloadBtn, "click", () => download(doc, config.url, fileName(config)));
  on(printBtn, "click", async () => {
    printBtn.disabled = true;
    announce(t.preparingPrint);
    try {
      await printDocument(pdf, win);
    } finally {
      printBtn.disabled = false;
    }
  });
  bindFullscreen(doc, figure, fsBtn, t, on, () => stage.focus());

  return () => {
    destroyed = true;
    queue = [];
    sheets.forEach((s) => s.task?.cancel());
    thumbObserver?.disconnect();
    try {
      flip.destroy();
    } catch {
      // Already detached.
    }
    void loadingTask.destroy();
    restore();
  };
}

/**
 * Draws page 1 into `target` for a lightbox cover when the site has no preview image.
 * Fetches only the parts of the PDF it needs where the server allows range requests.
 */
export async function renderCover(target: HTMLElement, config: ViewerConfig, cssWidth: number): Promise<void> {
  const doc = target.ownerDocument;
  const win = doc.defaultView ?? window;
  const task = pdfjsLib.getDocument({ ...documentParams(config.url, doc), disableAutoFetch: true });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * Math.min(win.devicePixelRatio || 1, 2) });
    const canvas = h(doc, "canvas", { "aria-hidden": "true" });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    target.replaceChildren(canvas);
  } catch {
    // Keep the plain link (password protected or unreadable PDF).
  } finally {
    void task.destroy();
  }
}
