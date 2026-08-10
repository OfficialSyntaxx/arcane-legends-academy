// Buildings, solid obstacles, and the collision resolver — as data + pure functions.
//
// Same reasoning as nodes.js: world.js needs THREE and a canvas, so anything defined inside it
// can never be checked headlessly. Keeping the layout and the collision maths here means
// tools/test.mjs can assert that the world is actually walkable — that no station prompt is
// sealed inside a wall, that spawn isn't inside a rock, and that the resolver never pushes the
// player through a building instead of out of it.
//
// Coordinates match the meshes world.js builds from these tables.

// ---------------------------------------------------------------- buildings
// `face` is the direction the door points; the station prompt sits just outside that face so
// the player can actually reach it once the building is solid.
// SCALE: 1 world unit = 1 metre, anchored on the character height in world.js (1.8 = an adult).
// Buildings were 3.5-5.5 units tall against 1.8-unit wizards — a "hall" barely 2.5 people high,
// which is what made the campus read as a model village. Halls are now 7-10m tall and 12-16m
// wide (4-5 people tall, the proportion a real hall has), and the layout is spread to match so
// the buildings have room to feel big. Any generated building model should be authored to these
// footprints.
// A building with a `model` loads that GLB in place of the procedural box. Its w/d are then the
// model's REAL footprint at its target height (not the authored guess) so collision matches what
// the player sees — the same rule the tower follows. `modelRy` rotates the mesh only, to point
// its door at the `face` direction, without moving the collision box.
// ART DIRECTION (decided Aug 2026): the everyday campus is CC0 KayKit — one consistent
// flat-shaded style, free, already imported. The two HERO LANDMARKS (Central Tower, Duel Arena)
// are the richer generated Tripo models, because they are what the campus silhouette is built
// around. See docs/DESIGN-DECISIONS.md.
//
// `model` is a path relative to public/. `w`/`d`/`h` are the model's REAL size at its target
// height (measured from its own bounding box), not an authored guess — collision must match what
// the player sees. `modelRy` rotates the mesh only, to point its door at `face`.
export const BUILDINGS = [
  { id:"scribe",  label:"Scribing Hall",   x:-31, z:-14, w:6.9,  d:7.7,  h:11, ry:0.3,  wall:0x6a5b9e, roof:0x2a1f4d, face:"z+",
    model:"./assets/models/hex_church.glb", modelRy:0 },
  { id:"library", label:"Library",         x:-31, z:12,  w:7.9,  d:9.1,  h:16, ry:-0.3, wall:0x5a4a8a, roof:0x2a1f4d, face:"z+", noStation:true,
    model:"./assets/models/hex_castle.glb", modelRy:0 },
  { id:"smith",   label:"Smithy & Forge",  x:31,  z:-14, w:10.5, d:10.1, h:8,  ry:-0.3, wall:0x7a5a6a, roof:0x8a3a2a, face:"z+",
    model:"./assets/models/hex_blacksmith.glb", modelRy:0 },
  { id:"market",  label:"Merchant Stall",  x:31,  z:12,  w:12.8, d:9.4,  h:7,  ry:0.3,  wall:0x8a6a3a, roof:0x2f6f4f, face:"z-",
    model:"./assets/models/hex_market.glb", modelRy:0 },
  // `interior` makes a building a PLACE you walk into rather than a menu you open. It is a
  // generic field, not a dorm special case, because docs/DESIGN-DECISIONS.md §1 wants the same
  // for the Scribing Hall and Smithy — the two buildings players actually spend time in. The
  // value names an interior zone; index.html enters it instead of switching `screen`.
  { id:"home",    label:"Student Dorms",   x:0,   z:32,  w:6.8,  d:7.3,  h:8,  ry:0,    wall:0x6a5b9e, roof:0x2f4f8a, face:"z-",
    model:"./assets/models/hex_home_A.glb", modelRy:0, interior:"dorm" },
  { id:"tavern",  label:"The Rested Quill", x:-16, z:26, w:7.6,  d:8.6,  h:9,  ry:0.5,  wall:0x8a6a3a, roof:0x8a3a2a, face:"z-", noStation:true,
    model:"./assets/models/hex_tavern.glb", modelRy:0 },
];

/** The interior zone a station leads into, or null if that station opens a screen instead. */
export function interiorFor(stationId){
  const b = BUILDINGS.find(x => x.id === stationId);
  return (b && b.interior) || null;
}

// How far outside a building's face its station prompt sits.
export const DOOR_OFFSET = 3.0;
export function doorPos(b){
  const half = (b.face === "z+" || b.face === "z-") ? b.d/2 : b.w/2;
  const out = half + DOOR_OFFSET;
  switch (b.face){
    case "z+": return { x:b.x, z:b.z + out };
    case "z-": return { x:b.x, z:b.z - out };
    case "x+": return { x:b.x + out, z:b.z };
    default:   return { x:b.x - out, z:b.z };
  }
}

// ---------------------------------------------------------------- landmarks
// Standalone generated models that aren't "buildings" with doors. `fit` picks which dimension
// `size` refers to: "height" for things whose height defines them (the tower), "width" for
// things whose FOOTPRINT is the gameplay-relevant dimension (the arena — its floor is the duel
// space, so the diameter is what must be right; the height follows from the model's proportions).
export const LANDMARKS = [
  { key:"tower", url:"./assets/buildings/tower.glb", x:0, z:0,   ry:0, fit:"height", size:40 },
  { key:"arena", url:"./assets/buildings/arena.glb", x:0, z:-32, ry:0, fit:"width",  size:25 },
];

// Decorative / world-dressing GLBs (all CC0 — see ASSETS.md). `solid` gives a collision radius;
// anything the player should be able to walk past is left non-solid on purpose.
export const PROPS = [
  // dungeon corner + its PvE skeleton
  { url:"./assets/models/dng_doorway.glb",  x:44, z:-44, h:8,   ry:0.4, solid:2.6 },
  { url:"./assets/models/dng_torch.glb",    x:47, z:-40, h:3.2, ry:0 },
  { url:"./assets/models/enemy_skeleton.glb", x:44, z:-50, h:1.9, ry:2.6, key:"skeleton" },
  // library dressing, outside the Library's north face
  { url:"./assets/models/fur_book_set.glb",   x:-27, z:19,   h:1.8, ry:0.2 },
  { url:"./assets/models/fur_armchair.glb",   x:-25, z:20,   h:1.5, ry:-0.6 },
  { url:"./assets/models/fur_lamp_standing.glb", x:-23.5, z:19, h:2.6, ry:0 },
  // dorm dressing
  { url:"./assets/models/fur_bed_single_A.glb", x:5,  z:31,  h:1.1, ry:1.57 },
  { url:"./assets/models/fur_chair_A.glb",      x:4,  z:28,  h:1.6, ry:0.4 },
  // CC0 KayKit Adventures mage (76 animations) — stands near the Library as a spell tutor.
  // Decorative for now: giving it a station would duplicate the Trainer's practice-duel role.
  { url:"./assets/models/npc_mage.glb", x:-24, z:6, h:1.9, ry:2.2, key:"mage" },
  // nature dressing
  { url:"./assets/models/nat_CommonTree_1.glb", x:24, z:26,  h:8.5, ry:0.3, solid:1.3 },
  { url:"./assets/models/nat_CommonTree_1.glb", x:-20, z:-30, h:9.5, ry:1.9, solid:1.4 },
  { url:"./assets/models/nat_Mushroom_Common.glb", x:20, z:30, h:1.2, ry:0 },
  { url:"./assets/models/nat_Flower_3_Single.glb", x:-14, z:20, h:0.8, ry:0 },
];

// ---------------------------------------------------------------- NPCs
// Positions live here so tools/test.mjs can prove none of them is standing inside a wall —
// which, before collision existed, several of them were.
export const NPCS = [
  { key:"quest",     role:"quest",     station:"quests",    label:"Professor — Quests",   x:-22,   z:17,    main:0x9aa0b8, hat:0x2a1f4d, orb:0xffc94d, model:"professor.glb" },
  { key:"market",    role:"market",    station:"market",    label:"Merchant",             x:22,    z:19,    main:0x8a6a3a, hat:0x8a3a2a, orb:0xffd766, model:"merchant.glb" },
  { key:"duel",      role:"duel",      station:"duel",      label:"Referee — Duel",       x:9,     z:-21, main:0x4a3a7a, hat:0x2a1f4d, orb:0xff6b6b, model:"referee.glb" },
  { key:"trainer",   role:"trainer",   station:"trainer",   label:"Trainer — Practice",   x:17,    z:24,    main:0x3a6bd8, hat:0x8a3a2a, orb:0xffd766, model:"trainer.glb" },
  { key:"librarian", role:"librarian", station:"librarian", label:"Librarian — Lore",     x:-31,   z:22,    main:0x6a5b9e, hat:0x2a1f4d, orb:0x7be0ff, model:"librarian.glb" },
];

// ---------------------------------------------------------------- hidden treasure (BACKLOG §3)
// Off the beaten path — away from the tower/arena/NPCs, not on the paths a new player is guided
// down — so finding one rewards actually exploring the corners of the hub rather than the route
// the onboarding chain already walks a player through. Ids are globally unique across every zone
// (worldconfig.js's `validateTreasureIds` enforces it) because a found treasure is recorded as one
// flat id in the save (`s.worldState.treasuresFound`), not nested per-zone like a dungeon kill is.
export const TREASURES = [
  { id:"academy_grove_cache", x:-50, z:40 },
  { id:"academy_cliff_cache", x:55, z:-50 },
  { id:"academy_courtyard_cache", x:-45, z:-45 },
];
export const WANDERERS = [
  { key:"wander0", main:0x3ddc84, hat:0xff6b6b, model:"student_emerald.glb" },
  { key:"wander1", main:0xa06bff, hat:0x2a1f4d, model:"student_violet.glb" },
  { key:"wander2", main:0xff9ecb, hat:0x8a3a2a, model:"student_pink.glb" },
  { key:"wander3", main:0xffc94d, hat:0x2a1f4d, model:"student_gold.glb" },
];
// In the open courtyard lane, off the z axis. Two reasons this is not (0, 12):
//  - that sat right on the Student Dorms door, so the game opened with a station prompt already up;
//  - the follow camera starts behind the player at +z, and anything on the z axis south of the
//    dorms means the camera looks straight through that building on the first frame.
// Also kept clear of the Trainer's 3.2-unit prompt radius.
export const PLAYER_SPAWN = { x:13, z:15 };

// ---------------------------------------------------------------- obstacles
// box: axis-aligned half-extents in the box's own frame, rotated by ry about its centre.
// circle: a plain radius. Ponds are deliberately NOT solid — you stand in the shallows to fish.
export const PLAYER_RADIUS = 0.5;
// Every character GLB is normalised to this height (WORLDSPEC: 1 unit = 1 metre).
//
// It was 1.8 — anatomically right, and it made the cast look like miniatures. Two reasons. The
// normalisation measures the model's FULL bounding box, and these wizards wear pointed hats worth
// ~28% of that box, so a "1.8m" wizard is a 1.3m person in a tall hat. And the world around them
// is not built to human scale: the halls are 9-10m and the tower is 40m, so a realistic figure
// reads as a doll next to them. 2.6 is a deliberately heroic scale that matches the reference
// (Wizard101 characters are large relative to their architecture).
export const CHARACTER_HEIGHT = 2.6;
export const WORLD_BOUND = 72;      // half-extent of the walkable area

export const OBSTACLES = [
  ...BUILDINGS.map(b => ({ kind:"box", x:b.x, z:b.z, w:b.w, d:b.d, ry:b.ry, id:b.id })),
  // matches the generated arena model at its 25m-wide target (see LANDMARKS), plus a margin
  { kind:"circle", x:0,  z:-32, r:13.0, id:"arena" },
  // radius matches the generated tower model (public/assets/buildings/tower.glb) scaled to its
  // 40m target height — the model's widest footprint (base/roof brim) comes out to ~7.86m half-
  // extent at that scale, so this is that plus a small margin, not the old procedural cylinder's.
  { kind:"circle", x:0,  z:0,   r:8.2,  id:"tower" },
  { kind:"circle", x:0,  z:-18, r:5.6,  id:"fountain" },
];
// solid props contribute collision too
for (const p of PROPS) if (p.solid) OBSTACLES.push({ kind:"circle", x:p.x, z:p.z, r:p.solid, id:"prop:"+p.url.split("/").pop() });
// the tree ring — generated to match the meshes world.js places
export const TREE_RING = [];
for (let i=0;i<18;i++){
  const a = (i/18)*Math.PI*2, r = 60 + (i%3)*4, sc = 1.6 + (i%4)*0.6;
  TREE_RING.push({ x:Math.cos(a)*r, z:Math.sin(a)*r, s:sc });
  OBSTACLES.push({ kind:"circle", x:Math.cos(a)*r, z:Math.sin(a)*r, r:0.45*sc, id:"tree"+i });
}

// ---------------------------------------------------------------- resolver
// Push a point out of any obstacle it overlaps. Returns the corrected position.
// Depenetration (rather than blocking the move outright) is what lets the player slide along a
// wall instead of sticking to it, which matters a lot with a joystick.
export function resolveCollisions(x, z, radius = PLAYER_RADIUS, obstacles = OBSTACLES){
  for (let pass = 0; pass < 2; pass++){          // 2 passes settles corner cases cleanly
    let moved = false;
    for (const o of obstacles){
      if (o.kind === "circle"){
        const dx = x - o.x, dz = z - o.z;
        const need = o.r + radius;
        let d = Math.hypot(dx, dz);
        if (d < need){
          if (d < 1e-6){ x = o.x + need; z = o.z; }   // dead centre: shove along +x
          else { x = o.x + (dx/d)*need; z = o.z + (dz/d)*need; }
          moved = true;
        }
      } else {
        // into the box's local frame
        const cos = Math.cos(-o.ry), sin = Math.sin(-o.ry);
        const rx = (x - o.x)*cos - (z - o.z)*sin;
        const rz = (x - o.x)*sin + (z - o.z)*cos;
        const hx = o.w/2 + radius, hz = o.d/2 + radius;
        if (rx > -hx && rx < hx && rz > -hz && rz < hz){
          // push out along the axis with the shallowest penetration
          const px = hx - Math.abs(rx), pz = hz - Math.abs(rz);
          let nx = rx, nz = rz;
          if (px < pz) nx = rx >= 0 ? hx : -hx;
          else         nz = rz >= 0 ? hz : -hz;
          const bc = Math.cos(o.ry), bs = Math.sin(o.ry);
          x = o.x + nx*bc - nz*bs;
          z = o.z + nx*bs + nz*bc;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

// ---------------------------------------------------------------- camera
// How far the follow camera may sit behind the player before something solid gets between them.
// The camera had no collision at all: standing near a large building and rotating put it INSIDE
// the geometry — the black interior of the arena canopy, the backfaces of a hall. Survivable when
// everything was small procedural boxes; easy to trigger with 22-40m models, and terrain makes it
// worse because hills occlude too.
//
// Pure, so tools/test.mjs can assert it without a browser. March out along the camera ray and
// stop at the first blocked sample.
// The check radius is the PLAYER's, not a larger camera radius: the guarantee we need is that a
// fully pulled-in camera is somewhere the player could stand. With a bigger radius the minimum
// fallback could still be inside geometry — which it was, next to the fountain.
export const CAMERA_RADIUS = PLAYER_RADIUS;
export const CAMERA_MIN_DIST = 1.2;

export function cameraDistanceLimit(px, pz, yaw, desired, obstacles = OBSTACLES, radius = CAMERA_RADIUS){
  const ox = Math.sin(yaw), oz = Math.cos(yaw);
  const STEP = 0.4;
  let last = 0;
  for (let d = STEP; d <= desired; d += STEP){
    if (!isClear(px + ox * d, pz + oz * d, radius, obstacles)){
      const pulled = last - 0.25;
      // If even the minimum is blocked, sit ON the player — that spot is clear by construction,
      // because the player's own movement is collision-resolved. world.js lifts the camera as it
      // pulls in, so this reads as rising over the obstruction rather than clipping through it.
      if (pulled < CAMERA_MIN_DIST) return isClear(px + ox * CAMERA_MIN_DIST, pz + oz * CAMERA_MIN_DIST, radius, obstacles) ? CAMERA_MIN_DIST : 0;
      return pulled;
    }
    last = d;
  }
  return desired;
}

// Is a point clear of every obstacle? Used by the tests to prove the world is walkable.
export function isClear(x, z, radius = PLAYER_RADIUS, obstacles = OBSTACLES){
  const r = resolveCollisions(x, z, radius, obstacles);
  return Math.abs(r.x - x) < 1e-9 && Math.abs(r.z - z) < 1e-9;
}
