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
export const BUILDINGS = [
  { id:"scribe",  label:"Scribing Hall",   x:-31, z:-14, w:15, d:11, h:10.5, ry:0.3,  wall:0x6a5b9e, roof:0x2a1f4d, face:"z+" },
  { id:"library", label:"Library",         x:-31, z:12,  w:13, d:11, h:9,    ry:-0.3, wall:0x5a4a8a, roof:0x2a1f4d, face:"z+", noStation:true },
  { id:"smith",   label:"Smithy & Forge",  x:31,  z:-14, w:15, d:11, h:9,    ry:-0.3, wall:0x7a5a6a, roof:0x8a3a2a, face:"z+" },
  { id:"market",  label:"Merchant Stall",  x:31,  z:12,  w:13, d:9,  h:7,    ry:0.3,  wall:0x8a6a3a, roof:0x2f6f4f, face:"z-" },
  { id:"home",    label:"Student Dorms",   x:0,   z:32,  w:15, d:11, h:9,    ry:0,    wall:0x6a5b9e, roof:0x2f4f8a, face:"z-" },
];

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
export const WORLD_BOUND = 72;      // half-extent of the walkable area

export const OBSTACLES = [
  ...BUILDINGS.map(b => ({ kind:"box", x:b.x, z:b.z, w:b.w, d:b.d, ry:b.ry, id:b.id })),
  { kind:"circle", x:0,  z:-32, r:12.6, id:"arena" },
  // radius matches the generated tower model (public/assets/buildings/tower.glb) scaled to its
  // 40m target height — the model's widest footprint (base/roof brim) comes out to ~7.86m half-
  // extent at that scale, so this is that plus a small margin, not the old procedural cylinder's.
  { kind:"circle", x:0,  z:0,   r:8.2,  id:"tower" },
  { kind:"circle", x:0,  z:-18, r:5.6,  id:"fountain" },
];
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

// Is a point clear of every obstacle? Used by the tests to prove the world is walkable.
export function isClear(x, z, radius = PLAYER_RADIUS, obstacles = OBSTACLES){
  const r = resolveCollisions(x, z, radius, obstacles);
  return Math.abs(r.x - x) < 1e-9 && Math.abs(r.z - z) < 1e-9;
}
