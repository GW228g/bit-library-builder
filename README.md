# Bit Library Builder

Static web app: search vendor CNC bit libraries (Bits&Bits, SpeTool, Whiteside), pick the bits you own, download one MillMage `.tools` file.

- `src/convert.js` – converters (Fusion JSON, Vectric .vtdb / .tool) and the MillMage exporter. Runs in Node and the browser.
- `src/template.html` – the UI. `npm run build` inlines the converter and catalog into `public/index.html`.
- `vendor-files/` – source vendor libraries the catalog is built from.

Build: `npm run build` (Node 22+). Deploy: serve `public/`.
