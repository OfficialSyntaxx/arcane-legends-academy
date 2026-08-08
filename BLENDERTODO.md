# BLENDERTODO — modelling briefs for Arcane Legends Academy

Every asset in this game that is currently a **procedural Three.js primitive** — a cylinder, a
box, a cone — and could be a real model instead. Each entry is written as a **complete brief for
an AI agent driving Blender**: it says what to build, at exactly what size, in what style, where
the origin goes, what the triangle budget is, and precisely which file in this repo to edit once
the `.glb` exists.

Work them **one at a time**. Nothing here depends on anything else here.

---

## 0. READ THIS FIRST — the rules every brief inherits

Do not repeat these in each task; they always apply.

### 0.1 Units, orientation, origin
- **1 Blender unit = 1 metre.** Scene units metric, scale 1.0. Do not model in centimetres.
- **+Y is up in the game, +Z is up in Blender.** Blender's glTF exporter converts this
  automatically — build Z-up as normal and let the exporter handle it. Do **not** pre-rotate.
- **Forward is -Z in the game.** In Blender that means the side the player should see faces **-Y**.
- **Origin at the base centre**, sitting on the floor plane (lowest vertex at Z = 0), except where
  a brief says otherwise (wall-mounted pieces put the origin on the wall face).
- **Apply all transforms before export** (`Ctrl+A → All Transforms`). A non-1.0 object scale
  survives into the glTF and fights the game's own fit-to-height scaling.
- Reference for scale: **the player is 2.6 m tall**, halls are 7–10.5 m, the tower is 40 m, the
  outdoor arena is 25 m across. A "normal-looking" 1.8 m human reads as tiny next to this world.

### 0.2 Style — this is not negotiable
The campus is **CC0 KayKit** (Medieval Hexagon / Dungeon Remastered / Furniture Bits). Anything new
must sit beside those without looking imported:
- **Flat-shaded, low-poly.** Hard edges, no smooth shading except on deliberately round forms.
- **Chunky, readable silhouettes.** This is a mobile game seen from a follow camera 12–18 m away
  and often at 30–40° above the horizon. Detail below ~5 cm will never be seen; delete it.
- **No bevels below 2 cm.** No subdivision surface. No microdetail geometry.
- **Colour comes from flat material colours or a small texture atlas** — never per-object 2K maps.
- **Never bake lighting or ambient occlusion into the texture.** The game lights the scene itself
  and a baked shadow will fight it. Emission is fine where a brief asks for it.

### 0.3 Materials
- Prefer **one material per object**, colour set on Base Color. Metallic 0, Roughness 0.9–1.0
  unless the brief says otherwise. The renderer uses ACES tone mapping with a dim environment map;
  shiny PBR metal renders near-black.
- If a brief gives a hex colour, **use exactly that hex** — the game already uses it for the
  procedural version, so matching it means the swap is invisible except for the extra detail.
- Textures, if any: **one shared atlas, 1024 px or smaller, PNG**. The import pipeline caps at
  2048 px but nothing here needs that.

### 0.4 Triangle budgets
Hard ceilings. Going over is a correctness failure, not a style note.

| Class | Budget |
|---|---|
| Small prop (sconce, book set, rug) | ≤ 300 tris |
| Furniture (bed, desk, bookshelf, case) | ≤ 1,200 tris |
| Large prop (fountain, brazier, lamp post) | ≤ 2,000 tris |
| Modular kit piece (wall, floor tile, pillar) | ≤ 400 tris |
| Landmark / hero building | ≤ 15,000 tris |

### 0.5 Export
- File → Export → **glTF 2.0 (.glb)**, format **glTF Binary**.
- Include: Selected Objects **only** (select the asset, nothing else). No cameras, no lights, no
  empties, unless the brief explicitly asks for a light.
- Transform: **+Y Up** ticked (the default).
- Geometry: Apply Modifiers ✔, UVs ✔, Normals ✔, **Tangents ✘**, Vertex Colors ✔ if used.
- Compression: **leave Draco OFF here.** This repo's own pipeline applies it — see 0.6.
- **Delete every unused material, image and node group before export** (File → Clean Up → Purge
  All Unused Data twice). Orphaned data blocks ship inside the `.glb`.

### 0.6 Getting it into the game — the pipeline, in order
```bash
# 1. import (converts, caps textures, prints the measured size)
node tools/import-asset.mjs /path/to/your.glb --name <target_name>.glb --out public/assets/models

# 2. compress (WebP textures first, THEN Draco — the order matters, see ASSETS.md)
npm run compress

# 3. prove it actually loads AND renders on a GPU (a corrupt attribute only throws on upload)
npm run check:models

# 4. full suite
npm test && npm run test:browser
```
**Traps that have already cost this project time — do not rediscover them:**
- `gltf-transform optimize` **decimates by default** and **corrupts animations**. `npm run compress`
  uses a standalone Draco pass for exactly this reason. Do not "optimise" a model by hand.
- Compression is **lossy and not idempotent**. Never run it twice on the same file; the script has
  a skip-if-compressed guard, and `--force` exists only for deliberate re-encodes.
- A model that loads headlessly can still throw on GPU upload. `check:models` renders **twice**
  precisely to catch that. Four GLBs in this repo were silently broken until it existed.

### 0.7 Placement is DATA, never code
`world.js` renders what the data tables hand it. **Never place an asset by editing `world.js`.**
- Buildings, landmarks, props, NPCs → `public/structures.js`
- Gathering-node models → `public/nodes.js`
- Zone content → `public/world/zones.json` (`academy` is *generated* — edit `structures.js` and run
  `node tools/sync-zones.mjs`; `npm test` fails if it is stale)
- Dungeon content → `public/world/dungeons.json`
- Dorm furniture → `public/dorm.js` (`FURNITURE`)

Each brief below names the exact table and field.

### 0.8 Definition of done
1. `.glb` exists in `public/assets/models/` (or `public/assets/buildings/` for landmarks).
2. Its table entry is updated, with the measured height in the `h`/`size` field.
3. `npm run check:models` clean.
4. `npm test` and `npm run test:browser` green.
5. **You have looked at it in the game.** Screenshots of a WebGL canvas come back blank in this
   project — use `window.__world.renderOnce()` then read the canvas, or the debug hook
   `window.__worldDebug()`, which reports the loaded scale and the nearest geometry.
6. `ASSETS.md` updated with the file, source, licence and what it is used as.

---

# TIER 1 — the dorm (highest visual payoff per model)

Everything in the player's dorm is a coloured box right now. It is the one room a player owns and
returns to, and it is currently eight primitives. **`public/dorm.js` → `FURNITURE`** holds the
catalogue; each entry already has the exact bounding box the model must fit.

For every piece in this tier, the table entry gains a `model` field:
```js
{ id:"bed", ..., shape:"bed", w:2.0, d:3.4, h:0.9, color:0x7a5a6a,
  model:"fur_dorm_bed.glb" },        // ← add this
```
and `world.js`'s dorm block must prefer the model when present and keep the primitive as the
fallback — the same idiom `loadLandmarkModel` already uses for buildings. **Do that wiring once, on
the first piece you deliver**, then every later piece is data only.

> **Bounding box is a contract.** The game builds a collision box from `w`/`d` (plus 0.3 m) and
> the piece is placed into a fixed anchor slot. A model larger than its declared box will clip
> through a wall or another piece. Model to fit **inside** the box, not to fill it exactly.

---

### T1.1 — Straw Bed
**File:** `fur_dorm_bed.glb`  ·  **Box:** 2.0 W × 3.4 D × 0.9 H  ·  **Budget:** 1,200 tris
**Base colour:** `#7a5a6a` (frame), pillow `#d8d0e8`

Build a student's bed for a magical academy dormitory, in flat-shaded low-poly KayKit style.

- Simple rectangular wooden frame, four short square legs (~0.12 m section) lifting the mattress
  to ~0.35 m. Frame timber colour `#7a5a6a`.
- A straw/linen mattress as a slightly rounded box filling the frame, ~0.25 m thick.
- One pillow at the **head end**, which is **+Y in Blender** (the game rotates the piece so the head
  faces the wall). Pillow `#d8d0e8`, ~0.8 × 0.5 × 0.2 m, tilted a few degrees.
- A folded blanket across the lower third, in a contrasting muted colour — this is the one piece of
  colour that makes the bed read as *lived in* rather than as a slab.
- Optional headboard up to 0.9 m total height, with a simple carved arch or a single star cutout.
  **Do not exceed 0.9 m** — that is the declared box height.

Keep the underside closed (a single flat face is fine). The camera never goes below floor level.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"bed"` → add `model:"fur_dorm_bed.glb"`.

---

### T1.2 — Study Desk
**File:** `fur_dorm_desk.glb`  ·  **Box:** 2.4 W × 1.2 D × 1.1 H  ·  **Budget:** 1,200 tris
**Base colour:** `#8a6a3a`

A scribing desk for a wizard student. Flat-shaded, low-poly, KayKit palette.

- Rectangular writing surface ~2.2 × 1.0 m at 1.0 m height, ~0.08 m thick, front edge slightly
  overhanging.
- Four square legs (~0.14 m), tapering very slightly, with one cross-brace near the floor.
- A small raised shelf or lip along the **back** edge (the +Y side in Blender, which faces the wall).
- On the surface: an inkwell, a stack of two or three parchment sheets, and one closed book, all as
  simple blocks. These are the details players actually notice, and they cost ~150 tris total.
- No chair. Chairs are a separate slot; a chair modelled into the desk will intersect one.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"desk"` → add `model:"fur_dorm_desk.glb"`.

---

### T1.3 — Woven Rug
**File:** `fur_dorm_rug.glb`  ·  **Box:** 3.2 W × 2.4 D × 0.04 H  ·  **Budget:** 300 tris
**Base colour:** `#8a3a2a`

A flat woven rug. This is the one asset here where a **texture beats geometry**.

- A single subdivided plane (≈ 6 × 4 quads) with very slight vertical noise, ≤ 1 cm, so the edges
  do not read as a razor-cut decal.
- A short fringe along the two **short** ends: a row of small tapered prisms, not individual
  strands.
- **One 512 px texture** carrying the pattern: a deep red field `#8a3a2a`, a woven border, and a
  simple arcane motif in the centre — a seven-pointed star (one point per school of magic).
  Diffuse only, no normal map.
- Total thickness must stay ≤ 4 cm. The rug is deliberately excluded from collision, so a thick
  one makes the player look like they are floating.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"rug"` → add `model:"fur_dorm_rug.glb"`.

---

### T1.4 — Arcane Brazier
**File:** `fur_dorm_brazier.glb`  ·  **Box:** 0.9 W × 0.9 D × 1.4 H  ·  **Budget:** 2,000 tris
**Base colour:** `#5a4a8a`, flame `#ff9440`

A standing brazier — the dorm's light source. The game attaches a real `PointLight` at
**y = 1.7 m** above the origin, so the bowl must read as the source of it.

- Three-legged wrought stand, legs splaying to a ~0.85 m footprint, meeting a narrow column.
- A shallow bowl at the top, outer rim ~0.55 m radius, sitting so its opening is at **≈ 1.4 m**.
- Coals/embers inside the bowl as a low mound of chunky faces. Give **only these faces** a separate
  material with **Emission strength ~2.0, colour `#ff9440`** so the bowl glows on its own.
- Do **not** model flames. The game does not animate imported geometry here and a static flame
  mesh reads as broken. Emissive coals plus the engine's point light is the whole effect.
- Wrap the column in a simple engraved rune band — three or four inset rectangles is enough.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"brazier"` → add `model:"fur_dorm_brazier.glb"`.
Leave the existing `light:{...}` field exactly as it is.

---

### T1.5 — Bookshelf
**File:** `fur_dorm_bookshelf.glb`  ·  **Box:** 2.6 W × 0.6 D × 2.4 H  ·  **Budget:** 1,200 tris
**Base colour:** `#4a3a2a`, books `#8a3a2a` + variations

A wall bookshelf. **Wall-mounted piece: put the origin at the base centre of the BACK face**, i.e.
the face that touches the wall is at Y = 0 in Blender, and the shelf extends toward -Y.

- Carcass 2.6 W × 2.4 H × 0.55 D, open front, with **three** fixed shelves splitting it into four
  bays. Frame ~0.06 m stock.
- Books as **grouped blocks, not individual volumes**: per bay, two or three leaning clusters of
  4–8 spines each, with varied heights and two or three different spine colours. Leave one bay
  deliberately half-empty — a completely full shelf reads as wallpaper.
- One or two horizontal stacks lying flat, and a single scroll (a short cylinder) as a set dressing.
- Books must sit **forward** in each bay so they are visible from the room, not buried in the
  carcass. This is exactly the mistake the procedural version made and had to be fixed.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"bookshelf"` → add `model:"fur_dorm_bookshelf.glb"`.

---

### T1.6 — School Banner
**File:** `fur_dorm_banner.glb`  ·  **Box:** 1.6 W × 0.15 D × 3.0 H  ·  **Budget:** 300 tris
**Base colour:** *none — see below*

A hanging cloth banner, wall-mounted. Origin at the base centre of the back face.

- A horizontal wooden crossbar at the top (~1.7 m wide, 0.06 m radius) with two short brackets
  into the wall.
- The cloth: a plane ~1.5 × 2.6 m hanging from the bar, with **3–4 vertical waves** modelled in so
  it reads as fabric, and a **pointed or swallow-tail bottom edge**. Double-sided.
- Small tassels or weights at the bottom corners.

> **CRITICAL — do not colour the cloth.** This piece takes the **player's school colour** at
> runtime (`dorm.js` sets `color: null` and the game substitutes it). Give the cloth material a
> **pure white (`#ffffff`) Base Color** and name the material exactly **`SchoolTint`** so the wiring
> can find and recolour it. The crossbar and tassels may be a fixed wood colour.
>
> The wire-up for this one is **not** data-only: `world.js` must find the `SchoolTint` material on
> the loaded model and set its colour from `piece.color`, the way `setPlayerColor` already
> recolours the player's robe. Follow that existing pattern.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"banner"` → add `model:"fur_dorm_banner.glb"`.

---

### T1.7 — Wall Sconce
**File:** `fur_dorm_sconce.glb`  ·  **Box:** 0.4 W × 0.4 D × 0.8 H  ·  **Budget:** 300 tris
**Base colour:** `#6a5b9e`, flame `#ffc94d`

A small wall light. Origin at the base centre of the back face. The game attaches a `PointLight`
at **y = 2.4 m** — note that is *above* this model's own box, because the sconce is mounted high on
the wall; build the model at its own local scale and let the placement handle the height.

- A short iron bracket curving out from a small wall plate.
- A cup or half-bowl holding a candle stub or a floating rune-stone.
- Give the flame/stone faces an **emissive material, `#ffc94d`, strength ~2.5**. As with the
  brazier: emissive geometry only, no modelled fire.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"sconce"` → add `model:"fur_dorm_sconce.glb"`.

---

### T1.8 — Slab Display Case
**File:** `fur_dorm_case.glb`  ·  **Box:** 1.2 W × 0.8 D × 2.0 H  ·  **Budget:** 1,200 tris
**Base colour:** `#2a1f4d` plinth, glass `#9fd8ff`

The single most important prop in the dorm: it is where the player shows off a graded, serialised
card slab. Wall-mounted; origin at the base centre of the back face.

- A solid plinth from 0 to 0.9 m, 1.2 × 0.8 m, with a moulded cap.
- Above it, a **glass display box** from 0.9 to 2.0 m: four corner posts and a top frame in the
  plinth material, with **separate flat panes** as its faces.
- The panes must be their **own material**, named exactly **`CaseGlass`**, Base Color `#9fd8ff`,
  **Alpha 0.22**, Blend Mode Alpha Blend, **Backface Culling OFF**, roughness ~0.1.
- **Leave the interior completely empty.** The game draws the slab itself, as a small emissive card
  at **y ≈ 1.5 m**, tinted by grade (gold ≥ 98, silver ≥ 92, green below). A modelled card inside
  the case would z-fight with it.
- A small engraved nameplate on the front of the plinth is a nice touch and costs ~20 tris.

**Wire-up:** `public/dorm.js` → `FURNITURE` → `id:"case"` → add `model:"fur_dorm_case.glb"`.

---

### T1.9 — Cinder Wyrm Trophy
**File:** `trophy_cinder_wyrm.glb`  ·  **Box:** ~1.4 W × 1.4 D × 1.8 H  ·  **Budget:** 2,000 tris
**Base colour:** `#8a3a2a`

The reward for killing the boss of Cinderhollow Caverns. Currently a dodecahedron on a cylinder —
it is *derived* from the save (`worldState.dungeons.cinderhollow_caverns.bossDead`), so it appears
the moment the Wyrm dies, and it deserves to look like a prize.

- **Octagonal stone plinth**, ~0.9 m wide, 0.5 m tall, colour `#2a1f4d`, with a chamfered top edge.
- On it, a **draconic skull** ~1.2 m long: long snout, prominent brow ridges, two swept-back horns,
  empty eye sockets, a suggestion of teeth as a simple serrated strip. Low-poly and angular — this
  should read at 10 m, not reward close inspection.
- Skull colour `#8a3a2a` shading toward bone at the horns.
- Give the **eye sockets** a small emissive insert, `#ff6b3c`, strength ~1.5 — a dead thing that
  still glows is exactly the note this game wants.
- Total height including plinth **must not exceed 1.8 m**.

**Wire-up:** `public/dorm.js` → `TROPHIES` → `id:"cinder_wyrm"` → add `model:"trophy_cinder_wyrm.glb"`.
Same fallback wiring as the furniture.

---

### T1.10 — Drowned Archon Trophy *(new content, not just a replacement)*
**File:** `trophy_drowned_archon.glb`  ·  **Box:** ~1.4 W × 1.4 D × 1.8 H  ·  **Budget:** 2,000 tris
**Base colour:** `#2c4a58`

The Drowned Vault has a boss (the Drowned Archon, Lv 14) and **no trophy yet** — the `TROPHIES`
table in `dorm.js` currently has one entry. This model plus one table row fixes that.

- Same octagonal plinth silhouette as T1.9 so the two read as a matched set — a trophy shelf, not
  two unrelated objects.
- The trophy itself: a **waterlogged crown or a barnacled ceremonial helm**, cracked, with strands
  of weed and two or three barnacle clusters.
- Palette cold and drowned: `#2c4a58` base, verdigris `#3f7a6a` in the crevices, bone-white
  barnacles.
- A faint emissive `#4a7a8e` in the interior gaps, strength ~1.0.

**Wire-up:** add to `public/dorm.js` → `TROPHIES`:
```js
{ id:"drowned_archon", dungeon:"drowned_vault", name:"The Archon's Crown", icon:"👑",
  color:0x2c4a58, h:1.8, model:"trophy_drowned_archon.glb" },
```
`trophyPlacements` already handles multiple trophies (corners first, then a row in front), and
`tools/test.mjs` already asserts trophies never land on furniture at any tier — so this row is
covered by existing tests the moment you add it.

---

# TIER 2 — the academy campus

These are the props a player walks past constantly on the hub map.

---

### T2.1 — Courtyard Fountain
**File:** `prop_fountain.glb`  ·  **Box:** ~11 W × 11 D × 5.5 H  ·  **Budget:** 2,000 tris
**Base colour:** `#9aa0b8` stone, water `#3a86c8`, orb `#7be0ff`

The centrepiece of the academy courtyard at `(0, -18)`. Currently three stacked cylinders and a
sphere.

- **Basin:** octagonal or 12-sided, outer radius 5.5 m, inner 4.8 m, 1.1 m tall, stone `#9aa0b8`.
  Model the inner floor so it reads as holding water.
- **Water surface:** a separate flat disc at ~0.95 m, radius 4.6 m, its own material named
  **`Water`**, Base Color `#3a86c8`, roughness 0.15, alpha ~0.8.
- **Central column:** ~3.0 m tall, tapering, with a smaller tier bowl partway up.
- **Floating orb:** a faceted sphere ~0.95 m radius, its centre at **4.5 m**, hovering above the
  column with a visible gap — it is arcane, not plumbing. Emissive `#7be0ff`, strength ~1.5.
- Carve simple rune panels into the outer basin faces. Add worn edges: this is an old academy.
- **No water jets or streams.** Nothing animates it, so static arcs read as glass rods.

**Wire-up:** this is currently drawn from `ZONE.decor.fountain`. Convert it to a real landmark:
add an entry to `public/structures.js` → `LANDMARKS` with `x:0, z:-18`, `fit:"width"`, `size:11`,
then remove `fountain` from the academy's `decor` block and run `node tools/sync-zones.mjs`.
Check the obstacle radius in `OBSTACLES` still matches the new footprint.

---

### T2.2 — Street Lamp
**File:** `prop_lamp.glb`  ·  **Box:** ~0.6 W × 0.6 D × 5.0 H  ·  **Budget:** 600 tris
**Base colour:** `#3a3a46`, light `#ffd98a`

Eight of these line the academy paths. Currently a cylinder with a glowing sphere on top.

- Square or octagonal base block ~0.5 m, tapering wrought-iron post to **5.0 m**.
- A small decorative collar two-thirds up.
- At the top, a **four-panelled lantern housing** (~0.5 m cube, open-framed) containing a floating
  rune-stone rather than a candle.
- Rune-stone material emissive `#ffaa44`, strength ~2.0. Housing frame `#3a3a46`; leave the panels
  as open holes, not glass — open frames read better at this poly count.
- **Total height exactly 5.0 m**, light centre at 5.0 m, so the existing light placement still lines
  up.

**Wire-up:** the lamp positions live in the academy zone's `decor.lamps` array. Either add a
`lampModel` field to the decor block and load it in `world.js` alongside the procedural fallback,
or promote the eight positions to `PROPS` entries in `structures.js` (preferred — it puts them on
the same data path as everything else). Re-run `node tools/sync-zones.mjs`.

---

### T2.3 — Crystal Spire (distant skyline)
**File:** `prop_spire.glb`  ·  **Box:** ~3.2 W × 3.2 D × 14 H  ·  **Budget:** 400 tris
**Base colour:** `#9fb8ff`, tip `#7be0ff`

Eight of these ring the academy at radius ~130 m as skyline dressing. They are **never approached**
— budget accordingly, and do not add detail nobody can reach.

- A tapering hexagonal crystal shaft, ~12 m, wider at the base, with two or three smaller crystals
  clustered at its foot.
- A faceted icosahedral tip, ~1.6 m radius, at ~13.6 m. Emissive `#7be0ff`, strength ~0.7.
- **Flat shading, hard edges only.** A smooth-shaded crystal at this distance shimmers badly.
- One material for the shaft, one for the emissive tip. Nothing else.

**Wire-up:** `decor.spires` in the academy zone, same options as T2.2.

---

### T2.4 — Fishing Spot / Shoreline node
**File:** `node_fishing.glb`  ·  **Box:** ~2.4 W × 2.4 D × 1.6 H  ·  **Budget:** 600 tris
**Base colour:** wood `#6a4a2b`

**The only gathering-node kind with no model at all.** `nodes.js` → `NODE_MODELS` has `crystal`
and `wood`; `pond` falls through to a bare procedural mesh. Lake Arcanum has **fourteen** of these
scattered along its shore, so this is the single highest-count missing asset in the game.

- A small **fishing stand on the shoreline**: two or three short wooden posts driven into the
  ground, a leaning plank or half-jetty ~2 m long extending toward the water (**-Y in Blender**,
  which the game rotates toward the lake), and a coil of rope.
- Dress it with one of: a net on a frame, a wicker fish basket, or a leaning rod. Pick **one** —
  three would be clutter at this size.
- Weathered wood, muted greens on the waterline posts.
- Origin at the **land end** of the jetty, at ground level, since that is where the player stands to
  interact.
- Keep it **under 1.6 m tall**: the interaction prompt floats above it and a tall prop pushes the
  prompt out of frame.

**Wire-up:** `public/nodes.js` → `NODE_MODELS`, add:
```js
pond: { url:"./assets/models/node_fishing.glb", h:1.6 },
```
That single line covers every fishing spot in every zone, present and future.

---

### T2.5 — Zone Gateway Arch
**File:** `prop_gateway.glb`  ·  **Box:** ~6 W × 2 D × 7 H  ·  **Budget:** 1,200 tris
**Base colour:** `#5a4a8a`, glow `#7be0ff`

Zone exits are currently invisible trigger volumes with minimal dressing — the player walks toward
the edge of the map and hopes. A visible arch at each gateway is the clearest possible signal that
*this is a way out*, and there are now **four** of them (academy↔forest, forest↔lake).

- Two heavy stone pillars ~5.5 m tall, 1.0 m square, ~4.5 m apart, on a shared plinth step.
- A carved lintel or a broken arch across the top, reaching ~7 m.
- A **thin vertical plane between the pillars**, its own material named **`Portal`**, Base Color
  `#7be0ff`, **emissive strength ~1.2, alpha ~0.25**, Alpha Blend, backface culling off.
- Rune bands carved into the inner faces of both pillars.
- Origin at ground level, centred **between** the pillars, so the model straddles the exit point.
- Deliberately weathered and asymmetric — one pillar slightly leaning, some stones missing.

**Wire-up:** add an optional `model` field to zone `exits` entries in
`public/world/zones.json`, and load it in `world.js`'s zone-exit block the same way
`dungeonEntrances` already loads `de.model` with a procedural fallback. Keep the trigger radius
(`EXIT_RADIUS = 3.0`) unchanged — the arch is a signpost, not the trigger.

---

# TIER 3 — dungeon modular kit

Both dungeons are built from `BoxGeometry` walls and `PlaneGeometry` floors. A **modular kit**
replaces all of them at once, in both dungeons, with one set of models — the highest leverage
work in this file.

> **Read `public/dungeons.js` before starting.** Wall segments are emitted by `wallsForRoom` as
> axis-aligned boxes of **arbitrary length**, split either side of doorways. A modular kit must
> therefore either tile along a wall's length or be authored as a **1 m unit** the game repeats.
> **Recommendation: model a 1 m wall segment** and have `world.js` instance it along each emitted
> wall box. Confirm that approach before modelling a fixed-length piece that will not fit.

### T3.1 — Dungeon wall segment
**File:** `dng_wall_1m.glb`  ·  **Box:** 1.0 W × 1.2 D × 8.0 H  ·  **Budget:** 400 tris
Cut stone blockwork, irregular courses, a chipped top edge. **Must tile seamlessly on X** — the
left and right faces have to be identical so a run of them shows no seam. Neutral grey-violet;
the game tints it per dungeon via `wallColor`, so keep the base **near-white/light grey** or the
tint will compound into mud.

### T3.2 — Dungeon floor tile
**File:** `dng_floor_2m.glb`  ·  **Box:** 2.0 × 2.0 × 0.1  ·  **Budget:** 200 tris
Flagstones, 4–6 per tile, slightly uneven heights (≤ 2 cm), a few cracked. **Must tile on both X
and Y.** Same near-white base for the same tinting reason.

### T3.3 — Dungeon pillar
**File:** `dng_pillar.glb`  ·  **Box:** 1.2 × 1.2 × 8.0  ·  **Budget:** 400 tris
A square structural pillar with a base and capital, to break up long walls. Optional per-room
dressing, placed via each room's `props` array.

### T3.4 — Rubble / debris set
**File:** `dng_rubble_set.glb`  ·  **Box:** ~2 × 2 × 0.6  ·  **Budget:** 300 tris
A loose scatter of fallen blocks and gravel, to drop into corners. Non-solid; pure dressing.

**Wire-up for T3.1–T3.2:** this needs a change in `world.js`'s dungeon-room block (currently
lines ~178–198), which builds the floors and walls. Instance the models along each emitted wall
box and across each room rect, keeping the existing primitives as the fallback. **Do not change
`dungeons.js`** — it decides the geometry and must stay pure and headless-testable.

---

# TIER 4 — the duel arena (`battle3d.js`)

The in-duel arena is entirely procedural and deliberately so: *the duel screen must never wait on
a download to look like anything.* Any model here **must** be loaded lazily with the current
primitives kept as an instant-on fallback. Do not regress that.

### T4.1 — Arena pillar (colonnade)
**File:** `arena_pillar.glb`  ·  **Box:** ~1.2 W × 1.2 D × 6.0 H  ·  **Budget:** 800 tris
Fourteen positions ring the pit at radius 8.3 (the front arc is deliberately left open so the
camera is not shooting through a fence). Fluted column, moulded base, a square capital block at
~5.6 m. Colour `#554b7d` shaft, `#6a5f96` capital.

### T4.2 — Arena brazier
**File:** `arena_brazier.glb`  ·  **Box:** ~0.9 × 0.9 × 1.2  ·  **Budget:** 600 tris
Sits **on top of** every other pillar capital, at ~5.9 m. Shallow bowl on a short stem, emissive
coals `#ffb05a`. As always: no modelled flame — the game adds a flickering point light.

### T4.3 — Arena banner
**File:** `arena_banner.glb`  ·  **Box:** ~1.2 W × 0.1 D × 2.8 H  ·  **Budget:** 300 tris
Six hang on the **far arc only** — hung on the near arc they sit between the camera and the fight
and simply block the shot, which is exactly what the first attempt did. Waved cloth with a
swallow-tail hem, on a short crossbar. Give the cloth a material named **`TeamTint`** in white so
the game can colour it per side (`#2f6f8a` for you, `#7a3550` for the opponent).

---

# TIER 5 — visible equipment (partly blocked — read this first)

`BACKLOG.md` §2 lists **"visual equipment on 3D character"** as unstarted, and this is where the
Blender work for it would go. **Do not start modelling until the attachment system exists**, or you
will produce a pile of weapons with nowhere to hang.

What is missing in code, and must land first:
1. ✅ **Already confirmed** (Aug 2026): `player_wizard.glb` was auto-rigged by
   `tools/rig-character.py` and its skeleton **does** expose usable named bones — `Head`, `Neck`,
   `LeftHand`, `LeftForeArm`, `LeftArm`, `LeftShoulder`, and the mirrored right side, plus
   `Spine`/`Spine1`/`Hips` and the legs. A weapon can be parented to `RightHand` directly.
2. `world.js` needs an attachment helper: given a bone name and a GLB, parent it with a local
   offset. Nothing like it exists today.
3. `game.js` already tracks equipped items (`S.loadout`, `equipmentFor`), so the *data* is there —
   only the 3D binding is missing.

Once that exists, the models are straightforward, and this repo **already ships CC0 KayKit
weapons that may be enough**: `wpn_sword_A`, `wpn_axe_A`, `wpn_hammer_A`, `wpn_bow_A`,
`wpn_shield_A`, `wpn_staff_A`, `wpn_staff_B`, `wpn_wand_A`. **Check these first** — new models may
be unnecessary. What is genuinely absent is **per-school robes and hats** (7 schools), and there is now a hard
reason this cannot be solved by tinting alone: **`player_wizard.glb` is a single mesh with a single
material and one texture set.** There is no robe submesh, no hat submesh, nothing to recolour
separately — the in-game school appearance therefore works by hue-rotating the whole character in
HSL (preserving the painted texture's luminance) plus a school-coloured ground aura. That is the
ceiling of the free approach. Genuinely different *garments* require either seven generated robe
meshes or a modular character base (Quaternius Modular Character Outfits, CC0), and the latter
means replacing **every** character for style consistency — see `docs/DESIGN-DECISIONS.md` §4.

---

# Appendix A — priority order, if you want one

1. **T2.4 Fishing spot** — 14 in-world instances, currently no model at all. One line to wire up.
2. **T1.8 Display case** + **T1.9 / T1.10 Trophies** — the payoff props of the dorm.
3. **T1.1 / T1.2 / T1.5** bed, desk, bookshelf — the bulk of what makes the dorm a room.
4. **T2.1 Fountain** — the courtyard centrepiece, seen on every session.
5. **T3.1 / T3.2 Dungeon kit** — one model pair upgrades two whole dungeons.
6. **T2.5 Gateway arch** — legibility win: four instances, tells the player where the world continues.
7. Everything else.

# Appendix B — a note on `docs/ASSET-BUDGET.md`

Its §1 still says *"Still procedural primitives: Library, Smithy, Merchant Stall, Student Dorms"*.
**That is stale** — all four have used CC0 KayKit hex models (`hex_castle`, `hex_blacksmith`,
`hex_market`, `hex_home_A`) since the CC0 import pass. Correct that line when you next touch the
file so nobody models a building that already exists.
