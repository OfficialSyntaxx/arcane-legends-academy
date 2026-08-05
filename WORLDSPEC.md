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
3. ✅ **Chunk streaming** — `bucketByChunk` + `chunkDelta` in `worldconfig.js` (pure, tested) and
   the runtime loader in `world.js`. Content is scattered and bucketed **once**, then only deltas
   are applied, so a chunk reloads identically. Unloading disposes geometry and materials rather
   than just detaching, or a long session leaks every chunk walked through. Streamed loads are
   `quiet` so they do not drive the boot progress HUD. `?zone=<id>` picks a starting zone.
4. ✅ **Zone transitions** — walkable `exits` that switch the active zone, arriving at the
   target's *reciprocal* exit so the two zones join up geographically.
5. ✅ **Dungeon instancing** — entrance → suspend zone → load interior → rooms/corridors → boss room → exit restores zone (§6).
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

**h. ✅ Deterministic scatter is implemented** (`worldconfig.js scatterZone`) — it belongs to the
zone *semantics* (§3 conventions), not to chunk streaming. Counts expand to concrete positions
from the zone seed, avoiding the spawn, each other, **water, and steep ground**. Step 3 buckets
these results per chunk rather than re-rolling them, which is what keeps reloads stable.

**i. Zone bounds and collision are per-zone, not global.**
Movement, teleport and the ground/water meshes all clamp and centre on `zone.bounds`, and
collision uses `zone.obstacles` when present. A zone with different bounds or a different
building set would otherwise inherit the academy's.

**j. `zones.json` is generated for the hub and drift-checked.**
`tools/sync-zones.mjs` regenerates the `academy` zone from `structures.js`/`nodes.js`; `npm test`
fails if it is stale. Two copies of the same data is exactly how the `logic.js` card catalog
silently drifted from `cards.js`, so it gets the same guard. **Other zones are hand-authored in
`zones.json` and are never touched by the generator.**

**k. ✅ Water is solid** (landed with step 4). Movement retries each axis alone when the
destination is submerged, so the player slides along a shoreline instead of stopping dead, and
`teleport` refuses to drop anyone mid-lake. Swimming/boats remain future work. Tested: no exit
and no arrival point may sit in water, or the transition would be unusable.

**l. Zone content must come from the zone, not module constants.** Found in step 3: `world.js`
built its buildings, NPCs, nodes, tree ring, paths, lamps, fountain and spires from the imported
`structures.js`/`nodes.js` tables, so **every zone rendered the academy on top of its own
content**. All of it now reads from the active zone, and hub dressing lives in `zone.decor`.

**m. Streamed content is `quiet`.** Chunk loads must not increment the boot loading counter, or
the "Summoning the academy… n/m" HUD never finishes.

---

## 10. Integration notes (existing systems)

- Reuse `makeCharModel` (characters/NPCs), `loadProp` (props), `register()` (interactables), `cdn.js` (URLs), and the KayKit/Quaternius model pool already in `ASSETS.md`.
- The current hardcoded campus becomes **zone `academy`** (the hub) — keep its landmarks, but define them in `zones.json`.
- Duel arena, market, scribing hall, etc. stay as `academy` zone interactables; dungeons add PvE content on top.
- Save system (`game.js` / `S` state) gains `worldState` (unlocked zones, dungeon progress, boss kills).
- All tests (`tools/test.mjs`, `logic-test.mjs`, `ui-smoke.mjs`) must stay green after each phase.

**n. Zone transitions rebuild the world; they do not mutate it.** `changeZone` disposes the old
`createWorld` and stands up a new one. Two live worlds would each hold a WebGL context on the
same canvas and both would keep running their rAF loops. The input handlers survive because they
close over the module-level `world`, so rebinding it is enough — but **DOM that outlives the
scene must be reset by hand**: the interaction prompt persisted across a transition, so arriving
in the forest still offered the academy gateway's button.

**o. Arriving must not bounce.** Landing on the reciprocal exit puts the player inside its own
trigger, which sends them straight back. Two guards, both needed: `entryPointFor` offsets the
arrival inward, and the trigger arrives *disarmed* and only re-arms once the player has walked
clear of every exit. `validateExits` fails the build if any arrival point lands in a trigger.

**p. Camera collision needs a post-step correction.** Clamping the camera's *target* is not
enough. While easing back out the camera sits between its old and new positions, and orbiting a
building can sweep that arc through a corner even when both endpoints are clear — an
intermittent failure that predates step 4. The camera is now re-clamped along its own bearing
after the lerp.


**q. A dungeon IS a zone.** Step 5 does not add a parallel instance system. `dungeons.js` compiles
a dungeon config into the zone shape `world.js` already renders (bounds, flat terrain, obstacles,
props, enemies, exits) and registers it in the same lookup, so entering one is a step-4
transition and everything step 4 already tested applies unchanged. `interior: true` swaps the
outdoor light rig and sky for a cave rig and close fog.

**r. Walls are collision boxes, so a doorway must be a GAP, not a hole.** `wallsForRoom` emits
each side as up to two boxes either side of its doorways. One box spanning a doorway would seal
the room and strand the player — tested by walking the centre line of every corridor and
asserting no wall box contains it, and by sampling every room perimeter for gaps.

**s. Bosses need a footprint.** A 7m dragon with no collision lets the player walk inside it, and
the follow camera goes with them — the boss room renders as a wall of dark red. Bosses contribute
a collision circle; a test asserts the arena around it is still walkable and the boss is still
close enough to engage.

**t. Compression can corrupt a model in two different ways, both invisible.** Four models shipped
broken: two failed to PARSE and two parsed but threw on every frame once the GPU uploaded them.
world.js catches a load failure and silently keeps the procedural stand-in, and a render failure
is only console spam, so neither showed up in play or in any test. `tools/model-check.mjs` now
loads and renders every GLB in a real browser — and renders TWICE, because a corrupt attribute
only throws on upload, not on the frame the model is added.


**u. The ground is painted with vertex colours, and the paint has to be BOLD.** One flat biome
colour over a 150m field is why the world read as a plastic sheet however detailed the models
were. `terrain.js groundColorAt` blends height bands, turns steep ground to rock, adds a
shoreline, and applies low-frequency mottling — all pure, so the bands are asserted rather than
eyeballed. Two attempts failed *silently* before this landed: the function's output changed and
the screen did not. Converting sRGB to linear collapses a 10/255 difference between dark greens
into ~0.05 of linear range, and ACES then compresses the midtones again, so a ±16% variation that
looked fine as numbers was invisible. Verify ground colour by RENDERING it, and test the spread
over a screen-sized window rather than the whole zone.
