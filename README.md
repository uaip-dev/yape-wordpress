# Yet Another PDF Editor for WordPress

A free WordPress plugin that embeds PDFs with a modern, accessible viewer and lets you and
your visitors annotate, fill in and sign PDFs right in the browser.

- **Viewer:** continuous scroll, search, clickable links, text selection, thumbnails and
  bookmarks, jump to page, download, print, full screen, lazy loading, keyboard and
  screen-reader support. All free, no premium version.
- **Editor** (in progress): annotate, fill forms, sign, page tools and redaction, powered by
  PDFium compiled to WebAssembly and loaded only when someone opens it.

## Repository layout

| Folder | What |
|---|---|
| `plugin/` | The WordPress plugin (PHP). `plugin/build/` is generated. |
| `viewer/` | Front-end viewer (TypeScript on pdf.js), built into `plugin/build/viewer/`. |
| `block/` | Block editor script for the `yape/pdf` block. |
| `engine/` | Rust PDF engine compiled to WebAssembly for the editor. |
| `dev/` | Docker setup for a local WordPress test site. |
| `scripts/` | Build and packaging scripts. |

## Build

Requirements: Node 22.13+ (or 24) and pnpm. The engine also needs Rust with the
`wasm32-unknown-unknown` target.

```sh
pnpm install
pnpm build        # viewer + block + pdf.js assets into plugin/build/
pnpm zip          # dist/yet-another-pdf-editor.zip, ready for WordPress
```

## Local WordPress

```sh
pnpm build
cd dev && docker compose up -d && sh setup.sh
```

The site runs at http://localhost:8095 on WordPress 7.1.3 (user `admin`, password generated into
the git-ignored `dev/.data/admin-password.txt`) and mounts
`plugin/` as an active plugin. `setup.sh` generates a sample PDF and a "Viewer test" page.
To test other plugins alongside, mount them in a git-ignored `dev/docker-compose.override.yml`.

Checks before a release: `pnpm check` (TypeScript), `php -l` on PHP 7.4, and Plugin Check
(`docker compose run --rm cli wp plugin check yet-another-pdf-editor`).

## Maintainers

Made by UAIP (https://uaip.dev). On WordPress.org the plugin is maintained by the `uaip`
account.

## License

GPLv2 or later. See `LICENSE`. Bundled third-party components and their licenses are listed
in `plugin/readme.txt`.
