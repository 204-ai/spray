/* ================================================================
   Image layers → traceable guides (placed, rotated, scaled on any wall)
   ================================================================ */
const G = { visible:true, sel:null };   // sel = selected layer
const lin = new Float32Array(256); for (let i=0;i<256;i++){ const c=i/255; lin[i] = c <= .04045 ? c/12.92 : Math.pow((c+.055)/1.055, 2.4); }
function toLab(r, g, b, out, o){
  const R = lin[r|0], Gg = lin[g|0], B = lin[b|0];
  let x = (R*.4124 + Gg*.3576 + B*.1805)/.95047, y = R*.2126 + Gg*.7152 + B*.0722, z = (R*.0193 + Gg*.1192 + B*.9505)/1.08883;
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787*t + 16/116; x = f(x); y = f(y); z = f(z);
  out[o] = 116*y - 16; out[o+1] = 500*(x-y); out[o+2] = 200*(y-z);
}
function bilateral(R, Gc, B, op, w, h){
  const n = w*h, oR = new Float32Array(n), oG = new Float32Array(n), oB = new Float32Array(n), rad = 2, sw = [], sr = 2*28*28;
  for (let dy=-rad; dy<=rad; dy++) for (let dx=-rad; dx<=rad; dx++) sw.push(Math.exp(-(dx*dx+dy*dy)/(2*1.6*1.6)));
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const i = y*w+x; if (!op[i]){ oR[i]=R[i]; oG[i]=Gc[i]; oB[i]=B[i]; continue; }
    let ar=0, ag=0, ab=0, aw=0, k=0;
    for (let dy=-rad; dy<=rad; dy++){ const yy = clamp(y+dy,0,h-1);
      for (let dx=-rad; dx<=rad; dx++, k++){ const q = yy*w + clamp(x+dx,0,w-1); if (!op[q]) continue;
        const dr=R[q]-R[i], dg=Gc[q]-Gc[i], db=B[q]-B[i], wt = sw[k]*Math.exp(-(dr*dr+dg*dg+db*db)/sr);
        ar+=R[q]*wt; ag+=Gc[q]*wt; ab+=B[q]*wt; aw+=wt; } }
    oR[i]=ar/aw; oG[i]=ag/aw; oB[i]=ab/aw;
  }
  return [oR, oG, oB];
}
function kmeans(LAB, idx, K){
  const rnd = seeded(1337), n = idx.length, C = new Float32Array(K*3), D = new Float32Array(n).fill(1e12);
  let p = idx[(rnd()*n)|0]*3; C[0]=LAB[p]; C[1]=LAB[p+1]; C[2]=LAB[p+2];
  for (let c=1;c<K;c++){
    let sum = 0;
    for (let i=0;i<n;i++){ const q=idx[i]*3, a=LAB[q]-C[(c-1)*3], b=LAB[q+1]-C[(c-1)*3+1], d=LAB[q+2]-C[(c-1)*3+2], dd=a*a+b*b+d*d; if (dd<D[i]) D[i]=dd; sum+=D[i]; }
    let r = rnd()*sum, pick = n-1; for (let i=0;i<n;i++){ r -= D[i]; if (r <= 0){ pick = i; break; } }
    p = idx[pick]*3; C[c*3]=LAB[p]; C[c*3+1]=LAB[p+1]; C[c*3+2]=LAB[p+2];
  }
  const S3 = new Float64Array(K*3), cnt = new Int32Array(K);
  for (let it=0; it<14; it++){
    S3.fill(0); cnt.fill(0); let far = 0, farI = 0;
    for (let i=0;i<n;i++){ const q=idx[i]*3; let best=0, bd=1e12;
      for (let c=0;c<K;c++){ const a=LAB[q]-C[c*3], b=LAB[q+1]-C[c*3+1], d=LAB[q+2]-C[c*3+2], dd=a*a+b*b+d*d; if (dd<bd){ bd=dd; best=c; } }
      cnt[best]++; S3[best*3]+=LAB[q]; S3[best*3+1]+=LAB[q+1]; S3[best*3+2]+=LAB[q+2]; if (bd>far){ far=bd; farI=i; } }
    for (let c=0;c<K;c++){ if (cnt[c]){ C[c*3]=S3[c*3]/cnt[c]; C[c*3+1]=S3[c*3+1]/cnt[c]; C[c*3+2]=S3[c*3+2]/cnt[c]; } else { const q=idx[farI]*3; C[c*3]=LAB[q]; C[c*3+1]=LAB[q+1]; C[c*3+2]=LAB[q+2]; } }
  }
  return C;
}
function components(lab, w, h){
  const n = w*h, comp = new Int32Array(n).fill(-1), order = new Int32Array(n), starts = [], sizes = [];
  let k = 0, top = 0;
  for (let i=0;i<n;i++){
    if (comp[i] >= 0 || lab[i] < 0) continue;
    const L = lab[i]; starts.push(top); comp[i] = k; order[top++] = i; let head = starts[k];
    while (head < top){ const p = order[head++], x = p % w;
      if (x > 0 && comp[p-1] < 0 && lab[p-1] === L){ comp[p-1] = k; order[top++] = p-1; }
      if (x < w-1 && comp[p+1] < 0 && lab[p+1] === L){ comp[p+1] = k; order[top++] = p+1; }
      if (p >= w && comp[p-w] < 0 && lab[p-w] === L){ comp[p-w] = k; order[top++] = p-w; }
      if (p < n-w && comp[p+w] < 0 && lab[p+w] === L){ comp[p+w] = k; order[top++] = p+w; } }
    sizes.push(top - starts[k]); k++;
  }
  return { comp, order, starts, sizes, count:k };
}
function mergeSmall(lab, w, h, minA){
  const n = w*h;
  for (let iter=0; iter<8; iter++){
    const C = components(lab, w, h); let changed = false;
    for (let c=0;c<C.count;c++){
      if (C.sizes[c] >= minA) continue;
      const hist = new Map(), s0 = C.starts[c], s1 = s0 + C.sizes[c];
      for (let j=s0;j<s1;j++){ const p = C.order[j], x = p % w;
        for (const q of [x>0?p-1:-1, x<w-1?p+1:-1, p>=w?p-w:-1, p<n-w?p+w:-1]){ if (q < 0 || C.comp[q] === c) continue; const L = lab[q]; hist.set(L, (hist.get(L)||0) + 1); } }
      let best = null, bc = -1;
      for (const [L, v] of hist){ const score = L < 0 ? v*.5 : v; if (score > bc){ bc = score; best = L; } }
      if (best === null) continue;
      for (let j=s0;j<s1;j++) lab[C.order[j]] = best;
      changed = true;
    }
    if (!changed) break;
  }
}
function marching(F, W, H, iso, out){
  for (let y=0;y<H-1;y++) for (let x=0;x<W-1;x++){
    const a=F[y*W+x], b=F[y*W+x+1], c=F[(y+1)*W+x+1], d=F[(y+1)*W+x];
    const idx = (a>iso?8:0)|(b>iso?4:0)|(c>iso?2:0)|(d>iso?1:0);
    if (idx === 0 || idx === 15) continue;
    const T = () => [x + (iso-a)/(b-a), y], Rr = () => [x+1, y + (iso-b)/(c-b)], Bt = () => [x + (iso-d)/(c-d), y+1], Lf = () => [x, y + (iso-a)/(d-a)];
    const seg = (p, q) => { out.push(p[0], p[1], q[0], q[1]); };
    const ctr = (a+b+c+d)/4 > iso;
    switch (idx){
      case 1: case 14: seg(Lf(), Bt()); break;
      case 2: case 13: seg(Bt(), Rr()); break;
      case 3: case 12: seg(Lf(), Rr()); break;
      case 4: case 11: seg(T(), Rr()); break;
      case 6: case 9: seg(T(), Bt()); break;
      case 7: case 8: seg(T(), Lf()); break;
      case 5: if (ctr){ seg(T(), Lf()); seg(Bt(), Rr()); } else { seg(T(), Rr()); seg(Lf(), Bt()); } break;
      case 10: if (ctr){ seg(T(), Rr()); seg(Lf(), Bt()); } else { seg(T(), Lf()); seg(Bt(), Rr()); } break;
    }
  }
}
function blur121(F, W, H, tmp){
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const i=y*W+x; tmp[i] = (F[x>0?i-1:i] + 2*F[i] + F[x<W-1?i+1:i]) * .25; }
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const i=y*W+x; F[i] = (tmp[y>0?i-W:i] + 2*tmp[i] + tmp[y<H-1?i+W:i]) * .25; }
}

class Layer {
  constructor(img, wall, u, v){
    this.id = uid(); this.img = img; this.wall = wall; this.cx = u; this.cy = v;
    const asp = img.width / img.height;
    this.hgt = Math.min(wall.h * .7, wall.w * .7 / asp); this.rot = 0;
    this.mode = 'shapes'; this.k = 7; this.detail = 5; this.opacity = .6; this.lineW = 2.5; this.lineColor = '#ffffff';
    this.show = {lines:true, fill:true, numbers:true, photo:false}; this.focus = -1; this.data = null;
    const t = mk(96, 96), tx = t.getContext('2d'), s = Math.min(96/img.width, 96/img.height); tx.drawImage(img, (96 - img.width*s)/2, (96 - img.height*s)/2, img.width*s, img.height*s);
    this.thumb = t.toDataURL('image/png');
    wall.layers.push(this);
  }
  get wid(){ return this.data ? this.hgt * this.data.w / this.data.h : this.hgt * this.img.width / this.img.height; }
  // image pixel (work res) → wall metres
  toWall(x, y){
    const D = this.data, m = this.hgt / D.h, px = (x - D.w/2) * m, py = -(y - D.h/2) * m, c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.cx + px*c - py*s, this.cy + px*s + py*c];
  }
  // wall metres → layer-local metres (unrotated, y up)
  local(u, v){ const dx = u - this.cx, dy = v - this.cy, c = Math.cos(-this.rot), s = Math.sin(-this.rot); return [dx*c - dy*s, dx*s + dy*c]; }
  moveTo(wall){ if (wall === this.wall) return; const old = this.wall; old.layers.splice(old.layers.indexOf(this), 1); this.wall = wall; wall.layers.push(this); drawWallGuide(old); drawWallGuide(wall); }
  remove(){ const w = this.wall; w.layers.splice(w.layers.indexOf(this), 1); drawWallGuide(w); if (G.sel === this) G.sel = null; }
}

function processLayer(L){
  const img = L.img, t0 = performance.now();
  const maxD = 560, sc = Math.min(1, maxD / Math.max(img.width, img.height));
  const w = Math.max(16, Math.round(img.width*sc)), h = Math.max(16, Math.round(img.height*sc)), n = w*h;
  const c = mk(w, h), cx = c.getContext('2d', {willReadFrequently:true}); cx.drawImage(img, 0, 0, w, h);
  const src = cx.getImageData(0, 0, w, h).data;
  let R = new Float32Array(n), Gc = new Float32Array(n), B = new Float32Array(n); const op = new Uint8Array(n);
  let opaque = 0;
  for (let i=0;i<n;i++){ R[i]=src[i*4]; Gc[i]=src[i*4+1]; B[i]=src[i*4+2]; op[i] = src[i*4+3] > 110 ? 1 : 0; opaque += op[i]; }
  if (opaque < 20) throw new Error('transparent');
  [R, Gc, B] = bilateral(R, Gc, B, op, w, h); [R, Gc, B] = bilateral(R, Gc, B, op, w, h);
  const LAB = new Float32Array(n*3); for (let i=0;i<n;i++) toLab(R[i], Gc[i], B[i], LAB, i*3);
  const all = []; for (let i=0;i<n;i++) if (op[i]) all.push(i);
  const step = Math.max(1, Math.floor(all.length / 14000)), sample = []; for (let i=0;i<all.length;i+=step) sample.push(all[i]);
  const K = Math.min(L.k, sample.length), C = kmeans(LAB, sample, K);
  let lab = new Int16Array(n).fill(-1);
  for (const i of all){ const q=i*3; let best=0, bd=1e12; for (let k=0;k<K;k++){ const a=LAB[q]-C[k*3], b=LAB[q+1]-C[k*3+1], d=LAB[q+2]-C[k*3+2], dd=a*a+b*b+d*d; if (dd<bd){ bd=dd; best=k; } } lab[i]=best; }
  for (let pass=0; pass<2; pass++){
    const out = new Int16Array(lab), v = new Int16Array(9);
    for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){ const i=y*w+x; if (lab[i]<0) continue; let m=0;
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) v[m++] = lab[i+dy*w+dx];
      let best=lab[i], bc=0; for (let a=0;a<9;a++){ if (v[a]<0) continue; let cc=0; for (let b=0;b<9;b++) if (v[b]===v[a]) cc++; if (cc>bc){ bc=cc; best=v[a]; } }
      out[i] = bc >= 5 ? best : lab[i]; }
    lab = out;
  }
  mergeSmall(lab, w, h, Math.max(6, Math.round(opaque * .0045 / Math.pow(1.62, L.detail-1))));
  const cnt = new Int32Array(K), sr = new Float64Array(K), sg = new Float64Array(K), sb = new Float64Array(K);
  for (let i=0;i<n;i++){ const l=lab[i]; if (l<0) continue; cnt[l]++; sr[l]+=R[i]; sg[l]+=Gc[i]; sb[l]+=B[i]; }
  const ord = [...Array(K).keys()].filter(k => cnt[k] > 0).sort((a,b) => cnt[b]-cnt[a]);
  const remap = new Int16Array(K).fill(-1); ord.forEach((k,j) => remap[k] = j);
  for (let i=0;i<n;i++) if (lab[i] >= 0) lab[i] = remap[lab[i]];
  const palette = ord.map(k => [Math.round(sr[k]/cnt[k]), Math.round(sg[k]/cnt[k]), Math.round(sb[k]/cnt[k])]), KK = palette.length;
  const segRanges = [], segs = [], PW = w+2, PH = h+2, F = new Float32Array(PW*PH), tmp = new Float32Array(PW*PH);
  for (let l=0; l<KK; l++){
    F.fill(0); for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (lab[y*w+x] === l) F[(y+1)*PW + x+1] = 1;
    blur121(F, PW, PH, tmp); blur121(F, PW, PH, tmp);
    const before = segs.length; marching(F, PW, PH, .5, segs); segRanges.push([before, segs.length]);
    for (let j=before;j<segs.length;j++) segs[j] -= .5;
  }
  const CC = components(lab, w, h), dist = new Float32Array(n);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){ const i=y*w+x, l=lab[i];
    dist[i] = (l<0 || x===0 || y===0 || x===w-1 || y===h-1 || lab[i-1]!==l || lab[i+1]!==l || lab[i-w]!==l || lab[i+w]!==l) ? 0 : 1e9; }
  for (let y=1;y<h;y++) for (let x=1;x<w-1;x++){ const i=y*w+x; if (!dist[i]) continue; dist[i] = Math.min(dist[i], dist[i-1]+1, dist[i-w]+1, dist[i-w-1]+1.414, dist[i-w+1]+1.414); }
  for (let y=h-2;y>=0;y--) for (let x=w-2;x>0;x--){ const i=y*w+x; if (!dist[i]) continue; dist[i] = Math.min(dist[i], dist[i+1]+1, dist[i+w]+1, dist[i+w+1]+1.414, dist[i+w-1]+1.414); }
  const numbers = [];
  for (let c2=0;c2<CC.count;c2++){ let bd=0, bi=-1; const s0=CC.starts[c2], s1=s0+CC.sizes[c2];
    for (let j=s0;j<s1;j++){ const p=CC.order[j]; if (dist[p]>bd){ bd=dist[p]; bi=p; } }
    if (bi>=0 && bd>=3.2) numbers.push({x:bi%w+.5, y:((bi/w)|0)+.5, label:lab[bi], r:bd}); }
  const lum = new Float32Array(n); for (let i=0;i<n;i++) lum[i] = op[i] ? (.299*R[i] + .587*Gc[i] + .114*B[i]) : 255;
  const tb = new Float32Array(n); blur121(lum, w, h, tb);
  const mag = new Float32Array(n), dir = new Uint8Array(n);
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){ const i=y*w+x;
    const gx = -lum[i-w-1]-2*lum[i-1]-lum[i+w-1]+lum[i-w+1]+2*lum[i+1]+lum[i+w+1];
    const gy = -lum[i-w-1]-2*lum[i-w]-lum[i-w+1]+lum[i+w-1]+2*lum[i+w]+lum[i+w+1];
    mag[i] = Math.hypot(gx, gy); let a = Math.atan2(gy, gx) * 180/Math.PI; if (a < 0) a += 180;
    dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3; }
  const nms = new Float32Array(n);
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){ const i=y*w+x, m=mag[i]; if (m<1) continue; let a, b;
    switch (dir[i]){ case 0: a=mag[i-1]; b=mag[i+1]; break; case 1: a=mag[i-w-1]; b=mag[i+w+1]; break; case 2: a=mag[i-w]; b=mag[i+w]; break; default: a=mag[i-w+1]; b=mag[i+w-1]; }
    if (m >= a && m >= b) nms[i] = m; }
  const vals = []; for (let i=0;i<n;i+=3) if (nms[i] > 0) vals.push(nms[i]); vals.sort((a,b)=>a-b);
  const hi = vals.length ? Math.max(40, vals[Math.floor(vals.length * clamp(.55 - L.detail*.042, .05, .95))]) : 1e9, lo = hi * .45;
  const edge = new Uint8Array(n), stack = [];
  for (let i=0;i<n;i++) if (nms[i] >= hi && !edge[i]){ edge[i]=1; stack.push(i);
    while (stack.length){ const p = stack.pop(), px = p % w;
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){ const qx = px+dx; if (qx<0||qx>=w) continue; const q = p+dy*w+dx; if (q<0||q>=n||edge[q]) continue; if (nms[q] >= lo){ edge[q]=1; stack.push(q); } } } }
  const minLen = 6 + (10-L.detail)*2, seen = new Uint8Array(n);
  for (let i=0;i<n;i++){ if (!edge[i] || seen[i]) continue; const list=[i]; seen[i]=1;
    for (let j=0;j<list.length;j++){ const p=list[j], px=p%w; for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){ const qx=px+dx; if (qx<0||qx>=w) continue; const q=p+dy*w+dx; if (q<0||q>=n||seen[q]||!edge[q]) continue; seen[q]=1; list.push(q); } }
    if (list.length < minLen) for (const p of list) edge[p] = 0; }
  const esegs = [];
  for (let y=0;y<h-1;y++) for (let x=0;x<w;x++){ const i=y*w+x; if (!edge[i]) continue; const cx0=x+.5, cy0=y+.5;
    const r = x<w-1 && edge[i+1], d = edge[i+w], dr = x<w-1 && edge[i+w+1], dl = x>0 && edge[i+w-1];
    if (r) esegs.push(cx0,cy0,cx0+1,cy0); if (d) esegs.push(cx0,cy0,cx0,cy0+1);
    if (dr && !r && !d) esegs.push(cx0,cy0,cx0+1,cy0+1); if (dl && !d && !(x>0 && edge[i-1])) esegs.push(cx0,cy0,cx0-1,cy0+1); }
  const ps2 = Math.min(1, 1400 / Math.max(img.width, img.height)), photo = mk(Math.round(img.width*ps2), Math.round(img.height*ps2));
  photo.getContext('2d').drawImage(img, 0, 0, photo.width, photo.height);
  const D = { w, h, lab, op, palette, dist, edge, segRanges, segs:new Float32Array(segs), esegs:new Float32Array(esegs), numbers, photo };
  const p = new Path2D(), e = new Path2D();
  for (let i=0;i<D.segs.length;i+=4){ p.moveTo(D.segs[i], D.segs[i+1]); p.lineTo(D.segs[i+2], D.segs[i+3]); }
  for (let i=0;i<D.esegs.length;i+=4){ e.moveTo(D.esegs[i], D.esegs[i+1]); e.lineTo(D.esegs[i+2], D.esegs[i+3]); }
  D.path = p; D.epath = e;
  L.data = D; L.focus = -1; makeFill(L);
  console.log('guide built in', Math.round(performance.now() - t0), 'ms');
}
function makeFill(L){
  const D = L.data, c = mk(D.w, D.h), ctx = c.getContext('2d'), id = ctx.createImageData(D.w, D.h);
  for (let i=0;i<D.w*D.h;i++){ const l = D.lab[i]; if (l < 0) continue; const col = D.palette[l];
    id.data[i*4]=col[0]; id.data[i*4+1]=col[1]; id.data[i*4+2]=col[2]; id.data[i*4+3] = L.focus < 0 || l === L.focus ? 255 : 60; }
  ctx.putImageData(id, 0, 0); D.fill = c;
}
// handle positions (wall metres) for the arrange gizmo
function layerHandles(L){
  const hw = L.wid/2, hh = L.hgt/2, c = Math.cos(L.rot), s = Math.sin(L.rot), T = (x, y) => [L.cx + x*c - y*s, L.cy + x*s + y*c];
  const rotOff = Math.max(.1, L.hgt * .12);
  return { corners:[T(-hw,-hh), T(hw,-hh), T(hw,hh), T(-hw,hh)], rot:T(0, hh + rotOff), top:T(0, hh) };
}
function drawWallGuide(W){
  const g = W.gctx, gp = W.gppm, GH = W.guideCanvas.height;
  g.setTransform(1,0,0,1,0,0); g.clearRect(0, 0, W.guideCanvas.width, GH);
  for (const L of W.layers){
    if (!L.data) continue;
    const D = L.data, s = (L.hgt / D.h) * gp, shapes = L.mode !== 'lines', lines = L.mode !== 'shapes';
    g.save();
    g.translate(L.cx * gp, GH - L.cy * gp); g.rotate(-L.rot); g.translate(-D.w/2 * s, -D.h/2 * s);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (L.show.photo){ g.globalAlpha = .45 * L.opacity / .6; g.drawImage(D.photo, 0, 0, D.w*s, D.h*s); }
    if (L.show.fill && shapes){ g.globalAlpha = .4 * L.opacity / .6; g.drawImage(D.fill, 0, 0, D.w*s, D.h*s); }
    g.globalAlpha = Math.min(1, L.opacity / .6);
    if (L.show.lines){
      g.save(); g.scale(s, s); g.lineCap = 'round'; g.lineJoin = 'round';
      const dark = L.lineColor === '#111111';
      const draw = path => { g.strokeStyle = dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.6)'; g.lineWidth = (L.lineW + 2.4)/s; g.stroke(path); g.strokeStyle = L.lineColor; g.lineWidth = L.lineW/s; g.stroke(path); };
      if (shapes) draw(D.path); if (lines) draw(D.epath);
      g.restore();
    }
    if (L.show.numbers && shapes){
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const nb of D.numbers){
        const fs = Math.min(40, nb.r * s * 1.05); if (fs < 8) continue;
        if (L.focus >= 0 && nb.label !== L.focus) continue;
        g.font = `600 ${fs|0}px "IBM Plex Mono", ui-monospace, monospace`;
        g.lineWidth = Math.max(2.5, fs*.22); g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(String(nb.label+1), nb.x*s, nb.y*s);
        g.fillStyle = '#fff'; g.fillText(String(nb.label+1), nb.x*s, nb.y*s);
      }
    }
    g.restore();
  }
  // arrange gizmo for the selected layer
  const L = G.sel;
  if (S.mode === 'arrange' && L && L.wall === W){
    const H = layerHandles(L), P = ([u, v]) => [u*gp, GH - v*gp];
    g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = '#ffd21f'; g.setLineDash([8, 6]);
    g.beginPath(); H.corners.forEach((c, i) => { const [x, y] = P(c); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); g.setLineDash([]);
    const [tx, ty] = P(H.top), [rx, ry] = P(H.rot); g.beginPath(); g.moveTo(tx, ty); g.lineTo(rx, ry); g.stroke();
    const hs = Math.max(7, .03 * gp);
    g.fillStyle = '#ffd21f'; g.strokeStyle = '#1a1600';
    for (const c of H.corners){ const [x, y] = P(c); g.fillRect(x-hs, y-hs, hs*2, hs*2); g.strokeRect(x-hs, y-hs, hs*2, hs*2); }
    g.beginPath(); g.arc(rx, ry, hs*1.1, 0, Math.PI*2); g.fill(); g.stroke();
  }
  W.guideTex.needsUpdate = true;
}
function redrawAllGuides(){ walls.forEach(drawWallGuide); }

function makeSampleImage(){
  const c = mk(1000, 640), x = c.getContext('2d');
  x.save(); x.translate(330, 330); x.beginPath();
  for (let i=0;i<24;i++){ const a = i/24*Math.PI*2, r = i%2 ? 160 : 290; x.lineTo(Math.cos(a)*r, Math.sin(a)*r*.8); }
  x.closePath(); x.fillStyle = '#ffd21f'; x.fill(); x.lineWidth = 14; x.strokeStyle = '#1b1636'; x.stroke(); x.restore();
  for (const [bx,by,br,bc] of [[860,120,70,'#3aa6ff'],[930,250,36,'#7df2b5'],[110,520,52,'#3aa6ff'],[790,520,44,'#ff7ab8']]){
    x.beginPath(); x.arc(bx,by,br,0,Math.PI*2); x.fillStyle = bc; x.fill(); x.lineWidth = 12; x.strokeStyle = '#1b1636'; x.stroke();
    x.beginPath(); x.arc(bx-br*.35,by-br*.35,br*.22,0,Math.PI*2); x.fillStyle = '#fff'; x.fill(); }
  x.font = '172px Bungee, "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.save(); x.translate(520, 340); x.rotate(-.08);
  x.fillStyle = '#5a1fa0'; x.fillText('FRESH', 16, 18);
  x.lineWidth = 34; x.strokeStyle = '#1b1636'; x.strokeText('FRESH', 0, 0);
  x.fillStyle = '#ff2fa8'; x.fillText('FRESH', 0, 0);
  x.save(); x.beginPath(); x.rect(-600, 10, 1200, 200); x.clip(); x.fillStyle = '#ff8a1c'; x.fillText('FRESH', 0, 0); x.restore();
  x.lineWidth = 6; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(-300, -52); x.lineTo(-250, -52); x.stroke();
  x.restore();
  return c;
}
