// The full viewer: pdf.js document + PDFViewer component + our toolbar, find bar,
// sidebar (thumbnails, outline), download, print and full screen.
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import { format, strings, type ViewerConfig } from "./config";
import { icons } from "./icons";
import { printDocument } from "./print";
import { createAnnotator, HIGHLIGHT_COLORS, type Annotator } from "./annotate";

const assetBase = new URL("../pdfjs/", import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.js", assetBase).href;

const PRESETS = ["auto", "page-fit", "page-width", "page-actual"] as const;
const PERCENTS = [50, 75, 100, 125, 150, 200, 300, 400];

type Toolbar = Exclude<ViewerConfig["toolbar"], false | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
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

function fileName(config: ViewerConfig): string {
  try {
    const last = new URL(config.url, location.href).pathname.split("/").pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // Fall through.
  }
  return (config.title || "document").replace(/[\\/:*?"<>|]+/g, "-") + ".pdf";
}

export async function createViewer(frame: HTMLElement, config: ViewerConfig): Promise<() => void> {
  const doc = frame.ownerDocument;
  const win = doc.defaultView ?? window;
  const t = strings();
  const tb: Toolbar | null =
    config.toolbar === false
      ? null
      : { sidebar: true, search: true, zoom: true, download: true, print: true, fullscreen: true, annotate: true, ...config.toolbar };
  const figure = (frame.closest(".yape-pdf") as HTMLElement | null) ?? frame;
  const cleanups: (() => void)[] = [];
  const on = <T extends EventTarget>(target: T, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // ---------- DOM skeleton ----------
  const original = Array.from(frame.childNodes);
  const btn = (label: string, icon: string, extra: Record<string, string | boolean> = {}) =>
    h(doc, "button", { type: "button", class: "yape-btn", "aria-label": label, title: label, html: icon, ...extra });

  const sidebarBtn = btn(t.sidebar, icons.sidebar, { "aria-expanded": "false" });
  const prevBtn = btn(t.previous, icons.prev);
  const nextBtn = btn(t.next, icons.next);
  const pageInput = h(doc, "input", {
    class: "yape-page-input",
    type: "text",
    inputmode: "numeric",
    "aria-label": t.page,
    value: "1",
    size: "3",
  });
  const pageCount = h(doc, "span", { class: "yape-page-count" });
  const zoomOutBtn = btn(t.zoomOut, icons.zoomOut);
  const zoomInBtn = btn(t.zoomIn, icons.zoomIn);
  const zoomSelect = h(doc, "select", { class: "yape-zoom", "aria-label": t.zoom });
  const customZoom = h(doc, "option", { value: "custom", hidden: true, disabled: true });
  zoomSelect.append(
    h(doc, "option", { value: "auto" }, t.zoomAuto),
    h(doc, "option", { value: "page-fit" }, t.zoomPageFit),
    h(doc, "option", { value: "page-width" }, t.zoomPageWidth),
    h(doc, "option", { value: "page-actual" }, t.zoomActual),
    ...PERCENTS.map((p) => h(doc, "option", { value: String(p / 100) }, `${p}%`)),
    customZoom,
  );
  const searchBtn = btn(t.search, icons.search, { "aria-expanded": "false" });
  const annotateBtn = btn(t.annotate, icons.annotate, { "aria-expanded": "false" });
  const downloadBtn = btn(t.download, icons.download);
  const printBtn = btn(t.print, icons.print);
  const fsBtn = btn(t.fullscreen, icons.fullscreen);

  const toolbar = h(
    doc,
    "div",
    { class: "yape-toolbar", role: "toolbar", "aria-label": config.title ? `${t.toolbar}: ${config.title}` : t.toolbar },
    h(doc, "div", { class: "yape-group" }, ...(tb?.sidebar ? [sidebarBtn] : []), prevBtn,
      h(doc, "span", { class: "yape-page" }, pageInput, pageCount), nextBtn),
    h(doc, "div", { class: "yape-group yape-group--zoom" }, ...(tb?.zoom ? [zoomOutBtn, zoomSelect, zoomInBtn] : [])),
    h(doc, "div", { class: "yape-group yape-group--end" },
      ...(tb?.annotate ? [annotateBtn] : []),
      ...(tb?.search ? [searchBtn] : []),
      ...(tb?.download ? [downloadBtn] : []),
      ...(tb?.print ? [printBtn] : []),
      ...(tb?.fullscreen ? [fsBtn] : [])),
  );

  const findInput = h(doc, "input", {
    class: "yape-find-input",
    type: "search",
    placeholder: t.searchPlaceholder,
    "aria-label": t.searchPlaceholder,
  });
  const findPrev = btn(t.findPrevious, icons.up);
  const findNext = btn(t.findNext, icons.down);
  const findStatus = h(doc, "span", { class: "yape-find-status", role: "status", "aria-live": "polite" });
  const findClose = btn(t.close, icons.close);
  const findbar = h(doc, "div", { class: "yape-findbar", hidden: true, role: "search" },
    findInput, findPrev, findNext, findStatus, findClose);

  const editbar = h(doc, "div", { class: "yape-editbar", hidden: true });

  const thumbsTab = h(doc, "button", { type: "button", role: "tab", class: "yape-tab", "aria-selected": "true" }, t.thumbnails);
  const outlineTab = h(doc, "button", { type: "button", role: "tab", class: "yape-tab", "aria-selected": "false", hidden: true }, t.outline);
  const thumbsPanel = h(doc, "div", { class: "yape-thumbs", role: "tabpanel", "aria-label": t.thumbnails });
  const outlinePanel = h(doc, "div", { class: "yape-outline", role: "tabpanel", "aria-label": t.outline, hidden: true });
  const sidebar = h(doc, "aside", { class: "yape-sidebar", hidden: true },
    h(doc, "div", { class: "yape-tabs", role: "tablist" }, thumbsTab, outlineTab), thumbsPanel, outlinePanel);

  const pages = h(doc, "div", { class: "pdfViewer" });
  const container = h(doc, "div", { class: "yape-container", tabindex: "0", "aria-label": config.title || t.page }, pages);
  const message = h(doc, "div", { class: "yape-message", role: "status" }, t.loading);
  const main = h(doc, "div", { class: "yape-main" }, container, message);
  const live = h(doc, "div", { class: "yape-sr", "aria-live": "polite" });
  const root = h(doc, "div", { class: "yape-viewer" }, ...(tb ? [toolbar, findbar, editbar] : []),
    h(doc, "div", { class: "yape-body" }, sidebar, main), live);

  frame.replaceChildren(root);
  frame.classList.add("is-mounted");

  // ---------- pdf.js components ----------
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({
    eventBus,
    externalLinkTarget: config.newTab === false ? LinkTarget.SELF : LinkTarget.BLANK,
    externalLinkRel: "noopener noreferrer nofollow",
  });
  const findController = new PDFFindController({ eventBus, linkService, updateMatchesCountOnProgress: true });
  const viewer = new PDFViewer({
    container,
    viewer: pages,
    eventBus,
    linkService,
    findController,
    textLayerMode: 1,
    annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
    annotationEditorMode: tb?.annotate ? pdfjsLib.AnnotationEditorType.NONE : pdfjsLib.AnnotationEditorType.DISABLE,
    annotationEditorHighlightColors: Object.entries(HIGHLIGHT_COLORS).map(([k, v]) => `${k}=${v}`).join(","),
    removePageBorders: false,
  });
  linkService.setViewer(viewer);

  const loadingTask = pdfjsLib.getDocument({
    url: config.url,
    cMapUrl: new URL("cmaps/", assetBase).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", assetBase).href,
    wasmUrl: new URL("wasm/", assetBase).href,
    iccUrl: new URL("iccs/", assetBase).href,
    enableXfa: false,
  });
  loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total > 0) message.textContent = `${t.loading} ${Math.min(100, Math.round((loaded / total) * 100))}%`;
  };
  loadingTask.onPassword = (update: (pw: string) => void, reason: number) => {
    askPassword(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD).then(update);
  };

  function askPassword(wrong: boolean): Promise<string> {
    return new Promise((resolve) => {
      const input = h(doc, "input", { type: "password", "aria-label": t.password, autocomplete: "off" });
      const form = h(doc, "form", { class: "yape-password" },
        h(doc, "p", {}, wrong ? t.passwordWrong : t.passwordPrompt),
        input,
        h(doc, "button", { type: "submit", class: "yape-btn yape-btn--text" }, t.open));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        message.replaceChildren(t.loading);
        resolve(input.value);
      });
      message.hidden = false;
      message.replaceChildren(form);
      input.focus();
    });
  }

  let pdf: PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    if ((err as Error)?.name === "AbortException") return () => {};
    message.replaceChildren(
      h(doc, "p", {}, t.error),
      h(doc, "a", { href: config.url, target: "_blank", rel: "noopener" }, t.openDirectly),
    );
    message.classList.add("is-error");
    console.error("[yape] PDF load failed", err);
    return () => {
      void loadingTask.destroy();
      frame.replaceChildren(...original);
      frame.classList.remove("is-mounted");
    };
  }

  message.hidden = true;
  viewer.setDocument(pdf);
  linkService.setDocument(pdf, null);
  pageCount.textContent = format(t.ofPages, pdf.numPages);
  pageInput.size = Math.max(2, String(pdf.numPages).length);

  // ---------- navigation and zoom ----------
  const thumbs: HTMLButtonElement[] = [];
  let thumbObserver: IntersectionObserver | null = null;
  let sidebarBuilt = false;
  const announce = (text: string) => {
    live.textContent = "";
    win.setTimeout(() => (live.textContent = text), 50);
  };
  const updateNav = (n: number) => {
    pageInput.value = String(n);
    prevBtn.disabled = n <= 1;
    nextBtn.disabled = n >= pdf.numPages;
    markThumb(n);
  };
  const goTo = (n: number) => {
    const page = Math.min(Math.max(1, Math.round(n)), pdf.numPages);
    viewer.currentPageNumber = page;
    announce(format(t.pageOf, page, pdf.numPages));
  };

  eventBus.on("pagesinit", () => {
    viewer.currentScaleValue = config.zoom || "auto";
    if (config.page && config.page > 1) viewer.currentPageNumber = Math.min(config.page, pdf.numPages);
  });
  eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => updateNav(pageNumber));
  eventBus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
    if (presetValue && (PRESETS as readonly string[]).includes(presetValue)) {
      zoomSelect.value = presetValue;
      return;
    }
    const match = PERCENTS.find((p) => Math.abs(p / 100 - scale) < 0.001);
    if (match) zoomSelect.value = String(match / 100);
    else {
      customZoom.textContent = `${Math.round(scale * 100)}%`;
      zoomSelect.value = "custom";
    }
  });
  updateNav(1);

  on(prevBtn, "click", () => goTo(viewer.currentPageNumber - 1));
  on(nextBtn, "click", () => goTo(viewer.currentPageNumber + 1));
  on(pageInput, "change", () => {
    const n = Number.parseInt(pageInput.value, 10);
    if (Number.isFinite(n)) goTo(n);
    else pageInput.value = String(viewer.currentPageNumber);
  });
  on(pageInput, "focus", () => pageInput.select());
  on(zoomInBtn, "click", () => viewer.increaseScale());
  on(zoomOutBtn, "click", () => viewer.decreaseScale());
  on(zoomSelect, "change", () => {
    if (zoomSelect.value !== "custom") viewer.currentScaleValue = zoomSelect.value;
  });

  // Keep preset zooms (auto / fit / width) correct when the viewer is resized.
  const resizeObserver = new (win as typeof window).ResizeObserver(() => {
    const v = viewer.currentScaleValue;
    if ((PRESETS as readonly string[]).includes(v)) viewer.currentScaleValue = v;
  });
  resizeObserver.observe(container);
  cleanups.push(() => resizeObserver.disconnect());

  // ---------- find ----------
  const find = (type: "" | "again", findPrevious = false) =>
    eventBus.dispatch("find", {
      source: null,
      type,
      query: findInput.value,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  const openFind = () => {
    findbar.hidden = false;
    searchBtn.setAttribute("aria-expanded", "true");
    findInput.focus();
    findInput.select();
  };
  const closeFind = () => {
    findbar.hidden = true;
    searchBtn.setAttribute("aria-expanded", "false");
    findInput.value = "";
    findStatus.textContent = "";
    find("");
    searchBtn.focus();
  };
  on(searchBtn, "click", () => (findbar.hidden ? openFind() : closeFind()));
  on(findInput, "input", () => find(""));
  on(findInput, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      find("again", e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  on(findPrev, "click", () => find("again", true));
  on(findNext, "click", () => find("again", false));
  on(findClose, "click", closeFind);
  const showMatches = ({ current, total }: { current: number; total: number }) => {
    if (!findInput.value) findStatus.textContent = "";
    else findStatus.textContent = total ? format(t.matchOf, current, total) : t.noMatches;
  };
  eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
    showMatches(matchesCount),
  );
  eventBus.on(
    "updatefindcontrolstate",
    ({ state, matchesCount }: { state: number; matchesCount?: { current: number; total: number } }) => {
      if (state === FindState.NOT_FOUND) findStatus.textContent = findInput.value ? t.noMatches : "";
      else if (matchesCount) showMatches(matchesCount);
    },
  );

  // ---------- annotate and sign ----------
  let annotator: Annotator | null = null;
  if (tb?.annotate) {
    annotator = createAnnotator({ doc, win, t, pdf, viewer, eventBus, bar: editbar, announce });
    const syncAnnotate = () => annotateBtn.setAttribute("aria-expanded", String(annotator!.isOpen));
    on(annotateBtn, "click", () => {
      if (annotator!.isOpen) annotator!.close();
      else annotator!.open();
      syncAnnotate();
    });
    on(editbar, "click", () => win.setTimeout(syncAnnotate, 0));
    cleanups.push(() => annotator?.destroy());
  }

  // ---------- keyboard ----------
  on(root, "keydown", (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "f" && tb?.search) {
      e.preventDefault();
      openFind();
    } else if (mod && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      viewer.increaseScale();
    } else if (mod && e.key === "-") {
      e.preventDefault();
      viewer.decreaseScale();
    } else if (mod && e.key === "0") {
      e.preventDefault();
      viewer.currentScaleValue = "auto";
    } else if (e.target === container && !mod) {
      if (e.key === "n" || e.key === "j") goTo(viewer.currentPageNumber + 1);
      else if (e.key === "p" || e.key === "k") goTo(viewer.currentPageNumber - 1);
    }
  });

  // ---------- sidebar: thumbnails + outline ----------

  function markThumb(n: number) {
    thumbs.forEach((b, i) => (i + 1 === n ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (!sidebar.hidden) thumbs[n - 1]?.scrollIntoView({ block: "nearest" });
  }

  async function renderThumb(button: HTMLButtonElement, n: number) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = (button.clientWidth || 120) / base.width;
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * ratio });
    const canvas = h(doc, "canvas", { "aria-hidden": "true" });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    button.querySelector(".yape-thumb__img")?.replaceChildren(canvas);
  }

  async function buildSidebar() {
    if (sidebarBuilt) return;
    sidebarBuilt = true;
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
    thumbObserver = new (win as typeof window).IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          thumbObserver?.unobserve(entry.target);
          const b = entry.target as HTMLButtonElement;
          void renderThumb(b, Number(b.dataset.page));
        }
      },
      { root: thumbsPanel, rootMargin: "200px 0px" },
    );
    for (let n = 1; n <= pdf.numPages; n++) {
      const b = h(doc, "button", { type: "button", class: "yape-thumb", "data-page": String(n), "aria-label": format(t.pageThumbnail, n) },
        h(doc, "span", { class: "yape-thumb__img", style: `aspect-ratio:${first.width}/${first.height}` }),
        h(doc, "span", { class: "yape-thumb__num", "aria-hidden": "true" }, String(n)));
      b.addEventListener("click", () => goTo(n));
      thumbs.push(b);
      thumbsPanel.append(b);
      thumbObserver.observe(b);
    }
    markThumb(viewer.currentPageNumber);
  }

  type OutlineItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];
  const buildOutline = (items: OutlineItem[]): HTMLUListElement =>
    h(doc, "ul", {}, ...items.map((item) => {
      const b = h(doc, "button", { type: "button", class: "yape-outline__item" }, item.title || "—");
      b.addEventListener("click", () => {
        if (item.dest) void linkService.goToDestination(item.dest);
        else if (item.url) win.open(item.url, config.newTab === false ? "_self" : "_blank", "noopener");
      });
      return h(doc, "li", {}, b, ...(item.items?.length ? [buildOutline(item.items)] : []));
    }));
  void pdf.getOutline().then((outline) => {
    if (!outline?.length) return;
    outlinePanel.replaceChildren(buildOutline(outline));
    outlineTab.hidden = false;
  });

  const selectTab = (outline: boolean) => {
    thumbsTab.setAttribute("aria-selected", String(!outline));
    outlineTab.setAttribute("aria-selected", String(outline));
    thumbsPanel.hidden = outline;
    outlinePanel.hidden = !outline;
  };
  on(thumbsTab, "click", () => selectTab(false));
  on(outlineTab, "click", () => selectTab(true));

  const toggleSidebar = (open = sidebar.hidden === true) => {
    sidebar.hidden = !open;
    sidebarBtn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("has-sidebar", open);
    if (open) void buildSidebar();
  };
  on(sidebarBtn, "click", () => toggleSidebar());
  if (tb?.sidebar && config.sidebarOpen) toggleSidebar(true);

  // ---------- download, print, full screen ----------
  on(downloadBtn, "click", async () => {
    const name = fileName(config);
    let href = config.url;
    let revoke = false;
    await annotator?.commit();
    // Form fields the visitor filled in are saved into the downloaded copy.
    if (pdf.annotationStorage.size > 0) {
      const bytes = await pdf.saveDocument();
      href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      revoke = true;
    }
    const a = h(doc, "a", { href, download: name, rel: "noopener" });
    doc.body.append(a);
    a.click();
    a.remove();
    annotator?.markSaved();
    if (revoke) win.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  });

  on(printBtn, "click", async () => {
    printBtn.disabled = true;
    announce(t.preparingPrint);
    await annotator?.commit();
    try {
      await printDocument(pdf, win);
    } finally {
      printBtn.disabled = false;
    }
  });

  const isFullscreen = () => doc.fullscreenElement === figure || figure.classList.contains("yape-pdf--fs");
  const syncFs = () => {
    const fs = isFullscreen();
    fsBtn.innerHTML = fs ? icons.exitFullscreen : icons.fullscreen;
    fsBtn.setAttribute("aria-label", fs ? t.exitFullscreen : t.fullscreen);
    fsBtn.title = fs ? t.exitFullscreen : t.fullscreen;
  };
  on(fsBtn, "click", async () => {
    if (doc.fullscreenElement === figure) await doc.exitFullscreen();
    else if (figure.classList.contains("yape-pdf--fs")) figure.classList.remove("yape-pdf--fs");
    else if (figure.requestFullscreen && doc.fullscreenEnabled) await figure.requestFullscreen().catch(() => figure.classList.add("yape-pdf--fs"));
    else figure.classList.add("yape-pdf--fs"); // iPhone Safari: no element full screen.
    syncFs();
    container.focus();
  });
  on(doc, "fullscreenchange", syncFs);
  on(doc, "keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && figure.classList.contains("yape-pdf--fs")) {
      figure.classList.remove("yape-pdf--fs");
      syncFs();
    }
  });

  return () => {
    cleanups.forEach((fn) => fn());
    thumbObserver?.disconnect();
    void loadingTask.destroy();
    figure.classList.remove("yape-pdf--fs");
    frame.replaceChildren(...original);
    frame.classList.remove("is-mounted");
  };
}
