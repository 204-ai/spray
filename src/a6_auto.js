/* ================================================================
   Auto paint: plans a layer like a writer would, then drives the can
   ================================================================ */
const AP = { all:true, running:false, paused:false, speed:8, sketch:true, hide:true, clean:false, record:false, frame:true, ops:[], i:0, phase:'travel', wait:0,
  doneT:0, estT:1, clock:0, sprayT:0, x:0, y:0, seg:0, segPos:0, label:'', prevGuide:true, layer:null, wall:null, prevTool:'spray' };
function capFor(wt){
  for (const i of [5,4,2,1,0]){ const c = CAPS[i], d = (wt/2 - c.r0)/c.k; if (d >= .04 && d <= .3) return {cap:i, d, w:wt}; }
  if (wt > .05){ const c = CAPS[5]; return {cap:5, d:.3, w:2*(c.r0 + c.k*.3)}; }
  const c = CAPS[0], d = clamp((wt/2 - c.r0)/c.k, .025, .3); return {cap:0, d, w:2*(c.r0 + c.k*d)};
}
const vFor = (capI, w, cov, pr) => clamp(cov * CAPS[capI].flow * S.flow * (.55 + .45*pr) / w, .05, 1.6);
function decimate(pts, minD){
  if (pts.length < 4) return pts;
  const out = [pts[0], pts[1]];
  for (let i=2;i<pts.length;i+=2){ const dx = pts[i] - out[out.length-2], dy = pts[i+1] - out[out.length-1]; if (dx*dx + dy*dy >= minD*minD || i === pts.length-2) out.push(pts[i], pts[i+1]); }
  return out;
}
function linkSegs(a, s0, s1){
  const key = (x, y) => Math.round(x*256) + ':' + Math.round(y*256), m = new Map(), nseg = (s1 - s0) >> 2, used = new Uint8Array(nseg), lines = [];
  for (let k=0;k<nseg;k++){ const i = s0 + k*4; for (const e of [0, 2]){ const kk = key(a[i+e], a[i+e+1]); let l = m.get(kk); if (!l) m.set(kk, l = []); l.push(k); } }
  const walk = (x, y, out) => { for (;;){ const l = m.get(key(x, y)); let j = -1; if (l) for (const c of l) if (!used[c]){ j = c; break; } if (j < 0) return;
    used[j] = 1; const i = s0 + j*4, same = key(a[i], a[i+1]) === key(x, y); x = same ? a[i+2] : a[i]; y = same ? a[i+3] : a[i+1]; out.push(x, y); } };
  for (let k=0;k<nseg;k++){ if (used[k]) continue; used[k] = 1; const i = s0 + k*4;
    const fwd = [a[i], a[i+1], a[i+2], a[i+3]]; walk(a[i+2], a[i+3], fwd); const back = []; walk(a[i], a[i+1], back);
    const pts = []; for (let j=back.length-2;j>=0;j-=2) pts.push(back[j], back[j+1]); for (const v of fwd) pts.push(v);
    lines.push(decimate(pts, 1.2)); }
  return lines;
}
function polyLen(p){ let L = 0; for (let i=2;i<p.length;i+=2) L += Math.hypot(p[i]-p[i-2], p[i+1]-p[i-1]); return L; }
function smoothPts(p, passes){ for (let k=0;k<passes;k++){ const q = p.slice(); for (let i=2;i<p.length-2;i++) q[i] = (p[i-2] + 2*p[i] + p[i+2]) / 4; p = q; } return p; }
function traceChains(mask, w, h, minLen){
  const n = w*h, vis = new Uint8Array(n), chains = [], deg = new Uint8Array(n), N8 = [-1, 1, -w, w, -w-1, -w+1, w-1, w+1];
  const ok = (p, q) => q >= 0 && q < n && Math.abs((p % w) - (q % w)) <= 1 && mask[q];
  const starts = [];
  for (let p=0;p<n;p++){ if (!mask[p]) continue; let d = 0; for (const o of N8) if (ok(p, p+o)) d++; deg[p] = d; starts.push(p); }
  starts.sort((a, b) => deg[a] - deg[b]);
  for (const p0 of starts){
    if (vis[p0]) continue; const chain = [p0]; vis[p0] = 1; let cur = p0;
    for (;;){ let nx = -1; for (const o of N8){ const q = cur + o; if (ok(cur, q) && !vis[q]){ nx = q; break; } } if (nx < 0) break; vis[nx] = 1; chain.push(nx); cur = nx; }
    if (chain.length >= minLen){ const pts = []; for (const q of chain) pts.push(q % w + .5, ((q / w)|0) + .5); chains.push({pts:decimate(smoothPts(pts, 2), 1.5), idx:chain}); }
  }
  return chains;
}
function planAuto(L){
  const D = L.data, W = L.wall, w = D.w, h = D.h, lab = D.lab, dist = D.dist, n = w*h;
  const mpp = L.hgt / h;
  const CC = components(lab, w, h), cmax = new Float32Array(CC.count), isLine = new Uint8Array(CC.count);
  for (let c=0;c<CC.count;c++){ const s0 = CC.starts[c], s1 = s0 + CC.sizes[c]; let m = 0; for (let j=s0;j<s1;j++){ const d = dist[CC.order[j]]; if (d > m) m = d; } cmax[c] = m; isLine[c] = 2*(m + .5)*mpp <= .032 ? 1 : 0; }
  const KK = D.palette.length, hexOf = l => hex(D.palette[l][0], D.palette[l][1], D.palette[l][2]);
  const lumOf = l => .299*D.palette[l][0] + .587*D.palette[l][1] + .114*D.palette[l][2];
  const ops = []; let est = 0, lastTool = '', pass = [], pen = [L.cx, L.cy];
  // A pass is all the strokes between two tool changes. Drop the fiddly ones a person would skip,
  // then order the rest so the hand moves to the nearest next stroke instead of zig-zagging around.
  const endPass = () => {
    if (!pass.length) return;
    const keep = pass[0].keep; let list = pass.filter(s => s.len >= s.min); pass = [];
    if (!keep){
      const out = [];
      while (list.length){
        let bi = 0, bd = 1e18, rev = false;
        for (let i=0;i<list.length;i++){ const p = list[i].pts, m = p.length;
          const d0 = (p[0]-pen[0])**2 + (p[1]-pen[1])**2, d1 = (p[m-2]-pen[0])**2 + (p[m-1]-pen[1])**2;
          if (d0 < bd){ bd = d0; bi = i; rev = false; } if (d1 < bd){ bd = d1; bi = i; rev = true; } }
        const s = list.splice(bi, 1)[0];
        if (rev){ const p = s.pts, q = new Float32Array(p.length); for (let i=0;i<p.length;i+=2){ q[i] = p[p.length-2-i]; q[i+1] = p[p.length-1-i]; } s.pts = q; }
        out.push(s); pen = [s.pts[s.pts.length-2], s.pts[s.pts.length-1]];
      }
      list = out;
    } else if (list.length){ const p = list[list.length-1].pts; pen = [p[p.length-2], p[p.length-1]]; }
    for (const s of list){ ops.push({op:'stroke', pts:s.pts, w:s.w, d:s.d, cov:s.cov}); est += s.len / vFor(s.cap, s.w, s.cov, .85) + .3; }
  };
  const tool = (cf, hx, name, label) => { endPass(); const k = cf.cap + hx + cf.d.toFixed(3); if (k === lastTool) return; lastTool = k; ops.push({op:'tool', cap:cf.cap, d:cf.d, hex:hx, name, label}); est += .9; };
  const inWall = (u, v) => u > .004 && u < W.w - .004 && v > .004 && v < W.h - .004;
  const stroke = (pw, cf, cov, opt) => {
    opt = opt || {}; let run = [];
    const min = opt.min !== undefined ? opt.min : Math.max(.035, cf.w * 3);
    const flush = () => { if (run.length >= 4) pass.push({ pts:Float32Array.from(run), len:polyLen(run), min, keep:!!opt.keep, cap:cf.cap, w:cf.w, d:cf.d, cov }); run = []; };
    for (let i=0;i<pw.length;i+=2){ const [u, v] = L.toWall(pw[i], pw[i+1]); if (inWall(u, v)) run.push(u, v); else flush(); }
    flush();
  };
  const shapes = L.mode !== 'lines', edges = L.mode !== 'shapes';
  if (shapes){
    const contours = D.segRanges.map(r => linkSegs(D.segs, r[0], r[1]));
    if (AP.sketch){ const sk = capFor(.01); tool(sk, hexOf(0), 'Sketch', 'Sketching the shapes');
      for (let l=0; l<Math.min(KK, 6); l++) for (const pl of contours[l]) if (polyLen(pl) > 30) stroke(pl, sk, .22, {min:.08}); }
    for (let l=0; l<KK; l++){
      let md = 0, any = false;
      for (let c=0;c<CC.count;c++){ if (isLine[c] || lab[CC.order[CC.starts[c]]] !== l) continue; any = true; if (cmax[c] > md) md = cmax[c]; }
      if (!any) continue;
      const cf = capFor(clamp(md * mpp * 1.2, .012, .11));
      tool(cf, hexOf(l), `Guide #${l+1}`, `Filling colour ${l+1} of ${KK}`);
      const spacing = Math.max(1, .5 * cf.w / mpp), erode = .3 * (cf.w/2) / mpp, ext = .15 * (cf.w/2) / mpp;
      const inside = p => { if (lab[p] !== l) return false; const c = CC.comp[p]; return !isLine[c] && dist[p] >= Math.min(erode, cmax[c] * .5); };
      const runs = [], rows = []; let r = 0;
      for (let yy = spacing/2; yy < h; yy += spacing, r++){
        const y = yy|0, row = []; let x = 0;
        while (x < w){ while (x < w && !inside(y*w + x)) x++; if (x >= w) break; const a = x; while (x < w && inside(y*w + x)) x++;
          const run = {r, y:yy, a:a - ext, b:x + ext, used:false}; row.push(run); runs.push(run); }
        rows.push(row);
      }
      if (!runs.length) continue;
      let px = runs[0].a, py = runs[0].y, last = null, pts = [];
      for (let done = 0; done < runs.length; done++){
        let best = null, bd = 1e18, bdir = 1;
        const consider = run => { if (run.used) return; for (const [ex, dir] of [[run.a, 1], [run.b, -1]]){ const d = (ex - px)**2 + (run.y - py)**2; if (d < bd){ bd = d; best = run; bdir = dir; } } };
        if (last){ for (const rr of [last.r + 1, last.r, last.r - 1]) if (rows[rr]) rows[rr].forEach(consider); }
        if (!best || bd > (spacing*3)**2) runs.forEach(consider);
        if (!best) break;
        const sx = bdir > 0 ? best.a : best.b, ex = bdir > 0 ? best.b : best.a;
        const midOk = last && Math.abs(best.r - last.r) === 1 && bd <= (spacing*2.6)**2 && lab[clamp(((py + best.y)/2)|0, 0, h-1)*w + clamp(((px + sx)/2)|0, 0, w-1)] === l;
        if (!midOk && pts.length){ stroke(pts, cf, .8, {keep:true, min:cf.w*.5}); pts = []; }
        pts.push(sx, best.y, ex, best.y); best.used = true; last = best; px = ex; py = best.y;
      }
      if (pts.length) stroke(pts, cf, .8, {keep:true, min:cf.w*.5});
      const cc = capFor(clamp(cf.w * .3, .005, .02));
      if (cc.w < cf.w * .8){
        tool(cc, hexOf(l), `Guide #${l+1}`, `Cutting in the edges of colour ${l+1}`);
        const inset = .55 * (cc.w/2) / mpp;
        for (const pl of contours[l]){
          if (polyLen(pl) < 8) continue;
          const q = [];
          for (let i=0;i<pl.length;i+=2){
            const ia = Math.max(0, i-2), ib = Math.min(pl.length-2, i+2); let tx = pl[ib] - pl[ia], ty = pl[ib+1] - pl[ia+1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            let nx = -ty, ny = tx; const sx = clamp((pl[i] + nx*1.5)|0, 0, w-1), sy = clamp((pl[i+1] + ny*1.5)|0, 0, h-1);
            if (lab[sy*w + sx] !== l){ nx = -nx; ny = -ny; }
            q.push(pl[i] + nx*inset, pl[i+1] + ny*inset);
          }
          stroke(q, cc, .62, {min:Math.max(.05, cc.w*5)});
        }
      }
    }
    for (let l=0; l<KK; l++){
      const mask = new Uint8Array(n); let any = false;
      for (let p=0;p<n;p++){
        if (lab[p] !== l) continue; const c = CC.comp[p]; if (!isLine[c]) continue;
        if (cmax[c] < 1.5){ mask[p] = 1; any = true; continue; }
        const d = dist[p]; if (d < .5) continue; const x = p % w;
        const dl = x > 0 ? dist[p-1] : 0, dr = x < w-1 ? dist[p+1] : 0, du = p >= w ? dist[p-w] : 0, dd = p < n-w ? dist[p+w] : 0;
        if ((d >= dl && d >= dr) || (d >= du && d >= dd)){ mask[p] = 1; any = true; }
      }
      if (!any) continue;
      const chains = traceChains(mask, w, h, 3); if (!chains.length) continue;
      const ds = []; for (const ch of chains) for (const q of ch.idx) ds.push(dist[q]); ds.sort((a, b) => a - b);
      const cf = capFor(clamp(2 * (ds[ds.length >> 1] + .7) * mpp * 1.05, .004, .035));
      tool(cf, hexOf(l), `Guide #${l+1}`, `Lining colour ${l+1}`);
      chains.sort((a, b) => b.pts.length - a.pts.length);
      for (const ch of chains) stroke(ch.pts, cf, .75, {min:Math.max(.04, cf.w*3)});
    }
  }
  if (edges && D.edge){
    let dk = 0; for (let l=1; l<KK; l++) if (lumOf(l) < lumOf(dk)) dk = l;
    const hx = lumOf(dk) < 90 ? hexOf(dk) : '#121214', cf = capFor(.007);
    tool(cf, hx, 'Outline', 'Final outline');
    const chains = traceChains(D.edge, w, h, 4); chains.sort((a, b) => b.pts.length - a.pts.length);
    for (const ch of chains) stroke(ch.pts, cf, .75, {min:.05});
  }
  endPass();
  return { ops, est };
}
function apLayers(L){ return AP.all ? L.wall.layers.filter(l => l.data) : [L]; }
// plan several images on one wall, left to right, as one continuous session
function planMany(list){
  list = [...list].sort((a, b) => a.cx - b.cx);
  const ops = []; let est = 0;
  list.forEach((l, i) => { const p = planAuto(l);
    for (const o of p.ops){ if (o.op === 'tool' && list.length > 1) o.label = `Image ${i+1} of ${list.length} · ${o.label}`; ops.push(o); }
    est += p.est; });
  return { ops, est, layers:list };
}
function apStart(){
  if (AP.running) return;
  const L = G.sel;
  if (!L || !L.data){ toast('Pick an image first. Auto paint paints the selected image, or every image on its wall.'); return; }
  let plan; try { plan = planMany(apLayers(L)); } catch (e) { console.error(e); toast('Auto paint could not plan that image'); return; }
  if (!plan.ops.some(o => o.op === 'stroke')){ toast('The images are off the wall. Move them onto the wall first.'); return; }
  initAudio(); pushUndo(L.wall);
  if (AP.clean) L.wall.clearPaint();
  Object.assign(AP, { running:true, paused:false, ops:plan.ops, estT:plan.est, i:0, phase:'travel', wait:0, doneT:0, clock:0, sprayT:0,
    x: me.wall === L.wall ? me.u : L.cx, y: me.wall === L.wall ? me.v : L.cy, seg:0, segPos:0, prevGuide:G.visible, layer:L, layers:plan.layers, wall:L.wall, prevTool:S.tool, tv:0, prevKit:{cap:S.cap, hex:S.hex, name:S.colorName, dist:S.dist} });
  lastWall = L.wall;
  setTool('spray');
  me.wall = L.wall; me.visible = true;
  if (AP.hide) setGuideVisible(false);
  if (S.mode !== 'paint') setMode('paint');
  setErase(false); P.down = P.space = false;
  if (AP.frame || AP.record) frameLayers(plan.layers, !AP.record);
  if (AP.record) startRecording('timelapse');
  apUI();
  toast(`Auto painting ${plan.layers.length > 1 ? plan.layers.length + ' images, ' : ''}${plan.ops.filter(o => o.op === 'tool').length} passes. Esc stops, Ctrl+Z removes it.`);
}
function apFinish(done){
  if (!AP.running) return;
  AP.running = false; AP.paused = false; me.prev = null;
  if (AP.hide) setGuideVisible(AP.prevGuide);
  if (AP.prevKit){ selectCap(AP.prevKit.cap); setColor(AP.prevKit.hex, AP.prevKit.name); setDist(AP.prevKit.dist); }
  if (AP.prevTool !== 'spray') setTool(AP.prevTool);
  apUI(); toast(done ? 'Auto paint finished. Ctrl+Z takes the whole piece off.' : 'Auto paint stopped');
  if (REC.active && REC.kind === 'timelapse') setTimeout(stopRecording, done ? 1600 : 200);
}
function apPlace(op, spraying){
  const W = AP.wall;
  const jx = (vnoise(AP.clock*2.7, 1.3, 401) - .5) * .0035, jy = (vnoise(AP.clock*2.3, 7.1, 402) - .5) * .0035;
  const dz = spraying ? op.d * (1 + (vnoise(AP.clock*1.6, 3.7, 403) - .5) * .18) : Math.max(op.d * 1.5, op.d + .03);
  me.wall = W; me.u = clamp(AP.x + jx, .002, W.w - .002); me.v = clamp(AP.y + jy, .002, W.h - .002);
  me.d += (dz - me.d) * (spraying ? 1 : .2);
}
function apStep(hh){
  AP.clock += hh;
  if (AP.wait > 0){ AP.wait -= hh; AP.doneT += hh; painterTick(me, hh, false); return false; }
  const op = AP.ops[AP.i];
  if (!op || AP.wall.disposed){ apFinish(!op); return false; }
  if (op.op === 'tool'){
    selectCap(op.cap); setColor(op.hex, op.name); setDist(op.d);
    me.pressure = 1; me.shake = .7; AP.wait = .9; AP.sprayT = 0; AP.label = op.label; AP.i++; AP.phase = 'travel';
    return false;
  }
  if (op.op === 'shake'){ me.pressure = 1; me.shake = .7; if (A.ctx && AP.speed <= 12) rattle(8); AP.wait = .8; AP.sprayT = 0; AP.i++; return false; }
  const pts = op.pts;
  if (AP.phase === 'travel'){
    const dx = pts[0] - AP.x, dy = pts[1] - AP.y, d = Math.hypot(dx, dy);
    AP.tv = Math.min(AP.tv + hh * 3.5, 1.1, Math.sqrt(2 * 2.5 * d) + .05);   // ease in, ease out (m/s)
    const step = AP.tv * hh;
    if (d <= step){ AP.x = pts[0]; AP.y = pts[1]; AP.phase = 'spray'; AP.seg = 0; AP.segPos = 0; me.prev = null; AP.tv = 0; AP.wait = d > .05 ? .1 : .03; }
    else { AP.x += dx/d*step; AP.y += dy/d*step; }
    apPlace(op, false); painterTick(me, hh, false); AP.doneT += hh * .5; return false;
  }
  const v = vFor(me.cap, op.w, op.cov, me.pressure) * (1 + .12*Math.sin(AP.clock*5.3 + AP.i));
  let adv = v * hh; const last = (pts.length >> 1) - 1;
  while (adv > 0 && AP.seg < last){
    const ax = pts[AP.seg*2], ay = pts[AP.seg*2+1], bx = pts[AP.seg*2+2], by = pts[AP.seg*2+3], Lg = Math.hypot(bx-ax, by-ay), rem = Lg - AP.segPos;
    if (adv < rem){ AP.segPos += adv; adv = 0; const t = Lg > 0 ? AP.segPos / Lg : 1; AP.x = ax + (bx-ax)*t; AP.y = ay + (by-ay)*t; }
    else { adv -= rem; AP.seg++; AP.segPos = 0; AP.x = bx; AP.y = by; }
  }
  apPlace(op, true); painterTick(me, hh, true); netSample(me, hh); AP.sprayT += hh; AP.doneT += hh;
  if (AP.seg >= last){ AP.i++; AP.phase = 'travel'; me.prev = null; if (AP.sprayT > 22) AP.ops.splice(AP.i, 0, {op:'shake'}); }
  return true;
}
function apTick(dt){
  let spr = false;
  if (!AP.paused){
    let sim = dt * AP.speed, guard = 0;
    while (sim > 1e-6 && AP.running && guard++ < 3000){ const hh = Math.min(sim, 1/90); sim -= hh; spr = apStep(hh); }
  } else painterTick(me, dt, false);
  const simDt = AP.paused ? dt : dt * AP.speed;
  if (S.drips) updateDrips(AP.wall, simDt);
  updateWet(AP.wall, simDt);
  return spr && AP.running;
}
function apEstimate(){
  const L = G.sel; if (!L || !L.data) return null;
  try { const sec = planMany(apLayers(L)).est / AP.speed; return sec < 90 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec/60)} min`; } catch (e) { return null; }
}
function apUI(){
  $('#apStart').disabled = AP.running; $('#apPause').disabled = !AP.running; $('#apStop').disabled = !AP.running;
  $('#apPause').textContent = AP.paused ? 'Resume' : 'Pause';
  if (!AP.running){
    updateModePill(); $('#apBar').style.width = '0%';
    const est = apEstimate();
    const nImg = G.sel && G.sel.data ? apLayers(G.sel).length : 0;
    $('#apStep').textContent = est ? `Ready to paint ${nImg > 1 ? 'all ' + nImg + ' images on this wall' : 'the selected image'}. Takes about ${est} at ${AP.speed}×.` : 'Select an image layer to give auto paint something to paint.';
  }
}
function apProgressUI(){
  const pct = clamp(AP.doneT / Math.max(1, AP.estT), 0, .99) * 100;
  $('#apBar').style.width = pct.toFixed(1) + '%';
  $('#apStep').textContent = `${AP.paused ? 'Paused · ' : ''}${AP.label} · ${CAPS[me.cap].name}`;
  const m = $('#hudMode'); m.textContent = `AUTO ${pct|0}%`; m.className = 'mode';
}
// place the camera square-on to a layer (or wall) so the whole thing is in view
function frameLayers(list, smoothMove){
  const W = list[0].wall; let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
  for (const l of list) for (const [u, v] of layerHandles(l).corners){ u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
  u0 = Math.max(0, u0); v0 = Math.max(0, v0); u1 = Math.min(W.w, u1); v1 = Math.min(W.h, v1);
  const size = Math.max(v1 - v0, (u1 - u0) / camera.aspect) * 1.3, r = size / 2 / Math.tan(camera.fov * Math.PI / 360);
  flyTo(W.toWorld((u0 + u1)/2, (v0 + v1)/2, 0), W.rot, .04, clamp(r, 1, 40), smoothMove);
}
function frameLayer(L, smoothMove){
  const W = L.wall, [u, v] = [L.cx, L.cy], size = Math.max(L.hgt, L.wid / camera.aspect) * 1.35;
  const r = size / 2 / Math.tan(camera.fov * Math.PI / 360);
  flyTo(W.toWorld(u, v, 0), W.rot, .04, clamp(r, 1, 40), smoothMove);
}
