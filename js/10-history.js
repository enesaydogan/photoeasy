// History snapshots, restoration, undo, and redo.
// History
let history = [];
let historyIndex = -1;
function pushHistory(label = 'history.edit'){
  // capture state
  const snapshot = {width, height, layers: [], activeIndex: layers.indexOf(activeLayer), label, size: 0};
  for(const l of layers){
    const dataURL = l.canvas.toDataURL();
    const maskURL = l.maskCanvas ? l.maskCanvas.toDataURL() : null;
    snapshot.size += dataURL.length + (maskURL ? maskURL.length : 0);
    snapshot.layers.push({
      dataURL,
      offset: {...l.offset},
      visible: l.visible,
      opacity: l.opacity,
      name: l.name,
      blend: l.blend || 'source-over',
      mask: maskURL,
      locked: l.locked || false,
      role: l.role || null,
      autoName: l.autoName ? { key: l.autoName.key, params: { ...(l.autoName.params || {}) } } : null,
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
  let totalSize = history.reduce((sum, item)=> sum + (item.size || 0), 0);
  while(history.length > 2 && (history.length > MAX_HISTORY_STEPS || totalSize > MAX_HISTORY_CHARS)){
    const removed = history.shift();
    totalSize -= removed?.size || 0;
  }
  historyIndex = history.length-1;
  updateHistoryButtons();
}

function loadImageFromDataURL(dataURL){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error(t('status.historyRestoreFailed')));
    img.src = dataURL;
  });
}

async function restoreHistory(idx){
  if(idx < 0 || idx >= history.length) return;
  const restoreToken = ++historyRestoreToken;
  historyRestoring = true;
  updateHistoryButtons();
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
  try{
  const newLayers = await Promise.all(snap.layers.map(async (item)=>{
    const img = await loadImageFromDataURL(item.dataURL);
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
      role: item.role || null,
      autoName: item.autoName || null,
      type: item.type || null,
      text: item.text || null,
      font: item.font || null,
      color: item.color || null,
      fontSize: item.fontSize || null,
      fontFamily: item.fontFamily || null,
      bold: item.bold || false
    };
    if(item.mask){
      const mimg = await loadImageFromDataURL(item.mask);
      const mc = document.createElement('canvas'); mc.width = mimg.width; mc.height = mimg.height; const mctx = mc.getContext('2d'); mctx.drawImage(mimg,0,0);
      layerObj.maskCanvas = mc;
    }
    return layerObj;
  }));
  if(restoreToken !== historyRestoreToken) return;
  layers = newLayers;
  localizeGeneratedLayerNames();
  activeLayer = layers[snap.activeIndex] || null;
  editMaskMode = false;
  if(currentTextEditor){
    try{ currentTextEditor.cancel(); }catch(e){ currentTextEditor = null; }
  }
  renderLayersUI(); composite();
  historyIndex = idx;
  }catch(error){
    if(restoreToken === historyRestoreToken) addStatus(error.message || t('status.historyRestoreFailed'), 'warning', 3200);
  }finally{
    if(restoreToken === historyRestoreToken){
      historyRestoring = false;
      updateHistoryButtons();
    }
  }
}

function updateHistoryButtons(){
  try{
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');
    if(undoBtn) undoBtn.disabled = historyRestoring || historyIndex <= 0;
    if(redoBtn) redoBtn.disabled = historyRestoring || historyIndex >= history.length-1 || history.length===0;
  }catch(e){}
  updateCanvasChrome();
  renderHistoryPanel();
}

async function undo(){
  if(!historyRestoring && historyIndex > 0){
    const label = getHistoryDisplayLabel(history[historyIndex], historyIndex);
    await restoreHistory(historyIndex-1);
    addStatus(t('history.undid', { action: label }), 'info', 1800);
  }
}
async function redo(){
  if(!historyRestoring && historyIndex < history.length-1){
    const label = getHistoryDisplayLabel(history[historyIndex + 1], historyIndex + 1);
    await restoreHistory(historyIndex+1);
    addStatus(t('history.redid', { action: label }), 'info', 1800);
  }
}
