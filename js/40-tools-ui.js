// Tool property controls and color picker UI.
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
  if(transformState && t !== 'transform'){
    try{ cancelTransform(false); }catch(e){ transformState = null; }
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
    const colorBlk = createBlock(t('props.color'));
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = color; colorInput.setAttribute('aria-label',t('props.brushColor')); colorInput.oninput = (e)=> color = e.target.value;
    colorBlk.appendChild(colorInput);

    const sizeBlk = createBlock(t('props.size'));
    const sizeRow = document.createElement('div'); sizeRow.className = 'prop-control-row';
    const sizeRange = document.createElement('input'); sizeRange.type='range'; sizeRange.min=1; sizeRange.max=200; sizeRange.value = size; sizeRange.setAttribute('aria-label',t('props.brushSize')); sizeRange.oninput = (e)=>{ size = Number(e.target.value); sizeVal.textContent = size; };
    const sizeVal = document.createElement('div'); sizeVal.className='prop-value'; sizeVal.textContent = size;
    sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeVal); sizeBlk.appendChild(sizeRow);

    const opBlk = createBlock(t('props.opacity'));
    const opRow = document.createElement('div'); opRow.className='prop-control-row';
    const opRange = document.createElement('input'); opRange.type='range'; opRange.min=0; opRange.max=100; opRange.value = Math.round(toolOpacity*100); opRange.setAttribute('aria-label',t('props.brushOpacity')); opRange.oninput = (e)=>{ toolOpacity = Number(e.target.value)/100; opVal.textContent = e.target.value + '%'; };
    const opVal = document.createElement('div'); opVal.className='prop-value'; opVal.textContent = Math.round(toolOpacity*100) + '%';
    opRow.appendChild(opRange); opRow.appendChild(opVal); opBlk.appendChild(opRow);

    // Add mask editing toggle if layer has a mask
    if(activeLayer && activeLayer.maskCanvas){
      const maskBlk = createBlock(t('props.maskEditing'));
      const maskToggle = document.createElement('label');
      maskToggle.style.display = 'flex'; maskToggle.style.alignItems = 'center'; maskToggle.style.gap = '8px';
      const maskCheckbox = document.createElement('input'); maskCheckbox.type = 'checkbox';
      maskCheckbox.checked = editMaskMode; // Use current mode
      maskCheckbox.onchange = (e) => {
        editMaskMode = e.target.checked;
      };
      const maskLabel = document.createElement('span'); maskLabel.textContent = t('props.editMask');
      maskLabel.style.color = '#a9b6d8'; maskLabel.style.fontSize = '14px';
      maskToggle.appendChild(maskCheckbox); maskToggle.appendChild(maskLabel);
      maskBlk.appendChild(maskToggle);
      el.appendChild(maskBlk);
    }

    el.appendChild(colorBlk); el.appendChild(sizeBlk); el.appendChild(opBlk);
  } else if(tool === 'eraser'){
    const sizeBlk = createBlock(t('props.size'));
    const sizeRow = document.createElement('div'); sizeRow.className = 'prop-control-row';
    const sizeRange = document.createElement('input'); sizeRange.type='range'; sizeRange.min=1; sizeRange.max=200; sizeRange.value = size; sizeRange.setAttribute('aria-label',t('props.eraserSize')); sizeRange.oninput = (e)=>{ size = Number(e.target.value); sizeVal.textContent = size; };
    const sizeVal = document.createElement('div'); sizeVal.className='prop-value'; sizeVal.textContent = size;
    sizeRow.appendChild(sizeRange); sizeRow.appendChild(sizeVal); sizeBlk.appendChild(sizeRow);
    const opBlk = createBlock(t('props.opacity'));
    const opRow = document.createElement('div'); opRow.className='prop-control-row';
    const opRange = document.createElement('input'); opRange.type='range'; opRange.min=0; opRange.max=100; opRange.value = Math.round(toolOpacity*100); opRange.setAttribute('aria-label',t('props.eraserOpacity')); opRange.oninput = (e)=>{ toolOpacity = Number(e.target.value)/100; opVal.textContent = e.target.value + '%'; };
    const opVal = document.createElement('div'); opVal.className='prop-value'; opVal.textContent = Math.round(toolOpacity*100) + '%';
    opRow.appendChild(opRange); opRow.appendChild(opVal); opBlk.appendChild(opRow);

    // Add mask editing toggle if layer has a mask
    if(activeLayer && activeLayer.maskCanvas){
      const maskBlk = createBlock(t('props.maskEditing'));
      const maskToggle = document.createElement('label');
      maskToggle.style.display = 'flex'; maskToggle.style.alignItems = 'center'; maskToggle.style.gap = '8px';
      const maskCheckbox = document.createElement('input'); maskCheckbox.type = 'checkbox';
      maskCheckbox.checked = editMaskMode; // Use current mode
      maskCheckbox.onchange = (e) => {
        editMaskMode = e.target.checked;
      };
      const maskLabel = document.createElement('span'); maskLabel.textContent = t('props.editMask');
      maskLabel.style.color = '#a9b6d8'; maskLabel.style.fontSize = '14px';
      maskToggle.appendChild(maskCheckbox); maskToggle.appendChild(maskLabel);
      maskBlk.appendChild(maskToggle);
      el.appendChild(maskBlk);
    }

    el.appendChild(sizeBlk); el.appendChild(opBlk);
  } else if(tool === 'transform'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent=t('props.transformHelp'); el.appendChild(help);
    if(transformState){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const ok = document.createElement('button'); ok.textContent = t('props.commitTransform'); ok.onclick = ()=>{ try{ commitTransform(); }catch(e){} };
      const cancel = document.createElement('button'); cancel.textContent = t('props.cancelTransform'); cancel.onclick = ()=>{ try{ cancelTransform(); }catch(e){} };
      row.appendChild(ok); row.appendChild(cancel); el.appendChild(row);
    } else {
      const info = document.createElement('div'); info.style.color='#999'; info.style.fontSize='12px'; info.textContent=t('props.transformStart'); el.appendChild(info);
    }
  } else if(tool === 'text'){
    const colorBlk = createBlock(t('props.color'));
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value=color;
    colorInput.dataset.for = 'text';
    colorInput.oninput=(e)=>{ color = e.target.value; if(currentTextEditor){ currentTextEditor.pending.color = color; syncTextEditorAppearance(currentTextEditor); } };
    colorBlk.appendChild(colorInput);

    const sizeBlk = createBlock(t('props.fontSize'));
    const sizeInput = document.createElement('input'); sizeInput.type='number'; sizeInput.min=8; sizeInput.max=240; sizeInput.value=fontSize; sizeInput.oninput=(e)=>{ fontSize = Number(e.target.value); if(currentTextEditor){ currentTextEditor.pending.fontSize = fontSize; syncTextEditorAppearance(currentTextEditor); } };
    sizeBlk.appendChild(sizeInput);

    const familyBlk = createBlock(t('props.font'));
    const sel = document.createElement('select'); ['sans-serif','serif','monospace'].forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent=f; if(f===fontFamily) o.selected=true; sel.appendChild(o); }); sel.onchange=(e)=>{ fontFamily = e.target.value; if(currentTextEditor){ currentTextEditor.pending.fontFamily = fontFamily; syncTextEditorAppearance(currentTextEditor); } };
    familyBlk.appendChild(sel);

    const boldBlk = createBlock(t('props.bold'));
    const boldChk = document.createElement('input'); boldChk.type='checkbox'; boldChk.checked = fontBold; boldChk.onchange = (e)=>{ fontBold = e.target.checked; if(currentTextEditor){ currentTextEditor.pending.bold = fontBold; syncTextEditorAppearance(currentTextEditor); } }; boldBlk.appendChild(boldChk);

    el.appendChild(colorBlk); el.appendChild(sizeBlk); el.appendChild(familyBlk); el.appendChild(boldBlk);
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent=t('props.textHelp'); el.appendChild(help);
    // if editing right now, show commit/cancel buttons
    if(currentTextEditor){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const commitBtn = document.createElement('button'); commitBtn.textContent = t('props.commitText'); commitBtn.onclick = ()=>{ currentTextEditor.commit(); };
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = t('props.cancelText'); cancelBtn.onclick = ()=>{ currentTextEditor.cancel(); };
      row.appendChild(commitBtn); row.appendChild(cancelBtn); el.appendChild(row);
    }
  } else if(tool === 'zoom'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent=t('props.zoomHelp'); el.appendChild(help);
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
    const fitBtn = document.createElement('button'); fitBtn.textContent = t('props.fitView'); fitBtn.onclick = ()=> fitView(true);
    const actualBtn = document.createElement('button'); actualBtn.textContent = '100%'; actualBtn.onclick = ()=> setActualSize(true);
    row.appendChild(fitBtn); row.appendChild(actualBtn); el.appendChild(row);
  } else if(tool === 'crop'){
    const help = document.createElement('div'); help.style.color='#999'; help.style.fontSize='12px'; help.textContent=t('props.cropHelp'); el.appendChild(help);
    if(cropPending){
      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px';
      const ok = document.createElement('button'); ok.textContent = t('props.commitCrop'); ok.onclick = ()=>{ try{ commitCrop(); }catch(e){} };
      const cancel = document.createElement('button'); cancel.textContent = t('props.cancelCrop'); cancel.onclick = ()=>{ try{ cancelCrop(); }catch(e){} };
      row.appendChild(ok); row.appendChild(cancel); el.appendChild(row);
    }
  } else {
    const info = document.createElement('div'); info.style.color='#ddd'; info.style.fontSize='13px'; info.textContent=t('props.toolOptions'); el.appendChild(info);
  }
  if(tool === 'fill'){
    // add color picker and option to calculate mask on composite (but always apply to active layer)
    const colorBlk = createBlock(t('props.fillColor'));
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.value = color; colorInput.oninput = (e)=> color = e.target.value;
    colorBlk.appendChild(colorInput);
    const optBlk = createBlock(t('props.maskSource'));
    const chk = document.createElement('input'); chk.type='checkbox'; chk.id = 'fill-use-composite'; chk.checked = !!window.fillUseComposite; chk.onchange = (e)=> window.fillUseComposite = e.target.checked;
    const lbl = document.createElement('label'); lbl.htmlFor = chk.id; lbl.textContent = t('props.compositeMask'); optBlk.appendChild(chk); optBlk.appendChild(lbl);
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
function hexToRgb(hex){
  const normalized = String(hex || '').trim().replace('#','');
  if(!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) throw new Error('Invalid hex color.');
  const expanded = normalized.length === 3 ? normalized.split('').map(c=>c+c).join('') : normalized;
  const num = parseInt(expanded,16);
  return {r:(num>>16)&255, g:(num>>8)&255, b:num&255};
}
function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function rgbToHsv(r,g,b){ r/=255;g/=255;b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); const d=max-min; let h=0; if(d){ if(max===r) h= (g-b)/d + (g<b?6:0); else if(max===g) h= (b-r)/d + 2; else h= (r-g)/d + 4; h/=6;} const s = max===0?0:d/max; const v = max; return {h:h*360, s:s, v:v}; }
function hsvToRgb(h,s,v){ h = (h%360+360)%360; const c = v*s; const x = c*(1-Math.abs((h/60)%2 -1)); const m = v-c; let r=0,g=0,b=0; if(h<60){ r=c; g=x; b=0;} else if(h<120){ r=x; g=c; b=0;} else if(h<180){ r=0; g=c; b=x;} else if(h<240){ r=0; g=x; b=c;} else if(h<300){ r=x; g=0; b=c;} else { r=c; g=0; b=x; } return {r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255)}; }

function createColorPicker(initialHex, onChange){
  const wrapper = document.createElement('div'); wrapper.className='color-picker';
  const sv = document.createElement('canvas'); sv.className='cp-sv'; sv.width = 300; sv.height = 200;
  const hue = document.createElement('input'); hue.type='range'; hue.className='cp-hue'; hue.min=0; hue.max=360; hue.value=0;
  const controls = document.createElement('div'); controls.className='cp-controls';
  const hexIn = document.createElement('input'); hexIn.className='cp-hex'; hexIn.value = initialHex;
  hexIn.setAttribute('aria-label', t('props.hexColor'));
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
  let svPointerId = null;
  sv.addEventListener('pointerdown', (e)=>{
    svPointerId = e.pointerId;
    try{ sv.setPointerCapture(e.pointerId); }catch(err){}
    svPointer(e); e.preventDefault();
  });
  sv.addEventListener('pointermove', (e)=>{ if(e.pointerId === svPointerId) svPointer(e); });
  const releaseSv = (e)=>{ if(e.pointerId === svPointerId) svPointerId = null; };
  sv.addEventListener('pointerup', releaseSv);
  sv.addEventListener('pointercancel', releaseSv);

  hue.addEventListener('input', (e)=>{ hsv.h = Number(e.target.value); updateUI(); });
  hexIn.addEventListener('change', (e)=>{ try{ const rgb = hexToRgb(e.target.value); const h = rgbToHsv(rgb.r,rgb.g,rgb.b); hsv = h; hexIn.removeAttribute('aria-invalid'); updateUI(); }catch(err){ hexIn.setAttribute('aria-invalid', 'true'); addStatus(t('status.invalidHex'), 'warning', 2200); } });

  // initial draw
  updateUI();
  return wrapper;
}
