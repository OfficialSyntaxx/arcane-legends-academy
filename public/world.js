// Arcane Legends — full 3D academy world (Three.js). A walkable, living campus like Wizard101/OSRS.
// Rich procedural low-poly characters (animated wizards), themed buildings, a fountain, trees,
// gathering nodes for every material, and NPCs that hand out quests and open the market.
// Mobile-first: touch joystick + tap-to-move + auto-follow camera. The DOM UI drives the 2D panels.
import { WORLD_NODES, NODE_MODELS } from "./nodes.js";
import { BUILDINGS, LANDMARKS, PROPS, NPCS, WANDERERS, PLAYER_SPAWN, OBSTACLES, TREE_RING, PLAYER_RADIUS, WORLD_BOUND, doorPos, resolveCollisions, cameraDistanceLimit, CAMERA_RADIUS } from "./structures.js";
import { modelUrl, CDN } from "./cdn.js";
import { heightAt, isWater, flatsForZone, BIOMES } from "./terrain.js";
import { scatterZone, bucketByChunk, chunkDelta, exitNear, EXIT_RADIUS } from "./worldconfig.js";

// `zone` is an optional normalised zone config (see worldconfig.js). Omitted, the world falls
// back to the academy tables in structures.js/nodes.js — the migration state described in
// WORLDSPEC §10, so the hub keeps working while zones.json becomes the runtime contract.
export function createWorld(canvas, callbacks, zone, opts = {}){
  const ZONE = zone || {
    id: "academy",
    spawn: PLAYER_SPAWN,
    bounds: { minX:-WORLD_BOUND, maxX:WORLD_BOUND, minZ:-WORLD_BOUND, maxZ:WORLD_BOUND },
    terrain: { seed: 20260804, scale: 55, amplitude: 1.4, baseHeight: 0, biome: "plains" },
    buildings: BUILDINGS, landmarks: LANDMARKS, props: PROPS,
    npcs: NPCS, wanderers: WANDERERS, resourceNodes: WORLD_NODES,
    nodeModels: NODE_MODELS, treeRing: TREE_RING, obstacles: OBSTACLES,
    decor: { paths:true, spires:true, fountain:[0,-18],
             lamps:[[13,13],[-13,13],[13,-13],[-13,-13],[0,24],[0,-24],[26,0],[-26,0]] },
  };
  // Flat zones are derived from the zone's own content, so a landmark that exists is a landmark
  // that gets level ground — no separate list to keep in sync.
  const FLATS = flatsForZone(ZONE);
  const groundY = (x, z) => heightAt(x, z, ZONE.terrain, FLATS);
  const wet = (x, z) => isWater(x, z, ZONE.terrain, FLATS);
  // Clamp to the ACTIVE ZONE's bounds, not a global constant — a zone with different bounds
  // would otherwise trap the player early or let them walk off the edge of its terrain.
  const B = ZONE.bounds;
  const clampX = v => Math.max(B.minX, Math.min(B.maxX, v));
  const clampZ = v => Math.max(B.minZ, Math.min(B.maxZ, v));
  // Collision comes from the zone when it supplies its own set, so a second zone is not silently
  // colliding with the academy's buildings.
  const ZONE_OBSTACLES = (ZONE.obstacles && ZONE.obstacles.length) ? ZONE.obstacles : OBSTACLES;
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

  // ---------- ground: procedural heightmap (WORLDSPEC §5) ----------
  // One displaced plane for the whole zone for now; step 3 (chunk streaming) subdivides this.
  const biome = BIOMES[ZONE.terrain.biome] || BIOMES.plains;
  const groundSpan = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) + 80;
  const groundCX = (B.minX + B.maxX) / 2, groundCZ = (B.minZ + B.maxZ) / 2;
  const GROUND_SEGS = 96;                       // ~1.5m per quad at 150m span — smooth on mobile
  const groundGeo = new THREE.PlaneGeometry(groundSpan, groundSpan, GROUND_SEGS, GROUND_SEGS);
  {
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++){
      // the plane is built in XY then rotated onto XZ, so its local y IS world -z
      const wx = pos.getX(i) + groundCX, wz = -pos.getY(i) + groundCZ;
      pos.setZ(i, groundY(wx, wz));
    }
    pos.needsUpdate = true;
    groundGeo.computeVertexNormals();
  }
  const ground = add(groundGeo, mat(biome.ground), groundCX, 0, groundCZ, {receive:true});
  ground.rotation.x = -Math.PI/2;
  // water, only where the zone declares a level
  if (ZONE.terrain.waterLevel != null){
    const wm = new THREE.MeshLambertMaterial({ color: biome.water, transparent:true, opacity:0.72 });
    wm.color.convertSRGBToLinear();
    const water = add(new THREE.PlaneGeometry(groundSpan, groundSpan), wm, groundCX, ZONE.terrain.waterLevel, groundCZ, {receive:true, cast:false});
    water.rotation.x = -Math.PI/2;
  }
  // courtyard platform — removed (large flat disc reads as an edge-on artifact at this camera angle)
  // Zone decor (paths, lamps, fountain, distant spires) is academy dressing. It used to be
  // unconditional, so every zone inherited the hub's paths and lamps on top of its own content.
  const DECOR = ZONE.decor || {};
  if (DECOR.paths){
    for (let i=0;i<4;i++){
      const a = (i/4)*Math.PI*2 + Math.PI/4;
      const p = add(new THREE.PlaneGeometry(4.6, 52), mat(0xc9b877), Math.cos(a)*16, 0.06, Math.sin(a)*16, {receive:true, cast:false});
      p.rotation.x = -Math.PI/2; p.rotation.z = a;
    }
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
  for (const b of ZONE.buildings){
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
  for (const [lx, lz] of (DECOR.lamps || [])) lamp(lx, lz);
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
  if (DECOR.spires) for (let i=0;i<8;i++){
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
  for (const t of (ZONE.treeRing || [])) tree(t.x, t.z, t.s);

  // ---------- fountain (moved off the central tower) ----------
  if (DECOR.fountain){
    const [fx, fz] = DECOR.fountain;
    add(new THREE.CylinderGeometry(4.8, 5.5, 1.1, 22), mat(0x9aa0b8), fx, 0.55, fz);
    add(new THREE.CylinderGeometry(0.75, 0.95, 3.0, 8), mat(0x9aa0b8), fx, 2.6, fz);
    add(new THREE.SphereGeometry(0.95, 10, 10), mat(0x7be0ff), fx, 4.5, fz);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 20), mat(0x3a86c8), fx, 1.15, fz, {receive:true});
  }

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
    // bob relative to whatever ground this character is standing on (terrain, not y=0)
    const base = g.userData.groundY || 0;
    g.position.y = base + Math.abs(Math.sin(t*9))*0.09*speed;
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
  // `opts.spawnAt` is where a zone TRANSITION drops the player (the reciprocal exit, computed by
  // worldconfig.entryPointFor). Without it every arrival would land on the zone's own spawn, so
  // walking north out of the academy would put you in the middle of the forest rather than at
  // its southern edge, and the two zones would not read as adjacent.
  const START = opts.spawnAt || ZONE.spawn;
  player.position.set(clampX(START.x), groundY(START.x, START.z), clampZ(START.z));
  scene.add(player);
  const playerSpeed = 14;

  // ---------- gathering nodes (all materials) ----------
  const interactives = [];
  function register(kind, x, z, data, label, mesh, radius=4.6){
    interactives.push({ kind, x, z, data, label, mesh, radius });
  }
  function crystalNode(x,z,color,data,label){
    const c = add(new THREE.IcosahedronGeometry(1.0, 0), mat(color), x, 1.3, z);
    c.material.emissive = srgb(color); c.material.emissiveIntensity = 0.35;
    const rock = add(new THREE.CylinderGeometry(0.5, 0.8, 2.6, 6), mat(0x5a5a66), x, 1.3, z);
    const chip = add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 6), mat(color), x+0.5, 0.9, z+0.4);
    torch(x, z);
    register('gather', x, z, data, label, c);
    return [c, rock, chip];
  }
  function woodNode(x,z,data,label,magic){
    // magic trees glow faintly so the level-50 tier reads as special from a distance
    const stump = add(new THREE.CylinderGeometry(0.9, 1.1, 1.3, 8), mat(magic?0x6a4a8a:0x8a5a2b), x, 0.65, z);
    const trunk = add(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 6), mat(magic?0x5a3a7a:0x6a4a2b), x+0.7, 0.6, z-0.5);
    const crown = add(new THREE.ConeGeometry(1.0, 1.4, 7), mat(magic?0x7be0ff:0x2f9e63), x+0.7, 2.2, z-0.5);
    if (magic){ crown.material.emissive = srgb(0x4a9edd); crown.material.emissiveIntensity = 0.45; }
    torch(x, z);
    register('gather', x, z, data, label, null);
    return [stump, trunk, crown];
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
  const nodeGroups = {};
  for (const n of ZONE.resourceNodes){
    if (n.x == null) continue;          // count-based: placed by the chunk streamer instead
    let parts = null;
    if (n.kind === 'crystal') parts = crystalNode(n.x, n.z, n.color, n.id, n.label);
    else if (n.kind === 'wood') parts = woodNode(n.x, n.z, n.id, n.label, n.magic);
    else if (n.kind === 'pond') pond(n.x, n.z, n.id, n.label, n.deep);
    if (parts){
      const g = new THREE.Group(); scene.add(g);
      for (const m of parts) g.add(m);
      nodeGroups[n.id] = g;
    }
  }

  // ---------- stations ----------
  // Placed at each building's door (just outside the wall) rather than at its centre — with
  // collision on, a prompt at the centre would be sealed inside the building.
  for (const b of ZONE.buildings){
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
  for (const n of ZONE.npcs){
    const g = makeNpc(n.x, n.z, n.main, n.hat, { role:n.role, orb:n.orb, key:n.key });
    g.position.y = groundY(n.x, n.z);
    npcByKey[n.key] = g;
    register('station', n.x, n.z, n.station, n.label, g, 5.5);
  }
  // wandering students
  const wanderers = [];
  const ZWANDER = ZONE.wanderers || [];
  for (let i=0;i<ZWANDER.length;i++){
    const a = (i/ZWANDER.length)*Math.PI*2 + 0.5;
    const w = ZWANDER[i];
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
  function makeCharModel(key, localUrl, group, onReady){
    loadState.total++;
    // Characters ship in `public/assets/models/` AND on the CDN. Try the CDN first (it keeps
    // the deploy warm and is usually closer to the player), but a CDN miss must not strip the
    // character out of the world: every failure retried the load exactly zero times before, so
    // one unreachable CloudFront host left EVERY npc and the player as the procedural stand-in
    // — which is exactly the "why does my wizard look low-poly" report. Fall back to the local
    // copy once, then give up.
    const cdnUrl = CDN[localUrl.split('/').pop()];
    load(cdnUrl || localUrl, cdnUrl ? localUrl : null);
    function load(url, fallbackUrl){
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
      if (fallbackUrl){
        console.warn("character model failed from CDN, retrying locally:", url, err && err.message);
        load(fallbackUrl, null);
        return;
      }
      // Keep the procedural wizard rather than leaving a hole in the world, and say so.
      console.warn("character model failed to load:", url, err && err.message);
      loadState.done++; loadState.failed.push(key); loadProgress();
    });
    }
  }
  // Generated GLB character models — keys match NPC roles so the update loop uses the GLB mixer.
  makeCharModel('player', './assets/models/player_wizard.glb', player, ()=>applyPlayerColor());
  for (const n of ZONE.npcs) makeCharModel(n.key, './assets/models/' + n.model, npcByKey[n.key]);
  for (let i=0;i<ZWANDER.length;i++) makeCharModel(ZWANDER[i].key, './assets/models/' + ZWANDER[i].model, wanderers[i]);

  // ---------- static landmark/building models (unlike characters, no fixed 1.8 target height —
  // each is scaled to its own footprint, and stays centered on X/Z with its base at y=0) ----------
  // `fit` is "height" or "width": height for things whose height defines them (the tower),
  // width when the FOOTPRINT is the gameplay-relevant dimension (the arena floor is the duel
  // space, so its diameter must be right and the height follows from the model's proportions).
  function loadLandmarkModel(key, url, group, opts){
    const { size, fit = "height", x = 0, z = 0, ry = 0, onReady, quiet = false } = opts;
    // streamed chunk content loads continuously, so it must not drive the boot progress HUD
    if (!quiet) loadState.total++;
    url = CDN[url.split('/').pop()] || url;   // CDN if hosted there, else the caller's path
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
      // sit on the terrain surface, not on y=0 — flat zones keep landmarks level (terrain.js)
      model.position.set(x - cx, groundY(x, z) - box.min.y * scale, z - cz);
      const placeholder = group.children.slice();
      group.add(model);
      for (const c of placeholder) group.remove(c);
      chars[key] = { model, mixer:null, walk:null, idle:null, rawSize:basis, computedScale:scale };
      if (!quiet){ loadState.done++; loadProgress(); }
      if (onReady) onReady();
    },
    undefined,
    err => {
      // Keep the procedural placeholder rather than an empty patch of ground.
      console.warn("landmark model failed to load:", url, err && err.message);
      if (!quiet){ loadState.done++; loadState.failed.push(key); loadProgress(); }
    });
  }
  // Standalone landmarks (tower, arena) — generated via Tripo (2D->3D). Their collision shapes
  // in structures.js are sized to these models' real footprints, not the old procedural ones.
  const landmarkGroups = { tower: towerGroup, arena: arenaGroup };
  // a zone without these landmarks should not show their procedural placeholders either
  for (const [k, g] of Object.entries(landmarkGroups))
    if (!ZONE.landmarks.some(l => l.key === k)) scene.remove(g);
  for (const L of ZONE.landmarks){
    const g = landmarkGroups[L.key];
    if (g) loadLandmarkModel(L.key, L.url, g, { size:L.size, fit:L.fit, x:L.x, z:L.z, ry:L.ry });
  }
  // CC0 world dressing (KayKit / Quaternius — see ASSETS.md). Each goes in its own Group so a
  // failed load leaves nothing behind rather than a half-placed object.
  const ZPROPS = ZONE.props.filter(p => p.x != null);   // count-based props are streamed
  for (let i = 0; i < ZPROPS.length; i++){
    const pr = ZPROPS[i];
    const g = new THREE.Group(); scene.add(g);
    loadLandmarkModel('prop' + i, pr.url, g, { size:pr.h, fit:"height", x:pr.x, z:pr.z, ry:pr.ry || 0 });
  }
  // Gathering nodes swap their procedural mesh for the CC0 model, keeping the procedural one as
  // the fallback (the node's interaction prompt is registered either way).
  for (const n of ZONE.resourceNodes){
    if (n.x == null) continue;
    const spec = (ZONE.nodeModels && ZONE.nodeModels[n.kind]) || NODE_MODELS[n.kind];
    if (!spec || !nodeGroups[n.id]) continue;
    loadLandmarkModel('node_' + n.id, spec.url, nodeGroups[n.id],
      { size: spec.h, fit:"height", x:n.x, z:n.z, ry:(n.x * 0.7) % 3 });
  }
  // ---------- chunk streaming (WORLDSPEC §4) ----------
  // Scatter once, bucket once, then only ever apply deltas. A chunk therefore contains exactly
  // the same things every time it reloads, which is what §4 requires for a stable world.
  const CHUNKS = (() => {
    if (!ZONE.props.some(p => p.count) && !ZONE.resourceNodes.some(n => n.count) &&
        !(ZONE.enemies || []).some(e => e.count)) return null;   // hand-placed zone (the academy)
    const scattered = scatterZone(ZONE);
    return { buckets: bucketByChunk(ZONE, scattered), loaded: new Map(), available: null };
  })();
  if (CHUNKS) CHUNKS.available = new Set(CHUNKS.buckets.keys());

  function loadChunk(key){
    const bucket = CHUNKS.buckets.get(key);
    if (!bucket) return;
    const group = new THREE.Group();
    scene.add(group);
    CHUNKS.loaded.set(key, group);
    for (const p of bucket.props){
      const g = new THREE.Group(); group.add(g);
      loadLandmarkModel("chunk:" + key + ":" + p.url, p.url, g,
        { size:p.h || 2, fit:"height", x:p.x, z:p.z, ry:p.ry || 0, quiet:true });
    }
    for (const n of bucket.resourceNodes){
      const spec = ZONE.nodeModels[n.kind];
      const g = new THREE.Group(); group.add(g);
      if (spec) loadLandmarkModel("chunk:" + key + ":" + n.id, spec.url, g,
        { size:spec.h, fit:"height", x:n.x, z:n.z, ry:(n.x * 0.7) % 3, quiet:true });
      register("gather", n.x, n.z, n.id, n.label, null, 4.6);
    }
    for (const e of bucket.enemies){
      const g = new THREE.Group(); group.add(g);
      loadLandmarkModel("chunk:" + key + ":enemy", "./assets/models/" + e.model, g,
        { size:e.h || 1.9, fit:"height", x:e.x, z:e.z, ry:(e.x) % 3, quiet:true });
    }
  }
  function unloadChunk(key){
    const group = CHUNKS.loaded.get(key);
    if (!group) return;
    // free GPU memory rather than just detaching — a long session would otherwise leak every
    // chunk the player has ever walked through
    group.traverse(o => {
      if (o.isMesh){
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && m.dispose) m.dispose();
      }
    });
    scene.remove(group);
    CHUNKS.loaded.delete(key);
  }
  let lastChunkX = null, lastChunkZ = null;
  function updateChunks(force){
    if (!CHUNKS) return;
    const size = ZONE.chunkSize;
    const cx = Math.floor(player.position.x / size), cz = Math.floor(player.position.z / size);
    // only recompute when the player crosses a chunk boundary — §4 "no full reload, just delta"
    if (!force && cx === lastChunkX && cz === lastChunkZ) return;
    lastChunkX = cx; lastChunkZ = cz;
    const keys = new Set(CHUNKS.loaded.keys());
    const { load, unload } = chunkDelta(ZONE, player.position.x, player.position.z, keys, CHUNKS.available);
    for (const k of unload) unloadChunk(k);
    for (const k of load) loadChunk(k);
  }
  updateChunks(true);

  // Buildings that have a generated model replace their procedural box in place.
  for (const b of ZONE.buildings){
    if (!b.model) continue;
    loadLandmarkModel('bld_' + b.id, b.model, buildingGroups[b.id],
      { size:b.h, fit:"height", x:b.x, z:b.z, ry:b.ry + (b.modelRy || 0) });
  }

  // ---------- zone exits (WORLDSPEC step 4) ----------
  // A gateway arch marks each exit so the boundary is visible rather than an invisible trigger
  // the player falls through. The pad is emissive so it reads at distance in the forest's gloom.
  for (const e of ZONE.exits || []){
    const gy = groundY(e.x, e.z);
    const name = (opts.zoneNames && opts.zoneNames[e.toZone]) || e.toZone;
    const stone = mat(0x6b5f8a);
    const pad = add(new THREE.CylinderGeometry(EXIT_RADIUS, EXIT_RADIUS, 0.25, 24), mat(0x8f7ad6), e.x, gy + 0.12, e.z, {cast:false});
    pad.material.emissive = srgb(0x6a4fd0); pad.material.emissiveIntensity = 0.5;
    // face the arch across the shortest way out of the zone, so you walk THROUGH it, not past it
    const towardEdge = Math.abs(e.x - groundCX) > Math.abs(e.z - groundCZ) ? Math.PI/2 : 0;
    const half = 2.6;
    add(new THREE.CylinderGeometry(0.34, 0.42, 5.2, 8), stone, e.x + Math.cos(towardEdge)*half, gy + 2.6, e.z + Math.sin(towardEdge)*half);
    add(new THREE.CylinderGeometry(0.34, 0.42, 5.2, 8), stone, e.x - Math.cos(towardEdge)*half, gy + 2.6, e.z - Math.sin(towardEdge)*half);
    const lintel = add(new THREE.BoxGeometry(half*2 + 0.9, 0.7, 0.8), stone, e.x, gy + 5.4, e.z);
    lintel.rotation.y = -towardEdge;
    // Registered as an interactable purely so the HUD names the destination on approach. The
    // transition itself is automatic (below) — the prompt is a signpost, not a required press.
    register('exit', e.x, e.z, e.toZone, "To " + name, pad, EXIT_RADIUS + 1.5);
  }
  // Fire at most once per approach. `exitArmed` goes false the moment a transition is requested
  // and only re-arms once the player has walked clear of every exit — the second half of the
  // anti-ping-pong guard (the first is the inward offset in worldconfig.entryPointFor). Arriving
  // in a zone starts DISARMED, because the arrival point is deliberately near the return exit.
  let exitArmed = !opts.spawnAt;
  function updateExits(){
    const hit = exitNear(ZONE, player.position.x, player.position.z);
    if (!hit){ exitArmed = true; return; }
    if (!exitArmed) return;
    exitArmed = false;
    callbacks.onZoneExit && callbacks.onZoneExit({ toZone: hit.toZone, fromZone: ZONE.id });
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
      const nx = clampX(player.position.x + wx*playerSpeed*dt);
      const nz = clampZ(player.position.z + wz*playerSpeed*dt);
      // depenetrate rather than block, so the player slides along a wall instead of sticking
      let hit = resolveCollisions(nx, nz, PLAYER_RADIUS, ZONE_OBSTACLES);
      // WATER IS SOLID (WORLDSPEC §9b k). It was rendered but walk-through, so the forest lake
      // was decoration you strolled across. Slide along the shore instead of stopping dead:
      // retry each axis alone, which is what makes a diagonal into the bank still move you.
      if (wet(hit.x, hit.z)){
        const axisX = resolveCollisions(nx, player.position.z, PLAYER_RADIUS, ZONE_OBSTACLES);
        const axisZ = resolveCollisions(player.position.x, nz, PLAYER_RADIUS, ZONE_OBSTACLES);
        if (!wet(axisX.x, axisX.z)) hit = axisX;
        else if (!wet(axisZ.x, axisZ.z)) hit = axisZ;
        else hit = { x: player.position.x, z: player.position.z };
      }
      player.position.x = hit.x; player.position.z = hit.z;
      player.position.y = groundY(hit.x, hit.z);      // walk the heightmap (WORLDSPEC §5)
      updateChunks(false);
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
      player.userData.groundY = groundY(player.position.x, player.position.z);
      if (!chars.player) animateWizard(player, walkT, Math.min(1, ml));
    } else {
      if (chars.player){
        // handled by GLB mixer
      } else {
        player.userData.armL.rotation.x = Math.sin(walkT*0.5)*0.05;
        player.userData.armR.rotation.x = -Math.sin(walkT*0.5)*0.05;
        player.position.y = groundY(player.position.x, player.position.z);
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
          const wh = resolveCollisions(wnx, wnz, PLAYER_RADIUS, ZONE_OBSTACLES);
          n.mesh.position.x = wh.x; n.mesh.position.z = wh.z;
          n.mesh.position.y = groundY(wh.x, wh.z);
          n.mesh.rotation.y = Math.atan2(dx,dz);
          // walked into a wall: pick a fresh destination rather than grinding against it
          if (Math.hypot(wh.x-wnx, wh.z-wnz) > 0.001){
            n.stuck = (n.stuck||0) + dt;
            if (n.stuck > 0.8){ n.stuck = 0; n.t = 0; n.pause = 0.4; const a2=Math.random()*Math.PI*2, r2=26+Math.random()*22; n.tx=Math.cos(a2)*r2; n.tz=Math.sin(a2)*r2; }
          } else n.stuck = 0;
          if (c){ c.walking = true; c.walkSpeed = Math.min(1, 0.4 + d*0.2); }
          else { n.mesh.userData.groundY = groundY(n.mesh.position.x, n.mesh.position.z); animateWizard(n.mesh, now*0.001, 1); }
        } else {
          n.t += dt;
          if (n.t>2){
            n.t=0; n.pause=0.8+Math.random()*1.6;
            // try a few spots and keep the first that isn't inside something solid
            for (let k=0;k<6;k++){
              const a=Math.random()*Math.PI*2, r=26+Math.random()*22;
              const cx=Math.cos(a)*r, cz=Math.sin(a)*r;
              const c2=resolveCollisions(cx, cz, PLAYER_RADIUS, ZONE_OBSTACLES);
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
    const px = player.position.x, pz = player.position.z, py = player.position.y;
    // CAMERA COLLISION. Without this the camera sits inside whatever is behind the player —
    // the arena canopy's black interior, a hall's backfaces — which is trivial to hit now that
    // buildings are 8-40m. Pull in to the first blocker along the ray.
    const want = cameraDistanceLimit(px, pz, camYaw, camDist, ZONE_OBSTACLES, CAMERA_RADIUS);
    const ox = Math.sin(camYaw)*want, oz = Math.cos(camYaw)*want;
    const cx = px + ox, cz = pz + oz;
    // Height is relative to the player's own ground, not absolute — on a slope an absolute Y
    // lets the player climb above the camera. Also stay clear of the terrain under the camera,
    // so it does not sink into a hillside behind them.
    // The more the camera is forced in, the higher it rises — so a blocked shot becomes a
    // look-down over the obstruction instead of a face full of wall.
    const pulled = Math.max(0, camDist - want) / Math.max(1, camDist);
    const y = Math.max(py + camHeight + pulled * camDist * 0.75, groundY(cx, cz) + 1.8);
    _camTarget.set(cx, y, cz);
    // Pull IN instantly, ease back OUT. Easing both ways means the camera spends a moment
    // travelling through whatever it is avoiding, which is exactly the artefact this fixes.
    const curDist = Math.hypot(camera.position.x - px, camera.position.z - pz);
    camera.position.lerp(_camTarget, want < curDist - 0.05 ? 1 : 0.12);
    // POST-STEP CORRECTION. The clamp above is computed for the *target* along the new yaw, but
    // easing back out leaves the camera somewhere between its old and new positions — and while
    // orbiting a building, both endpoints can be clear while the arc between them cuts straight
    // through the corner. That is the intermittent "camera inside geometry" this used to fail
    // on. Re-clamp where the camera ACTUALLY landed, along its own bearing from the player.
    const ax = camera.position.x - px, az = camera.position.z - pz;
    const aDist = Math.hypot(ax, az);
    if (aDist > 1e-4){
      const aYaw = Math.atan2(ax, az);
      const safe = cameraDistanceLimit(px, pz, aYaw, aDist, ZONE_OBSTACLES, CAMERA_RADIUS);
      if (safe < aDist){
        camera.position.x = px + Math.sin(aYaw) * safe;
        camera.position.z = pz + Math.cos(aYaw) * safe;
        camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 1.8);
      }
    }
    camera.lookAt(px, py + 2.2, pz);
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
    updateExits();
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
      camExact: [cam.x, cam.y, cam.z],
      camDist, camYaw,          // the requested zoom level, before collision clamps it
      near: out.slice(0,8),
      chars: Object.fromEntries(Object.entries(chars).map(([k,c])=>[k,{loaded:!!c.model, scale: c.model?+c.model.scale.x.toFixed(3):null, rawSize: c.rawSize?+c.rawSize.toFixed(3):null, meshWorldScale: c.meshWorldScale?+c.meshWorldScale.toFixed(4):null, computed: c.computedScale?+c.computedScale.toFixed(2):null, mixer: !!c.mixer, walk: !!c.walk, idle: !!c.idle}])),
      chunks: CHUNKS ? { loaded: CHUNKS.loaded.size, total: CHUNKS.buckets.size } : null,
      zone: ZONE.id, exits: (ZONE.exits||[]).map(e=>({to:e.toZone,x:e.x,z:e.z})), exitArmed,
      inWater: wet(player.position.x, player.position.z),
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
        clampX(x), clampZ(z),
        PLAYER_RADIUS, ZONE_OBSTACLES);
      // A teleport into water would drop the player somewhere they cannot walk out of, now that
      // water is solid — keep them where they are rather than stranding them mid-lake.
      if (wet(p.x, p.z)) return { x:player.position.x, y:player.position.y, z:player.position.z };
      player.position.x = p.x; player.position.z = p.z;
      player.position.y = groundY(p.x, p.z);   // land on the surface, not at y=0
      tapTarget = null; tapSet = false;
      return { x:p.x, y:player.position.y, z:p.z };
    },
    resize(){ onResize(); },
    dispose(){ window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); cancelAnimationFrame(raf); renderer.dispose(); },
  };
}