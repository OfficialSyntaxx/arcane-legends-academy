// Arcane Legends — full 3D academy world (Three.js). A walkable, living campus like Wizard101/OSRS.
// Rich procedural low-poly characters (animated wizards), themed buildings, a fountain, trees,
// gathering nodes for every material, and NPCs that hand out quests and open the market.
// Mobile-first: touch joystick + tap-to-move + auto-follow camera. The DOM UI drives the 2D panels.
import { WORLD_NODES, NODE_MODELS } from "./nodes.js";
import { isClear, CHARACTER_HEIGHT, BUILDINGS, LANDMARKS, PROPS, NPCS, WANDERERS, PLAYER_SPAWN, OBSTACLES, TREE_RING, PLAYER_RADIUS, WORLD_BOUND, doorPos, resolveCollisions, cameraDistanceLimit, CAMERA_RADIUS } from "./structures.js";
import { modelUrl, CDN } from "./cdn.js";
import { tintTree } from "./tint.js";
import { heightAt, isWater, flatsForZone, groundColorAt, BIOMES } from "./terrain.js";
import { scatterZone, bucketByChunk, chunkDelta, exitNear, EXIT_RADIUS, ZONE_MAPS } from "./worldconfig.js";
import { isRaining } from "./weather.js";
import { PET_MAP } from "./pets.js";
import { WAND_FX_MAP, DEFAULT_WAND_FX } from "./wandcosmetics.js";

// BACKLOG §7 "Emotes" — id/icon/label metadata at MODULE scope (no THREE dependency) so
// index.html can build a menu without needing a live world instance. The bone-animation details
// live inside `createWorld` (they need THREE.Quaternion/Vector3), keyed by these same ids.
export const EMOTE_LIST = [
  { id: "wave",  icon: "👋", label: "Wave" },
  { id: "bow",   icon: "🙇", label: "Bow" },
  { id: "cheer", icon: "🎉", label: "Cheer" },
  { id: "spin",  icon: "💃", label: "Spin" },
];

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
  // On a map-backed zone, entities sit on the map's floor. Most baked grounds are flat planes,
  // so a single floor height (sampled at the spawn via raycast once the map loads) is cheaper
  // and safer than sampling the relief every frame; `mapFloorY` is populated by loadZoneMap.
  let mapFloorY = 0;
  let mapObstacleBoxes = [];                 // 2D [minX,maxX,minZ,maxZ] footprints of structures
  // On a map-backed zone the player sits on the map's actual surface (raycast down), so they
  // never sink into a raised area; `mapFloorY` is the fallback until the map loads.
  const groundY = (x, z) => {
    if (!ZONE_MAPS[ZONE.id]) return heightAt(x, z, ZONE.terrain, FLATS);
    if (chars && chars.map && chars.map.model){
      const s = mapSurfaceY(x, z);
      if (Number.isFinite(s)) return s;
    }
    return mapFloorY;
  };
  const wet = (x, z) => isWater(x, z, ZONE.terrain, FLATS);
  // Clamp to the ACTIVE ZONE's bounds, not a global constant — a zone with different bounds
  // would otherwise trap the player early or let them walk off the edge of its terrain.
  const B = ZONE.bounds;
  const clampX = v => Math.max(B.minX, Math.min(B.maxX, v));
  const clampZ = v => Math.max(B.minZ, Math.min(B.maxZ, v));
  // Collision comes from the zone when it supplies its own set, so a second zone is not silently
  // colliding with the academy's buildings.
  const ZONE_OBSTACLES = (ZONE.obstacles && ZONE.obstacles.length) ? ZONE.obstacles : OBSTACLES;
  // A zone may be backed by a full baked GLB map (ZONE_MAPS in worldconfig.js). When present the
  // map is the primary ground/structure visual; entities are still placed by the zone config,
  // but on the map's nominal ground (y=0) rather than the procedural heightmap.
  const MAP = ZONE_MAPS[ZONE.id] || null;
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  // Every mesh in this file already sets castShadow/receiveShadow (add() helper, GLB models,
  // treasure chests) — this master switch was left off, so all of that was dead code with zero
  // visual effect. Soft (PCF) shadows read as believable at this game's camera distance without
  // the harsher aliasing of the default map type.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(ZONE.background != null ? ZONE.background : 0x1a1440);
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
  // Close fog is what sells "underground" for an interior. It also hides the fact that the rooms
  // have no ceiling — the camera looks down into them, so a roof would just occlude the player.
  scene.fog = ZONE.interior
    ? new THREE.Fog(ZONE.background != null ? ZONE.background : 0x120c22, 18, 80)
    : new THREE.Fog(0x2a1a4a, 95, 250);
  // A visible sky, not just a solid clear colour. `renderer.setClearColor` below was the only
  // thing behind the world — an outdoor zone read as an unlit test scene because there was
  // nothing to look UP at. Deliberately warmer/brighter than `buildEnvironment`'s reflection map
  // just below (that one stays dim on purpose, so it doesn't wash PBR metal out) — this one exists
  // to actually be seen, matching the academy's own gold-over-violet palette so the sky and the 2D
  // UI chrome read as the same game. Interiors keep the flat clear colour: a cave has no sky.
  if (!ZONE.interior){
    const c = document.createElement("canvas"); c.width = 8; c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, "#161033");   // zenith — deep indigo
    grad.addColorStop(0.45, "#4a3168");   // upper sky
    grad.addColorStop(0.78, "#8a5a7a");   // haze band
    grad.addColorStop(1.00, "#e8a33d");   // horizon — the academy's own gold, as a sunset glow
    g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
    const skyTex = new THREE.CanvasTexture(c);
    skyTex.encoding = THREE.sRGBEncoding;   // tag it sRGB, same as renderer.outputEncoding below
    scene.background = skyTex;
  }
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
  renderer.setClearColor(ZONE.background != null ? ZONE.background : 0x1a1440);

  // lights
  // NOTE: these intensities were retuned when colour management went in. The old values were
  // set against an uncorrected pipeline that rendered everything ~2 stops dark, so once gamma
  // was right they blew the generated models' pale stone out to flat lavender.
  // Interiors (dungeons) are lit as caves: almost no sky, no sun, and close fog so the torches
  // and the boss glow are what the player actually reads by. An outdoor rig inside a dungeon
  // just makes a brightly-lit room with a ceiling missing.
  //
  // Not every interior is a cave, though. A dungeon earns its darkness because it SHIPS torches
  // in every room; a home does not, so the same rig makes a dorm a black box with a bed in it
  // — which reads as broken, not atmospheric. `ZONE.lightScale` lets a zone say how lit it is
  // instead of inferring it from `interior`, and the dorm asks for a warm, lived-in room.
  const INTERIOR = !!ZONE.interior;
  let sun = null, moon = null, hemi = null;
  // Base intensities for the day/night cycle below to scale against — captured once, at their
  // original "always noon" values, so the cycle multiplies rather than replaces this rig's
  // existing careful tuning (boost for baked maps, ZONE.lightScale for interiors).
  let sunBase = 0, moonBase = 0, hemiBase = 0;
  if (INTERIOR){
    const k = ZONE.lightScale || 1;
    scene.add(new THREE.HemisphereLight(ZONE.lightTint || 0x585070, 0x140e22, 0.30 * k));
    const fill = new THREE.DirectionalLight(0xa89ad0, 0.16 * k);
    fill.position.set(10, 30, 10); scene.add(fill);
  } else {
  // Map-backed zones ship PBR-baked terrain that needs a brighter rig than the procedural
  // world's flat material colours — same fixtures, higher output (the bakes were authored in a
  // bright renderer; under the dim procedural rig they read as black/grey).
  const boost = MAP ? 1.9 : 1;
  hemiBase = 0.42 * boost;
  hemi = new THREE.HemisphereLight(0xcfd8ff, 0x2a1f4d, hemiBase);
  scene.add(hemi);
  sunBase = 0.55 * boost;
  sun = new THREE.DirectionalLight(0xffd9a0, sunBase);
  sun.position.set(20, 40, 14);
  // Only the sun casts — one shadow-casting light reads as a believable time-of-day and keeps
  // the draw cost down. The frustum is sized to the player's actual play radius (roughly a
  // zone's walkable footprint around wherever the camera currently is), not the whole map, so
  // the shadow map's resolution isn't wasted on geometry far off-screen.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0025;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 0);
  scene.add(sun); scene.add(sun.target);
  moonBase = 0.15 * boost;
  moon = new THREE.DirectionalLight(0x9fb4ff, moonBase);
  moon.position.set(-20, 30, -20); scene.add(moon);
  }
  // warm courtyard glow
  const glow = new THREE.PointLight(0xff8844, ZONE.interior ? 0 : 0.55, 90);
  glow.position.set(0, 12, 0); scene.add(glow);

  // ---- day/night cycle (outdoor zones only) ----
  // Derived from WALL-CLOCK time, not a save field or a per-session timer — the same "derive,
  // don't store" rule as the rest of this game applies to time of day: every player, every zone,
  // every tab agrees on what time it is with nothing to desync or migrate. A zone can override it
  // with a fixed moment of day (`ZONE.fixedTimeOfDay`, 0=midnight..0.5=noon..1=midnight again) for
  // a permanently dusk-lit or night-lit place — none currently opt in, but the mechanism is here
  // for a zone whose mood calls for it (e.g. an eternally torchlit ash-lands or a snowbound dusk).
  const DAY_CYCLE_SECONDS = 20 * 60;   // a full day every 20 real minutes — a session sees a few
  const dayPhase = () => {
    if (typeof ZONE.fixedTimeOfDay === "number") return ((ZONE.fixedTimeOfDay % 1) + 1) % 1;
    return (Date.now() / 1000 % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
  };
  const dayNightColors = {
    fogDay: new THREE.Color(0x2a1a4a), fogNight: new THREE.Color(0x0a0818),
    domeDay: new THREE.Color(0xffffff), domeNight: new THREE.Color(0x40456f),
    clearDay: new THREE.Color(ZONE.background != null ? ZONE.background : 0x1a1440),
    clearNight: new THREE.Color(0x07050f),
  };
  // ---- weather (BACKLOG §3) ----
  // Purely atmospheric — see weather.js's own header for why this never touches gameplay (that's
  // Dynamic world events' job). Rain adds an extra overcast darkening ON TOP OF whatever the
  // day/night cycle already computed, so a rainy noon still reads as brighter than a clear night —
  // the two systems compose rather than one overriding the other.
  let rainGroup = null, rainPos = null;
  const RAIN_N = 500, RAIN_RADIUS = 55, RAIN_HEIGHT = 36, RAIN_FALL = 24;
  if (!INTERIOR){
    const geo = new THREE.BufferGeometry();
    rainPos = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++){
      rainPos[i*3]   = (Math.random()*2-1) * RAIN_RADIUS;
      rainPos[i*3+1] = Math.random() * RAIN_HEIGHT;
      rainPos[i*3+2] = (Math.random()*2-1) * RAIN_RADIUS;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainGroup = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaad4ff, size: 0.5, transparent: true, opacity: 0.5, sizeAttenuation: true, fog: false, depthWrite: false,
    }));
    rainGroup.visible = false; rainGroup.frustumCulled = false; rainGroup.renderOrder = -8;
    scene.add(rainGroup);
  }
  function updateWeather(dt){
    if (!rainGroup) return;
    const raining = isRaining(ZONE.id);
    rainGroup.visible = raining;
    if (!raining) return;
    rainGroup.position.set(player.position.x, 0, player.position.z);   // falls around the player
    for (let i = 1; i < rainPos.length; i += 3){
      rainPos[i] -= RAIN_FALL * dt;
      if (rainPos[i] < 0) rainPos[i] = RAIN_HEIGHT;
    }
    rainGroup.geometry.attributes.position.needsUpdate = true;
  }

  function updateDayNight(){
    if (INTERIOR) return;   // interiors are lit by their own fixtures, not the sky
    const alt = Math.sin((dayPhase() - 0.25) * Math.PI * 2);   // -1 midnight .. +1 noon
    const dayAmt = Math.max(0, alt), nightAmt = Math.max(0, -alt);
    const raining = isRaining(ZONE.id);
    const overcast = raining ? 0.35 : 0;                 // extra darkening, stacks with night
    const visualDark = Math.min(1, nightAmt + overcast);
    if (sun) sun.intensity = sunBase * (0.05 + 0.95 * dayAmt) * (raining ? 0.6 : 1);
    if (moon) moon.intensity = moonBase * (0.5 + 1.6 * nightAmt);
    if (hemi){
      hemi.intensity = hemiBase * (0.22 + 0.78 * dayAmt) * (raining ? 0.75 : 1);
      hemi.color.copy(dayNightColors.domeDay).lerp(dayNightColors.domeNight, Math.min(1, nightAmt * 0.6 + overcast * 0.5));
    }
    if (scene.fog) scene.fog.color.copy(dayNightColors.fogDay).lerp(dayNightColors.fogNight, visualDark);
    renderer.setClearColor(dayNightColors.clearDay.clone().lerp(dayNightColors.clearNight, visualDark));
    if (skyDome) skyDome.material.color.copy(dayNightColors.domeDay).lerp(dayNightColors.domeNight, visualDark);
    // Stars read as broken behind rainclouds — hide them outright rather than just dimming.
    if (skyStars) skyStars.material.opacity = raining ? 0 : (0.1 + 0.65 * nightAmt);
    if (skySun) skySun.material.opacity = raining ? dayAmt * 0.3 : dayAmt;
  }

  // ---- sky dome: replaces the flat clear-color void for outdoor zones ----
  // A large unlit gradient sphere that follows the camera, plus a soft sun glow + a few stars.
  // Interiors (dungeons) keep the flat background + fog — see the INTERIOR branch below.
  let skyGroup = null;
  let cloudGroup = null;
  // Handles the day/night cycle above tints/fades, set once the sky actually builds below.
  let skyDome = null, skyStars = null, skySun = null;
  if (!ZONE.interior){
    skyGroup = new THREE.Group();
    try {
      // vertical gradient sky (sRGB -> treated as colour via MeshBasicMaterial, unlit)
      const c = document.createElement('canvas'); c.width = 64; c.height = 256;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.00, '#0d0a24');   // zenith deep indigo
      grad.addColorStop(0.38, '#2a2a6e');   // upper sky violet-blue
      grad.addColorStop(0.52, '#5a5a9e');   // mid horizon
      grad.addColorStop(0.56, '#c9a06a');   // warm sun haze band
      grad.addColorStop(0.60, '#8a6a8a');   // lower haze
      grad.addColorStop(1.00, '#3a2a4a');   // ground fog
      g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
      // bake a soft cloud/haze band into the sky near the horizon so clouds read at any angle
      g.globalCompositeOperation = 'lighter';
      const bandY = 133, bandH = 26;   // ~0.52–0.62 of the 256px canvas
      for (let i = 0; i < 26; i++){
        const cx = Math.random() * 70, cy = bandY + Math.random() * bandH, cr = 4 + Math.random() * 9;
        const rg = g.createRadialGradient(cx, cy, 1, cx, cy, cr);
        rg.addColorStop(0, 'rgba(255,255,255,0.55)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, cr, 0, 6.2832); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(360, 24, 20),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
      );
      dome.renderOrder = -10; dome.frustumCulled = false;
      skyGroup.add(dome);
      skyDome = dome;
      // sun glow (a bright soft disc near the horizon)
      const sg = document.createElement('canvas'); sg.width = 64; sg.height = 64;
      const sgx = sg.getContext('2d');
      const srad = sgx.createRadialGradient(32, 32, 2, 32, 32, 30);
      srad.addColorStop(0, 'rgba(255,236,180,1)');
      srad.addColorStop(0.25, 'rgba(255,200,120,0.85)');
      srad.addColorStop(1, 'rgba(255,180,90,0)');
      sgx.fillStyle = srad; sgx.fillRect(0, 0, 64, 64);
      const stex = new THREE.CanvasTexture(sg);
      const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, transparent: true, depthWrite: false, fog: false }));
      sunSprite.scale.set(120, 120, 1); sunSprite.position.set(300, 90, -180);
      skyGroup.add(sunSprite);
      skySun = sunSprite;
      // sparse stars
      const starGeo = new THREE.BufferGeometry();
      const starN = 220, starPos = new Float32Array(starN * 3);
      for (let i = 0; i < starN; i++){
        const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - Math.random() * 0.55);
        starPos[i*3]   = 360 * Math.sin(ph) * Math.cos(th);
        starPos[i*3+1] = 360 * Math.cos(ph);
        starPos[i*3+2] = 360 * Math.sin(ph) * Math.sin(th);
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0.7, sizeAttenuation: true, fog: false, depthWrite: false }));
      stars.renderOrder = -9; stars.frustumCulled = false;
      skyGroup.add(stars);
      skyStars = stars;
      // drifting procedural clouds (flattened translucent puffs, animated in the frame loop)
      cloudGroup = new THREE.Group();
      const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false, depthWrite: false, side: THREE.DoubleSide });
      const makeCloud = (scale) => {
        const g = new THREE.Group();
        g.frustumCulled = false;
        const puffs = [[0,0,0,1],[1.1,0.18,0.2,0.7],[-1.0,0.1,-0.1,0.6],[0.5,0.32,0.4,0.5],[-0.4,0.38,-0.2,0.45],[1.6,0.05,0.1,0.5]];
        for (const [px,py,pz,ps] of puffs){
          const m = new THREE.Mesh(new THREE.SphereGeometry(ps, 10, 8), cloudMat);
          m.position.set(px*scale, py*scale, pz*scale);
          m.scale.y = 0.4; m.scale.z = 0.75;
          m.frustumCulled = false;
          g.add(m);
        }
        return g;
      };
      // Clouds live just above the horizon (the band the down-looking camera actually sees),
      // spread wide and made LARGE so they read clearly as cloud masses.
      for (let i = 0; i < 24; i++){
        const cl = makeCloud(9 + Math.random() * 8);
        const a = Math.random() * Math.PI * 2;
        const r = 50 + Math.random() * 240;
        const elev = 0.02 + Math.random() * 0.09;   // in radians: 1.1°–5.1° above horizon
        cl.position.set(Math.cos(a) * r, r * elev, Math.sin(a) * r);
        cl.userData.speed = 2 + Math.random() * 3;
        cl.userData.drift = Math.random() * 6.28;
        cloudGroup.add(cl);
      }
      skyGroup.add(cloudGroup);
    } catch(e){ console.warn("sky unavailable:", e && e.message); }
    scene.add(skyGroup);
  }

  // Procedural colours are authored as sRGB hex, so they must be converted to linear now that
  // the renderer gamma-encodes its output. Without this the whole hand-built world washes out.
  //
  // Standard, not Lambert: every GLB in this game is PBR (see the sky/env-map comment above), so
  // hand-built primitives sitting next to them in Lambert's pure-diffuse flat shading is exactly
  // the "primitive vs. modeled" seam the map/lighting diagnosis called out. Standard picks up a
  // little real specular response from the same light rig and the dim env map already authored
  // for metal gear, at zero art cost. Roughness/metalness stay high/low (matte, non-metal) by
  // default — this is not meant to make plaster read as chrome, just to stop it reading as chalk.
  // docs/ART-DIRECTION.md §4.4: every procedural-primitive surface (dorm furniture with no
  // model, market stalls, banners, sconces, display cases, treasure chests, gather-node fallback
  // shapes) was still a flat MeshStandardMaterial colour — the last "obviously primitive" surface
  // left once the asset-library repaint gave every GLB real painted texture. Built once per zone
  // (like tileTexture already is) and shared across every mat() call rather than baked per-call:
  // hundreds of objects call mat() in a single zone, and a fresh canvas draw per call would be
  // real, needless per-frame-independent cost — the exact class of thing the profiling pass spent
  // real effort trimming. One shared texture, MULTIPLIED against each object's own material.color
  // (the same relationship the offline batch repaint's overlay mode used, just running live
  // instead of baked into a GLB), keeps every object's actual hue while adding real paint texture.
  // Values stay close to white (small multiplicative deltas) on purpose — this multiplies against
  // EVERY colour in the game at once, so a strong tint here would wash the whole world toward one
  // colour instead of adding texture to each object's own.
  let paintedVariationTex = null;
  function paintVariationTexture(){
    if (paintedVariationTex) return paintedVariationTex;
    const size = 512;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e2d6'; x.fillRect(0, 0, size, size);
    // warm highlight blobs — scattered, not a single sweep (a sweep reads as baked lighting)
    for (let i = 0; i < 40; i++){
      const cx = Math.random()*size, cy = Math.random()*size, r = 20 + Math.random()*55;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,248,232,0.5)'); g.addColorStop(1, 'rgba(255,248,232,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
    }
    // cool shadow-accent blobs, low opacity — the "shadows read violet-blue" pillar
    for (let i = 0; i < 14; i++){
      const cx = Math.random()*size, cy = Math.random()*size, r = 16 + Math.random()*40;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(90,80,120,0.22)'); g.addColorStop(1, 'rgba(90,80,120,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
    }
    // visible brush strokes — the "painted, not flat" tell at close range
    for (let i = 0; i < 260; i++){
      const px = Math.random()*size, py = Math.random()*size;
      const len = 10 + Math.random()*22, ang = Math.random()*Math.PI*2;
      const lighter = Math.random() > 0.45;
      x.strokeStyle = lighter ? `rgba(255,255,255,${(0.12+Math.random()*0.14).toFixed(3)})`
                               : `rgba(40,32,24,${(0.10+Math.random()*0.12).toFixed(3)})`;
      x.lineWidth = 1.5 + Math.random()*2.5; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px+Math.cos(ang)*len*0.5+(Math.random()-0.5)*8, py+Math.sin(ang)*len*0.5+(Math.random()-0.5)*8,
        px+Math.cos(ang)*len, py+Math.sin(ang)*len);
      x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);   // tiled twice so a small prop doesn't just show one big blob
    tex.encoding = THREE.sRGBEncoding;
    paintedVariationTex = tex;
    return tex;
  }
  const mat = c => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, map: paintVariationTexture() });
    m.color.convertSRGBToLinear();
    return m;
  };
  const srgb = hex => new THREE.Color(hex).convertSRGBToLinear();
  // Procedural tiling textures for interior floors/walls (map/lighting diagnosis #3): a flat
  // colour plane the size of a whole dungeon room is the last big "obviously primitive" surface
  // left after #1 (real furniture models) and #2 (PBR materials). Same trick the sky/cloud-shadow
  // textures above already use — a canvas pattern baked once and repeated — so this is zero new
  // asset bytes, just pixels drawn at runtime. Two tones per texture (base + a slightly darker
  // "mortar" grid) is enough to read as masonry/flagstone at this camera distance without needing
  // a real normal map.
  // hex int -> CSS colour string, optionally darkened (mult < 1) for the mortar/grout line.
  function cssHex(hex, mult = 1){
    const c = new THREE.Color(hex);
    if (mult !== 1) c.multiplyScalar(mult);
    return `#${c.getHexString()}`;
  }
  function tileTexture({ base, line, cell = 64, cells = 4, lineW = 3 }){
    const size = cell * cells;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, size, size);
    // per-tile speckle so it doesn't read as a flat colour with a grid drawn over it
    for (let i = 0; i < size * size / 90; i++){
      const px = Math.random() * size, py = Math.random() * size;
      x.fillStyle = `rgba(0,0,0,${(Math.random() * 0.08).toFixed(3)})`;
      x.fillRect(px, py, 1.5, 1.5);
    }
    x.strokeStyle = line; x.lineWidth = lineW;
    for (let i = 0; i <= cells; i++){
      x.beginPath(); x.moveTo(i * cell, 0); x.lineTo(i * cell, size); x.stroke();
      x.beginPath(); x.moveTo(0, i * cell); x.lineTo(size, i * cell); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  // Repeats a texture across a mesh's real-world size rather than stretching one tile over it —
  // a 6m room wall and a 30m boss-room wall share the same material, so the repeat count has to
  // be set per mesh (via UV scale), not once on the shared material.
  function tileUV(geo, uRepeat, vRepeat){
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uRepeat, uv.getY(i) * vRepeat);
    uv.needsUpdate = true;
  }
  // entityKey -> {model, mixer, walk, idle}  (var: groundY reads it before init)
  var chars = {};
  // Loading progress, so the UI can show a state instead of a silently-empty world. Declared this
  // early — not down by makeCharModel where it conceptually belongs — because loadLandmarkModel
  // is now also called from the dorm-furniture block above the old declaration point, and a
  // `const` referenced before its line throws (temporal dead zone), not just "undefined".
  const loadState = { total:0, done:0, failed:[] };
  function loadProgress(){
    if (callbacks.onLoadProgress) callbacks.onLoadProgress({ ...loadState, models:{ ...chars } });
  }
  // Draco decoder, shared by every model load. The GLBs are Draco-compressed (22MB -> 3.4MB
  // across the character set), which the loader cannot read without this. Declared here (not
  // down by makeCharModel) for the same temporal-dead-zone reason as loadState above.
  let dracoLoader = null;
  function getDraco(){
    if (dracoLoader || !THREE.DRACOLoader) return dracoLoader;
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('./vendor/draco/');   // relative: the game is served under a subpath
    dracoLoader.setDecoderConfig({ type: 'js' });
    return dracoLoader;
  }
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
    // VERTEX COLOURS. A 150m field painted one flat biome colour has no shape to it — that is
    // why the world read as a plastic green sheet however detailed the models were. terrain.js
    // decides the colour per point (height bands, bare rock on slopes, a shoreline); this only
    // samples it. Vertex colours cost nothing: no texture to author, host or compress.
    const col = new Float32Array(pos.count * 3);
    const _c = new THREE.Color();
    for (let i = 0; i < pos.count; i++){
      // the plane is built in XY then rotated onto XZ, so its local y IS world -z
      const wx = pos.getX(i) + groundCX, wz = -pos.getY(i) + groundCZ;
      pos.setZ(i, groundY(wx, wz));
      if (!ZONE.interior){
        _c.setHex(groundColorAt(wx, wz, ZONE.terrain, FLATS)).convertSRGBToLinear();
        col[i*3] = _c.r; col[i*3+1] = _c.g; col[i*3+2] = _c.b;
      }
    }
    pos.needsUpdate = true;
    if (!ZONE.interior) groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  // Interiors get a dark cavern bed instead of a biome ground colour — the room floors sit on
  // top of it, and anything past them reads as unlit rock rather than a green field.
  // White base colour so the vertex colours come through unmultiplied; interiors keep a flat
  // cavern bed since their floors are separate meshes.
  const groundMat = ZONE.interior ? mat(0x1b1526)
    : Object.assign(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }), { vertexColors: true });
  const ground = add(groundGeo, groundMat, groundCX, 0, groundCZ, {receive:true});
  ground.rotation.x = -Math.PI/2;

  // ---- cloud shadows: soft moving darkness projected onto the ground ----
  // A large flat plane just above the terrain, textured with a dark cloud pattern, that follows
  // the player and whose texture drifts with the sky clouds. depthTest keeps it out of hills
  // (wherever it sits below the terrain, the ground occludes it), so it reads as sun/shade.
  let cloudShadow = null;
  if (!ZONE.interior){
    try {
      const sc = document.createElement('canvas'); sc.width = 256; sc.height = 256;
      const sx = sc.getContext('2d');
      sx.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++){
        const bx = Math.random() * 256, by = Math.random() * 256, br = 20 + Math.random() * 46;
        const rg = sx.createRadialGradient(bx, by, 2, bx, by, br);
        rg.addColorStop(0, 'rgba(0,0,25,0.85)');
        rg.addColorStop(0.6, 'rgba(0,0,20,0.35)');
        rg.addColorStop(1, 'rgba(0,0,20,0)');
        sx.fillStyle = rg; sx.beginPath(); sx.arc(bx, by, br, 0, 6.2832); sx.fill();
      }
      const stex = new THREE.CanvasTexture(sc);
      stex.wrapS = stex.wrapT = THREE.RepeatWrapping;
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(320, 320),
        new THREE.MeshBasicMaterial({ map: stex, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.renderOrder = 2;                        // over the ground, under everything else
      scene.add(sh);
      cloudShadow = { mesh: sh, tex: stex };
    } catch(e){ console.warn("cloud shadows unavailable:", e && e.message); }
  }

  // ---------- dungeon rooms (WORLDSPEC §6) ----------
  // Floors, walls and corridors. Every position and every wall segment was computed by
  // dungeons.js — nothing spatial is decided here, matching the rule that world.js renders what
  // the pure modules hand it (§9b d).
  if (ZONE.rooms && ZONE.rooms.length){
    const floorColor = ZONE.floorColor != null ? ZONE.floorColor : 0x3a3348;
    const wallColor  = ZONE.wallColor  != null ? ZONE.wallColor  : 0x4a4160;
    const bossFloorColor = ZONE.bossFloorColor != null ? ZONE.bossFloorColor : 0x5a3a44;
    const TILE = 2.2;   // metres per flagstone/masonry tile
    // The colour lives in the baked texture now, not in material.color (which mat() would also
    // convertSRGBToLinear and double-tint on top of the map) — so these are built directly rather
    // than through mat(), with color left white and roughness/metalness matched to it by hand.
    const roomMat = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.85, metalness: 0.05,
      map: tileTexture({ base: cssHex(color), line: cssHex(color, 0.72), ...opts }),
    });
    const floorMat = roomMat(floorColor);
    const wallMat = roomMat(wallColor, { cells: 3, lineW: 4 });
    const bossFloorMat = roomMat(bossFloorColor);
    const wallH = ZONE.wallHeight || 7;
    for (const r of ZONE.rooms){
      const f = add(new THREE.PlaneGeometry(r.w, r.d), r.boss ? bossFloorMat : floorMat, r.x, 0.02, r.z, {receive:true, cast:false});
      f.rotation.x = -Math.PI/2;
      tileUV(f.geometry, r.w / TILE, r.d / TILE);
    }
    for (const c of ZONE.corridors || []){
      const f = add(new THREE.PlaneGeometry(c.w, c.d), floorMat, c.x, 0.02, c.z, {receive:true, cast:false});
      f.rotation.x = -Math.PI/2;
      tileUV(f.geometry, c.w / TILE, c.d / TILE);
    }
    for (const w of [...ZONE.rooms.flatMap(r => r.walls || []), ...(ZONE.corridorWalls || [])]){
      const wm = add(new THREE.BoxGeometry(w.w, wallH, w.d), wallMat, w.x, wallH/2, w.z);
      tileUV(wm.geometry, Math.max(w.w, w.d) / TILE, wallH / TILE);
    }
  }
  // ---------- dorm furnishing (the Dorm phases, D2–D4) ----------
  // Everything here is PROCEDURAL and every position was decided by dorm.js — this block only
  // turns a resolved layout into primitives, the same contract the dungeon block above follows.
  // Nothing in this file works out where a bed, a case or a trophy goes.
  if (ZONE.dormLayout){
    const L = ZONE.dormLayout;
    for (const p of L.pieces){
      // A piece with a real GLB (dorm.js FURNITURE.model) renders as that model instead of the
      // primitive `shape` build below — same loader/grounding/fallback contract every other
      // landmark already uses, just pointed at furniture that already ships in assets/models.
      if (p.model){
        const g = new THREE.Group();
        scene.add(g);
        loadLandmarkModel('dorm:' + p.slot, p.model, g, { size: p.h, fit: "height", x: p.x, z: p.z, ry: p.ry || 0 });
        if (p.light){
          const l = new THREE.PointLight(p.light.color, p.light.intensity, p.light.distance);
          l.position.set(p.x, p.light.y, p.z); scene.add(l);
        }
        continue;
      }
      const m = mat(p.color);
      const put = (geo, y, h) => {
        const o = add(geo, m, p.x, y, p.z);
        o.rotation.y = p.ry || 0;
        return o;
      };
      if (p.shape === "rug"){
        const r = add(new THREE.PlaneGeometry(p.w, p.d), mat(p.color), p.x, 0.05, p.z, {receive:true, cast:false});
        r.rotation.x = -Math.PI/2; r.rotation.z = p.ry || 0;
      } else if (p.shape === "bed"){
        put(new THREE.BoxGeometry(p.w, 0.45, p.d), 0.22);
        const pillow = add(new THREE.BoxGeometry(p.w*0.8, 0.28, 0.7), mat(0xd8d0e8), p.x, 0.58, p.z);
        pillow.rotation.y = p.ry || 0;
        pillow.position.add(new THREE.Vector3(0, 0, p.d/2 - 0.6).applyAxisAngle(new THREE.Vector3(0,1,0), p.ry || 0));
      } else if (p.shape === "desk"){
        put(new THREE.BoxGeometry(p.w, 0.16, p.d), p.h);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]){
          const leg = add(new THREE.BoxGeometry(0.14, p.h, 0.14), m, p.x, p.h/2, p.z);
          leg.position.add(new THREE.Vector3(sx*(p.w/2-0.2), 0, sz*(p.d/2-0.2)).applyAxisAngle(new THREE.Vector3(0,1,0), p.ry || 0));
        }
      } else if (p.shape === "brazier"){
        put(new THREE.CylinderGeometry(p.w*0.16, p.w*0.34, p.h, 8), p.h/2);
        const bowl = add(new THREE.CylinderGeometry(p.w*0.55, p.w*0.3, 0.4, 10), m, p.x, p.h + 0.2, p.z);
        bowl.material = bowl.material.clone();
      } else if (p.shape === "shelf"){
        put(new THREE.BoxGeometry(p.w, p.h, p.d), p.h/2);
        // Books pushed forward out of the carcass, or the shelf renders as a plain brown slab
        // against the wall — which is exactly how it looked in the first render of the room.
        for (let i = 1; i <= 3; i++){
          const books = add(new THREE.BoxGeometry(p.w*0.86, 0.34, p.d*0.7), mat(0x8a3a2a), p.x, i * (p.h/4), p.z);
          books.rotation.y = p.ry || 0;
          books.position.add(new THREE.Vector3(0, 0, p.d*0.45).applyAxisAngle(new THREE.Vector3(0,1,0), p.ry || 0));
        }
      } else if (p.shape === "banner"){
        const b = put(new THREE.PlaneGeometry(p.w, p.h), p.h/2 + 1.4);
        b.material.side = THREE.DoubleSide;
      } else if (p.shape === "sconce"){
        put(new THREE.BoxGeometry(p.w, p.h, p.d), 2.3);
      } else if (p.shape === "case"){
        // Plinth + glass. The slab itself is drawn from `L.cases` below, so an empty case still
        // reads as a case waiting to be filled rather than as missing geometry.
        put(new THREE.BoxGeometry(p.w, 0.9, p.d), 0.45);
        const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent:true, opacity:0.22, roughness: 0.15, metalness: 0 });
        glass.color.convertSRGBToLinear();
        const g = add(new THREE.BoxGeometry(p.w, p.h - 0.9, p.d), glass, p.x, 0.9 + (p.h-0.9)/2, p.z, {cast:false});
        g.rotation.y = p.ry || 0;
      } else {
        put(new THREE.BoxGeometry(p.w, p.h, p.d), p.h/2);
      }
      if (p.light){
        const l = new THREE.PointLight(p.light.color, p.light.intensity, p.light.distance);
        l.position.set(p.x, p.light.y, p.z); scene.add(l);
        const bulb = add(new THREE.SphereGeometry(0.2, 8, 6), mat(p.light.color), p.x, p.light.y, p.z, {cast:false});
        bulb.material.emissive = srgb(p.light.color); bulb.material.emissiveIntensity = 1.0;
      }
    }
    // A displayed slab: a small glowing card standing inside its case. Its colour comes from the
    // grade, so a 10 reads as gold across the room — which is the entire point of a display case.
    for (const c of L.cases || []){
      if (!c.card) continue;
      const tint = c.card.roll >= 98 ? 0xffd766 : c.card.roll >= 92 ? 0xc9d4ff : 0x9fe6b0;
      const slab = add(new THREE.BoxGeometry(0.62, 0.9, 0.07), mat(tint), c.x, 1.5, c.z, {cast:false});
      slab.rotation.y = c.ry || 0;
      slab.material.emissive = srgb(tint); slab.material.emissiveIntensity = 0.55;
    }
    // Trophies are DERIVED from boss kills (dorm.js), never stored — so one appears the moment
    // the Cinder Wyrm goes down and can never disagree with the world.
    for (const t of L.trophies || []){
      const base = add(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8), mat(0x2a1f4d), t.x, 0.25, t.z);
      const skull = add(new THREE.DodecahedronGeometry(t.h * 0.32), mat(t.color), t.x, 0.5 + t.h*0.4, t.z);
      skull.rotation.y = t.ry || 0;
      skull.material.emissive = srgb(t.color); skull.material.emissiveIntensity = 0.22;
    }
  }
  // water, only where the zone declares a level
  if (ZONE.terrain.waterLevel != null){
    const wm = new THREE.MeshStandardMaterial({ color: biome.water, transparent:true, opacity:0.72, roughness: 0.1, metalness: 0 });
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

  // ---------- player appearance (BACKLOG §2, charcreate.js) ----------
  //
  // `player_wizard.glb` is ONE mesh with ONE material, so there is nothing to recolour per part.
  // The old version lerped that single material 45% toward a flat school colour, which dragged
  // the face, hands and boots toward it too and washed the painted texture into a single hue.
  //
  // This rotates HUE while keeping each material's own LIGHTNESS, so the painting survives and
  // the school still reads instantly. charcreate.js decides the numbers; this only applies them.
  let appearance = null;         // { hue, sat, light, strength, aura, motes } or null
  let auraGroup = null;
  function applyPlayerAppearance(){
    if (!appearance) return;
    // The shift happens in the FRAGMENT SHADER (tint.js), not on material.color: the player GLB's
    // Base Color is white and all of its colour is in the texture, so multiplying the material
    // colour cannot rotate a hue — it can only darken. Found by rendering the preview and seeing
    // a Fire wizard come out Storm purple while the numbers were correct.
    const ud = player.userData;
    if (ud && ud.robe && ud.robe.parent) tintTree(player, appearance);
    const pc = chars.player;
    if (pc && pc.model) tintTree(pc.model, appearance);
    buildAura();
  }
  // ---------- equipped gear on the character (BACKLOG §2, equipment3d.js) ----------
  // Bone attachment. The auto-rigged player exposes real named bones (RightHand, Neck, ...), so a
  // weapon can simply be parented to one and inherits the animation for free — no per-frame
  // matrix copying, no separate update path.
  //
  // Rebuilt wholesale on every change rather than diffed: there are at most two attachments, and
  // a diff would have to reason about tier changes swapping the model underneath a slot.
  let gearGroups = {};
  function clearGear(){
    for (const g of Object.values(gearGroups)){
      g.traverse(o => { if (o.isMesh){ o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
      if (g.parent) g.parent.remove(g);
    }
    gearGroups = {};
  }
  function applyGear(){
    clearGear();
    const pc = chars.player;
    if (!pc || !pc.model || !gearList.length) return;
    for (const a of gearList){
      const bone = pc.model.getObjectByName(a.bone);
      // A missing bone is a real failure (the model was replaced with an unrigged one, or the
      // rigger renamed things) — say so once rather than silently showing no gear.
      if (!bone){ console.warn("gear: no bone", a.bone, "for", a.slot); continue; }
      const g = new THREE.Group();
      g.position.fromArray(a.pos);
      g.rotation.fromArray(a.rot);
      bone.add(g);
      gearGroups[a.slot] = g;
      // The bone carries the character's own scale, so anything parented to it inherits that
      // scale too. Undo it, or a 0.85m wand comes out at whatever the rig's internal units are.
      bone.updateWorldMatrix(true, false);
      const s = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld);
      const inv = 1 / Math.max(1e-6, (s.x + s.y + s.z) / 3);
      g.scale.setScalar(inv);

      if (a.model){
        // Gear gets its OWN loader rather than loadLandmarkModel: that one grounds the model to
        // the terrain height and registers it in `chars`, both of which are wrong for something
        // parented to a bone. CDN-then-local retry is kept — it is why props stopped vanishing
        // during a CDN outage.
        loadGear("./assets/models/" + a.model, g, a);
      } else {
        // No model for this slot: a small bead. The amulet has no CC0 mesh in the repo and does
        // not need one at this size.
        const bead = new THREE.Mesh(new THREE.SphereGeometry(a.height * 0.5, 10, 8), mat(a.color || 0xc8c8c8));
        if (a.glow){ bead.material.emissive = srgb(a.color || 0xc8c8c8); bead.material.emissiveIntensity = 0.9; }
        g.add(bead);
      }
    }
    buildWandFx();   // the wand slot group was just rebuilt (or removed) — the FX group rides on it
  }
  let gearList = [];

  // ---------- wand cosmetics (BACKLOG §7, wandcosmetics.js) ----------
  // The aura's own trick (a colour + a handful of orbiting motes), reused at the wand's tip
  // instead of the player's feet — see wandcosmetics.js's own header for why this is data, not a
  // new asset. Parented to the wand's OWN gear group (not the player), so it moves, scales and
  // vanishes with the wand automatically — no separate position bookkeeping.
  let wandFxId = DEFAULT_WAND_FX, wandFxGroup = null;
  function buildWandFx(){
    if (wandFxGroup){
      wandFxGroup.traverse(o => { if (o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
      if (wandFxGroup.parent) wandFxGroup.parent.remove(wandFxGroup);
      wandFxGroup = null;
    }
    const fx = WAND_FX_MAP[wandFxId];
    const wandGroup = gearGroups.wand;
    if (!fx || !fx.color || !wandGroup) return;   // "none", locked/unknown id, or no wand equipped
    wandFxGroup = new THREE.Group();
    // Offset toward the tip, not the grip — measured the same by-eye way equipment3d.js's own
    // ATTACHMENTS positions were: far enough out to read as coming FROM the wand, not the hand.
    wandFxGroup.position.set(0, 0.75, 0);
    const glow = new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < fx.motes; i++){
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), glow);
      m.userData.phase = (i / fx.motes) * Math.PI * 2;
      wandFxGroup.add(m);
    }
    wandGroup.add(wandFxGroup);
  }
  function stepWandFx(t){
    if (!wandFxGroup) return;
    for (const m of wandFxGroup.children){
      if (m.userData.phase == null) continue;
      const a = m.userData.phase + t * 1.3;
      m.position.set(Math.cos(a) * 0.18, Math.sin(a * 1.6) * 0.14, Math.sin(a) * 0.18);
    }
  }

  // A school-coloured glow on the ground under the player. This is the half of the appearance
  // system that is actually unambiguous at a glance — a hue shift on a dark robe is subtle at
  // camera distance, a coloured rune ring is not.
  function buildAura(){
    if (auraGroup){
      // Free the GPU memory rather than just detaching. The aura is rebuilt on every appearance
      // change, and the character-creation screen changes it on every click of every swatch.
      auraGroup.traverse(o => { if (o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
      player.remove(auraGroup); auraGroup = null;
    }
    if (!appearance || appearance.aura == null) return;
    auraGroup = new THREE.Group();
    const glow = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 28, 1), glow(appearance.aura));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    auraGroup.add(ring);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.38, 20, 1), glow(appearance.aura));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.03; inner.material.opacity = 0.3;
    auraGroup.add(inner);
    for (let i = 0; i < (appearance.motes || 0); i++){
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), glow(appearance.aura));
      m.material.opacity = 0.8;
      m.userData.phase = (i / appearance.motes) * Math.PI * 2;
      auraGroup.add(m);
    }
    player.add(auraGroup);
  }
  function stepAura(t){
    if (!auraGroup) return;
    for (const m of auraGroup.children){
      if (m.userData.phase == null) continue;
      const a = m.userData.phase + t * 0.7;
      m.position.set(Math.cos(a) * 0.95, 0.55 + Math.sin(a * 1.7) * 0.35, Math.sin(a) * 0.95);
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
  // Returns the created entry so a caller that owns a lifecycle shorter than the whole zone
  // (the chunk streamer, below) can un-register it later instead of leaking it forever.
  function register(kind, x, z, data, label, mesh, radius=4.6){
    const it = { kind, x, z, data, label, mesh, radius };
    interactives.push(it);
    return it;
  }
  function unregister(it){
    const i = interactives.indexOf(it);
    if (i >= 0) interactives.splice(i, 1);
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
    // Colours are optional in the zone schema — a hand-authored zone can name an NPC's model and
    // nothing else. Without defaults every one of those built materials with `color: undefined`
    // (six THREE warnings per load in the forest) and the procedural stand-in rendered as an
    // untinted blob whenever its GLB was slow or missing.
    const g = makeWizard(main != null ? main : 0x5a4a8a, hat != null ? hat : 0x2a1f4d, opts.skin || 0xf0c8a0, opts);
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

  // ---------- Emotes (BACKLOG §7) ----------
  // Deliberately NOT new animation clips (the generated character GLBs only ship walk/idle) —
  // the same procedural-bone-puppeteering technique `equipment3d.js`'s wand/amulet attachment
  // already relies on (a named rig bone is guaranteed by `tools/rig-character.py`'s bone set,
  // proven by the "player rig exposes the bones the attachment table names" test), applied as a
  // temporary quaternion offset on top of the bone's own base pose rather than a swapped clip.
  // Each `update(t)` returns radians of rotation about `axis` at time fraction t∈[0,1] of the
  // emote's duration; the bone (and its base quaternion) is restored the instant it ends.
  const EMOTE_DETAILS = {
    wave:  { duration: 2.0, bone: "RightForeArm", axis: new THREE.Vector3(0,0,1),
             update: t => Math.sin(t * Math.PI * 6) * 0.9 * Math.sin(t * Math.PI) },
    bow:   { duration: 1.8, bone: "Spine1", axis: new THREE.Vector3(1,0,0),
             update: t => Math.sin(t * Math.PI) * 0.6 },
    cheer: { duration: 2.0, bone: "RightArm", axis: new THREE.Vector3(0,0,1),
             update: t => -Math.sin(t * Math.PI) * 1.8,
             bone2: "LeftArm", axis2: new THREE.Vector3(0,0,1), update2: t => Math.sin(t * Math.PI) * 1.8 },
    spin:  { duration: 1.4, bone: "Hips", axis: new THREE.Vector3(0,1,0),
             update: t => t * Math.PI * 2 },
  };
  const EMOTES = Object.fromEntries(EMOTE_LIST.map(e => [e.id, { icon: e.icon, ...EMOTE_DETAILS[e.id] }]));
  let activeEmote = null;   // { def, startedAt, bubble }

  // ---------- Pet / familiar companion (BACKLOG §7) ----------
  // Follows a step behind and to the side of the player, the same lerp-toward-a-target-offset
  // shape the follow camera already uses, just applied to a mesh instead of a camera rig.
  let petEntry = null;   // { model, baseY, bobSeed }
  // Same traverse+dispose shape the dungeon-teardown/zone-change code already uses elsewhere in
  // this file — removing a mesh from the scene alone leaks its geometry/textures on the GPU;
  // switching pets a few times in a session would otherwise slowly leak VRAM with nothing to show
  // for it.
  function disposeModel(model){
    model.traverse(o => { if (o.isMesh){ if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); } });
  }
  function setPet(petId){
    if (petEntry && petEntry.model){ scene.remove(petEntry.model); disposeModel(petEntry.model); petEntry = null; }
    const pet = petId && PET_MAP[petId];
    if (!pet) return;
    const loader = new THREE.GLTFLoader();
    const d = getDraco(); if (d) loader.setDRACOLoader(d);
    const cdnUrl = CDN[pet.model];
    const url = cdnUrl || modelUrl(pet.model);
    const load = (u, fallback) => loader.load(u, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const scale = h > 0.001 ? pet.height / h : 1;
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      model.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      model.position.set(player.position.x, groundY(player.position.x, player.position.z), player.position.z);
      scene.add(model);
      petEntry = { model, baseY: -box.min.y * scale, bobSeed: Math.random() * 10 };
    }, undefined, err => {
      if (fallback){ load(fallback, null); return; }
      console.warn("pet model failed to load:", u, err && err.message);
    });
    load(url, cdnUrl ? modelUrl(pet.model) : null);
  }
  function updatePet(dt, now){
    if (!petEntry || !petEntry.model) return;
    const m = petEntry.model;
    // Trails behind-and-right of wherever the player is currently facing, not a world-fixed
    // offset — so it reads as following, not orbiting a fixed point near the player.
    const trail = 1.7;
    const behindX = player.position.x - Math.sin(player.rotation.y) * trail + Math.cos(player.rotation.y) * 0.9;
    const behindZ = player.position.z - Math.cos(player.rotation.y) * trail - Math.sin(player.rotation.y) * 0.9;
    const k = Math.min(1, dt * 4);
    const nx = m.position.x + (behindX - m.position.x) * k;
    const nz = m.position.z + (behindZ - m.position.z) * k;
    const dx = nx - m.position.x, dz = nz - m.position.z;
    if (Math.abs(dx) > 0.005 || Math.abs(dz) > 0.005) m.rotation.y = Math.atan2(dx, dz);
    m.position.x = nx; m.position.z = nz;
    m.position.y = groundY(nx, nz) + petEntry.baseY + Math.sin(now / 260 + petEntry.bobSeed) * 0.04;
  }
  function makeEmoteBubble(icon){
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.font = '46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    spr.scale.set(1.4, 1.4, 1);
    return spr;
  }
  // A fresh canvas texture is minted per emote (the icon differs each time), so — same disposal
  // discipline as disposeModel — it must be freed on removal, not just detached.
  function disposeSprite(spr){
    if (spr.material){ if (spr.material.map) spr.material.map.dispose(); spr.material.dispose(); }
  }
  // Restores every bone an emote touched to its captured base pose — shared by both a natural
  // finish and being interrupted by a second emote, so a bone can never get stuck mid-gesture.
  function restoreEmoteBones(def){
    const pc = chars.player;
    if (!pc || !pc.bones) return;
    for (const boneKey of [def.bone, def.bone2]){
      if (boneKey && pc.bones[boneKey] && pc.baseRot[boneKey]) pc.bones[boneKey].quaternion.copy(pc.baseRot[boneKey]);
    }
  }
  function updateEmote(now){
    if (!activeEmote) return;
    const { def, startedAt, bubble } = activeEmote;
    const t = (now - startedAt) / 1000 / def.duration;
    const pc = chars.player;
    if (t >= 1 || !pc || !pc.model){
      restoreEmoteBones(def);
      if (bubble){ if (bubble.parent) bubble.parent.remove(bubble); disposeSprite(bubble); }
      activeEmote = null;
      return;
    }
    if (pc.bones && def.bone && pc.bones[def.bone] && pc.baseRot[def.bone]){
      const q = new THREE.Quaternion().setFromAxisAngle(def.axis, def.update(t));
      pc.bones[def.bone].quaternion.copy(pc.baseRot[def.bone]).multiply(q);
    }
    if (pc.bones && def.bone2 && pc.bones[def.bone2] && pc.baseRot[def.bone2]){
      const q2 = new THREE.Quaternion().setFromAxisAngle(def.axis2, def.update2(t));
      pc.bones[def.bone2].quaternion.copy(pc.baseRot[def.bone2]).multiply(q2);
    }
    if (bubble){
      bubble.position.set(player.position.x, groundY(player.position.x, player.position.z) + 2.6, player.position.z);
      // fade in, hold, fade out — never an abrupt pop in either direction
      bubble.material.opacity = t < 0.15 ? t/0.15 : (t > 0.8 ? (1-t)/0.2 : 1);
    }
  }
  function playEmote(id){
    const def = EMOTES[id];
    if (!def) return false;
    if (activeEmote){   // a new emote cuts the old one off cleanly rather than blending
      restoreEmoteBones(activeEmote.def);
      if (activeEmote.bubble){ if (activeEmote.bubble.parent) activeEmote.bubble.parent.remove(activeEmote.bubble); disposeSprite(activeEmote.bubble); }
    }
    const bubble = makeEmoteBubble(def.icon);
    bubble.renderOrder = 20;
    scene.add(bubble);
    activeEmote = { def, startedAt: performance.now(), bubble };
    return true;
  }

  // ---------- load GLB character models (replace procedural wizards) ----------
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
      // static mesh (the geometry box is the real size). Both are sized to CHARACTER_HEIGHT.
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
        // ...but the skeleton is not always the whole character either. Our re-rigged wizard's
        // bones stop at the top of the HEAD, while the model wears a pointed hat that reaches
        // well past it — so the skeleton span read 0.70 against a 1.0-tall model and the
        // character was scaled 43% too big. Take whichever box is larger: the skeleton wins where
        // bones sit outside the mesh (the original problem), the mesh wins where it sits outside
        // the bones (a hat, a cloak, a tail).
        if (!geoBox.isEmpty()){
          minY = Math.min(minY, geoBox.min.y); maxY = Math.max(maxY, geoBox.max.y);
          minX = Math.min(minX, geoBox.min.x); maxX = Math.max(maxX, geoBox.max.x);
          minZ = Math.min(minZ, geoBox.min.z); maxZ = Math.max(maxZ, geoBox.max.z);
        }
      } else {
        minY = geoBox.min.y; maxY = geoBox.max.y;
        minX = geoBox.min.x; maxX = geoBox.max.x;
        minZ = geoBox.min.z; maxZ = geoBox.max.z;
      }
      const height = maxY - minY;
      let scale = CHARACTER_HEIGHT;
      if (height > 0.001) scale = CHARACTER_HEIGHT / height;
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
  makeCharModel('player', './assets/models/player_wizard.glb', player, ()=>{ applyPlayerAppearance(); applyGear(); });
  for (const n of ZONE.npcs) makeCharModel(n.key, './assets/models/' + n.model, npcByKey[n.key]);
  for (let i=0;i<ZWANDER.length;i++) makeCharModel(ZWANDER[i].key, './assets/models/' + ZWANDER[i].model, wanderers[i]);

  // Load one piece of gear into a bone-local group. No terrain grounding, no `chars` entry, no
  // boot-progress accounting: this is a child of a bone, not a thing in the world.
  function loadGear(localUrl, group, a){
    const cdnUrl = CDN[localUrl.split('/').pop()];
    const go = (url, fallbackUrl) => {
      const loader = new THREE.GLTFLoader();
      const d = getDraco();
      if (d) loader.setDRACOLoader(d);
      loader.load(url, gltf => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const h = Math.max(0.001, box.max.y - box.min.y);
        model.scale.setScalar(a.height / h);
        // Centre the model on its own bounding box so the grip sits at the bone, not the model's
        // base — otherwise a 2m staff is held by its foot and stabs through the floor.
        const c = box.getCenter(new THREE.Vector3()).multiplyScalar(a.height / h);
        model.position.set(-c.x, -c.y, -c.z);
        if (a.color != null) model.traverse(o => {
          if (o.isMesh && o.material && o.material.color){
            o.material = o.material.clone();
            o.material.color.lerp(srgb(a.color), 0.55);
          }
        });
        group.add(model);
      }, undefined, err => {
        if (fallbackUrl){ go(fallbackUrl, null); return; }
        console.warn("gear model failed to load:", url, err && err.message);
      });
    };
    go(cdnUrl || localUrl, cdnUrl ? localUrl : null);
  }

  // ---------- static landmark/building models (unlike characters, no fixed 1.8 target height —
  // each is scaled to its own footprint, and stays centered on X/Z with its base at y=0) ----------
  // `fit` is "height" or "width": height for things whose height defines them (the tower),
  // width when the FOOTPRINT is the gameplay-relevant dimension (the arena floor is the duel
  // space, so its diameter must be right and the height follows from the model's proportions).
  function loadLandmarkModel(key, localUrl, group, opts){
    const { size, fit = "height", x = 0, z = 0, ry = 0, onReady, quiet = false, isStale } = opts;
    // streamed chunk content loads continuously, so it must not drive the boot progress HUD
    if (!quiet) loadState.total++;
    // Same CDN-then-local retry as makeCharModel. Characters got this when a CDN outage turned
    // the whole cast into stand-ins; props, landmarks and buildings had the identical single
    // point of failure and were simply missing from the world when the CDN was unreachable.
    const cdnUrl = CDN[localUrl.split('/').pop()];
    load(cdnUrl || localUrl, cdnUrl ? localUrl : null);
    function load(url, fallbackUrl){
    const loader = new THREE.GLTFLoader();
    const d = getDraco();
    if (d) loader.setDRACOLoader(d);
    loader.load(url, gltf => {
      // Chunk streaming can unload the very chunk this load was for before the network/parse
      // finishes (see world.js's unloadChunk — real GLTF loads take long enough, especially on a
      // slow connection or an uncached model, that a player crossing back out of a chunk before
      // it resolves is not a corner case). `group` would still be a live JS reference (held by
      // this very callback's closure) even though it's a child of a group unloadChunk already
      // scene.remove()'d and dropped from CHUNKS.loaded — attaching the model to it would leak
      // GPU buffers forever with nothing left tracking them to dispose. Bail and free immediately.
      if (isStale && isStale()){
        gltf.scene.traverse(o => {
          if (o.geometry && o.geometry.dispose) o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) if (m && m.dispose) m.dispose();
        });
        return;
      }
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
      if (fallbackUrl){ load(fallbackUrl, null); return; }
      // Keep the procedural placeholder rather than an empty patch of ground.
      console.warn("landmark model failed to load:", url, err && err.message);
      if (!quiet){ loadState.done++; loadState.failed.push(key); loadProgress(); }
    });
    }
  }
  // Standalone landmarks (tower, arena) — generated via Tripo (2D->3D). Their collision shapes
  // in structures.js are sized to these models' real footprints, not the old procedural ones.
  const landmarkGroups = { tower: towerGroup, arena: arenaGroup };
  // a zone without these landmarks should not show their procedural placeholders either
  for (const [k, g] of Object.entries(landmarkGroups))
    if (!ZONE.landmarks.some(l => l.key === k)) scene.remove(g);
  for (const L of ZONE.landmarks){
    // A zone map may ship its own version of a landmark (e.g. the Plains/Academy map has its own
    // central tower); remove it entirely (model AND procedural placeholder) rather than layering
    // the standalone on top of the map's structure.
    if (MAP && MAP.hideLandmarks && MAP.hideLandmarks.includes(L.key)){
      const hg = landmarkGroups[L.key];
      if (hg) scene.remove(hg);
      continue;
    }
    const g = landmarkGroups[L.key];
    if (g) loadLandmarkModel(L.key, L.url, g, { size:L.size, fit:L.fit, x:L.x, z:L.z, ry:L.ry });
  }
  // CC0 world dressing (KayKit / Quaternius — see ASSETS.md). Each goes in its own Group so a
  // failed load leaves nothing behind rather than a half-placed object.
  const ZPROPS = ZONE.props.filter(p => p.x != null);   // count-based props are streamed
  // Culled per-frame below (see updateLightCulling): a dungeon's rooms all build at once — no
  // chunk streaming for interiors — so torch count (and therefore real-time light count) scales
  // with total dungeon size, not with what's actually near the player. A light already
  // contributes ~nothing past its own configured `distance` falloff (THREE's default decay
  // zeroes it there), so hiding it beyond that radius is a free win: same lit look up close,
  // zero shader cost for every torch the player isn't standing next to.
  const cullableLights = [];
  for (let i = 0; i < ZPROPS.length; i++){
    const pr = ZPROPS[i];
    const g = new THREE.Group(); scene.add(g);
    loadLandmarkModel('prop' + i, pr.url, g, { size:pr.h, fit:"height", x:pr.x, z:pr.z, ry:pr.ry || 0 });
    // A prop may declare its own light. Dungeon torches do: without them an interior lit only by
    // its dim ambient rig is a black room with a torch MODEL in it, which reads as broken rather
    // than atmospheric. dungeons.js decides which props glow; this only renders the decision.
    if (pr.light){
      const l = new THREE.PointLight(pr.light.color, pr.light.intensity, pr.light.distance);
      l.position.set(pr.x, pr.light.y != null ? pr.light.y : 2.6, pr.z);
      scene.add(l);
      const bulb = add(new THREE.SphereGeometry(0.28, 8, 6), mat(pr.light.color), pr.x, l.position.y, pr.z, {cast:false});
      bulb.material.emissive = srgb(pr.light.color); bulb.material.emissiveIntensity = 1.0;
      // The bulb itself stays lit-looking (emissive) regardless of culling — only the real
      // dynamic light (the expensive part) gets hidden, so a distant torch still reads as glowing.
      cullableLights.push({ light: l, x: pr.x, z: pr.z, r2: (pr.light.distance || 26) ** 2 });
    }
  }
  function updateLightCulling(){
    if (!cullableLights.length) return;
    const px = player.position.x, pz = player.position.z;
    for (const cl of cullableLights){
      const dx = cl.x - px, dz = cl.z - pz;
      cl.light.visible = (dx*dx + dz*dz) <= cl.r2;
    }
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
    // Every register() call this chunk makes gets tracked here so unloadChunk can un-register
    // them — without this, gather/enemy prompts pile up forever as the player wanders (the same
    // model was already being disposed correctly; the INTERACTIVE ENTRY was the part leaking).
    const regs = [];
    // A load is "stale" once this chunk is no longer the one CHUNKS.loaded tracks under `key` —
    // covers both a plain unload and the (currently impossible, but cheap to guard) case of the
    // same key being reloaded into a fresh group before the old load resolves.
    const isStale = () => CHUNKS.loaded.get(key) !== group;
    for (const p of bucket.props){
      const g = new THREE.Group(); group.add(g);
      loadLandmarkModel("chunk:" + key + ":" + p.url, p.url, g,
        { size:p.h || 2, fit:"height", x:p.x, z:p.z, ry:p.ry || 0, quiet:true, isStale });
    }
    for (const n of bucket.resourceNodes){
      const spec = ZONE.nodeModels[n.kind];
      const g = new THREE.Group(); group.add(g);
      if (spec) loadLandmarkModel("chunk:" + key + ":" + n.id, spec.url, g,
        { size:spec.h, fit:"height", x:n.x, z:n.z, ry:(n.x * 0.7) % 3, quiet:true, isStale });
      regs.push(register("gather", n.x, n.z, n.id, n.label, null, 4.6));
    }
    // Outdoor (count-scattered) enemies previously rendered with no way to fight them — the model
    // loaded, but nothing ever called register('enemy', ...) for them, unlike every other
    // interactive kind. `data` is a small object rather than a bare id (dungeon enemies use a
    // string id looked up in the zone's own hand-authored `enemies` list, which scattered
    // instances aren't part of) — index.html's onEnemy callback branches on `data.outdoor` to
    // route these to a dedicated open-world fight instead of the dungeon-foe lookup.
    bucket.enemies.forEach((e, i) => {
      const g = new THREE.Group(); group.add(g);
      loadLandmarkModel("chunk:" + key + ":enemy", "./assets/models/" + e.model, g,
        { size:e.h || 1.9, fit:"height", x:e.x, z:e.z, ry:(e.x) % 3, quiet:true, isStale });
      const data = { outdoor:true, id:"oenemy:" + key + ":" + i, model:e.model, name:e.name, level:e.level || 1 };
      regs.push(register("enemy", e.x, e.z, data, e.name + " (Lv " + (e.level||1) + ")", null, 4.6));
    });
    group.userData.regs = regs;
  }
  function unloadChunk(key){
    const group = CHUNKS.loaded.get(key);
    if (!group) return;
    for (const it of (group.userData.regs || [])) unregister(it);
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

  // ---------- zone map base layer (ZONE_MAPS) ----------
  // A zone may be backed by a full baked GLB map (terrain + structures). The map loads as the
  // primary ground/structures visual, set just above the procedural ground (which stays as the
  // surrounding fallback floor where the map is smaller than the zone bounds, so the player can
  // never walk into a void). If the map fails to load the zone is unchanged.
  if (MAP) loadZoneMap(MAP);
  function loadZoneMap(m){
    const url = "./assets/maps/" + m.file;
    const g = new THREE.Group(); scene.add(g);
    const loader = new THREE.GLTFLoader();
    const d = getDraco(); if (d) loader.setDRACOLoader(d);
    loadState.total++;
    loader.load(url, gltf => {
      const model = gltf.scene;
      model.scale.setScalar(m.scale || 1);
      model.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      // Center the map on (x, z) and ground it. The baked GLBs carry large local offsets (the
      // source scene placed them at e.g. x=220), so the world position must recenter the model —
      // adding m.x on top of that offset is what previously parked the map far from the player.
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      // Ground on the WALKABLE terrain, not the lowest water plane (which sits below the ground
      // and would otherwise raise the whole map, sinking the player and NPCs through the floor).
      let groundMinY = Infinity;
      model.traverse(o => {
        if (!o.isMesh) return;
        if ((o.name || "").toLowerCase().includes("water")) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox; if (!b) return;
        const v = new THREE.Vector3(b.min.x, b.min.y, b.min.z).applyMatrix4(o.matrixWorld);
        if (v.y < groundMinY) groundMinY = v.y;
      });
      if (!Number.isFinite(groundMinY)) groundMinY = box.min.y;
      model.position.set((m.x || 0) - cx, (m.y || 0) - groundMinY, (m.z || 0) - cz);
      g.add(model);
      // Collect 2D footprints of the map's structures (not ground/water/decor) so a hollow
      // building's interior also blocks the player, not just its elevated walls.
      mapObstacleBoxes = [];
      model.updateMatrixWorld(true);
      model.traverse(o => {
        if (!o.isMesh) return;
        const nm = (o.name || "").toLowerCase();
        if (nm.includes("ground") || nm.includes("water")) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox; if (!b) return;
        const vmin = new THREE.Vector3(b.min.x, b.min.y, b.min.z).applyMatrix4(o.matrixWorld);
        const vmax = new THREE.Vector3(b.max.x, b.max.y, b.max.z).applyMatrix4(o.matrixWorld);
        const w = vmax.x - vmin.x, d = vmax.z - vmin.z;
        if (Math.min(w, d) < 0.8) return;       // block trees/rocks too (not just building-sized shapes)
        mapObstacleBoxes.push([vmin.x, vmax.x, vmin.z, vmax.z]);
      });
      // Sample the map's floor under the spawn so entities/player sit on the surface instead of
      // sinking into hills (or hovering). One raycast at load; the floor is treated as flat.
      try {
        const sx = (ZONE.spawn && ZONE.spawn.x != null) ? ZONE.spawn.x : 0;
        const sz = (ZONE.spawn && ZONE.spawn.z != null) ? ZONE.spawn.z : 0;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(sx, 300, sz),
          new THREE.Vector3(0, -1, 0)
        );
        const hits = ray.intersectObject(model, true);
        for (const h of hits){
          const nm = (h.object.name || "").toLowerCase();
          if (nm.includes("water")) continue;          // land on walkable terrain, not water
          mapFloorY = h.point.y;
          break;
        }
      } catch(e){ /* keep mapFloorY = 0 */ }
      // Entities were placed at y=0 before the floor was known — lift them onto the surface.
      // (Their model Y was set relative to groundY=0 at build time, so raising each group by the
      // floor height puts its base exactly on the map.)
      if (mapFloorY !== 0){
        for (const k in npcByKey) npcByKey[k].position.y = mapFloorY;
        for (const k in nodeGroups) nodeGroups[k].position.y = mapFloorY;
        for (const k in buildingGroups) buildingGroups[k].position.y = mapFloorY;
        for (const k in wanderers) wanderers[k].position.y = mapFloorY;
        player.position.y = mapFloorY;
      }
      // track it like any other model so the loading HUD and __worldDebug see it
      chars["map"] = { model, mixer:null, walk:null, idle:null, rawSize:box.getSize(new THREE.Vector3()).y, computedScale:m.scale || 1 };
      if (window.__analytics) window.__analytics.track("world", { event: "map_loaded", zone: ZONE.id, model: m.file });
      loadState.done++; loadProgress();
    }, undefined, err => {
      console.warn("zone map failed to load:", url, err && err.message);
      if (window.__analytics) window.__analytics.track("world", { event: "map_failed", zone: ZONE.id, model: m.file, err: (err && err.message || "").slice(0, 120) });
      loadState.done++; loadState.failed.push("map"); loadProgress();
    });
  }

  // ---------- dungeon entrances (WORLDSPEC §6) ----------
  // An entrance is a doorway in an OUTDOOR zone that leads into an instanced interior. It is a
  // separate interactable from a zone exit because it must be deliberate: a dungeon is a
  // committed trip, so the player presses the prompt rather than falling through a trigger the
  // way they do at a gateway.
  for (const de of ZONE.dungeonEntrances || []){
    const gy = groundY(de.x, de.z);
    const g = new THREE.Group(); scene.add(g);
    loadLandmarkModel('dungeon:' + de.id, de.model || './assets/models/dng_doorway.glb', g,
      { size: 7, fit: "height", x: de.x, z: de.z, ry: de.ry || 0 });
    // Procedural stand-in under the model, so the entrance is visible even if the GLB fails.
    const arch = add(new THREE.TorusGeometry(2.6, 0.5, 6, 14, Math.PI), mat(0x4a3a5a), de.x, gy + 0.2, de.z);
    arch.rotation.y = de.ry || 0;
    const maw = add(new THREE.CircleGeometry(2.4, 18), mat(0x0a0612), de.x, gy + 2.4, de.z, {cast:false});
    maw.rotation.y = (de.ry || 0) + Math.PI;
    register('dungeon', de.x, de.z, de.id, (opts.zoneNames && opts.zoneNames[de.id]) || de.id, arch, 6.0);
  }

  // ---------- hidden treasure (BACKLOG §3 "Hidden areas / treasure") ----------
  // A find, not a grind: a handful of authored, off-path caches per outdoor zone (structures.js
  // TREASURES for the academy; hand-authored in zones.json for the others). `opts.foundTreasures`
  // mirrors `opts.defeated` above — ids this save has already claimed simply never spawn, the same
  // "no re-farming a one-time thing" rule a dungeon boss kill already follows.
  const FOUND_TREASURE = new Set(opts.foundTreasures || []);
  const treasureGroups = {};
  for (const t of ZONE.treasures || []){
    if (FOUND_TREASURE.has(t.id)) continue;
    const gy = groundY(t.x, t.z);
    const g = new THREE.Group(); g.position.set(t.x, gy, t.z); scene.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.75), mat(0x6b4a2b));
    body.position.y = 0.35; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.3, 0.8), mat(0x8a6a3a));
    lid.position.y = 0.78; lid.castShadow = true; g.add(lid);
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffc94d));
    clasp.position.set(0, 0.55, 0.42); g.add(clasp);
    // A slow-spinning, bobbing glint so a cache reads as special from a distance — the same trick
    // the magic trees' emissive crown already uses to stand out from an ordinary one.
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(0xfff2c0));
    glint.material.emissive = srgb(0xffe08a); glint.material.emissiveIntensity = 0.85;
    glint.position.y = 1.35; g.add(glint);
    g.userData.glint = glint;
    treasureGroups[t.id] = g;
    register('treasure', t.x, t.z, t.id, "Hidden Cache", body, 4.6);
  }

  // ---------- enemies (dungeon rooms; outdoor zones stream theirs per chunk) ----------
  // `opts.defeated` is the set of enemy ids the save says are already dead. Without it every
  // dungeon enemy respawns the moment you walk back in, and the same slime can be fought
  // forever — the dungeon has no progression at all.
  const DEFEATED = new Set(opts.defeated || []);
  const enemyGroups = {};
  for (const en of ZONE.enemies || []){
    if (en.x == null) continue;                     // count-based: handled by chunk streaming
    if (en.id && DEFEATED.has(en.id)) continue;
    const g = new THREE.Group(); scene.add(g);
    enemyGroups[en.id || en.name] = g;
    loadLandmarkModel('enemy:' + (en.id || en.name), './assets/models/' + en.model, g,
      { size: en.size || 2.4, fit: "height", x: en.x, z: en.z, ry: Math.PI });
    if (en.boss){
      // The boss is the room's light source as well as its threat — a dark cave with an unlit
      // dragon in it reads as an empty room.
      const bl = new THREE.PointLight(0xff6a2a, 1.5, 46); bl.position.set(en.x, 5, en.z); scene.add(bl);
      g.userData.light = bl;
    }
    register('enemy', en.x, en.z, en.id || en.name,
      (en.boss ? '☠ ' : '') + en.name + ' (Lv ' + (en.level || 1) + ')', null, en.boss ? 7.0 : 4.6);
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
  // Tuned against the rescaled campus: close/low enough that the player reads clearly, far
  // enough back that the 9-10m halls and the 40m tower still tower over them. Pulled in with the
  // move to CHARACTER_HEIGHT — a taller character at the old distance just filled less of a
  // wider shot, which is not the same as looking bigger.
  let camYaw = 0, camDist = 9.0, camHeight = 4.0;
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
    else if (nearby.kind === 'dungeon') callbacks.onDungeon && callbacks.onDungeon(nearby.data);
    else if (nearby.kind === 'enemy') callbacks.onEnemy && callbacks.onEnemy(nearby.data);
    else if (nearby.kind === 'treasure') callbacks.onTreasure && callbacks.onTreasure(nearby.data);
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
    // touch joystick: screen Y is down-positive, but forward is negative mz — negate so pushing
    // the stick UP moves the player forward (away from the camera), not backward.
    mx += joy.x; mz -= joy.y;
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
      // MAP GEOMETRY IS SOLID (buildings / steep terrain). Same slide-along-wall behaviour so a
      // diagonal into a tower slides you around it instead of sticking or clipping through.
      if (mapBlocks(hit.x, hit.z)){
        const axisX = resolveCollisions(nx, player.position.z, PLAYER_RADIUS, ZONE_OBSTACLES);
        const axisZ = resolveCollisions(player.position.x, nz, PLAYER_RADIUS, ZONE_OBSTACLES);
        if (!mapBlocks(axisX.x, axisX.z) && !wet(axisX.x, axisX.z)) hit = axisX;
        else if (!mapBlocks(axisZ.x, axisZ.z) && !wet(axisZ.x, axisZ.z)) hit = axisZ;
        else hit = { x: player.position.x, z: player.position.z };
      }
      player.position.x = hit.x; player.position.z = hit.z;
      player.position.y = groundY(hit.x, hit.z);      // walk the heightmap (WORLDSPEC §5)
      updateChunks(false);
      // a tap-to-move target inside a building is unreachable — drop it instead of grinding
      if (tapSet && Math.hypot(hit.x-nx, hit.z-nz) > 0.001){
        stuckT += dt;
        if (stuckT > 0.5){ tapTarget = null; tapSet = false; stuckT = 0; if (window.__analytics) window.__analytics.track("movement", { event: "stuck", at: [Math.round(player.position.x), Math.round(player.position.z)] }); }
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
          const blocked = mapBlocks(wh.x, wh.z);          // map buildings/steep terrain
          n.mesh.position.x = wh.x; n.mesh.position.z = wh.z;
          n.mesh.position.y = groundY(wh.x, wh.z);
          n.mesh.rotation.y = Math.atan2(dx,dz);
          // walked into a wall (or a map building): pick a fresh destination rather than grinding
          if (blocked || Math.hypot(wh.x-wnx, wh.z-wnz) > 0.001){
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
              if (!mapBlocks(c2.x, c2.z) && (Math.hypot(c2.x-cx, c2.z-cz) < 0.001 || k===5)){ n.tx=c2.x; n.tz=c2.z; break; }
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
  // Map-geometry collision. The GLB maps' buildings/terrain aren't in ZONE_OBSTACLES (which only
  // knows the procedural boxes), so without these the camera pulls straight through a map tower
  // or sinks into a map hillside. Both are one raycast against the loaded map model.
  const mapModel = () => (chars.map && chars.map.model) || null;
  // Distance along a horizontal ray from the player's eye to the first map blocker (excl. water).
  function mapBlockDist(dirX, dirZ, maxDist){
    const m = mapModel(); if (!m || !maxDist) return maxDist;
    const o = new THREE.Vector3(player.position.x, player.position.y + 2.2, player.position.z);
    const ray = new THREE.Raycaster(o, new THREE.Vector3(dirX, 0, dirZ).normalize());
    ray.far = maxDist;
    const hits = ray.intersectObject(m, true);
    let d = maxDist;
    for (const h of hits){
      if ((h.object.name || "").toLowerCase().includes("water")) continue;
      if (h.distance < d) d = h.distance;
    }
    return d;
  }
  // Height of the map's walkable surface at (x, z), or -Infinity if not on the map.
  function mapSurfaceY(x, z){
    const m = mapModel(); if (!m) return -Infinity;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(m, true);
    for (const h of hits){
      if ((h.object.name || "").toLowerCase().includes("water")) continue;
      return h.point.y;
    }
    return -Infinity;
  }
  // Does the map block the player standing at (x, z)? True when the topmost surface there is
  // well above the walkable floor (a building/terrain step) OR (x,z) sits inside a building's
  // 2D footprint (so a hollow structure's interior also blocks, not just its elevated walls).
  function mapBlocks(x, z){
    const m = mapModel();
    // 1) footprint of a building structure
    if (m && mapObstacleBoxes.length){
      for (const b of mapObstacleBoxes){
        if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) return true;
      }
    }
    // 2) elevated surface (steep terrain / walls)
    if (m){
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(m, true);
      for (const h of hits){
        if ((h.object.name || "").toLowerCase().includes("water")) continue;
        return h.point.y > mapFloorY + 0.9;
      }
    }
    return false;
  }
  function updateCamera(dt){
    const px = player.position.x, pz = player.position.z, py = player.position.y;
    // CAMERA COLLISION. Without this the camera sits inside whatever is behind the player —
    // the arena canopy's black interior, a hall's backfaces — which is trivial to hit now that
    // buildings are 8-40m. Pull in to the first blocker along the ray.
    const want = Math.min(
      cameraDistanceLimit(px, pz, camYaw, camDist, ZONE_OBSTACLES, CAMERA_RADIUS),
      mapBlockDist(Math.sin(camYaw), Math.cos(camYaw), camDist)   // map buildings/terrain
    );
    const ox = Math.sin(camYaw)*want, oz = Math.cos(camYaw)*want;
    const cx = px + ox, cz = pz + oz;
    // Height is relative to the player's own ground, not absolute — on a slope an absolute Y
    // lets the player climb above the camera. Also stay clear of the terrain under the camera,
    // so it does not sink into a hillside behind them (procedural OR the GLB map's surface).
    // The more the camera is forced in, the higher it rises — so a blocked shot becomes a
    // look-down over the obstruction instead of a face full of wall.
    const pulled = Math.max(0, camDist - want) / Math.max(1, camDist);
    const y = Math.max(
      py + camHeight + pulled * camDist * 0.75,
      groundY(cx, cz) + 1.8,
      mapSurfaceY(cx, cz) + 1.8
    );
    _camTarget.set(cx, y, cz);
    // TIME-BASED SMOOTHING. The old fixed factor (0.12/frame) was frame-rate dependent — at low
    // fps the camera lagged so far it visibly swam, and during fast rotation it wove around the
    // target. Use an exponential ease so the follow is smooth and frame-rate independent: pull in
    // quickly when a collision forces it closer, ease back out at a moderate rate.
    const curDist = Math.hypot(camera.position.x - px, camera.position.z - pz);
    const k = want < curDist - 0.05 ? (1 - Math.exp(-dt * 22)) : (1 - Math.exp(-dt * 7));
    camera.position.lerp(_camTarget, k);
    // POST-STEP CORRECTION. The clamp above is computed for the *target* along the new yaw, but
    // easing back out leaves the camera somewhere between its old and new positions — and while
    // orbiting a building, both endpoints can be clear while the arc between them cuts straight
    // through the corner. That is the intermittent "camera inside geometry" this used to fail
    // on. Re-clamp where the camera ACTUALLY landed, along its own bearing from the player.
    const ax = camera.position.x - px, az = camera.position.z - pz;
    const aDist = Math.hypot(ax, az);
    if (aDist > 1e-4){
      const aYaw = Math.atan2(ax, az);
      const safe = Math.min(
        cameraDistanceLimit(px, pz, aYaw, aDist, ZONE_OBSTACLES, CAMERA_RADIUS),
        mapBlockDist(Math.sin(aYaw), Math.cos(aYaw), aDist)
      );
      if (safe < aDist){
        camera.position.x = px + Math.sin(aYaw) * safe;
        camera.position.z = pz + Math.cos(aYaw) * safe;
        camera.position.y = Math.max(camera.position.y, groundY(camera.position.x, camera.position.z) + 1.8,
          mapSurfaceY(camera.position.x, camera.position.z) + 1.8);
      }
    }
    // FINAL SAFETY NET. Both clamps above solve along the RAY from the player to the camera, and
    // that is the weakest possible geometry for a NEAR-TANGENT pass: brushing the side of a
    // circle barely changes the ray solution, so the camera can end a frame a few centimetres
    // inside an obstacle with the distance clamp seeing nothing wrong. Both intermittent failures
    // of the orbit check were exactly that — 8.56 and 8.69 from the tower's centre against a
    // clamp radius of 8.7, while orbiting the campus.
    //
    // So finish with the same resolver everything else uses: push the camera straight out of
    // whatever it is touching, perpendicular to the surface rather than along the ray. This runs
    // every frame and is a no-op in the overwhelmingly common case.
    const fixed = resolveCollisions(camera.position.x, camera.position.z, CAMERA_RADIUS, ZONE_OBSTACLES);
    camera.position.x = fixed.x; camera.position.z = fixed.z;
    // Always keep the camera above the map's surface too (a low eased position can sit under a hill
    // on a baked GLB map, which the procedural-terrain-only checks above don't know about).
    const ms = mapSurfaceY(camera.position.x, camera.position.z);
    if (ms > -Infinity) camera.position.y = Math.max(camera.position.y, ms + 1.8);
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
    for (const g of Object.values(treasureGroups)){
      g.userData.glint.rotation.y += dt * 1.4;
      g.userData.glint.position.y = 1.35 + Math.sin(now / 500) * 0.08;
    }
    stepAura(now / 1000);
    stepWandFx(now / 1000);
    updateLightCulling();
    updateDayNight();
    updateWeather(dt);
    updateEmote(now);
    updatePet(dt, now);
    if (sun && sun.castShadow){
      // Keep the sun's fixed offset from the player so its shadow frustum always covers the
      // area actually on screen, instead of only the zone origin the light was authored at.
      const px = player.position.x, pz = player.position.z;
      sun.position.set(px + 20, 40, pz + 14);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    }
    updateCamera(dt);
    if (skyGroup) skyGroup.position.copy(camera.position);   // keep the sky centered on the camera
    if (cloudGroup){                                        // drift clouds around the sky
      cloudGroup.rotation.y += dt * 0.012;
      for (const c of cloudGroup.children){
        c.userData.drift += dt * 0.6;
        c.position.y += Math.sin(c.userData.drift) * 0.25 * dt;   // gentle bob
      }
    }
    if (cloudShadow){                                   // project the drifting cloud shadows
      cloudShadow.tex.offset.x += dt * 0.0035;
      cloudShadow.tex.offset.y += dt * 0.0012;
      const px = player.position.x, pz = player.position.z;
      cloudShadow.mesh.position.set(px, groundY(px, pz) + 0.06, pz);
    }
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
      interior: !!ZONE.interior,
      dungeonEntrances: (ZONE.dungeonEntrances||[]).map(d=>({id:d.id,x:d.x,z:d.z})),
      treasures: (ZONE.treasures||[]).map(t=>({id:t.id,x:t.x,z:t.z})),
      treasuresRemaining: Object.keys(treasureGroups),
      dorm: ZONE.dormLayout ? { pieces: ZONE.dormLayout.pieces.length,
                                cases: (ZONE.dormLayout.cases||[]).filter(c=>c.card).length,
                                trophies: (ZONE.dormLayout.trophies||[]).length,
                                room: [ZONE.dormLayout.room.w, ZONE.dormLayout.room.d] } : null,
      rooms: (ZONE.rooms||[]).length,
      wallCount: (ZONE.obstacles||[]).filter(o=>String(o.id).startsWith("wall:")).length,
      nearbyKind: nearby ? nearby.kind : null,
      nearbyData: nearby ? nearby.data : null,
      raining: rainGroup ? rainGroup.visible : false,
      nearbyLabel: nearby ? nearby.label : null,
      npcs: (ZONE.npcs||[]).map(n=>({key:n.key, station:n.station, x:n.x, z:n.z})),
      enemies: Object.keys(enemyGroups).length,
      enemyList: (ZONE.enemies||[]).filter(e=>e.x!=null && enemyGroups[e.id||e.name]).map(e=>({id:e.id,x:e.x,z:e.z,boss:!!e.boss})),
      spawnClear: isClear(player.position.x, player.position.z, PLAYER_RADIUS, ZONE_OBSTACLES),
      inWater: wet(player.position.x, player.position.z),
      playerSize: (()=>{ if(!chars.player || !chars.player.model) return null; const m=chars.player.model; m.updateMatrixWorld(true); const b=new THREE.Box3().setFromObject(m); const s=b.getSize(new THREE.Vector3()); return {x:Math.round(s.x),y:Math.round(s.y),z:Math.round(s.z)}; })() };
  };
  return {
    // Draw one frame on demand. Reading the world canvas from a test is otherwise unreliable:
    // the drawing buffer is cleared after a composite, so a 2D drawImage of it comes back blank
    // and a dark scene is indistinguishable from a broken one. battle3d.js exposes the same hook
    // for the same reason.
    renderOnce(){ renderer.render(scene, camera); },
    setTouchMove(x, y){ joy.x = x; joy.y = y; },
    // Remembered, because this is usually called before the GLB finishes loading — and once
    // it loads, userData.robe is no longer in the scene, so writing only there was a no-op.
    setPlayerAppearance(look){
      appearance = look;
      applyPlayerAppearance();
    },
    // Equipped gear, resolved by equipment3d.js. Remembered like the appearance, because this is
    // usually called before the player GLB (and therefore its skeleton) has loaded.
    // Test hook: which bones the loaded player rig actually exposes. equipment3d.js validates its
    // table against this list, so a model swap that renames bones fails loudly instead of
    // silently showing no gear.
    gearDebug(){
      const out = {};
      for (const [slot, g] of Object.entries(gearGroups)){
        g.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(g);
        const size = b.isEmpty() ? null : b.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3));
        const ctr = b.isEmpty() ? null : b.getCenter(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2));
        let meshes = 0; g.traverse(o=>{ if(o.isMesh) meshes++; });
        out[slot] = { children: g.children.length, meshes, worldSize: size, worldCenter: ctr,
                      groupScale: +g.scale.x.toFixed(4) };
      }
      return out;
    },
    playerBones(){
      const pc = chars.player;
      if (!pc || !pc.model) return null;
      const out = [];
      pc.model.traverse(o => { if (o.isBone) out.push(o.name); });
      return out;
    },
    // BACKLOG §7 "Emotes" — trigger a gesture by id (see EMOTES above). Returns false for an
    // unknown id so a caller can distinguish "played" from "no such emote" without throwing.
    playEmote,
    emoteActive(){ return activeEmote ? activeEmote.def : null; },
    // BACKLOG §7 "Pets / familiars" — id from pets.js, or null/undefined to walk alone.
    setPet,
    petActive(){ return !!(petEntry && petEntry.model); },
    setPlayerGear(list){
      gearList = list || [];
      applyGear();
    },
    // BACKLOG §7 "Wand cosmetics" — id from wandcosmetics.js, or null/"none" for no effect.
    // Remembered like the appearance/gear: usually set before the wand's own gear group exists.
    setWandFx(id){
      wandFxId = id || DEFAULT_WAND_FX;
      buildWandFx();
    },
    wandFxDebug(){
      return wandFxGroup ? { id: wandFxId, motes: wandFxGroup.children.length } : { id: wandFxId, motes: 0 };
    },
    // Scene-complexity numbers straight from the renderer, not wall-clock frame time — wall-clock
    // is unusable for profiling in a software-rendered (no real GPU) test environment, but draw
    // calls / triangles / resident geometry & texture counts are hardware-independent and catch
    // the same class of problem (e.g. a scatter-dense zone generating an unreasonable number of
    // unbatched draw calls) without needing real hardware to measure it on.
    renderStats(){
      const i = renderer.info;
      // Counts `.visible` lights only — THREE's own light-collection pass does the same, so this
      // is what the shader actually receives this frame, not just what exists in the scene graph
      // (updateLightCulling hides far-away dungeon torch lights via `.visible`, not by removal).
      let lights = 0, lightsTotal = 0;
      scene.traverse(o => { if (o.isLight){ lightsTotal++; if (o.visible) lights++; } });
      return { drawCalls: i.render.calls, triangles: i.render.triangles,
        geometries: i.memory.geometries, textures: i.memory.textures,
        lights, lightsTotal };
    },
    // Show the equipped weapon on the player's right hand (visual equipment). `metal` is the
    // equipment's metal tier (bronze/iron/gold/mithril/rune) -> a matching weapon GLB; null hides it.
    setWeapon(metal){
      const WEAPON_VIS = { bronze:'wpn_wand_A.glb', iron:'wpn_staff_A.glb', gold:'wpn_staff_B.glb', mithril:'wpn_sword_A.glb', rune:'wpn_axe_A.glb' };
      const entry = chars['player'];
      if (!entry || !entry.model) return;
      // A real, pre-existing leak found during a polish pass: removing the mesh alone leaves its
      // geometry/textures resident on the GPU, so re-forging gear a few times in a session would
      // quietly leak VRAM. Same disposeModel() the pet-swap code uses (BACKLOG §7).
      if (entry.weaponMesh){ entry.weaponMesh.parent && entry.weaponMesh.parent.remove(entry.weaponMesh); disposeModel(entry.weaponMesh); entry.weaponMesh = null; }
      const file = metal && WEAPON_VIS[metal];
      if (!file) return;
      const hand = entry.bones['RightHand'];
      if (!hand) return;
      new THREE.GLTFLoader().load(modelUrl(file), gltf => {
        const m = gltf.scene;
        m.scale.setScalar(0.5);
        m.position.set(0.02, -0.05, 0.06);
        m.rotation.set(0, 0, -0.4);
        hand.add(m);
        entry.weaponMesh = m;
      });
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
      // A teleport into water or into a map building would strand/clip the player — keep them
      // where they are instead.
      if (wet(p.x, p.z) || mapBlocks(p.x, p.z)) return { x:player.position.x, y:player.position.y, z:player.position.z };
      player.position.x = p.x; player.position.z = p.z;
      player.position.y = groundY(p.x, p.z);   // land on the surface, not at y=0
      tapTarget = null; tapSet = false;
      return { x:p.x, y:player.position.y, z:p.z };
    },
    // Remove a defeated enemy in place. Rebuilding the whole zone after every fight would be
    // both slow and jarring (it would re-run the loading HUD and reset the camera).
    removeEnemy(id){
      const g = enemyGroups[id];
      if (!g) return false;
      if (g.userData.light) scene.remove(g.userData.light);
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) if (m && m.dispose) m.dispose();
      });
      scene.remove(g);
      delete enemyGroups[id];
      // drop its prompt, and its collision if it had one (bosses do)
      for (let i = interactives.length - 1; i >= 0; i--)
        if (interactives[i].kind === 'enemy' && interactives[i].data === id) interactives.splice(i, 1);
      const oi = ZONE_OBSTACLES.findIndex(o => o.id === 'boss:' + String(id).split(':')[0]);
      if (oi >= 0) ZONE_OBSTACLES.splice(oi, 1);
      if (nearby && nearby.kind === 'enemy' && nearby.data === id){
        nearby = null;
        callbacks.onNearby && callbacks.onNearby(null);
      }
      return true;
    },
    // Remove a claimed treasure in place, the same shape removeEnemy already uses — a cache is
    // a one-time find, so it must vanish the instant it's opened, not linger until the next zone
    // rebuild pretending it can still be found.
    removeTreasure(id){
      const g = treasureGroups[id];
      if (!g) return false;
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) if (m && m.dispose) m.dispose();
      });
      scene.remove(g);
      delete treasureGroups[id];
      for (let i = interactives.length - 1; i >= 0; i--)
        if (interactives[i].kind === 'treasure' && interactives[i].data === id) interactives.splice(i, 1);
      if (nearby && nearby.kind === 'treasure' && nearby.data === id){
        nearby = null;
        callbacks.onNearby && callbacks.onNearby(null);
      }
      return true;
    },
    // Exposes the SAME ground-height function the engine itself uses to place the player —
    // whichever source that is for this zone (procedural heightAt, or a baked GLB map's real
    // surface via mapSurfaceY, see ZONE_MAPS in worldconfig.js). Lets tests verify "does the
    // player actually ride the ground" without duplicating — and risking drifting from — the
    // engine's own height-source decision.
    groundYAt(x, z){ return groundY(x, z); },
    resize(){ onResize(); },
    // Every zone change is dispose() then a brand-new createWorld() — a new THREE.Scene, but the
    // SAME canvas, and browsers hand getContext() back the SAME WebGL context rather than
    // allocating a fresh one. That means this zone's entire procedural scene graph (walls,
    // floors, buildings, the ground plane, every canvas-baked texture, chunk-streamed props still
    // loaded, gear/pet/wand-fx groups — everything that isn't reached by one of the few targeted
    // dispose() calls elsewhere in this file, e.g. setPet/removeTreasure/unloadChunk) previously
    // just got dereferenced, not freed: THREE never auto-frees GPU buffers when a JS object is
    // GC'd, only when .dispose() is called on it. A real profiling pass (20 zone hops via
    // fastTravel, the same path a player uses) measured this directly: JS heap grew from 74MB at
    // boot to 633MB after those 20 hops, unbounded — every visit's geometry stacking on the last.
    // Traversing the whole scene here, once, on real teardown, is the fix: same
    // geometry/material/texture disposal pattern already used piecemeal elsewhere, just applied
    // to everything instead of a handful of call sites.
    dispose(){
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      const MAP_SLOTS = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap',
        'alphaMap','bumpMap','displacementMap','lightMap','specularMap'];
      const disposeMaterial = m => {
        if (!m) return;
        for (const slot of MAP_SLOTS) if (m[slot] && m[slot].dispose) m[slot].dispose();
        if (m.dispose) m.dispose();
      };
      scene.traverse(o => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) disposeMaterial(m);
      });
      // Not reached by the traversal above: textures set directly on the scene rather than on a
      // mesh's material (the sky gradient, the environment reflection map). The cloud-shadow
      // texture IS on a mesh's material (cloudShadow.mesh), so the traversal already frees it.
      if (scene.background && scene.background.isTexture) scene.background.dispose();
      if (scene.environment && scene.environment.dispose) scene.environment.dispose();
      renderer.dispose();
    },
  };
}