/* ================================================================
   Audio: aerosol hiss + mixing-ball rattle
   ================================================================ */
const A = { ctx:null };
function initAudio(){
  if (A.ctx){ if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0; for (let i=0;i<len;i++){ const w = Math.random()*2-1; b0 = .97*b0 + w*.03; d[i] = (w - b0)*.9 + w*.1; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1600;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 6000; pk.Q.value = .9; pk.gain.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 13000;
    const g = ctx.createGain(); g.gain.value = 0; const master = ctx.createGain(); master.gain.value = S.sound ? S.volume : 0;
    src.connect(hp).connect(pk).connect(lp).connect(g).connect(master).connect(ctx.destination); src.start();
    Object.assign(A, {ctx, buf, g, pk, master, on:false});
  } catch (e) { A.ctx = null; }
}
function setHiss(on, P){
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  if (!on){ if (A.on){ A.g.gain.setTargetAtTime(0, t, .035); A.on = false; } return; }
  A.on = true;
  if (P.tool === 'marker'){ A.g.gain.setTargetAtTime(.02, t, .02); A.pk.frequency.setTargetAtTime(2400, t, .05); return; }
  const cap = CAPS[P.cap];
  A.g.gain.setTargetAtTime(.2 * cap.loud * (.55 + .45*P.pressure) * Math.min(1.4, P.flow) * (P.erase ? .8 : 1), t, .012);
  A.pk.frequency.setTargetAtTime(cap.tone * (.82 + .18*P.pressure) * (1 + P.d*.3), t, .05);
}
function rattle(n){
  if (!A.ctx || !S.sound) return;
  const ctx = A.ctx; let t = ctx.currentTime + .01;
  for (let i=0;i<(n||9);i++){
    const s = ctx.createBufferSource(); s.buffer = A.buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2300 + Math.random()*2200; f.Q.value = 7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.4, t+.002); g.gain.exponentialRampToValueAtTime(.001, t+.045);
    s.connect(f).connect(g).connect(A.master); s.start(t, Math.random()*1.5, .06); t += .07 + Math.random()*.045;
  }
}
function shakeCan(){
  initAudio();
  const all = [me, ...HANDS.painters];
  if (S.tool === 'marker'){ all.forEach(p => p.ink = 1); rattle(3); toast('Marker pumped. The tip is full again.'); }
  else { rattle(10); all.forEach(p => { p.pressure = 1; p.shake = .7; }); }
  updateToolNote();
}

/* ================================================================
   Recording: time-lapse of auto paint, or free recording of the view
   ================================================================ */
const REC = { active:false, kind:'', rec:null, chunks:[], mime:'', stream:null, t0:0 };
function pickMime(){
  if (!window.MediaRecorder) return '';
  for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function startRecording(kind){
  if (REC.active) return true;
  const mime = pickMime();
  if (!canvas.captureStream || !mime){ toast('This browser cannot record video of the canvas'); return false; }
  try {
    REC.stream = canvas.captureStream(30);
    REC.rec = new MediaRecorder(REC.stream, { mimeType:mime, videoBitsPerSecond:12e6 });
  } catch (e) { console.error(e); toast('Recording could not start in this browser'); return false; }
  REC.chunks = []; REC.mime = mime; REC.kind = kind; REC.active = true; REC.t0 = performance.now();
  REC.rec.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  REC.rec.onstop = () => {
    const ext = REC.mime.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(REC.chunks, {type:REC.mime.split(';')[0]});
    REC.stream.getTracks().forEach(t => t.stop());
    const secs = Math.round((performance.now() - REC.t0) / 1000);
    showExport(blob, `spray-${REC.kind === 'timelapse' ? 'timelapse' : 'recording'}.${ext}`, `${REC.kind === 'timelapse' ? 'Time-lapse' : 'Recording'} · ${secs} s · ${ext.toUpperCase()}`, true);
  };
  REC.rec.start(500);
  $('#recBtn').textContent = 'Stop recording'; $('#recBtn').classList.add('armed'); $('#hudRec').hidden = false;
  return true;
}
function stopRecording(){
  if (!REC.active) return;
  REC.active = false; try { REC.rec.stop(); } catch (e) {}
  $('#recBtn').textContent = 'Record video'; $('#recBtn').classList.remove('armed'); $('#hudRec').hidden = true;
}

/* ================================================================
   Hand tracking: up to two hands, a closed fist sprays
   ================================================================ */
const HANDS = { on:false, starting:false, video:null, stream:null, lm:null, painters:[], state:[], lastT:-1, p2:'#3aa6ff', pv:null };
const MP_VER = '0.10.14';
async function startHands(){
  if (HANDS.on || HANDS.starting) return;
  const st = $('#handsStatus'); HANDS.starting = true;
  st.textContent = 'Asking for the camera…';
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    HANDS.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:640, height:480, facingMode:'user' }, audio:false });
  } catch (e) {
    HANDS.starting = false;
    st.textContent = 'The camera is blocked here. The shared viewer does not allow camera access. Download the HTML file and open it in Chrome or Edge, then allow the camera.';
    return;
  }
  try {
    st.textContent = 'Loading the hand tracker…';
    const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`);
    const fs = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`);
    HANDS.lm = await vision.HandLandmarker.createFromOptions(fs, { baseOptions:{ modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate:'GPU' }, runningMode:'VIDEO', numHands:2 });
  } catch (e) {
    console.error(e); HANDS.starting = false; HANDS.stream.getTracks().forEach(t => t.stop());
    st.textContent = 'The hand tracker could not load. It needs internet access to cdn.jsdelivr.net and storage.googleapis.com.'; return;
  }
  const v = HANDS.video = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = HANDS.stream; await v.play();
  for (let i=0;i<2;i++){
    const p = new Painter(i ? 'Player 2' : 'Player 1'); p.avatar = makeAvatar(i ? 'P2' : 'P1'); p.setColor(i ? HANDS.p2 : S.hex);
    HANDS.painters.push(p); HANDS.state.push({ seen:0, fist:0, sx:0, sy:0, size:.12, d:.12 });
  }
  HANDS.on = true; HANDS.starting = false; $('#ledHands').classList.remove('off'); $('#handsBtn').textContent = 'Stop camera'; $('#handsPrev').hidden = false;
  st.textContent = 'Tracking. Open hand aims, closed fist sprays. Move your hand toward the camera to bring the can closer to the wall.';
}
function stopHands(){
  HANDS.on = false; if (HANDS.stream) HANDS.stream.getTracks().forEach(t => t.stop());
  HANDS.painters.forEach(p => p.avatar.dispose()); HANDS.painters = []; HANDS.state = [];
  $('#handsBtn').textContent = 'Start camera'; $('#ledHands').classList.add('off'); $('#handsPrev').hidden = true; $('#handsStatus').textContent = 'Camera off.';
}
const FINGERS = [[8,6],[12,10],[16,14],[20,18]];
function handsTick(dt){
  if (!HANDS.on) return false;
  const v = HANDS.video; let res = null;
  if (v.readyState >= 2 && v.currentTime !== HANDS.lastT){ HANDS.lastT = v.currentTime; try { res = HANDS.lm.detectForVideo(v, performance.now()); } catch (e) {} }
  if (res){
    const hands = (res.landmarks || []).map(lm => ({ lm, x:1 - (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x)/5, y:(lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y)/5 }));
    hands.sort((a, b) => a.x - b.x);
    HANDS.state.forEach(s => s.seen = Math.max(0, s.seen - 1));
    hands.slice(0, 2).forEach((h, i) => {
      const s = HANDS.state[hands.length === 1 ? 0 : i], lm = h.lm, d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
      const curled = FINGERS.filter(([tip, pip]) => d(tip, 0) < d(pip, 0) * 1.05).length;
      s.raw = curled >= 3; s.seen = 6;
      const k = .45; s.sx += ((h.x - .15) / .7 - s.sx) * k; s.sy += ((h.y - .12) / .7 - s.sy) * k;
      s.size += (d(0, 9) - s.size) * .3; s.lm = lm;
    });
    drawHandPreview(hands);
  }
  let any = false;
  HANDS.painters.forEach((p, i) => {
    const s = HANDS.state[i];
    s.fist = clamp(s.fist + ((s.seen && s.raw) ? 1 : -1) * dt * 9, 0, 1);
    p.syncFromS(); if (i === 1) { if (p.hex !== HANDS.p2) p.setColor(HANDS.p2); } else if (p.hex !== S.hex) p.setColor(S.hex);
    if (!s.seen){ p.visible = false; painterTick(p, dt, false); return; }
    const ndc = new THREE.Vector2(clamp(s.sx, 0, 1)*2 - 1, -(clamp(s.sy, 0, 1)*2 - 1));
    const h = hitWalls(ndc, true);
    const spraying = s.fist > .5 && S.mode === 'paint';
    if (h){ if (h.wall !== p.wall){ p.wall = h.wall; p.u = h.u; p.v = h.v; p.prev = null; } else { const k = 1 - Math.exp(-dt*18); p.u += (h.u - p.u)*k; p.v += (h.v - p.v)*k; } p.visible = true;
      if (spraying && !s.was){ pushUndo(h.wall); lastWall = h.wall; } }
    s.was = spraying;
    s.d += (clamp(.016 / Math.max(.02, s.size), .03, .4) - s.d) * .15; p.d = S.tool === 'marker' ? 0 : s.d;
    painterTick(p, dt, spraying && !!h); netSample(p, dt, i + 1);
    if (p.spraying) any = p;
  });
  return any;
}
function drawHandPreview(hands){
  const c = $('#handsPrev'), x = c.getContext('2d'), W = c.width, H = c.height;
  x.save(); x.translate(W, 0); x.scale(-1, 1); x.drawImage(HANDS.video, 0, 0, W, H); x.restore();
  x.fillStyle = 'rgba(14,15,19,.35)'; x.fillRect(0, 0, W, H);
  hands.slice(0, 2).forEach((h, i) => {
    const s = HANDS.state[hands.length === 1 ? 0 : i], col = (hands.length === 1 ? 0 : i) ? HANDS.p2 : S.hex;
    x.fillStyle = col; for (const p of h.lm){ x.beginPath(); x.arc((1 - p.x)*W, p.y*H, 2.2, 0, Math.PI*2); x.fill(); }
    x.font = '600 12px "IBM Plex Mono", monospace'; x.fillStyle = '#fff'; x.fillText(s && s.raw ? 'SPRAY' : 'aim', (1 - h.lm[0].x)*W - 14, h.lm[0].y*H + 16);
  });
}

/* ================================================================
   Live multiplayer through the artifact room
   ================================================================ */
const NET = { room:null, nick:'', epoch:0, me:null, remote:new Map(), out:new Map(), lastSend:0, lastPres:0, peers:[] };
async function initRoom(){
  const st = $('#netStatus');
  if (!window.claude || !window.claude.use){ const sec = $('#netSec'); if (sec) sec.remove(); return; }
  const room = await window.claude.use('room').catch(() => null);
  if (!room){ st.textContent = 'Live painting is not available in this view.'; return; }
  NET.room = room;
  const user = await window.claude.use('user').catch(() => null);
  let nm = ''; try { nm = user ? await user.name() : ''; } catch (e) {}
  NET.nick = (nm || 'Writer').split(' ')[0].slice(0, 20) + (nm ? '' : '-' + uid().slice(0, 3));
  $('#nick').value = NET.nick;
  const err = e => { st.textContent = e.code === 'not_granted' ? 'Sign in to paint with others here.' : 'Live painting stopped.'; };
  room.on('paint', onPaint, err); room.on('scene', onScene, err); room.on('clear', onClear, err);
  room.onPeers(ch => {
    NET.peers = ch.peers;
    const meP = ch.peers.find(p => p.isMe && p.sameTab); if (meP) NET.me = meP.peer;
    for (const p of ch.left){ const r = NET.remote.get(p.peer); if (r){ r.forEach(pp => pp.avatar && pp.avatar.dispose()); NET.remote.delete(p.peer); } }
    if (ch.joined.some(p => !p.sameTab)) setTimeout(emitScene, 200 + Math.random()*600);
    renderPeers();
  }, err);
  room.onConnection(c => { st.textContent = c ? 'Connected. Everyone with this page open paints on the same walls.' : 'Connecting…'; });
}
function renderPeers(){
  const el = $('#peers'); el.innerHTML = '';
  for (const p of NET.peers){
    const pr = p.presence || {}, li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'pdot'; dot.style.background = /^#[0-9a-f]{6}$/i.test(pr.hex) ? pr.hex : '#888';
    const nm = document.createElement('span'); nm.textContent = (typeof pr.nick === 'string' ? pr.nick.slice(0, 24) : 'Someone') + (p.sameTab ? ' (you)' : p.guest ? ' · guest' : '');
    li.append(dot, nm); el.appendChild(li);
  }
  $('#netCount').textContent = NET.peers.length > 1 ? `${NET.peers.length} here` : '';
}
function remotePainter(peer, slot, label){
  let m = NET.remote.get(peer); if (!m){ m = new Map(); NET.remote.set(peer, m); }
  let p = m.get(slot);
  if (!p){ p = new Painter(label); p.avatar = makeAvatar(label || 'Writer'); m.set(slot, p); }
  return p;
}
function netSample(P, dt, slot){
  if (!NET.room || !P.spraying || !P.wall) return;
  slot = slot || 0;
  let o = NET.out.get(slot);
  const sig = [P.wall.id, P.tool, P.cap, P.marker, P.hex, Math.round(P.fan*100), Math.round(P.flow*100), P.erase ? 1 : 0].join('|');
  if (o && (o.sig !== sig || o.s.length >= 110)) { sendPaint(slot, o); o = null; }
  if (!o){ o = { sig, w:P.wall.id, t:P.tool === 'marker' ? 1 : 0, c:P.cap, m:P.marker, h:P.hex, f:Math.round(P.fan*100), fl:Math.round(P.flow*100), e:P.erase ? 1 : 0, s:[] }; NET.out.set(slot, o); }
  o.s.push([Math.round(P.u*1000), Math.round(P.v*1000), Math.round(P.d*1000), Math.round(dt*10000)]);
}
function netFlush(force){
  if (!NET.room) return;
  const now = performance.now();
  if (force || now - NET.lastSend > 100){ NET.lastSend = now; for (const [slot, o] of NET.out) if (o.s.length) sendPaint(slot, o); NET.out.clear(); }
  if (now - NET.lastPres > 70) netPresence();
}
function sendPaint(slot, o){ NET.room.emit('paint', { p:slot, w:o.w, t:o.t, c:o.c, m:o.m, h:o.h, f:o.f, fl:o.fl, e:o.e, s:o.s }).catch(() => {}); o.s = []; }
function netPresence(force){
  if (!NET.room) return; NET.lastPres = performance.now();
  const P = me, pr = { nick:NET.nick, hex:S.hex, tool:S.tool, on:P.spraying ? 1 : 0 };
  if (P.wall && P.visible){ pr.w = P.wall.id; pr.u = Math.round(P.u*1000); pr.v = Math.round(P.v*1000); pr.d = Math.round(P.d*1000); pr.c = S.cap; pr.m = S.marker; } else pr.w = null;
  NET.room.presence(pr).catch(() => {});
}
const okHex = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
function onPaint(msg){
  if (msg.sameTab || !msg.data) return;
  const d = msg.data, W = wallById(String(d.w)); if (!W || !Array.isArray(d.s)) return;
  const pr = (NET.peers.find(p => p.peer === msg.peer) || {}).presence || {};
  const P = remotePainter(msg.peer, d.p|0, typeof pr.nick === 'string' ? pr.nick.slice(0, 20) : 'Writer');
  P.tool = d.t ? 'marker' : 'spray'; P.cap = clamp(d.c|0, 0, CAPS.length-1); P.marker = clamp(d.m|0, 0, MARKERS.length-1);
  if (okHex(d.h) && d.h !== P.hex) P.setColor(d.h); P.fan = (d.f|0)/100; P.flow = clamp((d.fl|0)/100, .3, 1.6); P.erase = !!d.e;
  const now = performance.now(); if (P.wall !== W || now - (P.lastMsg||0) > 400) P.prev = null; P.lastMsg = now; P.wall = W;
  for (const s of d.s.slice(0, 200)){ if (!Array.isArray(s)) continue;
    P.u = clamp(+s[0]/1000, 0, W.w); P.v = clamp(+s[1]/1000, 0, W.h); P.d = clamp(+s[2]/1000, 0, .5);
    painterTick(P, clamp(+s[3]/10000, 0, .1), true); }
  P.spraying = false; lastWall = lastWall || W;
}
function emitScene(){ if (!NET.room) return; NET.room.emit('scene', { epoch:NET.epoch, walls:walls.slice(0, 24).map(w => w.serialize()) }).catch(() => {}); }
function onScene(msg){
  if (msg.sameTab || !msg.data || !Array.isArray(msg.data.walls)) return;
  const d = msg.data, ep = +d.epoch || 0;
  if (ep < NET.epoch) return;
  const newer = ep > NET.epoch, tieLose = !newer && NET.me && msg.peer > NET.me;   // on a tie, yards merge: nobody's walls are removed
  NET.epoch = ep;
  const ids = new Set();
  for (const o of d.walls.slice(0, 24)){
    if (!o || typeof o.id !== 'string' || !WALL_TYPES[o.type] || !MAT[o.mat]) continue;
    ids.add(o.id);
    const w = clamp(+o.w || 4, 1, 16), h = clamp(+o.h || 3, 1, 6), x = clamp(+o.x || 0, -60, 60), z = clamp(+o.z || 0, -60, 60), rot = +o.rot || 0;
    let W = wallById(o.id);
    if (!W){ W = new Wall({id:o.id.slice(0, 24), type:o.type, mat:o.mat, w, h, x, z, rot}); drawWallGuide(W); continue; }
    if (tieLose) continue;
    if (W.matId !== o.mat || Math.abs(W.w - w) > 1e-3 || Math.abs(W.h - h) > 1e-3){ W.matId = o.mat; W.w = w; W.h = h; W.build(); drawWallGuide(W); }
    W.x = x; W.z = z; W.rot = rot; W.place();
  }
  if (newer) for (const W of [...walls]) if (!ids.has(W.id) && walls.length > 1){ if (me.wall === W) me.wall = null; W.dispose(); }
  if (selWall && selWall.disposed) selectWall(null);
  renderLayers();
}
function netClear(W){ if (NET.room) NET.room.emit('clear', { w:W.id }).catch(() => {}); }
function onClear(msg){ if (msg.sameTab || !msg.data) return; const W = wallById(String(msg.data.w)); if (W){ pushUndo(W); W.clearPaint(); toast(`${(((NET.peers.find(p => p.peer === msg.peer) || {}).presence || {}).nick || 'Someone')} cleared a wall`); } }
function remoteFromPresence(dt){
  if (!NET.room) return;
  for (const p of NET.peers){
    if (p.sameTab || p.isMe) continue;
    const pr = p.presence || {}; const P = remotePainter(p.peer, 0, typeof pr.nick === 'string' ? pr.nick.slice(0, 20) : 'Writer');
    const W = pr.w ? wallById(String(pr.w)) : null;
    if (!W){ P.visible = false; continue; }
    if (performance.now() - (P.lastMsg||0) < 300 && P.wall === W){ P.visible = true; continue; }
    P.wall = W; P.visible = true; P.tool = pr.tool === 'marker' ? 'marker' : 'spray'; P.cap = clamp(pr.c|0, 0, CAPS.length-1); P.marker = clamp(pr.m|0, 0, MARKERS.length-1);
    if (okHex(pr.hex) && pr.hex !== P.hex) P.setColor(pr.hex);
    const k = 1 - Math.exp(-dt*14); P.u += (clamp(+pr.u/1000 || 0, 0, W.w) - P.u)*k; P.v += (clamp(+pr.v/1000 || 0, 0, W.h) - P.v)*k; P.d += (clamp(+pr.d/1000 || 0, 0, .5) - P.d)*k;
  }
}
