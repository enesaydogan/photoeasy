// Transform and crop workflows.
// Transform: simple scale/rotate of active layer via prompt
function doTransform(){
  if(transformState){
    tool = 'transform'; renderToolProps(); composite();
    return;
  }
  if(!activeLayer){
    addStatus(t('status.transformSelect'), 'warning');
    return;
  }
  if(activeLayer.locked){
    addStatus(t('status.transformLocked'), 'warning', 2800);
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
  if(!layer || layer.locked) return;
  // compute tight content bounds for the layer (ignore fully transparent areas)
  const bounds = getLayerContentBounds(layer);
  // create a cropped canvas of the layer content we will transform
  const bboxCanvas = document.createElement('canvas'); bboxCanvas.width = Math.max(1, bounds.w); bboxCanvas.height = Math.max(1, bounds.h);
  const bctx = bboxCanvas.getContext('2d');
  try{ bctx.drawImage(layer.canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h); }catch(e){}
  let bboxMaskCanvas = null;
  if(layer.maskCanvas){
    bboxMaskCanvas = document.createElement('canvas'); bboxMaskCanvas.width = Math.max(1, bounds.w); bboxMaskCanvas.height = Math.max(1, bounds.h);
    const bmctx = bboxMaskCanvas.getContext('2d');
    bmctx.drawImage(layer.maskCanvas, layer.offset.x + bounds.x, layer.offset.y + bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
  }
  const previewCanvas = cloneCanvas(bboxCanvas);
  if(bboxMaskCanvas){
    const pctx = previewCanvas.getContext('2d');
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(bboxMaskCanvas, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
  }

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
    bboxMaskCanvas,
    previewCanvas,
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

function cancelTransform(showToast = true){
  if(transformState?.layer && transformState.origOffset){
    transformState.layer.offset = { ...transformState.origOffset };
  }
  transformState = null;
  window.removeEventListener('keydown', transformKeyHandler);
  composite(); renderToolProps();
  if(showToast) addStatus(t('status.transformCanceled'), 'info', 1600);
}

function commitTransform(){
  if(!transformState) return;
  const ts = transformState; const l = ts.layer;
  const scaledW = ts.bounds.w * ts.scale;
  const scaledH = ts.bounds.h * ts.scale;
  const cos = Math.abs(Math.cos(ts.rotation));
  const sin = Math.abs(Math.sin(ts.rotation));
  const outW = Math.max(1, Math.ceil(scaledW * cos + scaledH * sin));
  const outH = Math.max(1, Math.ceil(scaledW * sin + scaledH * cos));
  const sizeError = validateCanvasSize(outW, outH, 1);
  if(sizeError){ addStatus(sizeError, 'warning', 3200); return; }

  const absoluteCenterX = l.offset.x + ts.bounds.x + ts.bounds.w / 2;
  const absoluteCenterY = l.offset.y + ts.bounds.y + ts.bounds.h / 2;
  const out = document.createElement('canvas'); out.width = outW; out.height = outH;
  const octx = out.getContext('2d');
  octx.translate(outW / 2, outH / 2);
  octx.rotate(ts.rotation);
  octx.scale(ts.scale, ts.scale);
  octx.drawImage(ts.bboxCanvas, -ts.bounds.w / 2, -ts.bounds.h / 2);

  let transformedMask = null;
  if(ts.bboxMaskCanvas){
    transformedMask = document.createElement('canvas'); transformedMask.width = width; transformedMask.height = height;
    const tmctx = transformedMask.getContext('2d');
    tmctx.translate(absoluteCenterX, absoluteCenterY);
    tmctx.rotate(ts.rotation);
    tmctx.scale(ts.scale, ts.scale);
    tmctx.drawImage(ts.bboxMaskCanvas, -ts.bounds.w / 2, -ts.bounds.h / 2);
  }

  l.canvas = out;
  l.ctx = out.getContext('2d');
  l.offset = { x: absoluteCenterX - outW / 2, y: absoluteCenterY - outH / 2 };
  l.maskCanvas = transformedMask;
  if(l.type === 'text'){
    l.type = null; l.text = null; l.font = null; l.color = null; l.fontSize = null; l.fontFamily = null; l.bold = false;
  }
  transformState = null; window.removeEventListener('keydown', transformKeyHandler);
  pushHistory('history.transformLayer'); renderLayersUI(); composite(); renderToolProps(); addStatus(t('status.transformApplied'), 'info', 1800);
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
      layer.canvas = newC; layer.ctx = nctx; layer.offset.x = 0; layer.offset.y = 0;
      if(layer.type === 'text'){
        layer.type = null; layer.text = null; layer.font = null; layer.color = null; layer.fontSize = null; layer.fontFamily = null; layer.bold = false;
      }
    }
    width = sw; height = sh; try{ updateViewportAspect(); }catch(e){}
    try{ updateCanvasSizeDisplay(); }catch(e){}
    resetViewportTransform();
    renderLayersUI(); composite(); pushHistory('history.cropCanvas');
    addStatus(t('status.cropApplied'), 'warning', 3200);
  }
  selection = null; cropPending = false; renderToolProps();
}

function cancelCrop(){
  const selDiv = document.getElementById('sel-rect'); if(selDiv) selDiv.remove();
  selection = null; cropPending = false; renderToolProps(); addStatus(t('status.cropCanceled'), 'info', 1600);
}
