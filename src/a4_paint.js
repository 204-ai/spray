/* ================================================================
   Tools: spray caps and paint markers
   ================================================================ */
// width = r0 + k·distance; flow = coverage in m²/s at full pressure (NY Fat ≈ 4–6 cm at 10 cm)
const CAPS = [
  {id:'needle', name:'Needle',     note:'Super skinny. Hairlines and highlights.',      r0:.0010, k:.032, flow:.0040, drop:.00055, mist:.74, spit:.05, loud:.5,  tone:8200, dripW:.0020},
  {id:'skinny', name:'Pro Skinny', note:'Clean outlines. The default cap for lines.',   r0:.0018, k:.058, flow:.0085, drop:.00065, mist:.70, spit:.05, loud:.65, tone:7300, dripW:.0028},
  {id:'stock',  name:'Stock',      note:'Factory cap. Soft edge, medium width.',         r0:.0030, k:.115, flow:.0140, drop:.00085, mist:.58, spit:.10, loud:.72, tone:6300, dripW:.0034},
  {id:'soft',   name:'Soft Fat',   note:'Velvety fades and blends, low splatter.',       r0:.0050, k:.200, flow:.0200, drop:.00070, mist:.84, spit:.03, loud:.78, tone:5600, dripW:.0040},
  {id:'nyfat',  name:'NY Fat',     note:'4–6 cm fill stroke at 10 cm. Fast coverage.',   r0:.0070, k:.260, flow:.0340, drop:.00110, mist:.62, spit:.12, loud:.88, tone:4900, dripW:.0050},
  {id:'astro',  name:'Astro Fat',  note:'Widest spray. Backgrounds and big fills.',      r0:.0120, k:.440, flow:.0720, drop:.00130, mist:.60, spit:.15, loud:1.0, tone:4100, dripW:.0062},
  {id:'fan',    name:'Flat Fan',   note:'Calligraphy cap. Q / E rotates the fan.',       r0:.0040, k:.230, flow:.0250, drop:.00100, mist:.64, spit:.08, loud:.85, tone:5200, dripW:.0045, aspect:.16},
  {id:'splat',  name:'Splatter',   note:'Low-pressure spitter. Big speckles and dots.',  r0:.0040, k:.180, flow:.0130, drop:.00240, mist:.18, spit:1.2, loud:.6,  tone:3600, dripW:.0040},
];
// acrylic paint markers: tip width, shape, ink used per metre
const MARKERS = [
  {id:'pc1',  name:'0.7 mm',   note:'Extra-fine bullet tip. Signatures and tiny details.', w:.0008, tip:'round',  use:.10, body:.0075},
  {id:'pc3',  name:'1.3 mm',   note:'Fine bullet tip. Clean detail lines.',                w:.0013, tip:'round',  use:.12, body:.0075},
  {id:'pc5',  name:'2.5 mm',   note:'Medium bullet. The all-round marker.',               w:.0025, tip:'round',  use:.16, body:.0085},
  {id:'pc8',  name:'8 mm',     note:'Broad chisel. Q / E turns the tip.',                 w:.008,  tip:'chisel', use:.28, body:.011, thick:.003},
  {id:'pc17', name:'15 mm',    note:'Extra-broad chisel for fills and tags.',             w:.015,  tip:'chisel', use:.42, body:.0135, thick:.005},
  {id:'pcj',  name:'18 mm',    note:'Jumbo round nib. Bold flat fills.',                   w:.018,  tip:'round',  use:.5,  body:.015},
];
const PALETTE = [
  ['Signal White','#f4f4ef'],['Chrome','#b9bcc3'],['Concrete','#8a8d92'],['Shadow','#46494f'],['Blackbook','#121214'],['Lemon','#ffec4d'],['Sun Yellow','#ffc300'],['Tangerine','#ff8a1c'],['Blood Orange','#ff4d1f'],
  ['Fire Red','#e3121b'],['Ruby','#9e0f2b'],['Bubblegum','#ff7ab8'],['Hot Magenta','#e6007e'],['Neon Pink','#ff2fa8'],['Violet','#7b2dbd'],['Royal Purple','#3e1f8c'],['Lilac','#c9b3ff'],['Ultramarine','#1d3fbb'],
  ['Sky','#3aa6ff'],['Ice','#a9e4ff'],['Electric Blue','#00d8ff'],['Teal','#00877a'],['Mint','#7df2b5'],['Neon Green','#39ff14'],['Lime','#9be22d'],['Leaf','#2fa335'],['Forest','#155c2b'],
  ['Olive','#6d6b2a'],['Sand','#d9c28f'],['Peach','#ffc7a8'],['Skin','#e9b48f'],['Caramel','#c07a3e'],['Rust','#a3471c'],['Brown','#6b3b1f'],['Chocolate','#3a2216'],['Neon Orange','#ff6a00'],
];

const S = { tool:'spray', cap:1, marker:2, hex:'#ff2fa8', colorName:'Neon Pink', dist:.12, flow:1, erase:false, drips:true, dripAmt:.3, aim:true, sound:true, volume:.55, fan:0, mode:'paint' };

class Painter {
  constructor(name){
    this.name = name; this.wall = null; this.u = 0; this.v = 0; this.d = .12; this.prev = null; this.spraying = false;
    this.tool = 'spray'; this.cap = 1; this.marker = 2; this.hex = '#ff2fa8'; this.rgb = hexToRgb(this.hex); this.fan = 0; this.flow = 1;
    this.pressure = 1; this.ink = 1; this.erase = false; this.mistAcc = 0; this.avatar = null; this.visible = false; this.vel = new THREE.Vector2(); this.shake = 0;
    this.lastWorld = new THREE.Vector3();
  }
  setColor(h){ this.hex = h; this.rgb = hexToRgb(h); if (this.avatar) this.avatar.setColor(h); }
  syncFromS(){ this.tool = S.tool; this.cap = S.cap; this.marker = S.marker; if (this.hex !== S.hex) this.setColor(S.hex); this.fan = S.fan; this.flow = S.flow; this.erase = S.erase; this.d = S.tool === 'marker' ? 0 : this.d; }
}

/* ---------------- spray ---------------- */
function emit(P, wall, px, py, d, m, dt){
  const cap = CAPS[P.cap], erase = P.erase, B = erase ? eraseB : paintB, col = P.rgb, ppm = wall.ppm;
  const R = (cap.r0 + cap.k * d) * ppm, sig = Math.max(.6, R * .5);
  const aspect = cap.aspect || 1, ang = cap.aspect ? P.fan : 0, ca = Math.cos(ang), sa = Math.sin(ang);
  const baseDr = Math.max(.45, cap.drop * ppm);
  const dryness = clamp((d - .06) / .3, 0, 1);
  let mistM = m * cap.mist, dropM = m - mistM;
  const per = Math.PI * baseDr * baseDr * .85;
  let n = dropM / per; const BUDGET = 700;
  if (n > BUDGET){ mistM += (n - BUDGET) * per; n = BUDGET; }
  if (erase){ mistM = m; n = 0; }
  B.push(wall, px, py, sig, 0, 1, aspect, ang, col[0], col[1], col[2], Math.min(1, mistM / (2 * Math.PI * sig * sig * aspect)));
  n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  for (let i=0;i<n;i++){
    const over = Math.random() < .14 + dryness*.12, ss = sig * (over ? 2.3 + dryness : 1.12);
    const gx = gauss()*ss, gy = gauss()*ss*aspect, x = px + ca*gx - sa*gy, y = py + sa*gx + ca*gy;
    const r = baseDr * (.5 + Math.random()*.95) * (over ? .7 : 1) * (1 - dryness*.25), a = over ? .55 : .88;
    if (r < 1.4){ const sg = Math.max(.5, r*.62); B.push(wall, x, y, sg, 0, 1,1,0, col[0],col[1],col[2], Math.min(1, a*r*r/(2*sg*sg))); }
    else B.push(wall, x, y, r, 1, 1,1,0, col[0],col[1],col[2], a);
  }
  if (!erase){
    const spitRate = cap.spit + (1 - P.pressure) * 2.4;
    if (Math.random() < spitRate * dt * 6){
      const gx = gauss()*sig*1.3, gy = gauss()*sig*1.3*aspect, r = baseDr * (2 + Math.random()*3.5) * (cap.id === 'splat' ? 1.4 : 1);
      B.push(wall, px + ca*gx - sa*gy, py + sa*gx + ca*gy, r, 1, 1,1,0, col[0],col[1],col[2], .95);
    }
  }
  addWet(wall, px, py, sig * Math.sqrt(aspect), m, col, erase, cap.dripW);
}

/* ---------------- wetness & drips ---------------- */
// coats of wet paint a spot holds before it runs: 'Light' only drips when you hold the can still up close
const dripT = () => (16 - 11 * S.dripAmt) * (AP.running ? 1.4 : 1);
function addWet(wall, x, y, sig, m, col, erase, dripW){
  const CPX = CELL * wall.ppm, cx = x / CPX, cy = y / CPX, rc = sig * 2.2 / CPX, GW = wall.GW, GH = wall.GH;
  const dep = (i, amt) => {
    if (erase){ wall.wet[i] *= Math.max(0, 1 - amt*.6); return; }
    const w0 = wall.wet[i], t = amt / (w0 + amt + 1e-6);
    wall.wetR[i] += (col[0]-wall.wetR[i])*t; wall.wetG[i] += (col[1]-wall.wetG[i])*t; wall.wetB[i] += (col[2]-wall.wetB[i])*t;
    wall.wet[i] = w0 + amt; wall.wetActive = true; wall.dripW = dripW;
  };
  if (rc < .75){ const gx = cx|0, gy = cy|0; if (gx<0||gy<0||gx>=GW||gy>=GH) return; dep(gy*GW+gx, m / (Math.max(sig*2.5, 1) * CPX)); return; }
  const x0 = Math.max(0, Math.floor(cx-rc)), x1 = Math.min(GW-1, Math.floor(cx+rc)), y0 = Math.max(0, Math.floor(cy-rc)), y1 = Math.min(GH-1, Math.floor(cy+rc));
  const s2 = 2 * (sig/CPX) * (sig/CPX); let sum = 0;
  for (let gy=y0; gy<=y1; gy++) for (let gx=x0; gx<=x1; gx++){ const dx=gx+.5-cx, dy=gy+.5-cy; sum += Math.exp(-(dx*dx+dy*dy)/s2); }
  if (sum <= 0) return;
  const k = m / (CPX*CPX) / sum;
  for (let gy=y0; gy<=y1; gy++) for (let gx=x0; gx<=x1; gx++){ const dx=gx+.5-cx, dy=gy+.5-cy; dep(gy*GW+gx, k*Math.exp(-(dx*dx+dy*dy)/s2)); }
}
function updateWet(wall, dt){
  if (!wall.wetActive) return;
  const decay = Math.exp(-dt / 4.2), T = dripT(), CPX = CELL * wall.ppm, W = wall.wet, D = wall.wetData; let any = false;
  for (let i=0;i<W.length;i++){
    let w = W[i]; if (w < .003){ if (w){ W[i] = 0; D[i*4] = 0; } continue; }
    any = true;
    if (S.drips && w > T && wall.drips.length < 120 && Math.random() < Math.min(.4, dt*(.15 + .8*S.dripAmt))){
      const gx = i % wall.GW, gy = (i/wall.GW)|0, vol = w - T*.55;
      wall.drips.push({ x:(gx+Math.random())*CPX, y:gy*CPX + Math.random()*CPX*.5, vol, vol0:vol, w:Math.max(1.4, (wall.dripW||.004)*wall.ppm*(.75+Math.random()*.5)),
        r:wall.wetR[i], g:wall.wetG[i], b:wall.wetB[i], age:0, seed:Math.random()*100 });
      w = T*.55;
      for (let o = i-5; o <= i+5; o++) if (o !== i && o >= 0 && o < W.length && W[o] > T*.6) W[o] = T*.6;
    }
    w *= decay; W[i] = w; D[i*4] = Math.min(255, w/1.6*255);
  }
  wall.wetActive = any; wall.wetTex.needsUpdate = true;
}
function updateDrips(wall, dt){
  const ppm = wall.ppm, CPX = CELL * ppm;
  for (let k = wall.drips.length-1; k >= 0; k--){
    const d = wall.drips[k]; d.age += dt;
    const speed = (.012 + .1 * d.vol/(d.vol+3)) * (.55 + .45*Math.pow(Math.sin(d.age*1.9 + d.seed), 2));
    const dy = speed * dt * ppm, w = d.w * (.5 + .5*Math.min(1, Math.sqrt(Math.max(0,d.vol)/d.vol0)));
    const steps = Math.max(1, Math.ceil(dy / .6)), dxw = (vnoise(d.age*1.3, d.seed, 9) - .5) * .0018 * ppm * dt;
    for (let s=0;s<steps;s++){ d.y -= dy/steps; d.x += dxw/steps; paintB.push(wall, d.x, d.y, w*.5, 1, 1,1,0, d.r,d.g,d.b, .94); }
    d.vol -= (dy / ppm) * (22 - 10 * S.dripAmt) + dt * .4;
    const gx = (d.x / CPX)|0, gy = (d.y / CPX)|0;
    if (gx>=0 && gy>=0 && gx<wall.GW && gy<wall.GH){ const i = gy*wall.GW+gx; if (wall.wet[i] > .6){ const take = wall.wet[i]*.3; d.vol += take*.6; wall.wet[i] -= take; } }
    if (d.vol <= 0 || d.y < 2){ paintB.push(wall, d.x, d.y - w*.25, w*.68, 1, 1,1.3,0, d.r,d.g,d.b, .96); wall.drips.splice(k,1); }
  }
}

/* ---------------- per-painter step ---------------- */
function painterTick(P, dt, spraying){
  const cap = CAPS[P.cap];
  if (spraying && P.tool === 'spray') P.pressure = Math.max(.5, P.pressure - dt * .035 * Math.min(2, cap.flow/.02 + .3));
  else P.pressure = Math.min(1, P.pressure + dt * .06);
  if (P.tool === 'marker' && !spraying) P.ink = Math.min(1, P.ink + dt * .02);
  P.spraying = spraying && !!P.wall;
  if (!P.spraying || dt <= 0){ P.prev = null; return; }
  const W = P.wall, ppm = W.ppm; markDirty(W);
  const cur = { x:P.u * ppm, y:P.v * ppm, d:P.d, wall:W };
  const prev = (P.prev && P.prev.wall === W) ? P.prev : cur;
  const dx = cur.x - prev.x, dy = cur.y - prev.y, len = Math.hypot(dx, dy);
  if (P.tool === 'marker'){
    const M = MARKERS[P.marker], wpx = Math.max(.7, M.w * ppm), steps = Math.min(600, Math.max(1, Math.ceil(len / Math.max(.3, wpx * .22))));
    const speed = len / ppm / dt, B = P.erase ? eraseB : paintB, c = P.rgb;
    P.ink = Math.max(0, P.ink - (len / ppm) * M.use);
    const skip = clamp(W.def.tooth * .34 + (1 - P.ink) * .55 + clamp((speed - .9) * .2, 0, .25), 0, .9);
    const sy = M.tip === 'chisel' ? M.thick / M.w : 1, kind = M.tip === 'chisel' ? 3 : 2, r = wpx / 2;
    for (let i = (P.prev && P.prev.wall === W) ? 1 : 0; i <= steps; i++){ const t = i / steps; B.push(W, prev.x + dx*t, prev.y + dy*t, r, kind, 1, sy, P.fan, c[0], c[1], c[2], .97, skip); }
  } else {
    const sig = Math.max(.6, (cap.r0 + cap.k*cur.d) * ppm * .5);
    const steps = Math.min(240, Math.max(1, Math.ceil(len / Math.max(.7, sig*.3))));
    const m = cap.flow * ppm * ppm * P.flow * (.55 + .45*P.pressure) * dt;
    for (let i=1;i<=steps;i++){ const t = i/steps; emit(P, W, prev.x + dx*t, prev.y + dy*t, prev.d + (cur.d - prev.d)*t, m/steps, dt/steps); }
    P.mistAcc += clamp(cap.flow * 1600, 8, 60) * 60 * dt;
    const nm = Math.min(200, P.mistAcc|0); P.mistAcc -= nm; if (P.mistAcc > 200) P.mistAcc = 0;
    if (nm) spawnMist(P, nm);
  }
  P.prev = cur;
}

/* ---------------- mist particles (world space) ---------------- */
const MIST_N = 2400;
const mistPos = new Float32Array(MIST_N*3), mistVel = new Float32Array(MIST_N*3), mistLife = new Float32Array(MIST_N), mistCol = new Float32Array(MIST_N*3), mistHit = new Float32Array(MIST_N);
const mistGeo = new THREE.BufferGeometry();
mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos,3).setUsage(THREE.DynamicDrawUsage));
mistGeo.setAttribute('aLife', new THREE.BufferAttribute(mistLife,1).setUsage(THREE.DynamicDrawUsage));
mistGeo.setAttribute('aCol', new THREE.BufferAttribute(mistCol,3).setUsage(THREE.DynamicDrawUsage));
const mistMat = new THREE.ShaderMaterial({ uniforms:{ scale:{value:400} }, transparent:true, depthWrite:false,
  vertexShader:'attribute float aLife; attribute vec3 aCol; varying float vL; varying vec3 vC; uniform float scale; void main(){ vL = aLife; vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(0.005 * scale / -mv.z, 1.0, 24.0); gl_Position = projectionMatrix * mv; }',
  fragmentShader:'varying float vL; varying vec3 vC; void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vL * 0.3; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }' });
const mist = new THREE.Points(mistGeo, mistMat); mist.frustumCulled = false; scene.add(mist);
let mistHead = 0;
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3();
function spawnMist(P, n){
  const W = P.wall, cap = CAPS[P.cap], d = Math.max(P.d, .02), spread = (cap.r0 + cap.k * d) / d * .55;
  W.toWorld(P.u, P.v, d, _o); _n.copy(W.normal); _t.set(Math.cos(W.rot), 0, -Math.sin(W.rot));
  const ang = cap.aspect ? P.fan : 0, cs = Math.cos(ang), sn = Math.sin(ang), c = P.rgb;
  for (let i=0;i<n;i++){
    const j = mistHead; mistHead = (mistHead + 1) % MIST_N;
    mistPos[j*3] = _o.x; mistPos[j*3+1] = _o.y; mistPos[j*3+2] = _o.z;
    const sp = 2.5 + Math.random()*2.5, ax = gauss()*spread, ay = gauss()*spread*(cap.aspect||1), lx = cs*ax - sn*ay, ly = sn*ax + cs*ay;
    mistVel[j*3] = (_t.x*lx - _n.x)*sp; mistVel[j*3+1] = ly*sp; mistVel[j*3+2] = (_t.z*lx - _n.z)*sp;
    mistLife[j] = .8 + Math.random()*.2; mistHit[j] = d / sp;
    mistCol[j*3] = c[0]; mistCol[j*3+1] = c[1]; mistCol[j*3+2] = c[2];
  }
}
function updateMist(dt){
  let any = false;
  for (let j=0;j<MIST_N;j++){
    if (mistLife[j] <= 0) continue; any = true;
    if (mistHit[j] > 0){ mistHit[j] -= dt;
      if (mistHit[j] <= 0){ mistVel[j*3] = gauss()*.25; mistVel[j*3+1] = gauss()*.25 + .05; mistVel[j*3+2] = gauss()*.25; mistLife[j] = Math.min(mistLife[j], .35); } }
    mistPos[j*3] += mistVel[j*3]*dt; mistPos[j*3+1] += mistVel[j*3+1]*dt; mistPos[j*3+2] += mistVel[j*3+2]*dt;
    mistLife[j] -= dt * (mistHit[j] <= 0 ? 1.4 : .9); if (mistLife[j] < 0) mistLife[j] = 0;
  }
  if (any){ for (const k of ['position','aLife','aCol']) mistGeo.attributes[k].needsUpdate = true; }
}

/* ================================================================
   Avatars: the supplied spray can model, and a paint marker
   ================================================================ */
let canGeo = null, canMatBase = null;
function loadCanAssets(){
  const bin = Uint8Array.from(atob(CAN_MODEL_B64), c => c.charCodeAt(0)).buffer, M = CAN_MODEL, n = M.n;
  let o = 0; const Pq = new Uint16Array(bin, o, n*3); o += n*6; const Nq = new Int16Array(bin, o, n*3); o += n*6; const Uq = new Uint16Array(bin, o, n*2); o += n*4;
  const I = M.i32 ? new Uint32Array(bin, o, M.t*3) : new Uint16Array(bin, o, M.t*3);
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2);
  for (let i=0;i<n;i++){ for (let k=0;k<3;k++){ pos[i*3+k] = M.lo[k] + Pq[i*3+k]/65535*(M.hi[k]-M.lo[k]); nor[i*3+k] = Nq[i*3+k]/32767; } uv[i*2] = Uq[i*2]/65535; uv[i*2+1] = Uq[i*2+1]/65535; }
  canGeo = new THREE.BufferGeometry();
  canGeo.setAttribute('position', new THREE.BufferAttribute(pos,3)); canGeo.setAttribute('normal', new THREE.BufferAttribute(nor,3)); canGeo.setAttribute('uv', new THREE.BufferAttribute(uv,2));
  canGeo.setIndex(new THREE.BufferAttribute(I,1)); canGeo.computeBoundingSphere();
  const tex = new THREE.TextureLoader().load(CAN_TEX); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = ANISO;
  canMatBase = new THREE.MeshStandardMaterial({map:tex, metalness:.45, roughness:.32});
}
const CAN_NOZ = new THREE.Vector3(0, .185, -.0175);   // nozzle in avatar space (model turned to face -z)
const penWhite = new THREE.MeshStandardMaterial({color:0xf2f2ee, roughness:.4});
const penTipMat = new THREE.MeshStandardMaterial({color:0xeeeeea, roughness:.9});
function makeAvatar(label){
  const g = new THREE.Group(); scene.add(g);
  const can = new THREE.Mesh(canGeo, canMatBase); can.rotation.y = Math.PI; can.castShadow = true; g.add(can);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.0345, .0028, 8, 40), new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:.4})); ring.rotation.x = Math.PI/2; ring.position.y = .012; can.add(ring);
  // marker: tip at the origin, body running back toward the painter
  const pen = new THREE.Group(); g.add(pen);
  const body = new THREE.Mesh(sharedGeo.cyl, penWhite), cap = new THREE.Mesh(sharedGeo.cyl, new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:.35}));
  const collar = new THREE.Mesh(sharedGeo.cyl, new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:.35}));
  const tip = new THREE.Mesh(sharedGeo.box, penTipMat);
  for (const m of [body, cap, collar]) m.rotation.x = Math.PI/2;
  pen.add(body, cap, collar, tip);
  let sprite = null;
  if (label){
    const c = mk(256, 64), x = c.getContext('2d'); x.font = '600 30px Barlow, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(14,15,19,.82)'; const w = Math.min(250, x.measureText(label).width + 30); x.fillRect(128 - w/2, 8, w, 48); x.fillStyle = '#ffd21f'; x.fillText(label, 128, 33);
    sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), depthTest:false, transparent:true})); sprite.scale.set(.24, .06, 1); sprite.position.y = .27; sprite.renderOrder = 10; g.add(sprite);
  }
  const av = {
    g, can, pen, sprite,
    setColor(h){ ring.material.color.set(h); cap.material.color.set(h); collar.material.color.set(h); },
    setMarker(M){
      const r = M.body, L = .14;
      body.scale.set(r, L, r); body.position.set(0, 0, .03 + L/2);
      cap.scale.set(r*.98, .022, r*.98); cap.position.set(0, 0, .03 + L + .011);
      collar.scale.set(r*.75, .012, r*.75); collar.position.set(0, 0, .024);
      tip.scale.set(M.tip === 'chisel' ? M.w : Math.max(M.w, .0016), M.tip === 'chisel' ? (M.thick || .003) : Math.max(M.w, .0016), .022); tip.position.set(0, 0, .011);
    },
    dispose(){ scene.remove(g); }
  };
  av.setMarker(MARKERS[2]);
  return av;
}
const _q = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function placeAvatar(P, dt){
  const av = P.avatar; if (!av) return;
  if (!P.wall || !P.visible){ av.g.visible = false; return; }
  av.g.visible = true;
  const W = P.wall, marker = P.tool === 'marker';
  av.can.visible = !marker; av.pen.visible = marker;
  P.shake = Math.max(0, P.shake - dt);
  const sh = P.shake > 0 ? Math.sin(performance.now()*.06) * P.shake * .05 : 0;
  if (marker){
    if (av._m !== P.marker){ av.setMarker(MARKERS[P.marker]); av._m = P.marker; }
    av.g.rotation.set(0, W.rot, 0); av.g.updateMatrixWorld();
    av.pen.rotation.set(-.42 + clamp(P.vel.y*.04, -.2, .2), 0, P.fan);
    W.toWorld(P.u, P.v, .0008, _p); av.g.position.copy(_p);
  } else {
    _e.set(clamp(P.vel.y*.08, -.3, .3) - .08, W.rot, clamp(-P.vel.x*.1, -.35, .35) + sh*2, 'YXZ');
    av.g.rotation.copy(_e); av.g.updateMatrixWorld();
    W.toWorld(P.u, P.v, P.d, _p);
    _q.copy(CAN_NOZ).applyEuler(_e);
    av.g.position.copy(_p).sub(_q); av.g.position.y += sh;
  }
}
