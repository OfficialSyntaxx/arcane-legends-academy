// battle3d.js — 3D duel arena where card creatures come to life.
// Renders the battlefield as animated 3D models that summon in and idle,
// synced to the logic.js duel engine. Uses window.THREE (global).
import { modelUrl, CDN } from "./cdn.js";
import { effectFor, ORIGIN } from "./vfx.js";
const MAX_SLOTS = 5;
const SCHOOL_COLORS = {
  fire: 0xff5a3c, ice: 0x6fc3ff, storm: 0xa06bff, myth: 0xffd766,
  life: 0x3ddc84, death: 0x9fb0c0, balance: 0xffc94d,
};
// Filenames, not URLs — getModel resolves the CDN and keeps the local path as a fallback, the
// same way world.js does. Baking modelUrl() in here meant a CDN outage left the duel arena empty
// with only a console warning, which is the identical failure the world had.
const MODELS = {
  dragon: 'creature_Dragon.glb',
  bat: 'creature_Bat.glb',
  slime: 'creature_Slime.glb',
  skeleton: 'enemy_skeleton.glb',
  mage: 'npc_mage.glb',
  default: 'enemy_skeleton.glb',
};
const LOCAL = name => './assets/models/' + name;
function modelFor(cardId, name) {
  const n = (name || cardId || '').toLowerCase();
  if (/dragon|wyrm|titan|snake|serpent/.test(n)) return MODELS.dragon;
  if (/bat/.test(n)) return MODELS.bat;
  if (/slime|blob|ooze/.test(n)) return MODELS.slime;
  if (/skeleton|bone/.test(n)) return MODELS.skeleton;
  if (/mage|wizard|elf|pixie|walker|novice|assistant|fairy/.test(n)) return MODELS.mage;
  return MODELS.default;
}
function colorFor(cardId, school, name) {
  const n = (name || cardId || '').toLowerCase();
  if (/dragon|wyrm|titan/.test(n)) return 0xd23b3b;
  if (/bat/.test(n)) return 0x8a5bd2;
  if (/slime/.test(n)) return 0x48c774;
  if (/golem|giant|guardian/.test(n)) return 0x9aa0b8;
  if (/reaper|vampire|ghoul|death/.test(n)) return 0x3a3a4a;
  return SCHOOL_COLORS[school] || 0xbd9bff;
}

export function createBattle3d(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.2, 8.6);
  camera.lookAt(0, 0.4, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 9, 5); sun.castShadow = true; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8855ff, 0.5); rim.position.set(-4, 6, -4); scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), new THREE.MeshStandardMaterial({ color: 0x2a2350, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.12, 8, 60), new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0x664400, emissiveIntensity: 0.4 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  const mk = (z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 3), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5 })); m.position.set(0, 0.03, z); scene.add(m); };
  mk(3.2, 0x3ddc84); mk(-3.2, 0xff5a5a);

  const sides = { you: [], enemy: [] };   // arrays of spawned {cardId, group, ...} in board order
  const cache = new Map(); // url -> {template, clip}
  const loader = new THREE.GLTFLoader();
  let raf = 0, last = 0, running = false;

  function slotPos(i, count) {            // center the row across the width
    const spread = Math.min(count, MAX_SLOTS);
    const x = -2 + i * (4 / Math.max(1, spread - 1));
    return { x, z: 0 };
  }
  function getModel(name, cb) {
    if (cache.has(name)) return cb(cache.get(name));
    const cdnUrl = CDN[name];
    tryLoad(cdnUrl || LOCAL(name), cdnUrl ? LOCAL(name) : null);
    function tryLoad(url, fallbackUrl){
    loader.load(url, gltf => {
      const template = gltf.scene;
      template.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      template.updateMatrixWorld(true);
      // scale template to ~1.6 units via skeleton-node-span / geometry
      let minY = Infinity, maxY = -Infinity;
      template.traverse(o => { const p = new THREE.Vector3(); o.getWorldPosition(p); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      const h = maxY - minY;
      if (h > 0.001) template.scale.setScalar(1.6 / h);
      template.position.y -= minY * (1.6 / (h > 0.001 ? h : 1));
      const clip = (gltf.animations && gltf.animations[0]) || null;
      const entry = { template, clip };
      cache.set(name, entry);
      cb(entry);
    },
    undefined,
    err => {
      if (fallbackUrl){ tryLoad(fallbackUrl, null); return; }
      console.warn("duel model failed to load:", url, err && err.message);
    });
    }
  }
  function summon(side, i, count, modelName, color, cardId) {
    const pos = slotPos(i, count);
    const group = new THREE.Group();
    group.position.set(pos.x, 5, side === 'you' ? 2.6 : -2.6);   // starts in the air, drops in
    scene.add(group);
    const entry = { cardId, group, modelName, color, dropping: true, dropT: 0, bob: Math.random() * 6.28, model: null, mixer: null, baseScale: 1 };
    sides[side][i] = entry;
    getModel(modelName, ({ template, clip }) => {
      const model = template.clone();
      model.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); o.material.color.set(color); } });
      entry.baseScale = model.scale.x || 1;
      model.scale.setScalar(0.01);          // grow in during the spawn
      group.add(model);
      entry.model = model;
      if (clip) { entry.mixer = new THREE.AnimationMixer(model); entry.mixer.clipAction(clip).play(); }
    });
  }
  function removeAt(side, i) {
    const e = sides[side][i];
    if (e) { scene.remove(e.group); if (e.mixer) e.mixer.stopAllAction(); }
    sides[side].splice(i, 1);
  }
  // reconcile the 3D arena to the duel board (order-based; creatures filter out when they die)
  function sync(youBoard, enemyBoard) {
    const boards = { you: youBoard || [], enemy: enemyBoard || [] };
    for (const side of ['you', 'enemy']) {
      const board = boards[side];
      const list = sides[side];
      // 1. remove creatures that died or were replaced
      for (let i = list.length - 1; i >= 0; i--) {
        if (i >= board.length || list[i].cardId !== board[i].id) removeAt(side, i);
      }
      // 2. summon new creatures appended in board order
      for (let i = list.length; i < board.length; i++) {
        const c = board[i];
        summon(side, i, board.length, modelFor(c.id, c.name), colorFor(c.id, c.school, c.name), c.id);
      }
      // 3. reposition existing creatures (keeps the row centered)
      for (let i = 0; i < list.length; i++) {
        if (list[i] && !list[i].dropping) { const p = slotPos(i, board.length); list[i].group.position.x = p.x; }
      }
    }
  }
  // ---------------- spell VFX (BACKLOG §4) ----------------
  // vfx.js decides WHAT to play from the card's own effects; this only knows how to draw the six
  // archetypes. Everything here is procedural geometry with additive blending — no assets, and
  // nothing to load, so a spell never waits on a fetch to become visible.
  const fx = [];            // live effects: { kind, t, dur, parts:[{mesh, ...}], light }
  const SIDE_Z = { you: 2.6, enemy: -2.6 };   // must match summon()'s row z, or spells miss

  function addFx(mesh){ scene.add(mesh); return mesh; }
  function glowMat(color, opacity){
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false });
  }
  /** Where a side's row sits; falls back to the row centre when a slot index is not given. */
  function anchor(side, index){
    const list = sides[side] || [];
    const e = (index != null && list[index]) ? list[index] : null;
    return { x: e ? e.group.position.x : 0, z: SIDE_Z[side] || 0 };
  }

  /**
   * Play a spell effect.
   * @param card      the CARDS entry being cast
   * @param casterSide "you" | "enemy"
   * @param targetIdx  slot index on the opposing side, or null for untargeted
   */
  function playSpell(card, casterSide, targetIdx){
    const spec = effectFor(card);
    if (!spec) return null;
    const foeSide = casterSide === "you" ? "enemy" : "you";
    const from = anchor(casterSide, null);
    const to = spec.origin === ORIGIN.CASTER || spec.archetype === "aura" || spec.archetype === "glyph"
      ? from : anchor(foeSide, targetIdx);

    const parts = [];
    const light = new THREE.PointLight(spec.core, 2.2, 9);
    light.position.set(from.x, 1.2, from.z);
    scene.add(light);

    if (spec.archetype === "bolt" || spec.archetype === "beam"){
      const head = addFx(new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glowMat(spec.core, 0.95)));
      const tail = addFx(new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), glowMat(spec.trail, 0.45)));
      parts.push({ mesh: head, role: "head" }, { mesh: tail, role: "tail" });
    } else if (spec.archetype === "burst"){
      const shell = addFx(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glowMat(spec.trail, 0.6)));
      shell.position.set(to.x, 0.7, to.z);
      const core = addFx(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glowMat(spec.core, 0.9)));
      core.position.copy(shell.position);
      parts.push({ mesh: shell, role: "shell" }, { mesh: core, role: "core" });
    } else if (spec.archetype === "rain"){
      // several bolts falling across the whole enemy row, staggered so it reads as a barrage
      const n = Math.min(6, 2 + spec.magnitude);
      for (let i = 0; i < n; i++){
        const m = addFx(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat(spec.core, 0.9)));
        parts.push({ mesh: m, role: "drop", delay: i * 0.09, x: -2.2 + (4.4 * i) / Math.max(1, n - 1) });
      }
    } else if (spec.archetype === "aura"){
      const ring = addFx(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 28), glowMat(spec.core, 0.85)));
      ring.rotation.x = -Math.PI / 2; ring.position.set(from.x, 0.1, from.z);
      const column = addFx(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.4, 14, 1, true), glowMat(spec.trail, 0.3)));
      column.position.set(from.x, 1.2, from.z);
      parts.push({ mesh: ring, role: "ring" }, { mesh: column, role: "column" });
    } else {   // glyph
      const rune = addFx(new THREE.Mesh(new THREE.RingGeometry(0.55, 1.15, 24, 1), glowMat(spec.core, 0.85)));
      rune.rotation.x = -Math.PI / 2; rune.position.set(from.x, 0.06, from.z);
      const inner = addFx(new THREE.Mesh(new THREE.RingGeometry(0.15, 0.4, 12, 1), glowMat(spec.trail, 0.8)));
      inner.rotation.x = -Math.PI / 2; inner.position.set(from.x, 0.07, from.z);
      parts.push({ mesh: rune, role: "rune" }, { mesh: inner, role: "inner" });
    }

    const e = { spec, t: 0, dur: spec.duration, from, to, parts, light };
    fx.push(e);
    return e;
  }

  function stepFx(dt){
    for (let i = fx.length - 1; i >= 0; i--){
      const e = fx[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);        // 0..1 progress
      const fade = 1 - k;
      for (const p of e.parts){
        const m = p.mesh;
        if (p.role === "head" || p.role === "tail"){
          const lead = p.role === "head" ? k : Math.max(0, k - 0.08);
          m.position.set(e.from.x + (e.to.x - e.from.x) * lead, 1.1 + Math.sin(lead * Math.PI) * 0.9,
                         e.from.z + (e.to.z - e.from.z) * lead);
          m.material.opacity = (p.role === "head" ? 0.95 : 0.45) * (k > 0.85 ? fade / 0.15 : 1);
        } else if (p.role === "shell"){
          m.scale.setScalar(0.3 + k * 2.4); m.material.opacity = 0.6 * fade;
        } else if (p.role === "core"){
          m.scale.setScalar(1 + k * 0.6); m.material.opacity = 0.9 * fade * fade;
        } else if (p.role === "drop"){
          const kk = Math.max(0, Math.min(1, (e.t - p.delay) / (e.dur - 0.3)));
          m.visible = kk > 0;
          // start just inside the top of the framed volume, not above it
          m.position.set(p.x, 3.6 - kk * 3.2, e.to.z);
          m.material.opacity = 0.9 * (kk > 0.8 ? (1 - kk) / 0.2 : 1);
        } else if (p.role === "ring"){
          m.position.y = 0.1 + k * 1.8; m.scale.setScalar(1 + k * 0.5); m.material.opacity = 0.85 * fade;
        } else if (p.role === "column"){
          m.material.opacity = 0.3 * Math.sin(k * Math.PI);
        } else if (p.role === "rune"){
          m.rotation.z += dt * 1.6; m.scale.setScalar(0.6 + Math.sin(k * Math.PI) * 0.7);
          m.material.opacity = 0.85 * Math.sin(k * Math.PI);
        } else if (p.role === "inner"){
          m.rotation.z -= dt * 2.6; m.material.opacity = 0.8 * Math.sin(k * Math.PI);
        }
      }
      if (e.light) e.light.intensity = 2.2 * Math.sin(k * Math.PI);
      if (k >= 1){
        // Dispose explicitly. These are created several times per turn, and a duel that leaks a
        // geometry and a material per spell will crawl by the late game.
        for (const p of e.parts){ scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        if (e.light) scene.remove(e.light);
        fx.splice(i, 1);
      }
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    stepFx(dt);
    for (const side of ['you', 'enemy']) {
      for (const e of sides[side]) {
        if (!e) continue;
        if (e.dropping) {
          e.dropT += dt * 2.2;
          const k = Math.min(1, e.dropT);
          e.group.position.y = 5 * (1 - k * k);
          if (e.model) e.model.scale.setScalar(Math.max(0.01, Math.min(1, k * 1.6)) * e.baseScale);
          if (e.dropT >= 1) { e.group.position.y = 0; e.dropping = false; }
        } else {
          e.bob += dt * 2;
          e.group.position.y = Math.abs(Math.sin(e.bob)) * 0.08;
        }
        if (e.mixer) e.mixer.update(dt);
      }
    }
    renderer.render(scene, camera);
  }
  function setSize(w, h) {
    renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    frameArena();
  }
  // The duel canvas is a wide, short strip (1200x331 on desktop), and a fixed camera at that
  // aspect fills the frame with floor — creatures and spell effects sit off the top. Vertical FOV
  // is what a short canvas runs out of, so pull back and rise until the play area fits it.
  function frameArena(){
    // The two rows sit at z = +/-3.2 and creatures stand ~1.6 tall, so the frame has to cover
    // roughly 7 units of depth AND the height above them where spells travel. Depth is what
    // actually binds on a short canvas, since the camera looks down the z axis.
    // Solve it rather than guess: place the camera along a fixed elevation, then push it back
    // until every corner of the play volume projects inside the frustum. Guessing a distance
    // kept putting the NEAR row below the bottom of the canvas — the frame is asymmetric,
    // because the floor runs toward the camera while the far row runs away from it.
    const pts = [];
    for (const x of [-2.6, 2.6]) for (const z of [-3.4, 3.4]) for (const y of [0, 2.6]) pts.push(new THREE.Vector3(x, y, z));
    const look = new THREE.Vector3(0, 1.0, 0);
    for (let dist = 9; dist <= 30; dist += 0.5){
      camera.position.set(0, dist * 0.44, dist * 0.9);
      camera.lookAt(look);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      let fits = true;
      for (const p of pts){
        const n = p.clone().project(camera);
        if (Math.abs(n.x) > 0.94 || Math.abs(n.y) > 0.94){ fits = false; break; }
      }
      if (fits) return;
    }
  }
  function clear() {
    for (const side of ['you', 'enemy']) while (sides[side].length) removeAt(side, sides[side].length - 1);
    for (const e of fx){
      for (const p of e.parts){ scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      if (e.light) scene.remove(e.light);
    }
    fx.length = 0;
  }
  function start() { if (!running){ running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function renderOnce() { renderer.render(scene, camera); }
  function dispose() { stop(); renderer.dispose(); }

  return { setSize, sync, clear, start, stop, renderOnce, dispose, playSpell,
           // exposed for tools/browser-test.mjs, which counts lit pixels to prove effects render
           __scene: scene,
           activeFx: () => fx.length };
}