// Core DOM references, shared editor state, and viewport helpers.
// Minimal browser-based Photoshop-like demo
const view = document.getElementById('view');
const viewport = document.getElementById('viewport');
const layersList = document.getElementById('layers-list');
const fileInput = document.getElementById('file-input');
const canvasOnboarding = document.getElementById('canvas-onboarding');
const toolHintEl = document.getElementById('tool-hint');
const historyLabelEl = document.getElementById('history-label');
const historyPanelEl = document.getElementById('history-panel');
const historyListEl = document.getElementById('history-list');
const historyMetaEl = document.getElementById('history-meta');
const statusStackEl = document.getElementById('status-stack');
const zoomReadoutEl = document.getElementById('zoom-readout');
const sidebar = document.getElementById('sidebar');
const toolPropsPanel = document.getElementById('tool-props');
const layersPanel = document.getElementById('layers-panel');

let width = 1200, height = 700;
// Keep the preview canvas sized to the viewport and render the document inside it.
function updateViewportAspect(){
  const inner = document.getElementById('viewport-inner');
  if(inner){
    try{
      inner.style.width = '100%';
      inner.style.height = '100%';
      inner.style.aspectRatio = 'auto';
    }catch(e){ /* ignore */ }
  }
  try{
    view.style.width = '100%';
    view.style.height = '100%';
    resizePreviewCanvas();
  }catch(e){}
}

const viewCtx = view.getContext('2d');
let layers = []; // {canvas,ctx,name,offset:{x,y},visible,opacity}
let activeLayer = null;
let tool = 'move';
let color = '#000';
let size = 8;
let toolOpacity = 1;
// Text tool properties
let fontSize = 32;
let fontFamily = 'sans-serif';
let fontBold = false;
let drawing = false;
let last = null;
let selection = null; // {x,y,w,h}
let cropPending = false;
// editing state for text tool
let currentTextEditor = null; // {ta, layer, pending:{color,fontSize,fontFamily,bold}, commit, cancel}
// Transform state for interactive transform tool
let transformState = null; // {layer, cx, cy, w, h, rotation, scale, dragging, handle, startPos, startAngle, startScale}
// Mask editing state
let editMaskMode = false; // Whether to edit mask or layer content
// Viewport transform state for zoom/drag. scale is a multiplier on top of fit-to-panel.
let viewportTransform = { scale: 1, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0 };
let layerDragIndex = null;
let renamingLayerIndex = null;
let renamingLayerDraft = '';
let moveInteraction = null;
let drawingSession = null;
let activePointerId = null;
let spacePressed = false;
let historyRestoreToken = 0;
let historyRestoring = false;

const MAX_CANVAS_DIMENSION = 16384;
const MAX_CANVAS_PIXELS = 40_000_000;
const MAX_HISTORY_STEPS = 24;
const MAX_HISTORY_CHARS = 120_000_000;

const cursorPreview = document.createElement('div');
cursorPreview.className = 'cursor-preview';
viewport.appendChild(cursorPreview);

const TOOL_META = {
  move: {
    label: 'Move',
    shortcut: 'V',
    hint: 'Move: drag a layer. Alt+drag duplicates it; Space+drag or middle-mouse pans the view.'
  },
  brush: {
    label: 'Brush',
    shortcut: 'B',
    hint: 'Brush: paint on the active layer. The ring shows your brush size.'
  },
  eraser: {
    label: 'Eraser',
    shortcut: 'E',
    hint: 'Eraser: remove pixels on the active layer. Locked layers stay protected.'
  },
  fill: {
    label: 'Fill',
    shortcut: null,
    hint: 'Fill: click an area to flood fill it on the active layer.'
  },
  crop: {
    label: 'Crop',
    shortcut: null,
    hint: 'Crop: drag a crop area, then commit or cancel. Undo restores the previous canvas.'
  },
  select: {
    label: 'Select',
    shortcut: null,
    hint: 'Select: drag a rectangle to lift pixels into a new layer.'
  },
  magic: {
    label: 'Magic Wand',
    shortcut: null,
    hint: 'Magic Wand: click to build a visibility mask from matching composite pixels.'
  },
  transform: {
    label: 'Transform',
    shortcut: null,
    hint: 'Transform: drag inside to move, corners to scale, and the top handle to rotate.'
  },
  zoom: {
    label: 'Zoom',
    shortcut: 'Z',
    hint: 'Zoom: click to zoom in, Alt+click to zoom out, or press Ctrl+0 to fit the view.'
  },
  text: {
    label: 'Text',
    shortcut: 'T',
    hint: 'Text: click to create, click existing text to edit, Ctrl+Enter to commit.'
  }
};

function isPointInsideDocument(pos){
  return pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height;
}

function clampPointToDocument(pos){
  return {
    x: Math.max(0, Math.min(width, pos.x)),
    y: Math.max(0, Math.min(height, pos.y))
  };
}

function validateCanvasSize(nextWidth, nextHeight, layerCount = Math.max(1, layers.length)){
  if(!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth <= 0 || nextHeight <= 0){
    return 'Please enter valid canvas dimensions.';
  }
  if(nextWidth > MAX_CANVAS_DIMENSION || nextHeight > MAX_CANVAS_DIMENSION){
    return 'Canvas sides cannot exceed ' + MAX_CANVAS_DIMENSION.toLocaleString() + ' px.';
  }
  const pixels = nextWidth * nextHeight;
  if(!Number.isSafeInteger(pixels) || pixels > MAX_CANVAS_PIXELS){
    return 'Canvas area cannot exceed ' + MAX_CANVAS_PIXELS.toLocaleString() + ' pixels.';
  }
  const estimatedBytes = pixels * 4 * Math.max(2, layerCount + 1);
  if(estimatedBytes > 512 * 1024 * 1024){
    return 'This size would require too much working memory for the current layer stack.';
  }
  return null;
}

function isLayerEditLocked(){
  return !!(activeLayer && activeLayer.locked && ['brush', 'eraser', 'fill', 'move', 'transform', 'select', 'magic', 'crop'].includes(tool));
}

function addStatus(message, type = 'info', timeout = 2600){
  if(!statusStackEl) return;
  const toast = document.createElement('div');
  toast.className = 'status-toast is-' + type;
  toast.textContent = message;
  statusStackEl.appendChild(toast);
  while(statusStackEl.children.length > 3){
    statusStackEl.removeChild(statusStackEl.firstChild);
  }
  const removeToast = ()=>{
    if(toast.parentNode) toast.parentNode.removeChild(toast);
  };
  if(timeout > 0){
    window.setTimeout(removeToast, timeout);
  }
}

function updateOnboarding(){
  if(!canvasOnboarding) return;
  const show = layers.length <= 1 && layers.every((layer)=> layer?.role === 'background');
  canvasOnboarding.classList.toggle('visible', show);
}

function updateToolHint(){
  if(!toolHintEl) return;
  if(currentTextEditor){
    toolHintEl.textContent = 'Text: click inside the bounds to edit, Ctrl+Enter to commit, Esc to cancel.';
    return;
  }
  if(cropPending){
    toolHintEl.textContent = 'Crop: review the pending crop, then commit or cancel. Undo restores the previous canvas.';
    return;
  }
  const meta = TOOL_META[tool] || { hint: 'Choose a tool to start editing.' };
  toolHintEl.textContent = meta.hint;
}

function updateHistoryLabel(){
  if(!historyLabelEl) return;
  const currentLabel = history[historyIndex]?.label;
  if(historyIndex <= 0 || !currentLabel || (currentLabel === 'Create Background' && layers.length <= 1)){
    historyLabelEl.textContent = 'Undo ready';
    return;
  }
  historyLabelEl.textContent = 'Undo: ' + currentLabel;
}

function getHistoryDisplayLabel(snapshot, idx){
  const label = snapshot?.label || 'Edit';
  if(idx === 0 && label === 'Blank Document') return 'Blank Document';
  if(label === 'Create Background') return 'Canvas Ready';
  return label;
}

function renderHistoryPanel(){
  if(!historyListEl || !historyPanelEl) return;
  historyListEl.innerHTML = '';
  if(historyMetaEl) historyMetaEl.textContent = history.length ? (historyIndex + 1) + ' / ' + history.length : '0 / 0';
  for(let idx = history.length - 1; idx >= 0; idx--){
    const snapshot = history[idx];
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.disabled = historyRestoring;
    entry.className = 'history-entry';
    if(idx === historyIndex) entry.classList.add('active');
    if(idx > historyIndex) entry.classList.add('future');

    const step = document.createElement('span');
    step.className = 'history-entry-step';
    step.textContent = String(idx + 1).padStart(2, '0');

    const label = document.createElement('span');
    label.className = 'history-entry-label';
    label.textContent = getHistoryDisplayLabel(snapshot, idx);

    entry.appendChild(step);
    entry.appendChild(label);

    if(idx === historyIndex){
      const current = document.createElement('span');
      current.className = 'history-entry-current';
      current.textContent = 'Current';
      entry.appendChild(current);
      entry.setAttribute('aria-current', 'step');
    } else {
      entry.onclick = async ()=>{
        await restoreHistory(idx);
        addStatus('Restored ' + getHistoryDisplayLabel(snapshot, idx) + '.', 'info', 1800);
      };
    }
    historyListEl.appendChild(entry);
  }
}

function updateZoomReadout(){
  if(!zoomReadoutEl) return;
  const display = getDisplayTransform();
  zoomReadoutEl.textContent = Math.max(1, Math.round((display.totalScale / getPreviewDpr()) * 100)) + '%';
}

function updateSidebarPriority(){
  if(!sidebar || !toolPropsPanel || !layersPanel) return;
  const toolPrimary = !!(currentTextEditor || cropPending || ['brush', 'eraser', 'fill', 'crop', 'magic', 'text', 'zoom'].includes(tool));
  sidebar.classList.toggle('tool-primary', toolPrimary);
  sidebar.classList.toggle('layers-primary', !toolPrimary);
  toolPropsPanel.classList.toggle('is-primary', toolPrimary);
  layersPanel.classList.toggle('is-primary', !toolPrimary);
}

function updateCanvasChrome(){
  updateOnboarding();
  updateToolHint();
  updateHistoryLabel();
  updateZoomReadout();
  updateSidebarPriority();
}

function startLayerRename(index){
  if(index < 0 || index >= layers.length) return;
  renamingLayerIndex = index;
  renamingLayerDraft = layers[index].name || '';
  renderLayersUI();
  window.requestAnimationFrame(()=>{
    const input = layersList.querySelector('[data-layer-rename="' + index + '"]');
    if(input){
      input.focus();
      input.select();
    }
  });
}

function cancelLayerRename(){
  renamingLayerIndex = null;
  renamingLayerDraft = '';
  renderLayersUI();
}

function commitLayerRename(index, nextName){
  const layer = layers[index];
  renamingLayerIndex = null;
  renamingLayerDraft = '';
  if(!layer){
    renderLayersUI();
    return;
  }
  const trimmedName = (nextName || '').trim();
  if(!trimmedName){
    renderLayersUI();
    return;
  }
  if(trimmedName !== layer.name){
    layer.name = trimmedName;
    pushHistory('Rename Layer');
    addStatus('Layer renamed.', 'info', 1800);
  }
  renderLayersUI();
}

function applyTooltips(){
  const mapping = {
    'tool-move': TOOL_META.move,
    'tool-brush': TOOL_META.brush,
    'tool-eraser': TOOL_META.eraser,
    'tool-text': TOOL_META.text,
    'tool-zoom': TOOL_META.zoom,
    'zoom-fit': { label: 'Fit View', shortcut: 'Ctrl+0' },
    'zoom-100': { label: 'Actual Size', shortcut: null },
    'zoom-in': { label: 'Zoom In', shortcut: null },
    'zoom-out': { label: 'Zoom Out', shortcut: null },
    'dup-layer': { label: 'Duplicate Layer', shortcut: 'Ctrl+J' },
    undo: { label: 'Undo', shortcut: 'Ctrl+Z' },
    redo: { label: 'Redo', shortcut: 'Ctrl+Shift+Z' }
  };
  Object.entries(mapping).forEach(([id, meta])=>{
    const el = document.getElementById(id);
    if(!el) return;
    const title = meta.shortcut ? meta.label + ' (' + meta.shortcut + ')' : meta.label;
    el.title = title;
    el.setAttribute('aria-label', title);
  });
}

function fitView(showToast = false){
  resetViewportTransform();
  composite();
  if(showToast) addStatus('View fit to window.', 'info');
}

function setActualSize(showToast = false){
  const fitScale = Math.min(view.width / width, view.height / height) || 1;
  viewportTransform.scale = getPreviewDpr() / fitScale;
  viewportTransform.offsetX = 0;
  viewportTransform.offsetY = 0;
  composite();
  if(showToast) addStatus('View set to 100%.', 'info');
}

function clearLayerDragState(){
  document.querySelectorAll('#layers-list li').forEach((item)=>{
    item.classList.remove('dragging', 'drop-before', 'drop-after');
  });
}

function reorderLayer(fromIndex, targetIndex, placeAfter){
  if(fromIndex == null || targetIndex == null || fromIndex === targetIndex) return;
  const moved = layers[fromIndex];
  if(!moved) return;
  let insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  layers.splice(fromIndex, 1);
  if(fromIndex < insertIndex) insertIndex -= 1;
  insertIndex = Math.max(0, Math.min(layers.length, insertIndex));
  layers.splice(insertIndex, 0, moved);
  activeLayer = moved;
  renderLayersUI();
  composite();
  pushHistory('Reorder Layers');
  addStatus('Layer order updated. Undo restores the previous order.', 'info');
}

function updateCursorFeedback(clientX, clientY){
  if(typeof clientX !== 'number' || typeof clientY !== 'number'){
    cursorPreview.classList.remove('visible');
    viewport.style.cursor = viewportTransform.isDragging ? 'grabbing' : 'grab';
    return;
  }
  const pos = getPos({ clientX, clientY });
  const insideDocument = isPointInsideDocument(pos);
  const viewportRect = viewport.getBoundingClientRect();
  const localX = clientX - viewportRect.left;
  const localY = clientY - viewportRect.top;
  const locked = insideDocument && isLayerEditLocked();
  const hoveredTextLayer = insideDocument ? findTextLayerAt(pos) : null;

  if((tool === 'brush' || tool === 'eraser') && insideDocument && !locked){
    const diameter = Math.max(8, Math.round(size * getDisplayTransform().totalScale / getPreviewDpr()));
    cursorPreview.classList.add('visible');
    cursorPreview.style.width = diameter + 'px';
    cursorPreview.style.height = diameter + 'px';
    cursorPreview.style.left = localX + 'px';
    cursorPreview.style.top = localY + 'px';
    viewport.style.cursor = 'none';
    return;
  }

  cursorPreview.classList.remove('visible');
  if(locked){
    viewport.style.cursor = 'not-allowed';
    return;
  }
  if(tool === 'text' && hoveredTextLayer){
    viewport.style.cursor = 'text';
    return;
  }
  if(tool === 'move' && insideDocument){
    viewport.style.cursor = 'move';
    return;
  }
  if(tool === 'zoom' && insideDocument){
    viewport.style.cursor = 'zoom-in';
    return;
  }
  viewport.style.cursor = viewportTransform.isDragging ? 'grabbing' : 'grab';
}

function findLayerAt(pos){
  for(let index = layers.length - 1; index >= 0; index--){
    const layer = layers[index];
    if(!layer || !layer.visible) continue;
    const localX = Math.round(pos.x - layer.offset.x);
    const localY = Math.round(pos.y - layer.offset.y);
    if(localX < 0 || localY < 0 || localX >= layer.canvas.width || localY >= layer.canvas.height) continue;
    if(layer.maskCanvas){
      const maskX = Math.round(pos.x);
      const maskY = Math.round(pos.y);
      if(maskX < 0 || maskY < 0 || maskX >= layer.maskCanvas.width || maskY >= layer.maskCanvas.height) continue;
      const maskAlpha = layer.maskCanvas.getContext('2d').getImageData(maskX, maskY, 1, 1).data[3];
      if(maskAlpha === 0) continue;
    }
    const pixelAlpha = layer.ctx.getImageData(localX, localY, 1, 1).data[3];
    if(pixelAlpha !== 0) return layer;
  }
  return null;
}

function resizePreviewCanvas(){
  const dpr = getPreviewDpr();
  const nextWidth = Math.max(1, Math.round((viewport.clientWidth || 1) * dpr));
  const nextHeight = Math.max(1, Math.round((viewport.clientHeight || 1) * dpr));
  if(view.width !== nextWidth || view.height !== nextHeight){
    view.width = nextWidth;
    view.height = nextHeight;
  }
}

function getPreviewDpr(){
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}

function getDisplayTransform(){
  const fitScale = Math.min(view.width / width, view.height / height) || 1;
  const totalScale = fitScale * viewportTransform.scale;
  const originX = (view.width - width * totalScale) / 2 + viewportTransform.offsetX;
  const originY = (view.height - height * totalScale) / 2 + viewportTransform.offsetY;
  return { fitScale, totalScale, originX, originY };
}

function getViewPointFromClient(clientX, clientY){
  const rect = view.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (view.width / rect.width),
    y: (clientY - rect.top) * (view.height / rect.height)
  };
}

function resetViewportTransform(){
  viewportTransform.scale = 1;
  viewportTransform.offsetX = 0;
  viewportTransform.offsetY = 0;
}

function zoomViewport(nextScale, anchorX = view.width / 2, anchorY = view.height / 2){
  const clampedScale = Math.max(0.1, Math.min(8, nextScale));
  const before = getDisplayTransform();
  const docX = (anchorX - before.originX) / before.totalScale;
  const docY = (anchorY - before.originY) / before.totalScale;
  viewportTransform.scale = clampedScale;
  const after = getDisplayTransform();
  viewportTransform.offsetX = anchorX - ((view.width - width * after.totalScale) / 2 + docX * after.totalScale);
  viewportTransform.offsetY = anchorY - ((view.height - height * after.totalScale) / 2 + docY * after.totalScale);
}

updateViewportAspect();

