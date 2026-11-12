/* ================================================================
   Paintable walls (any number, placed anywhere in the yard)
   ================================================================ */
const WALL_VS = `varying vec2 vUv; varying vec3 vWorld;
  void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WALL_FS = `
uniform sampler2D albedoMap, hMap, paintMap, guideMap, wetMap;
uniform vec2 wallSize, tileOff; uniform float tileM, tTexel, bumpK, specK, toothK, aoK, grime, guideOpacity, sel, groundY, depthM, metalK;
uniform vec3 wallT, wallN;
uniform vec3 sunDir, sunCol, ambSky, ambGround, torchPos, torchCol, fogCol; uniform vec2 fogNF;
uniform vec4 aim; uniform vec2 aimShape; uniform vec4 shadow;
varying vec2 vUv; varying vec3 vWorld;
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
float fb(vec2 p){ return vn(p)*0.5 + vn(p*2.03+7.1)*0.25 + vn(p*4.1+3.3)*0.125 + vn(p*8.3+1.7)*0.0625; }
vec2 tuvOf(vec2 m){ return (m + tileOff) / tileM; }
void main(){
  vec2 m0 = vUv * wallSize, m = m0;
  vec3 Bv = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - vWorld), L = normalize(sunDir);
  vec3 Vt = vec3(dot(V, wallT), V.y, dot(V, wallN)), Lt = vec3(dot(L, wallT), L.y, dot(L, wallN));
  float fd = length(vWorld - cameraPosition);
  float pfade = clamp(1.0 - fd / 16.0, 0.0, 1.0), selfSh = 1.0;
#ifdef POM
  // parallax occlusion: joints, pits and ribs have real depth when you look along the wall
  if (pfade > 0.0 && Vt.z > 0.02){
    vec2 dm = -Vt.xy / max(Vt.z, 0.24) * depthM * pfade / 14.0; vec2 pm = m0;
    float curD = 0.0, dep = 1.0 - texture2D(hMap, tuvOf(pm)).r, prevDep = dep;
    for (int i = 0; i < 14; i++){ if (curD >= dep) break; pm += dm; curD += 1.0 / 14.0; prevDep = dep; dep = 1.0 - texture2D(hMap, tuvOf(pm)).r; }
    float after = dep - curD, before = prevDep - (curD - 1.0 / 14.0);
    pm -= dm * clamp(after / (after - before - 1e-5), 0.0, 1.0);
    m = clamp(pm, vec2(0.0), wallSize);
  }
#endif
  vec2 tuv = tuvOf(m), puv = m / wallSize;
  vec3 alb = toLin(texture2D(albedoMap, tuv).rgb);
  vec4 hs = texture2D(hMap, tuv);
  float h = hs.r, gloss = hs.g, cav = hs.b;
  float hl = texture2D(hMap, tuv - vec2(tTexel, 0.0)).r, hr = texture2D(hMap, tuv + vec2(tTexel, 0.0)).r;
  float hd = texture2D(hMap, tuv + vec2(0.0, tTexel)).r, hu = texture2D(hMap, tuv - vec2(0.0, tTexel)).r;
#ifdef POM
  // raised parts throw small shadows into the recesses
  if (pfade > 0.0 && Lt.z > 0.02){
    vec2 ld = Lt.xy / max(Lt.z, 0.3) * depthM * (1.0 - h); float occ = 0.0;
    for (int i = 1; i <= 6; i++){ float t = float(i) / 6.0; occ = max(occ, texture2D(hMap, tuvOf(m + ld * t)).r - (h + t * (1.0 - h))); }
    selfSh = 1.0 - clamp(occ * 7.0, 0.0, 1.0) * 0.8 * pfade;
  }
#endif
  // weathering that never repeats: blotches, rain streaks from the top, rising damp and dirt at the base
  float big = fb(m * 0.45 + tileOff * 3.1);
  float streak = fb(vec2(m.x * 2.6, m.y * 0.22) + tileOff.yx);
  float fromTop = smoothstep(wallSize.y - 1.6, wallSize.y, m.y);
  float base = 1.0 - smoothstep(0.0, 0.55 + 0.3 * big, vWorld.y - groundY);
  alb *= mix(1.0, 0.8 + 0.34 * big, grime);
  alb *= 1.0 - grime * (0.34 * base + 0.3 * smoothstep(0.52, 0.78, streak) * (0.25 + 0.75 * fromTop));
  alb = mix(alb, alb * vec3(0.92, 0.95, 0.85), grime * base * 0.6);
  alb *= 1.0 - grime * 0.35 * (1.0 - cav) ;                       // dirt settles in the recesses
  // fine grain that only shows up close, so the surface stays crisp under your nose
  float dfade = clamp(1.0 - fd / 5.0, 0.0, 1.0) * (1.0 - gloss * 0.85);
  vec2 gp = m * 430.0 + tileOff * 91.0; float g0 = vn(gp), g1 = vn(m * 1500.0);
  float micro = (g0 * 0.65 + g1 * 0.35 - 0.5) * dfade;
  vec4 pt = texture2D(paintMap, puv);
  float pa = clamp(pt.a, 0.0, 1.0);
  vec3 pc = pa > 0.0005 ? toLin(clamp(pt.rgb / pa, 0.0, 1.0)) : vec3(0.0);
  float pe = clamp(pa + (h - 0.5 + micro * 0.6) * toothK * pa * (1.0 - pa) * 4.0, 0.0, 1.0);
  alb *= 1.0 + micro * 0.26;
  float bk = bumpK * (1.0 - 0.3 * pe);
  vec2 mic = vec2(vn(gp + vec2(2.7, 0.0)) - g0, vn(gp + vec2(0.0, 2.7)) - g0) * dfade * (1.0 - 0.6 * pe) * 0.9;
  vec3 nt = normalize(vec3((hl - hr) * bk + mic.x, (hu - hd) * bk + mic.y, 1.0));
  vec3 N = normalize(wallT * nt.x + Bv * nt.y + wallN * nt.z);
  vec3 Hv = normalize(L + V);
  float wet = texture2D(wetMap, puv).r * pe;
  float ndl = max(dot(N, L), 0.0), ndh = max(dot(N, Hv), 0.0), ndv = max(dot(N, V), 0.0);
  float ao = mix(1.0, (0.45 + 0.55 * smoothstep(0.03, 0.6, h)) * cav, aoK);
  float metal = metalK * (1.0 - pe) * smoothstep(0.15, 0.4, gloss);
  float rough = mix(clamp(1.0 - gloss * 0.9, 0.1, 1.0), mix(0.5, 0.2, wet), pe);
  float a2 = rough * rough * rough * rough;
  float Dg = a2 / (3.14159 * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  float F0 = mix(0.04, 0.7, metal);
  float F = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hv, V), 0.0), 5.0);
  float sp = min(Dg * F * 0.25, 6.0) * ndl * mix(clamp(specK, 0.3, 1.6), 1.0, pe);
  vec2 sd = m0 - shadow.xy; float canSh = shadow.w * exp(-dot(sd, sd) / (shadow.z * shadow.z));
  float lit = (1.0 - canSh) * selfSh * step(0.0, dot(wallN, L));
  vec3 surf = mix(alb, pc, pe);
  vec3 specTint = mix(vec3(1.0), surf, metal);
  vec3 amb = mix(ambGround, ambSky, N.y * 0.5 + 0.5);
  vec3 col = surf * (1.0 - metal * 0.75) * (amb * ao + sunCol * ndl * lit) + sunCol * sp * lit * ao * specTint;
  // sky and ground reflected in glossy surfaces (tile, steel, wet paint)
  vec3 R = reflect(-V, N);
  vec3 env = mix(ambGround * 1.3, ambSky * 2.4 + sunCol * 0.12, smoothstep(-0.15, 0.45, R.y));
  float Fe = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  col += env * Fe * (1.0 - rough) * (1.0 - rough) * ao * specTint * 1.8;
  vec3 tl = torchPos - vWorld; float td = length(tl); vec3 tL = tl / td;
  float tAtt = 1.0 / (1.0 + 0.02 * td * td); float tnd = max(dot(N, tL), 0.0);
  float tsh = clamp(2.0 / max(a2, 0.004) - 2.0, 2.0, 300.0);
  col += surf * torchCol * tnd * tAtt + torchCol * pow(max(dot(N, normalize(tL + V)), 0.0), tsh) * mix(0.04, 0.5, 1.0 - rough) * tAtt * specTint;
  vec4 g = texture2D(guideMap, vUv);
  col = mix(col, toLin(g.rgb), g.a * guideOpacity);
  // aim ring
  vec2 ad = m0 - aim.xy; float ca = cos(-aimShape.y), sa = sin(-aimShape.y);
  ad = vec2(ca * ad.x - sa * ad.y, sa * ad.x + ca * ad.y); ad.y /= aimShape.x;
  float dd = length(ad), fw = max(fwidth(dd), 1e-5);
  float ring = (1.0 - smoothstep(0.0, 1.4 * fw, abs(dd - aim.z))) * aim.w;
  float cdot = (1.0 - smoothstep(0.0, 1.4 * fw, dd - 2.0 * fw)) * aim.w;
  col = mix(col, vec3(0.0), max(ring, cdot) * 0.35);
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.8 * fw, abs(dd - aim.z))) * aim.w * 0.6);
  // selection outline in build mode
  vec2 e = min(m0, wallSize - m0); float edge = 1.0 - smoothstep(0.0, 0.05, min(e.x, e.y));
  col = mix(col, vec3(1.0, 0.8, 0.1), sel * max(edge, 0.08));
  col = mix(col, toLin(fogCol), smoothstep(fogNF.x, fogNF.y, fd));
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}`;

const WALL_TYPES = {
  wall:     { name:'Block wall', y0:0,   thick:.3,  defW:6,    defH:3,    mat:'brick_red' },
  hoarding: { name:'Hoarding',   y0:.04, thick:.04, defW:4.88, defH:2.44, mat:'hoarding' },
  train:    { name:'Train car',  y0:1.0, thick:2.9, defW:13,   defH:2.6,  mat:'steel_train' },
};
const walls = [];
const sharedGeo = { box:new THREE.BoxGeometry(1,1,1), cyl:new THREE.CylinderGeometry(1,1,1,24) };
const darkMetal = new THREE.MeshStandardMaterial({color:0x2a2a2c, roughness:.6, metalness:.6});
const timber = new THREE.MeshStandardMaterial({color:0x6b5236, roughness:.9});
const concreteSide = new THREE.MeshStandardMaterial({color:0x8a8780, roughness:.95});

class Wall {
  constructor(o){
    this.id = o.id || uid(); this.type = o.type || 'wall'; this.matId = o.mat || WALL_TYPES[this.type].mat;
    this.w = o.w || WALL_TYPES[this.type].defW; this.h = o.h || WALL_TYPES[this.type].defH;
    this.x = o.x || 0; this.z = o.z || 0; this.rot = o.rot || 0;
    this.layers = []; this.drips = []; this.disposed = false;
    this.group = new THREE.Group(); scene.add(this.group);
    this.tileOff = new THREE.Vector2(hash2(this.id.length, this.id.charCodeAt(0), 3)*7, hash2(this.id.charCodeAt(1)||1, 2, 5)*7);
    this.build(); this.place();
    walls.push(this);
  }
  get def(){ return MAT[this.matId]; }
  get y0(){ return WALL_TYPES[this.type].y0; }
  build(){
    const T = WALL_TYPES[this.type];
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry && !Object.values(sharedGeo).includes(c.geometry)) c.geometry.dispose(); }
    this.matTex = getMat(this.matId);
    // paint target
    this.ppm = Math.min(PAINT_PPM, MAXTEX / this.w, MAXTEX / this.h);
    const RW = Math.max(16, Math.round(this.w * this.ppm)), RH = Math.max(16, Math.round(this.h * this.ppm));
    if (!this.rt || this.RW !== RW || this.RH !== RH){
      if (this.rt) this.rt.dispose();
      this.RW = RW; this.RH = RH;
      const mip = isGL2;
      this.rt = new THREE.WebGLRenderTarget(RW, RH, { format:THREE.RGBAFormat, type: floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer:false, stencilBuffer:false,
        minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter:THREE.LinearFilter, generateMipmaps:mip });
      this.rt.texture.anisotropy = ANISO;
      this.cam = new THREE.OrthographicCamera(0, RW, RH, 0, -1, 1);
      renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.render(emptyScene, this.cam); renderer.setRenderTarget(null);
      this.GW = Math.ceil(this.w / CELL); this.GH = Math.ceil(this.h / CELL);
      this.wet = new Float32Array(this.GW*this.GH); this.wetR = new Float32Array(this.GW*this.GH); this.wetG = new Float32Array(this.GW*this.GH); this.wetB = new Float32Array(this.GW*this.GH);
      this.wetData = new Uint8Array(this.GW*this.GH*4);
      if (this.wetTex) this.wetTex.dispose();
      this.wetTex = new THREE.DataTexture(this.wetData, this.GW, this.GH, THREE.RGBAFormat); this.wetTex.magFilter = this.wetTex.minFilter = THREE.LinearFilter; this.wetTex.needsUpdate = true;
      this.wetActive = false;
      this.gppm = Math.min(320, 2048 / this.w, 2048 / this.h);
      this.guideCanvas = mk(Math.round(this.w*this.gppm), Math.round(this.h*this.gppm)); this.gctx = this.guideCanvas.getContext('2d');
      if (this.guideTex) this.guideTex.dispose();
      this.guideTex = new THREE.CanvasTexture(this.guideCanvas); this.guideTex.anisotropy = ANISO;
    }
    const d = this.def;
    this.mat = new THREE.ShaderMaterial({ extensions:{derivatives:true}, defines: mobile ? {} : {POM:''}, vertexShader:WALL_VS, fragmentShader:WALL_FS,
      uniforms: Object.assign({
        albedoMap:{value:this.matTex.alb}, hMap:{value:this.matTex.hgt}, paintMap:{value:this.rt.texture}, guideMap:{value:this.guideTex}, wetMap:{value:this.wetTex},
        wallSize:{value:new THREE.Vector2(this.w, this.h)}, tileOff:{value:this.tileOff}, tileM:{value:d.tileM}, tTexel:{value:1/TILE_PX},
        bumpK:{value: d.depth / (d.tileM / TILE_PX) * .5}, specK:{value:d.spec}, toothK:{value:d.tooth}, aoK:{value:d.ao}, grime:{value:d.grime},
        guideOpacity:{value:1}, sel:{value:0}, groundY:{value:0}, depthM:{value:d.depth}, metalK:{value:d.metal || 0},
        wallT:{value:new THREE.Vector3(1,0,0)}, wallN:{value:new THREE.Vector3(0,0,1)},
        aim:{value:new THREE.Vector4(0,0,0,0)}, aimShape:{value:new THREE.Vector2(1,0)}, shadow:{value:new THREE.Vector4(0,0,.1,0)},
      }, LU) });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.mat);
    this.face.position.set(0, this.y0 + this.h/2, 0); this.face.castShadow = true; this.face.userData.wall = this;
    this.group.add(this.face);
    const side = new THREE.MeshStandardMaterial({color:this.matTex.avg.clone().multiplyScalar(.85), roughness:.92, metalness: this.type === 'train' ? .3 : 0});
    const add = (geo, mat, x, y, z, sx, sy, sz, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (rx) m.rotation.x = rx; m.castShadow = m.receiveShadow = true; m.userData.wall = this; this.group.add(m); return m; };
    if (this.type === 'wall'){
      add(sharedGeo.box, side, 0, this.h/2, -T.thick/2 - .002, this.w, this.h, T.thick);
      add(sharedGeo.box, concreteSide, 0, this.h + .035, -T.thick/2, this.w + .06, .07, T.thick + .07);
    } else if (this.type === 'hoarding'){
      add(sharedGeo.box, side, 0, this.y0 + this.h/2, -T.thick/2 - .002, this.w, this.h, T.thick);
      const n = Math.max(2, Math.round(this.w / 2.44) + 1);
      for (let k=0;k<n;k++){ const px = -this.w/2 + .05 + k*(this.w - .1)/(n-1);
        add(sharedGeo.box, timber, px, (this.h+.3)/2, -T.thick - .05, .09, this.h + .3, .09);
        const br = add(sharedGeo.box, timber, px, this.h*.38, -T.thick - .6, .07, Math.hypot(this.h*.75, 1.1), .07); br.rotation.x = Math.atan2(1.1, this.h*.75); }
    } else if (this.type === 'train'){
      const D = T.thick, top = this.y0 + this.h;
      add(sharedGeo.box, side, 0, this.y0 + this.h/2, -D/2 - .002, this.w, this.h, D);
      add(sharedGeo.box, side, 0, top + .09, -D/2, this.w - .1, .18, D - .2);
      add(sharedGeo.box, darkMetal, 0, this.y0 - .18, -D/2, this.w - .6, .36, D - .4);
      for (const bx of [-this.w/2 + 1.9, this.w/2 - 1.9]){
        add(sharedGeo.box, darkMetal, bx, .62, -D/2, 2.4, .32, D - .7);
        for (const wx of [-.75, .75]) for (const wz of [-.35, -D + .35]){ const wh = add(sharedGeo.cyl, darkMetal, bx + wx, .46, wz, .46, .14, .46); wh.rotation.x = Math.PI/2; }
      }
      for (const rz of [-.35, -D + .35]) add(sharedGeo.box, darkMetal, 0, .08, rz, this.w + 8, .16, .08);
      for (let k = -this.w/2 - 4; k < this.w/2 + 4; k += .65) add(sharedGeo.box, timber, k, .03, -D/2, .22, .06, D + .4);
    }
    this.meshes = []; this.group.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    this.place();
  }
  place(){
    this.group.position.set(this.x, 0, this.z); this.group.rotation.set(0, this.rot, 0); this.group.updateMatrixWorld(true);
    if (this.mat){ this.mat.uniforms.wallT.value.set(Math.cos(this.rot), 0, -Math.sin(this.rot)); this.mat.uniforms.wallN.value.set(Math.sin(this.rot), 0, Math.cos(this.rot)); this.mat.uniforms.groundY.value = 0; }
  }
  get normal(){ return new THREE.Vector3(Math.sin(this.rot), 0, Math.cos(this.rot)); }
  toWorld(u, v, d, out){ out = out || new THREE.Vector3(); out.set(u - this.w/2, this.y0 + v, d); return out.applyMatrix4(this.group.matrixWorld); }
  toLocal(p){ const q = this.group.worldToLocal(p.clone()); return { u: q.x + this.w/2, v: q.y - this.y0, d: q.z }; }
  setMaterial(id){ this.matId = id; this.build(); drawWallGuide(this); }
  resize(w, h){ this.w = w; this.h = h; this.build(); drawWallGuide(this); }
  serialize(){ return { id:this.id, type:this.type, mat:this.matId, w:+this.w.toFixed(3), h:+this.h.toFixed(3), x:+this.x.toFixed(3), z:+this.z.toFixed(3), rot:+this.rot.toFixed(4) }; }
  clearPaint(){
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.render(emptyScene, this.cam); renderer.setRenderTarget(null);
    this.wet.fill(0); this.drips.length = 0;
  }
  dispose(){
    this.disposed = true; scene.remove(this.group); this.rt.dispose(); this.wetTex.dispose(); this.guideTex.dispose();
    const i = walls.indexOf(this); if (i >= 0) walls.splice(i, 1);
  }
}
function wallById(id){ return walls.find(w => w.id === id); }

/* ---- undo (per stroke, any wall) ---- */
const undoStack = [], redoStack = [], undoPool = {};
const UNDO_MAX = mobile ? 6 : 10;
function snapRT(W, H){ return new THREE.WebGLRenderTarget(W, H, {format:THREE.RGBAFormat, type:THREE.UnsignedByteType, depthBuffer:false, stencilBuffer:false, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, generateMipmaps:false}); }
function poolPut(e){ (undoPool[e.key] = undoPool[e.key] || []).push(e.rt); }
function snapOf(wall){ const key = wall.RW + 'x' + wall.RH, rt = (undoPool[key] && undoPool[key].pop()) || snapRT(wall.RW, wall.RH); copyRT(wall.rt, rt); return {wall, rt, key}; }
function pushUndo(wall){
  if (!wall) return;
  if (undoStack.length >= UNDO_MAX) poolPut(undoStack.shift());
  undoStack.push(snapOf(wall)); while (redoStack.length) poolPut(redoStack.pop());
  markDirty(wall); updateUndoUI();
}
function swapHistory(from, to, word){
  let e; while ((e = from.pop()) && (e.wall.disposed || e.wall.RW + 'x' + e.wall.RH !== e.key)) poolPut(e);
  if (!e){ toast(`Nothing to ${word}`); updateUndoUI(); return; }
  flushAll(); to.push(snapOf(e.wall)); copyRT(e.rt, e.wall.rt); poolPut(e);
  e.wall.drips.length = 0; e.wall.wet.fill(0); e.wall.wetData.fill(0); e.wall.wetTex.needsUpdate = true;
  markDirty(e.wall); updateUndoUI(); toast(word === 'undo' ? 'Undone' : 'Redone');
}
function undo(){ swapHistory(undoStack, redoStack, 'undo'); }
function redo(){ swapHistory(redoStack, undoStack, 'redo'); }
function updateUndoUI(){ for (const id of ['undoTop', 'undoBtn']){ const b = $('#'+id); if (b) b.disabled = !undoStack.length; } for (const id of ['redoTop', 'redoBtn']){ const b = $('#'+id); if (b) b.disabled = !redoStack.length; } }

let cityMat = null;
/* ================================================================
   The yard: ground, buildings, lamps
   ================================================================ */
function buildYard(){
  // asphalt with patches and painted lines
  const c = mk(1024, 1024), x = c.getContext('2d'), id = x.createImageData(1024, 1024);
  for (let i=0;i<1024*1024;i++){ const px = i % 1024, py = (i/1024)|0, u = px/1024, v = py/1024;
    const n = pfbm(u, v, 12, 12, 5, 4), g = hash2(px, py, 1), crack = Math.abs(pfbm(u, v, 3, 3, 9, 5) - .5);
    let val = 44 + n*30 + (g > .94 ? 34*g : 0) + (g-.5)*12; if (crack < .004) val *= .55;
    id.data[i*4] = val; id.data[i*4+1] = val; id.data[i*4+2] = val*1.04; id.data[i*4+3] = 255; }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({map:t, roughness:.94}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; ground.userData.ground = true; scene.add(ground);
  // concrete slab under the main walls
  const slab = new THREE.Mesh(new THREE.BoxGeometry(34, .06, 22), new THREE.MeshStandardMaterial({color:0x5c5a56, roughness:.95})); slab.position.set(0, .03, 0); slab.receiveShadow = true; scene.add(slab);
  // distant blocks (city edge)
  // city backdrop: blocks with rows of windows that light up at night
  cityMat = new THREE.ShaderMaterial({ uniforms:Object.assign({night:{value:0}}, LU), fog:false,
    vertexShader:`varying vec3 vW; varying vec3 vN; varying float vTint;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vTint = fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader:`uniform vec3 sunDir, sunCol, ambSky, ambGround, fogCol; uniform vec2 fogNF; uniform float night; varying vec3 vW; varying vec3 vN; varying float vTint;
      void main(){ vec3 N = normalize(vN);
        vec3 base = mix(vec3(0.20, 0.21, 0.24), vec3(0.34, 0.29, 0.25), vTint); float glow = 0.0, r = 0.0;
        if (abs(N.y) < 0.5){
          vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), N)); vec2 g = vec2(dot(vW, t) / 2.6 + vTint * 9.0, vW.y / 3.1); vec2 c = floor(g), f = fract(g);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78) * step(2.5, vW.y);
          r = fract(sin(dot(c + vTint * 17.0, vec2(127.1, 311.7))) * 43758.5453);
          base = mix(base, mix(vec3(0.05, 0.07, 0.10), vec3(0.22, 0.30, 0.38), r), win);
          base *= 1.0 - 0.12 * step(0.94, f.y); glow = win * step(0.6, r) * night;
        }
        vec3 col = base * (mix(ambGround, ambSky, N.y * 0.5 + 0.5) * 1.5 + sunCol * max(dot(N, normalize(sunDir)), 0.0));
        col += vec3(1.0, 0.74, 0.40) * glow * (0.35 + 0.65 * fract(r * 7.3));
        col = mix(col, pow(fogCol, vec3(2.2)), smoothstep(fogNF.x, fogNF.y, length(vW - cameraPosition)) * 0.85);
        gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 1.0); }` });
  const rnd = seeded(99);
  for (let k=0;k<64;k++){
    const a = rnd()*Math.PI*2, r = 70 + rnd()*60, w = 10 + rnd()*20, h = 10 + rnd()*44, d = 10 + rnd()*16;
    const b = new THREE.Mesh(sharedGeo.box, cityMat); b.scale.set(w, h, d); b.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); b.rotation.y = rnd()*3; scene.add(b);
  }
  // perimeter fence posts and lamps
  const postMat = new THREE.MeshStandardMaterial({color:0x707479, roughness:.5, metalness:.7});
  for (const [lx, lz] of [[-14, 9], [14, 9], [-14, -9], [14, -9], [0, 16]]){
    const pole = new THREE.Mesh(sharedGeo.cyl, postMat); pole.scale.set(.07, 6, .07); pole.position.set(lx, 3, lz); pole.castShadow = true; scene.add(pole);
    const arm = new THREE.Mesh(sharedGeo.box, postMat); arm.scale.set(.08, .08, 1.1); arm.position.set(lx, 5.95, lz - .5*Math.sign(lz)); scene.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({color:0x777777})); bulb.position.set(lx, 5.85, lz - 1*Math.sign(lz)); scene.add(bulb);
    const light = new THREE.PointLight(0xffd9a0, 0, 26, 1.8); light.position.copy(bulb.position); scene.add(light);
    lamps.push({light, bulb});
  }
  // a couple of props: barrels and a dumpster
  const rust = new THREE.MeshStandardMaterial({color:0x7a3e22, roughness:.8, metalness:.3});
  for (const [bx, bz] of [[-6.5, 2.2], [-5.9, 2.7], [7.2, 3.4]]){ const b = new THREE.Mesh(sharedGeo.cyl, rust); b.scale.set(.29, .88, .29); b.position.set(bx, .44, bz); b.castShadow = b.receiveShadow = true; scene.add(b); }
  const dump = new THREE.Mesh(sharedGeo.box, new THREE.MeshStandardMaterial({color:0x2d5a3a, roughness:.7, metalness:.4})); dump.scale.set(1.9, 1.2, 1.1); dump.position.set(5.2, .6, -2.2); dump.castShadow = dump.receiveShadow = true; scene.add(dump);
}
