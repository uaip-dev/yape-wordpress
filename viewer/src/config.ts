// Viewer configuration (from the server-rendered `data-yape` attribute) and UI strings.

export type Zoom =
  | "auto"
  | "page-fit"
  | "page-width"
  | "page-actual"
  | `${number}`;

export interface FlipbookConfig {
  /** Show the first page alone, like a closed book (default true). */
  cover?: boolean;
  /** Right-to-left page order (Arabic, Hebrew, Jawi, manga). */
  rtl?: boolean;
  /** Show only the cover; the flipbook opens in a lightbox when clicked. */
  lightbox?: boolean;
}

export interface ViewerConfig {
  url: string;
  /** "flipbook" shows pages as a book with page-turn animation. */
  mode?: "viewer" | "flipbook";
  flipbook?: FlipbookConfig;
  title?: string;
  /** 1-based page to open at. */
  page?: number;
  zoom?: Zoom;
  load?: "scroll" | "click";
  /** Open external links in a new tab. */
  newTab?: boolean;
  sidebarOpen?: boolean;
  toolbar?: {
    sidebar?: boolean;
    search?: boolean;
    zoom?: boolean;
    download?: boolean;
    print?: boolean;
    fullscreen?: boolean;
    annotate?: boolean;
  } | false;
}

export interface Strings {
  loadPdf: string;
  loading: string;
  toolbar: string;
  sidebar: string;
  thumbnails: string;
  outline: string;
  noOutline: string;
  previous: string;
  next: string;
  page: string;
  pageOf: string; // "Page %1$s of %2$s"
  ofPages: string; // "of %s"
  zoomIn: string;
  zoomOut: string;
  zoom: string;
  zoomAuto: string;
  zoomPageFit: string;
  zoomPageWidth: string;
  zoomActual: string;
  search: string;
  searchPlaceholder: string;
  findPrevious: string;
  findNext: string;
  matchOf: string; // "%1$s of %2$s"
  noMatches: string;
  close: string;
  download: string;
  print: string;
  preparingPrint: string;
  fullscreen: string;
  exitFullscreen: string;
  passwordPrompt: string;
  passwordWrong: string;
  password: string;
  open: string;
  error: string;
  openDirectly: string;
  pageThumbnail: string; // "Page %s"
  annotate: string;
  highlight: string;
  draw: string;
  text: string;
  image: string;
  signature: string;
  color: string;
  size: string;
  small: string;
  medium: string;
  large: string;
  undo: string;
  redo: string;
  deleteSelected: string;
  done: string;
  addSignature: string;
  drawSignature: string;
  typeSignature: string;
  typeSignaturePlaceholder: string;
  clear: string;
  cancel: string;
  add: string;
  signatureAdded: string;
  color_black: string;
  color_blue: string;
  color_red: string;
  color_green: string;
  color_orange: string;
  color_yellow: string;
  color_pink: string;
  flipbook: string;
  pagesOf: string; // "Pages %1$s–%2$s of %3$s"
  openViewer: string;
  openFlipbook: string; // "Open flipbook: %s"
}

const fallback: Strings = {
  loadPdf: "Load PDF",
  loading: "Loading PDF…",
  toolbar: "PDF toolbar",
  sidebar: "Toggle sidebar",
  thumbnails: "Thumbnails",
  outline: "Outline",
  noOutline: "This document has no outline.",
  previous: "Previous page",
  next: "Next page",
  page: "Page",
  pageOf: "Page %1$s of %2$s",
  ofPages: "of %s",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoom: "Zoom",
  zoomAuto: "Automatic",
  zoomPageFit: "Page fit",
  zoomPageWidth: "Page width",
  zoomActual: "Actual size",
  search: "Search",
  searchPlaceholder: "Find in document",
  findPrevious: "Previous match",
  findNext: "Next match",
  matchOf: "%1$s of %2$s",
  noMatches: "No matches",
  close: "Close",
  download: "Download",
  print: "Print",
  preparingPrint: "Preparing to print…",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  passwordPrompt: "This PDF is password protected.",
  passwordWrong: "Incorrect password. Try again.",
  password: "Password",
  open: "Open",
  error: "The PDF could not be displayed.",
  openDirectly: "Open the PDF",
  pageThumbnail: "Page %s",
  annotate: "Annotate and sign",
  highlight: "Highlight",
  draw: "Draw",
  text: "Add text",
  image: "Add image",
  signature: "Add signature",
  color: "Colour",
  size: "Size",
  small: "Small",
  medium: "Medium",
  large: "Large",
  undo: "Undo",
  redo: "Redo",
  deleteSelected: "Delete selected",
  done: "Done",
  addSignature: "Add your signature",
  drawSignature: "Draw",
  typeSignature: "Type",
  typeSignaturePlaceholder: "Type your name",
  clear: "Clear",
  cancel: "Cancel",
  add: "Add",
  signatureAdded: "Signature added. Drag it into place.",
  color_black: "Black",
  color_blue: "Blue",
  color_red: "Red",
  color_green: "Green",
  color_orange: "Orange",
  color_yellow: "Yellow",
  color_pink: "Pink",
  flipbook: "Flipbook",
  pagesOf: "Pages %1$s–%2$s of %3$s",
  openViewer: "Open in document viewer",
  openFlipbook: "Open flipbook: %s",
};

let cached: Strings | null = null;

/** Translated strings printed by PHP into #yape-viewer-data, with English fallback. */
export function strings(): Strings {
  if (cached) return cached;
  let fromPage: Partial<Strings> = {};
  const node = document.getElementById("yape-viewer-data");
  if (node?.textContent) {
    try {
      fromPage = (JSON.parse(node.textContent) as { i18n?: Partial<Strings> }).i18n ?? {};
    } catch {
      // Ignore malformed data and use English.
    }
  }
  cached = { ...fallback, ...fromPage };
  return cached;
}

/** Replaces %s / %1$s / %2$s placeholders. */
export function format(template: string, ...args: (string | number)[]): string {
  let i = 0;
  return template.replace(/%(?:(\d)\$)?s/g, (_, n: string | undefined) =>
    String(args[n ? Number(n) - 1 : i++] ?? ""),
  );
}

export function readConfig(frame: HTMLElement): ViewerConfig | null {
  try {
    const config = JSON.parse(frame.dataset.yape ?? "") as ViewerConfig;
    return config && typeof config.url === "string" && config.url ? config : null;
  } catch {
    return null;
  }
}
