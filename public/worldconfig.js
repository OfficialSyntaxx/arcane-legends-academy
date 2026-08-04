// worldconfig.js — zone config loading, defaults and validation (WORLDSPEC §1, §3, §7).
//
// PURE (no THREE, no DOM) so tools/test.mjs can validate every zone headlessly. `world.js`
// consumes a normalised zone from here instead of reading structures.js/nodes.js directly.
//
// MIGRATION NOTE: `public/world/zones.json` currently contains one zone, `academy`, generated
// from the existing structures.js / nodes.js tables. Those modules remain the authoring surface
// for the hub for now — zones.json is the runtime contract. A second zone is authored purely as
// JSON, which is the point: adding content must not require engine changes.

import { BIOMES } from "./terrain.js";

export const ZONE_DEFAULTS = {
  chunkSize: 32,
  loadRadius: 70,
  unloadRadius: 100,
  terrain: { seed: 1, scale: 40, amplitude: 6, baseHeight: 0, waterLevel: null, biome: "plains" },
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
};

// Deep-ish merge that only fills in missing keys — an author who sets one terrain field should
// not lose the rest of the defaults.
function withDefaults(zone){
  const z = { ...ZONE_DEFAULTS, ...zone };
  z.terrain = { ...ZONE_DEFAULTS.terrain, ...(zone.terrain || {}) };
  z.bounds  = { ...ZONE_DEFAULTS.bounds,  ...(zone.bounds  || {}) };
  for (const k of ["buildings","landmarks","props","npcs","wanderers","resourceNodes",
                   "enemies","exits","dungeonEntrances","treeRing"]) z[k] = z[k] || [];
  z.nodeModels = z.nodeModels || {};
  return z;
}

/**
 * Validate a zone. Returns an array of human-readable problems (empty = valid).
 * Deliberately returns problems rather than throwing, so tests can report all of them at once.
 */
export function validateZone(z, opts = {}){
  const problems = [];
  const known = new Set(opts.knownModels || []);
  const inBounds = (x, zz) => x >= z.bounds.minX && x <= z.bounds.maxX && zz >= z.bounds.minZ && zz <= z.bounds.maxZ;

  if (!z.id) problems.push("zone has no id");
  if (!z.name) problems.push(`${z.id}: no name`);
  if (!z.spawn || typeof z.spawn.x !== "number" || typeof z.spawn.z !== "number") problems.push(`${z.id}: invalid spawn`);
  else if (!inBounds(z.spawn.x, z.spawn.z)) problems.push(`${z.id}: spawn is outside bounds`);

  if (z.bounds.minX >= z.bounds.maxX || z.bounds.minZ >= z.bounds.maxZ) problems.push(`${z.id}: inverted bounds`);
  if (!(z.chunkSize > 0)) problems.push(`${z.id}: chunkSize must be > 0`);
  // hysteresis: without a gap, a player standing on the boundary thrashes load/unload every frame
  if (!(z.unloadRadius > z.loadRadius)) problems.push(`${z.id}: unloadRadius must exceed loadRadius (load/unload thrash)`);
  if (!BIOMES[z.terrain.biome]) problems.push(`${z.id}: unknown biome "${z.terrain.biome}"`);
  if (!Number.isFinite(z.terrain.seed)) problems.push(`${z.id}: terrain.seed must be a number (determinism)`);

  // everything placed must be inside the zone it belongs to
  const placed = [
    ...z.buildings.map(b => ["building:" + b.id, b.x, b.z]),
    ...z.landmarks.map(l => ["landmark:" + l.key, l.x, l.z]),
    ...z.npcs.map(n => ["npc:" + n.key, n.x, n.z]),
    ...z.dungeonEntrances.map(d => ["dungeon:" + d.id, d.x, d.z]),
    ...z.props.filter(p => p.x != null).map(p => ["prop:" + p.url, p.x, p.z]),
    ...z.resourceNodes.filter(n => n.x != null).map(n => ["node:" + n.id, n.x, n.z]),
  ];
  for (const [what, x, zz] of placed){
    if (typeof x !== "number" || typeof zz !== "number") problems.push(`${z.id}: ${what} has non-numeric position`);
    else if (!inBounds(x, zz)) problems.push(`${z.id}: ${what} is outside zone bounds`);
  }

  // model references must resolve, if the caller supplied a model list
  if (known.size){
    const refs = [
      ...z.buildings.filter(b => b.model).map(b => b.model),
      ...z.landmarks.map(l => l.url),
      ...z.props.map(p => p.url),
      ...z.npcs.map(n => "./assets/models/" + n.model),
      ...z.wanderers.map(w => "./assets/models/" + w.model),
      ...Object.values(z.nodeModels).map(m => m.url),
    ];
    for (const r of new Set(refs)) if (!known.has(r.split("/").pop())) problems.push(`${z.id}: unresolvable model "${r}"`);
  }

  // exits must name a real zone
  if (opts.zoneIds) for (const e of z.exits) if (!opts.zoneIds.includes(e.toZone)) problems.push(`${z.id}: exit to unknown zone "${e.toZone}"`);

  return problems;
}

/** Normalise a raw {zones:[...]} document into a lookup, applying defaults. */
export function buildWorld(doc){
  const zones = {};
  for (const raw of (doc && doc.zones) || []) zones[raw.id] = withDefaults(raw);
  const ids = Object.keys(zones);
  return {
    zones,
    zoneIds: ids,
    hub: ids.find(id => zones[id].hub) || ids[0] || null,
    get(id){ return zones[id] || null; },
  };
}

/** Fetch and normalise the world config. `fetchImpl` is injectable for tests. */
export async function loadWorldConfig(url = "./world/zones.json", fetchImpl){
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) throw new Error("no fetch available to load world config");
  const res = await f(url);
  if (!res.ok) throw new Error("world config " + url + " -> HTTP " + res.status);
  return buildWorld(await res.json());
}

// Chunk helpers (WORLDSPEC §4). Step 3 will consume these; defined here so the coordinate
// convention has exactly one definition and the tests can pin it now.
export const chunkCoord = (v, chunkSize) => Math.floor(v / chunkSize);
export const chunkKey = (cx, cz) => cx + "," + cz;
export function chunkCenter(cx, cz, chunkSize){
  return { x: cx * chunkSize + chunkSize / 2, z: cz * chunkSize + chunkSize / 2 };
}
export function chunksInRadius(px, pz, chunkSize, radius){
  const out = [];
  const r = Math.ceil(radius / chunkSize) + 1;
  const pcx = chunkCoord(px, chunkSize), pcz = chunkCoord(pz, chunkSize);
  for (let cx = pcx - r; cx <= pcx + r; cx++){
    for (let cz = pcz - r; cz <= pcz + r; cz++){
      const c = chunkCenter(cx, cz, chunkSize);
      if (Math.hypot(c.x - px, c.z - pz) <= radius) out.push({ cx, cz, key: chunkKey(cx, cz) });
    }
  }
  return out;
}
