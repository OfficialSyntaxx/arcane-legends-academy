# WORLDSPEC — Arcane Legends: World Architecture

The blueprint for moving from a single campus spawn point to a large, roamable, future-proof world.
**Goal:** a big, immersive world where the player roams across themed outdoor zones, enters instanced dungeons, and fights bosses — with content added as *data*, not new engine code.

---

## 1. Design principles (non-negotiable)

1. **Data-driven.** Everything spatial (zones, props, nodes, NPCs, enemies, bosses, dungeons) lives in **JSON config**, not hardcoded in `world.js`. Adding a zone/dungeon = adding a config entry.
2. **Outdoor world = terrain + streamed props.** The open world is a large procedural terrain. Buildings/props/enemies are GLB models **streamed in from the CDN per chunk** (see `cdn.js` / `ASSETS.md`).
3. **Dungeons & boss rooms are instanced interior zones.** They are NOT crammed into the outdoor terrain. Entering a door/cave loads a self-contained interior scene.
4. **Chunk streaming keeps it fast.** Only nearby chunks load; far ones unload. This is what permits a genuinely large map.
5. **Deploy stays small (<50MB).** Big models stay on the CDN; `public/` ships only code + light assets (currently ~6.5MB).
6. **Mobile-first.** Low poly, reasonable draw calls per chunk. **Textures stay at source
   resolution (2048px)** — the old 512px cap was a 16x loss of texel density and the reason
   imported models looked soft; **Draco** (`npm run compress`) is what keeps the deploy small,
   not texture downsizing. See `ASSETS.md`.

---

## 2. Architecture overview

Four layers, each independent:

```
┌──────────────────────────────────────────────────────────┐
│ 1. ZONES       — outdoor regions (Academy, Forest, ...)   │
│    each: bounds, terrain seed, resource nodes, props,     │
│          NPCs, enemies, boss, exits, dungeon entrances     │
├──────────────────────────────────────────────────────────┤
│ 2. TERRAIN     — procedural heightmap(+water) per zone     │
│    noise → height → player height + collision              │
├──────────────────────────────────────────────────────────┤
│ 3. CHUNKS      — 3D grid over a zone                      │
│    load/unload GLB props+enemies by distance to player     │
├──────────────────────────────────────────────────────────┤
│ 4. INSTANCES   — dungeons / boss rooms / interiors         │
│    separate scene, loaded on enter, unloaded on exit       │
└──────────────────────────────────────────────────────────┘
```

- The **player** always exists in one "world context": an **outdoor zone** or an **instance**.
- **Exits/portals** connect outdoor zones to each other and to instances (dungeon doors, cave mouths, zone borders).

---

## 3. Zone config schema

Every outdoor zone is a JSON object. Schema (all fields optional with sensible defaults):

```jsonc
{
  "id": "whispering_forest",
  "name": "Whispering Forest",
  "spawn": { "x": 0, "z": 0 },                 // player entry point
  "bounds": { "minX": -200, "maxX": 200, "minZ": -200, "maxZ": 200 },
  "terrain": {
    "seed": 12345,
    "scale": 40,               // noise frequency (smaller = larger features)
    "amplitude": 6,            // max height offset
    "baseHeight": 0,
    "waterLevel": -1.2,        // below this → water rendered
    "biome": "forest"          // forest | plains | mountains | snow ...
  },
  "chunkSize": 32,             // world units per chunk edge
  "props": [                   // GLB models placed in the zone (streamed per chunk)
    { "model": "nat_CommonTree_1.glb", "count": 120, "minDistFromPlayerSpawn": 15 }
  ],
  "resourceNodes": [
    { "material": "oak_log", "label": "Chop Oak", "model": "kaykit_tree.glb", "count": 12 }
  ],
  "npcs": [
    { "model": "npc_mage.glb", "name": "Forest Sage", "x": 10, "z": 5, "role": "quest" }
  ],
  "enemies": [
    { "model": "enemy_skeleton.glb", "name": "Forest Skeleton", "count": 8, "level": 3 }
  ],
  "boss": { "model": "creature_Dragon.glb", "name": "Verdant Wyrm", "level": 10, "hp": 200 },
  "dungeonEntrances": [
    { "id": "cinderhollow_caverns", "x": 40, "z": -30, "model": "dng_doorway.glb" }
  ],
  "exits": [                    // connect to other zones
    { "toZone": "academy", "x": -196, "z": 0 }
  ]
}
```

**Conventions:**
- `props` / `resourceNodes` / `enemies` with a `count` are **auto-scattered** deterministically (seeded random) inside bounds, avoiding the player spawn and each other.
- Named/placed entities (`npcs`, explicit props, `dungeonEntrances`, `boss`) use exact `x`/`z`.
- `model` values are **filenames** — resolved at runtime through `cdn.js` `modelUrl()` so anything can live on the CDN.

---

## 4. Chunk streaming rules

**Grid:** each zone is divided into square chunks of `zone.chunkSize` (default 32u). Chunk coord = `floor(coord / chunkSize)`.

**Load rule (the core):**
```
for each chunk C in zone:
    dist = distance(player, C.center)
    if dist <= LOAD_RADIUS (default 70u):  ensure chunk loaded
    if dist > UNLOAD_RADIUS (default 100u): unload chunk
```
- `LOAD_RADIUS` and `UNLOAD_RADIUS` are per-zone tunables (hysteresis prevents load/unload thrash).
- A chunk is *loaded* = its props/enemies/nodes **instances** are in the scene (GLB models fetched from CDN on first load, cached after).
- Only the **nearby chunk's models** are instantiated — the rest of the zone is just terrain.

**Chunk contents (deterministic):** for chunks with auto-scattered content, assign each prop/enemy to a chunk by its seeded position. A chunk re-scatters identically every load (same seed), so reloading is stable.

**Transitions:** when the player crosses a chunk boundary, load the newly-adjacent chunks and unload the far ones (no full reload — just delta).

**Deep integration:** the player's X/Z always maps to a chunk; the world advance loop ticks `world.chunks.update(player)` each frame.

---

## 5. Procedural terrain spec

**Height function:** `height(x, z) = baseHeight + amplitude * fbm(x/scale, z/scale, seed)`
- Use multi-octave value/simplex noise (fBm, ~4 octaves) for natural rolling terrain.
- **Biomes** modulate amplitude/waterLevel/color (forest → gentle, mountains → jagged, snow → colder palette).
- Deterministic per zone (seed) — same world every load.

**Rendering:** generate a chunk-sized heightmap mesh (16×16 verts per chunk, `THREE.PlaneGeometry` displaced along Y + `computeVertexNormals`). Water = a flat translucent plane at `waterLevel` inside water bounds.

**Collision & movement:** the player's ground Y = `height(px, pz)`; walking follows the terrain. Clamp movement at zone bounds (or trigger `exits`). No physics engine needed — simple height sampling.

**Constraints:**
- Keep key landmarks on **flat ground**: $ |height| < 0.5 $ within `LANDMARK_FLAT_RADIUS` (e.g. 8u) of any placed prop/NPC/entrance. Enforce by nudging the terrain or flattening a small patch.
- The **Academy zone stays mostly flat** (hub) — gentle terrain only.

---

## 6. Dungeon / boss instancing flow

Dungeons and boss rooms are **interior instances** — separate scenes, not part of the outdoor terrain.

**Flow:**
1. Player approaches a `dungeonEntrance` (outdoor prop) → prompt "Enter Dungeon".
2. On enter:
   - **Suspend** the outdoor zone (stop its chunk updates / render; keep state).
   - **Load the dungeon instance** from `dungeon config` (see schema below): its own meshes, walls, rooms, enemies, boss arena.
   - Move the player to the dungeon **spawn**.
3. Inside: rooms connected by corridors; enemies; the **boss room** at the end (large arena, boss model + HP bar).
4. On boss defeat / exit:
   - **Save** instance progress (cleared rooms, boss dead) if it should persist, or reset on leave.
   - **Unload** the instance, **restore** the outdoor zone at the entrance.

**Dungeon config schema:**
```jsonc
{
  "id": "cinderhollow_caverns",
  "name": "Cinderhollow Caverns",
  "entranceZone": "mountains", "entranceX": 40, "entranceZ": -30,
  "spawn": { "x": 0, "z": 0 },
  "background": 0x1a1440,          // ambient / fog color
  "rooms": [
    { "id": "r1", "w": 20, "d": 20, "h": 8, "floor": "dungeon_floor", "walls": "dungeon_wall",
      "enemies": [ { "model": "enemy_skeleton.glb", "count": 3, "x": 5, "z": 5 } ],
      "props": [ "dng_torch", "barrel" ],
      "exits": [ { "to": "r2", "at": { "x": 10, "z": 0 } } ] },
    { "id": "boss", "w": 30, "d": 30, "h": 10, "boss": "cinder_wyrm" }
  ],
  "connections": [ { "from": "r1", "to": "boss", "corridor": true } ]
}
```
- Rooms are built from **modular dungeon GLB tiles** (KayKit Dungeon pack — walls, floors, doors, torches already imported) placed on a grid, plus a **boss** (a big enemy model + HP bar).
- **Boss rooms** are just rooms with a `boss` field — the fight happens in-place.

**State:** `worldState.dungeons[id]` = { clearedRooms:[], bossDead:bool, keys? } persisted in the save (same save system as the rest of the game).

---

## 7. Data-driven content catalog (single source of truth)

- `world/zones.json` — all outdoor zones (schema §3).
- `world/dungeons.json` — all instanced interiors (schema §6).
- `world/props.json` — reusable prop definitions (model, size, tags).
- `world/enemies.json` — enemy stat blocks (model, hp, atk, anim clips).
- `world/bosses.json` — boss definitions (model, hp, abilities).
- All model values are **filenames resolved via `cdn.js`** — nothing hardcodes a URL.

**Adding new content = editing a JSON file.** No world-engine changes.

---

## 8. Performance & deploy rules

- **Deploy:** keep `public/` < ~50MB. Big models → CDN (`models_cdn/` + `cdn.js`). (Current: ~6.5MB.)
- **Per chunk:** cap instanced props (~60) and draw calls; reuse `InstancedMesh` for repeated props (trees/rocks).
- **Model budget:** characters ≤ ~2.6MB, props ≤ ~1.5MB, textures **2048px**. Use `tools/import-asset.mjs` to import and `npm run compress` (Draco + WebP@92) to shrink.
- **Streaming:** never load a chunk > UNLOAD_RADIUS; cache CDN models in memory (Map) so revisits are instant.
- **Mobile:** target 30–60fps; LOD = swap far chunks to a low-poly terrain-only mesh.

---

## 9. Implementation order (for Claude Code)

1. ✅ **World config + data model** — `public/world/zones.json` + `public/worldconfig.js`
   (`loadWorldConfig`, `buildWorld`, `validateZone`, defaults, chunk helpers). `createWorld(canvas,
   callbacks, zone)` now accepts a zone; omitting it falls back to the built-in academy tables so
   the hub keeps working. Two zones ship: `academy` (migrated from `structures.js`/`nodes.js`) and
   `whispering_forest` (**authored as pure JSON — no engine change**, which is the proof this works).
2. ✅ **Zone terrain** — `public/terrain.js`: seeded value-noise fBm, biomes, flat zones, slope and
   water. The ground is a displaced heightmap; the player, NPCs, buildings, landmarks and props all
   sit on the surface. Water renders only where a zone declares `waterLevel`.
3. **Chunk streaming** — chunk grid, load/unload by distance (§4), CDN-backed prop instantiation (reuse `loadProp`/`makeCharModel`).
4. **Zone transitions** — walkable `exits` that switch the active zone (spawn at the target zone's entry).
5. **Dungeon instancing** — entrance → suspend zone → load interior → rooms/corridors → boss room → exit restores zone (§6).
6. **Content pass** — author the first 2–3 zones (Academy, Whispering Forest, Cinderhollow) + one dungeon, using imported CC0 models.

---

## 9b. Additions from implementing steps 1–2

These were missing from the original blueprint and are now part of it.

**a. Terrain must compose with the existing 2D collision, not replace it.**
`structures.js` already resolves collision against buildings/props in X/Z. Terrain adds the Y
axis only: movement resolves in X/Z as before, *then* Y is sampled from the heightmap. There is
no 3D physics and none is needed.

**b. Landmarks flatten the terrain, not the other way round.**
Rather than nudging buildings to fit the ground, each landmark/NPC/node/spawn declares a flat
zone and the terrain blends back to base height across it (`terrain.js flatteningFactor`, eased
over `r → 2r` so there is no step at the edge). Flat zones are **derived from the zone's own
content** (`flatsForZone`) so an author never maintains a second list. Tests assert every
building corner, landmark, NPC and the spawn sits within ±0.5 of base height.

**c. Colour management applies to terrain too.**
Any hex colour in a zone/biome config must go through `convertSRGBToLinear()` (see §3 of
`CLAUDEREADME`), or the ground washes out relative to the models standing on it.

**d. Everything spatial must be pure and headlessly testable.**
`terrain.js` and `worldconfig.js` contain **no THREE and no DOM**, matching `structures.js` /
`nodes.js`. This is what lets `tools/test.mjs` validate zones, bounds, flatness, determinism and
chunk maths without a browser. **Do not put spatial maths in `world.js`.**

**e. Camera collision is a prerequisite, not a nice-to-have.**
The follow camera has no collision today; with terrain it will also clip *through hills*. Fix
before step 3 (see `docs/DESIGN-DECISIONS.md` §3).

**f. Zone exits must be mutually reachable.**
A one-way exit strands the player. Tested.

**g. Chunk budget sanity.** `chunkSize 32` + `LOAD_RADIUS 70` loads ~25 chunks; at the §8 cap of
60 props/chunk that is 1,500 instances. Either raise `chunkSize` (fewer, bigger chunks) or lower
the per-chunk cap for mobile. **Revisit these numbers when step 3 lands** — they are untested.

**h. Known gap: content authored as `count` is not yet scattered.**
`whispering_forest` declares `props`/`resourceNodes`/`enemies` with `count`. The deterministic
scatter that turns a count into positions belongs to **step 3** (it is per-chunk). Until then
those entries validate but do not render.

---

## 10. Integration notes (existing systems)

- Reuse `makeCharModel` (characters/NPCs), `loadProp` (props), `register()` (interactables), `cdn.js` (URLs), and the KayKit/Quaternius model pool already in `ASSETS.md`.
- The current hardcoded campus becomes **zone `academy`** (the hub) — keep its landmarks, but define them in `zones.json`.
- Duel arena, market, scribing hall, etc. stay as `academy` zone interactables; dungeons add PvE content on top.
- Save system (`game.js` / `S` state) gains `worldState` (unlocked zones, dungeon progress, boss kills).
- All tests (`tools/test.mjs`, `logic-test.mjs`, `ui-smoke.mjs`) must stay green after each phase.