// Text editing, drawing, pointer interactions, and tool selection.
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
  el.textContent = width + ' \u00D7 ' + height + ' px';
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
  // The ring scales with zoom, so it stays inline; the colors come from the
  // theme tokens so it tracks light/dark without a repaint hook.
  editor.shell.style.boxShadow = '0 0 0 ' + Math.max(1, Math.round(uiScale)) + 'px var(--line), var(--shadow)';

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
  meta.textContent = t('text.editorMeta');

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
      addStatus(t('status.textCanceled'), 'info', 1600);
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
          pushHistory('history.deleteText');
          addStatus(t('status.emptyTextRemoved'), 'warning', 2600);
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
      if(!layers.includes(targetLayer)){
        renderToolProps();
        composite();
        addStatus(t('status.textDiscarded'), 'warning', 2600);
        return;
      }
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
        name: t('layer.text'),
        autoName: { key: 'layer.text' },
        offset: { ...editorState.anchor },
        visible: true,
        opacity: 1,
        blend: 'source-over',
        maskCanvas: null,
        locked: false,
        role: null,
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
    pushHistory(targetLayer ? 'history.editText' : 'history.addText');
    addStatus(t(targetLayer ? 'status.textUpdated' : 'status.textCreated'), 'info', 1800);
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

view.addEventListener('pointerdown', (e)=>{
  const panGesture = e.button === 1 || (e.button === 0 && spacePressed);
  if(panGesture) return;
  if(e.pointerType === 'mouse' && e.button !== 0) return;
  activePointerId = e.pointerId;
  try{ view.setPointerCapture(e.pointerId); }catch(err){}
  e.preventDefault();
  e.stopPropagation();
  
  // allow some tools even when there's no active layer (text, crop)
  if(!activeLayer && !['text','crop','zoom','move'].includes(tool)) return;
  
  // Prevent editing of locked layers for drawing tools
  if(activeLayer && activeLayer.locked && ['brush', 'eraser', 'fill', 'transform', 'select', 'magic'].includes(tool)) {
    addStatus(t('status.lockedEdit'), 'warning', 2800);
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
      if(d < handleRadius){
        ts.dragging = true; ts.handle = 'scale'; ts.handleCorner = ci; ts.startScale = ts.scale; ts.startDist = Math.hypot(pos.x - cx, pos.y - cy); handled = true; break;
      }
    }
    const dRot = Math.hypot(pos.x - rotHandle.x, pos.y - rotHandle.y);
    if(!handled && dRot < handleRadius){ ts.dragging = true; ts.handle = 'rotate'; ts.startAngle = Math.atan2(pos.y - cy, pos.x - cx); ts.startRotation = ts.rotation; handled = true; }
    if(!handled){
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
    const pos = getPos(e);
    const clickedLayer = findLayerAt(pos);
    if(clickedLayer){
      const layerIndex = layers.indexOf(clickedLayer);
      if(layerIndex >= 0 && clickedLayer !== activeLayer) setActiveLayer(layerIndex);
      if(clickedLayer.locked){
        addStatus(t('status.lockedMove'), 'warning', 2800);
        updateCursorFeedback(e.clientX, e.clientY);
        return;
      }
      if(e.altKey){
        const duplicatedLayer = duplicateLayer(clickedLayer, { skipHistory: true, showToast: false, activate: true });
        if(!duplicatedLayer) return;
        moveInteraction = { duplicated: true, moved: false, sourceName: duplicatedLayer.name };
      } else {
        moveInteraction = { duplicated: false, moved: false, sourceName: clickedLayer.name };
      }
    } else {
      if(!activeLayer) return;
      if(activeLayer.locked){
        addStatus(t('status.lockedMove'), 'warning', 2800);
        updateCursorFeedback(e.clientX, e.clientY);
        return;
      }
      moveInteraction = { duplicated: false, moved: false, sourceName: activeLayer.name };
    }
    drawing = true; last = pos;
    return;
  }

  if(tool === 'zoom'){
    const point = getViewPointFromClient(e.clientX, e.clientY);
    const zoomFactor = e.altKey ? 0.8 : 1.25;
    zoomViewport(viewportTransform.scale * zoomFactor, point.x, point.y);
    composite();
    addStatus(t(e.altKey ? 'status.zoomOut' : 'status.zoomIn'), 'info', 1200);
    return;
  }

  if(tool==='select'){
    // start selection rect
    const startCanvas = getPos(e);
    if(!isPointInsideDocument(startCanvas)){
      addStatus(t('status.selectionInside'), 'warning', 2200);
      return;
    }
    const vpRect = viewport.getBoundingClientRect();
    const startVP = { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top };
    selection = { startCanvas, startVP, x:0, y:0, w:0, h:0 };
    const selDiv = document.createElement('div'); selDiv.className='selection-rect'; selDiv.id = 'sel-rect';
    // position initial zero-size rect at start point
    selDiv.style.left = startVP.x + 'px'; selDiv.style.top = startVP.y + 'px'; selDiv.style.width = '0px'; selDiv.style.height = '0px';
    viewport.appendChild(selDiv);
    drawing = true; return;
  }

  if(tool === 'crop'){
    // start crop rect (re-uses selection overlay)
    const startCanvas = getPos(e);
    if(!isPointInsideDocument(startCanvas)){
      addStatus(t('status.cropInside'), 'warning', 2200);
      return;
    }
    const vpRect = viewport.getBoundingClientRect();
    const startVP = { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top };
    selection = { startCanvas, startVP, x:0, y:0, w:0, h:0 };
    const selDiv = document.createElement('div'); selDiv.className='selection-rect'; selDiv.id = 'sel-rect';
    selDiv.style.left = startVP.x + 'px'; selDiv.style.top = startVP.y + 'px'; selDiv.style.width = '0px'; selDiv.style.height = '0px';
    viewport.appendChild(selDiv);
    drawing = true; return;
  }

  if(tool === 'magic'){
    const pos = getPos(e);
    if(!activeLayer) { addStatus(t('status.selectMagicLayer'), 'warning'); return; }
    if(!isPointInsideDocument(pos)){ addStatus(t('status.magicInside'), 'warning'); return; }
    const tmpc = document.createElement('canvas'); tmpc.width = width; tmpc.height = height; const tctx2 = tmpc.getContext('2d', { willReadFrequently: true });
    renderFlattenedToContext(tctx2);
    const compImg = tctx2.getImageData(0,0,width,height);
    const mask = floodFillMask(compImg, Math.round(pos.x), Math.round(pos.y));
    // create mask canvas
    const mc = document.createElement('canvas'); mc.width = width; mc.height = height; const mctx = mc.getContext('2d'); const md = mctx.createImageData(width, height);
    for(let i=0;i<mask.length;i++){ const a = mask[i]?255:0; const idx = i*4; md.data[idx]=255; md.data[idx+1]=255; md.data[idx+2]=255; md.data[idx+3]=a; }
    mctx.putImageData(md,0,0);
    activeLayer.maskCanvas = mc;
    pushHistory('history.magicMask'); renderLayersUI(); composite();
    addStatus(t('status.magicCreated'), 'info', 1800);
    return;
  }

  if(tool === 'text'){
    const pos = getPos(e);
    if(!isPointInsideDocument(pos)){
      addStatus(t('status.textInside'), 'warning', 2200);
      return;
    }
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
      if(!isPointInsideDocument(pos)) return;
      const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height; const tctx = tmp.getContext('2d', { willReadFrequently: true });
      renderFlattenedToContext(tctx);
      const compImg = tctx.getImageData(0,0,width,height);
      const mask = floodFillMask(compImg, Math.round(pos.x), Math.round(pos.y));
      applyMaskToLayer(mask, width, height, activeLayer, color);
      pushHistory('history.compositeFill'); renderLayersUI(); composite();
    } else {
      // compute mask on the active layer only
      const lx = Math.round(pos.x - activeLayer.offset.x); const ly = Math.round(pos.y - activeLayer.offset.y);
      if(lx < 0 || ly < 0 || lx >= activeLayer.canvas.width || ly >= activeLayer.canvas.height) return;
      const img = activeLayer.ctx.getImageData(0,0,activeLayer.canvas.width, activeLayer.canvas.height);
      const mask = floodFillMask(img, lx, ly);
      applyMaskToLayer(mask, activeLayer.canvas.width, activeLayer.canvas.height, activeLayer, color);
      pushHistory('history.fillLayer'); renderLayersUI(); composite();
    }
    addStatus(t('status.fillApplied'), 'info', 1600);
    return;
  }

  drawing = true; last = getPos(e);
  
  // Determine if we should edit the mask or the main layer
  const isEditingMask = editMaskMode && activeLayer.maskCanvas && (tool === 'brush' || tool === 'eraser');
  const ctx = isEditingMask ? activeLayer.maskCanvas.getContext('2d') : activeLayer.ctx;
  drawingSession = { ctx, layer: activeLayer, isEditingMask, changed: false };
  
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
  if(tool === 'brush' || tool === 'eraser'){
    ctx.beginPath();
    ctx.arc(adjX, adjY, Math.max(0.5, size / 2), 0, Math.PI * 2);
    if(tool === 'eraser') ctx.fill();
    else { ctx.fillStyle = isEditingMask ? '#ffffff' : color; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(adjX, adjY);
    drawingSession.changed = true;
    composite();
  }
});

view.addEventListener('pointermove', (e)=>{
  updateCursorFeedback(e.clientX, e.clientY);
  if(activePointerId != null && e.pointerId !== activePointerId) return;
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
  
  if(e.pointerType === 'mouse' && (e.buttons & 1) !== 1) return;
  
  // allow selection/crop to update even when no active layer exists
  if(tool === 'select' || tool === 'crop'){
    if(!selection) return;
    // update CSS overlay using viewport-space coordinates (client pixels)
    const vpRect = viewport.getBoundingClientRect();
    const boundedPos = clampPointToDocument(pos);
    const boundedPage = canvasToPagePosition(boundedPos.x, boundedPos.y);
    const curVP = { x: boundedPage.left - vpRect.left, y: boundedPage.top - vpRect.top };
    const left = Math.min(selection.startVP.x, curVP.x);
    const top = Math.min(selection.startVP.y, curVP.y);
    const wcss = Math.abs(curVP.x - selection.startVP.x);
    const hcss = Math.abs(curVP.y - selection.startVP.y);
    const selDiv = document.getElementById('sel-rect');
    if(selDiv){ selDiv.style.left = left + 'px'; selDiv.style.top = top + 'px'; selDiv.style.width = wcss + 'px'; selDiv.style.height = hcss + 'px'; }
    // also update logical canvas-space selection values for crop/selection logic
    const s = selection.startCanvas || selection.start;
    selection.x = Math.min(s.x, boundedPos.x);
    selection.y = Math.min(s.y, boundedPos.y);
    selection.w = Math.abs(boundedPos.x - s.x);
    selection.h = Math.abs(boundedPos.y - s.y);
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
    if(moveInteraction && (dx !== 0 || dy !== 0)) moveInteraction.moved = true;
    last = pos; composite(); return;
  }
  
  // Adjust position for mask editing (masks are not offset like layers)
  const adjX = isEditingMask ? pos.x : pos.x - activeLayer.offset.x;
  const adjY = isEditingMask ? pos.y : pos.y - activeLayer.offset.y;
  
  ctx.lineTo(adjX, adjY);
  ctx.stroke(); composite();
  if(drawingSession) drawingSession.changed = true;
  last = pos;
});

view.addEventListener('pointerleave', ()=> updateCursorFeedback());

function finishPointerInteraction(e){
  if(activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;
  activePointerId = null;
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
        const newLayer = {canvas:c, ctx:cctx, name:t('layer.selection'), autoName:{ key:'layer.selection' }, offset:{x: Math.round(s.x), y: Math.round(s.y)}, visible:true, opacity:1, blend:'source-over', maskCanvas:null, locked:false, role:null};
        layers.push(newLayer);
        activeLayer = newLayer;
        renderLayersUI(); composite();
        pushHistory('history.liftSelection');
        addStatus(t('status.selectionLifted'), 'info', 2600);
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
    if(drawingSession?.ctx) drawingSession.ctx.restore();
  }catch(e){}
  if(tool === 'move'){
    if(moveInteraction){
      if(moveInteraction.duplicated && moveInteraction.moved){
        pushHistory('history.duplicateMove');
        addStatus(t('status.layerDuplicatedMoved', { name: moveInteraction.sourceName }), 'info', 2200);
      } else if(moveInteraction.duplicated){
        pushHistory('history.duplicateLayer');
        addStatus(t('status.layerCreated', { name: moveInteraction.sourceName }), 'info', 2400);
      } else if(moveInteraction.moved){
        pushHistory('history.moveLayer');
      }
    }
    moveInteraction = null;
    drawingSession = null;
    return;
  }
  if(drawingSession?.changed) pushHistory(tool === 'brush' ? 'history.brushStroke' : 'history.eraseStroke');
  drawingSession = null;
}
view.addEventListener('pointerup', finishPointerInteraction);
view.addEventListener('pointercancel', finishPointerInteraction);
