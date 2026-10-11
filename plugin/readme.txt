=== Yet Another PDF Editor ===
Contributors: uaip
Tags: pdf, pdf viewer, pdf embed, pdf form, document
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed PDFs with a fast, accessible viewer: search, thumbnails, links, download, print, full screen and form filling. Free, no premium version.

== Description ==

Yet Another PDF Editor puts a complete PDF viewer on your pages. Every feature is free: there is no premium version, no locked settings and no upgrade notices.

= Viewer =

* Continuous scrolling with page numbers you can type in.
* Search inside the document, with all matches highlighted.
* Clickable links and a table of contents (outline).
* Thumbnails sidebar.
* Zoom: automatic, page width, page fit, actual size and percentages.
* Download, print and full screen buttons (each can be turned off).
* Text selection and copy.
* Visitors can fill in PDF forms and download the completed copy.
* Password-protected PDFs ask the visitor for the password.
* Keyboard shortcuts and screen-reader labels; works with keyboard only.
* Light, dark or automatic colours.

= Fast pages =

* Nothing loads on pages without a PDF.
* The viewer loads only when it scrolls into view, or when the visitor clicks "Load PDF" if you prefer.
* No jQuery. PDFs are read straight from your Media Library, so large files load page by page.
* Built on a current release of pdf.js (Mozilla's PDF engine), which never runs JavaScript from inside a PDF.

= Easy to use =

* **PDF Viewer block**: upload or pick a PDF, then set the height, start page, zoom and toolbar buttons per block. The editor shows a live preview.
* **Shortcode**: `[yape_pdf id="123"]` for classic content, widgets and page builders.
* Turn a File block that links to a PDF into a PDF Viewer block in one click.

= Coming next =

Annotate, highlight and sign PDFs in the browser, page tools (rotate, reorder, delete, merge) in the Media Library, and sending completed forms to the site. All free.

== Installation ==

1. Install the plugin from Plugins > Add New, or upload the zip file.
2. Activate it.
3. Add a **PDF Viewer** block to a post or page and choose a PDF.
4. Optional: set site-wide defaults in Settings > PDF Viewer.

== Frequently Asked Questions ==

= Is there a premium version? =

No. Everything is free.

= Which shortcode options are there? =

`[yape_pdf id="123" height="80vh" page="2" zoom="page-width" download="no" print="no" search="yes" sidebar="yes" fullscreen="yes" thumbnails="open" load="click" toolbar="none" title="Annual report"]`

Use `id` for a PDF from the Media Library, or `url` for a PDF at another address. `width` limits the viewer's maximum width.

= Can I show a PDF from another website? =

Yes, with `url`, as long as that website allows cross-origin requests (CORS). Otherwise browsers block it. Uploading the PDF to your Media Library always works.

= Does it stop people from downloading my PDF? =

You can hide the download and print buttons. A PDF shown in a browser can still be saved by a determined visitor, so do not rely on this to protect confidential files.

= Does the plugin contact external services? =

No. All files are served from your own site.

= Does it work with security plugins and firewalls? =

Yes. The viewer loads PDFs and its own files directly from your site and does not send PDF addresses in request parameters, so firewall rules that block URLs in query strings are not triggered.

== Screenshots ==

1. A PDF with the thumbnails sidebar open.
2. Searching inside a document.
3. Block settings in the editor.
4. Settings > PDF Viewer.

== Changelog ==

= 0.1.0 =
* First release: PDF Viewer block, [yape_pdf] shortcode, search, thumbnails, outline, links, zoom, download, print, full screen, form filling, password-protected PDFs, lazy loading.

== Upgrade Notice ==

= 0.1.0 =
First release.

== Third-party components ==

* pdf.js, Copyright Mozilla Foundation, Apache License 2.0 (build/pdfjs/LICENSE).
* Standard fonts bundled with pdf.js: Foxit fonts (BSD-style, build/pdfjs/standard_fonts/LICENSE_FOXIT) and Liberation fonts (SIL Open Font License 1.1, build/pdfjs/standard_fonts/LICENSE_LIBERATION).
* Image decoders bundled with pdf.js: OpenJPEG (BSD 2-Clause), QCMS (MIT) and the PDFium JBIG2 decoder (BSD 3-Clause). Licenses are in build/pdfjs/wasm/.

Source code, including the unminified viewer and build scripts: https://github.com/uaip-dev/yape-wordpress
