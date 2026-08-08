// preview3d.js — the rotating 3D character preview on the creation screen (BACKLOG §2).
//
// A deliberately tiny, self-contained renderer. It is NOT world.js with the scenery removed:
// character creation runs before the world exists (and can be reopened from the Dorm screen while
// a world IS running), so it needs its own canvas, its own scene and its own loop that can be
// started and stopped without touching anything else.
//
// It applies the SAME appearance object world.js does, produced by charcreate.js, so what the
// player sees here is what they get in the world. If these two ever drift, the preview becomes a
// lie — which is worse than having no preview.

import { modelUrl } from "./cdn.js";
import { tintTree } from "./tint.js";

const CHAR_HEIGHT = 2.6;         // must match world.js — see CLAUDEREADME §4 "SCALE"

export function createPreview(canvas){
  const THREE = window.THREE;
  if (!THREE) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);

  // Three-point-ish rig. Brighter than the world's, on purpose: this is a shop window, not a
  // dungeon, and the whole point is to show the robe colour clearly.
  scene.add(new THREE.HemisphereLight(0xdfe6f5, 0x2a1f4d, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.5);  rim.position.set(-4, 3, -4); scene.add(rim);

  // A plinth, so the wizard is standing on something rather than floating in a void. Kept dark
  // and unlit on purpose: lit, it became the brightest thing in the frame and the school-coloured
  // aura ring on top of it stopped reading as coloured at all.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.25, 28),
    new THREE.MeshBasicMaterial({ color: 0x171226 }));
  plinth.position.y = -0.125; scene.add(plinth);

  const root = new THREE.Group(); scene.add(root);
  let model = null, mixer = null, auraGroup = null, appearance = null, gearList = [], gearGroups = [];
  let spin = true, yaw = 0, raf = 0, last = performance.now();

  // Procedural stand-in so the panel is never empty while the GLB downloads. Same reasoning as
  // world.js's placeholder wizard: an empty frame reads as broken, a rough one reads as loading.
  const stand = new THREE.Group();
  {
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.7, 1.7, 12), m(0x4a3a7a));
    robe.position.y = 0.85; stand.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), m(0xf0c8a0));
    head.position.y = 1.95; stand.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.85, 12), m(0x2a1f4d));
    hat.position.y = 2.45; stand.add(hat);
    stand.scale.setScalar(CHAR_HEIGHT / 2.9);
    root.add(stand);
  }

  // ---- appearance: the SAME shader patch world.js uses (tint.js) ----
  // Sharing the module is the point. Two copies of this maths would drift, and a preview that
  // disagrees with the world is worse than no preview.
  function applyAppearance(){
    if (!appearance) return;
    tintTree(model || stand, appearance);
    buildAura();
  }
  // Equipped gear, attached to the same bones world.js uses. Sharing the resolved list from
  // equipment3d.js is what keeps the preview honest — it shows the real attachment, not a mock-up.
  function applyGear(){
    for (const g of gearGroups){
      g.traverse(o => { if (o.isMesh){ o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
      if (g.parent) g.parent.remove(g);
    }
    gearGroups = [];
    if (!model || !gearList.length) return;
    for (const a of gearList){
      const bone = model.getObjectByName(a.bone);
      if (!bone) continue;
      const g = new THREE.Group();
      g.position.fromArray(a.pos); g.rotation.fromArray(a.rot);
      bone.add(g); gearGroups.push(g);
      bone.updateWorldMatrix(true, false);
      const sc = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld);
      g.scale.setScalar(1 / Math.max(1e-6, (sc.x + sc.y + sc.z) / 3));
      if (a.model){
        const loader = new THREE.GLTFLoader();
        if (THREE.DRACOLoader){ const d = new THREE.DRACOLoader(); d.setDecoderPath("./vendor/draco/"); loader.setDRACOLoader(d); }
        loader.load("./assets/models/" + a.model, gltf => {
          const m = gltf.scene;
          const box = new THREE.Box3().setFromObject(m);
          const h = Math.max(0.001, box.max.y - box.min.y);
          m.scale.setScalar(a.height / h);
          const c = box.getCenter(new THREE.Vector3()).multiplyScalar(a.height / h);
          m.position.set(-c.x, -c.y, -c.z);
          if (a.color != null) m.traverse(o => {
            if (o.isMesh && o.material && o.material.color){
              o.material = o.material.clone();
              o.material.color.lerp(new THREE.Color(a.color).convertSRGBToLinear(), 0.55);
            }
          });
          g.add(m);
        }, undefined, () => {});
      } else {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(a.height * 0.5, 10, 8),
          new THREE.MeshStandardMaterial({ color: a.color || 0xc8c8c8, roughness: 0.4,
            emissive: new THREE.Color(a.color || 0xc8c8c8), emissiveIntensity: a.glow ? 0.9 : 0 }));
        g.add(bead);
      }
    }
  }

  function buildAura(){
    if (auraGroup){
      auraGroup.traverse(o => { if (o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
      root.remove(auraGroup); auraGroup = null;
    }
    if (!appearance || appearance.aura == null) return;
    auraGroup = new THREE.Group();
    const glow = () => new THREE.MeshBasicMaterial({ color: appearance.aura, transparent: true,
      opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 32, 1), glow());
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; auraGroup.add(ring);
    for (let i = 0; i < (appearance.motes || 0); i++){
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), glow());
      mote.userData.phase = (i / appearance.motes) * Math.PI * 2;
      auraGroup.add(mote);
    }
    root.add(auraGroup);
  }

  // ---- the real model, CDN then local, same retry as world.js makeCharModel ----
  // That retry is not optional: without it a CDN failure leaves every character as the
  // procedural stand-in, which is a bug this project has already shipped once.
  function load(){
    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    if (THREE.DRACOLoader){
      const d = new THREE.DRACOLoader(); d.setDecoderPath("./vendor/draco/"); loader.setDRACOLoader(d);
    }
    const local = "./assets/models/player_wizard.glb";
    // modelUrl() takes a BARE FILENAME, not a path — passing a path silently misses the CDN map
    // and the "retry" becomes two attempts at the same local file.
    const tryUrl = (url, onFail) => loader.load(url, gltf => {
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      m.scale.setScalar(CHAR_HEIGHT / Math.max(0.001, size.y));
      const box2 = new THREE.Box3().setFromObject(m);
      m.position.y -= box2.min.y;
      root.remove(stand);
      root.add(m);
      model = m;
      if (gltf.animations && gltf.animations.length){
        mixer = new THREE.AnimationMixer(m);
        // Prefer an idle if the rig has one; otherwise the first clip. A T-pose in a shop window
        // is exactly the thing this project already had to fix once.
        const idle = gltf.animations.find(c => /idle|stand/i.test(c.name)) || gltf.animations[0];
        mixer.clipAction(idle).play();
      }
      applyAppearance();
      applyGear();
    }, undefined, onFail);
    tryUrl(modelUrl("player_wizard.glb"), () => tryUrl(local, () => {}));
  }
  load();

  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (spin) yaw += dt * 0.6;
    root.rotation.y = yaw;
    if (mixer) mixer.update(dt);
    if (auraGroup) for (const m of auraGroup.children){
      if (m.userData.phase == null) continue;
      const a = m.userData.phase + now / 1000 * 0.8;
      m.position.set(Math.cos(a) * 1.05, 0.6 + Math.sin(a * 1.7) * 0.4, Math.sin(a) * 1.05);
    }
    renderer.render(scene, camera);
  }

  function resize(){
    const w = canvas.clientWidth || 260, h = canvas.clientHeight || 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // Frame the whole character with a little headroom, from slightly above eye level.
    camera.position.set(0, CHAR_HEIGHT * 0.62, CHAR_HEIGHT * 2.15);
    camera.lookAt(0, CHAR_HEIGHT * 0.48, 0);
  }
  resize();

  return {
    setAppearance(look){ appearance = look; applyAppearance(); },
    setGear(list){ gearList = list || []; applyGear(); },
    setSpin(on){ spin = on; },
    nudge(dx){ yaw += dx * 0.01; },
    start(){ if (!raf){ last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop(){ cancelAnimationFrame(raf); raf = 0; },
    resize,
    renderOnce(){ renderer.render(scene, camera); },     // tests read pixels, see CLAUDEREADME §9
    loaded(){ return !!model; },
    dispose(){ cancelAnimationFrame(raf); raf = 0; renderer.dispose(); },
  };
}
