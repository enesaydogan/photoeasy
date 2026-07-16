// Viewport input bindings and application initialization.
// Zoom and drag functionality
function setupViewportControls() {
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && spacePressed)) {
      const point = getViewPointFromClient(e.clientX, e.clientY);
      viewportTransform.isDragging = true;
      viewportTransform.pointerId = e.pointerId;
      viewportTransform.startX = point.x;
      viewportTransform.startY = point.y;
      viewport.style.cursor = 'grabbing';
      try{ viewport.setPointerCapture(e.pointerId); }catch(err){}
      e.preventDefault();
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (viewportTransform.isDragging && e.pointerId === viewportTransform.pointerId) {
      const point = getViewPointFromClient(e.clientX, e.clientY);
      viewportTransform.offsetX += point.x - viewportTransform.startX;
      viewportTransform.offsetY += point.y - viewportTransform.startY;
      viewportTransform.startX = point.x;
      viewportTransform.startY = point.y;
      composite();
    }
  });

  const finishPan = (e) => {
    if (viewportTransform.isDragging && e.pointerId === viewportTransform.pointerId) {
      viewportTransform.isDragging = false;
      viewportTransform.pointerId = null;
      updateCursorFeedback(e.clientX, e.clientY);
    }
  };
  viewport.addEventListener('pointerup', finishPan);
  viewport.addEventListener('pointercancel', finishPan);

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
  if(e.code === 'Space' && !editingField){ spacePressed = true; e.preventDefault(); }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
    e.preventDefault();
    if(currentTextEditor) currentTextEditor.commit();
    if(e.shiftKey) exportPNG();
    else saveProject();
    return;
  }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o'){
    e.preventDefault();
    projectFileInput.click();
    return;
  }
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
  if(key === 'enter' && tool === 'select' && selection?.ready){ commitSelection(); return; }
  if(key === 'escape'){
    if(tool === 'select' && selection?.ready){ cancelSelection(true); return; }
    if(cropPending){ cancelCrop(); return; }
    if(transformState){ cancelTransform(); return; }
  }
  if((e.key === 'Delete' || e.key === 'Backspace') && activeLayer){ e.preventDefault(); deleteActiveLayer(); return; }
  if((e.key === '[' || e.key === ']') && (tool === 'brush' || tool === 'eraser')){
    size = Math.max(1, Math.min(200, size + (e.key === ']' ? 2 : -2)));
    renderToolProps();
    return;
  }
  if(e.key === '+' || e.key === '='){
    e.preventDefault();
    zoomViewport(viewportTransform.scale * 1.2); composite(); return;
  }
  if(e.key === '-'){
    e.preventDefault();
    zoomViewport(viewportTransform.scale / 1.2); composite(); return;
  }
  if(key === 'v'){ selectTool('move'); }
  else if(key === 'b'){ selectTool('brush'); }
  else if(key === 'e'){ selectTool('eraser'); }
  else if(key === 'f'){ selectTool('fill'); }
  else if(key === 'c'){ selectTool('crop'); }
  else if(key === 'm'){ selectTool('select'); }
  else if(key === 'w'){ selectTool('magic'); }
  else if(key === 'r'){ doTransform(); }
  else if(key === 't'){ selectTool('text'); }
  else if(key === 'z'){ selectTool('zoom'); }
});
window.addEventListener('keyup', (e)=>{ if(e.code === 'Space') spacePressed = false; });
window.addEventListener('blur', ()=>{ spacePressed = false; });

initI18n(document.getElementById('language-switch'));
window.addEventListener('langchange', ()=>{
  localizeGeneratedLayerNames();
  document.querySelectorAll('.text-editor-meta').forEach((element)=>{ element.textContent = t('text.editorMeta'); });
  renderLayersUI();
  renderToolProps();
  renderHistoryPanel();
  updateToolHint();
  applyTooltips();
  updateCanvasChrome();
});

// Init default - only create Background layer
createLayer(t('layer.background'), { historyLabel: 'history.createBackground', role: 'background', autoName: { key:'layer.background' } });
setupViewportControls();
window.addEventListener('resize', () => { resizePreviewCanvas(); composite(); });
// Overlays are canvas-painted, so a theme swap needs an explicit repaint.
document.addEventListener('themechange', () => composite());
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
