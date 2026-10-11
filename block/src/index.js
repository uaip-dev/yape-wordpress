/* global wp, yapeBlock */
// Block editor UI for yape/pdf. Uses the wp.* globals (no React build step needed).
// The preview mounts the real front-end viewer from the registered Script Module.

const { registerBlockType, createBlock } = wp.blocks;
const { createElement: el, Fragment, useEffect, useRef } = wp.element;
const { __ } = wp.i18n;
const { useBlockProps, MediaPlaceholder, BlockControls, MediaReplaceFlow, InspectorControls } = wp.blockEditor;
const { PanelBody, TextControl, SelectControl, ToggleControl, Notice } = wp.components;

const data = window.yapeBlock || { viewerUrl: "", defaults: {} };
const TOOLBAR_KEYS = [
  ["showSidebar", "sidebar", () => __("Sidebar (thumbnails, outline)", "yet-another-pdf-editor")],
  ["showSearch", "search", () => __("Search", "yet-another-pdf-editor")],
  ["showZoom", "zoom", () => __("Zoom", "yet-another-pdf-editor")],
  ["showDownload", "download", () => __("Download", "yet-another-pdf-editor")],
  ["showPrint", "print", () => __("Print", "yet-another-pdf-editor")],
  ["showFullscreen", "fullscreen", () => __("Full screen", "yet-another-pdf-editor")],
  ["showAnnotate", "annotate", () => __("Annotate and sign", "yet-another-pdf-editor")],
];

/** Same merge as Yape_Renderer::config() in PHP. */
function buildConfig(a) {
  const d = data.defaults || {};
  const toolbar =
    a.toolbar === "none"
      ? false
      : Object.fromEntries(
          TOOLBAR_KEYS.map(([attr, key]) => [key, a[attr] ? a[attr] === "show" : d.toolbar?.[key] !== false]),
        );
  return {
    url: a.url,
    title: a.title,
    page: a.page > 1 ? a.page : undefined,
    zoom: a.zoom || d.zoom || "auto",
    load: "scroll",
    newTab: d.newTab !== false,
    sidebarOpen: a.sidebarOpen ? a.sidebarOpen === "open" : !!d.sidebarOpen,
    toolbar,
  };
}

function Preview({ attributes }) {
  const ref = useRef(null);
  const config = buildConfig(attributes);
  const key = JSON.stringify(config);
  useEffect(() => {
    const slot = ref.current;
    if (!slot || !data.viewerUrl) return undefined;
    // Each effect run gets its own frame, so a quick unmount/remount (React strict mode,
    // attribute changes) never tears down the wrong viewer.
    const frame = slot.ownerDocument.createElement("div");
    frame.className = "yape-pdf__frame";
    frame.textContent = __("Loading PDF…", "yet-another-pdf-editor");
    slot.replaceChildren(frame);
    let unmount = null;
    let cancelled = false;
    // Start on the next tick: an immediate strict-mode cleanup then cancels it before
    // any PDF is fetched.
    const timer = setTimeout(() => {
      import(data.viewerUrl)
        .then((m) => m.render(frame, config))
        .then((fn) => {
          if (cancelled) fn();
          else unmount = fn;
        })
        .catch((err) => console.error("[yape] preview failed", err));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (unmount) unmount();
      frame.remove();
    };
  }, [key]);
  const height = attributes.height || data.defaults?.height || "800px";
  return el("div", { className: "yape-pdf", style: { "--yape-height": height } }, el("div", { ref }));
}

function choice(label, value, onChange, options) {
  return el(SelectControl, { __nextHasNoMarginBottom: true, __next40pxDefaultSize: true, label, value, onChange, options });
}

const DEFAULT = () => ({ label: __("Site default", "yet-another-pdf-editor"), value: "" });

function Edit({ attributes, setAttributes }) {
  const blockProps = useBlockProps();
  const onSelect = (media) => {
    if (!media || !media.url) return;
    setAttributes({ id: media.id || 0, url: media.url, title: media.title || attributes.title || "" });
  };
  const onSelectURL = (url) => setAttributes({ id: 0, url, title: attributes.title });

  if (!attributes.url) {
    return el(
      "div",
      blockProps,
      el(MediaPlaceholder, {
        icon: "pdf",
        labels: {
          title: __("PDF Viewer", "yet-another-pdf-editor"),
          instructions: __("Upload a PDF, pick one from the Media Library, or insert from a URL.", "yet-another-pdf-editor"),
        },
        accept: "application/pdf",
        allowedTypes: ["application/pdf"],
        onSelect,
        onSelectURL,
      }),
    );
  }

  const toolbarHidden = attributes.toolbar === "none";
  return el(
    Fragment,
    null,
    el(
      BlockControls,
      { group: "other" },
      el(MediaReplaceFlow, {
        mediaId: attributes.id,
        mediaURL: attributes.url,
        allowedTypes: ["application/pdf"],
        accept: "application/pdf",
        onSelect,
        onSelectURL,
      }),
    ),
    el(
      InspectorControls,
      null,
      el(
        PanelBody,
        { title: __("Document", "yet-another-pdf-editor") },
        el(TextControl, {
          __nextHasNoMarginBottom: true,
          __next40pxDefaultSize: true,
          label: __("Title", "yet-another-pdf-editor"),
          help: __("Used as the accessible name and the link text before the viewer loads.", "yet-another-pdf-editor"),
          value: attributes.title,
          onChange: (title) => setAttributes({ title }),
        }),
        !attributes.id &&
          el(Notice, { status: "info", isDismissible: false },
            __("External PDFs must allow cross-origin requests (CORS) or they will not load.", "yet-another-pdf-editor")),
      ),
      el(
        PanelBody,
        { title: __("Display", "yet-another-pdf-editor") },
        el(TextControl, {
          __nextHasNoMarginBottom: true,
          __next40pxDefaultSize: true,
          label: __("Height", "yet-another-pdf-editor"),
          help: __("For example 800px or 80vh. Leave empty for the site default.", "yet-another-pdf-editor"),
          value: attributes.height,
          onChange: (height) => setAttributes({ height }),
        }),
        el(TextControl, {
          __nextHasNoMarginBottom: true,
          __next40pxDefaultSize: true,
          type: "number",
          min: 1,
          label: __("Start at page", "yet-another-pdf-editor"),
          value: String(attributes.page || 1),
          onChange: (v) => setAttributes({ page: Math.max(1, parseInt(v, 10) || 1) }),
        }),
        choice(__("Zoom", "yet-another-pdf-editor"), attributes.zoom, (zoom) => setAttributes({ zoom }), [
          DEFAULT(),
          { label: __("Automatic", "yet-another-pdf-editor"), value: "auto" },
          { label: __("Page width", "yet-another-pdf-editor"), value: "page-width" },
          { label: __("Page fit", "yet-another-pdf-editor"), value: "page-fit" },
          { label: __("Actual size", "yet-another-pdf-editor"), value: "page-actual" },
          ...[50, 75, 100, 125, 150, 200].map((p) => ({ label: `${p}%`, value: String(p / 100) })),
        ]),
        choice(__("Loading", "yet-another-pdf-editor"), attributes.load, (load) => setAttributes({ load }), [
          DEFAULT(),
          { label: __("When scrolled into view", "yet-another-pdf-editor"), value: "scroll" },
          { label: __("When the visitor clicks", "yet-another-pdf-editor"), value: "click" },
        ]),
      ),
      el(
        PanelBody,
        { title: __("Toolbar", "yet-another-pdf-editor"), initialOpen: false },
        el(ToggleControl, {
          __nextHasNoMarginBottom: true,
          label: __("Hide the toolbar", "yet-another-pdf-editor"),
          checked: toolbarHidden,
          onChange: (v) => setAttributes({ toolbar: v ? "none" : "" }),
        }),
        !toolbarHidden &&
          TOOLBAR_KEYS.map(([attr, , label]) =>
            el(
              "div",
              { key: attr, style: { marginTop: 12 } },
              choice(label(), attributes[attr], (v) => setAttributes({ [attr]: v }), [
                DEFAULT(),
                { label: __("Show", "yet-another-pdf-editor"), value: "show" },
                { label: __("Hide", "yet-another-pdf-editor"), value: "hide" },
              ]),
            ),
          ),
        !toolbarHidden &&
          el("div", { style: { marginTop: 12 } },
            choice(__("Sidebar on load", "yet-another-pdf-editor"), attributes.sidebarOpen, (sidebarOpen) => setAttributes({ sidebarOpen }), [
              DEFAULT(),
              { label: __("Open", "yet-another-pdf-editor"), value: "open" },
              { label: __("Closed", "yet-another-pdf-editor"), value: "closed" },
            ])),
      ),
    ),
    el("div", blockProps, el(Preview, { attributes })),
  );
}

registerBlockType("yape/pdf", {
  edit: Edit,
  save: () => null,
  transforms: {
    from: [
      {
        type: "block",
        blocks: ["core/file"],
        isMatch: (a) => /\.pdf(\?|#|$)/i.test(a.href || ""),
        transform: (a) => createBlock("yape/pdf", { id: a.id || 0, url: a.href, title: a.fileName || "" }),
      },
    ],
    to: [
      {
        type: "block",
        blocks: ["core/file"],
        transform: (a) => createBlock("core/file", { id: a.id || undefined, href: a.url, fileName: a.title }),
      },
    ],
  },
});

