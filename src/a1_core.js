'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
function mk(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hash2(x, y, s){ let h = Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263) + Math.imul(s|0, 982451653); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = hash2(xi,yi,s), b = hash2(xi+1,yi,s), c = hash2(xi,yi+1,s), d = hash2(xi+1,yi+1,s);
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
}
function seeded(a){ return () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let spare = null;
function gauss(){ if (spare !== null){ const s = spare; spare = null; return s; } let u, v, r; do { u = Math.random()*2-1; v = Math.random()*2-1; r = u*u+v*v; } while (r >= 1 || r === 0); const f = Math.sqrt(-2*Math.log(r)/r); spare = v*f; return u*f; }
function hexToRgb(h){ h = h.replace('#',''); return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]; }
const hex = (r,g,b) => '#' + [r,g,b].map(v => Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
const uid = () => Math.random().toString(36).slice(2, 10);
let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 2600); }
function fatal(msg){ document.body.insertAdjacentHTML('beforeend', `<div id="err"><div><div class="logo">SPRAY</div><p>${msg}</p></div></div>`); const l = $('#loading'); if (l) l.hidden = true; }

/* ---------------- renderer ---------------- */
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch (e) { fatal('This browser could not start WebGL, which the 3D yard needs. Try a current Chrome, Edge, Firefox or Safari with hardware acceleration on.'); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const gl = renderer.getContext();
const isGL2 = renderer.capabilities.isWebGL2;
const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const MAXTEX = Math.min(renderer.capabilities.maxTextureSize, mobile ? 2048 : 4096);
const floatOK = isGL2 && !!gl.getExtension('EXT_color_buffer_float');
const ANISO = renderer.capabilities.getMaxAnisotropy();
const PAINT_PPM = mobile ? 280 : 520;       // paint pixels per metre on a wall
const TILE_PX = mobile ? 512 : 1024;        // material tile resolution
const CELL = 0.015;                          // wetness grid cell (m)

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 600);
scene.fog = new THREE.Fog(0xb8c9d8, 70, 330);

/* shared lighting uniforms, referenced by every wall material */
const LU = {
  sunDir:{value:new THREE.Vector3(-.45,.75,.5).normalize()}, sunCol:{value:new THREE.Vector3(1.2,1.12,1)},
  ambSky:{value:new THREE.Vector3(.36,.4,.48)}, ambGround:{value:new THREE.Vector3(.18,.16,.14)},
  torchPos:{value:new THREE.Vector3()}, torchCol:{value:new THREE.Vector3(0,0,0)},
  fogCol:{value:new THREE.Vector3(.72,.79,.85)}, fogNF:{value:new THREE.Vector2(70,330)},
};
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, {left:-22, right:22, top:22, bottom:-22, near:1, far:120}); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xa3b6dc, 0x2a2520, .7); scene.add(hemi);
const torch = new THREE.PointLight(0xfff1d6, 0, 9, 2); scene.add(torch);

const LIGHTS = {
  day:   { name:'Day',         top:0x5d8fd0, bot:0xd8e4ee, sun:0xfff3e0, sunI:2.5, dir:[-.45,.78,.5], hemiS:0xbcd0ea, hemiG:0x4a4238, hemiI:.75, fog:0xc3d2df, amb:[.36,.4,.48], ambG:[.2,.18,.15], torch:0 },
  golden:{ name:'Golden hour', top:0x46578f, bot:0xf2a76c, sun:0xffbf80, sunI:2.2, dir:[-.85,.26,.45], hemiS:0xb09cc0, hemiG:0x4a3226, hemiI:.55, fog:0xd6a383, amb:[.3,.27,.32], ambG:[.2,.13,.1], torch:0 },
  overcast:{ name:'Overcast',  top:0x8d98a6, bot:0xc9ced3, sun:0xeef1f4, sunI:.9,  dir:[-.2,.9,.3], hemiS:0xd3d9e0, hemiG:0x55504a, hemiI:1.05, fog:0xbcc3ca, amb:[.5,.53,.57], ambG:[.27,.25,.23], torch:0 },
  night: { name:'Night',       top:0x03050b, bot:0x141c2e, sun:0x8ea6d8, sunI:.3,  dir:[.35,.8,.4], hemiS:0x34405e, hemiG:0x0c0c10, hemiI:.35, fog:0x0b0f18, amb:[.1,.11,.15], ambG:[.05,.05,.06], torch:1 },
};
const skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
  uniforms:{ top:{value:new THREE.Color()}, bot:{value:new THREE.Color()}, sunD:{value:new THREE.Vector3()}, sunC:{value:new THREE.Color()}, night:{value:0} },
  vertexShader:'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:`uniform vec3 top, bot, sunC, sunD; uniform float night; varying vec3 vD;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
    void main(){ float y = clamp(vD.y, -0.2, 1.0); vec3 c = mix(bot, top, pow(smoothstep(-0.05, 0.85, y), 0.7));
      float s = max(dot(normalize(vD), normalize(sunD)), 0.0); c += sunC * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25) * (1.0 - night*0.8);
      if (night > 0.5 && y > 0.05){ vec3 q = floor(vD * 420.0); float st = step(0.9975, h(q)); c += vec3(st) * 0.9 * smoothstep(0.05, 0.4, y); }
      gl_FragColor = vec4(c, 1.0); }` });
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); sky.frustumCulled = false; scene.add(sky);
let lightMode = 'day';
function setLighting(id){
  const L = LIGHTS[id]; lightMode = id;
  skyMat.uniforms.top.value.set(L.top); skyMat.uniforms.bot.value.set(L.bot); skyMat.uniforms.night.value = id === 'night' ? 1 : 0;
  const d = new THREE.Vector3(...L.dir).normalize(); skyMat.uniforms.sunD.value.copy(d); skyMat.uniforms.sunC.value.set(L.sun);
  sun.color.set(L.sun); sun.intensity = L.sunI * .5; LU.sunDir.value.copy(d);
  const sc = new THREE.Color(L.sun); LU.sunCol.value.set(sc.r, sc.g, sc.b).multiplyScalar(L.sunI * .5);
  hemi.color.set(L.hemiS); hemi.groundColor.set(L.hemiG); hemi.intensity = L.hemiI * .8;
  LU.ambSky.value.set(...L.amb); LU.ambGround.value.set(...L.ambG);
  scene.fog.color.set(L.fog); const fc = new THREE.Color(L.fog); LU.fogCol.value.set(fc.r, fc.g, fc.b);
  torch.intensity = L.torch ? .7 : 0; LU.torchCol.value.set(L.torch ? 1.5 : 0, L.torch ? 1.38 : 0, L.torch ? 1.15 : 0);
  lamps.forEach(l => { l.light.intensity = id === 'night' ? 1.5 : 0; l.bulb.material.color.set(id === 'night' ? 0xfff0c8 : 0x777777); });
  if (cityMat) cityMat.uniforms.night.value = id === 'night' ? 1 : 0;
  $$('#lightModes .chip').forEach(b => b.classList.toggle('on', b.dataset.light === id));
}
const lamps = [];

/* ---------------- shared splat batch (draws paint into a wall's render target) ---------------- */
const SPLAT_VS = `
attribute vec4 aSplat; attribute vec4 aShape; attribute vec4 aColor;
varying vec2 vQ; varying vec4 vCol; varying float vKind; varying float vHalf; varying vec2 vPx; varying vec2 vSc; varying float vSkip;
void main(){
  vKind = aSplat.w; vCol = aColor; vSkip = aShape.w;
  float hs = aSplat.w < 0.5 ? aSplat.z * 3.0 : aSplat.z + 1.0;
  vHalf = hs; vQ = position.xy; vSc = aShape.xy;
  vec2 o = position.xy * hs * aShape.xy;
  float c = cos(aShape.z), s = sin(aShape.z);
  o = vec2(c*o.x - s*o.y, s*o.x + c*o.y);
  vPx = aSplat.xy + o;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPx, 0.0, 1.0);
}`;
const SPLAT_FS = `
uniform sampler2D hMap; uniform float pxToTile; uniform vec2 tileOffT;
varying vec2 vQ; varying vec4 vCol; varying float vKind; varying float vHalf; varying vec2 vPx; varying vec2 vSc; varying float vSkip;
void main(){
  float a;
  if (vKind < 0.5) { vec2 q = vQ * 3.0; a = exp(-0.5 * dot(q, q)); if (a < 0.003) discard; }
  else if (vKind < 1.5) { float d = length(vQ) * vHalf; a = clamp(vHalf - 0.5 - d, 0.0, 1.0); if (a <= 0.0) discard; }
  else {
    if (vKind < 2.5) { float d = length(vQ) * vHalf; a = clamp(vHalf - 0.5 - d, 0.0, 1.0); }
    else { float hx = vHalf * vSc.x, hy = vHalf * vSc.y; a = clamp(hx - 0.5 - abs(vQ.x) * hx, 0.0, 1.0) * clamp(hy - 0.5 - abs(vQ.y) * hy, 0.0, 1.0); }
    if (a <= 0.0) discard;
    float h = texture2D(hMap, vPx * pxToTile + tileOffT).r;   // the felt tip skips the pits of rough walls
    a *= smoothstep(vSkip - 0.07, vSkip + 0.07, h);
  }
  a *= vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;
const MAX_SPLATS = 30000;
function makeBatch(erase){
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]), 3));
  geo.setIndex([0,1,2, 0,2,3]);
  const A1 = new Float32Array(MAX_SPLATS*4), A2 = new Float32Array(MAX_SPLATS*4), A3 = new Float32Array(MAX_SPLATS*4);
  const at = [new THREE.InstancedBufferAttribute(A1,4), new THREE.InstancedBufferAttribute(A2,4), new THREE.InstancedBufferAttribute(A3,4)];
  at.forEach(a => a.setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSplat', at[0]); geo.setAttribute('aShape', at[1]); geo.setAttribute('aColor', at[2]);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader:SPLAT_VS, fragmentShader:SPLAT_FS, transparent:true, depthTest:false, depthWrite:false,
    uniforms:{ hMap:{value:null}, pxToTile:{value:1}, tileOffT:{value:new THREE.Vector2()} },
    blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendEquationAlpha:THREE.AddEquation,
    blendSrc: erase ? THREE.ZeroFactor : THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: erase ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  return {
    n:0, wall:null,
    push(wall, x, y, r, kind, sx, sy, ang, cr, cg, cb, ca, skip){
      if (wall !== this.wall){ this.flush(); this.wall = wall; }
      if (this.n >= MAX_SPLATS) this.flush();
      const i = this.n * 4;
      A1[i]=x; A1[i+1]=y; A1[i+2]=r; A1[i+3]=kind;
      A2[i]=sx; A2[i+1]=sy; A2[i+2]=ang; A2[i+3]=skip || 0;
      A3[i]=cr; A3[i+1]=cg; A3[i+2]=cb; A3[i+3]=ca;
      this.n++;
    },
    flush(){
      const w = this.wall;
      if (!this.n || !w || w.disposed){ this.n = 0; return; }
      for (const a of at) { a.updateRange.offset = 0; a.updateRange.count = this.n * 4; a.needsUpdate = true; }
      geo.instanceCount = this.n;
      mat.uniforms.hMap.value = w.matTex.hgt; mat.uniforms.pxToTile.value = 1 / (w.ppm * w.def.tileM);
      mat.uniforms.tileOffT.value.set(w.tileOff.x / w.def.tileM, w.tileOff.y / w.def.tileM);
      renderer.setRenderTarget(w.rt); renderer.render(sc, w.cam); renderer.setRenderTarget(null);
      this.n = 0;
    }
  };
}
const paintB = makeBatch(false), eraseB = makeBatch(true);

const copyMat = new THREE.ShaderMaterial({ uniforms:{ src:{value:null} },
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader:'uniform sampler2D src; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv); }',
  depthTest:false, depthWrite:false, blending:THREE.NoBlending });
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1), emptyScene = new THREE.Scene();
{ const q = new THREE.Mesh(new THREE.PlaneGeometry(2,2), copyMat); q.frustumCulled = false; quadScene.add(q); }
function copyRT(src, dst){ copyMat.uniforms.src.value = src.texture; renderer.setRenderTarget(dst); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null); }
function flushAll(){ eraseB.flush(); paintB.flush(); }
