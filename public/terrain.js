// terrain.js — procedural heightmap maths (WORLDSPEC §5).
//
// PURE. No THREE, no DOM. Same reasoning as structures.js and nodes.js: world.js needs a canvas,
// so anything defined inside it can never be checked headlessly. Keeping the height function here
// means tools/test.mjs can assert determinism, flat-zone enforcement and bounds without a browser.
// world.js turns these numbers into meshes; it does not own the maths.

// ---------------------------------------------------------------- noise
// Deterministic value noise + fBm. Seeded integer hash, so the same (x, z, seed) always gives the
// same height — a zone must look identical on every load and across every client.
function hash2(ix, iz, seed){
  // Everything stays inside int32 via Math.imul. An earlier version multiplied the seed by a
  // 64-bit constant, which exceeds Number.MAX_SAFE_INTEGER — the product lost its low bits, the
  // hash collapsed to a constant for most seeds, and the whole terrain came out perfectly flat.
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);           // smoothstep, for C1-continuous interpolation

function valueNoise(x, z, seed){
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix,   iz,   seed), b = hash2(ix+1, iz,   seed);
  const c = hash2(ix,   iz+1, seed), d = hash2(ix+1, iz+1, seed);
  return (a*(1-fx) + b*fx) * (1-fz) + (c*(1-fx) + d*fx) * fz;
}

// Fractional Brownian motion — 4 octaves gives natural rolling terrain without looking noisy.
export function fbm(x, z, seed, octaves = 4){
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++){
    sum  += valueNoise(x * freq, z * freq, seed + o * 1013) * amp;
    norm += amp;
    amp  *= 0.5;
    freq *= 2;
  }
  return (sum / norm) * 2 - 1;                      // -1 .. 1
}

// ---------------------------------------------------------------- biomes
// Biomes modulate the shape of the terrain, not its content. `rough` multiplies amplitude;
// `octaves` controls how jagged it reads.
export const BIOMES = {
  plains:    { rough: 0.55, octaves: 3, ground: 0x2f7d4f, water: 0x3a86c8 },
  forest:    { rough: 1.00, octaves: 4, ground: 0x2b6b46, water: 0x2f6f8a },
  mountains: { rough: 2.60, octaves: 5, ground: 0x6b6b78, water: 0x3a6a9a },
  snow:      { rough: 2.10, octaves: 5, ground: 0xdfe6f5, water: 0x7fb6d8 },
};

// ---------------------------------------------------------------- flat zones
// WORLDSPEC §5 requires landmarks to sit on flat ground, or buildings float and clip. Rather than
// nudging placements to fit the terrain, the terrain yields to the placements: each flat zone
// blends the height back to its base over `radius`, with a soft falloff so there is no visible
// step at the edge.
export const LANDMARK_FLAT_RADIUS = 10;

export function flatteningFactor(x, z, flats){
  // 0 = fully flattened (at a landmark), 1 = untouched terrain
  let f = 1;
  for (const s of flats){
    const d = Math.hypot(x - s.x, z - s.z);
    const r = s.r || LANDMARK_FLAT_RADIUS;
    if (d >= r * 2) continue;
    // 0 inside r, easing to 1 by 2r
    const t = d <= r ? 0 : smooth((d - r) / r);
    f = Math.min(f, t);
  }
  return f;
}

// ---------------------------------------------------------------- height
/**
 * Ground height at a world position.
 * @param {number} x @param {number} z
 * @param {object} terrain  zone.terrain config (seed, scale, amplitude, baseHeight, biome)
 * @param {Array}  flats    [{x, z, r}] areas forced flat (landmarks, spawn, nodes)
 */
export function heightAt(x, z, terrain, flats = []){
  const t = terrain || {};
  const seed = t.seed | 0;
  const scale = t.scale > 0 ? t.scale : 40;
  const base = t.baseHeight || 0;
  const biome = BIOMES[t.biome] || BIOMES.plains;
  const amp = (t.amplitude != null ? t.amplitude : 6) * biome.rough;
  const n = fbm(x / scale, z / scale, seed, biome.octaves);
  return base + n * amp * flatteningFactor(x, z, flats);
}

// Surface normal by central differences — used for slope checks and mesh normals.
export function slopeAt(x, z, terrain, flats = [], eps = 0.75){
  const hL = heightAt(x - eps, z, terrain, flats), hR = heightAt(x + eps, z, terrain, flats);
  const hD = heightAt(x, z - eps, terrain, flats), hU = heightAt(x, z + eps, terrain, flats);
  return Math.hypot(hR - hL, hU - hD) / (2 * eps);
}

export function isWater(x, z, terrain, flats = []){
  const t = terrain || {};
  if (t.waterLevel == null) return false;
  return heightAt(x, z, terrain, flats) < t.waterLevel;
}

// Every flat-zone centre a zone needs, derived from its own content so a zone author never has to
// list them by hand — a landmark that exists is a landmark that gets flat ground.
export function flatsForZone(zone){
  const flats = [];
  const push = (x, z, r) => flats.push({ x, z, r: r || LANDMARK_FLAT_RADIUS });
  if (zone.spawn) push(zone.spawn.x, zone.spawn.z, 12);
  for (const b of zone.buildings || []) push(b.x, b.z, Math.max(b.w || 0, b.d || 0) / 2 + 6);
  for (const l of zone.landmarks || []) push(l.x, l.z, (l.size || 20) / 2 + 6);
  for (const n of zone.npcs || []) push(n.x, n.z, 6);
  for (const n of zone.resourceNodes || []) if (n.x != null) push(n.x, n.z, 5);
  for (const p of zone.props || []) if (p.x != null && p.solid) push(p.x, p.z, 4);
  for (const d of zone.dungeonEntrances || []) push(d.x, d.z, 8);
  return flats;
}
