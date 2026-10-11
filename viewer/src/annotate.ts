// Annotate, draw, add text/images and sign, using pdf.js's built-in annotation editors.
// Everything stays in the visitor's browser; Download saves the edits into their copy.
import { AnnotationEditorParamsType, AnnotationEditorType, type PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { Strings } from "./config";
import { icons } from "./icons";
import { openSignatureDialog } from "./signature";

type Mode = "highlight" | "ink" | "freetext" | "stamp" | "signature";
type Size = "s" | "m" | "l";

const MODES: Record<Exclude<Mode, "signature">, number> = {
  highlight: AnnotationEditorType.HIGHLIGHT,
  ink: AnnotationEditorType.INK,
  freetext: AnnotationEditorType.FREETEXT,
  stamp: AnnotationEditorType.STAMP,
};

/** Highlight colours must be pastel so text stays readable underneath. */
export const HIGHLIGHT_COLORS = { yellow: "#FFFF98", green: "#53FFBC", blue: "#80EBFF", pink: "#FFCBE6", red: "#FF4F5F" };
const PEN_COLORS = { black: "#000000", blue: "#1B4FD8", red: "#D32F2F", green: "#2E7D32", orange: "#EF6C00" };
const SIZES = {
  ink: { s: 2, m: 4, l: 8 },
  freetext: { s: 12, m: 16, l: 24 },
  highlight: { s: 8, m: 14, l: 22 },
} as const;

export interface AnnotateContext {
  doc: Document;
  win: Window;
  t: Strings;
  pdf: PDFDocumentProxy;
  viewer: PDFViewer;
  eventBus: EventBus;
  bar: HTMLElement;
  announce: (text: string) => void;
}

export interface Annotator {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  /** Finishes any in-progress drawing/text so it is included when saving or printing. */
  commit(): Promise<void>;
  /** Call after a download: the edits are safely in the visitor's copy. */
  markSaved(): void;
  destroy(): void;
}

export function createAnnotator(ctx: AnnotateContext): Annotator {
  const { doc, win, t, pdf, viewer, eventBus, bar } = ctx;
  const listeners: (() => void)[] = [];
  const on = (el: EventTarget, type: string, fn: (e: any) => void) => {
    el.addEventListener(type, fn);
    listeners.push(() => el.removeEventListener(type, fn));
  };
  const button = (label: string, icon: string, extra: Record<string, string> = {}) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "yape-btn";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = icon;
    for (const [k, v] of Object.entries(extra)) b.setAttribute(k, v);
    return b;
  };

  // ---------- state ----------
  let mode: Mode | null = null;
  let isOpen = false;
  let dirty = false;
  const colors: Record<"highlight" | "ink" | "freetext", string> = {
    highlight: HIGHLIGHT_COLORS.yellow,
    ink: PEN_COLORS.blue,
    freetext: PEN_COLORS.black,
  };
  const sizes: Record<keyof typeof SIZES, Size> = { ink: "m", freetext: "m", highlight: "m" };

  const setParam = (type: number, value: unknown) => eventBus.dispatch("switchannotationeditorparams", { source: null, type, value });

  /** Switches the pdf.js editor mode and resolves once the layers are ready. */
  const setEditorMode = (value: number) =>
    new Promise<void>((resolve) => {
      // The getter returns the numeric mode (the setter takes an object).
      if ((viewer.annotationEditorMode as unknown as number) === value) return resolve();
      const done = ({ mode: m }: { mode: number }) => {
        if (m !== value) return;
        eventBus.off("annotationeditormodechanged", done);
        resolve();
      };
      eventBus.on("annotationeditormodechanged", done);
      viewer.annotationEditorMode = { mode: value };
      win.setTimeout(() => {
        eventBus.off("annotationeditormodechanged", done);
        resolve();
      }, 3000);
    });

  // ---------- DOM ----------
  const modeButtons = {
    highlight: button(t.highlight, icons.highlight, { "aria-pressed": "false" }),
    ink: button(t.draw, icons.draw, { "aria-pressed": "false" }),
    freetext: button(t.text, icons.text, { "aria-pressed": "false" }),
    stamp: button(t.image, icons.image, { "aria-pressed": "false" }),
    signature: button(t.signature, icons.signature, { "aria-pressed": "false" }),
  };
  const swatches = doc.createElement("div");
  swatches.className = "yape-swatches";
  swatches.setAttribute("role", "radiogroup");
  swatches.setAttribute("aria-label", t.color);
  const sizeSelect = doc.createElement("select");
  sizeSelect.className = "yape-size";
  sizeSelect.setAttribute("aria-label", t.size);
  for (const [value, label] of [["s", t.small], ["m", t.medium], ["l", t.large]] as const) {
    const o = doc.createElement("option");
    o.value = value;
    o.textContent = label;
    sizeSelect.append(o);
  }
  const undoBtn = button(t.undo, icons.undo);
  const redoBtn = button(t.redo, icons.redo);
  const deleteBtn = button(t.deleteSelected, icons.trash);
  const doneBtn = doc.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "yape-btn yape-btn--text";
  doneBtn.textContent = t.done;
  undoBtn.disabled = redoBtn.disabled = deleteBtn.disabled = true;

  const group = (...nodes: HTMLElement[]) => {
    const g = doc.createElement("div");
    g.className = "yape-group";
    g.append(...nodes);
    return g;
  };
  const styleGroup = group(swatches, sizeSelect);
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", t.annotate);
  bar.append(
    group(...Object.values(modeButtons)),
    styleGroup,
    group(undoBtn, redoBtn, deleteBtn),
    group(doneBtn),
  );

  function renderStyleControls() {
    const kind = mode === "highlight" || mode === "ink" || mode === "freetext" ? mode : null;
    styleGroup.hidden = !kind;
    if (!kind) return;
    const palette = kind === "highlight" ? HIGHLIGHT_COLORS : PEN_COLORS;
    swatches.replaceChildren(
      ...Object.entries(palette).map(([name, hex]) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "yape-swatch";
        b.style.setProperty("--swatch", hex);
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(colors[kind].toLowerCase() === hex.toLowerCase()));
        b.setAttribute("aria-label", (t as unknown as Record<string, string>)[`color_${name}`] ?? name);
        b.title = b.getAttribute("aria-label")!;
        b.addEventListener("click", () => {
          colors[kind] = hex;
          applyStyle(kind);
          renderStyleControls();
        });
        return b;
      }),
    );
    sizeSelect.value = sizes[kind];
  }

  function applyStyle(kind: "highlight" | "ink" | "freetext") {
    if (kind === "highlight") {
      setParam(AnnotationEditorParamsType.HIGHLIGHT_COLOR, colors.highlight);
      setParam(AnnotationEditorParamsType.HIGHLIGHT_THICKNESS, SIZES.highlight[sizes.highlight]);
    } else if (kind === "ink") {
      setParam(AnnotationEditorParamsType.INK_COLOR, colors.ink);
      setParam(AnnotationEditorParamsType.INK_THICKNESS, SIZES.ink[sizes.ink]);
    } else {
      setParam(AnnotationEditorParamsType.FREETEXT_COLOR, colors.freetext);
      setParam(AnnotationEditorParamsType.FREETEXT_SIZE, SIZES.freetext[sizes.freetext]);
    }
  }

  on(sizeSelect, "change", () => {
    if (mode === "highlight" || mode === "ink" || mode === "freetext") {
      sizes[mode] = sizeSelect.value as Size;
      applyStyle(mode);
    }
  });

  async function selectMode(next: Mode | null) {
    mode = next;
    for (const [key, b] of Object.entries(modeButtons)) b.setAttribute("aria-pressed", String(key === next));
    renderStyleControls();
    if (next === "signature") {
      const file = await openSignatureDialog(doc, t);
      if (!file) {
        await selectMode(null);
        return;
      }
      await setEditorMode(AnnotationEditorType.STAMP);
      setParam(AnnotationEditorParamsType.CREATE, { bitmapFile: file });
      mode = "stamp";
      for (const [key, b] of Object.entries(modeButtons)) b.setAttribute("aria-pressed", String(key === "stamp"));
      renderStyleControls();
      ctx.announce(t.signatureAdded);
      return;
    }
    await setEditorMode(next ? MODES[next] : AnnotationEditorType.NONE);
    if (next === "highlight" || next === "ink" || next === "freetext") applyStyle(next);
    // Image: open the file chooser straight away (pdf.js places it on the current page).
    if (next === "stamp") setParam(AnnotationEditorParamsType.CREATE, {});
  }

  for (const [key, b] of Object.entries(modeButtons) as [Mode, HTMLButtonElement][]) {
    on(b, "click", () => void selectMode(mode === key && key !== "stamp" && key !== "signature" ? null : key));
  }
  on(undoBtn, "click", () => eventBus.dispatch("editingaction", { source: null, name: "undo" }));
  on(redoBtn, "click", () => eventBus.dispatch("editingaction", { source: null, name: "redo" }));
  on(deleteBtn, "click", () => eventBus.dispatch("editingaction", { source: null, name: "delete" }));
  on(doneBtn, "click", () => api.close());

  const onStates = ({ details }: { details: Record<string, boolean> }) => {
    if ("hasSomethingToUndo" in details) undoBtn.disabled = !details.hasSomethingToUndo;
    if ("hasSomethingToRedo" in details) redoBtn.disabled = !details.hasSomethingToRedo;
    if ("hasSelectedEditor" in details) deleteBtn.disabled = !details.hasSelectedEditor;
    if (details.isEmpty === false) dirty = true;
  };
  eventBus.on("editingstateschanged", onStates);
  listeners.push(() => eventBus.off("editingstateschanged", onStates));

  // Warn before leaving the page with edits that were not downloaded.
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty && pdf.annotationStorage.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  on(win, "beforeunload", beforeUnload);

  const api: Annotator = {
    open() {
      isOpen = true;
      bar.hidden = false;
      renderStyleControls();
      modeButtons.highlight.focus();
    },
    close() {
      isOpen = false;
      bar.hidden = true;
      void selectMode(null);
    },
    get isOpen() {
      return isOpen;
    },
    async commit() {
      if (mode) await selectMode(null);
    },
    markSaved() {
      dirty = false;
    },
    destroy() {
      listeners.forEach((fn) => fn());
    },
  };
  bar.hidden = true;
  renderStyleControls();
  return api;
}
