// battle3d.js — 3D duel arena where card creatures come to life.
// Renders the battlefield as animated 3D models that summon in and idle,
// synced to the logic.js duel engine. Uses window.THREE (global).
import { modelUrl } from "./cdn.js";
const MAX_SLOTS = 5;
const SCHOOL_COLORS = {
  fire: 0xff5a3c, ice: 0x6fc3ff, storm: 0xa06bff, myth: 0xffd766,
  life: 0x3ddc84, death: 0x9fb0c0, balance: 0xffc94d,
};
const MODELS = {
  dragon: modelUrl('creature_Dragon.glb'),
  bat: modelUrl('creature_Bat.glb'),
  slime: modelUrl('creature_Slime.glb'),
  skeleton: modelUrl('enemy_skeleton.glb'),
  mage: modelUrl('npc_mage.glb'),
  default: modelUrl('enemy_skeleton.glb'),
};
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
  function getModel(url, cb) {
    if (cache.has(url)) return cb(cache.get(url));
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
      cache.set(url, entry);
      cb(entry);
    });
  }
  function summon(side, i, count, url, color, cardId) {
    const pos = slotPos(i, count);
    const group = new THREE.Group();
    group.position.set(pos.x, 5, side === 'you' ? 2.6 : -2.6);   // starts in the air, drops in
    scene.add(group);
    const entry = { cardId, group, url, color, dropping: true, dropT: 0, bob: Math.random() * 6.28, model: null, mixer: null, baseScale: 1 };
    sides[side][i] = entry;
    getModel(url, ({ template, clip }) => {
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
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
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
  }
  function clear() {
    for (const side of ['you', 'enemy']) while (sides[side].length) removeAt(side, sides[side].length - 1);
  }
  function start() { if (!running){ running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function renderOnce() { renderer.render(scene, camera); }
  function dispose() { stop(); renderer.dispose(); }

  return { setSize, sync, clear, start, stop, renderOnce, dispose };
}