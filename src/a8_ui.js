/* ================================================================
   UI wiring
   ================================================================ */
let recent = [], selWall = null, lastWall = null;
// put the camera square in front of the last wall that was painted (or the first wall)
function goHome(smoothMove){
  const W = (lastWall && !lastWall.disposed) ? lastWall : walls[0]; if (!W) return;
  const r = Math.max(W.w / camera.aspect, W.h) * 1.15 / 2 / Math.tan(camera.fov * Math.PI / 360);
  flyTo(W.toWorld(W.w/2, Math.min(W.h/2, 1.7), 0), W.rot, .06, clamp(r, 2, 40), smoothMove);
}
function setColor(h, name){
  h = h.toLowerCase(); const changed = h !== S.hex;
  S.hex = h; const found = PALETTE.find(p => p[1] === h); S.colorName = name || (found ? found[0] : 'Custom');
  me.setColor(h); HANDS.painters[0] && HANDS.painters[0].setColor(h);
  $('#colorPick').value = h; $('#colorName').textContent = S.colorName; $('#colorHex').textContent = h.toUpperCase(); $('#hudDot').style.background = h;
  $$('.sw').forEach(b => b.classList.toggle('on', b.dataset.hex === h));
  if (changed){ recent = [h, ...recent.filter(c => c !== h)].slice(0, 9); renderRecent(); if (A.ctx && S.tool === 'spray') rattle(5); me.shake = Math.max(me.shake, .35); }
  if (S.erase) setErase(false);
}
function swatch(h, title, num){
  const b = document.createElement('button'); b.className = 'sw'; b.style.background = h; b.dataset.hex = h; b.title = title; b.setAttribute('aria-label', title);
  if (num !== undefined){ const i = document.createElement('i'); i.textContent = num; b.appendChild(i); }
  if (h === S.hex) b.classList.add('on'); return b;
}
function renderPalette(){ const el = $('#palette'); el.innerHTML = ''; PALETTE.forEach(([name, h], i) => { const b = swatch(h, name + (i < 9 ? ` (${i+1})` : '')); b.onclick = () => setColor(h, name); el.appendChild(b); }); }
function renderRecent(){ const el = $('#recent'); el.innerHTML = ''; if (!recent.length){ el.innerHTML = '<p class="hint" style="grid-column:1/-1">Colours you use show up here.</p>'; return; } recent.forEach(h => { const b = swatch(h, h.toUpperCase()); b.onclick = () => setColor(h); el.appendChild(b); }); }
function renderGuidePalette(){
  const el = $('#guidePal'); el.innerHTML = ''; const L = G.sel;
  if (!L || !L.data){ el.innerHTML = '<p class="hint" style="grid-column:1/-1">Select an image to pull its colours here.</p>'; return; }
  L.data.palette.forEach((c, i) => {
    const h = hex(c[0], c[1], c[2]), b = swatch(h, `Shape colour ${i+1}. Click to load it and highlight its shapes.`, i+1);
    if (L.focus === i) b.style.outline = '2px solid var(--hazard)';
    b.onclick = () => { L.focus = L.focus === i ? -1 : i; setColor(h, `Guide #${i+1}`); makeFill(L); drawWallGuide(L.wall); renderGuidePalette(); };
    el.appendChild(b);
  });
}
function capPreview(cap){
  const c = mk(120, 72), x = c.getContext('2d'); x.fillStyle = '#2a2b31'; x.fillRect(0,0,120,72);
  const R = clamp((cap.r0 + cap.k*.12) * 520, 1.2, 30), asp = cap.aspect || 1, rnd = seeded(cap.id.length*97);
  for (let i=0;i<46;i++){ const px = 14 + i*2.1, py = 36 + Math.sin(i*.14)*10;
    const g = x.createRadialGradient(px,py,0,px,py,R); g.addColorStop(0,'rgba(255,210,31,.16)'); g.addColorStop(1,'rgba(255,210,31,0)');
    x.save(); x.translate(px,py); x.rotate(.9); x.scale(1, asp); x.translate(-px,-py); x.fillStyle = g; x.beginPath(); x.arc(px,py,R,0,Math.PI*2); x.fill(); x.restore(); }
  for (let i=0;i<(cap.id === 'splat' ? 140 : 220);i++){ const t = rnd(), px = 14 + t*96, py = 36 + Math.sin(t*46*.14)*10, a = rnd()*Math.PI*2, d = Math.abs((rnd()+rnd()+rnd()-1.5))*R*1.3, r = (cap.drop*1600)*(.4+rnd());
    x.fillStyle = `rgba(255,210,31,${.5+rnd()*.4})`; x.beginPath(); x.arc(px+Math.cos(a)*d, py+Math.sin(a)*d*(asp<1?asp*2:1), Math.max(.4,r), 0, Math.PI*2); x.fill(); }
  return c;
}
function markerPreview(M){
  const c = mk(120, 72), x = c.getContext('2d'); x.fillStyle = '#2a2b31'; x.fillRect(0,0,120,72);
  const w = clamp(M.w * 1400, 1.2, 26); x.strokeStyle = '#ffd21f'; x.lineCap = M.tip === 'chisel' ? 'butt' : 'round';
  if (M.tip === 'chisel'){ x.fillStyle = '#ffd21f'; for (let i=0;i<80;i++){ const t = i/79, px = 16 + t*88, py = 36 + Math.sin(t*5)*12; x.save(); x.translate(px, py); x.rotate(.6); x.fillRect(-w/2, -w*.18, w, w*.36); x.restore(); } }
  else { x.lineWidth = w; x.beginPath(); for (let i=0;i<=40;i++){ const t = i/40, px = 16 + t*88, py = 36 + Math.sin(t*5)*12; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  return c;
}
function renderTools(){
  const el = $('#caps'); el.innerHTML = '';
  const list = S.tool === 'spray' ? CAPS : MARKERS, cur = S.tool === 'spray' ? S.cap : S.marker;
  list.forEach((t, i) => {
    const b = document.createElement('button'); b.className = 'cap' + (i === cur ? ' on' : ''); b.title = `${t.name}: ${t.note}`;
    b.appendChild(S.tool === 'spray' ? capPreview(t) : markerPreview(t)); const tt = document.createElement('b'); tt.textContent = t.name; b.appendChild(tt);
    b.onclick = () => S.tool === 'spray' ? selectCap(i) : selectMarker(i); el.appendChild(b);
  });
  $('#toolSpray').classList.toggle('on', S.tool === 'spray'); $('#toolMarker').classList.toggle('on', S.tool === 'marker');
  $('#distRow').hidden = S.tool !== 'spray'; $('#flowRow').hidden = S.tool !== 'spray';
  $('#capsTitle').firstChild.textContent = S.tool === 'spray' ? 'Cap ' : 'Marker ';
  updateToolNote();
}
function updateToolNote(){
  const t = S.tool === 'spray' ? CAPS[S.cap] : MARKERS[S.marker];
  $('#capNote').textContent = t.note; $('#hudCap').textContent = S.tool === 'spray' ? t.name : `Marker ${t.name}`;
  $('#fanRow').hidden = !(S.tool === 'spray' ? t.aspect : t.tip === 'chisel');
  if (S.tool === 'spray'){ const wcm = 2 * (t.r0 + t.k * S.dist) * 100; $('#capWidth').textContent = `≈ ${wcm.toFixed(1)} cm wide`; }
  else $('#capWidth').textContent = `${t.tip === 'chisel' ? 'chisel' : 'round'} · ink ${Math.round(me.ink*100)}%`;
}
function setTool(t){ S.tool = t; me.prev = null; renderTools(); }
function selectCap(i){ S.cap = i; $$('#caps .cap').forEach((b, j) => b.classList.toggle('on', j === i && S.tool === 'spray')); updateToolNote(); }
function selectMarker(i){ S.marker = i; $$('#caps .cap').forEach((b, j) => b.classList.toggle('on', j === i && S.tool === 'marker')); updateToolNote(); }
function setDist(d){ S.dist = clamp(d, .025, .45); $('#dist').value = (S.dist*100).toFixed(1); $('#distOut').textContent = `${(S.dist*100).toFixed(1)} cm`; updateToolNote(); }
function setErase(on){ if (on && AP.running) return; S.erase = on; $('#toolPaint').classList.toggle('on', !on); $('#toolBuff').classList.toggle('on', on); updateModePill(); }
function syncFan(){ const deg = Math.round(S.fan*180/Math.PI); $('#fanAngle').value = deg; $('#fanOut').textContent = deg + '°'; }
function updateModePill(){
  const m = $('#hudMode'); if (AP.running) return;
  const txt = S.mode === 'build' ? 'BUILD' : S.mode === 'arrange' ? 'IMAGES' : S.erase ? 'BUFF' : 'PAINT';
  m.textContent = txt; m.className = 'mode' + (S.erase && S.mode === 'paint' ? ' buff' : S.mode !== 'paint' ? ' alt' : '');
}
function setTab(t){ $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $$('#panel section').forEach(s => s.hidden = s.dataset.tab !== t); $('.scroll').scrollTop = 0; }
function setMode(m){
  S.mode = m; drag = null; if (m === 'arrange') setTab('images'); else if (m === 'build') setTab('yard');
  $$('#modeBar [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  canvas.className = m === 'paint' ? '' : m;
  walls.forEach(w => w.mat.uniforms.sel.value = (m === 'build' && w === selWall) ? 1 : 0);
  redrawAllGuides(); updateModePill();
  if (m === 'arrange') toast('Images: drag to move (even onto another wall), corners to scale, the round handle to rotate. Q / E also rotate.');
  if (m === 'build') toast('Build: drag a wall to move it, Q / E to turn it. Add new walls from the Build panel.');
}
function setGuideVisible(v){ G.visible = v; $('#guideToggle').textContent = v ? 'Hide guides' : 'Show guides'; }
function togglePanel(){ const p = $('#panel'); p.hidden = !p.hidden; $('#showPanel').hidden = !p.hidden; }
function bindRange(id, outId, fmt, fn){ const el = $('#'+id), out = $('#'+outId); const up = () => { const v = parseFloat(el.value); out.textContent = fmt(v); fn(v); }; el.addEventListener('input', up); up(); }
const chipToggle = (el, on) => el.classList.toggle('on', on);

/* ---- image layers ---- */
function selectLayer(L){
  const old = G.sel; G.sel = L;
  if (old && old.wall) drawWallGuide(old.wall); if (L) drawWallGuide(L.wall);
  renderLayers(); syncLayerUI(); renderGuidePalette(); apUI();
}
function renderLayers(){
  const el = $('#layers'); el.innerHTML = '';
  const all = walls.flatMap(w => w.layers);
  if (!all.length){ el.innerHTML = '<p class="hint">No images yet. Drop one on any wall.</p>'; }
  for (const L of all){
    const b = document.createElement('button'); b.className = 'layer' + (L === G.sel ? ' on' : ''); b.title = `Image on ${WALL_TYPES[L.wall.type].name.toLowerCase()} (${MAT[L.wall.matId].name})`;
    const im = document.createElement('img'); im.src = L.thumb; im.alt = ''; b.appendChild(im);
    b.onclick = () => { selectLayer(L); if (S.mode !== 'arrange') setMode('arrange'); };
    el.appendChild(b);
  }
  $('#layerOpts').hidden = !G.sel;
}
function syncLayerUI(){
  const L = G.sel; if (!L) return;
  const set = (id, v, txt) => { $('#'+id).value = v; $('#'+id+'Out').textContent = txt; };
  set('gK', L.k, String(L.k)); set('gDetail', L.detail, String(L.detail)); set('gOpacity', Math.round(L.opacity*100), Math.round(L.opacity*100) + '%');
  set('gLine', L.lineW, L.lineW.toFixed(1)); set('gSize', L.hgt.toFixed(2), `${L.hgt.toFixed(2)} m`);
  const deg = ((L.rot * 180 / Math.PI) % 360 + 540) % 360 - 180; set('gRot', Math.round(deg), `${Math.round(deg)}°`);
  $$('#guideModes .chip').forEach(o => chipToggle(o, o.dataset.mode === L.mode));
  $$('#guideLayers .chip').forEach(o => chipToggle(o, L.show[o.dataset.layer]));
  $$('#lineColors .chip').forEach(o => chipToggle(o, o.dataset.lc === L.lineColor));
  $('#guideStatus').textContent = L.data ? `${L.data.palette.length} colours · ${L.data.numbers.length} shapes` : 'tracing…';
}
let guideTimer = 0;
function reprocessSoon(){ const L = G.sel; if (!L) return; clearTimeout(guideTimer); $('#guideStatus').textContent = 'tracing…'; guideTimer = setTimeout(() => { try { processLayer(L); } catch (e) { console.error(e); } drawWallGuide(L.wall); syncLayerUI(); renderGuidePalette(); apUI(); }, 220); }
function addImage(img, at, idx){
  let h = at, W, u, v;
  if (!h){ h = hitWalls(new THREE.Vector2(0, 0), true); }
  if (h && h.face){ W = h.wall; u = h.u; v = h.v; } else { W = (G.sel && G.sel.wall) || lastWall || selWall || walls[0]; u = W.w/2; v = W.h/2; }
  const L = new Layer(img, W, u, v);
  if (idx){ L.hgt = Math.min(L.hgt, W.h * .45); u += (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * (L.wid + .15); }   // several at once: spread them out
  L.cx = clamp(u, L.wid/2 * .3, W.w - L.wid/2 * .3); L.cy = clamp(v, Math.min(W.h/2, L.hgt/2 + .05), Math.max(W.h/2, W.h - L.hgt/2 - .05));
  $('#guideStatus').textContent = 'tracing…'; setGuideVisible(true);
  setTimeout(() => { try { processLayer(L); toast('Image placed. Trace it, or let Auto paint do it.'); } catch (e) { console.error(e); L.remove(); toast('That image could not be traced'); renderLayers(); return; }
    selectLayer(L); drawWallGuide(W); }, 30);
}
function loadImageFile(file, at, idx){
  if (!file || !/^image\//.test(file.type)){ toast('That file is not an image'); return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => addImage(img, at, idx || 0); img.onerror = () => toast('That image could not be read'); img.src = url;
}

/* ---- build ---- */
function selectWall(W){
  selWall = W; walls.forEach(w => w.mat.uniforms.sel.value = (S.mode === 'build' && w === W) ? 1 : 0);
  $('#wallOpts').hidden = !W;
  if (W){ $('#wallName').textContent = `${WALL_TYPES[W.type].name} · ${MAT[W.matId].name}`;
    $('#wW').value = W.w; $('#wWOut').textContent = W.w.toFixed(2) + ' m'; $('#wH').value = W.h; $('#wHOut').textContent = W.h.toFixed(2) + ' m';
    $$('#mats .mat').forEach(b => b.classList.toggle('on', b.dataset.id === W.matId)); }
}
function addWall(type){
  const T = WALL_TYPES[type], f = new THREE.Vector3(-Math.sin(cam.az), 0, -Math.cos(cam.az));
  const at = cam.t.clone().addScaledVector(f, type === 'train' ? 5 : 2); at.y = 0;
  const W = new Wall({type, mat:T.mat, x:at.x, z:at.z, rot:cam.az});
  W.toWorld(0,0,0); drawWallGuide(W); selectWall(W); sceneChanged(true);
  flyTo(W.toWorld(W.w/2, W.h/2, 0), W.rot, .12, clamp(Math.max(W.w/camera.aspect, W.h) / Math.tan(camera.fov*Math.PI/360) * .7, 3, 30));
  toast(`${T.name} added. Drag it to move, Q / E to turn.`);
}
function deleteWall(W){
  if (walls.length <= 1){ toast('Keep at least one wall in the yard'); return; }
  const b = $('#wDel');
  if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = 'Click to confirm'; setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Delete wall'; }, 2500); return; }
  b.classList.remove('armed'); b.textContent = 'Delete wall';
  if (AP.running && AP.wall === W) apFinish(false);
  if (me.wall === W){ me.wall = null; }
  W.dispose(); selectWall(null); renderLayers(); sceneChanged(true);
}
function renderMaterials(){
  const el = $('#mats'); el.innerHTML = '';
  for (const m of MATERIALS){
    const b = document.createElement('button'); b.className = 'mat'; b.dataset.id = m.id; b.title = m.name;
    const im = document.createElement('img'); im.alt = ''; im.src = matThumb(m.id); const sp = document.createElement('span'); sp.textContent = m.name;
    b.append(im, sp); b.onclick = () => { if (!selWall) return; $('#loadMsg').textContent = 'Mixing ' + m.name.toLowerCase() + '…'; selWall.setMaterial(m.id); selectWall(selWall); sceneChanged(true); };
    el.appendChild(b);
  }
}
let sceneT = 0;
function sceneChanged(now){ NET.epoch++; clearTimeout(sceneT); sceneT = setTimeout(emitScene, now ? 50 : 300); }

/* ---- export ---- */
async function saveBlob(blob, name){
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl){ try { await dl.save({ filename:name, data:blob }); toast('Saved'); } catch (e) { if (!e || e.code !== 'declined') toast('Saving is not available here. Right-click the preview to save it.'); } return; }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function showExport(blob, name, title, isVideo){
  const url = URL.createObjectURL(blob);
  $('#modalImg').hidden = !!isVideo; $('#modalVid').hidden = !isVideo;
  if (isVideo){ $('#modalVid').src = url; } else $('#modalImg').src = url;
  $('#modalTitle').textContent = title; $('#modal').hidden = false;
  $('#modalDl').onclick = () => saveBlob(blob, name);
}
function savePhoto(){
  const aimWas = S.aim; S.aim = false; frameUniforms();
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
  canvas.toBlob(b => { S.aim = aimWas; if (b) showExport(b, 'spray-photo.png', 'Photo of the yard'); }, 'image/png');
}
function saveFlat(){
  const W = (S.mode === 'build' && selWall) || me.wall || (G.sel && G.sel.wall) || walls[0];
  const tmp = snapRT(W.RW, W.RH); copyRT(W.rt, tmp);
  const buf = new Uint8Array(W.RW*W.RH*4); renderer.readRenderTargetPixels(tmp, 0, 0, W.RW, W.RH, buf); tmp.dispose();
  const out = mk(W.RW, W.RH), ctx = out.getContext('2d'), tile = W.matTex.canvas, tp = W.def.tileM * W.ppm;
  const pat = ctx.createPattern(tile, 'repeat'); const m = new DOMMatrix(); m.translateSelf(-W.tileOff.x*W.ppm, 0); m.scaleSelf(tp / tile.width, tp / tile.height); pat.setTransform(m);
  ctx.fillStyle = pat; ctx.fillRect(0, 0, W.RW, W.RH);
  const pc = mk(W.RW, W.RH), pctx = pc.getContext('2d'), id = pctx.createImageData(W.RW, W.RH), d = id.data;
  for (let y=0;y<W.RH;y++){ const sr = (W.RH-1-y)*W.RW*4, dr = y*W.RW*4;
    for (let x=0;x<W.RW*4;x+=4){ const a = buf[sr+x+3]; if (!a) continue; const k = 255/a; d[dr+x]=buf[sr+x]*k; d[dr+x+1]=buf[sr+x+1]*k; d[dr+x+2]=buf[sr+x+2]*k; d[dr+x+3]=a; } }
  pctx.putImageData(id, 0, 0); ctx.drawImage(pc, 0, 0);
  out.toBlob(b => { if (b) showExport(b, 'spray-wall.png', `Flat wall, ${W.RW}×${W.RH}`); }, 'image/png');
}

function wireUI(){
  renderTools(); renderPalette(); renderRecent(); renderGuidePalette(); renderLayers(); renderMaterials();
  bindRange('dist','distOut', v => `${v.toFixed(1)} cm`, v => { S.dist = v/100; updateToolNote(); });
  bindRange('flow','flowOut', v => `${v|0}%`, v => S.flow = v/100);
  bindRange('fanAngle','fanOut', v => `${v|0}°`, v => S.fan = v*Math.PI/180);
  bindRange('dripAmt','dripOut', v => v <= 0 ? 'Off' : v < 25 ? 'Rare' : v < 50 ? 'Light' : v < 80 ? 'Medium' : 'Heavy', v => { S.dripAmt = v/100; S.drips = v > 0; if (!S.drips) walls.forEach(w => w.drips.length = 0); });
  $('#apAll').onclick = e => { AP.all = !AP.all; chipToggle(e.currentTarget, AP.all); apUI(); };
  $('#homeBtn').onclick = () => goHome();
  $$('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab)); setTab('paint');
  $('#undoTop').onclick = undo; $('#redoTop').onclick = redo; $('#redoBtn').onclick = redo; updateUndoUI();
  $('#pickBtn').onclick = () => toast('Point at any wall and press I, or Alt + click, to pick up its colour.');
  $('#projSave').onclick = exportProject;
  $('#projFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importProject(f); e.target.value = ''; });
  const ny = $('#newYard'); let nyT = 0;
  ny.onclick = () => { if (!ny.classList.contains('armed')){ ny.classList.add('armed'); ny.textContent = 'Click to wipe everything'; clearTimeout(nyT); nyT = setTimeout(() => { ny.classList.remove('armed'); ny.textContent = 'New yard'; }, 2500); return; }
    ny.classList.remove('armed'); ny.textContent = 'New yard'; newYard(); };
  bindRange('vol','volOut', v => `${v|0}%`, v => { S.volume = v/100; if (A.ctx) A.master.gain.value = S.sound ? S.volume : 0; });
  const LR = (id, fmt, fn) => bindRange(id, id+'Out', fmt, v => { if (G.sel) fn(G.sel, v); });
  LR('gOpacity', v => `${v|0}%`, (L, v) => { L.opacity = v/100; drawWallGuide(L.wall); });
  LR('gLine', v => v.toFixed(1), (L, v) => { L.lineW = v; drawWallGuide(L.wall); });
  LR('gSize', v => `${v.toFixed(2)} m`, (L, v) => { L.hgt = v; drawWallGuide(L.wall); });
  LR('gRot', v => `${v|0}°`, (L, v) => { L.rot = v * Math.PI / 180; drawWallGuide(L.wall); });
  LR('gK', v => String(v|0), (L, v) => { if (L.k !== (v|0)){ L.k = v|0; reprocessSoon(); } });
  LR('gDetail', v => String(v|0), (L, v) => { if (L.detail !== (v|0)){ L.detail = v|0; reprocessSoon(); } });
  bindRange('wW', 'wWOut', v => `${v.toFixed(2)} m`, () => {}); bindRange('wH', 'wHOut', v => `${v.toFixed(2)} m`, () => {});
  for (const id of ['wW', 'wH']) $('#'+id).addEventListener('change', () => { if (!selWall) return; selWall.resize(+$('#wW').value, +$('#wH').value); selectWall(selWall); sceneChanged(true); });
  bindRange('apSpeed','apSpeedOut', v => `${v|0}×`, v => { AP.speed = v|0; if (!AP.running) apUI(); });
  $('#colorPick').addEventListener('input', e => setColor(e.target.value));
  $('#toolPaint').onclick = () => setErase(false); $('#toolBuff').onclick = () => setErase(true);
  $('#toolSpray').onclick = () => setTool('spray'); $('#toolMarker').onclick = () => setTool('marker');
  $$('#modeBar [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('#aimToggle').onclick = e => { S.aim = !S.aim; chipToggle(e.currentTarget, S.aim); };
  $('#soundToggle').onclick = e => { S.sound = !S.sound; chipToggle(e.currentTarget, S.sound); initAudio(); if (A.ctx) A.master.gain.value = S.sound ? S.volume : 0; };
  $$('#lightModes .chip').forEach(b => b.onclick = () => setLighting(b.dataset.light));
  $('#undoBtn').onclick = undo;
  const cb = $('#clearBtn'); let armT = 0;
  cb.onclick = () => { const W = me.wall || walls[0];
    if (!cb.classList.contains('armed')){ cb.classList.add('armed'); cb.textContent = 'Click to confirm'; clearTimeout(armT); armT = setTimeout(() => { cb.classList.remove('armed'); cb.textContent = 'Clear wall'; }, 2500); return; }
    cb.classList.remove('armed'); cb.textContent = 'Clear wall'; pushUndo(W); W.clearPaint(); netClear(W); toast('Wall buffed clean. Undo brings it back.'); };
  $('#shotBtn').onclick = savePhoto; $('#flatBtn').onclick = saveFlat;
  $('#recBtn').onclick = () => REC.active ? stopRecording() : startRecording('view');
  $('#hidePanel').onclick = togglePanel; $('#showPanel').onclick = togglePanel;
  // console keys: record, guide, full screen, theme, slider fill
  $('#recKey').onclick = () => $('#recBtn').click();
  $('#guideKey').onclick = () => { const t = document.querySelector('#tabs [data-tab=more]'); if (t) t.click(); if ($('#panel').hidden) togglePanel(); };
  $('#fsKey').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  const setTheme = t => { if (t === 'light') document.body.dataset.ui = 'light'; else delete document.body.dataset.ui; try { localStorage.setItem('spraylab-ui', t); } catch (e) {} };
  try { setTheme(localStorage.getItem('spraylab-ui') || 'dark'); } catch (e) {}
  $('#themeKey').onclick = () => setTheme(document.body.dataset.ui === 'light' ? 'dark' : 'light');
  const fill = t => t.style.setProperty('--pct', ((t.value - t.min) / (t.max - t.min) * 100) + '%');
  document.addEventListener('input', e => { if (e.target.type === 'range') fill(e.target); });
  setInterval(() => document.querySelectorAll('input[type=range]').forEach(fill), 500);
  $('#file').addEventListener('change', e => { [...(e.target.files || [])].slice(0, 12).forEach((f, i) => loadImageFile(f, null, i)); e.target.value = ''; });
  $$('#guideModes .chip').forEach(b => b.onclick = () => { const L = G.sel; if (!L) return; L.mode = b.dataset.mode; syncLayerUI(); drawWallGuide(L.wall); apUI(); });
  $$('#guideLayers .chip').forEach(b => b.onclick = () => { const L = G.sel; if (!L) return; const k = b.dataset.layer; L.show[k] = !L.show[k]; syncLayerUI(); drawWallGuide(L.wall); });
  $$('#lineColors .chip').forEach(b => b.onclick = () => { const L = G.sel; if (!L) return; L.lineColor = b.dataset.lc; syncLayerUI(); drawWallGuide(L.wall); });
  $('#guideMove').onclick = () => setMode(S.mode === 'arrange' ? 'paint' : 'arrange');
  $('#guideToggle').onclick = () => setGuideVisible(!G.visible);
  $('#guideFocus').onclick = () => { if (G.sel) frameLayer(G.sel, true); };
  $('#guideClear').onclick = () => { if (!G.sel) return; if (AP.running && AP.layer === G.sel) apFinish(false); G.sel.remove(); selectLayer(null); };
  $('#apSketch').onclick = e => { AP.sketch = !AP.sketch; chipToggle(e.currentTarget, AP.sketch); apUI(); };
  $('#apHide').onclick = e => { AP.hide = !AP.hide; chipToggle(e.currentTarget, AP.hide); if (AP.running) setGuideVisible(!AP.hide); };
  $('#apClean').onclick = e => { AP.clean = !AP.clean; chipToggle(e.currentTarget, AP.clean); };
  $('#apRecord').onclick = e => { AP.record = !AP.record; chipToggle(e.currentTarget, AP.record); };
  $('#apFrame').onclick = e => { AP.frame = !AP.frame; chipToggle(e.currentTarget, AP.frame); };
  $('#apStart').onclick = apStart;
  $('#apPause').onclick = () => { if (!AP.running) return; AP.paused = !AP.paused; apUI(); };
  $('#apStop').onclick = () => apFinish(false);
  $$('[data-add]').forEach(b => b.onclick = () => { if (S.mode !== 'build') setMode('build'); addWall(b.dataset.add); });
  $('#wRotL').onclick = () => { if (selWall){ selWall.rot += Math.PI/12; selWall.place(); sceneChanged(true); } };
  $('#wRotR').onclick = () => { if (selWall){ selWall.rot -= Math.PI/12; selWall.place(); sceneChanged(true); } };
  $('#wDup').onclick = () => { if (!selWall) return; const o = selWall.serialize(); delete o.id; o.x += Math.cos(o.rot) * (o.w + .6); o.z -= Math.sin(o.rot) * (o.w + .6); const W = new Wall(o); drawWallGuide(W); selectWall(W); sceneChanged(true); };
  $('#wDel').onclick = () => { if (selWall) deleteWall(selWall); };
  $('#wFocus').onclick = () => { if (selWall) flyTo(selWall.toWorld(selWall.w/2, selWall.h/2, 0), selWall.rot, .08, clamp(Math.max(selWall.w/camera.aspect, selWall.h) / Math.tan(camera.fov*Math.PI/360) * .65, 2.5, 40)); };
  $('#handsBtn').onclick = () => HANDS.on ? stopHands() : startHands();
  $('#p2Color').addEventListener('input', e => { HANDS.p2 = e.target.value; if (HANDS.painters[1]) HANDS.painters[1].setColor(e.target.value); });
  $('#nick').addEventListener('change', e => { NET.nick = e.target.value.trim().slice(0, 24) || NET.nick; netPresence(true); });
  let dragDepth = 0; const ov = $('#dropOverlay');
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types||[])].includes('Files')){ e.preventDefault(); dragDepth++; ov.hidden = false; } });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) ov.hidden = true; });
  window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; ov.hidden = true; const proj = [...(e.dataTransfer?.files || [])].find(f => /\.json$/i.test(f.name)); if (proj){ importProject(proj); return; }
    const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type)).slice(0, 12); if (!files.length) return;
    const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left)/r.width)*2-1, -((e.clientY - r.top)/r.height)*2+1), at = hitWalls(ndc, true);
    files.forEach((f, i) => loadImageFile(f, at, i)); });
  window.addEventListener('paste', e => { const it = [...(e.clipboardData?.items||[])].find(i => i.type.startsWith('image/')); if (it) loadImageFile(it.getAsFile()); });
  $('#modalClose').onclick = () => { $('#modal').hidden = true; $('#modalVid').pause && $('#modalVid').pause(); };
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modalClose').onclick(); });
}
