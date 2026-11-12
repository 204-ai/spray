/* ================================================================
   Camera: orbit / pan / zoom / walk
   ================================================================ */
const cam = { t:new THREE.Vector3(0, 1.5, 0), az:0, pol:.06, r:5.5, goal:null };
function updateCamera(){
  const cp = Math.cos(cam.pol);
  camera.position.set(cam.t.x + cam.r*Math.sin(cam.az)*cp, cam.t.y + cam.r*Math.sin(cam.pol), cam.t.z + cam.r*Math.cos(cam.az)*cp);
  if (camera.position.y < .12) camera.position.y = .12;
  camera.lookAt(cam.t);
  torch.position.copy(camera.position).add(new THREE.Vector3(.25, -.15, 0)); LU.torchPos.value.copy(torch.position);
  sun.position.copy(cam.t).addScaledVector(LU.sunDir.value, 50); sun.target.position.copy(cam.t); sun.target.updateMatrixWorld();
}
function flyTo(point, az, pol, r, smoothMove){
  const g = { t:point.clone(), az, pol, r };
  let d = g.az - cam.az; d = Math.atan2(Math.sin(d), Math.cos(d)); g.az = cam.az + d;
  if (smoothMove === false){ cam.t.copy(g.t); cam.az = g.az; cam.pol = g.pol; cam.r = g.r; cam.goal = null; updateCamera(); }
  else cam.goal = g;
}
function camStep(dt){
  if (cam.goal){ const k = 1 - Math.exp(-dt*5), g = cam.goal;
    cam.t.lerp(g.t, k); cam.az += (g.az - cam.az)*k; cam.pol += (g.pol - cam.pol)*k; cam.r += (g.r - cam.r)*k;
    if (cam.t.distanceTo(g.t) < .005 && Math.abs(g.r - cam.r) < .005) cam.goal = null; }
  const sp = (keys.shift ? 3 : 1.2) * dt * Math.max(1.2, cam.r * .6);
  const fx = -Math.sin(cam.az), fz = -Math.cos(cam.az), rx = Math.cos(cam.az), rz = -Math.sin(cam.az);
  let mx = 0, mz = 0;
  if (keys.w || keys.arrowup){ mx += fx; mz += fz; } if (keys.s || keys.arrowdown){ mx -= fx; mz -= fz; }
  if (keys.a || keys.arrowleft){ mx -= rx; mz -= rz; } if (keys.d || keys.arrowright){ mx += rx; mz += rz; }
  if (mx || mz){ cam.goal = null; cam.t.x = clamp(cam.t.x + mx*sp, -90, 90); cam.t.z = clamp(cam.t.z + mz*sp, -90, 90); }
  updateCamera();
}

/* ================================================================
   Pointer + keyboard
   ================================================================ */
const P = { ndc:new THREE.Vector2(0, 0), over:false, down:false, space:false, nav:null, lx:0, ly:0, strokeWalls:new Set() };
const keys = {};
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0), _v = new THREE.Vector3();
function setNdc(e){ const r = canvas.getBoundingClientRect(); P.ndc.set(((e.clientX - r.left)/r.width)*2-1, -((e.clientY - r.top)/r.height)*2+1); P.over = true; }
function hitWalls(ndc, faceOnly){
  ray.setFromCamera(ndc || P.ndc, camera);
  const objs = []; for (const w of walls){ if (faceOnly) objs.push(w.face); else for (const o of w.meshes) objs.push(o); }
  const hits = ray.intersectObjects(objs, false);
  for (const h of hits){ const w = h.object.userData.wall; if (!w) continue;
    if (h.object === w.face){ const l = w.toLocal(h.point); return { wall:w, u:clamp(l.u, 0, w.w), v:clamp(l.v, 0, w.h), point:h.point, face:true }; }
    if (!faceOnly) return { wall:w, point:h.point, face:false }; }
  return null;
}
function hitGround(ndc){ ray.setFromCamera(ndc || P.ndc, camera); return ray.ray.intersectPlane(groundPlane, _v) ? _v.clone() : null; }

const me = new Painter('You');
let drag = null;   // build / arrange drags
const TOUCH = new Map();   // active fingers; two fingers look around and zoom
canvas.addEventListener('pointerdown', e => {
  initAudio(); canvas.setPointerCapture(e.pointerId); setNdc(e);
  if (e.pointerType === 'touch'){ TOUCH.set(e.pointerId, {x:e.clientX, y:e.clientY}); if (TOUCH.size >= 2){ P.down = false; drag = null; TOUCH.g = null; cam.goal = null; return; } }
  if (e.button === 1 || e.button === 2){ e.preventDefault(); P.nav = e.shiftKey ? 'pan' : 'orbit'; P.lx = e.clientX; P.ly = e.clientY; cam.goal = null; return; }
  if (e.button !== 0) return;
  if (e.altKey && S.mode === 'paint'){ pickColor(); return; }
  if (S.mode === 'build'){
    const h = hitWalls(null, false);
    if (h){ selectWall(h.wall); const g = hitGround(); if (g) drag = { kind:'wall', wall:h.wall, off:new THREE.Vector3(h.wall.x - g.x, 0, h.wall.z - g.z) }; }
    else selectWall(null);
    return;
  }
  if (S.mode === 'arrange'){ arrangeDown(); return; }
  if (AP.running){ toast('Auto paint is running. Press Esc or Stop to take over.'); return; }
  P.down = true; P.strokeWalls.clear();
});
canvas.addEventListener('pointermove', e => {
  setNdc(e);
  if (e.pointerType === 'touch' && TOUCH.has(e.pointerId)){
    const t = TOUCH.get(e.pointerId); t.x = e.clientX; t.y = e.clientY;
    if (TOUCH.size >= 2){ const [a, b] = [...TOUCH.values()], dd = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x)/2, my = (a.y + b.y)/2, g = TOUCH.g;
      if (g){ cam.r = clamp(cam.r * g.d / Math.max(20, dd), .3, 80); cam.az -= (mx - g.mx)*.005; cam.pol = clamp(cam.pol + (my - g.my)*.004, -.25, 1.45); }
      TOUCH.g = {d:Math.max(20, dd), mx, my}; return; }
  }
  if (P.nav){
    const dx = e.clientX - P.lx, dy = e.clientY - P.ly; P.lx = e.clientX; P.ly = e.clientY;
    if (P.nav === 'orbit'){ cam.az -= dx*.005; cam.pol = clamp(cam.pol + dy*.004, -.25, 1.45); }
    else { const s = cam.r * .0016, rx = Math.cos(cam.az), rz = -Math.sin(cam.az);
      cam.t.x -= dx*s*rx; cam.t.z -= dx*s*rz; cam.t.y = clamp(cam.t.y + dy*s, .1, 12); }
    return;
  }
  if (drag && drag.kind === 'wall'){ const g = hitGround(); if (g){ drag.wall.x = clamp(g.x + drag.off.x, -60, 60); drag.wall.z = clamp(g.z + drag.off.z, -60, 60); drag.wall.place(); sceneChanged(); } return; }
  if (drag) arrangeMove();
});
function endPointer(e){
  if (e.pointerType === 'touch'){ TOUCH.delete(e.pointerId); TOUCH.g = null; P.over = false; }
  if (e.button === 1 || e.button === 2 || e.type === 'pointercancel') P.nav = null;
  if (e.button === 0 || e.type === 'pointercancel'){ P.down = false; if (drag){ if (drag.kind === 'wall') sceneChanged(true); drag = null; } }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { P.over = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('auxclick', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY*16 : e.deltaY;
  if (e.altKey){ if (S.tool === 'spray') setDist(S.dist + dy * .00018); return; }
  if (S.mode === 'arrange' && G.sel){ const h = hitWalls(null, true); if (h && h.wall === G.sel.wall && insideLayer(G.sel, h.u, h.v)){ G.sel.hgt = clamp(G.sel.hgt * Math.exp(-dy*.0012), .05, 20); drawWallGuide(G.sel.wall); syncLayerUI(); return; } }
  // zoom toward what is under the cursor
  const f = Math.exp(dy * .0012), nr = clamp(cam.r * f, .3, 80);
  const h = hitWalls(null, false), target = h ? h.point : hitGround();
  if (target && f < 1){ cam.t.lerp(target, 1 - nr / cam.r); }
  cam.r = nr; cam.goal = null;
}, {passive:false});

/* ---- arrange (image layers) ---- */
function insideLayer(L, u, v){ const [x, y] = L.local(u, v); return Math.abs(x) <= L.wid/2 && Math.abs(y) <= L.hgt/2; }
function arrangeDown(){
  const h = hitWalls(null, true); if (!h){ selectLayer(null); return; }
  const tol = Math.max(.035, cam.r * .012), L = G.sel;
  if (L && L.wall === h.wall){
    const H = layerHandles(L);
    if (Math.hypot(h.u - H.rot[0], h.v - H.rot[1]) < tol*1.3){ drag = { kind:'rot', L, a0:Math.atan2(h.v - L.cy, h.u - L.cx), r0:L.rot }; return; }
    for (const c of H.corners) if (Math.hypot(h.u - c[0], h.v - c[1]) < tol*1.3){ drag = { kind:'scale', L, d0:Math.hypot(h.u - L.cx, h.v - L.cy), h0:L.hgt }; return; }
  }
  const hit = [...h.wall.layers].reverse().find(l => insideLayer(l, h.u, h.v));
  if (hit){ selectLayer(hit); drag = { kind:'move', L:hit, ou:hit.cx - h.u, ov:hit.cy - h.v }; }
  else selectLayer(null);
}
function arrangeMove(){
  const h = hitWalls(null, true); if (!h) return; const L = drag.L;
  if (drag.kind === 'move'){
    if (h.wall !== L.wall){ L.moveTo(h.wall); drag.ou = 0; drag.ov = 0; }
    L.cx = h.u + drag.ou; L.cy = h.v + drag.ov;
  } else if (h.wall === L.wall){
    if (drag.kind === 'scale') L.hgt = clamp(drag.h0 * Math.hypot(h.u - L.cx, h.v - L.cy) / Math.max(.01, drag.d0), .05, 20);
    else { let a = drag.r0 + Math.atan2(h.v - L.cy, h.u - L.cx) - drag.a0; const deg = a * 180 / Math.PI; if (keys.shift) a = Math.round(deg / 15) * 15 * Math.PI / 180; L.rot = a; }
  }
  drawWallGuide(L.wall); syncLayerUI();
}

window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if ((tag === 'INPUT' && !['range','color','checkbox'].includes(e.target.type)) || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')){ e.preventDefault(); if (k === 'y' || e.shiftKey) redo(); else undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'escape'){ if (AP.running) apFinish(false); else if (S.mode !== 'paint') setMode('paint'); return; }
  if (k === ' '){ e.preventDefault(); if (!P.space && !AP.running && S.mode === 'paint'){ initAudio(); P.space = true; P.strokeWalls.clear(); } return; }
  keys[k] = true; if (e.shiftKey) keys.shift = true;
  if (k >= '1' && k <= '9'){ const p = PALETTE[+k-1]; setColor(p[1], p[0]); }
  else if (k === '['){ if (S.tool === 'spray') selectCap((S.cap + CAPS.length - 1) % CAPS.length); else selectMarker((S.marker + MARKERS.length - 1) % MARKERS.length); }
  else if (k === ']'){ if (S.tool === 'spray') selectCap((S.cap + 1) % CAPS.length); else selectMarker((S.marker + 1) % MARKERS.length); }
  else if (k === 't'){ setTool(S.tool === 'spray' ? 'marker' : 'spray'); }
  else if (k === 'x'){ setErase(!S.erase); }
  else if (k === 'r'){ shakeCan(); }
  else if (k === 'g'){ setGuideVisible(!G.visible); }
  else if (k === 'm'){ setMode(S.mode === 'arrange' ? 'paint' : 'arrange'); }
  else if (k === 'b'){ setMode(S.mode === 'build' ? 'paint' : 'build'); }
  else if (k === 'p'){ setMode('paint'); }
  else if (k === 'f'){ const h = hitWalls(null, true); const W = h ? h.wall : (selWall || walls[0]); if (W) flyTo(W.toWorld(h ? h.u : W.w/2, h ? h.v : W.h/2, 0), W.rot, .05, h ? 2.2 : clamp(Math.max(W.w/camera.aspect, W.h) * 1.1 / Math.tan(camera.fov*Math.PI/360) / 2 * 1.2, 2, 40)); }
  else if (k === 'h'){ togglePanel(); }
  else if (k === 'home'){ goHome(); }
  else if (k === 'i'){ pickColor(); }
  else if (k === 'delete' || k === 'backspace'){ if (S.mode === 'arrange' && G.sel){ G.sel.remove(); selectLayer(null); renderLayers(); } else if (S.mode === 'build' && selWall){ deleteWall(selWall); } }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (!e.shiftKey) keys.shift = false; if (k === ' ') P.space = false; });
window.addEventListener('blur', () => { P.down = P.space = false; P.nav = null; for (const k in keys) keys[k] = false; });

function heldKeys(dt){
  const rotK = (keys.q ? 1 : 0) - (keys.e ? 1 : 0);
  if (rotK){
    if (S.mode === 'arrange' && G.sel){ G.sel.rot += rotK * dt * 1.2; drawWallGuide(G.sel.wall); syncLayerUI(); }
    else if (S.mode === 'build' && selWall){ selWall.rot += rotK * dt * 1.4; selWall.place(); sceneChanged(); }
    else { S.fan = clamp(S.fan + rotK*dt*1.6, -Math.PI/2, Math.PI/2); syncFan(); }
  }
  if (S.tool === 'spray' && (keys.z || keys.c)) setDist(S.dist + (keys.c ? 1 : -1) * dt * .12);
}

/* mouse painter: follows the cursor on whichever wall it is over */
function mouseTick(dt){
  const spraying = (P.down || P.space) && S.mode === 'paint';
  if (P.over || spraying){
    const h = hitWalls(null, true);
    if (h){
      if (spraying && keys.shift){   // Shift: ruler-straight, locked to horizontal or vertical
        const a = (P.anchor && P.anchor.wall === h.wall) ? P.anchor : (P.anchor = { wall:h.wall, u:me.wall === h.wall ? me.u : h.u, v:me.wall === h.wall ? me.v : h.v, axis:0 });
        const du = h.u - a.u, dv = h.v - a.v; if (!a.axis && Math.hypot(du, dv) > .015) a.axis = Math.abs(du) >= Math.abs(dv) ? 1 : 2;
        if (a.axis === 1) h.v = a.v; else if (a.axis === 2) h.u = a.u; else { h.u = a.u; h.v = a.v; }
      } else P.anchor = null;
      if (spraying && !P.strokeWalls.has(h.wall)){ P.strokeWalls.add(h.wall); pushUndo(h.wall); lastWall = h.wall; }
      if (h.wall !== me.wall){ me.wall = h.wall; me.u = h.u; me.v = h.v; me.prev = null; }
      else { const k = 1 - Math.exp(-dt * 26), ou = me.u, ov = me.v; me.u += (h.u - me.u)*k; me.v += (h.v - me.v)*k;
        me.vel.x += ((me.u - ou)/Math.max(dt, 1e-3) - me.vel.x)*.2; me.vel.y += ((me.v - ov)/Math.max(dt, 1e-3) - me.vel.y)*.2; }
      me.visible = S.mode === 'paint';
    } else me.visible = spraying && !!me.wall;
  } else me.visible = false;
  const td = S.tool === 'marker' ? 0 : S.dist; me.d += (td - me.d) * (1 - Math.exp(-dt*14));
  painterTick(me, dt, spraying && me.visible);
  netSample(me, dt);
  return me.spraying;
}
