// Signature dialog: draw or type a signature, returned as a trimmed transparent PNG file.
import type { Strings } from "./config";

const PAD_W = 600;
const PAD_H = 200;

export function openSignatureDialog(doc: Document, t: Strings): Promise<File | null> {
  return new Promise((resolve) => {
    const dialog = doc.createElement("dialog");
    dialog.className = "yape-dialog";
    dialog.setAttribute("aria-label", t.addSignature);

    const title = doc.createElement("h2");
    title.textContent = t.addSignature;

    const tabs = doc.createElement("div");
    tabs.className = "yape-tabs";
    tabs.setAttribute("role", "tablist");
    const drawTab = tab(t.drawSignature, true);
    const typeTab = tab(t.typeSignature, false);
    tabs.append(drawTab, typeTab);

    // Draw pad
    const canvas = doc.createElement("canvas");
    canvas.className = "yape-sigpad";
    canvas.width = PAD_W;
    canvas.height = PAD_H;
    canvas.setAttribute("aria-label", t.drawSignature);
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4a";
    let drawing = false;
    let hasInk = false;
    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * PAD_W, ((e.clientY - r.top) / r.height) * PAD_H] as const;
    };
    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = point(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y + 0.1);
      ctx.stroke();
      hasInk = true;
      update();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const [x, y] = point(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    const stop = () => (drawing = false);
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    // Type
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "yape-sigtype";
    input.placeholder = t.typeSignaturePlaceholder;
    input.setAttribute("aria-label", t.typeSignaturePlaceholder);
    input.hidden = true;
    input.addEventListener("input", () => update());

    const clear = button(t.clear, "");
    const cancel = button(t.cancel, "");
    const add = button(t.add, "yape-btn--text");
    clear.addEventListener("click", () => {
      ctx.clearRect(0, 0, PAD_W, PAD_H);
      hasInk = false;
      input.value = "";
      update();
    });
    const actions = doc.createElement("div");
    actions.className = "yape-dialog__actions";
    actions.append(clear, cancel, add);

    dialog.append(title, tabs, canvas, input, actions);
    doc.body.append(dialog);

    let typing = false;
    function tab(label: string, selected: boolean) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "yape-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(selected));
      b.textContent = label;
      return b;
    }
    function button(label: string, cls: string) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = `yape-btn ${cls}`.trim();
      b.textContent = label;
      return b;
    }
    function selectTab(type: boolean) {
      typing = type;
      drawTab.setAttribute("aria-selected", String(!type));
      typeTab.setAttribute("aria-selected", String(type));
      canvas.hidden = type;
      input.hidden = !type;
      (type ? input : canvas).focus();
      update();
    }
    function update() {
      add.disabled = typing ? !input.value.trim() : !hasInk;
    }
    drawTab.addEventListener("click", () => selectTab(false));
    typeTab.addEventListener("click", () => selectTab(true));

    let result: File | null = null;
    const finish = () => {
      dialog.close();
    };
    cancel.addEventListener("click", finish);
    add.addEventListener("click", async () => {
      const source = typing ? renderTyped(doc, input.value.trim()) : canvas;
      result = await toTrimmedPng(doc, source);
      finish();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    update();
    dialog.showModal();
  });
}

function renderTyped(doc: Document, text: string): HTMLCanvasElement {
  const c = doc.createElement("canvas");
  c.width = 900;
  c.height = 220;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1f4a";
  g.textBaseline = "middle";
  let size = 110;
  const font = (s: number) => `italic ${s}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
  g.font = font(size);
  while (g.measureText(text).width > c.width - 40 && size > 20) g.font = font((size -= 6));
  g.fillText(text, 20, c.height / 2);
  return c;
}

/** Crops transparent margins and returns a PNG file. */
async function toTrimmedPng(doc: Document, source: HTMLCanvasElement): Promise<File | null> {
  const g = source.getContext("2d")!;
  const { width, height } = source;
  const data = g.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = doc.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  return blob ? new File([blob], "signature.png", { type: "image/png" }) : null;
}
