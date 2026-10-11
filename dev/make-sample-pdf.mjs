// Writes a small test PDF: 6 pages of text, an outline, an internal and an external
// link, and a fillable text field + checkbox. Usage: node make-sample-pdf.mjs out.pdf
import { writeFileSync } from "node:fs";

const out = process.argv[2] || "sample.pdf";
const PAGES = 6;
const W = 612;
const H = 792;
const objects = []; // index = object number - 1
const add = (body) => objects.push(body) && objects.length;
const reserve = () => objects.push(null) && objects.length;
const set = (n, body) => (objects[n - 1] = body);

const words =
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat".split(
    " ",
  );
const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);

const catalog = reserve();
const pagesObj = reserve();
const outlines = reserve();
const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

const pageNums = [];
const fields = [];
for (let p = 1; p <= PAGES; p++) {
  const pageNum = reserve();
  pageNums.push(pageNum);
}

for (let p = 1; p <= PAGES; p++) {
  const lines = [];
  lines.push(`BT /F2 26 Tf 72 700 Td (${esc(`Chapter ${p}: Sample page ${p}`)}) Tj ET`);
  let y = 660;
  for (let l = 0; l < 22; l++, y -= 22) {
    const text = Array.from({ length: 12 }, (_, i) => words[(p * 7 + l * 5 + i) % words.length]).join(" ");
    const extra = l === 3 ? " searchable-keyword" : "";
    lines.push(`BT /F1 12 Tf 72 ${y} Td (${esc(text + extra)}) Tj ET`);
  }
  const annots = [];
  if (p === 1) {
    lines.push("BT /F1 12 Tf 0 0 1 rg 72 140 Td (Go to chapter 3) Tj ET");
    lines.push("BT /F1 12 Tf 0 0 1 rg 72 115 Td (Visit wordpress.org) Tj ET");
    annots.push(add(`<< /Type /Annot /Subtype /Link /Rect [70 135 170 152] /Border [0 0 0] /Dest [${pageNums[2]} 0 R /XYZ 0 ${H} null] >>`));
    annots.push(add("<< /Type /Annot /Subtype /Link /Rect [70 110 190 127] /Border [0 0 0] /A << /S /URI /URI (https://wordpress.org/) >> >>"));
  }
  if (p === 2) {
    lines.push("BT /F1 12 Tf 72 150 Td (Your name:) Tj ET");
    lines.push("BT /F1 12 Tf 72 115 Td (I agree:) Tj ET");
    const text = add(
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /Rect [150 140 400 162] /F 4 /P ${pageNums[1]} 0 R /DA (/Helv 12 Tf 0 g) /MK << /BC [0 0 0] /BG [0.95 0.95 1] >> >>`,
    );
    const check = add(
      `<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /Rect [150 108 166 124] /F 4 /P ${pageNums[1]} 0 R /V /Off /AS /Off /MK << /BC [0 0 0] /CA (4) >> /DA (/ZaDb 12 Tf 0 g) >>`,
    );
    annots.push(text, check);
    fields.push(text, check);
  }
  lines.push(`BT /F1 10 Tf 290 40 Td (${p}) Tj ET`);
  const stream = lines.join("\n");
  const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  set(
    pageNums[p - 1],
    `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`,
  );
}

// Outline: one entry per chapter.
const items = pageNums.map(() => reserve());
items.forEach((n, i) => {
  const prev = i > 0 ? ` /Prev ${items[i - 1]} 0 R` : "";
  const next = i < items.length - 1 ? ` /Next ${items[i + 1]} 0 R` : "";
  set(n, `<< /Title (Chapter ${i + 1}) /Parent ${outlines} 0 R /Dest [${pageNums[i]} 0 R /XYZ 0 ${H} null]${prev}${next} >>`);
});
set(outlines, `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${items.length} >>`);
set(pagesObj, `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${PAGES} >>`);
const helv = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const zadb = add("<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>");
set(
  catalog,
  `<< /Type /Catalog /Pages ${pagesObj} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines /AcroForm << /Fields [${fields.map((f) => `${f} 0 R`).join(" ")}] /NeedAppearances true /DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv ${helv} 0 R /ZaDb ${zadb} 0 R >> >> >> >>`,
);
const info = add("<< /Title (YAPE sample document) /Producer (yape-wordpress dev) >>");

let pdf = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(out, Buffer.from(pdf, "latin1"));
console.log(`wrote ${out} (${PAGES} pages)`);
