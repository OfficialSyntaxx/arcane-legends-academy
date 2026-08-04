// Arcane Legends — full 3D academy world (Three.js). A walkable, living campus like Wizard101/OSRS.
// Rich procedural low-poly characters (animated wizards), themed buildings, a fountain, trees,
// gathering nodes for every material, and NPCs that hand out quests and open the market.
// Mobile-first: touch joystick + tap-to-move + auto-follow camera. The DOM UI drives the 2D panels.
import { WORLD_NODES } from "./nodes.js";
import { BUILDINGS, LANDMARKS, NPCS, WANDERERS, PLAYER_SPAWN, OBSTACLES, TREE_RING, PLAYER_RADIUS, WORLD_BOUND, doorPos, resolveCollisions } from "./structures.js";

export function createWorld(canvas, callbacks){
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x1a1440);
  // COLOUR MANAGEMENT. Without this, glTF textures — which GLTFLoader correctly tags as sRGB —
  // are rendered as if they were linear, which is why generated models looked rich in the
  // Higgsfield/Tripo viewer and muddy here: the gold trim and saturated robes flattened out.
  // three r128 has no automatic colour management, so the flip side is that plain material
  // colours (our procedural buildings) must now be linearised by hand — see `mat()` below.
  renderer.outputEncoding = THREE.sRGBEncoding;
  // Filmic tone mapping. The generated models are PBR and the scene's light rig is bright enough
  // to blow their pale stone textures out to flat lavender once gamma is correct; ACES rolls the
  // highlights off instead of clipping them, which is what keeps the carved detail readable.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1a4a, 95, 250);
  // Generated models are PBR (metallic/roughness). With no environment to reflect, metal renders
  // near-black and everything looks flat — this is the other half of why they lost their shine.
  // A tiny procedural sky/ground gradient costs no assets and gives them something to catch.
  (function buildEnvironment(){
    try {
      const c = document.createElement('canvas'); c.width = 16; c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 64);
      // Deliberately DIM. This exists so PBR metal has something to reflect, not to light the
      // scene — the directional/hemisphere rig already does that. A bright gradient here acts as
      // a second full-strength ambient light and washes the generated models out to pale grey.
      grad.addColorStop(0.00, '#2e3a63');   // sky
      grad.addColorStop(0.45, '#4a4460');   // horizon
      grad.addColorStop(1.00, '#161228');   // ground bounce
      g.fillStyle = grad; g.fillRect(0, 0, 16, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose(); tex.dispose();
    } catch(e){ console.warn("environment map unavailable:", e && e.message); }
  })();

  const camera = new THREE.PerspectiveCamera(62, canvas.clientWidth/canvas.clientHeight, 0.1, 420);
  camera.position.set(0, 8, 16);

  // ---- sky: solid clear color (reliable) ----
  renderer.setClearColor(0x1a1440);

  // lights
  // NOTE: these intensities were retuned when colour management went in. The old values were
  // set against an uncorrected pipeline that rendered everything ~2 stops dark, so once gamma
  // was right they blew the generated models' pale stone out to flat lavender.
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1f4d, 0.42));
  const sun = new THREE.DirectionalLight(0xffd9a0, 0.55);
  sun.position.set(20, 40, 14);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.15);
  moon.position.set(-20, 30, -20); scene.add(moon);
  // warm courtyard glow
  const glow = new THREE.PointLight(0xff8844, 0.55, 90);
  glow.position.set(0, 12, 0); scene.add(glow);

  // Procedural colours are authored as sRGB hex, so they must be converted to linear now that
  // the renderer gamma-encodes its output. Without this the whole hand-built world washes out.
  const mat = c => {
    const m = new THREE.MeshLambertMaterial({ color: c });
    m.color.convertSRGBToLinear();
    return m;
  };
  const srgb = hex => new THREE.Color(hex).convertSRGBToLinear();
  const add = (geo, m, x, y, z, o={}) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.cast !== false) mesh.castShadow = true;
    if (o.receive !== false) mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // ---------- ground ----------
  const ground = add(new THREE.PlaneGeometry(300, 300), mat(0x2f7d4f), 0, 0, 0, {receive:true});
  ground.rotation.x = -Math.PI/2;
  // courtyard platform — removed (large flat disc reads as an edge-on artifact at this camera angle)
  // paths radiating from center
  for (let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2 + Math.PI/4;
    const p = add(new THREE.PlaneGeometry(4.6, 52), mat(0xc9b877), Math.cos(a)*16, 0.06, Math.sin(a)*16, {receive:true, cast:false});
    p.rotation.x = -Math.PI/2; p.rotation.z = a;
  }

  // ---------- building generator ----------
  const HOLLOW = 0x6a5b9e, VIO = 0x3a2d6e, GOLD = 0xffc94d, WOOD = 0x8a5a2b, ROOFB = 0x2f4f8a;
  function stucco(x,z,w,d,h,ry=0,wall=HOLLOW,roof=ROOFB){
    const parts = [];
    const base = add(new THREE.BoxGeometry(w,h,d), mat(wall), x, h/2, z, {ry}); parts.push(base);
    // 0.78 of the LONGEST side as a radius made every roof ~1.56x the building wide — the dorm
    // roof alone was an 11-unit disc over a 7-unit building, big enough to fill the camera.
    const p4 = add(new THREE.ConeGeometry(Math.max(w,d)*0.62, h*0.6, 4), mat(roof), x, h + h*0.3, z, {ry}); parts.push(p4);
    const door = add(new THREE.BoxGeometry(w*0.28, h*0.5, 0.25), mat(WOOD), x, h*0.25, z + d/2 + 0.05, {ry}); parts.push(door);
    // windows
    for (const sx of [-0.3, 0.3]){
      const wx = x + (Math.cos(ry)*w*0.32*sx), wz = z + (Math.sin(ry)*w*0.32*sx);
      parts.push(add(new THREE.BoxGeometry(0.5, 0.5, 0.15), mat(0xffe9b0), wx, h*0.55, z + d*0.5*sx + (Math.sin(ry)*0.5), {cast:false}));
    }
    return parts;
  }
  // Buildings come from the shared table in structures.js, which also supplies their collision
  // boxes and door positions — so a building can never be solid in one place and walk-through
  // in another, and its station prompt is always reachable from outside.
  // Each building's procedural box goes in its own Group so a generated GLB can replace it
  // in-place once loaded (and stays as the visible fallback if the load fails).
  const buildingGroups = {};
  for (const b of BUILDINGS){
    const g = new THREE.Group(); scene.add(g);
    buildingGroups[b.id] = g;
    for (const m of stucco(b.x, b.z, b.w, b.d, b.h, b.ry, b.wall, b.roof)) g.add(m);
  }
  // Duel Arena (center-back) — procedural placeholder, replaced by the generated GLB
  const arenaGroup = new THREE.Group(); scene.add(arenaGroup);
  {
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 12.5, 3.4, 28), mat(0x4a3a7a));
    plat.position.set(0, 1.7, -32); arenaGroup.add(plat);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(13.2, 4.2, 28), mat(0x2a1f4d));
    cone.position.set(0, 5.5, -32); arenaGroup.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.55, 8, 28), mat(GOLD));
    ring.position.set(0, 6.0, -32); arenaGroup.add(ring);
  }
  // banners on buildings — removed (flat planes read as artifacts at this camera angle)
  // street lamps along paths
  function lamp(x,z){
    add(new THREE.CylinderGeometry(0.11,0.17,5.0,6), mat(0x3a3a46), x, 2.5, z);
    const l = add(new THREE.SphereGeometry(0.38,8,8), mat(0xffd98a), x, 5.0, z);
    l.material.emissive = srgb(0xffaa44); l.material.emissiveIntensity = 1.5;
  }
  lamp(13,13); lamp(-13,13); lamp(13,-13); lamp(-13,-13); lamp(0,24); lamp(0,-24); lamp(26,0); lamp(-26,0);
  // central tower — procedural placeholder, replaced by the generated GLB once it loads
  // (see loadLandmarkModel below). Grouped so the swap is a clean children-replace, the same
  // idiom makeCharModel uses for the wizard/NPC placeholders.
  const towerGroup = new THREE.Group(); scene.add(towerGroup);
  (() => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 6.3, 30, 10), mat(0x5a4a8a));
    shaft.position.set(0, 15, 0); towerGroup.add(shaft);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.1, 9.5, 10), mat(0x2a1f4d));
    roof.position.set(0, 34.8, 0); towerGroup.add(roof);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 12), mat(GOLD));
    orb.position.set(0, 41, 0); towerGroup.add(orb);
  })();
  // floating crystal spires (blue diamond tips caused visual glitch in some GPUs) — moved far outside view
  for (let i=0;i<8;i++){
    const a = (i/8)*Math.PI*2 + 0.3, r = 130 + (i%2)*12;
    add(new THREE.CylinderGeometry(0.7, 1.6, 12, 6), mat(0x9fb8ff), Math.cos(a)*r, 6, Math.sin(a)*r);
    const tip = add(new THREE.IcosahedronGeometry(1.6, 0), mat(0x7be0ff), Math.cos(a)*r, 13.6, Math.sin(a)*r);
    tip.material.emissive = srgb(0x7be0ff); tip.material.emissiveIntensity = 0.7;
  }

  // ---------- trees ----------
  function tree(x,z,s=1){
    add(new THREE.CylinderGeometry(0.25*s, 0.4*s, 1.6*s, 6), mat(0x6a4a2b), x, 0.8*s, z);
    add(new THREE.ConeGeometry(1.1*s, 1.6*s, 7), mat(0x2f9e63), x, 2.4*s, z);
    add(new THREE.ConeGeometry(0.8*s, 1.2*s, 7), mat(0x3ab878), x, 3.4*s, z);
  }
  for (const t of TREE_RING) tree(t.x, t.z, t.s);

  // ---------- fountain (moved off the central tower) ----------
  add(new THREE.CylinderGeometry(4.8, 5.5, 1.1, 22), mat(0x9aa0b8), 0, 0.55, -18);
  add(new THREE.CylinderGeometry(0.75, 0.95, 3.0, 8), mat(0x9aa0b8), 0, 2.6, -18);
  add(new THREE.SphereGeometry(0.95, 10, 10), mat(0x7be0ff), 0, 4.5, -18);
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 20), mat(0x3a86c8), 0, 1.15, -18, {receive:true});

  // ---------- torches at nodes ----------
  function torch(x,z){
    add(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 6), mat(0x5a3a1a), x, 1.3, z);
    const flame = add(new THREE.SphereGeometry(0.28, 8, 8), mat(0xffb347), x, 2.8, z);
    flame.material.emissive = srgb(0xff8833); flame.material.emissiveIntensity = 1.2;
  }

  // ---------- rich procedural wizard ----------
  function makeWizard(main, hat, skin=0xf0c8a0, opts={}){
    const g = new THREE.Group();
    const robe = add(new THREE.CylinderGeometry(0.34, 0.55, 1.3, 10), mat(main), 0, 0.68, 0);
    const chest = add(new THREE.CylinderGeometry(0.4, 0.42, 0.5, 10), mat(main), 0, 1.18, 0);
    const belt = add(new THREE.CylinderGeometry(0.42, 0.43, 0.12, 10), mat(GOLD), 0, 0.95, 0);
    const head = add(new THREE.SphereGeometry(0.3, 12, 12), mat(skin), 0, 1.62, 0);
    const eyeL = add(new THREE.SphereGeometry(0.045, 6, 6), mat(0x1a1a2e), -0.11, 1.68, 0.26);
    const eyeR = add(new THREE.SphereGeometry(0.045, 6, 6), mat(0x1a1a2e), 0.11, 1.68, 0.26);
    const hatMesh = add(new THREE.ConeGeometry(0.32, 0.72, 10), mat(hat), 0, 2.05, 0);
    const brim = add(new THREE.CylinderGeometry(0.36, 0.38, 0.06, 10), mat(hat), 0, 1.74, 0);
    // arms
    const armL = new THREE.Group(); armL.position.set(-0.44, 1.28, 0);
    const aL = add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), mat(main), 0, -0.25, 0); armL.add(aL);
    const armR = new THREE.Group(); armR.position.set(0.44, 1.28, 0);
    const aR = add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), mat(main), 0, -0.25, 0); armR.add(aR);
    // staff or wand in right hand
    const staff = add(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), mat(0x8a5a2b), 0.44, 0.95, 0.12);
    const orb = add(new THREE.SphereGeometry(0.09, 8, 8), mat(opts.orb||0x7be0ff), 0.44, 1.5, 0.12);
    orb.material.emissive = new THREE.Color(opts.orb||0x7be0ff); orb.material.emissiveIntensity = 0.8;
    // legs
    const legL = new THREE.Group(); legL.position.set(-0.16, 0.32, 0);
    const lL = add(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 6), mat(0x2a2a3a), 0, -0.25, 0); legL.add(lL);
    const legR = new THREE.Group(); legR.position.set(0.16, 0.32, 0);
    const lR = add(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 6), mat(0x2a2a3a), 0, -0.25, 0); legR.add(lR);
    g.add(robe, chest, belt, head, eyeL, eyeR, hatMesh, brim, armL, armR, staff, orb, legL, legR);
    g.userData = { armL, armR, legL, legR, staff, orb, robe, chest, hatMesh, brim };
    return g;
  }
  function animateWizard(g, t, speed){
    const r = Math.sin(t*9)*0.55*speed;
    g.userData.armL.rotation.x = r; g.userData.armR.rotation.x = -r;
    g.userData.legL.rotation.x = -r; g.userData.legR.rotation.x = r;
    g.userData.staff.rotation.x = 0;
    g.position.y = Math.abs(Math.sin(t*9))*0.09*speed;
  }

  // ---------- player ----------
  let schoolColor = null;
  function applyPlayerColor(){
    if (schoolColor == null) return;
    const ud = player.userData;
    if (ud && ud.robe && ud.robe.parent){ ud.robe.material.color.set(schoolColor); ud.chest.material.color.set(schoolColor); }
    const pc = chars.player;
    if (pc && pc.model){
      // tint the loaded model with the school colour without flattening its texture
      pc.model.traverse(o => {
        if (o.isMesh && o.material && o.material.color && !o.userData._tintBase){
          o.userData._tintBase = o.material.color.clone();
        }
      });
      pc.model.traverse(o => {
        if (o.isMesh && o.material && o.material.color){
          const base = o.userData._tintBase;
          o.material = o.material.clone();
          o.material.color.copy(base).lerp(new THREE.Color(schoolColor), 0.45);
        }
      });
    }
  }
  const player = makeWizard(0x3a6bd8, 0x2a1f4d);
  player.position.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
  scene.add(player);
  const playerSpeed = 14;

  // ---------- gathering nodes (all materials) ----------
  const interactives = [];
  function register(kind, x, z, data, label, mesh, radius=4.6){
    interactives.push({ kind, x, z, data, label, mesh, radius });
  }
  function crystalNode(x,z,color,data,label){
    const c = add(new THREE.IcosahedronGeometry(1.0, 0), mat(color), x, 1.3, z);
    c.material.emissive = new THREE.Color(color); c.material.emissiveIntensity = 0.35;
    add(new THREE.CylinderGeometry(0.5, 0.8, 2.6, 6), mat(0x5a5a66), x, 1.3, z);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 6), mat(color), x+0.5, 0.9, z+0.4);
    torch(x, z);
    register('gather', x, z, data, label, c);
  }
  function woodNode(x,z,data,label,magic){
    // magic trees glow faintly so the level-50 tier reads as special from a distance
    add(new THREE.CylinderGeometry(0.9, 1.1, 1.3, 8), mat(magic?0x6a4a8a:0x8a5a2b), x, 0.65, z);
    add(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 6), mat(magic?0x5a3a7a:0x6a4a2b), x+0.7, 0.6, z-0.5);
    const crown = add(new THREE.ConeGeometry(1.0, 1.4, 7), mat(magic?0x7be0ff:0x2f9e63), x+0.7, 2.2, z-0.5);
    if (magic){ crown.material.emissive = srgb(0x4a9edd); crown.material.emissiveIntensity = 0.45; }
    torch(x, z);
    register('gather', x, z, data, label, null);
  }
  function pond(x,z,data,label,deep){
    // deep water (shark) is darker and wider than the shallow shrimp/salmon pools
    const r = deep ? 3.4 : 2.8;
    add(new THREE.CylinderGeometry(r, r, 0.12, 24), mat(deep?0x1f5a8a:0x3a86c8), x, 0.06, z, {receive:true});
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 8), mat(0x9fd8ff), x-0.6, 0.14, z+0.4);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 8), mat(0x9fd8ff), x+0.5, 0.14, z-0.5);
    register('gather', x, z, data, label, null);
  }
  // Built from the shared node table (public/nodes.js) so the world and the recipe data in
  // items.js can't drift apart — tools/test.mjs asserts every recipe input has a node here.
  for (const n of WORLD_NODES){
    if (n.kind === 'crystal') crystalNode(n.x, n.z, n.color, n.id, n.label);
    else if (n.kind === 'wood') woodNode(n.x, n.z, n.id, n.label, n.magic);
    else if (n.kind === 'pond') pond(n.x, n.z, n.id, n.label, n.deep);
  }

  // ---------- stations ----------
  // Placed at each building's door (just outside the wall) rather than at its centre — with
  // collision on, a prompt at the centre would be sealed inside the building.
  for (const b of BUILDINGS){
    if (b.noStation) continue;
    const d = doorPos(b);
    register('station', d.x, d.z, b.id, b.label, null, 5.5);
  }

  // ---------- NPCs (living academy) ----------
  const npcs = [];
  function makeNpc(x, z, main, hat, opts={}){
    const g = makeWizard(main, hat, opts.skin||0xf0c8a0, opts);
    g.position.set(x, 0, z);
    scene.add(g);
    npcs.push({ mesh:g, tx:x, tz:z, t:0, pause:0, role:opts.role||'wander', key:opts.key });
    return g;
  }
  // Named NPCs come from structures.js so their positions are covered by the walkability test
  // (before collision existed, the professor and merchant were standing inside their buildings).
  const npcByKey = {};
  for (const n of NPCS){
    const g = makeNpc(n.x, n.z, n.main, n.hat, { role:n.role, orb:n.orb, key:n.key });
    npcByKey[n.key] = g;
    register('station', n.x, n.z, n.station, n.label, g, 5.5);
  }
  // wandering students
  const wanderers = [];
  for (let i=0;i<WANDERERS.length;i++){
    const a = (i/WANDERERS.length)*Math.PI*2 + 0.5;
    const w = WANDERERS[i];
    const g = makeNpc(Math.cos(a)*34, Math.sin(a)*34, w.main, w.hat, { role:'wander', key:w.key });
    wanderers.push(g);
  }

  // ---------- load GLB character models (replace procedural wizards) ----------
  const chars = {}; // entityKey -> {model, mixer, walk, idle}
  // Loading progress, so the UI can show a state instead of a silently-empty world.
  const loadState = { total:0, done:0, failed:[] };
  function loadProgress(){
    if (callbacks.onLoadProgress) callbacks.onLoadProgress({ ...loadState, models:{ ...chars } });
  }
  // Draco decoder, shared by every model load. The GLBs are Draco-compressed (22MB -> 3.4MB
  // across the character set), which the loader cannot read without this.
  let dracoLoader = null;
  function getDraco(){
    if (dracoLoader || !THREE.DRACOLoader) return dracoLoader;
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('./vendor/draco/');   // relative: the game is served under a subpath
    dracoLoader.setDecoderConfig({ type: 'js' });
    return dracoLoader;
  }
  function makeCharModel(key, url, group, onReady){
    loadState.total++;
    const loader = new THREE.GLTFLoader();
    const d = getDraco();
    if (d) loader.setDRACOLoader(d);
    loader.load(url, gltf => {
      const model = gltf.scene;
      // Determine whether this is a skinned character (skeleton spans the real size) or a
      // static mesh (the geometry box is the real size). Both are sized to ~1.8 units tall.
      let isSkinned = false;
      const geoBox = new THREE.Box3();
      model.traverse(o => {
        if (o.isSkinnedMesh) isSkinned = true;
        if (o.isMesh && o.geometry) geoBox.union(new THREE.Box3().setFromObject(o));
      });
      model.updateMatrixWorld(true);
      let minY, maxY, minX, maxX, minZ, maxZ;
      if (isSkinned){
        // Skinned Meshy GLBs: the object box is degenerate and the raw mesh box is only the
        // bind pose — the real size is the SKELETON NODE SPAN (bones sit far above the mesh).
        minY = Infinity; maxY = -Infinity; minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
        model.traverse(o => {
          const p = new THREE.Vector3(); o.getWorldPosition(p);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });
      } else {
        minY = geoBox.min.y; maxY = geoBox.max.y;
        minX = geoBox.min.x; maxX = geoBox.max.x;
        minZ = geoBox.min.z; maxZ = geoBox.max.z;
      }
      const height = maxY - minY;
      let scale = 1.8;
      if (height > 0.001) scale = 1.8 / height;
      scale = Math.max(0.001, Math.min(300, scale));
      model.scale.setScalar(scale);
      // center so feet rest at y=0
      model.updateMatrixWorld(true);
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      model.position.x -= cx * scale; model.position.z -= cz * scale;
      model.position.y -= minY * scale;
      const entry = { model, mixer: null, walk: null, idle: null, rawSize: height, meshWorldScale: 1, computedScale: scale, bones: {}, baseRot: {}, walking: false, walkT: 0, walkSpeed: 1 };
      // collect the skeleton bones (standard biped names) so we can add a procedural walk cycle
      model.traverse(o => { if (o.isBone){ entry.bones[o.name] = o; entry.baseRot[o.name] = o.quaternion.clone(); } });
      // Only now remove the procedural stand-in. It used to be cleared before the model was
      // ready in some paths, which left an empty Group — an invisible character — if the GLB
      // was slow or missing.
      if (group){
        const placeholder = group.children.slice();
        group.add(model);
        for (const c of placeholder) group.remove(c);
      }
      if (gltf.animations && gltf.animations.length){
        entry.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations){
          const n = clip.name.toLowerCase();
          if (n.includes('walk') || n.includes('run')) entry.walk = entry.mixer.clipAction(clip);
          else if (!entry.idle) entry.idle = entry.mixer.clipAction(clip);
        }
        if (!entry.idle && gltf.animations[0]) entry.idle = entry.mixer.clipAction(gltf.animations[0]);
        if (entry.idle) entry.idle.play();
      }
      chars[key] = entry;
      loadState.done++; loadProgress();
      if (onReady) onReady(entry);
    },
    undefined,
    err => {
      // Keep the procedural wizard rather than leaving a hole in the world, and say so.
      console.warn("character model failed to load:", url, err && err.message);
      loadState.done++; loadState.failed.push(key); loadProgress();
    });
  }
  // Generated GLB character models — keys match NPC roles so the update loop uses the GLB mixer.
  makeCharModel('player', './assets/models/player_wizard.glb', player, ()=>applyPlayerColor());
  for (const n of NPCS) makeCharModel(n.key, './assets/models/' + n.model, npcByKey[n.key]);
  for (let i=0;i<WANDERERS.length;i++) makeCharModel(WANDERERS[i].key, './assets/models/' + WANDERERS[i].model, wanderers[i]);

  // ---------- static landmark/building models (unlike characters, no fixed 1.8 target height —
  // each is scaled to its own footprint, and stays centered on X/Z with its base at y=0) ----------
  // `fit` is "height" or "width": height for things whose height defines them (the tower),
  // width when the FOOTPRINT is the gameplay-relevant dimension (the arena floor is the duel
  // space, so its diameter must be right and the height follows from the model's proportions).
  function loadLandmarkModel(key, url, group, opts){
    const { size, fit = "height", x = 0, z = 0, ry = 0, onReady } = opts;
    loadState.total++;
    const loader = new THREE.GLTFLoader();
    const d = getDraco();
    if (d) loader.setDRACOLoader(d);
    loader.load(url, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const basis = fit === "width" ? w : h;
      const scale = basis > 0.001 ? size / basis : 1;
      model.scale.setScalar(scale);
      model.rotation.y = ry;
      model.updateMatrixWorld(true);
      // centre on X/Z and sit the base on the ground, then move to the world position
      const cx = (box.min.x + box.max.x) / 2 * scale, cz = (box.min.z + box.max.z) / 2 * scale;
      model.position.set(x - cx, -box.min.y * scale, z - cz);
      const placeholder = group.children.slice();
      group.add(model);
      for (const c of placeholder) group.remove(c);
      chars[key] = { model, mixer:null, walk:null, idle:null, rawSize:basis, computedScale:scale };
      loadState.done++; loadProgress();
      if (onReady) onReady();
    },
    undefined,
    err => {
      // Keep the procedural placeholder rather than an empty patch of ground.
      console.warn("landmark model failed to load:", url, err && err.message);
      loadState.done++; loadState.failed.push(key); loadProgress();
    });
  }
  // Standalone landmarks (tower, arena) — generated via Tripo (2D->3D). Their collision shapes
  // in structures.js are sized to these models' real footprints, not the old procedural ones.
  const landmarkGroups = { tower: towerGroup, arena: arenaGroup };
  for (const L of LANDMARKS){
    const g = landmarkGroups[L.key];
    if (g) loadLandmarkModel(L.key, './assets/buildings/' + L.url, g, { size:L.size, fit:L.fit, x:L.x, z:L.z, ry:L.ry });
  }
  // Buildings that have a generated model replace their procedural box in place.
  for (const b of BUILDINGS){
    if (!b.model) continue;
    loadLandmarkModel('bld_' + b.id, './assets/buildings/' + b.model, buildingGroups[b.id],
      { size:b.h, fit:"height", x:b.x, z:b.z, ry:b.ry + (b.modelRy || 0) });
  }

  // ---------- input ----------
  const keys = new Set();
  const BIND = { KeyW:'f', KeyS:'b', KeyA:'l', KeyD:'r', ArrowUp:'f', ArrowDown:'b', ArrowLeft:'l', ArrowRight:'r' };
  const kd = e => { const c=BIND[e.code]; if(c){ keys.add(c); e.preventDefault(); } };
  const ku = e => { const c=BIND[e.code]; if(c) keys.delete(c); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  let joy = { x:0, y:0 };
  let tapTarget = null, tapSet = false;
  // camera orbit (drag to rotate, pinch to zoom) — mobile open-world feel
  // Tuned against the rescaled campus: close/low enough that the 1.8m player reads clearly,
  // far enough back that the 9-10m halls and the 40m tower still tower over them.
  let camYaw = 0, camDist = 10.5, camHeight = 4.6;
  let playerMoving = false;

  // ---------- nearby ----------
  let nearby = null;
  function updateNearby(){
    const px = player.position.x, pz = player.position.z;
    let best = null, bestD = 999;
    for (const it of interactives){
      const d = Math.hypot(px-it.x, pz-it.z);
      if (d < it.radius && d < bestD){ best = it; bestD = d; }
    }
    if (best !== nearby){
      nearby = best;
      callbacks.onNearby && callbacks.onNearby(nearby ? { kind: nearby.kind, data: nearby.data, label: nearby.label } : null);
    }
  }
  function trigger(){
    if (!nearby) return;
    if (nearby.kind === 'gather') callbacks.onGather && callbacks.onGather(nearby.data);
    else if (nearby.kind === 'station') callbacks.onStation && callbacks.onStation(nearby.data);
  }

  // ---------- step each frame ----------
  let walkT = 0, stuckT = 0;
  function input(dt){
    let mx=0, mz=0;
    if (keys.has('f')) mz -= 1;
    if (keys.has('b')) mz += 1;
    if (keys.has('l')) mx -= 1;
    if (keys.has('r')) mx += 1;
    const gp = (navigator.getGamepads && navigator.getGamepads()[0]);
    if (gp){ const ax=gp.axes[0]||0, ay=gp.axes[1]||0; if(Math.abs(ax)>0.15) mx+=ax; if(Math.abs(ay)>0.15) mz+=ay; }
    mx += joy.x; mz += joy.y;
    const ml = Math.hypot(mx, mz);
    if (ml>1){ mx/=ml; mz/=ml; }
    if (tapSet && tapTarget){
      const dx=tapTarget.x-player.position.x, dz=tapTarget.z-player.position.z, d=Math.hypot(dx,dz);
      if (d>1.0){ mx=dx/d; mz=dz/d; } else { tapTarget=null; tapSet=false; }
    }
    const moving = ml>0.02 || tapSet;
    playerMoving = moving;
    if (moving){
      // camera-relative movement: forward = camera's facing, right = camera's right
      const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = Math.sin(camYaw);
      const wx = fx*mz + rx*mx;
      const wz = fz*mz + rz*mx;
      const nx = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, player.position.x + wx*playerSpeed*dt));
      const nz = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, player.position.z + wz*playerSpeed*dt));
      // depenetrate rather than block, so the player slides along a wall instead of sticking
      const hit = resolveCollisions(nx, nz, PLAYER_RADIUS, OBSTACLES);
      player.position.x = hit.x; player.position.z = hit.z;
      // a tap-to-move target inside a building is unreachable — drop it instead of grinding
      if (tapSet && Math.hypot(hit.x-nx, hit.z-nz) > 0.001){
        stuckT += dt;
        if (stuckT > 0.5){ tapTarget = null; tapSet = false; stuckT = 0; }
      } else stuckT = 0;
      const t = Math.atan2(wx, wz);
      let diff = t - player.rotation.y;
      while (diff>Math.PI) diff-=Math.PI*2; while (diff<-Math.PI) diff+=Math.PI*2;
      player.rotation.y += diff*Math.min(1, dt*10);
      walkT += dt;
      if (!chars.player) animateWizard(player, walkT, Math.min(1, ml));
    } else {
      if (chars.player){
        // handled by GLB mixer
      } else {
        player.userData.armL.rotation.x = Math.sin(walkT*0.5)*0.05;
        player.userData.armR.rotation.x = -Math.sin(walkT*0.5)*0.05;
        player.position.y = 0;
      }
    }
  }

  // ---------- NPC update ----------
  function npcUpdate(dt, now){
    for (const n of npcs){
      const c = n.key ? chars[n.key] : null;   // GLB char entry for this NPC (if loaded)
      if (n.role === 'wander'){
        if (n.pause > 0){ n.pause -= dt; if (c) c.walking = false; else animateWizard(n.mesh, now*0.001, 0); continue; }
        const dx=n.tx-n.mesh.position.x, dz=n.tz-n.mesh.position.z, d=Math.hypot(dx,dz);
        if (d>0.8){
          const wnx = n.mesh.position.x + (dx/d)*4.0*dt, wnz = n.mesh.position.z + (dz/d)*4.0*dt;
          const wh = resolveCollisions(wnx, wnz, PLAYER_RADIUS, OBSTACLES);
          n.mesh.position.x = wh.x; n.mesh.position.z = wh.z;
          n.mesh.rotation.y = Math.atan2(dx,dz);
          // walked into a wall: pick a fresh destination rather than grinding against it
          if (Math.hypot(wh.x-wnx, wh.z-wnz) > 0.001){
            n.stuck = (n.stuck||0) + dt;
            if (n.stuck > 0.8){ n.stuck = 0; n.t = 0; n.pause = 0.4; const a2=Math.random()*Math.PI*2, r2=26+Math.random()*22; n.tx=Math.cos(a2)*r2; n.tz=Math.sin(a2)*r2; }
          } else n.stuck = 0;
          if (c){ c.walking = true; c.walkSpeed = Math.min(1, 0.4 + d*0.2); }
          else animateWizard(n.mesh, now*0.001, 1);
        } else {
          n.t += dt;
          if (n.t>2){
            n.t=0; n.pause=0.8+Math.random()*1.6;
            // try a few spots and keep the first that isn't inside something solid
            for (let k=0;k<6;k++){
              const a=Math.random()*Math.PI*2, r=26+Math.random()*22;
              const cx=Math.cos(a)*r, cz=Math.sin(a)*r;
              const c2=resolveCollisions(cx, cz, PLAYER_RADIUS, OBSTACLES);
              if (Math.hypot(c2.x-cx, c2.z-cz) < 0.001 || k===5){ n.tx=c2.x; n.tz=c2.z; break; }
            }
          }
          if (c) c.walking = false;
        }
      } else {
        // stationary NPCs: GLB models animate via mixer; procedural ones sway
        if (!chars[n.role]) animateWizard(n.mesh, now*0.001, 0);
      }
    }
  }
  // procedural walk cycle for the NPC skeleton bones (no extra credits, no walk clip needed)
  const _identQ = new THREE.Quaternion();     // hoisted: allocated per bone per frame before
  function setBone(c, name, rx, ry, rz){
    const b = c.bones[name]; if (!b) return;
    b.quaternion.copy(c.baseRot[name] || _identQ);
    b.rotateX(rx); b.rotateY(ry); b.rotateZ(rz);
  }
  function applyWalkCycle(c){
    const t = c.walkT, s = c.walkSpeed;
    const sw = Math.sin(t*9)*0.7*s;      // leg swing (forward/back)
    const sw2 = Math.sin(t*9+Math.PI)*0.5*s; // arms swing opposite
    setBone(c,'LeftLeg', sw, 0, 0);
    setBone(c,'RightLeg', -sw, 0, 0);
    setBone(c,'LeftUpLeg', sw*0.35, 0, 0);
    setBone(c,'RightUpLeg', -sw*0.35, 0, 0);
    setBone(c,'LeftArm', sw2, 0, 0);
    setBone(c,'RightArm', -sw2, 0, 0);
    setBone(c,'LeftForeArm', sw2*0.3, 0, 0);
    setBone(c,'RightForeArm', -sw2*0.3, 0, 0);
    setBone(c,'Spine', Math.sin(t*9)*0.05*s, 0, 0);
  }
  // advance GLB character mixers (player walk/idle, NPC idle/walk)
  function updateChars(dt){
    for (const key in chars){
      const c = chars[key];
      if (!c.model) continue;
      if (c.walking){
        // procedural walk cycle (NPCs moving around the world)
        if (c.mixer && c.idle && c.idle.isRunning()) c.mixer.stopAllAction();
        applyWalkCycle(c);
        c.walkT += dt;
      } else {
        if (c.mixer){
          if (key === 'player'){
            if (playerMoving){ if (c.walk && !c.walk.isRunning()){ c.idle && c.idle.stop(); c.walk.play(); } }
            else { if (c.idle && !c.idle.isRunning()){ c.walk && c.walk.stop(); c.idle.play(); } }
          } else if (c.idle && !c.idle.isRunning()){
            c.walk && c.walk.stop(); c.idle.play();
          }
          c.mixer.update(dt);
        }
      }
    }
  }

  // ---------- camera ----------
  const _camTarget = new THREE.Vector3();     // hoisted: this runs every frame
  function updateCamera(){
    const ox = Math.sin(camYaw)*camDist, oz = Math.cos(camYaw)*camDist;
    _camTarget.set(player.position.x+ox, camHeight, player.position.z+oz);
    camera.position.lerp(_camTarget, 0.12);
    camera.lookAt(player.position.x, 2.2, player.position.z);
  }

  // ---------- loop ----------
  let last = performance.now(), raf = 0;
  function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    input(dt);
    npcUpdate(dt, now);
    updateChars(dt);
    updateNearby();
    updateCamera();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function onResize(){
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // debug: largest meshes by bounding volume + camera/player info
  window.__worldDebug = () => {
    const cam = camera.position;
    const out = [];
    scene.traverse(o => { if (o.isMesh){ const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3()); const c = b.getCenter(new THREE.Vector3()); const d = Math.round(c.distanceTo(cam)); out.push({ t: o.geometry.type, s: [Math.round(s.x),Math.round(s.y),Math.round(s.z)], p: [Math.round(o.position.x),Math.round(o.position.y),Math.round(o.position.z)], d }); } });
    out.sort((a,b)=> a.d - b.d);
    return { cam: [Math.round(cam.x),Math.round(cam.y),Math.round(cam.z)], player: [Math.round(player.position.x),Math.round(player.position.y),Math.round(player.position.z)],
      // exact, unrounded — the rounded `player` above is for eyeballing, and rounding a position
      // by up to half a unit is enough to make a collision check report a false overlap
      playerExact: [player.position.x, player.position.y, player.position.z],
      near: out.slice(0,8),
      chars: Object.fromEntries(Object.entries(chars).map(([k,c])=>[k,{loaded:!!c.model, scale: c.model?+c.model.scale.x.toFixed(3):null, rawSize: c.rawSize?+c.rawSize.toFixed(3):null, meshWorldScale: c.meshWorldScale?+c.meshWorldScale.toFixed(4):null, computed: c.computedScale?+c.computedScale.toFixed(2):null, mixer: !!c.mixer, walk: !!c.walk, idle: !!c.idle}])),
      playerSize: (()=>{ if(!chars.player || !chars.player.model) return null; const m=chars.player.model; m.updateMatrixWorld(true); const b=new THREE.Box3().setFromObject(m); const s=b.getSize(new THREE.Vector3()); return {x:Math.round(s.x),y:Math.round(s.y),z:Math.round(s.z)}; })() };
  };
  return {
    setTouchMove(x, y){ joy.x = x; joy.y = y; },
    setPlayerColor(color){
      // Remembered, because this is usually called before the GLB finishes loading — and once
      // it loads, userData.robe is no longer in the scene, so writing only there was a no-op.
      schoolColor = color;
      applyPlayerColor();
    },
    rotateCam(dx){ camYaw += dx * 0.006; },
    zoomCam(dy){ camDist = Math.max(6, Math.min(40, camDist + dy * 0.05)); },
    tapAt(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      const nx = ((clientX-rect.left)/rect.width)*2-1;
      const ny = -((clientY-rect.top)/rect.height)*2+1;
      const ndc = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      const dist = -camera.position.y / dir.y;
      const hit = camera.position.clone().add(dir.multiplyScalar(dist));
      tapTarget = { x: hit.x, z: hit.z }; tapSet = true;
    },
    trigger,
    // Move the player directly. Resolves collisions so a teleport can never land inside
    // geometry, and cancels any tap-to-move target that is now stale.
    teleport(x, z){
      const p = resolveCollisions(
        Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, x)),
        Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, z)),
        PLAYER_RADIUS, OBSTACLES);
      player.position.x = p.x; player.position.z = p.z;
      tapTarget = null; tapSet = false;
      return { x:p.x, z:p.z };
    },
    resize(){ onResize(); },
    dispose(){ window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); cancelAnimationFrame(raf); renderer.dispose(); },
  };
}