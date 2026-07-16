// Layer lifecycle, layer UI, and canvas compositing.

// Handles and marching ants are painted onto the user's artwork, so they are
// deliberately theme-independent: the theme says nothing about the photo
// underneath. Pairing a light fill with a dark stroke keeps them legible on
// any image. Chrome that sits on the themed backdrop uses themeInk() instead.
const OVERLAY_FILL = 'rgba(255,255,255,0.95)';
const OVERLAY_STROKE = 'rgba(0,0,0,0.7)';

function createLayer(name=t('layer.number', { n: layers.length + 1 }), options = {}){
  const { historyLabel = 'history.createLayer', skipHistory = false, role = null, autoName = null } = options;
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
  const isBackground = role === 'background';
  if(isBackground){
    ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height); ctx.restore();
  }
  const layer = {canvas:c,ctx,name,autoName,offset:{x:0,y:0},visible:true,opacity:1, blend:'source-over', maskCanvas:null, locked: isBackground, role};
  layers.push(layer);
  activeLayer = layer;
  editMaskMode = false;
  if(!skipHistory) pushHistory(historyLabel);
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
  const sanitizedBase = (baseName || t('layer.number', { n: layers.length + 1 })).trim() || t('layer.number', { n: layers.length + 1 });
  const existingNames = new Set(layers.map((layer)=> layer.name));
  let candidate = t('layer.copy', { name: sanitizedBase });
  let copyIndex = 2;
  while(existingNames.has(candidate)){
    candidate = t('layer.copy', { name: sanitizedBase }) + ' ' + copyIndex;
    copyIndex += 1;
  }
  return candidate;
}

function duplicateLayer(sourceLayer = activeLayer, options = {}){
  const { activate = true, skipHistory = false, historyLabel = 'history.duplicateLayer', showToast = true } = options;
  if(!sourceLayer){
    addStatus(t('status.noDuplicateLayer'), 'warning');
    return null;
  }
  const sourceIndex = layers.indexOf(sourceLayer);
  if(sourceIndex < 0) return null;
  const clonedCanvas = cloneCanvas(sourceLayer.canvas);
  const duplicateLayer = {
    canvas: clonedCanvas,
    ctx: clonedCanvas.getContext('2d'),
    name: getDuplicateLayerName(sourceLayer.name),
    offset: { ...sourceLayer.offset },
    visible: sourceLayer.visible,
    opacity: sourceLayer.opacity,
    blend: sourceLayer.blend || 'source-over',
    maskCanvas: sourceLayer.maskCanvas ? cloneCanvas(sourceLayer.maskCanvas) : null,
    locked: !!sourceLayer.locked,
    role: null,
    autoName: null,
    type: sourceLayer.type || null,
    text: sourceLayer.text || null,
    font: sourceLayer.font || null,
    color: sourceLayer.color || null,
    fontSize: sourceLayer.fontSize || null,
    fontFamily: sourceLayer.fontFamily || null,
    bold: !!sourceLayer.bold
  };
  layers.splice(sourceIndex + 1, 0, duplicateLayer);
  if(activate) activeLayer = duplicateLayer;
  renderLayersUI();
  composite();
  if(!skipHistory) pushHistory(historyLabel);
  if(showToast) addStatus(t('status.layerCreated', { name: duplicateLayer.name }), 'info', 2400);
  return duplicateLayer;
}

function duplicateActiveLayer(){
  return duplicateLayer(activeLayer);
}

// ensure there's an initial history snapshot representing the empty document
pushHistory('history.blankDocument');
updateHistoryButtons();

function setActiveLayer(idx){
  const targetLayer = layers[idx];
  if(currentTextEditor && currentTextEditor.layer && currentTextEditor.layer !== targetLayer){
    try{ currentTextEditor.commit(); }catch(e){ currentTextEditor = null; }
  }
  activeLayer = layers.includes(targetLayer) ? targetLayer : (layers[Math.min(idx, layers.length - 1)] || null);
  editMaskMode = false;
  renderLayersUI();
  updateCanvasChrome();
}

function deleteActiveLayer(){
  if(!activeLayer){
    addStatus(t('status.noRemoveLayer'), 'warning');
    return;
  }
  const idx = layers.indexOf(activeLayer);
  if(idx>=0){
    if(currentTextEditor){
      try{ currentTextEditor.cancel(); }catch(e){ currentTextEditor = null; }
    }
    if(renamingLayerIndex === idx){
      renamingLayerIndex = null;
      renamingLayerDraft = '';
    }
    const deletedName = activeLayer.name || t('layer.number', { n: idx + 1 });
    layers.splice(idx,1);
    activeLayer = layers[layers.length-1] || null;
    renderLayersUI(); composite();
    pushHistory('history.deleteLayer');
    addStatus(t('status.layerDeleted', { name: deletedName }), 'warning', 3200);
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
      nameInput.setAttribute('aria-label', t('layers.renameAria', { name: layer.name }));
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
    opacity.setAttribute('aria-label', t('layers.opacityAria', { name: layer.name }));
    const opVal = document.createElement('div'); opVal.className = 'layer-opacity-value'; opVal.textContent = Math.round(layer.opacity*100) + '%';
    opacity.oninput = (e)=>{ layer.opacity = Number(e.target.value); opVal.textContent = Math.round(layer.opacity*100) + '%'; composite(); };
    opacity.onchange = ()=> pushHistory('history.adjustOpacity');
    // prevent clicks on controls from bubbling and re-rendering the layer row (which closes selects)
    opacity.addEventListener('pointerdown', (ev)=>{ ev.stopPropagation(); });
    opacity.addEventListener('mousedown', (ev)=>{ ev.stopPropagation(); });

    // Card layout is three flat rows: identity, settings, actions. Everything
    // that acts on the layer lives in the one action bar rather than being
    // scattered through nested wrappers.
    const head = document.createElement('div'); head.className = 'layer-head';
    head.appendChild(thumb);
    const headText = document.createElement('div'); headText.className = 'layer-head-text';
    headText.appendChild(nameNode);
    if(layer === activeLayer){
      const activeBadge = document.createElement('span');
      activeBadge.className = 'layer-badge';
      activeBadge.textContent = t('layers.active');
      headText.appendChild(activeBadge);
    }
    head.appendChild(headText);

    const opRow = document.createElement('div'); opRow.className = 'layer-op-row';
    // blend mode selector — labelled by aria only; the chosen mode is its own label
    const blendSel = document.createElement('select'); blendSel.className = 'layer-blend';
    ['source-over','multiply','screen','overlay','darken','lighten'].forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=t('blend.' + b); if((layer.blend||'source-over')===b) o.selected=true; blendSel.appendChild(o); });
    blendSel.setAttribute('aria-label', t('layers.blendAria', { name: layer.name }));
    blendSel.onchange = (e)=>{ layer.blend = e.target.value; composite(); pushHistory('history.blendMode'); };
    // prevent the select from bubbling (keeps the dropdown open while interacting)
    blendSel.addEventListener('pointerdown', (ev)=>{ ev.stopPropagation(); });
    blendSel.addEventListener('mousedown', (ev)=>{ ev.stopPropagation(); });
    blendSel.addEventListener('click', (ev)=>{ ev.stopPropagation(); });
    opRow.appendChild(opacity);
    opRow.appendChild(opVal);
    opRow.appendChild(blendSel);

    const actions = document.createElement('div'); actions.className = 'layer-actions';

    const vis = iconButton(layer.visible ? 'eye' : 'eyeOff', {
      className: layer.visible ? '' : 'is-off',
      title: layer.visible ? t('layers.hideTitle') : t('layers.showTitle')
    });
    vis.onclick = (ev)=>{ ev.stopPropagation(); layer.visible = !layer.visible; composite(); renderLayersUI(); pushHistory(layer.visible ? 'history.showLayer' : 'history.hideLayer'); };

    const lockBtn = iconButton(layer.locked ? 'lock' : 'unlock', {
      className: layer.locked ? 'is-on' : '',
      title: layer.locked ? t('layers.unlockTitle') : t('layers.lockTitle')
    });
    lockBtn.onclick = (ev) => {
      ev.stopPropagation();
      layer.locked = !layer.locked;
      renderLayersUI();
      pushHistory(layer.locked ? 'history.lockLayer' : 'history.unlockLayer');
    };

    const maskBtn = iconButton('mask', {
      className: layer.maskCanvas ? 'is-on' : '',
      title: layer.maskCanvas ? t('layers.removeMask') : t('layers.addMask')
    });
    maskBtn.onclick = (ev)=>{ ev.stopPropagation(); if(layer.maskCanvas){ layer.maskCanvas = null; if(layer === activeLayer) editMaskMode = false; addStatus(t('status.maskRemoved'), 'warning', 3200); pushHistory('history.removeMask'); } else { const mc=document.createElement('canvas'); mc.width = width; mc.height = height; const mctx = mc.getContext('2d'); mctx.fillStyle = '#fff'; mctx.fillRect(0,0,mc.width,mc.height); layer.maskCanvas = mc; pushHistory('history.addMask'); addStatus(t('status.maskAdded', { name: layer.name }), 'info', 1800); } renderLayersUI(); composite(); renderToolProps(); };

    const raise = iconButton('up', { title: t('layers.upTitle'), ariaLabel: t('layers.upAria', { name: layer.name }) });
    raise.disabled = i >= layers.length - 1;
    raise.onclick = (ev)=>{ ev.stopPropagation(); moveLayerUp(i); };

    const lower = iconButton('down', { title: t('layers.downTitle'), ariaLabel: t('layers.downAria', { name: layer.name }) });
    lower.disabled = i <= 0;
    lower.onclick = (ev)=>{ ev.stopPropagation(); moveLayerDown(i); };

    const dragHandle = iconButton('grip', {
      className: 'layer-grip',
      title: t('layers.dragTitle'),
      ariaLabel: t('layers.dragAria', { name: layer.name })
    });
    dragHandle.onclick = (ev)=> ev.stopPropagation();

    const actionSpacer = document.createElement('div'); actionSpacer.className = 'layer-actions-spacer';
    [vis, lockBtn, maskBtn, actionSpacer, raise, lower, dragHandle].forEach((node)=> actions.appendChild(node));

    row.appendChild(head);
    row.appendChild(opRow);
    row.appendChild(actions);

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
      // The visual list is the reverse of the model stack.
      reorderLayer(layerDragIndex, i, !placeAfter);
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

let thumbnailRefreshPending = false;
let compositeScratchCanvas = null;
let maskScratchCanvas = null;

function scheduleLayerThumbnailUpdate(){
  if(thumbnailRefreshPending) return;
  thumbnailRefreshPending = true;
  window.requestAnimationFrame(()=>{
    thumbnailRefreshPending = false;
    updateLayerThumbnails();
  });
}

function prepareScratchCanvas(canvas, nextWidth, nextHeight){
  const target = canvas || document.createElement('canvas');
  if(target.width !== nextWidth) target.width = nextWidth;
  if(target.height !== nextHeight) target.height = nextHeight;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, nextWidth, nextHeight);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return {canvas:target, ctx};
}

function moveLayerUp(indexFromTop){
  const idx = indexFromTop;
  if(idx >= layers.length-1) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx+1,0,a);
  activeLayer = a; renderLayersUI(); composite();
  pushHistory('history.moveLayerUp');
}

function moveLayerDown(indexFromTop){
  const idx = indexFromTop;
  if(idx <= 0) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx-1,0,a);
  activeLayer = a; renderLayersUI(); composite();
  pushHistory('history.moveLayerDown');
}

function localizeGeneratedLayerNames(){
  layers.forEach((layer)=>{
    if(!layer.autoName) return;
    layer.name = t(layer.autoName.key, layer.autoName.params || {});
  });
}

function renderFlattenedToContext(destCtx, options = {}){
  const { applyViewportTransform = false, skipLayer = null } = options;
  const accumulator = prepareScratchCanvas(compositeScratchCanvas, width, height);
  compositeScratchCanvas = accumulator.canvas;
  const accCanvas = accumulator.canvas;
  const accCtx = accumulator.ctx;

  for(const layer of layers){
    if(!layer.visible) continue;
    if(skipLayer && layer === skipLayer) continue;
    let source = layer.canvas;
    let drawX = layer.offset.x;
    let drawY = layer.offset.y;
    if(layer.maskCanvas){
      const maskedResult = prepareScratchCanvas(maskScratchCanvas, width, height);
      maskScratchCanvas = maskedResult.canvas;
      const masked = maskedResult.canvas;
      const maskedCtx = maskedResult.ctx;
      maskedCtx.drawImage(layer.canvas, layer.offset.x, layer.offset.y);
      maskedCtx.globalCompositeOperation = 'destination-in';
      maskedCtx.drawImage(layer.maskCanvas, 0, 0);
      maskedCtx.globalCompositeOperation = 'source-over';
      source = masked; drawX = 0; drawY = 0;
    }
    accCtx.globalCompositeOperation = layer.blend || 'source-over';
    accCtx.globalAlpha = layer.opacity === undefined ? 1 : layer.opacity;
    accCtx.drawImage(source, drawX, drawY);
    accCtx.globalAlpha = 1;
    accCtx.globalCompositeOperation = 'source-over';
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
    viewCtx.globalCompositeOperation = l.blend || 'source-over';
    viewCtx.drawImage(ts.previewCanvas || ts.bboxCanvas, -ts.bounds.w/2, -ts.bounds.h/2);
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
    viewCtx.save();
    const boxPath = ()=>{
      viewCtx.beginPath();
      viewCtx.moveTo(corners[0].x, corners[0].y);
      for(let i=1;i<corners.length;i++) viewCtx.lineTo(corners[i].x, corners[i].y);
      viewCtx.closePath();
    };
    // Dark base under a light dash: legible on any artwork, which the theme
    // says nothing about.
    viewCtx.lineWidth = 1.5;
    viewCtx.strokeStyle = OVERLAY_STROKE; viewCtx.setLineDash([]); boxPath(); viewCtx.stroke();
    viewCtx.strokeStyle = OVERLAY_FILL; viewCtx.setLineDash([5, 4]); boxPath(); viewCtx.stroke();
    viewCtx.setLineDash([]);
    // draw handles
    viewCtx.lineWidth = 1;
    for(const c of corners){
      viewCtx.fillStyle = OVERLAY_FILL; viewCtx.strokeStyle = OVERLAY_STROKE;
      viewCtx.fillRect(c.x-6, c.y-6, 12, 12);
      viewCtx.strokeRect(c.x-5.5, c.y-5.5, 11, 11);
    }
    // rotate handle: top center offset
    const topCenter = {x: (corners[0].x + corners[1].x)/2, y: (corners[0].y + corners[1].y)/2};
    const handleScale = Math.max(getDisplayTransform().totalScale, 0.001);
    const handleRadius = 14 / handleScale;
    const rotHandle = {x: topCenter.x, y: topCenter.y - (30 / handleScale)};
    viewCtx.lineWidth = 3; viewCtx.strokeStyle = OVERLAY_STROKE;
    viewCtx.beginPath(); viewCtx.moveTo(topCenter.x, topCenter.y); viewCtx.lineTo(rotHandle.x, rotHandle.y); viewCtx.stroke();
    viewCtx.lineWidth = 1; viewCtx.strokeStyle = OVERLAY_FILL;
    viewCtx.beginPath(); viewCtx.moveTo(topCenter.x, topCenter.y); viewCtx.lineTo(rotHandle.x, rotHandle.y); viewCtx.stroke();
    viewCtx.fillStyle = OVERLAY_FILL; viewCtx.strokeStyle = OVERLAY_STROKE;
    viewCtx.beginPath(); viewCtx.arc(rotHandle.x, rotHandle.y, 6, 0, Math.PI*2); viewCtx.fill(); viewCtx.stroke();
    viewCtx.restore();
  }
  const display = getDisplayTransform();
  viewCtx.save();
  viewCtx.strokeStyle = themeInk('canvasEdge');
  viewCtx.lineWidth = 1;
  viewCtx.shadowColor = themeInk('canvasHalo');
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
    // Same two-tone treatment as the transform box: the text sits on artwork.
    viewCtx.lineWidth = 1 / display.totalScale;
    viewCtx.strokeStyle = OVERLAY_STROKE;
    viewCtx.setLineDash([]);
    viewCtx.strokeRect(boxX, boxY, boxW, boxH);
    viewCtx.strokeStyle = OVERLAY_FILL;
    viewCtx.setLineDash([6 / display.totalScale, 4 / display.totalScale]);
    viewCtx.strokeRect(boxX, boxY, boxW, boxH);
    viewCtx.setLineDash([]);
    [[boxX, boxY],[boxX + boxW, boxY],[boxX + boxW, boxY + boxH],[boxX, boxY + boxH]].forEach(([handleX, handleY])=>{
      const hs = 6 / display.totalScale;
      viewCtx.fillStyle = OVERLAY_FILL;
      viewCtx.strokeStyle = OVERLAY_STROKE;
      viewCtx.fillRect(handleX - hs / 2, handleY - hs / 2, hs, hs);
      viewCtx.strokeRect(handleX - hs / 2, handleY - hs / 2, hs, hs);
    });
    viewCtx.restore();
  }
  viewCtx.globalAlpha = 1;
  // update layer thumbnails when the main view changes
  scheduleLayerThumbnailUpdate();
  if(selection) updateSelectionOverlay();
  if(currentTextEditor) syncTextEditorAppearance(currentTextEditor);
  updateCanvasChrome();
}
