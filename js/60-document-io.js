// Document controls, resize, import, and export.
fileInput.addEventListener('change', handleFile);
document.getElementById('export').addEventListener('click', exportPNG);
document.getElementById('import-image').addEventListener('click', ()=> fileInput.click());
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
    addStatus(error.message || 'Canvas could not be resized.', 'warning', 3200);
    return;
  }
  composite();
  pushHistory('Resize Canvas');
  addStatus('Canvas resized. Undo restores the previous size.', 'warning', 3200);
  
  closeResizeModal();
}

function handleFile(e){
  const f = e.target.files[0]; if(!f) return;
  const objectUrl = URL.createObjectURL(f);
  const img = new Image(); img.onload = ()=>{
    URL.revokeObjectURL(objectUrl);
    fileInput.value = '';
    // If user requested, resize the canvas to the imported image size first
    const resizeCheckbox = document.getElementById('import-resize');
    const resizeToImage = resizeCheckbox && resizeCheckbox.checked;
    if(resizeToImage){
      const newWidth = img.width; const newHeight = img.height;
      const validationError = validateCanvasSize(newWidth, newHeight);
      if(validationError){ addStatus(validationError, 'warning', 3400); return; }
      try{ resizeDocumentTo(newWidth, newHeight); }
      catch(error){ addStatus(error.message || 'Image dimensions are too large.', 'warning', 3400); return; }
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
  img.onerror = ()=>{
    URL.revokeObjectURL(objectUrl);
    fileInput.value = '';
    addStatus('The selected image could not be opened.', 'warning', 3200);
  };
  img.src = objectUrl;
}

function exportPNG(){
  const out = document.createElement('canvas'); out.width = width; out.height = height; const octx = out.getContext('2d');
  renderFlattenedToContext(octx);
  out.toBlob((blob)=>{
    if(!blob){ addStatus('PNG export failed.', 'warning', 2600); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.download = 'photoeasy-export.png'; a.href = url; a.click();
    window.setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
