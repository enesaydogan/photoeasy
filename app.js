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

const cursorPreview = document.createElement('div');
cursorPreview.className = 'cursor-preview';
viewport.appendChild(cursorPreview);

const TOOL_META = {
  move: {
    label: 'Move',
    shortcut: 'V',
    hint: 'Move: drag the active layer. Middle-mouse or Ctrl+drag pans the view.'
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
  return pos.x >= 0 && pos.y >= 0 && pos.x <= width && pos.y <= height;
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
  const show = layers.length <= 1 && layers.every((layer)=> String(layer?.name || '').toLowerCase().includes('background'));
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
  zoomReadoutEl.textContent = Math.max(1, Math.round(display.totalScale * 100)) + '%';
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
  viewportTransform.scale = 1 / fitScale;
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
    const diameter = Math.max(8, Math.round(size * getDisplayTransform().totalScale));
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

function resizePreviewCanvas(){
  const nextWidth = Math.max(1, viewport.clientWidth || 1);
  const nextHeight = Math.max(1, viewport.clientHeight || 1);
  if(view.width !== nextWidth || view.height !== nextHeight){
    view.width = nextWidth;
    view.height = nextHeight;
  }
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

// History
let history = [];
let historyIndex = -1;
function pushHistory(label = 'Edit'){
  // capture state
  const snapshot = {width, height, layers: [], activeIndex: layers.indexOf(activeLayer), label};
  for(const l of layers){
    snapshot.layers.push({
      dataURL: l.canvas.toDataURL(),
      offset: {...l.offset},
      visible: l.visible,
      opacity: l.opacity,
      name: l.name,
      blend: l.blend || 'source-over',
      mask: l.maskCanvas ? l.maskCanvas.toDataURL() : null,
      locked: l.locked || false,
      type: l.type || null,
      text: l.text || null,
      font: l.font || null,
      color: l.color || null,
      fontSize: l.fontSize || null,
      fontFamily: l.fontFamily || null,
      bold: l.bold || false
    });
  }
  // trim redo
  history = history.slice(0, historyIndex+1);
  history.push(snapshot);
  historyIndex = history.length-1;
  updateHistoryButtons();
}

async function restoreHistory(idx){
  if(idx < 0 || idx >= history.length) return;
  const snap = history[idx];
  width = snap.width || width;
  height = snap.height || height;
  renamingLayerIndex = null;
  renamingLayerDraft = '';
  try{ updateViewportAspect(); }catch(e){}
  try{ updateCanvasSizeDisplay(); }catch(e){}
  transformState = null;
  cropPending = false;
  selection = null;
  const selDiv = document.getElementById('sel-rect');
  if(selDiv) selDiv.remove();
  const newLayers = [];
  for(const item of snap.layers){
    const img = new Image();
    img.src = item.dataURL;
    await new Promise(r=> img.onload = r);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
    const layerObj = {
      canvas:c,
      ctx,
      name:item.name,
      offset:item.offset,
      visible:item.visible,
      opacity:item.opacity,
      blend: item.blend || 'source-over',
      maskCanvas: null,
      locked: item.locked || false,
      type: item.type || null,
      text: item.text || null,
      font: item.font || null,
      color: item.color || null,
      fontSize: item.fontSize || null,
      fontFamily: item.fontFamily || null,
      bold: item.bold || false
    };
    if(item.mask){
      const mimg = new Image(); mimg.src = item.mask; await new Promise(r=> mimg.onload = r);
      const mc = document.createElement('canvas'); mc.width = mimg.width; mc.height = mimg.height; const mctx = mc.getContext('2d'); mctx.drawImage(mimg,0,0);
      layerObj.maskCanvas = mc;
    }
    newLayers.push(layerObj);
  }
  layers = newLayers;
  activeLayer = layers[snap.activeIndex] || null;
  editMaskMode = false;
  if(currentTextEditor){
    try{ currentTextEditor.cancel(); }catch(e){ currentTextEditor = null; }
  }
  renderLayersUI(); composite();
  historyIndex = idx;
  updateHistoryButtons();
}

function updateHistoryButtons(){
  try{
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if(undoBtn) undoBtn.disabled = historyIndex <= 0;
    if(redoBtn) redoBtn.disabled = historyIndex >= history.length-1 || history.length===0;
  }catch(e){}
  updateCanvasChrome();
  renderHistoryPanel();
}

async function undo(){
  if(historyIndex > 0){
    const label = history[historyIndex]?.label || 'edit';
    await restoreHistory(historyIndex-1);
    addStatus('Undid ' + label + '.', 'info', 1800);
  }
}
async function redo(){
  if(historyIndex < history.length-1){
    const label = history[historyIndex + 1]?.label || 'edit';
    await restoreHistory(historyIndex+1);
    addStatus('Redid ' + label + '.', 'info', 1800);
  }
}

function createLayer(name='Layer', options = {}){
  const { historyLabel = 'Add Layer', skipHistory = false } = options;
  // ensure new layer canvas matches the largest existing layer or the current view
  let desiredW = width, desiredH = height;
  for(const l of layers){ if(l && l.canvas){ desiredW = Math.max(desiredW, l.canvas.width); desiredH = Math.max(desiredH, l.canvas.height); } }
  // if desired size differs from current view, update view size so canvases align
  if(desiredW !== width || desiredH !== height){
    width = desiredW; height = desiredH;
    try{ updateCanvasSizeDisplay(); }catch(e){}
    try{ updateViewportAspect(); }catch(e){}
  }
  const c = document.createElement('canvas');
  c.width = desiredW; c.height = desiredH;
  const ctx = c.getContext('2d');
  // If this is a Background layer, fill it white by default
  if(name && String(name).toLowerCase().includes('background')){
    ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height); ctx.restore();
  }
  // Lock background layers by default
  const isBackground = name && String(name).toLowerCase().includes('background');
  const layer = {canvas:c,ctx,name,offset:{x:0,y:0},visible:true,opacity:1, blend:'source-over', maskCanvas:null, locked: isBackground};
  layers.push(layer);
  if(!skipHistory) pushHistory(historyLabel);
  setActiveLayer(layers.length-1);
  renderLayersUI();
  composite();
}

function cloneCanvas(sourceCanvas){
  const clone = document.createElement('canvas');
  clone.width = sourceCanvas.width;
  clone.height = sourceCanvas.height;
  const cloneCtx = clone.getContext('2d');
  cloneCtx.drawImage(sourceCanvas, 0, 0);
  return clone;
}

function getDuplicateLayerName(baseName){
  const sanitizedBase = (baseName || 'Layer').trim() || 'Layer';
  const existingNames = new Set(layers.map((layer)=> layer.name));
  let candidate = sanitizedBase + ' copy';
  let copyIndex = 2;
  while(existingNames.has(candidate)){
    candidate = sanitizedBase + ' copy ' + copyIndex;
    copyIndex += 1;
  }
  return candidate;
}

function duplicateActiveLayer(){
  if(!activeLayer){
    addStatus('No active layer to duplicate.', 'warning');
    return;
  }
  const sourceIndex = layers.indexOf(activeLayer);
  if(sourceIndex < 0) return;
  const clonedCanvas = cloneCanvas(activeLayer.canvas);
  const duplicateLayer = {
    canvas: clonedCanvas,
    ctx: clonedCanvas.getContext('2d'),
    name: getDuplicateLayerName(activeLayer.name),
    offset: { ...activeLayer.offset },
    visible: activeLayer.visible,
    opacity: activeLayer.opacity,
    blend: activeLayer.blend || 'source-over',
    maskCanvas: activeLayer.maskCanvas ? cloneCanvas(activeLayer.maskCanvas) : null,
    locked: !!activeLayer.locked,
    type: activeLayer.type || null,
    text: activeLayer.text || null,
    font: activeLayer.font || null,
    color: activeLayer.color || null,
    fontSize: activeLayer.fontSize || null,
    fontFamily: activeLayer.fontFamily || null,
    bold: !!activeLayer.bold
  };
  layers.splice(sourceIndex + 1, 0, duplicateLayer);
  activeLayer = duplicateLayer;
  renderLayersUI();
  composite();
  pushHistory('Duplicate Layer');
  addStatus(duplicateLayer.name + ' created. Undo restores the previous layer stack.', 'info', 2400);
}

// ensure there's an initial history snapshot representing the empty document
pushHistory('Blank Document');
updateHistoryButtons();

function setActiveLayer(idx){
  activeLayer = layers[idx];
  renderLayersUI();
  updateCanvasChrome();
}

function deleteActiveLayer(){
  if(!activeLayer){
    addStatus('No active layer to remove.', 'warning');
    return;
  }
  const idx = layers.indexOf(activeLayer);
  if(idx>=0){
    if(renamingLayerIndex === idx){
      renamingLayerIndex = null;
      renamingLayerDraft = '';
    }
    const deletedName = activeLayer.name || 'Layer';
    layers.splice(idx,1);
    activeLayer = layers[layers.length-1] || null;
    renderLayersUI(); composite();
    pushHistory('Delete Layer');
    addStatus(deletedName + ' deleted. Undo restores it.', 'warning', 3200);
  }
}

function renderLayersUI(){
  layersList.innerHTML='';
  for(let i=layers.length-1;i>=0;i--){
    const layer = layers[i];
    const li = document.createElement('li');
    li.dataset.layerIndex = String(i);
    const row = document.createElement('div'); row.className = 'layer-row';
    row.draggable = true;
    const thumb = document.createElement('canvas'); thumb.className = 'layer-thumb'; thumb.width = 56; thumb.height = 42;
    try{ const tctx = thumb.getContext('2d'); tctx.clearRect(0,0,thumb.width,thumb.height); tctx.drawImage(layer.canvas, 0,0, layer.canvas.width, layer.canvas.height, 0,0, thumb.width, thumb.height); }catch(e){}
    let nameNode;
    if(renamingLayerIndex === i){
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'layer-name-input';
      nameInput.value = renamingLayerDraft;
      nameInput.dataset.layerRename = String(i);
      nameInput.setAttribute('aria-label', 'Rename ' + layer.name);
      nameInput.oninput = (ev)=>{ renamingLayerDraft = ev.target.value; };
      nameInput.onkeydown = (ev)=>{
        ev.stopPropagation();
        if(ev.key === 'Enter'){
          ev.preventDefault();
          commitLayerRename(i, nameInput.value);
        }
        if(ev.key === 'Escape'){
          ev.preventDefault();
          cancelLayerRename();
        }
      };
      nameInput.onblur = ()=> commitLayerRename(i, nameInput.value);
      ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach((eventName)=>{
        nameInput.addEventListener(eventName, (ev)=> ev.stopPropagation());
      });
      nameNode = nameInput;
    } else {
      const name = document.createElement('div');
      name.className='layer-name';
      name.textContent=layer.name;
      name.ondblclick = (ev)=>{ ev.stopPropagation(); startLayerRename(i); };
      nameNode = name;
    }
    const opacity = document.createElement('input'); opacity.type = 'range'; opacity.min = 0; opacity.max = 1; opacity.step = 0.01; opacity.value = layer.opacity; opacity.className = 'layer-opacity';
    const opVal = document.createElement('div'); opVal.className = 'layer-opacity-value'; opVal.textContent = Math.round(layer.opacity*100) + '%';
    opacity.oninput = (e)=>{ layer.opacity = Number(e.target.value); opVal.textContent = Math.round(layer.opacity*100) + '%'; composite(); };
    opacity.onchange = ()=> pushHistory('Adjust Layer Opacity');
    // prevent clicks on controls from bubbling and re-rendering the layer row (which closes selects)
    opacity.addEventListener('pointerdown', (ev)=>{ ev.stopPropagation(); });
    opacity.addEventListener('mousedown', (ev)=>{ ev.stopPropagation(); });

    const controls = document.createElement('div'); controls.className='layer-controls';
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'layer-icon layer-grip';
    dragHandle.title = 'Drag to reorder layer';
    dragHandle.textContent = '::';
    dragHandle.onclick = (ev)=> ev.stopPropagation();
    const vis = document.createElement('button');
    vis.type = 'button';
    vis.className = 'layer-icon';
    vis.title = layer.visible ? 'Hide layer' : 'Show layer';
    vis.textContent = layer.visible ? 'Hide' : 'Show';
    vis.onclick = (ev)=>{ ev.stopPropagation(); layer.visible = !layer.visible; composite(); renderLayersUI(); pushHistory(layer.visible ? 'Show Layer' : 'Hide Layer'); };

    const meta = document.createElement('div'); meta.className = 'layer-meta';
    // Name on top (title style) to avoid layout breaks from long names
    const headerRow = document.createElement('div');
    headerRow.className = 'layer-header-row';
    if(nameNode.classList.contains('layer-name')){
      nameNode.style.whiteSpace = 'nowrap';
      nameNode.style.overflow = 'hidden';
      nameNode.style.textOverflow = 'ellipsis';
      nameNode.style.width = '100%';
    }
    headerRow.appendChild(nameNode);
    if(layer === activeLayer){
      const activeBadge = document.createElement('span');
      activeBadge.className = 'layer-badge';
      activeBadge.textContent = 'Active';
      headerRow.appendChild(activeBadge);
    }
    meta.appendChild(headerRow);

    const midRow = document.createElement('div'); midRow.className = 'layer-mid-row';
    midRow.appendChild(thumb);
    const controlWrap = document.createElement('div'); controlWrap.className = 'layer-control-wrap';
    const opRow = document.createElement('div'); opRow.className = 'layer-op-row';
    opRow.appendChild(opacity);
    opRow.appendChild(opVal);
    controlWrap.appendChild(opRow);
    // blend mode selector
    const blendRow = document.createElement('div'); blendRow.className = 'layer-blend-row';
    const blendLabel = document.createElement('div'); blendLabel.className='prop-title'; blendLabel.textContent='Blend';
    const blendSel = document.createElement('select'); ['source-over','multiply','screen','overlay','darken','lighten'].forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=b; if((layer.blend||'source-over')===b) o.selected=true; blendSel.appendChild(o); });
    blendSel.onchange = (e)=>{ layer.blend = e.target.value; composite(); pushHistory('Change Blend Mode'); };
    // prevent the select from bubbling (keeps the dropdown open while interacting)
    blendSel.addEventListener('pointerdown', (ev)=>{ ev.stopPropagation(); });
    blendSel.addEventListener('mousedown', (ev)=>{ ev.stopPropagation(); });
    blendSel.addEventListener('click', (ev)=>{ ev.stopPropagation(); });
    blendRow.appendChild(blendLabel); blendRow.appendChild(blendSel); controlWrap.appendChild(blendRow);
    midRow.appendChild(controlWrap);
    meta.appendChild(midRow);

    // place lock and mask buttons in a single control row (lock left, mask right)
    const controlRow = document.createElement('div'); controlRow.className = 'layer-control-row';
    const leftControls = document.createElement('div'); leftControls.className = 'layer-control-left';
    const rightControls = document.createElement('div'); rightControls.className = 'layer-control-right';

    // Lock button (left)
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'layer-icon lock-btn';
    lockBtn.textContent = layer.locked ? 'Unlock' : 'Lock';
    lockBtn.title = layer.locked ? 'Unlock this layer' : 'Lock this layer';
    lockBtn.onclick = (ev) => {
      ev.stopPropagation();
      layer.locked = !layer.locked;
      renderLayersUI();
      pushHistory(layer.locked ? 'Lock Layer' : 'Unlock Layer');
    };
    leftControls.appendChild(lockBtn);

    // Mask button (right)
    const maskBtn = document.createElement('button'); maskBtn.type = 'button'; maskBtn.className='mask-btn'; maskBtn.textContent = layer.maskCanvas? 'Remove Mask' : 'Add Mask';
    maskBtn.onclick = (ev)=>{ ev.stopPropagation(); if(layer.maskCanvas){ layer.maskCanvas = null; addStatus('Mask removed. Undo restores it.', 'warning', 3200); pushHistory('Remove Mask'); } else { const mc=document.createElement('canvas'); mc.width = width; mc.height = height; const mctx = mc.getContext('2d'); mctx.fillStyle = '#fff'; mctx.fillRect(0,0,mc.width,mc.height); layer.maskCanvas = mc; pushHistory('Add Mask'); addStatus('Mask added to ' + layer.name + '.', 'info', 1800); } renderLayersUI(); composite(); };
    rightControls.appendChild(maskBtn);

    controlRow.appendChild(leftControls);
    controlRow.appendChild(rightControls);
    meta.appendChild(controlRow);

    row.appendChild(meta);
    row.appendChild(controls);
    controls.appendChild(vis);
    controls.appendChild(dragHandle);

    // Row selection behavior
    row.classList.add('layer-row');
    if(layer === activeLayer) row.classList.add('active');
    row.style.cursor = 'pointer';
    row.onclick = ()=> { setActiveLayer(i); };
    row.addEventListener('dragstart', (ev)=>{
      layerDragIndex = i;
      li.classList.add('dragging');
      try{ ev.dataTransfer.setData('text/plain', String(i)); }catch(e){}
      ev.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', (ev)=>{
      ev.preventDefault();
      const rect = row.getBoundingClientRect();
      const placeAfter = ev.clientY >= rect.top + rect.height / 2;
      clearLayerDragState();
      li.classList.add(placeAfter ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('drop', (ev)=>{
      ev.preventDefault();
      const rect = row.getBoundingClientRect();
      const placeAfter = ev.clientY >= rect.top + rect.height / 2;
      clearLayerDragState();
      reorderLayer(layerDragIndex, i, placeAfter);
      layerDragIndex = null;
    });
    row.addEventListener('dragend', ()=>{
      clearLayerDragState();
      layerDragIndex = null;
    });
    li.appendChild(row);
    layersList.appendChild(li);
  }
  updateCanvasChrome();
}

function updateLayerThumbnails(){
  const thumbs = document.querySelectorAll('.layer-thumb');
  if(!thumbs || thumbs.length === 0) return;
  thumbs.forEach((thumb, idx)=>{
    const layerIndex = layers.length - 1 - idx; // reverse mapping
    const layer = layers[layerIndex];
    try{
      const tctx = thumb.getContext('2d'); tctx.clearRect(0,0,thumb.width,thumb.height);
      tctx.drawImage(layer.canvas, 0,0, layer.canvas.width, layer.canvas.height, 0,0, thumb.width, thumb.height);
    }catch(e){}
  });
}

function moveLayerUp(indexFromTop){
  const idx = indexFromTop;
  if(idx >= layers.length-1) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx+1,0,a);
  renderLayersUI(); composite();
  pushHistory();
}

function moveLayerDown(indexFromTop){
  const idx = indexFromTop;
  if(idx <= 0) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx-1,0,a);
  renderLayersUI(); composite();
  pushHistory();
}

function renderFlattenedToContext(destCtx, options = {}){
  const { applyViewportTransform = false, skipLayer = null } = options;
  const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height;
  // contexts used for readback should set willReadFrequently to true.
  // This is important for performance when dealing with large images.
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  const accCanvas = document.createElement('canvas'); accCanvas.width = width; accCanvas.height = height;
  const accCtx = accCanvas.getContext('2d', { willReadFrequently: true });

  // helper: perform per-pixel blend of src (ImageData) onto accCtx at region x,y
  function blendRectToAcc(x,y,w,h, srcImg, layer){
    // read destination region
    const dstImg = accCtx.getImageData(x,y,w,h);
    const s = srcImg.data; const d = dstImg.data;
    const blendName = layer.blend || 'source-over';
    const funcs = {
      'multiply': (s,d)=> s*d,
      'screen': (s,d)=> 1 - (1-s)*(1-d),
      'overlay': (s,d)=> (d < 0.5) ? (2*s*d) : (1 - 2*(1-s)*(1-d)),
      'darken': (s,d)=> Math.min(s,d),
      'lighten': (s,d)=> Math.max(s,d)
    };
    const blendFn = funcs[blendName];
    for(let iy=0; iy<h; iy++){
      for(let ix=0; ix<w; ix++){
        const i = (iy * w + ix) * 4;
        const sR = s[i]/255, sG = s[i+1]/255, sB = s[i+2]/255, sAraw = s[i+3]/255;
        const sA = sAraw * (layer.opacity === undefined ? 1 : layer.opacity);
        if(sA === 0) continue;
        const dR = d[i]/255, dG = d[i+1]/255, dB = d[i+2]/255, dA = d[i+3]/255;
        let bR, bG, bB;
        if(!blendFn) { bR = sR; bG = sG; bB = sB; } else { bR = blendFn(sR,dR); bG = blendFn(sG,dG); bB = blendFn(sB,dB); }
        const outA = sA + dA*(1 - sA);
        const premR = bR * sA + dR * dA * (1 - sA);
        const premG = bG * sA + dG * dA * (1 - sA);
        const premB = bB * sA + dB * dA * (1 - sA);
        const outR = outA ? (premR / outA) : 0;
        const outG = outA ? (premG / outA) : 0;
        const outB = outA ? (premB / outA) : 0;
        d[i] = Math.round(outR*255); d[i+1] = Math.round(outG*255); d[i+2] = Math.round(outB*255); d[i+3] = Math.round(outA*255);
      }
    }
    accCtx.putImageData(dstImg, x, y);
  }

  for(const layer of layers){
    if(!layer.visible) continue;
    if(skipLayer && layer === skipLayer) continue;
    // fast path: simple source-over with no mask -> draw directly to accCtx
    if((!layer.blend || layer.blend === 'source-over') && !layer.maskCanvas){
      accCtx.globalCompositeOperation = 'source-over';
      accCtx.globalAlpha = layer.opacity === undefined ? 1 : layer.opacity;
      accCtx.drawImage(layer.canvas, layer.offset.x, layer.offset.y);
      accCtx.globalAlpha = 1;
      continue;
    }
    // otherwise we need to render the layer into tmp (including mask) and blend per-pixel
    tctx.clearRect(0,0,width,height);
    tctx.drawImage(layer.canvas, layer.offset.x, layer.offset.y);
    if(layer.maskCanvas){ tctx.globalCompositeOperation = 'destination-in'; tctx.drawImage(layer.maskCanvas, 0,0); tctx.globalCompositeOperation = 'source-over'; }
    // determine bounding rect for this layer in canvas coordinates
    const lx0 = Math.max(0, layer.offset.x|0); const ly0 = Math.max(0, layer.offset.y|0);
    const lx1 = Math.min(width, layer.offset.x + layer.canvas.width|0); const ly1 = Math.min(height, layer.offset.y + layer.canvas.height|0);
    const rw = Math.max(0, lx1 - lx0); const rh = Math.max(0, ly1 - ly0);
    if(rw === 0 || rh === 0) continue;
    const srcImg = tctx.getImageData(lx0, ly0, rw, rh);
    blendRectToAcc(lx0, ly0, rw, rh, srcImg, layer);
  }
  destCtx.save();
  destCtx.clearRect(0, 0, destCtx.canvas.width, destCtx.canvas.height);
  if(applyViewportTransform){
    const display = getDisplayTransform();
    destCtx.translate(display.originX, display.originY);
    destCtx.scale(display.totalScale, display.totalScale);
  }
  destCtx.drawImage(accCanvas, 0, 0);
  destCtx.restore();
}

function composite(){
  // Composite layers with Photoshop-like blend modes by per-pixel blending when needed.
  renderFlattenedToContext(viewCtx, { applyViewportTransform: true, skipLayer: transformState ? transformState.layer : null });
  // draw transform preview if active
  if(transformState){
    const ts = transformState;
    const l = ts.layer;
    const display = getDisplayTransform();
    // center of the bbox in canvas coords
    const cx = l.offset.x + ts.bounds.x + ts.bounds.w/2;
    const cy = l.offset.y + ts.bounds.y + ts.bounds.h/2;
    viewCtx.save();
    viewCtx.translate(display.originX, display.originY);
    viewCtx.scale(display.totalScale, display.totalScale);
    viewCtx.translate(cx, cy);
    viewCtx.rotate(ts.rotation);
    viewCtx.scale(ts.scale, ts.scale);
    viewCtx.globalAlpha = l.opacity;
    // draw only the bbox (tight pixels) centered
    viewCtx.drawImage(ts.bboxCanvas, -ts.bounds.w/2, -ts.bounds.h/2);
    viewCtx.restore();

    // draw bounding box + handles
    const w = ts.bounds.w * ts.scale; const h = ts.bounds.h * ts.scale;
    // corners in canvas coords after transform (relative to bbox center)
    const corners = [
      {x:-ts.bounds.w/2, y:-ts.bounds.h/2},
      {x:ts.bounds.w/2, y:-ts.bounds.h/2},
      {x:ts.bounds.w/2, y:ts.bounds.h/2},
      {x:-ts.bounds.w/2, y:ts.bounds.h/2}
    ].map(p=>{
      const x = p.x * ts.scale; const y = p.y * ts.scale;
      const rx = x * Math.cos(ts.rotation) - y * Math.sin(ts.rotation);
      const ry = x * Math.sin(ts.rotation) + y * Math.cos(ts.rotation);
      return {
        x: Math.round(display.originX + (cx + rx) * display.totalScale),
        y: Math.round(display.originY + (cy + ry) * display.totalScale)
      };
    });
    viewCtx.strokeStyle = 'rgba(236,239,242,0.82)'; viewCtx.lineWidth = 1.5; viewCtx.beginPath();
    viewCtx.moveTo(corners[0].x, corners[0].y);
    for(let i=1;i<corners.length;i++) viewCtx.lineTo(corners[i].x, corners[i].y);
    viewCtx.closePath(); viewCtx.stroke();
    // draw handles
    for(const c of corners){ viewCtx.fillStyle='rgba(226,232,238,0.95)'; viewCtx.fillRect(c.x-6,c.y-6,12,12); }
    // rotate handle: top center offset
    const topCenter = {x: Math.round((corners[0].x + corners[1].x)/2), y: Math.round((corners[0].y + corners[1].y)/2)};
    const rotHandle = {x: topCenter.x, y: topCenter.y - 30};
    viewCtx.beginPath(); viewCtx.strokeStyle='rgba(210,216,223,0.86)'; viewCtx.moveTo(topCenter.x, topCenter.y); viewCtx.lineTo(rotHandle.x, rotHandle.y); viewCtx.stroke();
    viewCtx.fillStyle='rgba(196,204,212,0.95)'; viewCtx.beginPath(); viewCtx.arc(rotHandle.x, rotHandle.y, 6, 0, Math.PI*2); viewCtx.fill();
  }
  const display = getDisplayTransform();
  viewCtx.save();
  viewCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  viewCtx.lineWidth = 1;
  viewCtx.shadowColor = 'rgba(0,0,0,0.4)';
  viewCtx.shadowBlur = 22;
  viewCtx.strokeRect(
    Math.round(display.originX) + 0.5,
    Math.round(display.originY) + 0.5,
    Math.round(width * display.totalScale),
    Math.round(height * display.totalScale)
  );
  viewCtx.restore();
  if(currentTextEditor){
    const textMetrics = measureTextBlock(currentTextEditor.ta.value || ' ', currentTextEditor.pending);
    const boxX = currentTextEditor.anchor.x;
    const boxY = currentTextEditor.anchor.y;
    const boxW = Math.max(32, textMetrics.width);
    const boxH = Math.max(currentTextEditor.pending.fontSize, textMetrics.lineHeight * textMetrics.lineCount);
    viewCtx.save();
    viewCtx.translate(display.originX, display.originY);
    viewCtx.scale(display.totalScale, display.totalScale);
    viewCtx.strokeStyle = 'rgba(255,255,255,0.86)';
    viewCtx.setLineDash([6 / display.totalScale, 4 / display.totalScale]);
    viewCtx.lineWidth = 1 / display.totalScale;
    viewCtx.strokeRect(boxX, boxY, boxW, boxH);
    viewCtx.setLineDash([]);
    [[boxX, boxY],[boxX + boxW, boxY],[boxX + boxW, boxY + boxH],[boxX, boxY + boxH]].forEach(([handleX, handleY])=>{
      const hs = 6 / display.totalScale;
      viewCtx.fillStyle = 'rgba(236,239,242,0.96)';
      viewCtx.fillRect(handleX - hs / 2, handleY - hs / 2, hs, hs);
    });
    viewCtx.restore();
  }
  viewCtx.globalAlpha = 1;
  // update layer thumbnails when the main view changes
  updateLayerThumbnails();
  if(currentTextEditor) syncTextEditorAppearance(currentTextEditor);
  updateCanvasChrome();
}

// Drawing
function getPos(e){
  const point = getViewPointFromClient(e.clientX, e.clientY);
  const display = getDisplayTransform();
  const canvasX = (point.x - display.originX) / display.totalScale;
  const canvasY = (point.y - display.originY) / display.totalScale;
  return {x: canvasX, y: canvasY};
}

function canvasToPagePosition(x, y){
  const rect = view.getBoundingClientRect();
  const cssScaleX = rect.width / view.width;
  const cssScaleY = rect.height / view.height;
  const display = getDisplayTransform();
  return {
    left: rect.left + (display.originX + x * display.totalScale) * cssScaleX,
    top: rect.top + (display.originY + y * display.totalScale) * cssScaleY
  };
}

// Update the canvas size display in the UI
function updateCanvasSizeDisplay(){
  const el = document.getElementById('canvas-size');
  if(!el) return;
  el.textContent = width + ' × ' + height + ' px';
}

function createTextCanvas(text, fontString, fillColor, textSize){
  const normalizedText = text.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = fontString;
  const lineHeight = Math.max(1, Math.ceil(textSize * 1.2));
  const widestLine = lines.reduce((maxWidth, line) => {
    const sample = line.length ? line : ' ';
    return Math.max(maxWidth, Math.ceil(measureCtx.measureText(sample).width));
  }, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, widestLine);
  canvas.height = Math.max(1, lineHeight * lines.length);
  const ctx = canvas.getContext('2d');
  ctx.font = fontString;
  ctx.fillStyle = fillColor;
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, index * lineHeight);
  });
  return canvas;
}

const TEXT_HIT_PADDING = 10;

function getTextFontString(fontOptions, scale = 1){
  return (fontOptions.bold ? 'bold ' : '') + Math.max(1, Math.round(fontOptions.fontSize * scale)) + 'px ' + fontOptions.fontFamily;
}

function measureTextBlock(text, fontOptions, scale = 1){
  const normalizedText = (text || '').replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = getTextFontString(fontOptions, scale);
  const lineHeight = Math.max(1, Math.ceil(fontOptions.fontSize * scale * 1.2));
  const width = lines.reduce((maxWidth, line) => {
    const sample = line.length ? line : ' ';
    return Math.max(maxWidth, Math.ceil(measureCtx.measureText(sample).width));
  }, 1);
  return { width, lineHeight, lineCount: Math.max(1, lines.length) };
}

function removeTextEditor(editor){
  if(!editor) return;
  try{ if(editor.shell && editor.shell.parentNode) editor.shell.parentNode.removeChild(editor.shell); }catch(e){}
}

function syncTextEditorAppearance(editor){
  if(!editor || !editor.ta || !editor.shell) return;
  const display = getDisplayTransform();
  const pagePos = canvasToPagePosition(editor.anchor.x, editor.anchor.y);
  const uiScale = Math.max(1, display.totalScale);
  const paddingX = Math.max(12, Math.round(14 * uiScale));
  const paddingY = Math.max(10, Math.round(12 * uiScale));
  const metrics = measureTextBlock(editor.ta.value, editor.pending, uiScale);
  const editorWidth = Math.max(Math.round(180 * uiScale), metrics.width + paddingX * 2);
  const editorHeight = Math.max(Math.round(52 * uiScale), metrics.lineHeight * metrics.lineCount + paddingY * 2 + Math.round(24 * uiScale));

  editor.shell.style.left = pagePos.left + 'px';
  editor.shell.style.top = pagePos.top + 'px';
  editor.shell.style.padding = paddingY + 'px ' + paddingX + 'px ' + Math.max(8, Math.round(10 * uiScale)) + 'px';
  editor.shell.style.minWidth = editorWidth + 'px';
  editor.shell.style.minHeight = editorHeight + 'px';
  editor.shell.style.borderRadius = Math.max(12, Math.round(14 * uiScale)) + 'px';
  editor.shell.style.boxShadow = '0 0 0 ' + Math.max(1, Math.round(uiScale)) + 'px rgba(255,255,255,0.14), 0 18px 42px rgba(0,0,0,0.38)';

  editor.ta.style.font = getTextFontString(editor.pending, uiScale);
  editor.ta.style.color = editor.pending.color;
  editor.ta.style.width = (editorWidth - paddingX * 2) + 'px';
  editor.ta.style.height = Math.max(Math.round(36 * uiScale), metrics.lineHeight * metrics.lineCount + Math.round(8 * uiScale)) + 'px';
  editor.ta.style.lineHeight = (metrics.lineHeight / Math.max(1, Math.round(editor.pending.fontSize * uiScale))) + '';

  if(editor.meta){
    editor.meta.style.fontSize = Math.max(10, Math.round(11 * uiScale)) + 'px';
  }
}

function findTextLayerAt(pos){
  for(let index = layers.length - 1; index >= 0; index--){
    const layer = layers[index];
    if(!layer || layer.type !== 'text' || !layer.visible) continue;
    const localX = pos.x - layer.offset.x;
    const localY = pos.y - layer.offset.y;
    if(localX < -TEXT_HIT_PADDING || localY < -TEXT_HIT_PADDING || localX > layer.canvas.width + TEXT_HIT_PADDING || localY > layer.canvas.height + TEXT_HIT_PADDING) continue;
    return layer;
  }
  return null;
}

function openTextEditor(options){
  const { layer = null, position = null } = options;
  const anchor = layer ? { x: layer.offset.x, y: layer.offset.y } : { x: Math.round(position.x), y: Math.round(position.y) };
  const pending = {
    color: layer?.color || color,
    fontSize: layer?.fontSize || fontSize,
    fontFamily: layer?.fontFamily || fontFamily,
    bold: !!(layer ? layer.bold : fontBold)
  };

  const shell = document.createElement('div');
  shell.className = 'text-editor-shell';

  const ta = document.createElement('textarea');
  ta.className = 'text-editor-input';
  ta.spellcheck = false;
  ta.value = layer?.text || '';

  const meta = document.createElement('div');
  meta.className = 'text-editor-meta';
  meta.textContent = 'Ctrl+Enter to commit  •  Esc to cancel';

  shell.appendChild(ta);
  shell.appendChild(meta);
  document.body.appendChild(shell);

  const editorState = {
    shell,
    ta,
    meta,
    layer,
    anchor,
    pending,
    commit: null,
    cancel: null
  };

  function finalizeEditor(commitChanges){
    const textValue = ta.value.replace(/\r\n/g, '\n');
    const targetLayer = editorState.layer;
    removeTextEditor(editorState);
    currentTextEditor = null;

    if(!commitChanges){
      renderToolProps();
      composite();
      addStatus('Text edit canceled.', 'info', 1600);
      return;
    }

    if(!textValue.trim()){
      if(targetLayer){
        const layerIndex = layers.indexOf(targetLayer);
        if(layerIndex >= 0){
          layers.splice(layerIndex, 1);
          if(activeLayer === targetLayer) activeLayer = layers[layerIndex] || layers[layerIndex - 1] || null;
          renderLayersUI();
          composite();
          pushHistory('Delete Text Layer');
          addStatus('Empty text layer removed. Undo restores it.', 'warning', 2600);
        }
      } else {
        renderLayersUI();
        composite();
      }
      renderToolProps();
      return;
    }

    const fontString = getTextFontString(editorState.pending);
    const textCanvas = createTextCanvas(textValue, fontString, editorState.pending.color, editorState.pending.fontSize);
    if(targetLayer){
      targetLayer.canvas = textCanvas;
      targetLayer.ctx = textCanvas.getContext('2d');
      targetLayer.text = textValue;
      targetLayer.font = fontString;
      targetLayer.color = editorState.pending.color;
      targetLayer.fontSize = editorState.pending.fontSize;
      targetLayer.fontFamily = editorState.pending.fontFamily;
      targetLayer.bold = editorState.pending.bold;
      targetLayer.offset = { ...editorState.anchor };
      activeLayer = targetLayer;
    } else {
      const newLayer = {
        canvas: textCanvas,
        ctx: textCanvas.getContext('2d'),
        name: 'Text',
        offset: { ...editorState.anchor },
        visible: true,
        opacity: 1,
        type: 'text',
        text: textValue,
        font: fontString,
        color: editorState.pending.color,
        fontSize: editorState.pending.fontSize,
        fontFamily: editorState.pending.fontFamily,
        bold: editorState.pending.bold
      };
      layers.push(newLayer);
      activeLayer = newLayer;
    }

    renderLayersUI();
    composite();
    pushHistory(targetLayer ? 'Edit Text' : 'Add Text');
    addStatus(targetLayer ? 'Text updated.' : 'Text layer created.', 'info', 1800);
    renderToolProps();
  }

  editorState.commit = ()=> finalizeEditor(true);
  editorState.cancel = ()=> finalizeEditor(false);

  ta.addEventListener('input', ()=> syncTextEditorAppearance(editorState));
  ta.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){
      ev.preventDefault();
      editorState.commit();
    }
    if(ev.key === 'Escape'){
      ev.preventDefault();
      editorState.cancel();
    }
  });

  currentTextEditor = editorState;
  syncTextEditorAppearance(editorState);
  renderToolProps();
  setTimeout(()=>{
    try{
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }catch(e){}
  }, 0);
}

view.addEventListener('mousedown', (e)=>{
  // Only allow left mouse button (button 0) for tool operations
  // Right click (button 2) and middle click (button 1) should not activate tools
  if(e.button !== 0) return;
  
  // allow some tools even when there's no active layer (text, crop)
  if(!activeLayer && !['text','crop','zoom'].includes(tool)) return;
  
  // Prevent editing of locked layers for drawing tools
  if(activeLayer && activeLayer.locked && ['brush', 'eraser', 'fill', 'move', 'transform', 'select', 'magic'].includes(tool)) {
    addStatus('Layer is locked. Unlock it to edit.', 'warning', 2800);
    updateCursorFeedback(e.clientX, e.clientY);
    return;
  }
  // transform interactive start
  if(tool === 'transform'){
    if(!transformState) {
      startTransform(activeLayer);
      renderToolProps();
    }
    const pos = getPos(e);
    const ts = transformState; if(!ts) return;
    const l = ts.layer;
    const cx = l.offset.x + ts.bounds.x + ts.bounds.w/2; const cy = l.offset.y + ts.bounds.y + ts.bounds.h/2;
    // compute corners
    const corners = [
      {x:-ts.bounds.w/2, y:-ts.bounds.h/2},
      {x:ts.bounds.w/2, y:-ts.bounds.h/2},
      {x:ts.bounds.w/2, y:ts.bounds.h/2},
      {x:-ts.bounds.w/2, y:ts.bounds.h/2}
    ].map(p=>{ const x = p.x * ts.scale; const y = p.y * ts.scale; const rx = x * Math.cos(ts.rotation) - y * Math.sin(ts.rotation); const ry = x * Math.sin(ts.rotation) + y * Math.cos(ts.rotation); return {x: cx + rx, y: cy + ry}; });
    const topCenter = {x: Math.round((corners[0].x + corners[1].x)/2), y: Math.round((corners[0].y + corners[1].y)/2)};
    const rotHandle = {x: topCenter.x, y: topCenter.y - 30};
    // allow any corner to start a scale (uniform) operation
    let handled = false;
    for(let ci=0; ci<corners.length; ci++){
      const c = corners[ci];
      const d = Math.hypot(pos.x - c.x, pos.y - c.y);
      if(d < 14){
        ts.dragging = true; ts.handle = 'scale'; ts.handleCorner = ci; ts.startScale = ts.scale; ts.startDist = Math.hypot(pos.x - cx, pos.y - cy); handled = true; break;
      }
    }
    const dRot = Math.hypot(pos.x - rotHandle.x, pos.y - rotHandle.y);
    if(!handled && dRot < 14){ ts.dragging = true; ts.handle = 'rotate'; ts.startAngle = Math.atan2(pos.y - cy, pos.x - cx); ts.startRotation = ts.rotation; handled = true; }
    else {
      // check inside transformed rect
      const lx = (pos.x - cx); const ly = (pos.y - cy);
      // inverse rotate/scale
      const ix = (lx * Math.cos(-ts.rotation) - ly * Math.sin(-ts.rotation)) / ts.scale;
      const iy = (lx * Math.sin(-ts.rotation) + ly * Math.cos(-ts.rotation)) / ts.scale;
      if(Math.abs(ix) <= ts.bounds.w/2 && Math.abs(iy) <= ts.bounds.h/2){ ts.dragging = true; ts.handle = 'move'; last = pos; }
    }
    return;
  }
  if(tool==='move'){
    drawing = true; last = getPos(e);
    return;
  }

  if(tool === 'zoom'){
    const point = getViewPointFromClient(e.clientX, e.clientY);
    const zoomFactor = e.altKey ? 0.8 : 1.25;
    zoomViewport(viewportTransform.scale * zoomFactor, point.x, point.y);
    composite();
    addStatus(e.altKey ? 'Zoomed out.' : 'Zoomed in.', 'info', 1200);
    return;
  }

  if(tool==='select'){
    // start selection rect
    const vpRect = viewport.getBoundingClientRect();
    const startVP = { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top };
    selection = { startCanvas: getPos(e), startVP, x:0, y:0, w:0, h:0 };
    const selDiv = document.createElement('div'); selDiv.className='selection-rect'; selDiv.id = 'sel-rect';
    // position initial zero-size rect at start point
    selDiv.style.left = startVP.x + 'px'; selDiv.style.top = startVP.y + 'px'; selDiv.style.width = '0px'; selDiv.style.height = '0px';
    viewport.appendChild(selDiv);
    drawing = true; return;
  }

  if(tool === 'crop'){
    // start crop rect (re-uses selection overlay)
    const vpRect = viewport.getBoundingClientRect();
    const startVP = { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top };
    selection = { startCanvas: getPos(e), startVP, x:0, y:0, w:0, h:0 };
    const selDiv = document.createElement('div'); selDiv.className='selection-rect'; selDiv.id = 'sel-rect';
    selDiv.style.left = startVP.x + 'px'; selDiv.style.top = startVP.y + 'px'; selDiv.style.width = '0px'; selDiv.style.height = '0px';
    viewport.appendChild(selDiv);
    drawing = true; return;
  }

  if(tool === 'magic'){
    const pos = getPos(e);
    if(!activeLayer) { addStatus('Select a layer before using Magic Wand.', 'warning'); return; }
    // build composite imageData
    const tmpc = document.createElement('canvas'); tmpc.width = width; tmpc.height = height; const tctx2 = tmpc.getContext('2d');
    for(const layer of layers){ if(!layer.visible) continue; tctx2.globalAlpha = layer.opacity; tctx2.drawImage(layer.canvas, layer.offset.x, layer.offset.y); }
    tctx2.globalAlpha = 1;
    const compImg = tctx2.getImageData(0,0,width,height);
    const mask = floodFillMask(compImg, Math.round(pos.x), Math.round(pos.y));
    // create mask canvas
    const mc = document.createElement('canvas'); mc.width = width; mc.height = height; const mctx = mc.getContext('2d'); const md = mctx.createImageData(width, height);
    for(let i=0;i<mask.length;i++){ const a = mask[i]?255:0; const idx = i*4; md.data[idx]=255; md.data[idx+1]=255; md.data[idx+2]=255; md.data[idx+3]=a; }
    mctx.putImageData(md,0,0);
    activeLayer.maskCanvas = mc;
    pushHistory('Magic Wand Mask'); renderLayersUI(); composite();
    addStatus('Mask created from the clicked region.', 'info', 1800);
    return;
  }

  if(tool === 'text'){
    const pos = getPos(e);
    if(currentTextEditor){
      try{ currentTextEditor.commit(); }catch(err){ currentTextEditor = null; }
    }
    const textLayer = findTextLayerAt(pos);
    if(textLayer){
      const layerIndex = layers.indexOf(textLayer);
      if(layerIndex >= 0) setActiveLayer(layerIndex);
      openTextEditor({ layer: textLayer });
      return;
    }
    openTextEditor({ position: pos });
    return;
  }
  

  if(tool === 'fill'){
    const pos = getPos(e);
    if(!activeLayer) return;
    const useComposite = !!window.fillUseComposite;
    if(useComposite){
      // compute mask on composite and apply it to active layer
      const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height; const tctx = tmp.getContext('2d');
      for(const layer of layers){ if(!layer.visible) continue; tctx.globalAlpha = layer.opacity; tctx.drawImage(layer.canvas, layer.offset.x, layer.offset.y); }
      tctx.globalAlpha = 1;
      const compImg = tctx.getImageData(0,0,width,height);
      const mask = floodFillMask(compImg, Math.round(pos.x), Math.round(pos.y));
      applyMaskToLayer(mask, width, height, activeLayer, color);
      pushHistory('Composite Fill'); renderLayersUI(); composite();
    } else {
      // compute mask on the active layer only
      const lx = Math.round(pos.x - activeLayer.offset.x); const ly = Math.round(pos.y - activeLayer.offset.y);
      if(lx < 0 || ly < 0 || lx >= activeLayer.canvas.width || ly >= activeLayer.canvas.height) return;
      const img = activeLayer.ctx.getImageData(0,0,activeLayer.canvas.width, activeLayer.canvas.height);
      const mask = floodFillMask(img, lx, ly);
      applyMaskToLayer(mask, activeLayer.canvas.width, activeLayer.canvas.height, activeLayer, color);
      pushHistory('Fill Layer'); renderLayersUI(); composite();
    }
    addStatus('Fill applied.', 'info', 1600);
    return;
  }

  drawing = true; last = getPos(e);
  
  // Determine if we should edit the mask or the main layer
  const isEditingMask = editMaskMode && activeLayer.maskCanvas && (tool === 'brush' || tool === 'eraser');
  const ctx = isEditingMask ? activeLayer.maskCanvas.getContext('2d') : activeLayer.ctx;
  
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.lineWidth = size;
  
  if(tool==='eraser'){
    ctx.save(); 
    ctx.globalCompositeOperation = 'destination-out'; 
    ctx.globalAlpha = toolOpacity;
  } else {
    ctx.save(); 
    ctx.globalCompositeOperation = 'source-over'; 
    ctx.strokeStyle = isEditingMask ? (tool === 'brush' ? 'white' : color) : color;
    ctx.globalAlpha = toolOpacity;
  }
  
  // Adjust position for mask editing (masks are not offset like layers)
  const adjX = isEditingMask ? last.x : last.x - activeLayer.offset.x;
  const adjY = isEditingMask ? last.y : last.y - activeLayer.offset.y;
  
  ctx.beginPath(); ctx.moveTo(adjX, adjY);
});

view.addEventListener('mousemove', (e)=>{
  updateCursorFeedback(e.clientX, e.clientY);
  const pos = getPos(e);
  // handle transform dragging
  if(transformState && transformState.dragging){
    const ts = transformState; const l = ts.layer;
    const cx = l.offset.x + ts.bounds.x + ts.bounds.w/2; const cy = l.offset.y + ts.bounds.y + ts.bounds.h/2;
    if(ts.handle === 'scale'){
      const curDist = Math.hypot(pos.x - cx, pos.y - cy);
      const ns = Math.max(0.01, ts.startScale * (curDist / ts.startDist)); ts.scale = ns; composite(); return;
    } else if(ts.handle === 'rotate'){
      const curA = Math.atan2(pos.y - cy, pos.x - cx); ts.rotation = ts.startRotation + (curA - ts.startAngle); composite(); return;
    } else if(ts.handle === 'move'){
      const dx = pos.x - last.x; const dy = pos.y - last.y; l.offset.x += dx; l.offset.y += dy; last = pos; composite(); return;
    }
  }
  if(!drawing) return;
  
  // Only allow drawing with left mouse button (button 0)
  // This prevents right-click and middle-click from activating drawing tools
  if(e.buttons !== 1) return;
  
  // allow selection/crop to update even when no active layer exists
  if(tool === 'select' || tool === 'crop'){
    if(!selection) return;
    // update CSS overlay using viewport-space coordinates (client pixels)
    const vpRect = viewport.getBoundingClientRect();
    const curVP = { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top };
    const left = Math.min(selection.startVP.x, curVP.x);
    const top = Math.min(selection.startVP.y, curVP.y);
    const wcss = Math.abs(curVP.x - selection.startVP.x);
    const hcss = Math.abs(curVP.y - selection.startVP.y);
    const selDiv = document.getElementById('sel-rect');
    if(selDiv){ selDiv.style.left = left + 'px'; selDiv.style.top = top + 'px'; selDiv.style.width = wcss + 'px'; selDiv.style.height = hcss + 'px'; }
    // also update logical canvas-space selection values for crop/selection logic
    const s = selection.startCanvas || selection.start;
    selection.x = Math.min(s.x, pos.x);
    selection.y = Math.min(s.y, pos.y);
    selection.w = Math.abs(pos.x - s.x);
    selection.h = Math.abs(pos.y - s.y);
    return;
  }
  // remaining drawing tools require an active layer
  if(!activeLayer) return;
  
  // Determine if we should edit the mask or the main layer
  const isEditingMask = editMaskMode && activeLayer.maskCanvas && (tool === 'brush' || tool === 'eraser');
  const ctx = isEditingMask ? activeLayer.maskCanvas.getContext('2d') : activeLayer.ctx;
  
  if(tool==='move'){
    const dx = pos.x - last.x; const dy = pos.y - last.y;
    activeLayer.offset.x += dx; activeLayer.offset.y += dy;
    last = pos; composite(); return;
  }
  
  // Adjust position for mask editing (masks are not offset like layers)
  const adjX = isEditingMask ? pos.x : pos.x - activeLayer.offset.x;
  const adjY = isEditingMask ? pos.y : pos.y - activeLayer.offset.y;
  
  ctx.lineTo(adjX, adjY);
  ctx.stroke(); composite();
  last = pos;
});

view.addEventListener('mouseleave', ()=> updateCursorFeedback());

window.addEventListener('mouseup', ()=>{
  // handle transform mouseup
  if(transformState && transformState.dragging){
    transformState.dragging = false;
    // do not auto-commit here; leave transformState active until user explicitly commits or cancels
    return;
  }
  if(!drawing) return;
  drawing = false;
  if(tool==='select'){
    // finalize selection: create new layer with selected pixels
    const selDiv = document.getElementById('sel-rect'); if(selDiv) selDiv.remove();
    if(selection && selection.w > 1 && selection.h > 1 && activeLayer){
      const s = selection;
      const sx = Math.round(s.x - activeLayer.offset.x); const sy = Math.round(s.y - activeLayer.offset.y);
      const sw = Math.round(s.w); const sh = Math.round(s.h);
      if(sw>0 && sh>0){
        const c = document.createElement('canvas'); c.width = sw; c.height = sh; const cctx = c.getContext('2d');
        cctx.drawImage(activeLayer.canvas, sx, sy, sw, sh, 0,0,sw,sh);
        // clear area on original layer
        activeLayer.ctx.clearRect(sx, sy, sw, sh);
        const newLayer = {canvas:c, ctx:cctx, name:'Selection', offset:{x: Math.round(s.x), y: Math.round(s.y)}, visible:true, opacity:1};
        layers.push(newLayer);
        activeLayer = newLayer;
        renderLayersUI(); composite();
        pushHistory('Lift Selection To Layer');
        addStatus('Selection moved into a new layer. Undo restores the original pixels.', 'info', 2600);
      }
    }
    selection = null; return;
  }

  if(tool === 'crop'){
    // keep the selection visible and require explicit commit/cancel
    drawing = false;
    const selDiv = document.getElementById('sel-rect');
    if(selection && selection.w > 1 && selection.h > 1){
      cropPending = true;
      if(selDiv) selDiv.classList.add('pending-crop');
      renderToolProps();
    } else {
      if(selDiv) selDiv.remove();
      selection = null; cropPending = false; renderToolProps();
    }
    return;
  }

  try{
    // Restore the appropriate context based on whether we were editing a mask
    const isEditingMask = activeLayer.maskCanvas && (tool === 'brush' || tool === 'eraser');
    const ctx = isEditingMask ? activeLayer.maskCanvas.getContext('2d') : activeLayer.ctx;
    ctx.restore();
  }catch(e){}
  pushHistory(tool === 'brush' ? 'Brush Stroke' : 'Erase Stroke');
});

// UI bindings
document.getElementById('tool-brush').addEventListener('click', ()=> selectTool('brush'));
document.getElementById('tool-eraser').addEventListener('click', ()=> selectTool('eraser'));
document.getElementById('tool-move').addEventListener('click', ()=> selectTool('move'));
document.getElementById('tool-select').addEventListener('click', ()=> selectTool('select'));
document.getElementById('tool-transform').addEventListener('click', ()=> doTransform());
document.getElementById('tool-zoom')?.addEventListener('click', ()=> selectTool('zoom'));
document.getElementById('tool-text')?.addEventListener('click', ()=> selectTool('text'));
document.getElementById('tool-fill')?.addEventListener('click', ()=> selectTool('fill'));
document.getElementById('tool-crop')?.addEventListener('click', ()=> selectTool('crop'));
document.getElementById('tool-magic')?.addEventListener('click', ()=> selectTool('magic'));

function selectTool(t){
  // if leaving the text tool while an editor is open, commit the edit
  if(currentTextEditor && t !== 'text'){
    try{ currentTextEditor.commit(); }catch(err){ currentTextEditor = null; }
  }
  // if a crop is pending and user switches tools, cancel it
  if(cropPending && t !== 'crop'){
    try{ cancelCrop(); }catch(e){ cropPending = false; }
  }
  tool = t;
  document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById('tool-'+t);
  if(btn) btn.classList.add('active');
  // render per-tool properties
  setTimeout(()=>{ try{ renderToolProps(); }catch(e){} }, 0);
  updateCanvasChrome();
}

// renderToolProps placeholder - will be defined later in file
function renderToolProps(){
  const el = document.getElementById('tool-props-content'); if(!el) return; el.innerHTML = '';
  const createBlock = (title)=>{ const blk = document.createElement('div'); blk.className = 'prop-block'; const t = document.createElement('div'); t.className='prop-title'; t.textContent = title; blk.appendChild(t); return blk; };

  if(tool === 'brush'){
    const colorBlk = createBlock('Color');
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = color; colorInput.oninput = (e)=> color = e.target.value;
    colorBlk.appendChild(colorInput);

    const sizeBlk = createBlock('Size');
    const sizeRow = document.createElement('div'); sizeRow.className = 'prop-control-row';
    const sizeRange = document.createElement('input'); sizeRange.type='range'; sizeRange.min=1; sizeRange.max=200; sizeRange.value = size; sizeRange.oninput = (e)=>{ size = Number(e.target.value); sizeVal.textContent = size; };
    const sizeVal = document.createElement('div'); sizeVal.className='prop-value'; sizeVal.textContent = size;
    sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeVal); sizeBlk.appendChild(sizeRow);

    const opBlk = createBlock('Opacity');
    const opRow = document.createElement('div'); opRow.className='prop-control-row';
    const opRange = document.createElement('input'); opRange.type='range'; opRange.min=0; opRange.max=100; opRange.value = Math.round(toolOpacity*100); opRange.oninput = (e)=>{ toolOpacity = Number(e.target.value)/100; opVal.textContent = e.target.value + '%'; };
    const opVal = document.createElement('div'); opVal.className='prop-value'; opVal.textContent = Math.round(toolOpacity*100) + '%';
    opRow.appendChild(opRange); opRow.appendChild(opVal); opBlk.appendChild(opRow);

    // Add mask editing toggle if layer has a mask
    if(activeLayer && activeLayer.maskCanvas){
      const maskBlk = createBlock('Mask Editing');
      const maskToggle = document.createElement('label');
      maskToggle.style.display = 'flex'; maskToggle.style.alignItems = 'center'; maskToggle.style.gap = '8px';
      const maskCheckbox = document.createElement('input'); maskCheckbox.type = 'checkbox';
      maskCheckbox.checked = editMaskMode; // Use current mode
      maskCheckbox.onchange = (e) => {
        editMaskMode = e.target.checked;
      };
      const maskLabel = document.createElement('span'); maskLabel.textContent = 'Edit Mask';
      maskLabel.style.color = '#a9b6d8'; maskLabel.style.fontSize = '14px';
      maskToggle.appendChild(maskCheckbox); maskToggle.appendChild(maskLabel);
      maskBlk.appendChild(maskToggle);
      el.appendChild(maskBlk);
    }

    el.appendChild(colorBlk); el.appendChild(sizeBlk); el.appendChild(opBlk);
  } else if(tool === 'eraser'){
    const sizeBlk = createBlock('Size');
    const sizeRow = document.createElement('div'); sizeRow.className = 'prop-control-row';
    const sizeRange = document.createElement('input'); sizeRange.type='range'; sizeRange.min=1; sizeRange.max=200; sizeRange.value = size; sizeRange.oninput = (e)=>{ size = Number(e.target.value); sizeVal.textContent = size; };
    const sizeVal = document.createElement('div'); sizeVal.className='prop-value'; sizeVal.textContent = size;
    sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeVal); sizeBlk.appendChild(sizeRow);
    const opBlk = createBlock('Opacity');
    const opRow = document.createElement('div'); opRow.className='prop-control-row';
    const opRange = document.createElement('input'); opRange.type='range'; opRange.min=0; opRange.max=100; opRange.value = Math.round(toolOpacity*100); opRange.oninput = (e)=>{ toolOpacity = Number(e.target.value)/100; opVal.textContent = e.target.value + '%'; };
    const opVal = document.createElement('div'); opVal.className='prop-value'; opVal.textContent = Math.round(toolOpacity*100) + '%';
    opRow.appendChild(opRange); opRow.appendChild(opVal); opBlk.appendChild(opRow);

    // Add mask editing toggle if layer has a mask
    if(activeLayer && activeLayer.maskCanvas){
      const maskBlk = createBlock('Mask Editing');
      const maskToggle = document.createElement('label');
      maskToggle.style.display = 'flex'; maskToggle.style.alignItems = 'center'; maskToggle.style.gap = '8px';
      const maskCheckbox = document.createElement('input'); maskCheckbox.type = 'checkbox';
      maskCheckbox.checked = editMaskMode; // Use current mode
      maskCheckbox.onchange = (e) => {
        editMaskMode = e.target.checked;
      };
      const maskLabel = document.createElement('span'); maskLabel.textContent = 'Edit Mask';
      maskLabel.style.color = '#a9b6d8'; maskLabel.style.fontSize = '14px';
      maskToggle.appendChild(maskCheckbox); maskToggle.appendChild(maskLabel);
      maskBlk.appendChild(maskToggle);
      el.appendChild(maskBlk);
    }

    el.appendChild(sizeBlk); el.appendChild(opBlk);
  } else if(tool === 'transform'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent='Transform active layer pixels (tight bounds). Use handles to scale/rotate, Move to drag.'; el.appendChild(help);
    if(transformState){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const ok = document.createElement('button'); ok.textContent = 'Commit Transform'; ok.onclick = ()=>{ try{ commitTransform(); }catch(e){} };
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel Transform'; cancel.onclick = ()=>{ try{ cancelTransform(); }catch(e){} };
      row.appendChild(ok); row.appendChild(cancel); el.appendChild(row);
    } else {
      const info = document.createElement('div'); info.style.color='#999'; info.style.fontSize='12px'; info.textContent='Click the canvas to begin transforming the active layer.'; el.appendChild(info);
    }
  } else if(tool === 'text'){
    const colorBlk = createBlock('Color');
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value=color;
    colorInput.dataset.for = 'text';
    colorInput.oninput=(e)=>{ color = e.target.value; if(currentTextEditor){ currentTextEditor.pending.color = color; syncTextEditorAppearance(currentTextEditor); } };
    colorBlk.appendChild(colorInput);

    const sizeBlk = createBlock('Font size');
    const sizeInput = document.createElement('input'); sizeInput.type='number'; sizeInput.min=8; sizeInput.max=240; sizeInput.value=fontSize; sizeInput.oninput=(e)=>{ fontSize = Number(e.target.value); if(currentTextEditor){ currentTextEditor.pending.fontSize = fontSize; syncTextEditorAppearance(currentTextEditor); } };
    sizeBlk.appendChild(sizeInput);

    const familyBlk = createBlock('Font');
    const sel = document.createElement('select'); ['sans-serif','serif','monospace'].forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent=f; if(f===fontFamily) o.selected=true; sel.appendChild(o); }); sel.onchange=(e)=>{ fontFamily = e.target.value; if(currentTextEditor){ currentTextEditor.pending.fontFamily = fontFamily; syncTextEditorAppearance(currentTextEditor); } };
    familyBlk.appendChild(sel);

    const boldBlk = createBlock('Bold');
    const boldChk = document.createElement('input'); boldChk.type='checkbox'; boldChk.checked = fontBold; boldChk.onchange = (e)=>{ fontBold = e.target.checked; if(currentTextEditor){ currentTextEditor.pending.bold = fontBold; syncTextEditorAppearance(currentTextEditor); } }; boldBlk.appendChild(boldChk);

    el.appendChild(colorBlk); el.appendChild(sizeBlk); el.appendChild(familyBlk); el.appendChild(boldBlk);
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent='Click on canvas to place text. Edit existing text by clicking it.'; el.appendChild(help);
    // if editing right now, show commit/cancel buttons
    if(currentTextEditor){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const commitBtn = document.createElement('button'); commitBtn.textContent = 'Commit (Ctrl+Enter)'; commitBtn.onclick = ()=>{ currentTextEditor.commit(); };
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel (Esc)'; cancelBtn.onclick = ()=>{ currentTextEditor.cancel(); };
      row.appendChild(commitBtn); row.appendChild(cancelBtn); el.appendChild(row);
    }
  } else if(tool === 'zoom'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent='Zoom tool: click to zoom in, Alt+click to zoom out, or use Fit / 100% in the toolbar.'; el.appendChild(help);
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
    const fitBtn = document.createElement('button'); fitBtn.textContent = 'Fit View'; fitBtn.onclick = ()=> fitView(true);
    const actualBtn = document.createElement('button'); actualBtn.textContent = '100%'; actualBtn.onclick = ()=> setActualSize(true);
    row.appendChild(fitBtn); row.appendChild(actualBtn); el.appendChild(row);
  } else if(tool === 'crop'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent='Click and drag to select crop area. Release to preview, then Commit or Cancel.'; el.appendChild(help);
    if(cropPending){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const ok = document.createElement('button'); ok.textContent = 'Commit Crop'; ok.onclick = ()=>{ try{ commitCrop(); }catch(e){} };
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel Crop'; cancel.onclick = ()=>{ try{ cancelCrop(); }catch(e){} };
      row.appendChild(ok); row.appendChild(cancel); el.appendChild(row);
    }
  } else {
    const info = document.createElement('div'); info.style.color='#ddd'; info.style.fontSize='13px'; info.textContent='Tool options'; el.appendChild(info);
  }
  if(tool === 'fill'){
    // add color picker and option to calculate mask on composite (but always apply to active layer)
    const colorBlk = createBlock('Fill Color');
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = color; colorInput.oninput = (e)=> color = e.target.value;
    colorBlk.appendChild(colorInput);
    const optBlk = createBlock('Mask Source');
    const chk = document.createElement('input'); chk.type='checkbox'; chk.id = 'fill-use-composite'; chk.checked = !!window.fillUseComposite; chk.onchange = (e)=> window.fillUseComposite = e.target.checked;
    const lbl = document.createElement('label'); lbl.htmlFor = chk.id; lbl.textContent = 'Calculate mask from composite (all layers)'; optBlk.appendChild(chk); optBlk.appendChild(lbl);
    el.appendChild(colorBlk); el.appendChild(optBlk);
    // replace color input with picker
    const colorInputs = el.querySelectorAll('input[type="color"]');
    colorInputs.forEach(ci=>{
      const parent = ci.parentElement || el;
      const isTextColor = ci.dataset && ci.dataset.for === 'text';
      const cp = createColorPicker(color, (hex)=>{ color = hex; ci.value = hex; if(isTextColor && currentTextEditor){ currentTextEditor.pending.color = hex; syncTextEditorAppearance(currentTextEditor); } });
      parent.replaceChild(cp, ci);
    });
  }
  // if any color input exists, attach color picker for unified behavior
  const colorInputs = el.querySelectorAll('input[type="color"]');
  colorInputs.forEach(ci=>{
    const parent = ci.parentElement || el;
    const isTextColor = ci.dataset && ci.dataset.for === 'text';
    // replace with custom color picker; if this is the text color control and a live editor exists, update it immediately
    const cp = createColorPicker(color, (hex)=>{ color = hex; ci.value = hex; if(isTextColor && currentTextEditor){ currentTextEditor.pending.color = hex; syncTextEditorAppearance(currentTextEditor); } });
    parent.replaceChild(cp, ci);
  });
}

// --- Color helper functions ---
function hexToRgb(hex){ hex = hex.replace('#',''); if(hex.length===3) hex = hex.split('').map(c=>c+c).join(''); const num = parseInt(hex,16); return {r:(num>>16)&255, g:(num>>8)&255, b:num&255}; }
function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function rgbToHsv(r,g,b){ r/=255;g/=255;b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); const d=max-min; let h=0; if(d){ if(max===r) h= (g-b)/d + (g<b?6:0); else if(max===g) h= (b-r)/d + 2; else h= (r-g)/d + 4; h/=6;} const s = max===0?0:d/max; const v = max; return {h:h*360, s:s, v:v}; }
function hsvToRgb(h,s,v){ h = (h%360+360)%360; const c = v*s; const x = c*(1-Math.abs((h/60)%2 -1)); const m = v-c; let r=0,g=0,b=0; if(h<60){ r=c; g=x; b=0;} else if(h<120){ r=x; g=c; b=0;} else if(h<180){ r=0; g=c; b=x;} else if(h<240){ r=0; g=x; b=c;} else if(h<300){ r=x; g=0; b=c;} else { r=c; g=0; b=x; } return {r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255)}; }

function createColorPicker(initialHex, onChange){
  const wrapper = document.createElement('div'); wrapper.className='color-picker';
  const sv = document.createElement('canvas'); sv.className='cp-sv'; sv.width = 300; sv.height = 200;
  const hue = document.createElement('input'); hue.type='range'; hue.className='cp-hue'; hue.min=0; hue.max=360; hue.value=0;
  const controls = document.createElement('div'); controls.className='cp-controls';
  const hexIn = document.createElement('input'); hexIn.className='cp-hex'; hexIn.value = initialHex;
  const swatch = document.createElement('div'); swatch.className='cp-swatch'; swatch.style.background = initialHex;
  controls.appendChild(hexIn); controls.appendChild(swatch);
  const recent = document.createElement('div'); recent.className='cp-recent'; // placeholder
  wrapper.appendChild(sv); wrapper.appendChild(hue); wrapper.appendChild(controls); wrapper.appendChild(recent);

  let hsv = rgbToHsv(...Object.values(hexToRgb(initialHex)));

  function drawSV(){
    const ctx = sv.getContext('2d'); const w=sv.width, h=sv.height;
    // base hue
    ctx.fillStyle = rgbToHex(...Object.values(hsvToRgb(hsv.h,1,1)));
    ctx.fillRect(0,0,w,h);
    // saturation gradient
    const satGrad = ctx.createLinearGradient(0,0,w,0); satGrad.addColorStop(0,'#fff'); satGrad.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle = satGrad; ctx.fillRect(0,0,w,h);
    // value gradient
    const valGrad = ctx.createLinearGradient(0,0,0,h); valGrad.addColorStop(0,'rgba(0,0,0,0)'); valGrad.addColorStop(1,'#000'); ctx.fillStyle = valGrad; ctx.fillRect(0,0,w,h);
  }

  function updateUI(){
    hexIn.value = rgbToHex(...Object.values(hsvToRgb(hsv.h, hsv.s, hsv.v)));
    swatch.style.background = hexIn.value;
    hue.value = hsv.h;
    drawSV();
    if(onChange) onChange(hexIn.value);
  }

  // pointer handling on sv canvas
  function svPointer(e){
    const rect = sv.getBoundingClientRect(); const x = Math.max(0, Math.min(sv.width, (e.clientX-rect.left) * (sv.width/rect.width)));
    const y = Math.max(0, Math.min(sv.height, (e.clientY-rect.top) * (sv.height/rect.height)));
    hsv.s = x / sv.width; hsv.v = 1 - (y / sv.height); updateUI();
  }
  let svDown = false; sv.addEventListener('mousedown', (e)=>{ svDown=true; svPointer(e); }); window.addEventListener('mousemove', (e)=>{ if(svDown) svPointer(e); }); window.addEventListener('mouseup', ()=>{ svDown=false; });
  sv.addEventListener('touchstart', (e)=>{ svPointer(e.touches[0]); e.preventDefault(); }, { passive: false });
  sv.addEventListener('touchmove',(e)=>{ svPointer(e.touches[0]); e.preventDefault(); }, { passive: false });

  hue.addEventListener('input', (e)=>{ hsv.h = Number(e.target.value); updateUI(); });
  hexIn.addEventListener('change', (e)=>{ try{ const rgb = hexToRgb(e.target.value); const h = rgbToHsv(rgb.r,rgb.g,rgb.b); hsv = h; updateUI(); }catch(err){} });

  // initial draw
  updateUI();
  return wrapper;
}

// Flood fill helpers
function colorMatch(data, idx, r,g,b,a){ return data[idx]===r && data[idx+1]===g && data[idx+2]===b && data[idx+3]===a; }

function floodFillMask(imageData, startX, startY){
  const w = imageData.width, h = imageData.height; const data = imageData.data;
  const mask = new Uint8Array(w*h);
  const startIdx = (startY * w + startX) * 4;
  const sr = data[startIdx], sg = data[startIdx+1], sb = data[startIdx+2], sa = data[startIdx+3];
  const stack = [startX, startY];
  while(stack.length){ const y = stack.pop(); const x = stack.pop(); if(x<0||x>=w||y<0||y>=h) continue; const i = (y*w + x); if(mask[i]) continue; const idx = i*4; if(!colorMatch(data, idx, sr,sg,sb,sa)) continue; mask[i]=1; stack.push(x+1,y); stack.push(x-1,y); stack.push(x,y+1); stack.push(x,y-1); }
  return mask;
}

function applyMaskToColor(mask, w, h, fillColor){
  const out = document.createElement('canvas'); out.width = w; out.height = h; const octx = out.getContext('2d'); const img = octx.createImageData(w,h); const data = img.data; const [fr,fg,fb] = hexToRgb(fillColor?fillColor:'#000');
  for(let i=0;i<w*h;i++){ if(mask[i]){ const idx = i*4; data[idx]=fr; data[idx+1]=fg; data[idx+2]=fb; data[idx+3]=255; } }
  octx.putImageData(img,0,0); return out;
}

function floodFillLayerAt(layer, pageX, pageY, fillHex){
  if(!layer) return;
  const lx = Math.round(pageX - layer.offset.x); const ly = Math.round(pageY - layer.offset.y);
  if(lx<0||ly<0||lx>=layer.canvas.width||ly>=layer.canvas.height) return;
  const ctx = layer.ctx; const img = ctx.getImageData(0,0,layer.canvas.width, layer.canvas.height);
  const mask = floodFillMask(img, lx, ly);
  // apply fill color to pixels where mask=1
  const [fr,fg,fb] = Object.values(hexToRgb(fillHex));
  for(let i=0;i<mask.length;i++){ if(mask[i]){ const idx=i*4; img.data[idx]=fr; img.data[idx+1]=fg; img.data[idx+2]=fb; img.data[idx+3]=255; } }
  ctx.putImageData(img,0,0);
}

function floodFillCompositeAt(pageX, pageY, fillHex){
  // build composite imageData
  const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height; const tctx = tmp.getContext('2d');
  for(const layer of layers){ if(!layer.visible) continue; tctx.globalAlpha = layer.opacity; tctx.drawImage(layer.canvas, layer.offset.x, layer.offset.y); }
  tctx.globalAlpha = 1;
  const img = tctx.getImageData(0,0,width,height);
  const mask = floodFillMask(img, Math.round(pageX), Math.round(pageY));
  const filled = applyMaskToColor(mask, width, height, fillHex);
  // add new layer with filled pixels
  const newCanvas = document.createElement('canvas'); newCanvas.width = width; newCanvas.height = height; const nctx = newCanvas.getContext('2d'); nctx.drawImage(filled,0,0);
  const newLayer = {canvas:newCanvas, ctx:newCanvas.getContext('2d'), name:'Fill', offset:{x:0,y:0}, visible:true, opacity:1};
  layers.push(newLayer); activeLayer = newLayer; renderLayersUI(); composite(); pushHistory();
}

function applyMaskToLayer(mask, maskW, maskH, layer, fillHex){
  if(!layer) return;
  const lw = layer.canvas.width, lh = layer.canvas.height;
  const img = layer.ctx.getImageData(0,0,lw,lh);
  const [fr,fg,fb] = Object.values(hexToRgb(fillHex));
  for(let y=0;y<lh;y++){
    for(let x=0;x<lw;x++){
      const gx = layer.offset.x + x; const gy = layer.offset.y + y;
      if(gx < 0 || gy < 0 || gx >= maskW || gy >= maskH) continue;
      const mi = gy * maskW + gx;
      if(mask[mi]){
        const idx = (y*lw + x) * 4;
        img.data[idx] = fr; img.data[idx+1] = fg; img.data[idx+2] = fb; img.data[idx+3] = 255;
      }
    }
  }
  layer.ctx.putImageData(img,0,0);
}

// Find tight bounding box of non-transparent pixels in a layer's canvas
function getLayerContentBounds(layer){
  const w = layer.canvas.width, h = layer.canvas.height;
  try{
    const img = layer.ctx.getImageData(0,0,w,h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const idx = (y*w + x)*4 + 3; // alpha
        if(img[idx] !== 0){ if(x < minX) minX = x; if(x > maxX) maxX = x; if(y < minY) minY = y; if(y > maxY) maxY = y; }
      }
    }
    if(maxX < 0) return { x: 0, y: 0, w: w, h: h }; // empty -> whole canvas
    return { x: minX, y: minY, w: (maxX - minX + 1), h: (maxY - minY + 1) };
  }catch(e){ return { x: 0, y: 0, w: w, h: h }; }
}

document.getElementById('add-layer').addEventListener('click', ()=> createLayer('Layer ' + (layers.length+1)));
document.getElementById('dup-layer').addEventListener('click', ()=> duplicateActiveLayer());
document.getElementById('del-layer').addEventListener('click', ()=> deleteActiveLayer());
document.getElementById('export').addEventListener('click', exportPNG);
document.getElementById('import-image').addEventListener('click', ()=> fileInput.click());
document.getElementById('resize-canvas').addEventListener('click', resizeCanvas);
fileInput.addEventListener('change', handleFile);
// history buttons
const undoBtn = document.getElementById('undo'); if(undoBtn) undoBtn.addEventListener('click', ()=> undo());
const redoBtn = document.getElementById('redo'); if(redoBtn) redoBtn.addEventListener('click', ()=> redo());

// Zoom control buttons
document.getElementById('zoom-in')?.addEventListener('click', () => {
  zoomViewport(viewportTransform.scale * 1.2);
  composite();
});

document.getElementById('zoom-out')?.addEventListener('click', () => {
  zoomViewport(viewportTransform.scale * 0.8);
  composite();
});

document.getElementById('zoom-fit')?.addEventListener('click', ()=> fitView(true));
document.getElementById('zoom-100')?.addEventListener('click', ()=> setActualSize(true));

// Resize modal event listeners
document.getElementById('close-resize-modal').addEventListener('click', closeResizeModal);
document.getElementById('cancel-resize').addEventListener('click', closeResizeModal);
document.getElementById('confirm-resize').addEventListener('click', confirmResize);

let syncingResizeInputs = false;

function syncResizeFromWidth(){
  const maintainAspect = document.getElementById('maintain-aspect');
  if(!maintainAspect || !maintainAspect.checked || syncingResizeInputs) return;
  const widthInput = document.getElementById('new-width');
  const heightInput = document.getElementById('new-height');
  const ratio = Number(maintainAspect.dataset.aspectRatio || (width / height) || 1);
  syncingResizeInputs = true;
  heightInput.value = Math.max(1, Math.round((parseInt(widthInput.value, 10) || 1) / ratio));
  syncingResizeInputs = false;
}

function syncResizeFromHeight(){
  const maintainAspect = document.getElementById('maintain-aspect');
  if(!maintainAspect || !maintainAspect.checked || syncingResizeInputs) return;
  const widthInput = document.getElementById('new-width');
  const heightInput = document.getElementById('new-height');
  const ratio = Number(maintainAspect.dataset.aspectRatio || (width / height) || 1);
  syncingResizeInputs = true;
  widthInput.value = Math.max(1, Math.round((parseInt(heightInput.value, 10) || 1) * ratio));
  syncingResizeInputs = false;
}

document.getElementById('maintain-aspect').addEventListener('change', () => {
  syncResizeFromWidth();
});
document.getElementById('new-width').addEventListener('input', syncResizeFromWidth);
document.getElementById('new-height').addEventListener('input', syncResizeFromHeight);

// Show resize canvas modal
function resizeCanvas(){
  const modal = document.getElementById('resize-modal');
  const widthInput = document.getElementById('new-width');
  const heightInput = document.getElementById('new-height');
  const maintainAspect = document.getElementById('maintain-aspect');
  
  // Set current dimensions
  widthInput.value = width;
  heightInput.value = height;
  maintainAspect.dataset.aspectRatio = String(width / height || 1);
  if(maintainAspect.checked) syncResizeFromWidth();
  
  // Show modal
  modal.style.display = 'block';
}

// Close resize modal
function closeResizeModal() {
  document.getElementById('resize-modal').style.display = 'none';
}

// Confirm resize and apply changes
function confirmResize() {
  const widthInput = document.getElementById('new-width');
  const heightInput = document.getElementById('new-height');
  
  const newWidth = parseInt(widthInput.value);
  const newHeight = parseInt(heightInput.value);
  
  if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
    addStatus('Please enter valid canvas dimensions.', 'warning');
    return;
  }
  
  // Update the canvas dimensions
  width = newWidth;
  height = newHeight;
  try{ updateViewportAspect(); }catch(e){}
  
  // Resize each layer's canvas
  for (const layer of layers) {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = width;
    newCanvas.height = height;
    const newCtx = newCanvas.getContext('2d');
    // If this is a background layer, preserve background fill (white)
    const isBackground = layer.name && String(layer.name).toLowerCase().includes('background');
    if (isBackground) {
      newCtx.save();
      newCtx.fillStyle = '#ffffff';
      newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);
      newCtx.restore();
    }

    // Draw the existing layer content onto the new canvas (keeps existing pixels at 0,0)
    try { newCtx.drawImage(layer.canvas, 0, 0); } catch (e) { /* ignore */ }

    // Replace layer canvas/context
    layer.canvas = newCanvas;
    layer.ctx = newCtx;

    // Resize maskCanvas if present (masks default to white)
    if (layer.maskCanvas) {
      const newMask = document.createElement('canvas');
      newMask.width = width; newMask.height = height;
      const mctx = newMask.getContext('2d');
      // fill mask with white (visible) by default, then draw existing mask
      mctx.save(); mctx.fillStyle = '#fff'; mctx.fillRect(0,0,newMask.width,newMask.height); mctx.restore();
      try { mctx.drawImage(layer.maskCanvas, 0, 0); } catch(e) { /* ignore */ }
      layer.maskCanvas = newMask;
    }
  }
  
  composite();
  pushHistory('Resize Canvas');
  addStatus('Canvas resized. Undo restores the previous size.', 'warning', 3200);
  
  // Update UI display for canvas size
  try{ updateCanvasSizeDisplay(); }catch(e){}

  // Close modal
  closeResizeModal();
}

function handleFile(e){
  const f = e.target.files[0]; if(!f) return;
  const img = new Image(); img.onload = ()=>{
    // If user requested, resize the canvas to the imported image size first
    const resizeCheckbox = document.getElementById('import-resize');
    const resizeToImage = resizeCheckbox && resizeCheckbox.checked;
    if(resizeToImage){
      const newWidth = img.width; const newHeight = img.height;
      // Update view dimensions
      width = newWidth; height = newHeight;
      try{ updateViewportAspect(); }catch(e){}

      // Resize each layer's canvas and masks similar to confirmResize
      for (const layer of layers) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = width; newCanvas.height = height;
        const newCtx = newCanvas.getContext('2d');
        const isBackground = layer.name && String(layer.name).toLowerCase().includes('background');
        if (isBackground) {
          newCtx.save(); newCtx.fillStyle = '#ffffff'; newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height); newCtx.restore();
        }
        try { newCtx.drawImage(layer.canvas, 0, 0); } catch (e) { /* ignore */ }
        layer.canvas = newCanvas; layer.ctx = newCtx;
        if (layer.maskCanvas) {
          const newMask = document.createElement('canvas'); newMask.width = width; newMask.height = height; const mctx = newMask.getContext('2d');
          mctx.save(); mctx.fillStyle = '#fff'; mctx.fillRect(0,0,newMask.width,newMask.height); mctx.restore();
          try { mctx.drawImage(layer.maskCanvas, 0, 0); } catch(e) { /* ignore */ }
          layer.maskCanvas = newMask;
        }
      }
      try{ updateCanvasSizeDisplay(); }catch(e){}
      // Reset viewport transform so the view refits after resizing
      resetViewportTransform();
    }

    // Create imported layer and draw the image. If we resized canvas to image dimensions, draw at native size.
    createLayer('Imported', { skipHistory: true });
    const l = activeLayer;
    if(resizeToImage){
      try{ l.ctx.drawImage(img, 0, 0); } catch(e) { /* ignore */ }
    } else {
      // Draw image preserving aspect ratio and center it within the canvas
      const imgW = img.width, imgH = img.height;
      const maxW = width, maxH = height;
      const scale = Math.min(maxW / imgW, maxH / imgH, 1);
      const drawW = Math.round(imgW * scale);
      const drawH = Math.round(imgH * scale);
      const dx = Math.round((maxW - drawW) / 2);
      const dy = Math.round((maxH - drawH) / 2);
      try { l.ctx.drawImage(img, 0, 0, imgW, imgH, dx, dy, drawW, drawH); } catch(e) { /* ignore */ }
    }
    composite();
    pushHistory('Import Image');
    addStatus('Image imported.', 'info', 1800);
  };
  img.src = URL.createObjectURL(f);
}

function exportPNG(){
  const out = document.createElement('canvas'); out.width = width; out.height = height; const octx = out.getContext('2d');
  renderFlattenedToContext(octx);
  const a = document.createElement('a'); a.download = 'photoeasy-export.png'; a.href = out.toDataURL('image/png'); a.click();
}

// Transform: simple scale/rotate of active layer via prompt
function doTransform(){
  if(!activeLayer){
    addStatus('Select a layer before transforming.', 'warning');
    return;
  }
  // commit any active text edits before entering transform
  if(currentTextEditor){ try{ currentTextEditor.commit(); }catch(err){ currentTextEditor = null; } }
  // enter interactive transform mode
  tool = 'transform';
  document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById('tool-transform'); if(btn) btn.classList.add('active');
  startTransform(activeLayer);
  // update tool properties UI to show commit/cancel
  renderToolProps();
}

function startTransform(layer){
  if(!layer) return;
  // compute tight content bounds for the layer (ignore fully transparent areas)
  const bounds = getLayerContentBounds(layer);
  // create a cropped canvas of the layer content we will transform
  const bboxCanvas = document.createElement('canvas'); bboxCanvas.width = Math.max(1, bounds.w); bboxCanvas.height = Math.max(1, bounds.h);
  const bctx = bboxCanvas.getContext('2d');
  try{ bctx.drawImage(layer.canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h); }catch(e){}

  transformState = {
    layer,
    rotation:0,
    scale:1,
    dragging:false,
    handle:null,
    startPos:null,
    startAngle:0,
    startScale:1,
    bounds,
    bboxCanvas,
    // snapshot original offset so we can compute placement
    origOffset: { x: layer.offset.x, y: layer.offset.y }
  };
  // focus for keyboard commit/cancel
  window.addEventListener('keydown', transformKeyHandler);
  composite();
}

function transformKeyHandler(e){
  if(!transformState) return;
  if(e.key === 'Enter'){
    commitTransform();
  } else if(e.key === 'Escape'){
    cancelTransform();
  }
}

function cancelTransform(){
  transformState = null; window.removeEventListener('keydown', transformKeyHandler); composite(); renderToolProps(); addStatus('Transform canceled.', 'info', 1600);
}

function commitTransform(){
  if(!transformState) return;
  const ts = transformState; const l = ts.layer;
  
  // Calculate the visual center of the transformed content
  // The center point relative to the layer's canvas
  const centerX = ts.bounds.x + ts.bounds.w/2;
  const centerY = ts.bounds.y + ts.bounds.h/2;
  
  // Calculate the new bounding box after transformation
  // Get the corners of the original bounding box
  const corners = [
    {x: ts.bounds.x, y: ts.bounds.y},
    {x: ts.bounds.x + ts.bounds.w, y: ts.bounds.y},
    {x: ts.bounds.x + ts.bounds.w, y: ts.bounds.y + ts.bounds.h},
    {x: ts.bounds.x, y: ts.bounds.y + ts.bounds.h}
  ];
  
  // Apply rotation and scaling to each corner
  const transformedCorners = corners.map(c => {
    // Translate to origin (relative to center)
    const tx = c.x - centerX;
    const ty = c.y - centerY;
    
    // Apply rotation
    const rx = tx * Math.cos(ts.rotation) - ty * Math.sin(ts.rotation);
    const ry = tx * Math.sin(ts.rotation) + ty * Math.cos(ts.rotation);
    
    // Apply scaling
    const sx = rx * ts.scale;
    const sy = ry * ts.scale;
    
    // Translate back
    return {
      x: centerX + sx,
      y: centerY + sy
    };
  });
  
  // Find the new bounding box
  const minX = Math.min(...transformedCorners.map(c => c.x));
  const maxX = Math.max(...transformedCorners.map(c => c.x));
  const minY = Math.min(...transformedCorners.map(c => c.y));
  const maxY = Math.max(...transformedCorners.map(c => c.y));
  
  const newBounds = {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
  
  // Calculate the offset adjustment to keep the visual center in the same place
  const newCenterX = newBounds.x + newBounds.w/2;
  const newCenterY = newBounds.y + newBounds.h/2;
  
  // Calculate the adjustment needed to keep the visual center in the same absolute position
  // Convert to absolute coordinates for the adjustment calculation
  const absCenterX = l.offset.x + centerX;
  const absCenterY = l.offset.y + centerY;
  const absNewCenterX = l.offset.x + newCenterX;
  const absNewCenterY = l.offset.y + newCenterY;
  
  const offsetAdjustX = (absCenterX - absNewCenterX);
  const offsetAdjustY = (absCenterY - absNewCenterY);
  
  // Update the layer's offset to compensate for the transformation
  l.offset.x += offsetAdjustX;
  l.offset.y += offsetAdjustY;
  
  // Create an output canvas same size as the layer to preserve layer dimensions
  const out = document.createElement('canvas'); out.width = l.canvas.width; out.height = l.canvas.height;
  const octx = out.getContext('2d');
  // copy original content except the area covered by the original bbox (we will replace it)
  octx.drawImage(l.canvas, 0, 0);
  // clear original bbox area
  octx.clearRect(ts.bounds.x, ts.bounds.y, ts.bounds.w, ts.bounds.h);

  // draw transformed bboxCanvas into the correct place
  octx.save();
  // compute center point in canvas coords where bbox center should be
  // This should be relative to the layer's canvas
  const cx = centerX;
  const cy = centerY;
  octx.translate(cx, cy);
  octx.rotate(ts.rotation);
  octx.scale(ts.scale, ts.scale);
  // draw bbox centered
  octx.drawImage(ts.bboxCanvas, -ts.bounds.w/2, -ts.bounds.h/2);
  octx.restore();

  // replace layer canvas with out
  l.canvas = out; l.ctx = out.getContext('2d');
  transformState = null; window.removeEventListener('keydown', transformKeyHandler);
  pushHistory('Transform Layer'); renderLayersUI(); composite(); renderToolProps(); addStatus('Transform applied.', 'info', 1800);
}

// Crop commit/cancel helpers
function cropCanvasRegion(sourceCanvas, cropX, cropY, cropW, cropH, sourceOffsetX = 0, sourceOffsetY = 0){
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  const srcX = cropX - sourceOffsetX;
  const srcY = cropY - sourceOffsetY;
  if(srcX >= 0 && srcY >= 0 && srcX + cropW <= sourceCanvas.width && srcY + cropH <= sourceCanvas.height){
    outCtx.drawImage(sourceCanvas, srcX, srcY, cropW, cropH, 0, 0, cropW, cropH);
  } else {
    outCtx.clearRect(0, 0, cropW, cropH);
    outCtx.drawImage(sourceCanvas, sourceOffsetX - cropX, sourceOffsetY - cropY);
  }
  return out;
}

function commitCrop(){
  if(!selection) return;
  const selDiv = document.getElementById('sel-rect'); if(selDiv) selDiv.remove();
  if(selection && selection.w > 1 && selection.h > 1){
    const s = selection;
    const sx = Math.round(s.x); const sy = Math.round(s.y);
    const sw = Math.max(1, Math.round(s.w)); const sh = Math.max(1, Math.round(s.h));
    // for each layer, produce a new canvas of size sw x sh and draw content shifted
    for(const layer of layers){
      const newC = cropCanvasRegion(layer.canvas, sx, sy, sw, sh, layer.offset.x, layer.offset.y);
      const nctx = newC.getContext('2d');
      if(layer.maskCanvas){
        layer.maskCanvas = cropCanvasRegion(layer.maskCanvas, sx, sy, sw, sh);
      }
      layer.canvas = newC; layer.ctx = nctx; layer.offset.x = layer.offset.x - sx; layer.offset.y = layer.offset.y - sy;
    }
    width = sw; height = sh; try{ updateViewportAspect(); }catch(e){}
    try{ updateCanvasSizeDisplay(); }catch(e){}
    resetViewportTransform();
    renderLayersUI(); composite(); pushHistory('Crop Canvas');
    addStatus('Canvas cropped. Undo restores the previous framing.', 'warning', 3200);
  }
  selection = null; cropPending = false; renderToolProps();
}

function cancelCrop(){
  const selDiv = document.getElementById('sel-rect'); if(selDiv) selDiv.remove();
  selection = null; cropPending = false; renderToolProps(); addStatus('Crop canceled.', 'info', 1600);
}

// Zoom and drag functionality
function setupViewportControls() {
  // Middle mouse button or space + left mouse for dragging
  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) { // Middle button or Ctrl+Left
      const point = getViewPointFromClient(e.clientX, e.clientY);
      viewportTransform.isDragging = true;
      viewportTransform.startX = point.x;
      viewportTransform.startY = point.y;
      viewport.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (viewportTransform.isDragging) {
      const point = getViewPointFromClient(e.clientX, e.clientY);
      viewportTransform.offsetX += point.x - viewportTransform.startX;
      viewportTransform.offsetY += point.y - viewportTransform.startY;
      viewportTransform.startX = point.x;
      viewportTransform.startY = point.y;
      composite();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (viewportTransform.isDragging) {
      viewportTransform.isDragging = false;
      updateCursorFeedback(e.clientX, e.clientY);
    }
  });

  // Mouse wheel for zooming
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const point = getViewPointFromClient(e.clientX, e.clientY);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomViewport(viewportTransform.scale * zoomFactor, point.x, point.y);
    composite();
  });
}

window.addEventListener('keydown', (e)=>{
  const activeTag = document.activeElement?.tagName;
  const editingField = !!document.activeElement && (document.activeElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag));
  if((e.ctrlKey || e.metaKey) && e.key === '0'){
    e.preventDefault();
    fitView(true);
    return;
  }
  if((e.ctrlKey || e.metaKey) && !editingField){
    const key = e.key.toLowerCase();
    if(key === 'z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
    if((key === 'z' && e.shiftKey) || key === 'y'){ e.preventDefault(); redo(); return; }
    if(key === 'j'){ e.preventDefault(); duplicateActiveLayer(); return; }
  }
  if(editingField) return;
  const key = e.key.toLowerCase();
  if(key === 'v'){ selectTool('move'); }
  else if(key === 'b'){ selectTool('brush'); }
  else if(key === 'e'){ selectTool('eraser'); }
  else if(key === 't'){ selectTool('text'); }
  else if(key === 'z'){ selectTool('zoom'); }
  else if(key === 'escape' && cropPending){ cancelCrop(); }
});

// Init default - only create Background layer
createLayer('Background', { historyLabel: 'Create Background' });
setupViewportControls();
window.addEventListener('resize', () => { resizePreviewCanvas(); composite(); });
resizePreviewCanvas();
composite();
renderToolProps();
updateCanvasSizeDisplay();
applyTooltips();
updateCanvasChrome();
window.requestAnimationFrame(()=>{
  resizePreviewCanvas();
  composite();
  updateCanvasChrome();
});
