# PhotoEasy

PhotoEasy is a dependency-free, browser-based image editor with a layer workflow, non-destructive project files, English/Turkish localization, and a responsive interface designed for desktop, tablet, and mobile use.

## Quick start

1. Open a terminal in this folder.
2. Start a static HTTP server:

```powershell
python -m http.server 8000
```

3. Open [http://localhost:8000](http://localhost:8000) in your browser.

Opening the application through an HTTP server is recommended instead of opening `index.html` directly.

## Features

### Project and document workflow

- Save the complete editable document as a versioned `.photoeasy` project file.
- Reopen a project with its canvas size, layer order, active layer, offsets, visibility, opacity, blend modes, masks, locks, and text metadata preserved.
- Project files are validated before the current document is replaced. Invalid, oversized, or unsupported files are rejected safely.
- Import one or multiple images from the file picker.
- Drag and drop multiple image files directly onto the canvas.
- Optionally match the canvas dimensions to the first imported image.
- Resize the canvas with optional aspect-ratio locking.
- Export the flattened result as PNG using the same blend and mask compositing path as the editor preview.

### Editing tools

- Move layers and use `Alt` while dragging to duplicate and move in one action.
- Brush and eraser with adjustable size and opacity.
- Layer or composite-aware flood fill.
- Crop with explicit apply/cancel controls.
- Rectangular selection that remains editable before it is lifted:
  - Move the selection by dragging inside it.
  - Resize it from eight handles.
  - Apply it explicitly to lift the selected pixels into a new layer.
  - Preserve the source layer's mask, opacity, and blend behavior when lifting pixels.
- Magic-wand masking.
- Interactive move, scale, and rotation transforms with apply/cancel controls.
- Editable text placement with font family, size, weight, and color controls.
- Zoom, fit-to-view, actual-size, mouse-wheel zoom, and canvas panning.

### Layers and history

- Multiple layers with visibility, opacity, blend modes, locking, masks, duplication, deletion, and drag-to-reorder controls.
- Layer renaming with localized generated layer names.
- Undo/redo history preserves canvas dimensions, layers, masks, offsets, locks, blend modes, and text state.
- History entries are selectable from the history panel.
- History snapshots use in-memory canvas copies instead of base64 encoding for faster undo and redo.

### Interface and accessibility

- English and Turkish interface with browser-language detection.
- The selected `EN / TR` language is remembered in `localStorage`.
- Light/dark theme support with the selected theme applied before the first paint.
- Responsive desktop, tablet, and mobile layouts.
- Larger touch targets for coarse-pointer devices.
- Localized labels, tooltips, status messages, tool hints, and accessible names.
- Keyboard-accessible resize dialog with focus containment.

### Performance work

- Reusable compositing and mask scratch canvases reduce repeated canvas allocation.
- Layer thumbnail refreshes are limited to one update per animation frame.
- Preview rendering is separated from full-resolution document data.
- Device-pixel ratio is capped for a more predictable preview cost on high-density displays.
- Canvas dimensions, total pixels, project size, decoded project memory, and history memory are bounded.

## Keyboard shortcuts

Use `Cmd` instead of `Ctrl` on macOS.

| Shortcut | Action | Context |
| --- | --- | --- |
| `Ctrl/Cmd + S` | Save the editable `.photoeasy` project | Global |
| `Ctrl/Cmd + O` | Open a `.photoeasy` project | Global |
| `Ctrl/Cmd + Shift + S` | Export the flattened image as PNG | Global |
| `Ctrl/Cmd + Z` | Undo | Global |
| `Ctrl/Cmd + Shift + Z` | Redo | Global |
| `Ctrl/Cmd + Y` | Redo | Global |
| `Ctrl/Cmd + J` | Duplicate the active layer | Global |
| `Ctrl/Cmd + 0` | Fit the document to the viewport | Global |
| `Delete` / `Backspace` | Delete the active layer | Outside text and form fields |
| `+` / `=` | Zoom in | Outside text and form fields |
| `-` | Zoom out | Outside text and form fields |
| `[` | Decrease brush or eraser size by 2 px | Brush or eraser tool |
| `]` | Increase brush or eraser size by 2 px | Brush or eraser tool |
| `V` | Select Move | Outside text and form fields |
| `B` | Select Brush | Outside text and form fields |
| `E` | Select Eraser | Outside text and form fields |
| `F` | Select Fill | Outside text and form fields |
| `C` | Select Crop | Outside text and form fields |
| `M` | Select Rectangular Selection | Outside text and form fields |
| `W` | Select Magic Wand | Outside text and form fields |
| `R` | Start or return to Transform | Outside text and form fields |
| `Z` | Select Zoom | Outside text and form fields |
| `T` | Select Text | Outside text and form fields |
| `Enter` | Apply the current selection | Selection is ready |
| `Enter` | Apply the current transform | Transform is active |
| `Ctrl/Cmd + Enter` | Commit the current text edit | Text editor is active |
| `Escape` | Cancel the current selection | Selection is ready |
| `Escape` | Cancel crop or transform | Crop or transform is active |
| `Escape` | Cancel the current text edit | Text editor is active |
| `Enter` | Commit a layer rename | Layer name field is active |
| `Escape` | Cancel a layer rename | Layer name field is active |
| `Escape` | Close the resize dialog | Resize dialog is open |
| `Space` + drag | Pan the viewport | Outside text and form fields |

## Pointer and canvas controls

| Gesture | Action | Context |
| --- | --- | --- |
| Mouse wheel | Zoom around the pointer position | Canvas viewport |
| Middle-button drag | Pan the viewport | Canvas viewport |
| `Space` + primary-button drag | Pan the viewport | Canvas viewport |
| `Alt` + drag | Duplicate and move the selected layer | Move tool |
| Primary click | Zoom in | Zoom tool |
| `Alt` + primary click | Zoom out | Zoom tool |
| Drag | Create a rectangular selection | Selection tool |
| Drag inside a ready selection | Move the selection boundary | Selection tool |
| Drag a selection handle | Resize the selection boundary | Selection tool |
| Drag a transform corner | Uniformly scale the layer | Transform tool |
| Drag the transform rotation handle | Rotate the layer | Transform tool |
| Drag inside the transform box | Move the layer | Transform tool |
| Drop image files | Import one or multiple images | Canvas viewport |

## Internationalization

- UI strings live in `js/00-i18n.js` under matching `en` and `tr` dictionaries.
- Static markup uses `data-i18n`, `data-i18n-title`, `data-i18n-aria`, or `data-i18n-placeholder` attributes.
- Dynamic UI uses `t('key', params)` and refreshes on the `langchange` event.
- The initial language follows the browser language. The selected language is stored under the `lang` key in `localStorage`.

## JavaScript layout

The application uses ordered deferred scripts instead of a build step:

| File | Responsibility |
| --- | --- |
| `js/00-i18n.js` | English/Turkish dictionaries and language switching |
| `js/00-theme.js` | Theme initialization and switching |
| `js/00-core.js` | Shared editor state, validation, viewport helpers, and common UI behavior |
| `js/10-history.js` | Canvas-based history snapshots, restoration, undo, and redo |
| `js/20-layers-compositor.js` | Layer UI, thumbnails, masks, blend compositing, and reusable render buffers |
| `js/30-editor-input.js` | Pointer input, drawing, text editing, selection movement, and selection resizing |
| `js/40-tools-ui.js` | Tool property controls and color picker |
| `js/50-fill.js` | Flood-fill and mask algorithms |
| `js/60-document-io.js` | Project save/open, image import, drag and drop, canvas resize, and PNG export |
| `js/70-transform-crop.js` | Transform and crop workflows |
| `js/80-viewport-init.js` | Viewport controls, keyboard shortcuts, localization refresh, and initialization |

## Current constraints

- The app is dependency-free and runs as a static site; there is no server-side storage or cloud synchronization.
- `.photoeasy` projects embed layer pixels as PNG data URLs, so documents with many large layers can produce large project files.
- Text remains editable while its editor is open, but it is rasterized after commit and is not vector text.
- Transforming or cropping a text layer rasterizes its text metadata.
- Full-resolution compositing is still CPU and memory intensive for very large canvases despite the allocation and history optimizations.
