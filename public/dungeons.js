// dungeons.js — instanced interiors (WORLDSPEC §6, step 5).
//
// PURE (no THREE, no DOM), like terrain.js / worldconfig.js / structures.js, so tools/test.mjs can
// validate every dungeon headlessly. `world.js` consumes a laid-out dungeon from here; it never
// works out where a room or a wall goes.
//
// THE KEY DESIGN DECISION: a dungeon is expressed as a ZONE. Step 4 already knows how to tear the
// world down, build another one, drop the player at the far side of a gateway and persist which
// zone they are in — so rather than a parallel "instance" system with its own enter/exit/suspend
// path, `dungeonZone()` compiles a dungeon config into exactly the zone shape `world.js` already
// renders: bounds, flat terrain, obstacles, props, enemies, exits. Entering a dungeon is a zone
// transition, and everything step 4 tested (mutual reachability, no ping-pong, saved position)
// applies for free.
//
// What a dungeon adds on top of a zone is `rooms`: rectangles on a grid, joined by corridors,
// whose walls become collision boxes and whose floors become meshes.

import { chunkKey } from "./worldconfig.js";

export const DUNGEON_DEFAULTS = {
  wallThickness: 1.2,
  wallHeight: 7,
  corridorWidth: 5,
  margin: 24,            // empty space between the outermost room and the zone bounds
};

/** Half-extents of a room, as a rectangle centred on its own x/z. */
function rect(room){
  return { minX: room.x - room.w / 2, maxX: room.x + room.w / 2,
           minZ: room.z - room.d / 2, maxZ: room.z + room.d / 2 };
}

export function roomsOverlap(a, b, gap = 0){
  const ra = rect(a), rb = rect(b);
  return ra.minX - gap < rb.maxX && ra.maxX + gap > rb.minX &&
         ra.minZ - gap < rb.maxZ && ra.maxZ + gap > rb.minZ;
}

/**
 * Which rooms can be reached from the spawn room by following `connections`.
 * A dungeon with an unreachable room is a dungeon with content nobody will ever see — and if the
 * BOSS is the unreachable one it cannot be completed at all, so this is validated, not assumed.
 */
export function reachableRooms(dungeon){
  const byId = new Map(dungeon.rooms.map(r => [r.id, r]));
  const adj = new Map(dungeon.rooms.map(r => [r.id, []]));
  for (const c of dungeon.connections || []){
    if (adj.has(c.from)) adj.get(c.from).push(c.to);
    if (adj.has(c.to)) adj.get(c.to).push(c.from);      // corridors are walkable both ways
  }
  const start = dungeon.spawnRoom || (dungeon.rooms[0] && dungeon.rooms[0].id);
  const seen = new Set(start && byId.has(start) ? [start] : []);
  const queue = [...seen];
  while (queue.length){
    for (const next of adj.get(queue.pop()) || []){
      if (!seen.has(next) && byId.has(next)){ seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

/**
 * A corridor between two rooms, as an axis-aligned rectangle spanning the gap between them.
 *
 * Rooms are placed on a grid and connected orthogonally, so a corridor is always either a
 * horizontal or a vertical band. Returns null when the rooms already touch (nothing to bridge) or
 * when they do not overlap on either axis, which `validateDungeon` reports as a bad connection
 * rather than silently drawing a diagonal the collision boxes could not represent.
 */
export function corridorBetween(a, b, width){
  const ra = rect(a), rb = rect(b);
  const w = width || DUNGEON_DEFAULTS.corridorWidth;
  // overlap on Z means they sit side by side, so the corridor runs along X
  const zLo = Math.max(ra.minZ, rb.minZ), zHi = Math.min(ra.maxZ, rb.maxZ);
  if (zHi - zLo >= w){
    const [left, right] = ra.maxX <= rb.minX ? [ra, rb] : [rb, ra];
    const gap = right.minX - left.maxX;
    if (gap <= 0) return null;
    const z = (zLo + zHi) / 2;
    return { axis: "x", x: left.maxX + gap / 2, z, w: gap, d: w };
  }
  const xLo = Math.max(ra.minX, rb.minX), xHi = Math.min(ra.maxX, rb.maxX);
  if (xHi - xLo >= w){
    const [near, far] = ra.maxZ <= rb.minZ ? [ra, rb] : [rb, ra];
    const gap = far.minZ - near.maxZ;
    if (gap <= 0) return null;
    const x = (xLo + xHi) / 2;
    return { axis: "z", x, z: near.maxZ + gap / 2, w, d: gap };
  }
  return null;
}

/**
 * The wall segments around a room, minus the doorways its corridors punch through.
 *
 * Each side is emitted as up to two boxes (the stretch either side of a doorway) rather than one
 * box with a hole, because collision is box-based: a single wall box across a doorway would seal
 * the room and strand the player, which is exactly the failure this splitting exists to avoid.
 */
export function wallsForRoom(room, corridors, opts = {}){
  const t = opts.wallThickness || DUNGEON_DEFAULTS.wallThickness;
  const r = rect(room);
  const out = [];
  const sides = [
    { id: "n", along: "x", fixed: r.maxZ, lo: r.minX, hi: r.maxX },
    { id: "s", along: "x", fixed: r.minZ, lo: r.minX, hi: r.maxX },
    { id: "e", along: "z", fixed: r.maxX, lo: r.minZ, hi: r.maxZ },
    { id: "w", along: "z", fixed: r.minX, lo: r.minZ, hi: r.maxZ },
  ];
  for (const side of sides){
    // doorways: every corridor that meets this side, as [lo, hi] spans along the side
    const doors = [];
    for (const c of corridors){
      const cr = rect({ x: c.x, z: c.z, w: c.w, d: c.d });
      if (side.along === "x"){
        if (Math.abs(side.fixed - cr.minZ) > 0.01 && Math.abs(side.fixed - cr.maxZ) > 0.01) continue;
        doors.push([cr.minX, cr.maxX]);
      } else {
        if (Math.abs(side.fixed - cr.minX) > 0.01 && Math.abs(side.fixed - cr.maxX) > 0.01) continue;
        doors.push([cr.minZ, cr.maxZ]);
      }
    }
    doors.sort((a, b) => a[0] - b[0]);
    let cursor = side.lo;
    const pieces = [];
    for (const [dLo, dHi] of doors){
      if (dLo > cursor) pieces.push([cursor, Math.min(dLo, side.hi)]);
      cursor = Math.max(cursor, dHi);
    }
    if (cursor < side.hi) pieces.push([cursor, side.hi]);
    for (const [lo, hi] of pieces){
      if (hi - lo < 0.05) continue;
      const mid = (lo + hi) / 2, len = hi - lo;
      out.push(side.along === "x"
        ? { x: mid, z: side.fixed, w: len, d: t, id: `${room.id}:${side.id}` }
        : { x: side.fixed, z: mid, w: t, d: len, id: `${room.id}:${side.id}` });
    }
  }
  return out;
}

/** Fill in defaults and compute every derived piece of a dungeon: corridors, walls, bounds. */
export function layoutDungeon(raw){
  const d = { ...DUNGEON_DEFAULTS, ...raw };
  d.rooms = (raw.rooms || []).map(r => ({ ...r }));
  d.connections = raw.connections || [];
  d.spawnRoom = raw.spawnRoom || (d.rooms[0] && d.rooms[0].id);

  const byId = new Map(d.rooms.map(r => [r.id, r]));
  d.corridors = [];
  for (const c of d.connections){
    const a = byId.get(c.from), b = byId.get(c.to);
    if (!a || !b) continue;
    const seg = corridorBetween(a, b, c.width || d.corridorWidth);
    if (seg) d.corridors.push({ ...seg, from: c.from, to: c.to });
  }
  for (const r of d.rooms) r.walls = wallsForRoom(r, d.corridors.filter(c => c.from === r.id || c.to === r.id), d);

  // Corridors need side walls too, or the player walks out of the corridor into the void.
  d.corridorWalls = [];
  for (const c of d.corridors){
    const t = d.wallThickness;
    if (c.axis === "x"){
      d.corridorWalls.push({ x: c.x, z: c.z - c.d / 2, w: c.w, d: t, id: "corridor" },
                           { x: c.x, z: c.z + c.d / 2, w: c.w, d: t, id: "corridor" });
    } else {
      d.corridorWalls.push({ x: c.x - c.w / 2, z: c.z, w: t, d: c.d, id: "corridor" },
                           { x: c.x + c.w / 2, z: c.z, w: t, d: c.d, id: "corridor" });
    }
  }

  const xs = d.rooms.flatMap(r => [rect(r).minX, rect(r).maxX]);
  const zs = d.rooms.flatMap(r => [rect(r).minZ, rect(r).maxZ]);
  d.bounds = {
    minX: Math.min(...xs) - d.margin, maxX: Math.max(...xs) + d.margin,
    minZ: Math.min(...zs) - d.margin, maxZ: Math.max(...zs) + d.margin,
  };
  const spawnRoom = byId.get(d.spawnRoom) || d.rooms[0];
  d.spawn = raw.spawn || (spawnRoom ? { x: spawnRoom.x, z: spawnRoom.z } : { x: 0, z: 0 });
  return d;
}

/** Problems with a dungeon, human-readable. Same contract as validateZone: a list, never a throw. */
export function validateDungeon(d, opts = {}){
  const problems = [];
  if (!d.id) problems.push("dungeon has no id");
  if (!d.name) problems.push(`${d.id}: no name`);
  if (!d.rooms.length) return problems.concat(`${d.id}: no rooms`);

  const ids = new Set();
  for (const r of d.rooms){
    if (!r.id) problems.push(`${d.id}: a room has no id`);
    if (ids.has(r.id)) problems.push(`${d.id}: duplicate room id "${r.id}"`);
    ids.add(r.id);
    if (!(r.w > 0 && r.d > 0)) problems.push(`${d.id}/${r.id}: room must have a positive size`);
  }
  for (let i = 0; i < d.rooms.length; i++){
    for (let j = i + 1; j < d.rooms.length; j++){
      // Rooms must not touch either: two rooms sharing a wall line would emit overlapping wall
      // boxes and the seam between them collides unpredictably.
      if (roomsOverlap(d.rooms[i], d.rooms[j], d.wallThickness))
        problems.push(`${d.id}: rooms "${d.rooms[i].id}" and "${d.rooms[j].id}" overlap`);
    }
  }
  for (const c of d.connections){
    if (!ids.has(c.from) || !ids.has(c.to)){
      problems.push(`${d.id}: connection ${c.from} -> ${c.to} names a room that does not exist`);
      continue;
    }
    if (!d.corridors.some(x => x.from === c.from && x.to === c.to))
      problems.push(`${d.id}: ${c.from} -> ${c.to} could not be joined by a straight corridor (rooms must line up on an axis and be at least corridorWidth wide where they face each other)`);
  }
  const reach = reachableRooms(d);
  const orphans = d.rooms.filter(r => !reach.has(r.id)).map(r => r.id);
  if (orphans.length) problems.push(`${d.id}: rooms unreachable from the spawn: ${orphans.join(", ")}`);

  const bossRooms = d.rooms.filter(r => r.boss);
  if (!bossRooms.length) problems.push(`${d.id}: no boss room`);
  for (const r of bossRooms) if (!reach.has(r.id)) problems.push(`${d.id}: the boss room "${r.id}" cannot be reached`);

  // everything placed must be inside its own room
  for (const r of d.rooms){
    const rr = rect(r);
    const inside = (x, z, m = 1.5) => x > rr.minX + m && x < rr.maxX - m && z > rr.minZ + m && z < rr.maxZ - m;
    for (const e of r.enemies || []) if (e.x != null && !inside(r.x + e.x, r.z + e.z))
      problems.push(`${d.id}/${r.id}: an enemy is placed outside (or inside the wall of) its room`);
    for (const p of r.props || []) if (p.x != null && !inside(r.x + p.x, r.z + p.z))
      problems.push(`${d.id}/${r.id}: prop "${p.model || p}" is outside its room`);
  }

  if (opts.zoneIds && d.entranceZone && !opts.zoneIds.includes(d.entranceZone))
    problems.push(`${d.id}: entranceZone "${d.entranceZone}" is not a real zone`);

  if (opts.knownModels){
    const known = new Set(opts.knownModels);
    const refs = d.rooms.flatMap(r => [
      ...(r.enemies || []).map(e => e.model),
      ...(r.props || []).map(p => p.model || p),
      r.boss && r.boss.model,
    ]).filter(Boolean);
    for (const m of new Set(refs)) if (!known.has(m.split("/").pop())) problems.push(`${d.id}: unresolvable model "${m}"`);
  }
  return problems;
}

/**
 * Compile a laid-out dungeon into the ZONE shape world.js renders.
 *
 * This is what makes a dungeon "just another zone": flat ground at y=0, no water, no scatter, and
 * an exit back to the zone that holds its entrance. `interior: true` tells world.js to skip the
 * outdoor dressing (sky gradient, sun, tree ring) and light the scene as a cave instead.
 */
export function dungeonZone(d){
  const props = [];
  const enemies = [];
  for (const r of d.rooms){
    for (const p of r.props || []){
      const model = p.model || p;
      // `h` (not `size`) — that is the key world.js's prop loader reads for the fit height.
      // Torches carry a light. An interior's ambient rig is deliberately near-black, so without
      // this a dungeon is an unlit room containing torch-shaped geometry.
      const isTorch = /torch/i.test(model);
      props.push({ url: "./assets/models/" + model, x: r.x + (p.x || 0), z: r.z + (p.z || 0),
                   h: p.size || 2.2, ry: p.ry || 0, solid: p.solid,
                   light: p.light || (isTorch ? { color: 0xff9440, intensity: 1.6, distance: 26, y: (p.size || 2.6) * 0.8 } : null) });
    }
    for (const e of r.enemies || []){
      // `size` is content, not code: fitting every creature to one height makes a squat wide
      // slime into a 4m boulder, because "fit to height" scales its width to match.
      enemies.push({ model: e.model, name: e.name, level: e.level, room: r.id, size: e.size || 2.4,
                     x: r.x + (e.x || 0), z: r.z + (e.z || 0) });
    }
    if (r.boss){
      enemies.push({ model: r.boss.model, name: r.boss.name, level: r.boss.level, boss: true,
                     room: r.id, size: r.boss.size || 6.5, x: r.x, z: r.z, hp: r.boss.hp });
    }
  }
  const obstacles = [
    ...d.rooms.flatMap(r => r.walls),
    ...d.corridorWalls,
  ].map(w => ({ kind: "box", x: w.x, z: w.z, w: w.w, d: w.d, ry: 0, id: "wall:" + w.id }));
  // A boss is a 7m creature standing in the middle of its arena. Without collision the player
  // walks straight into it and the follow camera ends up INSIDE the model — the boss room
  // renders as a wall of dark red. Give it a footprint so both stop at its edge.
  for (const r of d.rooms){
    if (r.boss) obstacles.push({ kind: "circle", x: r.x, z: r.z, r: (r.boss.size || 6.5) * 0.32, id: "boss:" + r.id });
  }

  return {
    id: d.id,
    name: d.name,
    interior: true,
    spawn: d.spawn,
    bounds: d.bounds,
    // Flat, seeded but featureless: a dungeon floor is a floor. Amplitude 0 means heightAt()
    // returns the base everywhere, so the existing ground/collision/camera code needs no
    // special case for interiors.
    terrain: { seed: 1, scale: 40, amplitude: 0, baseHeight: 0, waterLevel: null, biome: "mountains" },
    background: d.background,
    chunkSize: 32, loadRadius: 70, unloadRadius: 100,
    buildings: [], landmarks: [], npcs: [], wanderers: [], resourceNodes: [], nodeModels: {}, treeRing: [],
    rooms: d.rooms.map(r => ({ id: r.id, x: r.x, z: r.z, w: r.w, d: r.d, h: r.h || d.wallHeight,
                               boss: !!r.boss, walls: r.walls })),
    corridors: d.corridors,
    corridorWalls: d.corridorWalls,
    wallHeight: d.wallHeight,
    props, enemies, obstacles,
    exits: d.entranceZone
      ? [{ toZone: d.entranceZone, x: d.spawn.x, z: d.spawn.z - Math.max(4, (d.rooms[0].d / 2) - 3) }]
      : [],
    dungeonEntrances: [],
  };
}

/** Fetch, lay out and compile every dungeon. Mirrors loadWorldConfig; `fetchImpl` is injectable. */
export async function loadDungeons(url = "./world/dungeons.json", fetchImpl){
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) throw new Error("no fetch available to load dungeons");
  const res = await f(url);
  if (!res.ok) throw new Error("dungeon config " + url + " -> HTTP " + res.status);
  const doc = await res.json();
  return (doc.dungeons || []).map(layoutDungeon);
}

// Re-exported so world.js can import its chunk helper from one place alongside the dungeon API.
export { chunkKey };
