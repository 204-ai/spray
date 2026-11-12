/* ================================================================
   Saving: autosave in the browser, project files, colour picking
   ================================================================ */
const STORE = { db:null, t:0, busy:true, last:'', tick:0 };
function idbOpen(){ return new Promise((res, rej) => { try { const r = indexedDB.open('spraylab', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
const kvPut = (k, v) => new Promise((res, rej) => { const tx = STORE.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
const kvDel = k => new Promise((res, rej) => { const tx = STORE.db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
const kvGet = k => new Promise((res, rej) => { const rq = STORE.db.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const kvKeys = () => new Promise((res, rej) => { const rq = STORE.db.transaction('kv').objectStore('kv').getAllKeys(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
function markDirty(wall){ wall.dirty = true; STORE.t = performance.now(); }

// a wall's paint as a canvas with straight alpha, or null when the wall is clean
function wallPaintCanvas(W){
  flushAll();
  const key = W.RW + 'x' + W.RH, tmp = (undoPool[key] && undoPool[key].pop()) || snapRT(W.RW, W.RH); copyRT(W.rt, tmp);
  const buf = new Uint8Array(W.RW*W.RH*4); renderer.readRenderTargetPixels(tmp, 0, 0, W.RW, W.RH, buf); (undoPool[key] = undoPool[key] || []).push(tmp);
  const c = mk(W.RW, W.RH), ctx = c.getContext('2d'), id = ctx.createImageData(W.RW, W.RH), d = id.data; let any = false;
  for (let y=0;y<W.RH;y++){ const sr = (W.RH-1-y)*W.RW*4, dr = y*W.RW*4;
    for (let x=0;x<W.RW*4;x+=4){ const a = buf[sr+x+3]; if (!a) continue; any = true; const k = 255/a; d[dr+x]=buf[sr+x]*k; d[dr+x+1]=buf[sr+x+1]*k; d[dr+x+2]=buf[sr+x+2]*k; d[dr+x+3]=a; } }
  if (!any) return null;
  ctx.putImageData(id, 0, 0); return c;
}
function paintFromImage(W, img){
  const tex = new THREE.Texture(img); tex.premultiplyAlpha = true; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  copyMat.uniforms.src.value = tex; renderer.setRenderTarget(W.rt); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null); tex.dispose();
}
function layerCanvas(L){ const im = L.img, s = Math.min(1, 1400 / Math.max(im.width, im.height)), c = mk(Math.max(1, Math.round(im.width*s)), Math.max(1, Math.round(im.height*s))); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c; }
const allLayers = () => walls.flatMap(w => w.layers.filter(l => l.data));
function sceneState(){
  return { v:1, light:lightMode, walls:walls.map(w => w.serialize()), sel:G.sel ? G.sel.id : null,
    layers:allLayers().map(l => ({ id:l.id, wall:l.wall.id, cx:+l.cx.toFixed(4), cy:+l.cy.toFixed(4), hgt:+l.hgt.toFixed(4), rot:+l.rot.toFixed(4), mode:l.mode, k:l.k, detail:l.detail, opacity:l.opacity, lineW:l.lineW, lineColor:l.lineColor, show:l.show })) };
}
async function loadImg(src){ const im = new Image(); im.src = src; await im.decode(); return im; }
async function blobImg(b){ if (!b) return null; const u = URL.createObjectURL(b); try { return await loadImg(u); } finally { setTimeout(() => URL.revokeObjectURL(u), 5000); } }

function disposeAll(){
  if (AP.running) apFinish(false);
  for (const W of [...walls]) W.dispose();
  me.wall = null; me.visible = false; lastWall = null; G.sel = null; selWall = null;
  HANDS.painters.forEach(p => { p.wall = null; p.visible = false; });
  for (const m of NET.remote.values()) for (const p of m.values()){ p.wall = null; p.visible = false; }
  selectWall(null); renderLayers();
}
const num = (v, d, a, b) => { v = +v; return Number.isFinite(v) ? clamp(v, a, b) : d; };
async function applyProject(sc, getPaint, getImg){
  for (const o of (Array.isArray(sc.walls) ? sc.walls : []).slice(0, 24)){
    if (!o || typeof o.id !== 'string' || !WALL_TYPES[o.type] || !MAT[o.mat] || wallById(o.id)) continue;
    const W = new Wall({ id:o.id.slice(0, 24), type:o.type, mat:o.mat, w:num(o.w, 4, 1, 16), h:num(o.h, 3, 1, 6), x:num(o.x, 0, -60, 60), z:num(o.z, 0, -60, 60), rot:num(o.rot, 0, -1e3, 1e3) });
    try { const img = await getPaint(W.id); if (img) paintFromImage(W, img); } catch (e) { console.error(e); }
  }
  if (!walls.length) return false;
  let sel = null;
  for (const l of (Array.isArray(sc.layers) ? sc.layers : []).slice(0, 24)){
    const W = l && wallById(String(l.wall)); if (!W) continue;
    let L = null;
    try {
      const img = await getImg(String(l.id)); if (!img) continue;
      L = new Layer(img, W, num(l.cx, W.w/2, -20, 40), num(l.cy, W.h/2, -20, 40)); L.id = String(l.id).slice(0, 24);
      L.hgt = num(l.hgt, 1, .05, 20); L.rot = num(l.rot, 0, -1e3, 1e3); L.mode = ['shapes','lines','both'].includes(l.mode) ? l.mode : 'shapes';
      L.k = num(l.k, 7, 2, 16)|0; L.detail = num(l.detail, 5, 1, 10)|0; L.opacity = num(l.opacity, .6, 0, 1); L.lineW = num(l.lineW, 2.5, 1, 8);
      if (['#ffffff','#111111','#00f0ff'].includes(l.lineColor)) L.lineColor = l.lineColor;
      if (l.show && typeof l.show === 'object') for (const k of ['lines','fill','numbers','photo']) L.show[k] = !!l.show[k];
      processLayer(L); if (sc.sel === l.id) sel = L;
    } catch (e) { console.error(e); if (L) L.remove(); }
  }
  walls.forEach(drawWallGuide);
  if (LIGHTS[sc.light]) setLighting(sc.light);
  selectLayer(sel || allLayers()[0] || null); renderLayers();
  return true;
}
async function defaultYard(){
  const main = new Wall({id:'w-main', type:'wall', mat:'brick_red', w:8, h:3.2, x:0, z:0, rot:0});
  new Wall({id:'w-hoard', type:'hoarding', mat:'hoarding', w:4.88, h:2.44, x:-8.2, z:2.6, rot:.62});
  new Wall({id:'w-block', type:'wall', mat:'cinder_paint', w:5, h:2.6, x:8, z:2.4, rot:-.6});
  new Wall({id:'w-train', type:'train', mat:'steel_train', w:13, h:2.6, x:2, z:-9, rot:0});
  try { await Promise.race([document.fonts.load('172px Bungee'), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
  const L = new Layer(makeSampleImage(), main, main.w/2, 1.65); L.hgt = 2.3;
  try { processLayer(L); } catch (e) { console.error(e); L.remove(); }
  walls.forEach(drawWallGuide); setLighting('day'); selectLayer(L.data ? L : null); renderLayers();
}
async function restoreAutosave(){
  STORE.db = await idbOpen();
  const js = await kvGet('scene'); if (!js) return false;
  const sc = JSON.parse(js);
  const ok = await applyProject(sc, async id => blobImg(await kvGet('paint:' + id)), async id => blobImg(await kvGet('img:' + id)));
  if (ok){ allLayers().forEach(l => l.saved = true); STORE.last = JSON.stringify(sceneState()); }
  return ok;
}
function saveNote(t){ const el = $('#saveStatus'); if (el) el.textContent = t; }
async function autosaveTick(){
  if (!STORE.db || STORE.busy || AP.running || P.down || P.space || me.spraying || HANDS.painters.some(p => p.spraying)) return;
  if (performance.now() - STORE.t < 2500) return;
  STORE.busy = true;
  try {
    let did = false;
    const W = walls.find(w => w.dirty);
    if (W){ W.dirty = false; did = true; const c = wallPaintCanvas(W);
      if (c){ const b = await new Promise(r => c.toBlob(r, 'image/png')); if (b && !W.disposed) await kvPut('paint:' + W.id, b); } else await kvDel('paint:' + W.id); }
    for (const L of allLayers()) if (!L.saved){ L.saved = true; did = true; const b = await new Promise(r => layerCanvas(L).toBlob(r, 'image/png')); if (b) await kvPut('img:' + L.id, b); }
    const js = JSON.stringify(sceneState());
    if (js !== STORE.last){
      await kvPut('scene', js); STORE.last = js; did = true;
      const keep = new Set(['scene', ...walls.map(w => 'paint:' + w.id), ...allLayers().map(l => 'img:' + l.id)]);
      for (const k of await kvKeys()) if (!keep.has(k)) await kvDel(k);
    }
    if (did) saveNote(`Saved in this browser at ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}. It comes back when you reopen the page.`);
  } catch (e) { console.error(e); saveNote('This browser is not letting the page save itself. Use "Save project file" to keep your work.'); STORE.db = null; }
  STORE.busy = false;
}

/* ---- project files ---- */
function exportProject(){
  toast('Packing the project…');
  setTimeout(() => {
    const out = { app:'spraylab', v:1, scene:sceneState(), paint:{}, images:{} };
    for (const W of walls){ const c = wallPaintCanvas(W); if (c) out.paint[W.id] = c.toDataURL('image/png'); }
    for (const L of allLayers()) out.images[L.id] = layerCanvas(L).toDataURL('image/png');
    saveBlob(new Blob([JSON.stringify(out)], {type:'application/json'}), 'spray-project.json');
  }, 30);
}
async function importProject(file){
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('That file is not a Spray project'); return; }
  if (!data || data.app !== 'spraylab' || !data.scene || !Array.isArray(data.scene.walls)){ toast('That file is not a Spray project'); return; }
  const pick = map => async id => { const s = map && map[id]; return (typeof s === 'string' && s.startsWith('data:image/')) ? loadImg(s) : null; };
  STORE.busy = true; $('#loadMsg').textContent = 'Opening the project…'; $('#loading').hidden = false;
  await new Promise(r => setTimeout(r, 30));
  try {
    disposeAll();
    if (!(await applyProject(data.scene, pick(data.paint), pick(data.images)))) await defaultYard();
  } catch (e) { console.error(e); if (!walls.length) await defaultYard(); }
  walls.forEach(w => markDirty(w)); allLayers().forEach(l => l.saved = false);
  $('#loading').hidden = true; STORE.busy = false; sceneChanged(true); goHome(false); toast('Project opened');
}
async function newYard(){
  STORE.busy = true; disposeAll(); await defaultYard();
  walls.forEach(w => markDirty(w)); allLayers().forEach(l => l.saved = false);
  STORE.busy = false; sceneChanged(true); goHome(false); toast('Fresh yard');
}

/* ---- pick a colour off the wall ---- */
const pickRT = new THREE.WebGLRenderTarget(1, 1, {format:THREE.RGBAFormat, type:THREE.UnsignedByteType, depthBuffer:false, stencilBuffer:false, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, generateMipmaps:false});
const pickMat = new THREE.ShaderMaterial({ uniforms:{ src:{value:null}, at:{value:new THREE.Vector2()} },
  vertexShader:'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader:'uniform sampler2D src; uniform vec2 at; void main(){ gl_FragColor = texture2D(src, at); }',
  depthTest:false, depthWrite:false, blending:THREE.NoBlending });
const pickScene = new THREE.Scene(); { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pickMat); q.frustumCulled = false; pickScene.add(q); }
function pickColor(){
  const h = hitWalls(null, true); if (!h){ toast('Point at a wall to pick a colour'); return; }
  const W = h.wall; flushAll();
  pickMat.uniforms.src.value = W.rt.texture; pickMat.uniforms.at.value.set(h.u / W.w, h.v / W.h);
  renderer.setRenderTarget(pickRT); renderer.render(pickScene, quadCam); renderer.setRenderTarget(null);
  const px = new Uint8Array(4); renderer.readRenderTargetPixels(pickRT, 0, 0, 1, 1, px);
  let c;
  if (px[3] > 70){ const k = 255 / px[3]; c = hex(px[0]*k, px[1]*k, px[2]*k); }
  else { const tile = W.matTex.canvas, N = tile.width, fr = v => ((v % 1) + 1) % 1;
    const d = tile.getContext('2d').getImageData(Math.floor(fr((h.u + W.tileOff.x) / W.def.tileM) * N), Math.floor((1 - fr((h.v + W.tileOff.y) / W.def.tileM)) * N) % N, 1, 1).data; c = hex(d[0], d[1], d[2]); }
  setColor(c, 'Picked'); toast(`Picked ${c.toUpperCase()}`);
}
