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
window.addEventListener('keyup', (e)=>{ if(e.code === 'Space') spacePressed = false; });
window.addEventListener('blur', ()=>{ spacePressed = false; });

// Init default - only create Background layer
createLayer('Background', { historyLabel: 'Create Background', role: 'background' });
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

