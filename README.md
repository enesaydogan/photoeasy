PhotoEasy — Browser Photoshop Clone (Minimal Demo)

Quick start:

1. Open a terminal in this folder.
2. Serve files (example):

```powershell
# Simple HTTP server with Python
python -m http.server 8000
```

3. Open http://localhost:8000 in your browser.

Features in this demo:
- Multiple layers with visibility, opacity, blend modes, locking, and reorder controls
- Brush, eraser, fill, move, crop, selection, magic-wand masking, transform, and text tools
- Import image into a new layer with optional canvas resize to image dimensions
- Undo/redo with document size and text-layer state preserved
- Export flattened PNG using the same blend and mask compositing path as the editor preview
- English/Turkish interface with browser-language detection and a remembered `EN / TR` choice

Internationalization:
- UI strings live in `js/00-i18n.js` under matching `en` and `tr` dictionaries.
- Static markup uses `data-i18n`, `data-i18n-title`, `data-i18n-aria`, or `data-i18n-placeholder`.
- Dynamic UI uses `t('key', params)` and refreshes on the `langchange` event.
- The initial language follows the browser; the selected language is remembered in `localStorage` under `lang`.

JavaScript layout:
- `00-i18n.js`: language dictionaries and switching
- `00-core.js`: shared editor state and viewport helpers
- `10-history.js`: history, undo, and redo
- `20-layers-compositor.js`: layers and compositing
- `30-editor-input.js`: drawing, text, and pointer input
- `40-tools-ui.js`: tool controls and color picker
- `50-fill.js`: flood-fill algorithms
- `60-document-io.js`: resize, import, and export
- `70-transform-crop.js`: transform and crop
- `80-viewport-init.js`: viewport controls and initialization

Current constraints:
- The app is dependency-free and uses ordered deferred scripts on a static HTML server
- Large images can get slow because compositing and history snapshots are canvas-heavy
- Text is rendered onto a layer canvas after commit, so it is not vector text
- Performance improvements for large canvases
