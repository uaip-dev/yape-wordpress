// Types for the parts of StPageFlip (page-flip 2.0.7, MIT) that the flipbook uses.
declare module "page-flip/dist/js/page-flip.module.js" {
  export interface PageRect {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Width of one page in CSS pixels. */
    pageWidth: number;
  }

  export interface FlipEvent<T> {
    data: T;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, number | string | boolean>);
    loadFromHTML(items: HTMLElement[]): void;
    update(): void;
    destroy(): void;
    flip(page: number, corner?: "top" | "bottom"): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    turnToPage(page: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): "portrait" | "landscape";
    getBoundsRect(): PageRect;
    on(event: "flip", callback: (e: FlipEvent<number>) => void): this;
    on(event: "changeOrientation", callback: (e: FlipEvent<"portrait" | "landscape">) => void): this;
    on(event: "init" | "update" | "changeState", callback: (e: FlipEvent<unknown>) => void): this;
  }
}
