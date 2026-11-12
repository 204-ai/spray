/* ================================================================
   Station mode: Spray as a picture source for a studio compositor.
   Switched on by URL parameters; without them nothing here runs.

     kiosk=1          picture only: no bar, panel, HUD or messages
     whip=<url>       publish the picture to a WHIP endpoint
                      (mediamtx: http://host:8889/<path>/whip)
     depthcam=<url>   hands from a depthcam-studio server (http://host:8777), over one
                      link (POST /offer): the body pose from its colour video, reach
                      from its depth frames
     trigger=reach|raise|fist
                      what sprays. reach (default): the hand held out toward the
                      camera, read from depth. raise: the hand above its shoulder.
                      fist: a closed hand, read by the hand tracker on a close-up
                      cut around each wrist. The K key steps through them.
     mirror=0         left and right as the camera sees them (default: as in a mirror)
     debug=1          a small view of what the tracker sees
     video=<url>      with depthcam: a video file in place of the camera's colour (no depth, so
                      reach falls back to raise) - for trying gestures with nobody there

   The wrist aims the can inside a box around the shoulders, so it works wherever the
   person stands. One person paints with both hands; two people get a can each.
   ================================================================ */
const TRIGGERS = ['reach', 'raise', 'fist'];
const MP_MODELS = 'https://storage.googleapis.com/mediapipe-models';
const ST = { q:new URLSearchParams(location.search), on:false, trigger:'reach', mirror:true, debug:false, links:[], vision:null,
  color:null, depth:null, pose:null, handLm:null, handLoading:false, lastT:-1, people:[], crop:null, dbg:null, msg:'', slots:[{}, {}] };

function stStatus(msg){ ST.msg = msg; console.log('[station] ' + msg); const st = $('#handsStatus'); if (st) st.textContent = msg; }

/* ---------------- WebRTC links, kept up ---------------- */
function iceDone(pc){
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete'){ clearTimeout(t); res(); } });
  });
}
async function sdpExchange(pc, url){
  await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/sdp' }, body:pc.localDescription.sdp });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  await pc.setRemoteDescription({ type:'answer', sdp:await r.text() });
}
/* one link: make() fills a fresh peer; failed or lost, it is closed and built again, ever more slowly */
function keepLink(name, make){
  const L = { name, pc:null, stop:false, tries:0, state:'connecting' };
  const again = () => {
    if (L.stop) return;
    const old = L.pc; L.pc = null; L.state = 'retrying'; try { old && old.close(); } catch (e) {}
    setTimeout(go, Math.min(10000, 1000 * 2 ** Math.min(4, L.tries++)));
  };
  async function go(){
    if (L.stop) return;
    const pc = L.pc = new RTCPeerConnection();
    pc.addEventListener('connectionstatechange', () => {
      if (pc !== L.pc) return;
      const s = pc.connectionState;
      if (s === 'connected'){ L.tries = 0; L.state = 'up'; }
      else if (s === 'failed' || s === 'closed') again();
      else if (s === 'disconnected') setTimeout(() => { if (pc === L.pc && pc.connectionState === 'disconnected') again(); }, 4000);
    });
    try { await make(pc); }
    catch (e) { if (pc !== L.pc) return; console.warn('[station] ' + name + ': ' + (e && e.message || e)); again(); }
  }
  L.close = () => { L.stop = true; try { L.pc && L.pc.close(); } catch (e) {} L.pc = null; };
  go(); ST.links.push(L); return L;
}
/* the depth camera: its colour as a video, its depth as frames on a data channel
   ("DPTH" + u32 frame, u16 part, u16 parts, u16 w, u16 h, then a slice of zlib(uint16 mm)) */
function depthcamIn(base){
  return keepLink('depth cam', async pc => {
    pc.addTransceiver('video', { direction:'recvonly' });
    pc.addEventListener('track', e => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([e.track]);
      v.play().catch(() => {}); ST.color = v;
    });
    const ch = pc.createDataChannel('depth'), parts = new Map(); ch.binaryType = 'arraybuffer';
    ch.onmessage = e => { try {
      const buf = e.data; if (typeof buf === 'string' || buf.byteLength < 16) return;
      const dv = new DataView(buf); if (dv.getUint32(0, false) !== 0x44505448) return;
      const id = dv.getUint32(4, true), idx = dv.getUint16(8, true), cnt = dv.getUint16(10, true), w = dv.getUint16(12, true), h = dv.getUint16(14, true);
      if (idx >= cnt) return;
      let rec = parts.get(id); if (!rec){ rec = { got:0, chunks:new Array(cnt).fill(null) }; parts.set(id, rec); }
      if (rec.chunks[idx]) return;
      rec.chunks[idx] = new Uint8Array(buf, 16); if (++rec.got < cnt) return;
      for (const k of [...parts.keys()]) if (k <= id) parts.delete(k);
      new Response(new Blob(rec.chunks).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer().then(raw => {
        if (raw.byteLength !== w * h * 2 || (ST.depth && ST.depth.id > id && ST.depth.id - id < 1e6)) return;
        ST.depth = { id, w, h, mm:new Uint16Array(raw), at:performance.now() };
      }, () => {});
    } catch (err) { console.warn('[station] depth frame: ' + err); } };
    await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
    // stride 4: a depth frame small enough to travel as one message
    const r = await fetch(base + '/offer', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ sdp:pc.localDescription.sdp, type:'offer', stride:4, depthFps:30 }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await pc.setRemoteDescription(await r.json());
  });
}
function whipOut(url){
  const stream = canvas.captureStream(30), track = stream.getVideoTracks()[0];
  try { track.contentHint = 'motion'; } catch (e) {}
  return keepLink('picture out', async pc => {
    pc.addTransceiver(track, { direction:'sendonly', streams:[stream], sendEncodings:[{ maxBitrate:8e6, maxFramerate:30 }] });
    await sdpExchange(pc, url);
  });
}

/* ---------------- trackers ---------------- */
async function stVision(){
  if (!ST.vision){
    const v = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`);
    ST.vision = { v, fs:await v.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`) };
  }
  return ST.vision;
}
function stSetTrigger(t){
  ST.trigger = t; stStatus('Trigger: ' + t);
  if (t === 'fist' && !ST.handLm && !ST.handLoading){
    ST.handLoading = true;
    stVision().then(({ v, fs }) => v.HandLandmarker.createFromOptions(fs, { baseOptions:{ modelAssetPath:`${MP_MODELS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate:'GPU' }, runningMode:'IMAGE', numHands:1 }))
      .then(lm => { ST.handLm = lm; }, e => { console.error(e); stStatus('The hand tracker could not load.'); })
      .then(() => { ST.handLoading = false; });
  }
}
async function startDepthcamHands(base){
  if (HANDS.on || HANDS.starting) return;
  HANDS.starting = true; base = base.replace(/\/+$/, '');
  try {
    stStatus('Loading the body tracker…');
    const { v, fs } = await stVision();
    ST.pose = await v.PoseLandmarker.createFromOptions(fs, { baseOptions:{ modelAssetPath:`${MP_MODELS}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`, delegate:'GPU' }, runningMode:'VIDEO', numPoses:2 });
  } catch (e) { console.error(e); HANDS.starting = false; stStatus('The body tracker could not load. It needs internet access to cdn.jsdelivr.net and storage.googleapis.com.'); return; }
  if (ST.q.get('video')){
    const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.src = ST.q.get('video');
    v.play().catch(() => {}); ST.color = v;
  } else depthcamIn(base);
  for (let i=0;i<2;i++){
    const p = new Painter(i ? 'Player 2' : 'Player 1'); p.avatar = makeAvatar(i ? 'P2' : 'P1'); p.setColor(i ? HANDS.p2 : S.hex);
    HANDS.painters.push(p); HANDS.state.push({ seen:0, fist:0, sx:.5, sy:.5, size:.12, d:.12, dExt:.12 });
  }
  HANDS.ext = stHandsTick; HANDS.on = true; HANDS.starting = false;
  $('#ledHands').classList.remove('off'); $('#handsBtn').textContent = 'Stop camera';
  stSetTrigger(ST.trigger);
}
function stationStop(){
  ST.links.filter(L => L.name !== 'picture out').forEach(L => L.close()); ST.links = ST.links.filter(L => !L.stop);
  ST.color = ST.depth = null; if (ST.pose){ try { ST.pose.close(); } catch (e) {} ST.pose = null; }
}

/* ---------------- depth ---------------- */
/* metres at a point of the picture (0..1), from the readings within r depth pixels; q picks which:
   .5 the middle one (a torso), toward 1 the nearer ones (a hand in front of what is behind it). 0: no reading */
function stDepthAt(D, x, y, r, q){
  const cx = Math.round(x * D.w), cy = Math.round(y * D.h), a = [];
  for (let j=-r;j<=r;j++) for (let i=-r;i<=r;i++){
    const X = cx + i, Y = cy + j; if (X < 0 || Y < 0 || X >= D.w || Y >= D.h) continue;
    const mm = D.mm[Y * D.w + X]; if (mm) a.push(mm);
  }
  if (a.length < 4) return 0;
  a.sort((m, n) => m - n);
  return a[Math.max(0, Math.min(a.length - 1, Math.floor(a.length * (1 - q))))] / 1000;
}

/* ---------------- gestures ---------------- */
/* closed hand? true / false, or null when the hand tracker finds no hand in the cut around the wrist */
function stFist(v, lm, wi, ei, swPx){
  if (!ST.handLm) return null;
  const W = v.videoWidth, H = v.videoHeight, wx = lm[wi].x * W, wy = lm[wi].y * H, ex = lm[ei].x * W, ey = lm[ei].y * H;
  const half = Math.max(24, swPx * .55), cx = wx + (wx - ex) * .35, cy = wy + (wy - ey) * .35;
  if (!ST.crop){ ST.crop = document.createElement('canvas'); ST.crop.width = ST.crop.height = 224; }
  ST.crop.getContext('2d').drawImage(v, cx - half, cy - half, half * 2, half * 2, 0, 0, 224, 224);
  let r = null; try { r = ST.handLm.detect(ST.crop); } catch (e) { return null; }
  const h = r && r.landmarks && r.landmarks[0]; if (!h) return null;
  const d = (a, b) => Math.hypot(h[a].x - h[b].x, h[a].y - h[b].y);
  return FINGERS.filter(([tip, pip]) => d(tip, 0) < d(pip, 0) * 1.05).length >= 3;
}
/* landmark triples: wrist, elbow, shoulder */
const ARMS = [[15, 13, 11], [16, 14, 12]];
function stHandsTick(){
  const v = ST.color; if (!v || !ST.pose || v.readyState < 2 || !v.videoWidth || v.currentTime === ST.lastT) return;
  ST.lastT = v.currentTime;
  let res = null; try { res = ST.pose.detectForVideo(v, performance.now()); } catch (e) { return; }
  const D = ST.trigger === 'reach' && ST.depth && performance.now() - ST.depth.at < 500 ? ST.depth : null, asp = v.videoWidth / v.videoHeight, poses = res.landmarks || [];
  const byPerson = [];
  poses.forEach((lm, pi) => {
    const ok = i => (lm[i].visibility == null ? 1 : lm[i].visibility) > .5;
    if (!ok(11) || !ok(12)) return;
    const mx = (lm[11].x + lm[12].x) / 2 * asp, my = (lm[11].y + lm[12].y) / 2;
    // shoulder width in picture heights; the widest seen lately, so turning sideways does not shrink the reach box
    const who = ST.people[pi] || (ST.people[pi] = { sw:0 }), swNow = Math.hypot((lm[11].x - lm[12].x) * asp, lm[11].y - lm[12].y);
    who.sw = Math.max(swNow, who.sw + (swNow - who.sw) * .03);
    const sw = Math.max(.02, who.sw), hands = [];
    for (const [wi, ei, si] of ARMS){
      if (!ok(wi)) continue;
      const wx = lm[wi].x * asp, wy = lm[wi].y;
      if (wy > my + 1.1 * sw) continue;                       // hanging down: not painting
      const c = { pi, wi, lm, x:.5 + (ST.mirror ? -1 : 1) * (wx - mx) / (4.4 * sw), y:(wy - (my - 1.9 * sw)) / (3 * sw), lift:my - wy, on:false, d:.12, note:'' };
      const raised = wy < lm[si].y - .1 * sw;
      if (ST.trigger === 'fist'){
        const f = stFist(v, lm, wi, ei, sw * v.videoHeight); c.on = f === true; c.note = f == null ? 'no hand' : f ? 'fist' : 'open';
      } else if (ST.trigger === 'reach' && D){
        const zs = stDepthAt(D, lm[si].x, lm[si].y, 2, .5), zw = stDepthAt(D, lm[wi].x, lm[wi].y, 3, .8);
        if (zs && zw){ c.reach = zs - zw; c.d = clamp(.3 - (c.reach - .25) * .7, .04, .3); c.note = c.reach.toFixed(2) + ' m'; }
        else { c.on = raised; c.note = 'no depth'; }
      } else { c.on = raised; c.note = raised ? 'raised' : ''; }
      hands.push(c);
    }
    if (hands.length) byPerson.push({ x:mx, hands });
  });
  // one person: both hands; two people: the higher hand of each
  let cands = byPerson.length >= 2 ? byPerson.slice(0, 2).map(p => p.hands.sort((a, b) => b.lift - a.lift)[0]) : (byPerson[0] ? byPerson[0].hands : []);
  cands.sort((a, b) => a.x - b.x);
  HANDS.state.forEach(s => s.seen = Math.max(0, s.seen - 1));
  cands.slice(0, 2).forEach((c, i) => {
    const slot = cands.length === 1 ? 0 : i, s = HANDS.state[slot], m = ST.slots[slot];
    if (c.reach != null){ c.on = c.reach > (m.on ? .2 : .28); }   // held out: starts at 28 cm in front of the shoulder, stops under 20
    m.on = c.on; m.c = c;
    s.raw = c.on; s.seen = 6; s.dExt = c.d;
    const k = .45; s.sx += (c.x - s.sx) * k; s.sy += (c.y - s.sy) * k;
  });
  if (ST.debug) stDrawDebug(v, poses, cands);
}

/* ---------------- debug view ---------------- */
function stDrawDebug(v, poses, cands){
  if (!ST.dbg){
    const c = ST.dbg = document.createElement('canvas'); c.width = 480; c.height = 270;
    c.style.cssText = 'position:fixed;z-index:20;left:12px;bottom:12px;width:480px;height:270px;border:1px solid #333;border-radius:8px;pointer-events:none';
    document.body.appendChild(c);
  }
  const c = ST.dbg, x = c.getContext('2d'), W = c.width, H = c.height;
  x.drawImage(v, 0, 0, W, H); x.fillStyle = 'rgba(14,15,19,.35)'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#9aa'; for (const lm of poses) for (const i of [11, 12, 13, 14, 23, 24]){ x.beginPath(); x.arc(lm[i].x * W, lm[i].y * H, 2.5, 0, Math.PI * 2); x.fill(); }
  x.font = '600 12px "IBM Plex Mono", monospace';
  cands.slice(0, 2).forEach((c2, i) => {
    const slot = cands.length === 1 ? 0 : i, px = c2.lm[c2.wi].x * W, py = c2.lm[c2.wi].y * H;
    x.fillStyle = slot ? HANDS.p2 : S.hex; x.beginPath(); x.arc(px, py, c2.on ? 9 : 5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillText((c2.on ? 'SPRAY ' : 'aim ') + c2.note, px + 12, py + 4);
  });
  x.fillStyle = '#fff'; x.fillText(`${ST.trigger} · ${poses.length} seen · ${ST.links.map(L => L.name + ' ' + L.state).join(' · ')}`, 8, 16);
}

/* ---------------- start ---------------- */
function stationInit(){
  const q = ST.q; if (!(q.has('kiosk') || q.has('whip') || q.has('depthcam'))) return;
  ST.on = true; ST.mirror = q.get('mirror') !== '0'; ST.debug = q.get('debug') === '1';
  if (TRIGGERS.includes(q.get('trigger'))) ST.trigger = q.get('trigger');
  if (q.get('kiosk') === '1'){
    document.body.classList.remove('dock'); document.body.classList.add('float', 'kiosk');
    $('#panel').hidden = true; $('#showPanel').hidden = true; resize();
  }
  if (q.get('whip')) whipOut(q.get('whip'));
  if (q.get('depthcam')) startDepthcamHands(q.get('depthcam'));
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'k' && HANDS.ext && !e.ctrlKey && !e.metaKey) stSetTrigger(TRIGGERS[(TRIGGERS.indexOf(ST.trigger) + 1) % TRIGGERS.length]);
  });
  window.__station = ST;
}
