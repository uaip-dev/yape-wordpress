// Print by rasterising pages (150 dpi) into images that are the only thing visible in
// print media. Works the same in every browser and includes filled-in form values.
import { AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";

const PRINT_SCALE = 150 / 72;

export async function printDocument(pdf: PDFDocumentProxy, win: Window): Promise<void> {
  const doc = win.document;
  const holder = doc.createElement("div");
  holder.className = "yape-print";
  const urls: string[] = [];
  const printStorage = pdf.annotationStorage.print;

  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: PRINT_SCALE });
      const canvas = doc.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({
        canvas,
        viewport,
        intent: "print",
        annotationMode: AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage: printStorage,
      }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = doc.createElement("img");
      img.src = url;
      img.alt = "";
      holder.append(img);
      page.cleanup();
    }
    doc.body.append(holder);
    doc.body.classList.add("yape-printing");
    await Promise.all(Array.from(holder.querySelectorAll("img"), (img) => img.decode().catch(() => {})));

    await new Promise<void>((resolve) => {
      const done = () => {
        win.removeEventListener("afterprint", done);
        resolve();
      };
      win.addEventListener("afterprint", done);
      win.print();
      // Some browsers never fire afterprint; print() is blocking in most anyway.
      win.setTimeout(done, 1000);
    });
  } finally {
    doc.body.classList.remove("yape-printing");
    holder.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}
