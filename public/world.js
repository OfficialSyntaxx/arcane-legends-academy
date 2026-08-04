// Arcane Legends — full 3D academy world (Three.js). A walkable, living campus like Wizard101/OSRS.
// Rich procedural low-poly characters (animated wizards), themed buildings, a fountain, trees,
// gathering nodes for every material, and NPCs that hand out quests and open the market.
// Mobile-first: touch joystick + tap-to-move + auto-follow camera. The DOM UI drives the 2D panels.
export function createWorld(canvas, callbacks){
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x1a1440);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1a4a, 50, 130);

  const camera = new THREE.PerspectiveCamera(58, canvas.clientWidth/canvas.clientHeight, 0.1, 250);
  camera.position.set(0, 12, 18);

  // ---- sky: solid clear color (reliable) ----
  renderer.setClearColor(0x1a1440);

  // lights
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1f4d, 0.75));
  const sun = new THREE.DirectionalLight(0xffd9a0, 0.9);
  sun.position.set(20, 40, 14);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.25);
  moon.position.set(-20, 30, -20); scene.add(moon);
  // warm courtyard glow
  const glow = new THREE.PointLight(0xff8844, 0.8, 45);
  glow.position.set(0, 6, 0); scene.add(glow);

  const mat = c => new THREE.MeshLambertMaterial({ color: c });
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
  const ground = add(new THREE.PlaneGeometry(160, 160), mat(0x2f7d4f), 0, 0, 0, {receive:true});
  ground.rotation.x = -Math.PI/2;
  // courtyard platform — removed (large flat disc reads as an edge-on artifact at this camera angle)
  // paths radiating from center
  for (let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2 + Math.PI/4;
    const p = add(new THREE.PlaneGeometry(2.4, 26), mat(0xc9b877), Math.cos(a)*8, 0.06, Math.sin(a)*8, {receive:true, cast:false});
    p.rotation.x = -Math.PI/2; p.rotation.z = a;
  }

  // ---------- building generator ----------
  const HOLLOW = 0x6a5b9e, VIO = 0x3a2d6e, GOLD = 0xffc94d, WOOD = 0x8a5a2b, ROOFB = 0x2f4f8a;
  function stucco(x,z,w,d,h,ry=0,wall=HOLLOW,roof=ROOFB){
    const base = add(new THREE.BoxGeometry(w,h,d), mat(wall), x, h/2, z, {ry});
    const p4 = add(new THREE.ConeGeometry(Math.max(w,d)*0.78, h*0.6, 4), mat(roof), x, h + h*0.3, z, {ry});
    const door = add(new THREE.BoxGeometry(w*0.28, h*0.5, 0.25), mat(WOOD), x, h*0.25, z + d/2 + 0.05, {ry});
    // windows
    for (const sx of [-0.3, 0.3]){
      const wx = x + (Math.cos(ry)*w*0.32*sx), wz = z + (Math.sin(ry)*w*0.32*sx);
      add(new THREE.BoxGeometry(0.5, 0.5, 0.15), mat(0xffe9b0), wx, h*0.55, z + d*0.5*sx + (Math.sin(ry)*0.5), {cast:false});
    }
    return base;
  }
  // Scribing Hall (left)
  stucco(-16, -7, 7, 5, 5.5, 0.3, 0x6a5b9e, 0x2a1f4d);
  // Library (left-front)
  stucco(-16, 6, 6, 5, 4.5, -0.3, 0x5a4a8a, 0x2a1f4d);
  // Smithy (right)
  stucco(16, -7, 7, 5, 4.5, -0.3, 0x7a5a6a, 0x8a3a2a);
  // Merchant stall (right-front)
  stucco(16, 6, 6, 4, 3.5, 0.3, 0x8a6a3a, 0x2f6f4f);
  // Duel Arena (center-back) — round
  const arena = add(new THREE.CylinderGeometry(6, 6.5, 2.5, 24), mat(0x4a3a7a), 0, 1.25, -16);
  add(new THREE.ConeGeometry(6.8, 2.2, 24), mat(0x2a1f4d), 0, 3.6, -16);
  add(new THREE.TorusGeometry(4.5, 0.3, 8, 24), mat(GOLD), 0, 3.9, -16);
  // Student dorms (center-front) — home
  stucco(0, 16, 7, 5, 4.5, 0, 0x6a5b9e, 0x2f4f8a);
  // banners on buildings — removed (flat planes read as artifacts at this camera angle)
  // street lamps along paths
  function lamp(x,z){
    add(new THREE.CylinderGeometry(0.06,0.09,2.6,6), mat(0x3a3a46), x, 1.3, z);
    const l = add(new THREE.SphereGeometry(0.2,8,8), mat(0xffd98a), x, 2.6, z);
    l.material.emissive = new THREE.Color(0xffaa44); l.material.emissiveIntensity = 1.5;
  }
  lamp(6,6); lamp(-6,6); lamp(6,-6); lamp(-6,-6); lamp(0,12); lamp(0,-12);
  // central tower
  add(new THREE.CylinderGeometry(2.4, 3.2, 13, 8), mat(0x5a4a8a), 0, 6.5, 0);
  add(new THREE.ConeGeometry(3.6, 4.5, 8), mat(0x2a1f4d), 0, 15.3, 0);
  add(new THREE.SphereGeometry(0.8, 12, 12), mat(GOLD), 0, 17.9, 0);
  // floating crystal spires (blue diamond tips caused visual glitch in some GPUs) — moved far outside view
  for (let i=0;i<8;i++){
    const a = (i/8)*Math.PI*2 + 0.3, r = 70 + (i%2)*6;
    add(new THREE.CylinderGeometry(0.35, 0.8, 6, 6), mat(0x9fb8ff), Math.cos(a)*r, 3, Math.sin(a)*r);
    const tip = add(new THREE.IcosahedronGeometry(0.8, 0), mat(0x7be0ff), Math.cos(a)*r, 6.8, Math.sin(a)*r);
    tip.material.emissive = new THREE.Color(0x7be0ff); tip.material.emissiveIntensity = 0.7;
  }

  // ---------- trees ----------
  function tree(x,z,s=1){
    add(new THREE.CylinderGeometry(0.25*s, 0.4*s, 1.6*s, 6), mat(0x6a4a2b), x, 0.8*s, z);
    add(new THREE.ConeGeometry(1.1*s, 1.6*s, 7), mat(0x2f9e63), x, 2.4*s, z);
    add(new THREE.ConeGeometry(0.8*s, 1.2*s, 7), mat(0x3ab878), x, 3.4*s, z);
  }
  for (let i=0;i<14;i++){
    const a = (i/14)*Math.PI*2, r = 33 + (i%3)*2;
    tree(Math.cos(a)*r, Math.sin(a)*r, 0.8 + (i%4)*0.3);
  }

  // ---------- fountain (moved off the central tower) ----------
  add(new THREE.CylinderGeometry(2.6, 3.0, 0.6, 20), mat(0x9aa0b8), 0, 0.3, -9);
  add(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8), mat(0x9aa0b8), 0, 1.4, -9);
  add(new THREE.SphereGeometry(0.5, 10, 10), mat(0x7be0ff), 0, 2.4, -9);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 20), mat(0x3a86c8), 0, 0.62, -9, {receive:true});

  // ---------- torches at nodes ----------
  function torch(x,z){
    add(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), mat(0x5a3a1a), x, 0.7, z);
    const flame = add(new THREE.SphereGeometry(0.16, 8, 8), mat(0xffb347), x, 1.5, z);
    flame.material.emissive = new THREE.Color(0xff8833); flame.material.emissiveIntensity = 1.2;
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
  const player = makeWizard(0x3a6bd8, 0x2a1f4d);
  player.position.set(0, 0, 12);
  scene.add(player);
  const playerSpeed = 8;

  // ---------- gathering nodes (all materials) ----------
  const interactives = [];
  function register(kind, x, z, data, label, mesh, radius=2.6){
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
  crystalNode(-6, -4, 0xcd7f32, 'copper', 'Mine Copper');
  crystalNode(-4, -8, 0xb0b0b0, 'iron', 'Mine Iron');
  crystalNode(6, -4, 0xffd766, 'gold', 'Mine Gold');
  crystalNode(-8, 1, 0xc9c9e0, 'silver', 'Mine Silver');
  crystalNode(8, 1, 0x4a90d9, 'mithril', 'Mine Mithril');
  crystalNode(-3, -9, 0xffb3c9, 'runite', 'Mine Runite');
  torch(6, -4);
  function woodNode(x,z,data,label){
    add(new THREE.CylinderGeometry(0.9, 1.1, 1.3, 8), mat(0x8a5a2b), x, 0.65, z);
    add(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 6), mat(0x6a4a2b), x+0.7, 0.6, z-0.5);
    add(new THREE.ConeGeometry(1.0, 1.4, 7), mat(0x2f9e63), x+0.7, 2.2, z-0.5);
    torch(x, z);
    register('gather', x, z, data, label, null);
  }
  woodNode(9, -5, 'oak_log', 'Chop Oak');
  woodNode(11, -8, 'willow_log', 'Chop Willow');
  function pond(x,z,data,label){
    add(new THREE.CylinderGeometry(2.8, 2.8, 0.12, 24), mat(0x3a86c8), x, 0.06, z, {receive:true});
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 8), mat(0x9fd8ff), x-0.6, 0.14, z+0.4);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 8), mat(0x9fd8ff), x+0.5, 0.14, z-0.5);
    register('gather', x, z, data, label, null);
  }
  pond(12, 18, 'raw_shrimp', 'Fish Shrimp');
  pond(17, 12, 'raw_salmon', 'Fish Salmon');
  pond(20, 8, 'raw_lobster', 'Fish Lobster');

  // ---------- stations ----------
  register('station', -16, -7, 'scribe', 'Scribing Hall', null);
  register('station', 16, -7, 'smith', 'Smithy & Forge', null);
  register('station', 16, 6, 'market', 'Merchant Stall', null);
  register('station', 0, -16, 'duel', 'Duel Arena', null);
  register('station', 0, 16, 'home', 'Student Dorms', null);

  // ---------- NPCs (living academy) ----------
  const npcs = [];
  function makeNpc(x, z, main, hat, opts={}){
    const g = makeWizard(main, hat, opts.skin||0xf0c8a0, opts);
    g.position.set(x, 0, z);
    scene.add(g);
    npcs.push({ mesh:g, tx:x, tz:z, t:0, pause:0, role:opts.role||'wander' });
    return g;
  }
  // a professor (quest giver) near the library
  const prof = makeNpc(-14, 6, 0x9aa0b8, 0x2a1f4d, { role:'quest', orb:0xffc94d });
  register('station', -14, 6, 'quests', 'Professor — Quests', prof, 3.2);
  // a merchant near the stall
  const merch = makeNpc(14, 6, 0x8a6a3a, 0x8a3a2a, { role:'market', orb:0xffd766 });
  register('station', 14, 6, 'market', 'Merchant', merch, 3.2);
  // a duel referee near the arena
  const ref = makeNpc(0, -14, 0x4a3a7a, 0x2a1f4d, { role:'duel', orb:0xff6b6b });
  register('station', 0, -14, 'duel', 'Referee — Duel', ref, 3.2);
  // a duel trainer (practice sparring)
  const trainer = makeNpc(12, 8, 0x3a6bd8, 0x8a3a2a, { role:'trainer', orb:0xffd766 });
  register('station', 12, 8, 'trainer', 'Trainer — Practice', trainer, 3.2);
  // a librarian near the library
  const librarian = makeNpc(-16, 10, 0x6a5b9e, 0x2a1f4d, { role:'librarian', orb:0x7be0ff });
  register('station', -16, 10, 'librarian', 'Librarian — Lore', librarian, 3.2);
  // wandering students
  const wanderColors = [[0x3ddc84,0xff6b6b],[0xa06bff,0x2a1f4d],[0xff9ecb,0x8a3a2a],[0xffc94d,0x2a1f4d]];
  for (let i=0;i<4;i++){
    const a = (i/4)*Math.PI*2 + 0.5;
    const g = makeNpc(Math.cos(a)*18, Math.sin(a)*18, wanderColors[i][0], wanderColors[i][1], { role:'wander' });
  }

  // ---------- load GLB character models (replace procedural wizards) ----------
  const chars = {}; // entityKey -> {model, mixer, walk, idle}
  function makeCharModel(key, url, group, onReady){
    const loader = new THREE.GLTFLoader();
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
      const entry = { model, mixer: null, walk: null, idle: null, rawSize: height, meshWorldScale: 1, computedScale: scale };
      if (group){ while (group.children.length) group.remove(group.children[0]); group.add(model); }
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
      if (onReady) onReady(entry);
    });
  }
  // Generated GLB character models — keys match NPC roles so the update loop uses the GLB mixer.
  makeCharModel('player', './assets/models/player_wizard.glb', player);
  makeCharModel('quest', './assets/models/professor.glb', prof);
  makeCharModel('market', './assets/models/merchant.glb', merch);

  // ---------- input ----------
  const keys = new Set();
  const BIND = { KeyW:'f', KeyS:'b', KeyA:'l', KeyD:'r', ArrowUp:'f', ArrowDown:'b', ArrowLeft:'l', ArrowRight:'r' };
  const kd = e => { const c=BIND[e.code]; if(c){ keys.add(c); e.preventDefault(); } };
  const ku = e => { const c=BIND[e.code]; if(c) keys.delete(c); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  let joy = { x:0, y:0 };
  let tapTarget = null, tapSet = false;
  // camera orbit (drag to rotate, pinch to zoom) — mobile open-world feel
  let camYaw = 0, camDist = 15, camHeight = 9;
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
  let walkT = 0;
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
      if (d>0.6){ mx=dx/d; mz=dz/d; } else { tapTarget=null; tapSet=false; }
    }
    const moving = ml>0.02 || tapSet;
    playerMoving = moving;
    if (moving){
      // camera-relative movement: forward = camera's facing, right = camera's right
      const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = Math.sin(camYaw);
      const wx = fx*mz + rx*mx;
      const wz = fz*mz + rz*mx;
      player.position.x += wx*playerSpeed*dt;
      player.position.z += wz*playerSpeed*dt;
      player.position.x = Math.max(-40, Math.min(40, player.position.x));
      player.position.z = Math.max(-40, Math.min(40, player.position.z));
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
      if (n.role === 'wander'){
        if (n.pause > 0){ n.pause -= dt; animateWizard(n.mesh, now*0.001, 0); continue; }
        const dx=n.tx-n.mesh.position.x, dz=n.tz-n.mesh.position.z, d=Math.hypot(dx,dz);
        if (d>0.4){
          n.mesh.position.x += (dx/d)*2.2*dt; n.mesh.position.z += (dz/d)*2.2*dt;
          n.mesh.rotation.y = Math.atan2(dx,dz);
          animateWizard(n.mesh, now*0.001, 1);
        } else {
          n.t += dt;
          if (n.t>2){ n.t=0; n.pause=0.8+Math.random()*1.6; const a=Math.random()*Math.PI*2, r=14+Math.random()*12; n.tx=Math.cos(a)*r; n.tz=Math.sin(a)*r; }
        }
      } else {
        // stationary NPCs: GLB models animate via mixer; procedural ones sway
        if (!chars[n.role]) animateWizard(n.mesh, now*0.001, 0);
      }
    }
  }
  // advance GLB character mixers (player walk/idle, NPC idle)
  function updateChars(dt){
    for (const key in chars){
      const c = chars[key];
      if (!c.mixer) continue;
      if (key === 'player'){
        if (playerMoving){ if (c.walk && !c.walk.isRunning()){ c.idle && c.idle.stop(); c.walk.play(); } }
        else { if (c.idle && !c.idle.isRunning()){ c.walk && c.walk.stop(); c.idle.play(); } }
      }
      c.mixer.update(dt);
    }
  }

  // ---------- camera ----------
  function updateCamera(){
    const ox = Math.sin(camYaw)*camDist, oz = Math.cos(camYaw)*camDist;
    const cam = new THREE.Vector3(player.position.x+ox, camHeight, player.position.z+oz);
    camera.position.lerp(cam, 0.12);
    camera.lookAt(player.position.x, 1.8, player.position.z);
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
    return { cam: [Math.round(cam.x),Math.round(cam.y),Math.round(cam.z)], player: [Math.round(player.position.x),Math.round(player.position.y),Math.round(player.position.z)], near: out.slice(0,8),
      chars: Object.fromEntries(Object.entries(chars).map(([k,c])=>[k,{loaded:!!c.model, scale: c.model?+c.model.scale.x.toFixed(3):null, rawSize: c.rawSize?+c.rawSize.toFixed(3):null, meshWorldScale: c.meshWorldScale?+c.meshWorldScale.toFixed(4):null, computed: c.computedScale?+c.computedScale.toFixed(2):null, mixer: !!c.mixer, walk: !!c.walk, idle: !!c.idle}])),
      playerSize: (()=>{ if(!chars.player || !chars.player.model) return null; const m=chars.player.model; m.updateMatrixWorld(true); const b=new THREE.Box3().setFromObject(m); const s=b.getSize(new THREE.Vector3()); return {x:Math.round(s.x),y:Math.round(s.y),z:Math.round(s.z)}; })() };
  };
  return {
    setTouchMove(x, y){ joy.x = x; joy.y = y; },
    setPlayerColor(color){
      const ud = player.userData;
      if (ud && ud.robe){ ud.robe.material.color.set(color); ud.chest.material.color.set(color); }
    },
    rotateCam(dx){ camYaw += dx * 0.006; },
    zoomCam(dy){ camDist = Math.max(6, Math.min(30, camDist + dy * 0.05)); },
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
    resize(){ onResize(); },
    dispose(){ window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); cancelAnimationFrame(raf); renderer.dispose(); },
  };
}