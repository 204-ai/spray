/* ================================================================
   Frame loop
   ================================================================ */
function resize(){
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  mistMat.uniforms.scale.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);

function frameUniforms(){
  for (const W of walls){ W.mat.uniforms.aim.value.w = 0; W.mat.uniforms.shadow.value.w = 0; W.mat.uniforms.guideOpacity.value = G.visible ? 1 : 0; }
  const Q = me, W = Q.wall;
  if (!W || !Q.visible) return;
  const U = W.mat.uniforms;
  if (Q.tool === 'spray'){
    const cap = CAPS[Q.cap];
    const show = S.aim && !AP.running && P.over && S.mode === 'paint' && !(Q.spraying);
    U.aim.value.set(Q.u, Q.v, cap.r0 + cap.k * Q.d, show ? 1 : 0); U.aimShape.value.set(cap.aspect || 1, cap.aspect ? Q.fan : 0);
    // soft can shadow thrown along the sun direction, in wall space
    const L = LU.sunDir.value, n = W.normal, lz = Math.max(.15, L.dot(n)), tx = L.x*Math.cos(W.rot) - L.z*Math.sin(W.rot), cz = Q.d + .02;
    U.shadow.value.set(Q.u - tx/lz*cz, (Q.v - .09) - L.y/lz*cz, .03 + cz*.55, clamp(.55 - cz*1.4, 0, .5) * (lightMode === 'night' ? .3 : 1));
  } else {
    const M = MARKERS[Q.marker]; U.aim.value.set(Q.u, Q.v, M.w/2 + .002, (S.aim && !Q.spraying && S.mode === 'paint') ? .8 : 0); U.aimShape.value.set(1, 0);
  }
}

let last = performance.now(), hudT = 0;
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  heldKeys(dt); camStep(dt);
  me.syncFromS();
  let hissP = null;
  if (AP.running){ if (apTick(dt)) hissP = me; }
  else if (mouseTick(dt)) hissP = me;
  const hp = handsTick(dt); if (hp && !hissP) hissP = hp;
  remoteFromPresence(dt);
  for (const W of walls){ if (AP.running && W === AP.wall) continue; if (S.drips) updateDrips(W, dt); updateWet(W, dt); }
  flushAll();
  setHiss(!!hissP, hissP || me);
  updateMist(dt);
  placeAvatar(me, dt);
  HANDS.painters.forEach(p => placeAvatar(p, dt));
  for (const m of NET.remote.values()) for (const p of m.values()) placeAvatar(p, dt);
  netFlush();
  frameUniforms();
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  if ((hudT -= dt) <= 0){ hudT = .1;
    if (S.tool === 'spray'){ $('#hudDist').textContent = `${(me.d*100).toFixed(1)}cm`; const cap = CAPS[me.cap]; $('#hudW').textContent = (2*(cap.r0 + cap.k*me.d)*100).toFixed(1) + 'cm'; $('#hudP').style.width = (me.pressure*100).toFixed(0) + '%'; $('#hudPK').textContent = 'psi'; }
    else { $('#hudDist').textContent = 'contact'; $('#hudW').textContent = (MARKERS[me.marker].w*1000).toFixed(1) + 'mm'; $('#hudP').style.width = (me.ink*100).toFixed(0) + '%'; $('#hudPK').textContent = 'ink'; if (me.spraying) updateToolNote(); }
    if (AP.running) apProgressUI();
    if (++STORE.tick % 12 === 0) autosaveTick();
  }
  requestAnimationFrame(frame);
}

/* ================================================================
   Boot
   ================================================================ */
async function boot(){
  const msg = t => { $('#loadMsg').textContent = t; return new Promise(r => setTimeout(r, 16)); };
  resize();
  await msg('Loading your spray can…'); loadCanAssets(); me.avatar = makeAvatar(null); me.setColor(S.hex);
  await msg('Laying the yard…'); buildYard(); setLighting('day');
  await msg('Building the controls…');
  wireUI(); setTool('spray'); selectCap(1); setColor('#ff2fa8', 'Neon Pink'); recent = []; renderRecent(); setDist(.12); setMode('paint');
  if (window.innerWidth <= 720){ $('#panel').hidden = true; $('#showPanel').hidden = false; }
  await msg('Opening your yard…');
  let restored = false;
  try { restored = await restoreAutosave(); } catch (e) { console.error(e); }
  if (!restored){ if (walls.length) disposeAll(); await msg('Mixing brick, concrete and steel…'); await defaultYard(); }
  else saveNote('Your last session was restored from this browser.');
  STORE.busy = false; updateUndoUI();
  goHome(false);
  $('#loading').hidden = true;
  toast(restored ? 'Welcome back. Your yard is how you left it.' : 'Hold the mouse button to spray. Scroll zooms, middle-drag looks around, Shift + middle-drag pans.');
  requestAnimationFrame(t => { last = t; frame(t); });
  initRoom();
  window.__spraylab = { STORE, autosaveTick, undo, redo, pickColor, exportProject, sceneState, newYard, P, S, G, AP, me, walls, cam, apStart, apTick, planAuto, flushAll, setTool, setColor, selectCap, selectMarker, setDist, setMode, setLighting, addWall, Wall, painterTick };
}
boot().catch(e => { console.error(e); fatal('Something went wrong while starting: ' + (e && e.message || e)); });
