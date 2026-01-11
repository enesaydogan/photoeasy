// Minimal browser-based Photoshop-like demo
const view = document.getElementById('view');
const viewport = document.getElementById('viewport');
const layersList = document.getElementById('layers-list');
const fileInput = document.getElementById('file-input');

let width = 1200, height = 700;
view.width = width; view.height = height;
view.style.width = width + 'px'; view.style.height = height + 'px';

const viewCtx = view.getContext('2d');
let layers = []; // {canvas,ctx,name,offset:{x,y},visible,opacity}
let activeLayer = null;
let tool = 'brush';
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

// History
let history = [];
let historyIndex = -1;
function pushHistory(){
  // capture state
  const snapshot = {layers: [], activeIndex: layers.indexOf(activeLayer)};
  for(const l of layers){
    snapshot.layers.push({dataURL: l.canvas.toDataURL(), offset: {...l.offset}, visible: l.visible, opacity: l.opacity, name: l.name});
  }
  // trim redo
  history = history.slice(0, historyIndex+1);
  history.push(snapshot);
  historyIndex = history.length-1;
}

async function restoreHistory(idx){
  if(idx < 0 || idx >= history.length) return;
  const snap = history[idx];
  const newLayers = [];
  for(const item of snap.layers){
    const img = new Image();
    img.src = item.dataURL;
    await new Promise(r=> img.onload = r);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
    newLayers.push({canvas:c, ctx, name:item.name, offset:item.offset, visible:item.visible, opacity:item.opacity});
  }
  layers = newLayers;
  activeLayer = layers[snap.activeIndex] || null;
  renderLayersUI(); composite();
  historyIndex = idx;
}

function createLayer(name='Layer'){
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const layer = {canvas:c,ctx,name,offset:{x:0,y:0},visible:true,opacity:1};
  layers.push(layer);
  pushHistory();
  setActiveLayer(layers.length-1);
  renderLayersUI();
  composite();
}

function setActiveLayer(idx){
  activeLayer = layers[idx];
  renderLayersUI();
}

function deleteActiveLayer(){
  if(!activeLayer) return;
  const idx = layers.indexOf(activeLayer);
  if(idx>=0){
    layers.splice(idx,1);
    activeLayer = layers[layers.length-1] || null;
    renderLayersUI(); composite();
    pushHistory();
  }
}

function renderLayersUI(){
  layersList.innerHTML='';
  for(let i=layers.length-1;i>=0;i--){
    const layer = layers[i];
    const li = document.createElement('li');
    const row = document.createElement('div'); row.className = 'layer-row';
    const thumb = document.createElement('canvas'); thumb.className = 'layer-thumb'; thumb.width = 56; thumb.height = 42;
    try{ const tctx = thumb.getContext('2d'); tctx.clearRect(0,0,thumb.width,thumb.height); tctx.drawImage(layer.canvas, 0,0, layer.canvas.width, layer.canvas.height, 0,0, thumb.width, thumb.height); }catch(e){}
    const name = document.createElement('div'); name.className='layer-name'; name.textContent=layer.name;
    name.ondblclick = (ev)=>{ ev.stopPropagation(); const nn = prompt('Rename layer', layer.name); if(nn){ layer.name = nn; renderLayersUI(); pushHistory(); } };
    const opacity = document.createElement('input'); opacity.type = 'range'; opacity.min = 0; opacity.max = 1; opacity.step = 0.01; opacity.value = layer.opacity; opacity.className = 'layer-opacity';
    const opVal = document.createElement('div'); opVal.className = 'layer-opacity-value'; opVal.textContent = Math.round(layer.opacity*100) + '%';
    opacity.oninput = (e)=>{ layer.opacity = Number(e.target.value); opVal.textContent = Math.round(layer.opacity*100) + '%'; composite(); };
    opacity.onchange = ()=> pushHistory();

    const controls = document.createElement('div'); controls.className='layer-controls';
    const sel = document.createElement('button'); sel.textContent = (layer===activeLayer)? '●' : '○'; sel.className='small';
    sel.onclick = ()=> setActiveLayer(i);
    const vis = document.createElement('button'); vis.textContent = layer.visible? '👁' : '🚫'; vis.className='small';
    vis.onclick = ()=>{ layer.visible = !layer.visible; composite(); renderLayersUI(); };
    const up = document.createElement('button'); up.textContent = '↑'; up.className='small'; up.title = 'Move up'; up.onclick = ()=>{ moveLayerUp(i); };
    const down = document.createElement('button'); down.textContent = '↓'; down.className='small'; down.title = 'Move down'; down.onclick = ()=>{ moveLayerDown(i); };

    [sel, vis, up, down].forEach(b=>{ b.className='small'; b.onclick = (ev)=>{ ev.stopPropagation(); }; });
    sel.textContent = (layer===activeLayer)? '●' : '○'; sel.onclick = (ev)=>{ ev.stopPropagation(); setActiveLayer(i); };
    vis.textContent = layer.visible? '👁' : '🚫'; vis.onclick = (ev)=>{ ev.stopPropagation(); layer.visible = !layer.visible; composite(); renderLayersUI(); };
    up.title = 'Move up'; up.onclick = (ev)=>{ ev.stopPropagation(); moveLayerUp(i); };
    down.title = 'Move down'; down.onclick = (ev)=>{ ev.stopPropagation(); moveLayerDown(i); };

    const meta = document.createElement('div'); meta.className = 'layer-meta';
    // Name on top (title style) to avoid layout breaks from long names
    name.style.whiteSpace = 'nowrap'; name.style.overflow = 'hidden'; name.style.textOverflow = 'ellipsis'; name.style.width = '100%';
    meta.appendChild(name);

    const midRow = document.createElement('div'); midRow.style.display = 'flex'; midRow.style.alignItems = 'center'; midRow.style.gap = '8px';
    midRow.appendChild(thumb);
    const controlWrap = document.createElement('div'); controlWrap.style.display = 'flex'; controlWrap.style.flexDirection = 'column'; controlWrap.style.flex = '1';
    const opRow = document.createElement('div'); opRow.style.display = 'flex'; opRow.style.alignItems = 'center'; opRow.style.justifyContent = 'space-between';
    opRow.appendChild(opacity);
    opRow.appendChild(opVal);
    controlWrap.appendChild(opRow);
    midRow.appendChild(controlWrap);
    meta.appendChild(midRow);

    row.appendChild(meta);
    row.appendChild(controls);

    // Row selection behavior
    row.classList.add('layer-row');
    if(layer === activeLayer) row.classList.add('active');
    row.style.cursor = 'pointer';
    row.onclick = ()=> setActiveLayer(i);
    li.appendChild(row);
    layersList.appendChild(li);
  }
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
  // indexFromTop is reversed (we render from top to bottom), convert to actual index
  const idx = indexFromTop;
  if(idx <= 0) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx-1,0,a);
  // preserve activeLayer reference if needed
  renderLayersUI(); composite();
  pushHistory();
}

function moveLayerDown(indexFromTop){
  const idx = indexFromTop;
  if(idx >= layers.length-1) return;
  const a = layers[idx];
  layers.splice(idx,1);
  layers.splice(idx+1,0,a);
  renderLayersUI(); composite();
  pushHistory();
}

function composite(){
  viewCtx.clearRect(0,0,width,height);
  for(const layer of layers){
    if(!layer.visible) continue;
    viewCtx.globalAlpha = layer.opacity;
    viewCtx.drawImage(layer.canvas, layer.offset.x, layer.offset.y);
  }
  viewCtx.globalAlpha = 1;
  // update layer thumbnails when the main view changes
  updateLayerThumbnails();
}

// Drawing
function getPos(e){
  const rect = view.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (view.width/rect.width);
  const y = (e.clientY - rect.top) * (view.height/rect.height);
  return {x,y};
}

view.addEventListener('mousedown', (e)=>{
  // allow Text tool to create a new layer even if nothing is selected
  if(!activeLayer && tool !== 'text') return;
  if(tool==='move'){
    drawing = true; last = getPos(e);
    return;
  }

  if(tool==='select'){
    // start selection rect
    selection = {start:getPos(e), x:0,y:0,w:0,h:0};
    const selDiv = document.createElement('div'); selDiv.className='selection-rect'; selDiv.id = 'sel-rect';
    viewport.appendChild(selDiv);
    drawing = true; return;
  }

  if(tool === 'text'){
    // place an editable textarea over the viewport for typing
    const pos = getPos(e);
    const rect = view.getBoundingClientRect();
    // convert canvas coords back to page coordinates
    const left = rect.left + (pos.x * rect.width / view.width);
    const top = rect.top + (pos.y * rect.height / view.height);
    console.log('Text tool click at', pos, 'page coords', left, top);
    const ta = document.createElement('textarea');
    ta.setAttribute('data-debug','text-tool');
    ta.style.position='absolute';
    ta.style.left = left + 'px';
    ta.style.top = top + 'px';
    ta.style.minWidth='160px';
    ta.style.minHeight='32px';
    ta.style.padding = '6px';
    ta.style.background='rgba(255,255,200,0.98)';
    ta.style.border='2px solid #f44';
    ta.style.zIndex=99999; ta.style.resize='none'; ta.spellcheck = false; ta.style.outline='none';
    // mirror font settings so it's visible
    const f = (fontBold? 'bold ' : '') + fontSize + 'px ' + fontFamily;
    ta.style.font = f; ta.style.color = color;
    // append to document body so left/top (page coords) position correctly
    document.body.appendChild(ta);
    // delay focus so mousedown/up sequence doesn't immediately blur it
    setTimeout(()=>{ try{ ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }catch(e){} }, 0);

    let _taCommitted = false;
    function commitText(){
      if(_taCommitted) return;
      _taCommitted = true;
      const txt = ta.value.trim();
      console.log('Committing text:', txt);
      try{ if(ta.parentNode) ta.parentNode.removeChild(ta); }catch(e){}
      if(!txt) return;
      // measure text using a temporary context
      const measureCanvas = document.createElement('canvas');
      const mctx = measureCanvas.getContext('2d');
      const f2 = (fontBold? 'bold ' : '') + fontSize + 'px ' + fontFamily;
      mctx.font = f2;
      const w = Math.ceil(mctx.measureText(txt).width) || 1;
      const h = Math.ceil(fontSize * 1.2) || 1;
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
      const drawCtx = tmp.getContext('2d'); drawCtx.font = f2; drawCtx.fillStyle = color; drawCtx.textBaseline='top';
      drawCtx.fillText(txt, 0, 0);
      const newLayer = {canvas:tmp, ctx:tmp.getContext('2d'), name:'Text', offset:{x:Math.round(pos.x), y:Math.round(pos.y)}, visible:true, opacity:1};
      layers.push(newLayer); activeLayer = newLayer; renderLayersUI(); composite(); pushHistory();
    }

    ta.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); commitText(); }
      if(ev.key === 'Escape'){ ev.preventDefault(); if(!_taCommitted){ _taCommitted = true; try{ if(ta.parentNode) ta.parentNode.removeChild(ta); }catch(e){} } }
    });
    ta.addEventListener('blur', ()=>{ commitText(); });
    return;
  }

  drawing = true; last = getPos(e);
  const ctx = activeLayer.ctx;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.lineWidth = size;
  if(tool==='eraser'){
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = toolOpacity;
  } else {
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = color; ctx.globalAlpha = toolOpacity;
  }
  ctx.beginPath(); ctx.moveTo(last.x - activeLayer.offset.x, last.y - activeLayer.offset.y);
});

view.addEventListener('mousemove', (e)=>{
  if(!drawing || !activeLayer) return;
  const pos = getPos(e);
  const ctx = activeLayer.ctx;
  if(tool==='move'){
    const dx = pos.x - last.x; const dy = pos.y - last.y;
    activeLayer.offset.x += dx; activeLayer.offset.y += dy;
    last = pos; composite(); return;
  }

  if(tool==='select'){
    // update selection rect
    const s = selection.start;
    selection.x = Math.min(s.x, pos.x);
    selection.y = Math.min(s.y, pos.y);
    selection.w = Math.abs(pos.x - s.x);
    selection.h = Math.abs(pos.y - s.y);
    const selDiv = document.getElementById('sel-rect');
    if(selDiv){
      selDiv.style.left = (selection.x * (view.getBoundingClientRect().width/view.width)) + 'px';
      selDiv.style.top = (selection.y * (view.getBoundingClientRect().height/view.height)) + 'px';
      selDiv.style.width = (selection.w * (view.getBoundingClientRect().width/view.width)) + 'px';
      selDiv.style.height = (selection.h * (view.getBoundingClientRect().height/view.height)) + 'px';
    }
    return;
  }
  ctx.lineTo(pos.x - activeLayer.offset.x, pos.y - activeLayer.offset.y);
  ctx.stroke(); composite();
  last = pos;
});

window.addEventListener('mouseup', ()=>{
  if(!drawing || !activeLayer) return;
  drawing = false;
  if(tool==='select'){
    // finalize selection: create new layer with selected pixels
    const selDiv = document.getElementById('sel-rect'); if(selDiv) selDiv.remove();
    if(selection && selection.w > 1 && selection.h > 1){
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
        pushHistory();
      }
    }
    selection = null; return;
  }

  try{ activeLayer.ctx.restore(); }catch(e){}
  pushHistory();
});

// UI bindings
document.getElementById('tool-brush').addEventListener('click', ()=> selectTool('brush'));
document.getElementById('tool-eraser').addEventListener('click', ()=> selectTool('eraser'));
document.getElementById('tool-move').addEventListener('click', ()=> selectTool('move'));
document.getElementById('tool-select').addEventListener('click', ()=> selectTool('select'));
document.getElementById('tool-transform').addEventListener('click', ()=> doTransform());
document.getElementById('tool-text')?.addEventListener('click', ()=> selectTool('text'));

function selectTool(t){
  tool = t;
  document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById('tool-'+t);
  if(btn) btn.classList.add('active');
  // render per-tool properties
  setTimeout(()=>{ try{ renderToolProps(); }catch(e){} }, 0);
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
    el.appendChild(sizeBlk); el.appendChild(opBlk);
  } else if(tool === 'text'){
    const colorBlk = createBlock('Color');
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value=color; colorInput.oninput=(e)=> color = e.target.value;
    colorBlk.appendChild(colorInput);

    const sizeBlk = createBlock('Font size');
    const sizeInput = document.createElement('input'); sizeInput.type='number'; sizeInput.min=8; sizeInput.max=240; sizeInput.value=fontSize; sizeInput.oninput=(e)=> fontSize = Number(e.target.value);
    sizeBlk.appendChild(sizeInput);

    const familyBlk = createBlock('Font');
    const sel = document.createElement('select'); ['sans-serif','serif','monospace'].forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent=f; if(f===fontFamily) o.selected=true; sel.appendChild(o); }); sel.onchange=(e)=> fontFamily = e.target.value;
    familyBlk.appendChild(sel);

    const boldBlk = createBlock('Bold');
    const boldChk = document.createElement('input'); boldChk.type='checkbox'; boldChk.checked = fontBold; boldChk.onchange = (e)=> fontBold = e.target.checked; boldBlk.appendChild(boldChk);

    el.appendChild(colorBlk); el.appendChild(sizeBlk); el.appendChild(familyBlk); el.appendChild(boldBlk);
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent='Click on canvas to place text.'; el.appendChild(help);
  } else {
    const info = document.createElement('div'); info.style.color='#ddd'; info.style.fontSize='13px'; info.textContent='Tool options'; el.appendChild(info);
  }
  // if any color input exists, attach color picker for unified behavior
  const colorInputs = el.querySelectorAll('input[type="color"]');
  colorInputs.forEach(ci=>{
    const parent = ci.parentElement || el;
    // replace with custom color picker
    const cp = createColorPicker(color, (hex)=>{ color = hex; ci.value = hex; });
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

document.getElementById('add-layer').addEventListener('click', ()=> createLayer('Layer ' + (layers.length+1)));
document.getElementById('del-layer').addEventListener('click', ()=> deleteActiveLayer());
document.getElementById('export').addEventListener('click', exportPNG);
document.getElementById('import-image').addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', handleFile);

function handleFile(e){
  const f = e.target.files[0]; if(!f) return;
  const img = new Image(); img.onload = ()=>{
    createLayer('Imported');
    const l = activeLayer;
    l.ctx.drawImage(img, 0, 0, width, height);
    composite();
    pushHistory();
  };
  img.src = URL.createObjectURL(f);
}

function exportPNG(){
  const out = document.createElement('canvas'); out.width = width; out.height = height; const octx = out.getContext('2d');
  octx.clearRect(0,0,width,height);
  for(const layer of layers){ if(!layer.visible) continue; octx.globalAlpha = layer.opacity; octx.drawImage(layer.canvas, layer.offset.x, layer.offset.y); }
  const a = document.createElement('a'); a.download = 'photoeasy-export.png'; a.href = out.toDataURL('image/png'); a.click();
}

// Transform: simple scale/rotate of active layer via prompt
function doTransform(){
  if(!activeLayer) return alert('Select a layer to transform');
  const s = prompt('Scale factor (e.g. 1 = 100%)', '1'); if(s===null) return; const scale = Number(s) || 1;
  const r = prompt('Rotate degrees (e.g. 0)', '0'); if(r===null) return; const deg = Number(r) || 0;
  const rad = deg * Math.PI/180;
  const src = activeLayer.canvas;
  const sw = Math.max(1, Math.round(src.width * scale));
  const sh = Math.max(1, Math.round(src.height * scale));
  const out = document.createElement('canvas'); out.width = sw; out.height = sh; const octx = out.getContext('2d');
  // draw transformed
  octx.translate(sw/2, sh/2);
  octx.rotate(rad);
  octx.scale(scale, scale);
  octx.drawImage(src, -src.width/2, -src.height/2);
  // replace layer canvas
  activeLayer.canvas = out; activeLayer.ctx = out.getContext('2d');
  pushHistory(); renderLayersUI(); composite();
}

// Init default
createLayer('Background');
createLayer('Layer 1');
setActiveLayer(1);
composite();
renderToolProps();
