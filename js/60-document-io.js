// Document controls, resize, import, and export.
const projectFileInput = document.getElementById('project-file-input');
fileInput.addEventListener('change', handleFile);
projectFileInput.addEventListener('change', handleProjectFile);
document.getElementById('save-project').addEventListener('click', saveProject);
document.getElementById('open-project').addEventListener('click', ()=> projectFileInput.click());
document.getElementById('export').addEventListener('click', exportPNG);
document.getElementById('import-image').addEventListener('click', ()=> fileInput.click());

// Import options popover. The checkbox inside is read by id at import time, so
// it keeps working for both the file picker and drag-and-drop.
const importOptionsBtn = document.getElementById('import-options');
const importMenu = document.getElementById('import-menu');

// The menu is position:fixed, so it has to be placed against the button each
// time it opens; anything anchored inside .actions gets clipped by its scroll.
function positionImportMenu(){
  const anchor = importOptionsBtn.closest('.menu-anchor') || importOptionsBtn;
  const rect = anchor.getBoundingClientRect();
  const menuWidth = importMenu.offsetWidth;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
  importMenu.style.top = (rect.bottom + 7) + 'px';
  importMenu.style.left = left + 'px';
}

function setImportMenuOpen(open){
  importMenu.hidden = !open;
  importOptionsBtn.setAttribute('aria-expanded', String(open));
  importOptionsBtn.classList.toggle('is-on', open);
  if(open) positionImportMenu();
}

importOptionsBtn.addEventListener('click', (event)=>{
  event.stopPropagation();
  setImportMenuOpen(importMenu.hidden);
});
importMenu.addEventListener('click', (event)=> event.stopPropagation());
document.addEventListener('click', ()=> setImportMenuOpen(false));
document.addEventListener('keydown', (event)=>{
  if(event.key === 'Escape' && !importMenu.hidden){
    setImportMenuOpen(false);
    importOptionsBtn.focus();
  }
});
// Rather than track the anchor, drop the menu when it could drift from it.
window.addEventListener('resize', ()=> setImportMenuOpen(false));
document.querySelector('.actions')?.addEventListener('scroll', ()=> setImportMenuOpen(false));
document.getElementById('resize-canvas').addEventListener('click', resizeCanvas);

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
document.getElementById('resize-modal').addEventListener('pointerdown', (e)=>{
  if(e.target === e.currentTarget) closeResizeModal();
});
document.getElementById('resize-modal').addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){ e.preventDefault(); closeResizeModal(); return; }
  if(e.key !== 'Tab') return;
  const focusable = [...e.currentTarget.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el=> !el.disabled);
  if(!focusable.length) return;
  const first = focusable[0], lastFocusable = focusable[focusable.length - 1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); lastFocusable.focus(); }
  else if(!e.shiftKey && document.activeElement === lastFocusable){ e.preventDefault(); first.focus(); }
});

let syncingResizeInputs = false;
let resizeDialogTrigger = null;

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
  resizeDialogTrigger = document.activeElement;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  document.querySelector('header')?.setAttribute('inert', '');
  document.querySelector('main')?.setAttribute('inert', '');
  window.setTimeout(()=> widthInput.focus(), 0);
}

// Close resize modal
function closeResizeModal() {
  const modal = document.getElementById('resize-modal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.querySelector('header')?.removeAttribute('inert');
  document.querySelector('main')?.removeAttribute('inert');
  try{ resizeDialogTrigger?.focus(); }catch(e){}
}

function resizeDocumentTo(newWidth, newHeight){
  const validationError = validateCanvasSize(newWidth, newHeight);
  if(validationError) throw new Error(validationError);
  const prepared = layers.map((layer)=>{
    let nextCanvas = layer.canvas;
    if(layer.role === 'background'){
      nextCanvas = document.createElement('canvas'); nextCanvas.width = newWidth; nextCanvas.height = newHeight;
      const nextCtx = nextCanvas.getContext('2d');
      nextCtx.fillStyle = '#ffffff'; nextCtx.fillRect(0, 0, newWidth, newHeight);
      nextCtx.drawImage(layer.canvas, 0, 0);
    }
    let nextMask = null;
    if(layer.maskCanvas){
      nextMask = document.createElement('canvas'); nextMask.width = newWidth; nextMask.height = newHeight;
      const maskCtx = nextMask.getContext('2d');
      maskCtx.fillStyle = '#ffffff'; maskCtx.fillRect(0, 0, newWidth, newHeight);
      maskCtx.clearRect(0, 0, Math.min(newWidth, layer.maskCanvas.width), Math.min(newHeight, layer.maskCanvas.height));
      maskCtx.drawImage(layer.maskCanvas, 0, 0);
    }
    return { layer, nextCanvas, nextMask };
  });
  width = newWidth; height = newHeight;
  prepared.forEach(({layer, nextCanvas, nextMask})=>{
    layer.canvas = nextCanvas;
    layer.ctx = nextCanvas.getContext('2d');
    if(layer.maskCanvas) layer.maskCanvas = nextMask;
  });
  updateViewportAspect();
  updateCanvasSizeDisplay();
}

// Confirm resize and apply changes
function confirmResize() {
  const widthInput = document.getElementById('new-width');
  const heightInput = document.getElementById('new-height');
  
  const newWidth = parseInt(widthInput.value);
  const newHeight = parseInt(heightInput.value);
  
  const validationError = validateCanvasSize(newWidth, newHeight);
  if (validationError) {
    addStatus(validationError, 'warning', 3200);
    return;
  }
  try{
    resizeDocumentTo(newWidth, newHeight);
  }catch(error){
    addStatus(error.message || t('status.resizeFailed'), 'warning', 3200);
    return;
  }
  composite();
  pushHistory('history.resizeCanvas');
  addStatus(t('status.resizeApplied'), 'warning', 3200);
  
  closeResizeModal();
}

async function decodeImageFile(file){
  const objectUrl = URL.createObjectURL(file);
  try{
    return await new Promise((resolve, reject)=>{
      const image = new Image();
      image.onload = ()=> resolve(image);
      image.onerror = ()=> reject(new Error(t('status.imageOpenFailed')));
      image.src = objectUrl;
    });
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}

function getImportedLayerName(file){
  const baseName = String(file?.name || '').replace(/\.[^.]+$/, '').trim();
  return baseName || t('layer.imported');
}

async function importImageFile(file, options = {}){
  if(!file || !String(file.type || '').startsWith('image/')) throw new Error(t('status.dropUnsupported'));
  const image = await decodeImageFile(file);
  const resizeToImage = !!options.resizeToImage;
  if(resizeToImage){
    const validationError = validateCanvasSize(image.width, image.height);
    if(validationError) throw new Error(validationError);
    resizeDocumentTo(image.width, image.height);
    resetViewportTransform();
  }

  createLayer(getImportedLayerName(file), { skipHistory: true });
  const layer = activeLayer;
  if(resizeToImage){
    layer.ctx.drawImage(image, 0, 0);
  }else{
    const scale = Math.min(width / image.width, height / image.height, 1);
    const drawWidth = Math.max(1, Math.round(image.width * scale));
    const drawHeight = Math.max(1, Math.round(image.height * scale));
    const drawX = Math.round((width - drawWidth) / 2);
    const drawY = Math.round((height - drawHeight) / 2);
    layer.ctx.drawImage(image, 0, 0, image.width, image.height, drawX, drawY, drawWidth, drawHeight);
  }
  composite();
  pushHistory('history.importImage');
  addStatus(t('status.imageImported'), 'info', 1800);
}

async function handleFile(event){
  const files = [...(event.target.files || [])];
  fileInput.value = '';
  if(!files.length) return;
  const resizeToImage = !!document.getElementById('import-resize')?.checked;
  for(let index = 0; index < files.length; index++){
    try{ await importImageFile(files[index], { resizeToImage: resizeToImage && index === 0 }); }
    catch(error){ addStatus(error.message || t('status.imageOpenFailed'), 'warning', 3200); }
  }
}

function buildProjectData(){
  return {
    type: 'photoeasy-project',
    version: 1,
    width,
    height,
    activeIndex: layers.indexOf(activeLayer),
    layers: layers.map((layer)=>({
      name: layer.name,
      autoName: layer.autoName || null,
      dataURL: layer.canvas.toDataURL('image/png'),
      mask: layer.maskCanvas ? layer.maskCanvas.toDataURL('image/png') : null,
      offset: { x: layer.offset.x, y: layer.offset.y },
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend || 'source-over',
      locked: !!layer.locked,
      role: layer.role || null,
      type: layer.type || null,
      text: layer.text || null,
      font: layer.font || null,
      color: layer.color || null,
      fontSize: layer.fontSize || null,
      fontFamily: layer.fontFamily || null,
      bold: !!layer.bold
    }))
  };
}

function saveProject(){
  try{
    const blob = new Blob([JSON.stringify(buildProjectData())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.download = 'photoeasy-project.photoeasy';
    anchor.href = url;
    anchor.click();
    window.setTimeout(()=> URL.revokeObjectURL(url), 1000);
    addStatus(t('status.projectSaved'), 'info', 1800);
  }catch(error){
    addStatus(t('status.projectSaveFailed'), 'warning', 3200);
  }
}

async function deserializeProjectLayer(item){
  if(!item || typeof item.dataURL !== 'string' || !item.dataURL.startsWith('data:image/')) throw new Error(t('status.projectInvalid'));
  const image = await loadImageFromDataURL(item.dataURL);
  if(image.width > MAX_CANVAS_DIMENSION || image.height > MAX_CANVAS_DIMENSION || image.width * image.height > MAX_CANVAS_PIXELS) throw new Error(t('status.imageTooLarge'));
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  let maskCanvas = null;
  if(item.mask){
    const maskImage = await loadImageFromDataURL(item.mask);
    if(maskImage.width > MAX_CANVAS_DIMENSION || maskImage.height > MAX_CANVAS_DIMENSION || maskImage.width * maskImage.height > MAX_CANVAS_PIXELS) throw new Error(t('status.imageTooLarge'));
    maskCanvas = document.createElement('canvas'); maskCanvas.width = maskImage.width; maskCanvas.height = maskImage.height;
    maskCanvas.getContext('2d').drawImage(maskImage, 0, 0);
  }
  const allowedBlends = ['source-over','multiply','screen','overlay','darken','lighten'];
  const parsedOpacity = Number(item.opacity ?? 1);
  const parsedOffsetX = Number(item.offset?.x);
  const parsedOffsetY = Number(item.offset?.y);
  return {
    canvas,
    ctx,
    name: String(item.name || t('layer.imported')).slice(0, 160),
    autoName: item.autoName && typeof item.autoName.key === 'string' ? { key:item.autoName.key, params:{ ...(item.autoName.params || {}) } } : null,
    offset: { x: Number.isFinite(parsedOffsetX) ? parsedOffsetX : 0, y: Number.isFinite(parsedOffsetY) ? parsedOffsetY : 0 },
    visible: item.visible !== false,
    opacity: Number.isFinite(parsedOpacity) ? Math.max(0, Math.min(1, parsedOpacity)) : 1,
    blend: allowedBlends.includes(item.blend) ? item.blend : 'source-over',
    maskCanvas,
    locked: !!item.locked,
    role: item.role === 'background' ? 'background' : null,
    type: item.type === 'text' ? 'text' : null,
    text: typeof item.text === 'string' ? item.text : null,
    font: typeof item.font === 'string' ? item.font : null,
    color: typeof item.color === 'string' ? item.color : null,
    fontSize: Number.isFinite(Number(item.fontSize)) ? Number(item.fontSize) : null,
    fontFamily: typeof item.fontFamily === 'string' ? item.fontFamily : null,
    bold: !!item.bold
  };
}

async function openProjectFile(file){
  if(!file || file.size > 250 * 1024 * 1024) throw new Error(t('status.projectInvalid'));
  const project = JSON.parse(await file.text());
  if(project?.type !== 'photoeasy-project' || project.version !== 1 || !Array.isArray(project.layers) || project.layers.length > 100) throw new Error(t('status.projectInvalid'));
  const projectWidth = Number(project.width), projectHeight = Number(project.height);
  const validationError = validateCanvasSize(projectWidth, projectHeight, Math.max(1, project.layers.length));
  if(validationError) throw new Error(validationError);
  const preparedLayers = await Promise.all(project.layers.map(deserializeProjectLayer));
  const decodedPixels = preparedLayers.reduce((sum, layer)=> sum + layer.canvas.width * layer.canvas.height + (layer.maskCanvas ? layer.maskCanvas.width * layer.maskCanvas.height : 0), 0);
  if(decodedPixels > MAX_CANVAS_PIXELS * 4) throw new Error(t('status.memoryLimit'));
  if(preparedLayers.some((layer)=> layer.maskCanvas && (layer.maskCanvas.width !== projectWidth || layer.maskCanvas.height !== projectHeight))) throw new Error(t('status.projectInvalid'));

  historyRestoreToken += 1;
  if(currentTextEditor){ try{ currentTextEditor.cancel(); }catch(error){ currentTextEditor = null; } }
  transformState = null; selection = null; cropPending = false; editMaskMode = false;
  document.getElementById('sel-rect')?.remove();
  width = projectWidth; height = projectHeight; layers = preparedLayers;
  localizeGeneratedLayerNames();
  activeLayer = layers[Math.max(0, Math.min(layers.length - 1, Number(project.activeIndex) || 0))] || null;
  history = []; historyIndex = -1; historyRestoring = false;
  resetViewportTransform(); updateViewportAspect(); updateCanvasSizeDisplay();
  renderLayersUI(); composite(); pushHistory('history.openProject'); renderToolProps();
  addStatus(t('status.projectOpened'), 'info', 2000);
}

async function handleProjectFile(event){
  const file = event.target.files?.[0];
  projectFileInput.value = '';
  if(!file) return;
  try{ await openProjectFile(file); }
  catch(error){ addStatus(error instanceof SyntaxError ? t('status.projectInvalid') : (error.message || t('status.projectOpenFailed')), 'warning', 3600); }
}

let imageDragDepth = 0;
viewport.addEventListener('dragenter', (event)=>{
  if(!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault(); imageDragDepth += 1; viewport.classList.add('is-file-drag');
});
viewport.addEventListener('dragover', (event)=>{
  if(!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
});
viewport.addEventListener('dragleave', (event)=>{
  imageDragDepth = Math.max(0, imageDragDepth - 1);
  if(imageDragDepth === 0) viewport.classList.remove('is-file-drag');
});
window.addEventListener('dragend', ()=>{
  imageDragDepth = 0;
  viewport.classList.remove('is-file-drag');
});
viewport.addEventListener('drop', async (event)=>{
  event.preventDefault(); imageDragDepth = 0; viewport.classList.remove('is-file-drag');
  const files = [...(event.dataTransfer?.files || [])].filter((file)=> String(file.type || '').startsWith('image/'));
  if(!files.length){ addStatus(t('status.dropUnsupported'), 'warning', 2600); return; }
  const resizeToImage = !!document.getElementById('import-resize')?.checked;
  for(let index = 0; index < files.length; index++){
    try{ await importImageFile(files[index], { resizeToImage: resizeToImage && index === 0 }); }
    catch(error){ addStatus(error.message || t('status.imageOpenFailed'), 'warning', 3200); }
  }
});

function exportPNG(){
  const out = document.createElement('canvas'); out.width = width; out.height = height; const octx = out.getContext('2d');
  renderFlattenedToContext(octx);
  out.toBlob((blob)=>{
    if(!blob){ addStatus(t('status.exportFailed'), 'warning', 2600); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.download = 'photoeasy-export.png'; a.href = url; a.click();
    window.setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
