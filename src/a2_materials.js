/* ================================================================
   Tileable procedural wall materials.
   Each material fills a square tile (tileM metres): albedo RGBA, plus
   a data map R = height, G = gloss, B = ambient occlusion.
   ================================================================ */
function pnoise(x, y, px, py, s){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = hash2(x0,y0,s), b = hash2(x1,y0,s), c = hash2(x0,y1,s), d = hash2(x1,y1,s);
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
}
// periodic fBm over tile coords u,v in [0,1); px/py = base cells across the tile
function pfbm(u, v, px, py, s, oct){ let f=0, a=.5, sum=0, X=px, Y=py; for (let i=0;i<oct;i++){ f += a*pnoise(u*X, v*Y, X, Y, s+i*31); sum += a; X*=2; Y*=2; a*=.5; } return f/sum; }
function pfield(R, px, py, oct, s){ const a = new Float32Array(R*R); for (let y=0;y<R;y++) for (let x=0;x<R;x++) a[y*R+x] = pfbm(x/R, y/R, px, py, s, oct); return {R, a}; }
function ps(F, u, v){
  const R = F.R; let x = u*R - .5, y = v*R - .5; x = ((x % R) + R) % R; y = ((y % R) + R) % R;
  const xi = x|0, yi = y|0, xf = x-xi, yf = y-yi, x1 = (xi+1) % R, y1 = (yi+1) % R, A = F.a;
  return (A[yi*R+xi]*(1-xf) + A[yi*R+x1]*xf)*(1-yf) + (A[y1*R+xi]*(1-xf) + A[y1*R+x1]*xf)*yf;
}
// periodic Worley: returns [f1, f2, cellId] in cell units
function worley(u, v, p, s){
  const X = u*p, Y = v*p, cx = Math.floor(X), cy = Math.floor(Y); let f1 = 9, f2 = 9, id = 0;
  for (let j=-1;j<=1;j++) for (let i=-1;i<=1;i++){
    const gx = cx+i, gy = cy+j, wx = ((gx % p) + p) % p, wy = ((gy % p) + p) % p;
    const ox = gx + .15 + .7*hash2(wx,wy,s), oy = gy + .15 + .7*hash2(wx,wy,s+1), d = Math.hypot(X-ox, Y-oy);
    if (d < f1){ f2 = f1; f1 = d; id = wy*p + wx; } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
function genCtx(N, M, A, H){
  const ppm = N / M;
  return { ppm, R: Math.min(N, 512), r2: Math.min(N, 256),
    put(i, r, g, b, h, gl, ao){ const k = i*4; A[k]=r; A[k+1]=g; A[k+2]=b; A[k+3]=255; H[k]=clamp(h,0,1)*255; H[k+1]=clamp(gl,0,1)*255; H[k+2]=clamp(ao,0,1)*255; H[k+3]=255; } };
}

/* ---- brick family ---- */
function genBrick(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm, m = .011, cols = Math.round(M/.226), rows = Math.round(M/.076/2)*2, cw = M/cols, rh = M/rows, bw = cw - m, bh = rh - m;   // whole bricks per tile, so it repeats without a seam
  const fMid = pfield(C.R, 40, 40, 3, o.seed), fBig = pfield(C.r2, 4, 4, 4, o.seed+5), fSp = pfield(C.R, 110, 110, 2, o.seed+9), fPaint = pfield(C.r2, 9, 9, 4, o.seed+13);
  const fChip = pfield(C.R, 26, 60, 3, o.seed+17), fDrag = pfield(C.R, 10, 150, 2, o.seed+21), fSalt = pfield(C.r2, 5, 7, 4, o.seed+25), fWob = pfield(C.r2, 6, 24, 2, o.seed+29);
  for (let y=0;y<N;y++){ const v = y/N;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N;
      // courses are never perfectly level: the bed joints wander a few millimetres
      const Y = y/ppm + (ps(fWob,u,v) - .5)*.007, row = ((Math.floor(Y/rh) % rows) + rows) % rows, fy = Y - Math.floor(Y/rh)*rh;
      const X = ((x/ppm + (row&1)*cw*.5 + (hash2(row, 7, o.seed+31) - .5)*.02) % M + M) % M, col = Math.floor(X/cw) % cols, fx = X - Math.floor(X/cw)*cw;
      const n = ps(fMid,u,v), s = ps(fBig,u,v), sp = ps(fSp,u,v), g = hash2(x,y,o.seed), g2 = hash2(x>>1,y>>1,o.seed+1);
      const hb = hash2(col,row,o.seed+3), hb2 = hash2(col,row,o.seed+4), hb3 = hash2(col,row,o.seed+6);
      // each brick is a slightly different size, with rounded, chipped arrises
      const ix = .0005 + hb3*.003, iy = .0005 + hb*.002, rr = .0035 + hb2*.003;
      const dx = Math.min(fx - m*.5 - ix, m*.5 + bw - ix - fx), dy = Math.min(fy - m*.5 - iy, m*.5 + bh - iy - fy);
      let e = (dx < rr && dy < rr) ? rr - Math.hypot(rr - dx, rr - dy) : Math.min(dx, dy);
      e += (ps(fSp,u+.37,v+.11) - .5)*.006 - smooth(.7, .88, ps(fChip,u,v)) * .007 * (hb2 > .6 ? 1 : .15);
      let r, gg, b, h, gl, ao;
      const mt = .72 + n*.24 + (g-.5)*.3 + (g2-.5)*.12;                       // sandy mortar
      const mr = o.mortar[0]*mt, mg = o.mortar[1]*mt, mb = o.mortar[2]*mt;
      if (e < 0){
        r = mr; gg = mg; b = mb;
        h = .1 + n*.14 + g*.1 + .16*smooth(-.006, 0, e); gl = .04; ao = .42 + .3*n + .28*smooth(-.006, 0, e);
      } else {
        [r, gg, b] = o.brick(hb, hb2);
        const drag = ps(fDrag, u + hb*3, v);                                   // wire-cut drag marks
        const core = .78 + .22*smooth(0, .016, e);                             // darker, harder-fired edges
        const t = (.8 + n*.3 + (g-.5)*.2 + (drag-.5)*.16) * core * (.9 + hb3*.2);
        r *= t; gg *= t; b *= t;
        h = .56 + .32*Math.sqrt(Math.min(1, e/.005)) + (n-.5)*.14 + (g-.5)*.1 + (drag-.5)*.1;
        gl = .1 + hb2*.08; ao = .75 + .25*smooth(0, .008, e);
        if (g2 > .993){ r *= .6; gg *= .6; b *= .6; h -= .2; ao = .65; }     // small pits
        else if (g < .025){ r = r*.6 + 96; gg = gg*.6 + 88; b = b*.6 + 76; }    // sand grains
        if (sp > .74 && hb > .5){ const k = smooth(.74, .8, sp)*.3; r *= 1-k; gg *= 1-k; b *= 1-k; }   // kiln scorch
        const smear = (1 - smooth(0, .0035, e)) * .5;                           // mortar smeared over the edge
        r += (mr - r)*smear; gg += (mg - gg)*smear; b += (mb - b)*smear;
        const salt = smooth(.6, .78, ps(fSalt,u,v) + (sp-.5)*.2) * .3;         // white salt bloom
        r += (225 - r)*salt; gg += (222 - gg)*salt; b += (214 - b)*salt;
      }
      if (o.paint){ // masonry paint that has flaked back in places
        const flake = ps(fPaint,u,v) + (ps(fSp,u*.5,v*.5)-.5)*.25, cover = smooth(.3, .34, flake) * (e < 0 ? .85 : 1);
        const pt = .95 + (g-.5)*.05 + (n-.5)*.06 - (e < 0 ? .12 : 0);
        r = r*(1-cover) + o.paint[0]*pt*cover; gg = gg*(1-cover) + o.paint[1]*pt*cover; b = b*(1-cover) + o.paint[2]*pt*cover;
        h = h*(1-cover*.25) + cover*.25*Math.max(h, .5) + cover*.03; gl = gl*(1-cover) + .3*cover;
      }
      const big = .9 + (s-.5)*.26; C.put(i, r*big, gg*big, b*big, h, gl, ao);
    } }
}

/* ---- block family ---- */
function genBlocks(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm, bw = o.bw, bh = o.bh, m = .01, cw = bw+m, rh = bh+m, cols = Math.round(M/cw);
  const fMid = pfield(C.R, 30, 30, 3, o.seed), fBig = pfield(C.r2, 5, 5, 4, o.seed+5), fPore = pfield(C.R, 160, 160, 2, o.seed+9);
  for (let y=0;y<N;y++){ const Y = y/ppm, row = Math.floor(Y/rh), fy = Y - row*rh;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N;
      let X = (x/ppm + (row&1)*cw*.5) % M; const col = Math.floor(X/cw) % cols, fx = X - Math.floor(X/cw)*cw;
      const n = ps(fMid,u,v), s = ps(fBig,u,v), pore = ps(fPore,u,v), g = hash2(x,y,o.seed), g2 = hash2(x>>1,y>>1,o.seed+7);
      const e = Math.min(fx-m*.5, m*.5+bw-fx, fy-m*.5, m*.5+bh-fy);
      const hb = hash2(col,row,o.seed+2);
      let t = .9 + (s-.5)*.18 + (hb-.5)*o.blockVar + (g-.5)*.08, h, ao = 1;
      if (e < 0){ h = .3 + (g-.5)*.1 + .1*smooth(-.005, 0, e); t *= .86; ao = .7; }
      else {
        const pit = (pore < o.poreT ? 1 : 0) || (g2 > .985 ? 1 : 0);
        h = .64 + (g-.5)*o.grain + (n-.5)*.3 - pit*.34 + .1*Math.min(1, e/.004);
        if (pit){ t *= o.paint ? .93 : .78; ao = .6; }
      }
      const c = o.color; C.put(i, c[0]*t, c[1]*t, c[2]*t, h, o.gloss, ao);
    } }
}

/* ---- concrete family ---- */
function genConcrete(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm;
  const fBig = pfield(C.r2, 4, 4, 5, o.seed), fMid = pfield(C.R, 36, 36, 3, o.seed+2), fStreak = pfield(C.r2, 14, 2, 3, o.seed+4);
  const fGrain = o.board ? pfield(C.R, 6, 120, 3, o.seed+6) : null, fCrack = pfield(C.R, 3, 3, 6, o.seed+15), fStain = pfield(C.r2, 6, 3, 4, o.seed+19);
  for (let y=0;y<N;y++){ const Y = y/ppm;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N, X = x/ppm;
      const s = ps(fBig,u,v), n = ps(fMid,u,v), st = ps(fStreak,u,v), g = hash2(x,y,o.seed);
      let base = o.tone + (s-.5)*58 + (n-.5)*26 + (g-.5)*14, h = .55 + (n-.5)*.36 + (g-.5)*.14, ao = 1, gl = .1;
      if (o.board){ // plank imprints
        const pk = Math.floor(Y/.1), fy = Y - pk*.1, ph = hash2(pk, 0, o.seed+8);
        base += (ph-.5)*14; const grain = ps(fGrain, u + ph, v);
        h = .5 + (grain-.5)*.5 + (n-.5)*.2 + (g-.5)*.1;
        if (fy < .004){ h = .82; base *= 1.04; }
      } else {
        const pid = Math.floor(X/1.2) + Math.floor(Y/1.2)*7; base += (hash2(pid,3,o.seed)-.5)*10;
        const sx = X % 1.2, sy = Y % 1.2;
        if (sx < .003 || sx > 1.197 || sy < .003 || sy > 1.197){ h = .2; base *= .8; ao = .6; }
        const tx = (X % .6) - .3, ty = (Y % .6) - .3, tr = Math.hypot(tx, ty);
        if (tr < .016){ h = .05 + tr*4; base *= tr < .011 ? .38 : .7; ao = .4; if (tr > .009) base = base*.8 + 30; }
      }
      if (hash2(x>>1,y>>1,o.seed+11) > .991 || (hash2(x,y,o.seed+12) > .996)){ h -= .3; base *= .72; ao = .55; }   // bug holes
      base *= 1 - Math.max(0, st - .58)*.8;
      const cr = Math.abs(ps(fCrack,u,v) - .5); if (cr < .0022){ h = .06; base *= .55; ao = .35; } else if (cr < .005) base *= .92;   // hairline cracks
      const g3 = hash2(x>>1, y>>1, o.seed+23); if (g3 > .97){ base = base*.7 + (g3 > .985 ? 70 : 22); h += .05; }                    // exposed aggregate
      const wst = smooth(.56, .7, ps(fStain,u,v)); base *= 1 - wst*.14; gl = .08 + wst*.1;                                              // old water stains
      C.put(i, base*o.tint[0], base*o.tint[1], base*o.tint[2], h, gl, ao);
    } }
}

function genStucco(N, M, A, H, o){
  const C = genCtx(N, M, A, H);
  const fBig = pfield(C.r2, 4, 4, 5, o.seed), fRough = pfield(C.R, 90, 90, 3, o.seed+2), fCrack = pfield(C.R, 3, 3, 6, o.seed+3);
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N;
    const s = ps(fBig,u,v), r = ps(fRough,u,v), cr = Math.abs(ps(fCrack,u,v) - .5), g = hash2(x,y,o.seed);
    let t = .93 + (s-.5)*.14 + (g-.5)*.06 + (r-.5)*.1, h = .5 + (r-.5)*1.1 + (g-.5)*.25, ao = .75 + r*.25;
    if (cr < .0028){ h = .04; t *= .5; ao = .3; } else if (cr < .006) t *= .9;
    const c = o.color; C.put(i, c[0]*t, c[1]*t, c[2]*t, h, .05, ao); }
}

function genMetalRibs(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm;
  const fRust = pfield(C.r2, 6, 6, 5, o.seed), fGrime = pfield(C.r2, 3, 8, 4, o.seed+2), fPeel = pfield(C.R, 18, 18, 4, o.seed+4);
  for (let y=0;y<N;y++){ const Y = y/ppm;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N, X = x/ppm;
      const along = o.vertical ? X : Y, t = (along % o.pitch) / o.pitch;
      let prof;
      if (o.kind === 'shutter') prof = t < .08 ? .12 : t > .92 ? .2 : .3 + .62*Math.pow(Math.sin(Math.PI*(t-.08)/.84), .55);
      else if (o.kind === 'flute') prof = .5 + .42*Math.cos(t*Math.PI*2);
      else if (o.kind === 'rib') { const d = Math.abs(t - .5) * o.pitch; prof = d < .035 ? .92 : d < .045 ? .92 - (d-.035)*60 : .3; }
      else prof = .5 + .45*Math.sin(t*Math.PI*2);
      const g = hash2(x,y,o.seed), brush = o.brushed ? (hash2(o.vertical ? 0 : y, o.vertical ? x : 0, o.seed+5)-.5)*.12 : 0;
      const rs = ps(fRust,u,v), gr = ps(fGrime,u,v), pe = ps(fPeel,u,v);
      let [r, gg, b] = o.color; let k = .86 + brush + (g-.5)*.05 - (gr-.5)*.22; r*=k; gg*=k; b*=k;
      let gl = o.gloss * (1 - (gr-.5)*.6);
      const ru = smooth(o.rustT, o.rustT + .1, rs + (prof < .3 ? .07 : 0) + (g-.5)*.07 + (pe-.5)*.12) * .85;   // rust creeps in with ragged, speckled edges
      r = r*(1-ru) + 92*ru*(.7+g*.5); gg = gg*(1-ru) + 44*ru*(.7+g*.5); b = b*(1-ru) + 24*ru*(.8+g*.3); gl *= 1 - ru*.9;
      if (o.peel && pe > .7){ const pk = smooth(.7,.73,pe); r = r*(1-pk) + 150*pk; gg = gg*(1-pk) + 152*pk; b = b*(1-pk) + 150*pk; }
      let h = prof + (g-.5)*.03 + ru*(g-.5)*.14;
      if (o.rivets && o.kind === 'rib'){ const d = Math.abs(t - .5)*o.pitch, ry = (Y % .08) - .04; if (Math.abs(d - .02) < .006 && Math.abs(ry) < .006 && (d-.02)**2 + ry*ry < .000036){ h += .07; } }
      if (o.seam && (Y % o.seam) < .004){ h = .2; r*=.6; gg*=.6; b*=.6; }
      C.put(i, r, gg, b, h, gl, .7 + prof*.3);
    } }
}

function genHoarding(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm;
  const fPatch = pfield(C.r2, 3, 3, 4, o.seed), fPaper = pfield(C.R, 20, 20, 4, o.seed+2);
  const rnd = seeded(o.seed), posters = [];
  for (let k=0;k<3;k++) posters.push([rnd()*M, rnd()*M, .25+rnd()*.35, .3+rnd()*.45, 120+rnd()*60]);
  for (let y=0;y<N;y++){ const Y = y/ppm;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N, X = x/ppm;
      const grain = pnoise(X*2.4 + pnoise(X*.8, Y*2, 8, 8, o.seed)*.6, Y*60, 8, 147, o.seed+4)*.6 + pnoise(X*9, Y*220, 22, 537, o.seed+5)*.4;
      const pt = ps(fPatch,u,v), g = hash2(x,y,o.seed);
      let c = o.tone + (pt-.5)*14 + (grain-.5)*7 + (g-.5)*5, h = .55 + (grain-.5)*.3 + (g-.5)*.06, gl = .14, ao = 1;
      let col = [c, c*1.01, c*1.04];
      for (const [px, py, pw, ph, pc] of posters){ // torn paper left from fly-posters
        let dx = X - px, dy = Y - py; dx -= Math.round(dx/M)*M; dy -= Math.round(dy/M)*M;
        if (dx > 0 && dx < pw && dy > 0 && dy < ph && ps(fPaper, u, v) > .56){ const t = pc*(.85+g*.15); col = [col[0]*.35 + t*.65, col[1]*.35 + t*.62, col[2]*.35 + t*.56]; h = .6 + (g-.5)*.05; gl = .05; }
      }
      const sx = X % 1.22, sy = Y % 2.44;
      if (sx < .003 || sx > 1.217 || sy < .003){ h = .1; col = col.map(v => v*.5); ao = .5; }
      const scx = Math.min(sx, 1.22-sx) - .025, scy = ((Y + .15) % .3) - .15;
      if (scx*scx + scy*scy < .00002){ col = [110,110,112]; h = .72; gl = .5; }
      C.put(i, col[0], col[1], col[2], h, gl, ao);
    } }
}

function genTiles(N, M, A, H, o){
  const C = genCtx(N, M, A, H), ppm = C.ppm, tw = .155, th = .075, m = .005, cw = tw+m, rh = th+m, cols = Math.round(M/cw);
  const fDirt = pfield(C.r2, 4, 4, 4, o.seed), fCraze = pfield(C.R, 14, 14, 5, o.seed+2);
  for (let y=0;y<N;y++){ const Y = y/ppm, row = Math.floor(Y/rh), fy = Y - row*rh;
    for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N;
      const X = (x/ppm + (row&1)*cw*.5) % M, col = Math.floor(X/cw) % cols, fx = X - Math.floor(X/cw)*cw;
      const e = Math.min(fx-m*.5, m*.5+tw-fx, fy-m*.5, m*.5+th-fy), g = hash2(x,y,o.seed), d = ps(fDirt,u,v), ht = hash2(col,row,o.seed+3);
      let r, gg, b, h, gl, ao = 1;
      if (e < 0){ const t = .72 + (g-.5)*.12 - (d-.5)*.35; [r,gg,b] = [150*t,146*t,136*t]; h = .14; gl = .05; ao = .6; }
      else { const t = .95 + ht*.05 - (d-.5)*.07; [r,gg,b] = o.color.map(c => c*t);
        if (ht > .965 && Math.abs(ps(fCraze,u,v) - .5) < .004){ r*=.55; gg*=.55; b*=.55; h = .3; }
        h = .5 + .45*Math.sqrt(Math.min(1, e/.0055)); gl = .9 - (d-.5)*.4; }
      C.put(i, r, gg, b, h, gl, ao);
    } }
}

function genStone(N, M, A, H, o){
  const C = genCtx(N, M, A, H), p = 11;
  const fMid = pfield(C.R, 50, 50, 3, o.seed), fBig = pfield(C.r2, 4, 4, 4, o.seed+3);
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){ const i = y*N+x, u = x/N, v = y/N;
    const [f1, f2, id] = worley(u, v, p, o.seed), edge = f2 - f1, n = ps(fMid,u,v), g = hash2(x,y,o.seed), s = ps(fBig,u,v);
    const hs = hash2(id, 0, o.seed+5), hs2 = hash2(id, 1, o.seed+5);
    let r, gg, b, h, ao = 1;
    if (edge < .07 + (n-.5)*.03){ const t = .62 + n*.3 + (g-.5)*.2; [r,gg,b] = [150*t, 142*t, 128*t]; h = .15 + n*.15; ao = .45; }
    else { const base = hs < .3 ? [128,120,108] : hs < .6 ? [150,146,138] : hs < .8 ? [122,112,96] : [168,158,140];
      const t = (.82 + n*.3 + (g-.5)*.14) * (.9 + hs2*.2); [r,gg,b] = base.map(c => c*t);
      h = .45 + .45*smooth(.05, .3, edge) + (n-.5)*.22 + (g-.5)*.08; }
    const k = .9 + (s-.5)*.25; C.put(i, r*k, gg*k, b*k, h, .08, ao); }
}

function genBuffed(N, M, A, H, o){
  genConcrete(N, M, A, H, {seed:o.seed, tone:142, tint:[1,.985,.95]});
  const ppm = N/M, rnd = seeded(o.seed+77), cols = [[120,122,118],[150,146,134],[96,98,100],[172,166,150],[128,120,108],[84,88,86],[140,142,144],[110,104,96]];
  for (let k=0;k<11;k++){
    const rx = rnd()*M, ry = rnd()*M, rw = .5 + rnd()*1.6, rh = .4 + rnd()*1.4, c = cols[(rnd()*cols.length)|0];
    for (let yy=0; yy<Math.ceil(rh*ppm); yy++) for (let xx=0; xx<Math.ceil(rw*ppm); xx++){
      const X = rx + xx/ppm, Y = ry + yy/ppm, edge = Math.min(xx, yy, rw*ppm-xx, rh*ppm-yy)/ppm + (pnoise(X*30, Y*30, 1e6, 1e6, k)-.5)*.03;
      if (edge < 0) continue;
      const x = Math.floor(X*ppm) % N, y = Math.floor(Y*ppm) % N, i = (y*N + x)*4;
      const roll = pnoise(X*5, Y*60, 1e6, 1e6, 200+k)*.08 + hash2(x,y,300)*.05, t = .92 + roll;
      A[i] = c[0]*t; A[i+1] = c[1]*t; A[i+2] = c[2]*t; H[i] = H[i]*.5 + 70; H[i+1] = 40; H[i+2] = 255;
    }
  }
}

const MATERIALS = [
  { id:'brick_red',    name:'Red brick',          tileM:1.8, depth:.012, spec:.25, tooth:.55, ao:.85, grime:.8,  gen:(N,M,A,H) => genBrick(N,M,A,H,{seed:11, mortar:[172,164,150], brick:(h,h2) => h2>.87 ? [80+h*30,36,30] : h2<.07 ? [168,104,76] : h2<.13 ? [110,58,48] : [126+h*58, 50+h*24, 38+h*18]}) },
  { id:'brick_yellow', name:'Yellow stock brick', tileM:1.8, depth:.012, spec:.22, tooth:.55, ao:.85, grime:1,   gen:(N,M,A,H) => genBrick(N,M,A,H,{seed:21, mortar:[110,106,100], brick:(h,h2) => h2>.72 ? [96+h*20,90+h*18,80+h*14] : h2<.1 ? [170,110,70] : [186+h*34, 158+h*28, 104+h*26]}) },
  { id:'brick_white',  name:'Painted brick',      tileM:1.8, depth:.009, spec:.3,  tooth:.4,  ao:.7,  grime:.9,  gen:(N,M,A,H) => genBrick(N,M,A,H,{seed:31, mortar:[188,184,174], paint:[232,230,222], brick:(h) => [130+h*50, 54+h*22, 42+h*16]}) },
  { id:'concrete',     name:'Poured concrete',    tileM:2.4, depth:.004, spec:.3,  tooth:.45, ao:.55, grime:1,   gen:(N,M,A,H) => genConcrete(N,M,A,H,{seed:41, tone:148, tint:[1,.985,.95]}) },
  { id:'boardform',    name:'Board-formed concrete', tileM:2.0, depth:.006, spec:.25, tooth:.5, ao:.6, grime:.9, gen:(N,M,A,H) => genConcrete(N,M,A,H,{seed:45, tone:138, tint:[1,.99,.96], board:true}) },
  { id:'cinder',       name:'Raw cinder block',   tileM:2.0, depth:.007, spec:.15, tooth:.8,  ao:.7,  grime:.9,  gen:(N,M,A,H) => genBlocks(N,M,A,H,{seed:51, bw:.39, bh:.19, color:[150,150,145], blockVar:.12, grain:.4, poreT:.28, gloss:.04}) },
  { id:'cinder_paint', name:'Painted cinder block', tileM:2.0, depth:.005, spec:.25, tooth:.55, ao:.6, grime:.8, gen:(N,M,A,H) => genBlocks(N,M,A,H,{seed:53, bw:.39, bh:.19, color:[214,208,192], blockVar:.03, grain:.22, poreT:.22, gloss:.2, paint:true}) },
  { id:'stucco',       name:'Rough render',       tileM:2.0, depth:.008, spec:.12, tooth:.85, ao:.6,  grime:1,   gen:(N,M,A,H) => genStucco(N,M,A,H,{seed:61, color:[226,219,204]}) },
  { id:'stone',        name:'Rubble stone',       tileM:2.0, depth:.022, spec:.15, tooth:.6,  ao:.9,  grime:.8,  gen:(N,M,A,H) => genStone(N,M,A,H,{seed:71}) },
  { id:'buffed',       name:'Buffed hall of fame', tileM:3.0, depth:.004, spec:.3, tooth:.35, ao:.5,  grime:.6,  gen:(N,M,A,H) => genBuffed(N,M,A,H,{seed:81}) },
  { id:'hoarding',     name:'Black hoarding',     tileM:2.44, depth:.003, spec:.45, tooth:.22, ao:.4, grime:.4,  gen:(N,M,A,H) => genHoarding(N,M,A,H,{seed:91, tone:34}) },
  { id:'shutter',      name:'Roller shutter',     metal:.75, tileM:2.0, depth:.012, spec:1.2, tooth:.12, ao:.45, grime:.8,  gen:(N,M,A,H) => genMetalRibs(N,M,A,H,{seed:101, kind:'shutter', pitch:.08, color:[150,155,159], gloss:.55, rustT:.66, brushed:true}) },
  { id:'corrugated',   name:'Corrugated sheet',   metal:.2, tileM:2.0, depth:.016, spec:.8,  tooth:.15, ao:.4,  grime:.8,  gen:(N,M,A,H) => genMetalRibs(N,M,A,H,{seed:111, kind:'wave', vertical:true, pitch:.08, color:[78,112,100], gloss:.4, rustT:.6, peel:true}) },
  { id:'tiles',        name:'Subway tile',        tileM:1.92, depth:.003, spec:1.6, tooth:.04, ao:.5, grime:.5,  gen:(N,M,A,H) => genTiles(N,M,A,H,{seed:121, color:[238,237,229]}) },
  { id:'steel_train',  name:'Freight car steel',  metal:.25, tileM:2.4, depth:.01, spec:.7,  tooth:.12, ao:.5,  grime:.9,  gen:(N,M,A,H) => genMetalRibs(N,M,A,H,{seed:131, kind:'rib', vertical:true, pitch:.6, color:[118,48,36], gloss:.35, rustT:.62, rivets:true}) },
  { id:'steel_subway', name:'Stainless subway car', metal:.9, tileM:1.2, depth:.006, spec:1.6, tooth:.05, ao:.4, grime:.5, gen:(N,M,A,H) => genMetalRibs(N,M,A,H,{seed:141, kind:'flute', vertical:true, pitch:.04, color:[176,180,184], gloss:.75, rustT:.95, brushed:true, seam:1.2}) },
];
const MAT = Object.fromEntries(MATERIALS.map(m => [m.id, m]));
const matCache = {};
function getMat(id){
  if (matCache[id]) return matCache[id];
  const def = MAT[id], N = TILE_PX, A = new Uint8ClampedArray(N*N*4), H = new Uint8ClampedArray(N*N*4);
  def.gen(N, def.tileM, A, H);
  const ac = mk(N, N), hc = mk(N, N);
  ac.getContext('2d').putImageData(new ImageData(A, N, N), 0, 0); hc.getContext('2d').putImageData(new ImageData(H, N, N), 0, 0);
  const alb = new THREE.CanvasTexture(ac), hgt = new THREE.CanvasTexture(hc);
  for (const t of [alb, hgt]){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; }
  let sr = 0, sg = 0, sb = 0; for (let i=0;i<A.length;i+=4*97){ sr += A[i]; sg += A[i+1]; sb += A[i+2]; } const cnt = A.length/(4*97);
  return matCache[id] = { def, alb, hgt, canvas:ac, avg:new THREE.Color(sr/cnt/255, sg/cnt/255, sb/cnt/255).convertSRGBToLinear() };
}
function matThumb(id){
  const def = MAT[id], N = 160, A = new Uint8ClampedArray(N*N*4), H = new Uint8ClampedArray(N*N*4);
  // thumbnails show 1.2 m of the material at low res
  def.gen(N, def.tileM, A, H);
  const c = mk(N, N); c.getContext('2d').putImageData(new ImageData(A, N, N), 0, 0);
  return c.toDataURL('image/jpeg', .82);
}
