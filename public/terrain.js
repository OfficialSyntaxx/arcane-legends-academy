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
// `ground` is the biome's base colour and stays the fallback for anything that just needs one
// number. `palette` is what the ground MESH is actually painted with — see groundColorAt.
export const BIOMES = {
  // The plains bands are deliberately further apart than the others: this is the hub, it is
  // nearly flat (amplitude 1.4) and flattened again around every landmark, so it has the least
  // height variation to work with and needs the most colour contrast to not read as one sheet.
  plains:    { rough: 0.55, octaves: 3, ground: 0x2f7d4f, water: 0x3a86c8,
               palette: { low: 0x4f9c60, mid: 0x2f7d4f, high: 0x87905d, rock: 0x7a7466, shore: 0xc9bd8a } },
  forest:    { rough: 1.00, octaves: 4, ground: 0x2b6b46, water: 0x2f6f8a,
               palette: { low: 0x35774c, mid: 0x27603f, high: 0x4a6a4a, rock: 0x5f6459, shore: 0x9c9268 } },
  mountains: { rough: 2.60, octaves: 5, ground: 0x6b6b78, water: 0x3a6a9a,
               palette: { low: 0x5c6a52, mid: 0x6b6b78, high: 0xa8adbc, rock: 0x585461, shore: 0x8c8878 } },
  snow:      { rough: 2.10, octaves: 5, ground: 0xdfe6f5, water: 0x7fb6d8,
               palette: { low: 0xc3d2e6, mid: 0xdfe6f5, high: 0xffffff, rock: 0x6e7385, shore: 0xb9c6d6 } },
  // The Confluence (BACKLOG §10 endgame zone): the most jagged terrain yet (rough/octaves both
  // exceed mountains'), a void-violet base with magenta-crystal peaks and a cyan shore glow —
  // reads as "all seven schools' colour bleeding together" without needing a new ground texture,
  // the same all-vertex-colour trick every other biome uses.
  confluence: { rough: 3.20, octaves: 5, ground: 0x2a1b3d, water: 0x8a4fd6,
               palette: { low: 0x3a2a52, mid: 0x2a1b3d, high: 0xc77dff, rock: 0x241830, shore: 0x7fe0ff } },
};

// ---------------------------------------------------------------- ground colour
// The single flat biome colour is why the world read as a plastic green sheet no matter how much
// detail the models had: a 150m field painted one RGB value has no shape to it, because nothing
// varies across it. This blends four bands by HEIGHT and overrides them by SLOPE, which is enough
// to give hills a visible profile with zero assets — the paint comes out as vertex colours on the
// ground mesh, so there is no texture to author, download or compress.
//
// Pure, so tools/test.mjs can assert the bands actually differ instead of trusting a screenshot.
function mix(a, b, t){
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

/**
 * The colour of the ground at (x, z), as a 24-bit sRGB int.
 *
 * @param band  vertical span over which the low->mid->high bands blend. Defaults to the zone's own
 *              amplitude, so a gentle zone still uses its full palette instead of sitting in one
 *              band — a fixed metre value would make the flat academy uniformly "low".
 */
export function groundColorAt(x, z, terrain, flats = [], opts = {}){
  const t = terrain || {};
  const biome = BIOMES[t.biome] || BIOMES.plains;
  const p = biome.palette || { low: biome.ground, mid: biome.ground, high: biome.ground,
                               rock: biome.ground, shore: biome.ground };
  const h = heightAt(x, z, terrain, flats);
  const base = t.baseHeight || 0;
  const band = opts.band || Math.max(2, (t.amplitude != null ? t.amplitude : 6) * biome.rough * 1.6);
  const n = (h - base) / band;                    // roughly -1 (valley) .. +1 (peak)

  let c = n < 0 ? mix(p.mid, p.low, Math.min(1, -n)) : mix(p.mid, p.high, Math.min(1, n));

  // Height bands alone are not enough on a FLAT zone. The academy has amplitude 1.4 and is
  // flattened further around every landmark, so `n` barely moves and the whole campus lands in
  // one band — which is the plastic-green-sheet look again, just arrived at differently. A slow
  // patch noise varies the colour independently of height, the way real ground is never uniform.
  const seed = (t.seed || 1) ^ 0x9e37;
  const patchScale = (t.scale || 40) * 0.55;   // ~30m features: big enough to read as ground, small enough to see in one shot
  const patch = fbm(x / patchScale, z / patchScale, seed, 2);   // -1..1
  c = mix(c, patch < 0 ? p.low : p.high, Math.abs(patch) * 0.6);

  // Brightness variation, and it has to be BOLD to survive the render pipeline. Two things eat
  // it: converting sRGB to linear collapses a 10/255 difference between dark greens into ~0.05 of
  // linear range, and ACES tone mapping then compresses the midtones again. A ±16% jitter that
  // looked reasonable as numbers was invisible on screen; ±30% is what actually reads as uneven
  // ground. Verified by rendering, not by inspecting the values.
  const shade = 1 + fbm(x / (patchScale * 0.34), z / (patchScale * 0.34), seed ^ 0x5bf0, 3) * 0.30;
  c = (Math.min(255, Math.max(0, ((c >> 16) & 255) * shade)) | 0) << 16
    | (Math.min(255, Math.max(0, ((c >> 8) & 255) * shade)) | 0) << 8
    | (Math.min(255, Math.max(0, (c & 255) * shade)) | 0);

  // Steep ground is bare rock — this is what actually makes a hill read as a hill, because the
  // colour change follows the surface's shape rather than its height.
  const slope = slopeAt(x, z, terrain, flats);
  if (slope > 0.35) c = mix(c, p.rock, Math.min(1, (slope - 0.35) / 0.75));

  // A shoreline band just above the waterline, so water meets land instead of being a blue
  // rectangle laid on grass.
  if (t.waterLevel != null){
    const above = h - t.waterLevel;
    if (above >= 0 && above < 1.6) c = mix(p.shore, c, above / 1.6);
  }
  return c;
}

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
