// Flood-fill and mask generation algorithms.
// Flood fill helpers
function colorMatch(data, idx, r,g,b,a){ return data[idx]===r && data[idx+1]===g && data[idx+2]===b && data[idx+3]===a; }

function floodFillMask(imageData, startX, startY){
  const w = imageData.width, h = imageData.height; const data = imageData.data;
  const mask = new Uint8Array(w*h);
  startX = Math.round(startX); startY = Math.round(startY);
  if(startX < 0 || startY < 0 || startX >= w || startY >= h) return mask;
  const startIdx = (startY * w + startX) * 4;
  const sr = data[startIdx], sg = data[startIdx+1], sb = data[startIdx+2], sa = data[startIdx+3];
  const stack = [startX, startY];
  while(stack.length){ const y = stack.pop(); const x = stack.pop(); if(x<0||x>=w||y<0||y>=h) continue; const i = (y*w + x); if(mask[i]) continue; const idx = i*4; if(!colorMatch(data, idx, sr,sg,sb,sa)) continue; mask[i]=1; stack.push(x+1,y); stack.push(x-1,y); stack.push(x,y+1); stack.push(x,y-1); }
  return mask;
}

function applyMaskToColor(mask, w, h, fillColor){
  const out = document.createElement('canvas'); out.width = w; out.height = h; const octx = out.getContext('2d'); const img = octx.createImageData(w,h); const data = img.data; const [fr,fg,fb] = Object.values(hexToRgb(fillColor?fillColor:'#000'));
  for(let i=0;i<w*h;i++){ if(mask[i]){ const idx = i*4; data[idx]=fr; data[idx+1]=fg; data[idx+2]=fb; data[idx+3]=255; } }
  octx.putImageData(img,0,0); return out;
}

function floodFillLayerAt(layer, pageX, pageY, fillHex){
  if(!layer) return;
  const lx = Math.round(pageX - layer.offset.x); const ly = Math.round(pageY - layer.offset.y);
  if(lx<0||ly<0||lx>=layer.canvas.width||ly>=layer.canvas.height) return;
  const ctx = layer.ctx; const img = ctx.getImageData(0,0,layer.canvas.width, layer.canvas.height);
  const mask = floodFillMask(img, lx, ly);
  // apply fill color to pixels where mask=1
  const [fr,fg,fb] = Object.values(hexToRgb(fillHex));
  for(let i=0;i<mask.length;i++){ if(mask[i]){ const idx=i*4; img.data[idx]=fr; img.data[idx+1]=fg; img.data[idx+2]=fb; img.data[idx+3]=255; } }
  ctx.putImageData(img,0,0);
}

function floodFillCompositeAt(pageX, pageY, fillHex){
  const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height; const tctx = tmp.getContext('2d', { willReadFrequently: true });
  renderFlattenedToContext(tctx);
  const img = tctx.getImageData(0,0,width,height);
  const mask = floodFillMask(img, Math.round(pageX), Math.round(pageY));
  const filled = applyMaskToColor(mask, width, height, fillHex);
  // add new layer with filled pixels
  const newCanvas = document.createElement('canvas'); newCanvas.width = width; newCanvas.height = height; const nctx = newCanvas.getContext('2d'); nctx.drawImage(filled,0,0);
  const newLayer = {canvas:newCanvas, ctx:newCanvas.getContext('2d'), name:'Fill', offset:{x:0,y:0}, visible:true, opacity:1, blend:'source-over', maskCanvas:null, locked:false, role:null};
  layers.push(newLayer); activeLayer = newLayer; renderLayersUI(); composite(); pushHistory();
}

function applyMaskToLayer(mask, maskW, maskH, layer, fillHex){
  if(!layer) return;
  const lw = layer.canvas.width, lh = layer.canvas.height;
  const img = layer.ctx.getImageData(0,0,lw,lh);
  const [fr,fg,fb] = Object.values(hexToRgb(fillHex));
  for(let y=0;y<lh;y++){
    for(let x=0;x<lw;x++){
      const gx = Math.round(layer.offset.x + x); const gy = Math.round(layer.offset.y + y);
      if(gx < 0 || gy < 0 || gx >= maskW || gy >= maskH) continue;
      const mi = gy * maskW + gx;
      if(mask[mi]){
        const idx = (y*lw + x) * 4;
        img.data[idx] = fr; img.data[idx+1] = fg; img.data[idx+2] = fb; img.data[idx+3] = 255;
      }
    }
  }
  layer.ctx.putImageData(img,0,0);
}

// Find tight bounding box of non-transparent pixels in a layer's canvas
function getLayerContentBounds(layer){
  const w = layer.canvas.width, h = layer.canvas.height;
  try{
    const img = layer.ctx.getImageData(0,0,w,h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const idx = (y*w + x)*4 + 3; // alpha
        if(img[idx] !== 0){ if(x < minX) minX = x; if(x > maxX) maxX = x; if(y < minY) minY = y; if(y > maxY) maxY = y; }
      }
    }
    if(maxX < 0) return { x: 0, y: 0, w: w, h: h }; // empty -> whole canvas
    return { x: minX, y: minY, w: (maxX - minX + 1), h: (maxY - minY + 1) };
  }catch(e){ return { x: 0, y: 0, w: w, h: h }; }
}

document.getElementById('add-layer').addEventListener('click', ()=> createLayer('Layer ' + (layers.length+1)));
document.getElementById('dup-layer').addEventListener('click', ()=> duplicateActiveLayer());
document.getElementById('del-layer').addEventListener('click', ()=> deleteActiveLayer());
