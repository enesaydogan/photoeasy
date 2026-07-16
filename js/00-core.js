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
const MAX_HISTORY_BYTES = 240_000_000;

const cursorPreview = document.createElement('div');
cursorPreview.className = 'cursor-preview';
viewport.appendChild(cursorPreview);

const TOOL_META = {
  move: { labelKey: 'tool.move', shortcut: 'V', hintKey: 'hint.move' },
  brush: { labelKey: 'tool.brush', shortcut: 'B', hintKey: 'hint.brush' },
  eraser: { labelKey: 'tool.eraser', shortcut: 'E', hintKey: 'hint.eraser' },
  fill: { labelKey: 'tool.fill', shortcut: 'F', hintKey: 'hint.fill' },
  crop: { labelKey: 'tool.crop', shortcut: 'C', hintKey: 'hint.crop' },
  select: { labelKey: 'tool.select', shortcut: 'M', hintKey: 'hint.select' },
  magic: { labelKey: 'tool.magic', shortcut: 'W', hintKey: 'hint.magic' },
  transform: { labelKey: 'tool.transform', shortcut: 'R', hintKey: 'hint.transform' },
  zoom: { labelKey: 'tool.zoom', shortcut: 'Z', hintKey: 'hint.zoom' },
  text: { labelKey: 'tool.text', shortcut: 'T', hintKey: 'hint.text' }
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
    return t('status.validDimensions');
  }
  if(nextWidth > MAX_CANVAS_DIMENSION || nextHeight > MAX_CANVAS_DIMENSION){
    return t('status.maxSide', { max: MAX_CANVAS_DIMENSION.toLocaleString(currentLang()) });
  }
  const pixels = nextWidth * nextHeight;
  if(!Number.isSafeInteger(pixels) || pixels > MAX_CANVAS_PIXELS){
    return t('status.maxArea', { max: MAX_CANVAS_PIXELS.toLocaleString(currentLang()) });
  }
  const estimatedBytes = pixels * 4 * Math.max(2, layerCount + 1);
  if(estimatedBytes > 512 * 1024 * 1024){
    return t('status.memoryLimit');
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
    toolHintEl.textContent = t('hint.textEditing');
    return;
  }
  if(cropPending){
    toolHintEl.textContent = t('hint.cropPending');
    return;
  }
  const meta = TOOL_META[tool];
  toolHintEl.textContent = meta ? t(meta.hintKey) : t('hint.chooseTool');
}

function updateHistoryLabel(){
  if(!historyLabelEl) return;
  const currentLabel = history[historyIndex]?.label;
  if(historyIndex <= 0 || !currentLabel || (currentLabel === 'history.createBackground' && layers.length <= 1)){
    historyLabelEl.textContent = t('history.undoReady');
    return;
  }
  historyLabelEl.textContent = t('history.undoLabel', { action: getHistoryDisplayLabel(history[historyIndex], historyIndex) });
}

function getHistoryDisplayLabel(snapshot, idx){
  return t(snapshot?.label || 'history.edit');
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
      current.textContent = t('history.current');
      entry.appendChild(current);
      entry.setAttribute('aria-current', 'step');
    } else {
      entry.onclick = async ()=>{
        await restoreHistory(idx);
        addStatus(t('history.restored', { action: getHistoryDisplayLabel(snapshot, idx) }), 'info', 1800);
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
    layer.autoName = null;
    pushHistory('history.renameLayer');
    addStatus(t('status.layerRenamed'), 'info', 1800);
  }
  renderLayersUI();
}

function applyTooltips(){
  document.querySelectorAll('[data-tool-key]').forEach((element)=>{
    const meta = TOOL_META[element.dataset.toolKey];
    if(!meta) return;
    const label = t(meta.labelKey);
    const title = meta.shortcut ? label + ' (' + meta.shortcut + ')' : label;
    element.title = title;
    element.setAttribute('aria-label', title);
  });
  const mapping = {
    'zoom-fit': { labelKey: 'props.fitView', shortcut: 'Ctrl+0' },
    'zoom-100': { labelKey: 'header.actual', shortcut: null },
    'zoom-in': { labelKey: 'header.zoomIn', shortcut: null },
    'zoom-out': { labelKey: 'header.zoomOut', shortcut: null },
    'dup-layer': { labelKey: 'layers.duplicate', shortcut: 'Ctrl+J' },
    'save-project': { labelKey: 'header.saveProject', shortcut: 'Ctrl+S' },
    'open-project': { labelKey: 'header.openProject', shortcut: 'Ctrl+O' },
    export: { labelKey: 'header.export', shortcut: 'Ctrl+Shift+S' },
    undo: { labelKey: 'header.undo', shortcut: 'Ctrl+Z' },
    redo: { labelKey: 'header.redo', shortcut: 'Ctrl+Shift+Z' }
  };
  Object.entries(mapping).forEach(([id, meta])=>{
    const el = document.getElementById(id);
    if(!el) return;
    const label = t(meta.labelKey);
    const title = meta.shortcut ? label + ' (' + meta.shortcut + ')' : label;
    el.title = title;
    el.setAttribute('aria-label', title);
  });
}

function fitView(showToast = false){
  resetViewportTransform();
  composite();
  if(showToast) addStatus(t('status.viewFit'), 'info');
}

function setActualSize(showToast = false){
  const fitScale = Math.min(view.width / width, view.height / height) || 1;
  viewportTransform.scale = getPreviewDpr() / fitScale;
  viewportTransform.offsetX = 0;
  viewportTransform.offsetY = 0;
  composite();
  if(showToast) addStatus(t('status.viewActual'), 'info');
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
  pushHistory('history.reorderLayers');
  addStatus(t('status.layerOrder'), 'info');
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
  if(tool === 'select' && insideDocument){
    const selectionMode = selection?.ready ? getSelectionHandleAt(pos) : null;
    const cursors = { move:'move', n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize', nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize' };
    viewport.style.cursor = cursors[selectionMode] || 'crosshair';
    return;
  }
  if(tool === 'crop' && insideDocument){
    viewport.style.cursor = 'crosshair';
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
