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

Current constraints:
- This is still a single-file browser demo intended to run on a static HTML server
- Large images can get slow because compositing and history snapshots are canvas-heavy
- Text is rendered onto a layer canvas after commit, so it is not vector text
- Performance improvements for large canvases
