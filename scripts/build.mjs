// Builds the front-end assets into plugin/build/:
//   viewer/  Script Module entry (index.js) + lazily loaded chunks + viewer.css
//   block/   block editor script (classic script using wp.* globals)
//   pdfjs/   pdf.js worker and runtime data (cmaps, fonts, wasm, icc)
// Usage: node scripts/build.mjs [--watch]
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "plugin", "build");
const watch = process.argv.includes("--watch");
const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve("pdfjs-dist/package.json"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// pdf.js runtime files, renamed .mjs -> .js because some hosts serve .mjs with a wrong MIME type.
const pdfjsOut = join(out, "pdfjs");
mkdirSync(pdfjsOut, { recursive: true });
cpSync(join(pdfjsDir, "build", "pdf.worker.min.mjs"), join(pdfjsOut, "pdf.worker.min.js"));
cpSync(join(pdfjsDir, "LICENSE"), join(pdfjsOut, "LICENSE"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(pdfjsDir, dir), join(pdfjsOut, dir), { recursive: true });
}
// StPageFlip (flipbook page turns) ships no license comment in its bundle.
mkdirSync(join(out, "viewer"), { recursive: true });
cpSync(join(dirname(require.resolve("page-flip/package.json")), "LICENSE"), join(out, "viewer", "page-flip-LICENSE.txt"));

const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "linked" : false,
  target: ["es2022", "chrome110", "firefox115", "safari16.4"],
  legalComments: "linked",
  logLevel: "info",
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
};

const configs = [
  {
    ...common,
    entryPoints: { index: join(root, "viewer", "src", "index.ts") },
    outdir: join(out, "viewer"),
    format: "esm",
    splitting: true,
    chunkNames: "[name]-[hash]",
  },
  {
    ...common,
    entryPoints: { viewer: join(root, "viewer", "src", "viewer.css") },
    outdir: join(out, "viewer"),
    loader: { ".svg": "dataurl", ".gif": "dataurl", ".png": "dataurl" },
  },
  {
    ...common,
    entryPoints: { index: join(root, "block", "src", "index.js") },
    outdir: join(out, "block"),
    format: "iife",
  },
];

if (watch) {
  for (const config of configs) await (await esbuild.context(config)).watch();
  console.log("Watching for changes…");
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      e.isDirectory() ? walk(p) : files.push(p);
    }
  };
  if (existsSync(out)) walk(out);
  console.log(`Built ${files.length} files into plugin/build/`);
}
