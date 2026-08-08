# CLAUDE README — Arcane Legends: Wizard TCG

**This file is the complete onboarding document for Claude Code (or any AI collaborator) working on this project through the GitHub repo.** Read it fully before touching any code. It explains the vision, the architecture, every system, the conventions, and how to build/deploy/test.

---

## 1. The Project in One Paragraph

**Arcane Legends** is a browser-based, mobile-first open-world collectible card game that blends **Wizard101** (magical academy, school identity, duels) with **OSRS** (gathering, skilling, crafting, economy, progression). You explore a **3D academy campus**, gather and refine resources, **scribe spell cards**, grade them into collectible **slabs**, build decks, and duel AI rivals or real players online. The core loop is:

> **gather → refine → scribe → grade → slab → deckbuild → duel → progress**

It is **NOT an idle/menu simulator.** All skilling, crafting, and activities happen **interactively in the 3D world** — you walk to a node to gather, enter a hall to craft, talk to an NPC to start a quest or duel. The 2D systems (collection, deckbuilder, market) are overlays that open on top of the world.

**Live URL:** https://magic-woodland-396.higgsfield.gg/
**Deploy game_id:** `128d122c-a09a-4312-b89f-31224452ba25`
**GitHub repo:** https://github.com/OfficialSyntaxx/arcane-legends-academy (user `OfficialSyntaxx`)

---

## 2. The Design Vision (non-negotiable)

The player should feel like **a rising master wizard at a magical academy**, building a legendary card collection and a thriving magic guild, constantly rewarded with new cards, gold, gear, and dueling decisions that visibly matter.

Design pillars (from the source design doc, "The Arcanum Academy"):
1. **One-minute-to-fun** — a clear next action within seconds of loading.
2. **Meaningful idle-adjacent progression** — skills/resources progress even in short sessions.
3. **Collectible satisfaction** — every card has real value; grade, foil, and slab serials make each card feel tangible.
4. **Seamless social fantasy** — a living academy with AI students, professors, merchants, and real players.
5. **Readable mobile-first gameplay** — clean, touch-friendly, one primary action per screen.

**Hard rules for any new feature:** it must improve at least one of — progression, collection value, social life in the hub, duel depth, mobile usability, or long-term retention. Otherwise cut it.

---

## 3. Architecture & Tech Stack

- **Colour management (important):** `renderer.outputEncoding = sRGBEncoding` + ACES tone mapping, plus a dim procedural environment map for PBR reflections. three r128 has **no** automatic colour management, so any hand-authored hex colour must be run through `convertSRGBToLinear()` — see `mat()`/`srgb()` in `world.js`. Without this, generated glTF models render ~2 stops dark and look muddy compared to the Tripo/Higgsfield viewer. Light intensities are tuned for this corrected pipeline; do not raise them back.
- **Client:** Vanilla JavaScript (ES modules) + **Three.js r128** (vendored UMD build) for the 3D world, with a DOM-based UI for the 2D overlays. PWA-installable (manifest + mobile meta tags).
- **3D model loading:** `GLTFLoader.js` (r128 addon, vendored) for generated `.glb` character models.
- **Online duels:** a **server-authoritative turn-based rules module** (`logic.js`) passed to the game platform as `code`. It runs in a sandbox (no imports, no timers, pure functions) and is the referee for 2-player online matches.
- **Persistence:** `localStorage` for all client-side meta progression (collection, skills, gold, deck, quests, home, market). Not authoritative — just the player's local save.
- **Hosting:** the game platform's `deploy_game` tool (NOT a website builder). It serves the `public/` folder as-is and runs `logic.js` for online rooms.

### File layout
```
wizard-tcg/                 (the repo root)
├── CLAUDEREADME.md         ← this file
├── README.md               public-facing overview
├── logic.js                online-duel rules module (server-authoritative)
├── package.json            (type: module, for the node test runner)
├── public/                 the game client (deployed as-is)
│   ├── index.html          the game page (all UI + boot)
│   ├── cards.js            card catalog + grading + elemental matrix
│   ├── items.js            skills, materials, equipment, recipes, home upgrades
│   ├── nodes.js            gathering-node table (data; world.js builds the meshes from it)
│   ├── structures.js       buildings, NPC positions, obstacles + the collision resolver (data)
│   ├── terrain.js          procedural heightmap + ground-colour maths — PURE, no THREE (WORLDSPEC §5)
│   ├── worldconfig.js      zone loading/validation/defaults, chunk + zone-exit helpers — PURE
│   ├── dungeons.js         dungeon layout (rooms/corridors/walls) — PURE (WORLDSPEC §6); compiles
│   │                       a dungeon to the same zone shape world.js already renders
│   ├── zonequests.js       field quests given by world NPCs — PURE, save-derived progress
│   ├── onboarding.js       the guided first-session chain — PURE, every step derived from the save
│   ├── academy.js          curriculum years + perks (quest gold / market discount / XP) — PURE
│   ├── reputation.js       per-NPC standing + reward bonuses — PURE
│   ├── dorm.js             the player's dorm: tiers, furniture slots/placement, display cases,
│   │                       trophies — PURE; compiles to a zone by reusing dungeons.js
│   ├── charcreate.js       character creation + per-school appearance numbers — PURE
│   ├── tint.js             the per-school hue shift, as a fragment-shader patch (shared by
│   │                       world.js and preview3d.js so the preview cannot drift from the world)
│   ├── preview3d.js        the rotating 3D character preview on the creation screen
│   ├── vfx.js              spell visual-effect archetypes, chosen from a card's own fx — PURE
│   ├── world/zones.json    the zone catalog (academy, whispering_forest, lake_arcanum)
│   ├── world/dungeons.json the dungeon catalog (cinderhollow_caverns, drowned_vault)
│   ├── audio.js            procedural WebAudio: SFX, ambience, music (no asset files)
│   ├── game.js             engine: skills, economy, market, auctions, housing, duels, AI
│   ├── world.js            the 3D world (Three.js scene, movement, camera, NPCs, zones, dungeons)
│   ├── battle3d.js         the 3D duel arena (colonnade + pads) and spell VFX playback
│   ├── cdn.js              CDN-vs-local model URL resolution (modelUrl / CDN map)
│   ├── strings.js          ALL player-visible text (external on purpose)
│   ├── manifest.json       PWA manifest
│   ├── vendor/             pinned libs (three.min.js, GLTFLoader.js, DRACOLoader.js, draco/)
│   └── assets/             generated art: character GLBs (models/), landmarks (buildings/)
├── models_cdn/              git-tracked source copies of large GLBs (not deployed — see cdn.js)
├── tools/                  headless test suites + asset pipeline
│   ├── sync-cards.mjs      regenerates the logic.js catalog from cards.js (--check in CI)
│   ├── sync-zones.mjs      regenerates the academy zone in zones.json (--check in CI)
│   ├── test.mjs            engine tests (297 checks)
│   ├── logic-test.mjs      online-rules tests (34 checks)
│   ├── ui-smoke.mjs        UI boot smoke + engine/string/id binding checks
│   ├── browser-test.mjs    real-Chromium responsive + input-gesture + world/quest/dorm/lake/VFX suite (86 checks)
│   ├── model-check.mjs     loads AND renders every shipped GLB in a real browser (npm run check:models)
│   ├── compress-models.mjs Draco + WebP compression for the GLBs (npm run compress)
│   └── rig-character.py    Blender-as-a-module auto-rigger for unrigged generated characters
├── BACKLOG.md              whole-game feature backlog + recommended phase order
├── WORLDSPEC.md            world architecture blueprint (zones, terrain, chunks, dungeons)
├── design/                 design docs (plan, thresholds, asset manifest)
└── docs/
    ├── NEXT-PHASE-PLAN.md  the ORIGINAL systems audit (Phases A-D) — historical, superseded by
    │                       BACKLOG.md/WORLDSPEC.md for anything current; kept for context
    ├── ASSET-BUDGET.md     what's generated, platform costs, CC0 sources, licensing
    └── DESIGN-DECISIONS.md open design questions + answers (interiors, 3D duels, outfits)
```

---

## 4. The 3D World

> **World expansion blueprint:** see [`WORLDSPEC.md`](WORLDSPEC.md) — zone-based architecture, zone config schema, chunk streaming, procedural terrain, and dungeon instancing. **All five implementation steps in WORLDSPEC §9 are done** (config/data model, terrain, chunk streaming, zone transitions, dungeon instancing); step 6, the content pass, is in progress — see §9 below for what's left.

The world is **multi-zone** and chains end to end: a hub campus (`academy`) → `whispering_forest` (streaming outdoor zone, through a walkable gateway) → `cinderhollow_caverns` (instanced dungeon, through a doorway in the forest) → `lake_arcanum` (third outdoor zone, through the forest's west gateway) → `drowned_vault` (second dungeon, under the lake). All five are built in Three.js — procedural terrain/geometry plus generated GLB characters and landmarks. Key facts:

- **Camera:** auto-follow, **drag-to-rotate** (orbit), **pinch-to-zoom**, camera-relative movement, and **collision** (re-clamped along its own bearing after the follow lerp, or an orbit around a building can sweep the camera through a corner even when both endpoints are clear). Touch joystick on the left, drag on the right, tap-to-move.
- **Movement:** WASD/arrow keys (bound to `event.code`), touch joystick, gamepad thumbstick, tap-to-move. The player walks the terrain heightmap (`groundY`), and **water is solid** — movement retries each axis alone so the player slides along a shoreline instead of stopping dead.
- **Zones** are data (`public/world/zones.json`), validated by `worldconfig.js` (`validateZone`, `validateExits`): bounds, terrain params (seed/biome/amplitude/waterLevel), buildings/landmarks/props/NPCs/resource nodes/exits. `academy` is *generated* from `structures.js`/`nodes.js` by `tools/sync-zones.mjs` (`npm test` fails if stale); `whispering_forest` and `lake_arcanum` are hand-authored pure JSON, proof that a new zone needs no engine change.
- **Zone transitions:** walking onto an exit rebuilds the world for the target zone and drops the player at the *reciprocal* exit, so the two zones join up geographically. Two anti-ping-pong guards: the arrival point is offset inward, and the trigger arrives disarmed until the player walks clear.
- **Chunk streaming:** each zone's scattered content (props/nodes/enemies with a `count`) is bucketed into chunks once and only load/unload deltas are applied on each chunk-boundary crossing, with load/unload hysteresis and GPU disposal on unload.
- **Water:** a zone with a `waterLevel` must set `baseHeight` **above** it. Flattening pins the spawn, NPCs, landmarks and dungeon mouths to `baseHeight`, so a lake that rises past it opens the zone with everything standing underwater — and `validateZone` will not say a word (`lake_arcanum`: `baseHeight 4.0` against `waterLevel 3.2`). A resource node may ask for `nearWater`, which makes `scatterZone` place it on the shoreline; fishing spots otherwise land on hilltops, technically valid and completely wrong.
- **Ground colour:** the terrain is painted with vertex colours per point (height bands, bare rock on steep slopes, a shoreline band, low-frequency mottling) — no textures, so nothing to author or compress. See `terrain.js groundColorAt`.
- **Dungeons** (`dungeons.js` + `world/dungeons.json`): a dungeon *compiles to a zone* — rooms/corridors/walls become the zone's obstacles and floor meshes, so entering one is just another zone transition and every zone-transition guarantee (reachability, no ping-pong, saved position) applies for free. Enemy kills, cleared rooms and boss defeat persist in `worldState.dungeons[id]` and defeated enemies do not respawn. `cinderhollow_caverns` (4 rooms + the Cinder Wyrm, from the forest) and `drowned_vault` (5 rooms + the Drowned Archon, from the lake) ship. A dungeon may declare its own `floorColor` / `wallColor` / `bossFloorColor` / `lightScale` / `lightTint`, defaulting to the original palette — so the second dungeon is not the first one reskinned.
- **Field quests** (`zonequests.js`): NPC-given quests out in a zone (gather/slay/clear/boss/visit objectives), separate from the duel-ladder `QUESTS` in `game.js`. State split: what the player *chose* (`accepted`/`done`) is saved, what they *achieved* is derived from inventory/dungeon state every time it's read — the same pattern as onboarding, below.
- **Stations** (each opens an in-world overlay or dialogue):
  - Scribing Hall → Scribing overlay (refine + scribe cards)
  - Smithy → Forge overlay (smelt, forge equipment, brew)
  - Library / Professor → quests
  - Merchant / Merchant Vell → market
  - Duel Arena / Referee → PvP
  - Duel Trainer → practice duel
  - Student Dorms → home
  - Librarian → daily challenge
  - Forest NPCs (Sage Rowan, Warden Brisk, a pedlar) → field-quest dialogue, built from `zonequests.js` data rather than hand-written per NPC
- **Gathering nodes** (data in `public/nodes.js`): ore crystals (copper/tin/iron/silver/gold/mithril/runite), wood stumps (oak/willow/magic), ponds (shrimp/salmon/lobster/shark). Each grants a material + skill XP. Ore and wood nodes render as **CC0 KayKit rock/tree** models (`NODE_MODELS`), falling back to the procedural mesh if a GLB fails — see §4.1 and `ASSETS.md`.
- **NPCs:** Professor, Merchant, Referee, Trainer, Librarian, wandering students, and the forest quest-givers — all with dialogue.
- **Character models:** generated via 2D→3D (`.glb`), normalised to `CHARACTER_HEIGHT = 2.6` (`structures.js`) — the larger of the skeleton span and the mesh box, since a hat or cloak can extend past either. Skinned models drive the player from a mixer clip; NPCs get a procedural walk cycle keyed on Mixamo-style bone names (see §9.4). Every character/prop/landmark load retries a local copy if the CDN fetch fails (`makeCharModel`/`loadLandmarkModel`), verified by a test that the CDN map and the local fallback files actually agree.
- **Buildings & landmarks:** declared in `structures.js` (`BUILDINGS`, `LANDMARKS`, `PROPS`) and loaded by `loadLandmarkModel`. The everyday campus is **CC0 KayKit**; the **Central Tower and Duel Arena are generated Tripo** models — the two hero landmarks. Placement is data, never hand-written into `world.js`, and `npm test` fails if anything is sealed inside geometry or points at a missing file.
- **CDN model loading:** large models (>1MB) are hosted on the Higgsfield CDN and loaded at runtime via `cdn.js` (`modelUrl()`), with a local-copy retry on failure. Local copies live in `models_cdn/` (git, not deployed) and are also copied into `public/assets/models/` as the fallback target. See `ASSETS.md` §CDN.
- **Model integrity:** `tools/model-check.mjs` (`npm run check:models`) loads and *renders* (twice — a corrupt attribute only throws on GPU upload, not on the frame the model is added) every shipped GLB in a real browser. This exists because four models were silently broken in the repo (two failed to parse, two rendered but threw every frame) with nothing catching it — `world.js` degrades a load failure to the procedural stand-in with only a console warning.
- **Unrigged generated characters:** `tools/rig-character.py` (Blender as a Python module — `pip install bpy`) auto-rigs a static A-pose GLB: skeleton + skinning (bone-heat fails on generated meshes, so weights come from measured bone proximity) + baked Idle/Walk clips built on a *standing* pose, not the bind pose (a small swing layered on an A-pose still reads as a T-pose). See `ASSETS.md` for the specific failure modes it works around (skirt/leg weight bleed, per-limb swing-axis derivation).
- **Duel arena** (`battle3d.js`): a procedural pit — stone floor, inlaid rune circle, a raised pad per duellist, a colonnade with lit braziers, team banners, fog. The arena band sits *above* the duel UI (it used to be a competing `flex:1`, which cut the player's hand in half). Camera fits the whole stage by solving for a distance where every corner of the play volume projects inside the frustum, rather than a fixed position tuned for one aspect ratio.
- **Spell VFX** (`vfx.js` + `battle3d.js`): six procedural archetypes — bolt, burst, rain, aura, beam, glyph — chosen from a card's own `fx` list and school, zero assets. Effect *lifetime* runs on the wall clock, not the frame loop's capped `dt` — using the capped value meant a throttled frame rate stretched every effect indefinitely.

### 4.1 Importing free 3D assets (itch.io / CraftPix / KayKit…)

We can reuse free low-poly assets even though most ship as `.fbx`. Pipeline: **everything ends up as a resized `.glb`** before it enters the game. One command does it all:

```bash
node tools/import-asset.mjs <url|path> [--name out.glb] [--out public/assets/models] [--resize 512] [--target-height 6]
```

It will: download (if a URL) → convert FBX/GLTF→GLB → resize textures to 512px → **print raw height + scale-to-target + texture status** (flags blank 1px textures).

**Import checklist (do these before wiring a model into `world.js`):**
1. **License first.** Prefer CC0 / "free for commercial use" packs (KayKit, Kenney, etc.). If the pack requires attribution, note it in the README. Do NOT ship unmodified copies as-is.
2. **Format.** `.fbx` and `.gltf`/`.glb` are supported by the script. `.obj` is not — use the pack's gltf/fbx version or convert in Blender first.
3. **Run the script** and check the output:
   - `textures: N` — if it prints `⚠ BLANK (1px)` or `0 textures`, the pack is untextured (renders flat white). Skip it or retexture.
   - `raw height` / `scale to Nu` — free assets use arbitrary units. Set `model.scale` to the printed scale (or pass `--target-height` to match world units: characters ~1.8, trees/rocks ~3–6, buildings ~6–8).
4. **Wire it into `world.js`:** characters via `makeCharModel(key, url, group)` (auto-detects skinned vs static, scales to target); props/buildings via `new THREE.GLTFLoader().load(url, gltf => { resize + scene.add })` or a small loader helper.
5. **Keep the deploy under ~50MB.** The script resizes textures to 512px; if the folder still grows too big, run `gltf-transform resize` at 256px or drop the lowest-use models.
6. **Verify in-game** (walk to it, confirm scale + that it looks right), then commit + push.

**Tools:** `@gltf-transform/core` + `@gltf-transform/functions` (read/resize/write GLB), `fbx2gltf` (binary FBX→GLB). Installed as npm dependencies (see `package.json`).

**In use:** `kaykit_tree.glb` + `kaykit_rock.glb` (in `public/assets/models/`) are from the **KayKit Forest Nature Pack** by Kay Lousberg — **CC0** (free for commercial use, no attribution required; details in the pack's `License.txt`). Wired in via `loadProp()` in `world.js` as woodcutting + mining nodes.

**Free-asset backlog:** see [`ASSETS.md`](ASSETS.md) — the curated list of recommended CC0/free packs (buildings, terrain, dungeons, characters, animations, crafting props) plus the pipeline reminder. Bring them in one at a time through `tools/import-asset.mjs`.

## 5. The Card Systems (core gameplay)

### 5.1 Schools & elemental identity
- **7 schools:** Fire, Ice, Storm, Myth, Life, Death, Balance.
- **Character creation:** a questionnaire (3 questions) that suggests a school, or a manual pick. Player can change their school anytime (home screen).
- **School affinity:** creatures of your school gain **+1 attack** in duels.
- **Elemental damage matrix** (non-transitive ring, +1 damage when you counter): Fire > Ice > Storm > Myth > Life > Death > Fire. Balance is neutral.
- Each school grants its own **starter cards** when picked.

### 5.2 Card types
- **Creature** — cost/atk/hp; keywords: haste, taunt, drain, multiAttack, heal-on-play, buff-all. Mutual combat (attacker and defender trade damage).
- **Spell** — targeted damage, AoE, heal, shield, buff-all, draw, freeze.
- **FIELD** — persistent effect on the board (e.g., +1 attack to all your creatures, heal per turn, +1 pip per turn).
- **TRAP** — played face-down; triggers when the enemy plays a creature (damage) or attacks (shield). Hidden from the opponent in `viewFor`.

### 5.3 Duel rules
- Wizard HP 100 (raised by equipment). **5-card opening hand**, draw 1/turn. **20-card deck**, max 3 copies per card.
- **Pips (mana):** start at 1, +1 per turn (capped 10). Hearthstone-style refresh each turn.
- **30-second turn timer** (local duels).
- Win by reducing the opponent's HP to 0. **Fatigue** if a deck empties (escalating damage).

### 5.4 Scribing (card creation)
- Refine raw materials into **canvas** (from wood), **ink** (from fish), **reagent** (from ore) via the Scribing skill.
- Spend 1 canvas + 1 ink + 1 reagent to **scribe a random card**. Higher Scribing skill raises the grade roll.

### 5.5 Grading & slabs
- Cards have a hidden roll (0–100). **Grade 1–10** bands. Grades **9–10 (Mint / Gem Mint) become slabs** with a unique serial number and a foil treatment.
- **Regrade:** re-roll a graded card's grade for a higher fee (risk/reward — it can go up or down).
- Card value = rarity base × grade multiplier.

### 5.6 Deck building
- Loadout screen: equip 5 gear slots + build a 20-card deck (max 3 copies). School cards encouraged by the affinity bonus.

---

## 6. The RPG / Progression Layer

### 6.1 Skills (OSRS-style, levels 1–99)
- **Mining, Fishing, Woodcutting** — gather from world nodes (level-gated tiers).
- **Smithing** — smelt ore → bars, forge equipment from bars.
- **Alchemy** — brew healing potions from fish.
- **Scribing** — refine card materials + scribe cards.

### 6.2 Equipment & loadout
- 5 slots: **Wand, Hat, Robe, Boots, Amulet**. Metal tiers Bronze → Rune. Stats: +Atk, +Def, +MaxHP, +Pip, +Gold. Equipment enhances duels (these apply locally, not in online fair duels).

### 6.3 Home & guild
- Buy a guild hall, upgrade rooms (Treasury +gold, Library +card drops, Armory +gear stats, Tavern +skill XP) with gold + timber.

### 6.4 Economy
- **Gold sources:** quest wins, PvP wins, selling cards/items, auction sales, gathering.
- **Gold sinks:** booster packs, bazaar, grading/regrade fees, housing, smithing/alchemy.
- **Market:** Bazaar (NPC buy/sell, grade-aware) + Auction House (NPC-driven bids).

### 6.5 Quests & PvP
- **8 quest bosses** (Rookie Battle Mage → The Archon) with a tuned difficulty curve — the *duel ladder*, `QUESTS` in `game.js`.
- **Character creation** (`charcreate.js`) — name, school and look with a live 3D preview; the per-school appearance is a shader hue-shift plus a coloured aura, not a per-part outfit. See §6.9 for why.
- **Field quests** (`zonequests.js`) — separate from the duel ladder: things to do in a *place*, given by NPCs out in the world (gather/slay/clear/boss objectives, prerequisites, a quest log). Ten ship: five in the Whispering Forest leading into Cinderhollow Caverns, and five at Lake Arcanum leading into the Drowned Vault, gated behind killing the Cinder Wyrm so the zones are met in order. `validateQuests` proves the chain is completable and that no prerequisite is missing or cyclic.
- **Local PvP:** dueling AI wizards (and a practice duel with the Trainer).
- **Online PvP:** real players via `logic.js` — create a room, share the invite link (two tabs = two players).

### 6.6 Onboarding
A 7-step guided first session (`onboarding.js`): school → gather → refine → scribe → grade → deck → first duel, shown as a persistent objective bar on every screen (including the 3D world). Every step's `done` check is **derived from the save**, never tracked as a separate counter — a player who scribes before being told to is not stuck re-asked to do it, because the check just asks the save "have you scribed a card" and the answer is already yes. Same pattern used by `zonequests.js` progress.

### 6.7 Academy curriculum & NPC reputation
- **Curriculum** (`academy.js`): 7 years (Novice → Archmage — the same names/thresholds the old cosmetic "academy rank" always used, so no save's rank silently changed), each unlocking real perks: bonus quest gold, a market discount on cards, bonus wizard XP. `game.js academyPerks(s)` is the one place both the duel-ladder reward path (`completeQuest`) and `buyCard` read from.
- **NPC reputation** (`reputation.js`): standing with quest-giving NPCs specifically (Stranger → Acquainted → Friendly → Trusted → Honored), raised by turning in that NPC's field quests, granting a reward bonus on top of the curriculum bonus. The two systems stack without knowing about each other — `zonequests.js` hands back a base reward and stays pure; the UI layer (`turnInQuest` in `index.html`) applies both bonuses and raises reputation.
- Both show on the Hall screen: a Curriculum panel (current year, perks, progress to next) always, a Reputation panel once the player has any.

### 6.8 The dorm (`dorm.js`) — the Dorm phases D1–D4
The Student Dorms used to be a *menu*: its station prompt set `screen="home"` and that screen was a
stats page plus four numeric upgrade tracks. It is now a place.

- **D1 — a real interior.** `dormZone(save)` compiles the room into the same ZONE shape `world.js`
  already renders, by **reusing `dungeons.js`** (`layoutDungeon` + `dungeonZone`) rather than
  repeating it: a dorm is a one-room dungeon with no enemies. Zone transitions, saved position,
  interior lighting and camera collision therefore all work with **no new engine code**. The
  doorway is a stub corridor to a small "porch" room — that corridor is what makes
  `wallsForRoom` emit the south wall in two pieces instead of one box that would seal the player in.
- **The interior seam is generic.** A building in `structures.js` declares `interior:"dorm"`, and
  `interiorFor(stationId)` is what `index.html` consults. The Scribing Hall and Smithy get
  interiors the same way (`docs/DESIGN-DECISIONS.md` §1) with no change to the entry path.
- **The dorm is recompiled on every entry**, not registered once at boot, because its geometry
  depends on the save (tier, furniture). Recompiling is pure maths over one room and removes a
  whole class of staleness bug. It is *also* registered at boot when the player owns a dorm, so
  quitting inside it does not silently teleport them to the hub on the next load.
- **D2 — furniture.** A catalogue with slot *kinds* (floor / wall / case); slots are authored as
  **fractions of the room** so the same table works at every tier. `placementProblem` enforces
  kind, ownership and occupancy in the pure module, not in the UI. Bought with gold + timber —
  existing sinks, no new currency. Every piece is a **procedural primitive**: zero new asset bytes.
- **D3 — display cases and trophies.** The save stores only `slot -> card uid`; grade, serial and
  name are read from the live card, so **selling a displayed slab empties its case** rather than
  leaving a ghost (there is a test for exactly that). Trophies are *never stored at all* — they
  are derived from `worldState.dungeons[...].bossDead`, so they cannot desync from the world.
- **D4 — upgrades became visual.** Room size, wall/floor colour and slot count are derived from the
  total `HOME_UPGRADES` levels already bought. The bars the player was filling now have a physical
  readout instead of only a percentage.
- **Interiors are not all caves.** The dungeon light rig assumes every room ships torches; the
  first build of the dorm inherited it and rendered as a black box with a bed in it. Zones now
  declare `lightScale`/`lightTint` instead of inferring darkness from `interior`. Checked by
  **rendering a frame and reading pixels** — `world.renderOnce()` exists for that, because a
  Playwright screenshot of a WebGL canvas comes back blank once the drawing buffer is cleared.

### 6.9 Character creation & per-school appearance (`charcreate.js`, `tint.js`, `preview3d.js`)
A three-step creation screen — name, school, look — with a **live rotating 3D preview**. Each step's
`done` is DERIVED from the save (same rule as onboarding/dorm), so backing out, reloading or
changing school later cannot desync a step cursor, because there isn't one.

**The constraint that shapes everything here:** `player_wizard.glb` is **one mesh, one material,
one texture**, and that material's Base Color is **white** — all of its colour lives in the map.
So:
- There is no robe/hat/trim submesh to recolour. Per-part outfits are impossible without new
  geometry (see `BLENDERTODO.md` Tier 5).
- `material.color` **cannot rotate a hue** — multiplying white by orange darkens, it does not
  re-hue a purple robe. The old `setPlayerColor` lerped 45% toward a flat school colour, which is
  why every school came out the same washed purple.
- The shift therefore happens in the **fragment shader** (`tint.js` patches `<map_fragment>`):
  each sampled texel goes to HSL, its hue rotates toward the school's **the short way round the
  wheel**, saturation scales, lightness is *preserved* (so the painted shading survives), and
  near-grey texels are left alone so the face does not become a mask.
- **`strength` must stay ≥ 0.75.** Tuned to 0.4–0.85 first, and rendering it showed why that is
  wrong: from a purple base, a 70% rotation toward Fire's 16° *stops at magenta*. Every school
  landed between purple and its own colour and none arrived. `validateLooks` enforces the floor.
- Variants (Standard/Deep/Pale/Worn) vary **saturation and lightness only** — never hue. Hue is
  the school's identity and a blue Fire wizard makes the school unreadable.
- A **school-coloured ground aura** (off / ring / drifting motes) does the unambiguous half of the
  job: a hue shift on a dark robe is subtle at camera distance, a coloured rune ring is not.

`preview3d.js` is its own tiny renderer, not world.js with the scenery removed — creation runs
before the world exists and can be reopened from the Dorm while a world is already running. It
imports the **same `tint.js`**; two copies of that maths would drift and make the preview a lie.

### 6.10 Retention
- **Daily quests** (win duels / gather materials / scribe cards) with a gold + card reward.
- **Academy rank** (Novice → Apprentice → … → Archmage) — now a real curriculum, not just a label; see §6.7.

---

## 7. Conventions & Rules (follow these)

1. **All player-visible strings live in `public/strings.js`** (or the data files `cards.js`/`items.js`). Zero UI string literals in game code.
2. **Keyboard bindings use physical `event.code`** (`KeyW`, `Space`), never typed letters — they break on non-Latin layouts.
3. **All asset/module references are RELATIVE paths** (the game is served under a subpath). Never root-absolute.
4. **The STYLE_FORMULA** (approved storybook fantasy) is embedded in every generated asset prompt. Keep the look consistent.
5. **Third-party libs are vendored** into `public/vendor/` (pinned). No CDN hotlinks.
6. **`logic.js` must stay pure** — no imports, no timers. Its card catalog is **generated**: edit `public/cards.js`, then run `npm run sync`. The block between the `<<< GENERATED CARD CATALOG` markers is machine-written and `npm test` fails if it is stale — never hand-edit it. (It also exports `MAX_TURNS` alongside the six rules functions.)
7. **Hidden info is masked server-side** in `viewFor` (opponent hand, deck, traps) — never in the client.
8. **Mobile-first** — touch controls, 44px minimum tap targets, responsive layout, safe-area insets. Everything must work touch-only, in portrait *and* landscape. World input goes through **Pointer Events with per-pointer tracking** (never touch/mouse events separately) — that is what keeps drag-to-rotate, tap-to-move and pinch-to-zoom from interfering. Verify changes with `npm run test:browser`.
9. **Deterministic duel logic** — pass a seed to `startDuel(...)` (or set `state.seed` online) and a duel replays exactly. Do not reintroduce module-level shared RNG in `logic.js`: it is one sandbox across every room.

---

## 8. How to Run, Test, Deploy

### Run locally
```bash
cd public && python3 -m http.server 8080   # then open http://localhost:8080
```
(ES modules need a server, not `file://`.)

### Test
```bash
npm test                     # runs all three suites; fails the run on any failure
```
Individually:
```bash
node tools/test.mjs          # 297 engine checks (economy, combat, world/zone/dungeon/quest/dorm data)
node tools/logic-test.mjs    # 34 online-rules checks
node tools/ui-smoke.mjs      # UI boot smoke test
npm run test:browser         # 8 viewports + input gestures + world/dungeon/quest/dorm/VFX flows, real Chromium (86 checks)
npm run check:models         # loads AND renders every shipped GLB in a real browser
```
`npm test` is the fast headless suite and gates every push. `npm run test:browser` needs a
Chromium download (`npx playwright install chromium`) and runs as its own CI job — it is the
only thing that exercises the 3D world's input layer, because `createWorld()` needs WebGL.
CI runs `npm test` on every push (`.github/workflows/test.yml`). All three suites resolve
paths relative to the repo — never hardcode an absolute sandbox path into a tool again; the
old `ui-smoke.mjs` did, threw ENOENT before its `process.exit`, and reported a false pass for
several commits.

### Deploy (the game platform)
Use the `deploy_game` tool:
- `code` = `logic.js` (the online rules module)
- `assets_dir` = `public/` (contains `index.html` + everything)
- `meta` = `{title, description, thumbnail, favicon}` (thumbnail/favicon are stable https CDN URLs from generated images)
- **Re-deploying an update:** pass the SAME `game_id` (`128d122c-a09a-4312-b89f-31224452ba25`) with the full content again. The URL stays the same.
- A deploy can 404 for ~60s before propagation.

### Git / GitHub
- The repo is `https://github.com/OfficialSyntaxx/arcane-legends-academy`.
- The user's fine-grained PAT is used for push (the account is `OfficialSyntaxx`). When pushing via the terminal, temporarily set the remote URL to include the PAT as the username, then scrub it back to the clean URL. **Never commit the token.**
- Keep the local git repo (at `wizard-tcg/`) synced: commit + push after each feature change.

---

## 9. Current State & Where We Left Off

> **The authoritative trackers are [`BACKLOG.md`](BACKLOG.md) (whole-game feature status, checked
> off as things land) and [`WORLDSPEC.md`](WORLDSPEC.md) (world-architecture implementation
> order, §9). Check those first for "is X done yet" — this section is a narrative summary, not
> the source of truth for checkbox state.** The old phase-by-phase audit that used to live here
> (Phases A–D, the original correctness/systems pass) is archived in `docs/NEXT-PHASE-PLAN.md`
> for historical context; everything in it is done and superseded by the two docs above.

**All tests green:** 297 engine / 34 online-rules / 86 real-browser (layout + gestures + world +
dungeon + quest + VFX flows) / `check:models` (every shipped GLB loads and renders). `npm test`
gates every push.

**What's working, end to end:**
- Full card/duel/economy loop: schools, elemental matrix, all 4 card types, grading/slabs,
  scribing, skills, equipment, home/guild, market/auctions, daily quests, local + online PvP.
- **A multi-zone 3D world**, not just a single campus: the `academy` hub, a streaming outdoor
  zone (`whispering_forest`, reached through a walkable gateway) with its own NPCs and field
  quests, and an instanced dungeon (`cinderhollow_caverns`, reached through a doorway in the
  forest) with persistent kill/room/boss progress. All of **WORLDSPEC §9's five implementation
  steps are done** — config/data model, terrain, chunk streaming, zone transitions, dungeon
  instancing.
- **Painted terrain** (vertex-colour height bands, rock on slopes, shorelines, mottling) — no
  textures, so no assets to author or compress for the ground.
- **A rigged, animated player character** with a proper standing pose (not a bind-pose T-pose),
  scaled correctly (`CHARACTER_HEIGHT = 2.6`), via `tools/rig-character.py` for any future
  unrigged generated character.
- **A guided first session** (`onboarding.js`) that actually walks a new player through the whole
  loop, and **field quests** (`zonequests.js`) that give the forest a reason to exist.
- **Spell VFX** (six procedural archetypes) and a **duel arena that reads as a place** (colonnade,
  rune circle, raised pads) rather than a flat coloured disc.
- **Academy curriculum + NPC reputation** (`academy.js` / `reputation.js`) — the academy rank that
  used to be a cosmetic label now unlocks real perks (quest gold bonus, market discount, XP
  bonus), and standing with quest-givers stacks its own bonus on top.
- **Model integrity is actively checked** (`tools/model-check.mjs`) after finding four silently
  broken GLBs in the repo that no existing test caught (`world.js` degrades a load/render failure
  to the procedural stand-in with only a console warning — invisible in play).

**SCALE: 1 world unit = 1 metre.** Characters are `CHARACTER_HEIGHT = 2.6` (not 1.8 — that read as
anatomically correct but *looked* tiny, because the normalisation measures the full bounding box
and a pointed hat is ~28% of it). Halls are 7–10.5m tall and 13–15m wide, the tower is 40m, the
arena 25m across, `WORLD_BOUND` (academy) is 72. **Keep new geometry on this scale.**

**Two planning documents for asset work, both current:**
- **`docs/ASSET-BUDGET.md`** — platform costs (Higgsfield vs Tripo vs Meshy), free CC0 sources,
  the free-tier licensing trap.
- **`docs/DESIGN-DECISIONS.md`** — building interiors, 3D duel staging, character-creation/outfit
  system.
- **`ASSETS.md`** — the CDN pipeline, the compression pipeline and its two known traps
  (`gltf-transform optimize` decimates by default; the `webp` pass must run *before* Draco or it
  silently ships uncompressed geometry), and the auto-rig pipeline's specific failure modes
  (bone-heat fails on generated meshes; a robe tears at the hem if legs are gated by height
  instead of distance; limb swing axes must be derived per-bone, not assumed).

### Where we left off

**Last landed: character creation + per-school appearance, and `BLENDERTODO.md`.**

`BLENDERTODO.md` is new and is the file to hand a Blender agent: a complete modelling brief for
**every asset in the game that is still a procedural primitive** — all eight pieces of dorm
furniture, both boss trophies, the fountain, street lamps, crystal spires, the fishing-spot node
(the only gathering-node kind with no model at all, and there are 14 of them in Lake Arcanum), a
zone gateway arch, a modular dungeon wall/floor kit, and the duel arena's pillars and banners.
Each brief carries exact dimensions, hex colours, triangle budget, origin placement, and the exact
table row in this repo to edit afterwards — plus the shared rules (scale, style, export settings)
and the pipeline traps this project has already paid for. `docs/ASSET-BUDGET.md` §1 was corrected
while writing it: it still claimed the Library/Smithy/Market/Dorms were procedural, which stopped
being true at the CC0 import pass.

**Character creation** (§6.9) is a three-step screen — name, school, look — with a live rotating
3D preview. The headline finding, and the reason this took a shader rather than a colour
assignment: **`player_wizard.glb` is one mesh with one material whose Base Color is white**, so
`material.color` can only darken, never re-hue. The old `setPlayerColor` lerped 45% toward a flat
school colour, which is why all seven schools looked like the same washed purple. `tint.js` now
patches `<map_fragment>` and rotates each sampled texel's hue in HSL, the short way round the
wheel, preserving lightness. Shared by `world.js` and `preview3d.js` so the preview cannot lie.

Two bugs here were only visible in a render, and both are now covered by browser checks:
- **Fire came out magenta.** `strength` was tuned to 0.4–0.85 on the theory that a partial
  rotation looks more natural. From a purple base, 70% of the way to Fire's 16° *stops at
  magenta* — every school landed short of its own colour. Floor is now 0.75 and `validateLooks`
  enforces it.
- **My new full-screen creation modal swallowed the mouse wheel**, breaking "wheel zooms the
  camera" in the gesture suite. A real regression, caught by the suite, not by me.

Also fixed: the header read "step 3 of 3" above an empty name box, because `progress()` returned
the *count of finished steps* where the UI wanted the *position of the current one* — the same
confusion `onboarding.js` had already been fixed for.

Tests: **316 engine / 34 online-rules / 95 browser / 8 viewports / model-check clean.**

**Before that: WORLDSPEC step 6, the content pass — the world is now a chain, not a pair of rooms.**
`lake_arcanum` (third outdoor zone) and `drowned_vault` (second dungeon, 5 rooms + the Drowned
Archon) ship, plus five new field quests, so the route runs academy → Whispering Forest →
Cinderhollow Caverns → Lake Arcanum → the Drowned Vault. **All six WORLDSPEC steps are now done**;
further world work is content and polish against settled schemas, not architecture.

Almost all of it was authoring against existing schemas. The three things that were not:
- **`nearWater` on a resource node.** `scatterZone` knew what to *avoid* (water, steep slopes) but
  not what a thing wants to be *near*. The first pass put all fourteen fishing spots up to 40m
  inland on hilltops — every one of them "valid". Ignored, not failed, in a zone with no water.
- **`baseHeight` above `waterLevel`.** Flattening pins the spawn, the NPCs and the dungeon mouth
  to `baseHeight`, so a lake whose surface rose above it opens the zone with everyone standing
  underwater — and nothing in `validateZone` says a word. The lake sets `baseHeight: 4.0` against
  `waterLevel: 3.2`, and there is now a test asserting every authored point is above its own water
  line, plus one asserting the lake covers 12–55% of the zone.
- **Per-dungeon palettes.** `floorColor` / `wallColor` / `bossFloorColor` / `lightScale` /
  `lightTint` pass through `dungeonZone`, defaulting to the original look, so the Drowned Vault
  reads as cold flooded stone rather than Cinderhollow with different creatures in it. Same seam
  the dorm's lighting added — one mechanism, two users.

Also fixed here: **a flaky VFX check**, not caused by this work. `the bolt spell effect renders`
sampled lit pixels once at a fixed 320ms delay, which is racy for a travelling projectile — it
came in at 1.14x against a 1.15x threshold with nothing actually wrong. It now takes the *peak*
over the effect's life, which is what "did it render" means.

Tests: **297 engine / 34 online-rules / 86 browser / 8 viewports / model-check clean.**

**Before that: the Dorm phases D1–D4, all four, shipped together.** The Student Dorms stopped
being a menu and became a place you walk into, furnish, and display things in — see §6.8 for the
architecture. New pure module `dorm.js`; the interior seam in `structures.js` is generic
(`interior:` + `interiorFor`) so the Scribing Hall and Smithy can follow with no new entry-path
code. Also landed alongside it, from the docs review: the home/hall/dorm naming collision resolved
in favour of **"Dorm"** everywhere user-facing (save keys deliberately unchanged — `S.home` stays,
so no migration risk), `docs/plan.md` marked HISTORICAL in favour of `design/plan.md`, and the
duplicated housing entries in `BACKLOG.md` §7 pointed at §2.

Two bugs were found by *looking at the render*, not by a test, and both are now covered by one:
the room inherited the dungeon light rig and came out a black box (fixed with per-zone
`lightScale`, and `world.renderOnce()` added so a test can read pixels — a Playwright screenshot
of a WebGL canvas comes back blank); and the trophy landed on top of the bed after two layout
attempts (fixed by moving trophies to the corners, the one band no slot reaches, plus a test that
tries every slot filled at every tier).



Before that, a user-provided model swapped in as the outdoor **Duel Arena landmark**
(`public/assets/buildings/arena.glb`) — a Tripo "magic circle" platform (rune floor, pillar ring,
braziers), compressed 1.12MB → 0.71MB through the existing pipeline. Verified before pushing:
rendered standalone (raw upload and the compressed file separately, to catch any compression
damage — none found), `tools/model-check.mjs` clean, in-game debug confirms correct scale/position
(fit:"width" → 25m), and the full `browser-test.mjs` suite green including the specific
16-direction camera-orbit check next to the arena (the one that exists precisely to catch a camera
clipping into landmark geometry). Confirmed with the user that this landmark is **decorative
collision only** — duels never place the player inside its footprint; pressing the duel trigger
switches `screen` to `"duel"` and renders the separate `battle3d.js` procedural pit instead, so the
landmark's own walkability/platform never matters gameplay-wise. Pushed as `208aa7a`.

Before that, in order: Academy curriculum + NPC reputation (§6.7), spell VFX and a rebuilt duel
arena (the *procedural* in-duel one, `battle3d.js` — not to be confused with the outdoor landmark
above), field quests for the Whispering Forest, the onboarding chain, dungeon-enemy persistence
(fixing a gap left by the initial dungeon-instancing commit — kills weren't actually sticking), a
rigged player character with a standing pose, painted terrain, and WORLDSPEC steps 3–5 (chunk
streaming, zone transitions, dungeon instancing).

### The Dorm phases (D1–D4) — ✅ DONE

All four shipped. What follows is the plan as written; §6.8 is the architecture as built. What is
deliberately *not* done: no furniture GLBs (every piece is a procedural primitive), no per-tier
wall/floor *textures*, and the dorm is still the only interior — the seam for the Scribing Hall
and Smithy exists but neither has been authored.

What existed before this was *not* a dorm: it was an abstract menu. `Student Dorms` was a building
in `structures.js` (id `home`, at 0,32) whose station prompt jumped straight to `screen = "home"`,
and `renderHome()` was a stats-and-upgrades page — buy the hall for 200g, then level four
**numeric** upgrades. No interior, no furniture, no placement, no display, nothing spatial. The
building's door was a menu button.

The phases as planned, ordered smallest-playable-first — all four now shipped:

- **D1 — Dorm interior as a real space.** Walk through the door into an actual interior *zone*
  rather than a menu. This is not new engine work: a dungeon already compiles to a zone
  (`dungeons.js` → `dungeonZone`), so an interior is the same trick with a room, walls, a door
  exit and no enemies. Deliverable: a pure `dorm.js` producing the room layout + furniture anchor
  slots, wired through the existing `changeZone` path. The `screen="home"` page stays reachable as
  the *management* UI (upgrades, stats) — D1 adds the place, it doesn't delete the panel.
- **D2 — Furniture placement.** A pure placement model in `dorm.js`: a catalogue of furniture
  items, a set of anchor slots per room, validation (slot type, no overlap, ownership), and
  `S.home.furniture` persisted in the save + a `migrate()` bump. Bought from the Merchant with
  gold and crafted timber, so it plugs into the economy sinks that already exist. Keep the maths
  pure — `world.js` only reads the resolved layout.
- **D3 — Display cases & trophy room** (`BACKLOG.md` §2, §7). This is the one with real pull: the
  game already mints graded slabs with unique serials and already tracks boss defeats. A case that
  physically shows *your* highest-graded slab, and a trophy that appears once the Cinder Wyrm is
  down, turns two existing systems into something visible. **Derive what's displayable from the
  save** (the pattern used by `onboarding.js` / `academy.js` / `zonequests.js`) — store only the
  player's *choice* of which slab sits in which case, never a copy of the card.
- **D4 — Dorm upgrades become visual.** Tie the four existing `HOME_UPGRADES` levels to what the
  room actually looks like (bigger room, more slots, better fittings per tier) so the numeric
  progression that already ships gains a physical readout instead of a progress bar.

**Next up, in order** (nothing below started):
1. **WORLDSPEC step 6, the content pass** — a second dungeon and a third outdoor zone. This is
   mostly authoring `zones.json`/`dungeons.json` entries now that the engine work (terrain,
   streaming, transitions, instancing) is done; see WORLDSPEC §3/§6 schemas.
2. **Academy §2 remaining items** (`BACKLOG.md` §2) — a real character-creation screen with a 3D
   preview and per-school outfit visuals (`docs/DESIGN-DECISIONS.md` §4 has the design), and
   visual equipment on the 3D character.
3. **Academy classes/curriculum content** beyond the perk unlocks that just landed — the
   curriculum currently only grants numeric bonuses; there's no lesson/class *content* yet.
4. Everything else unstarted is tracked in `BACKLOG.md` — PvP ranking/leaderboards, guilds, pets,
   card variants/evolution, and the long-term endgame section are all still `[ ]`.

**Suggestions worth considering (not yet on the backlog, flagged while working nearby):**
- **A second landmark pass on the arena's collision circle.** It was kept at the old model's
  radius (r=13) by inheritance, not re-measured against the new mesh's actual footprint. Tests
  confirm no camera clipping, but if the visual rim and the invisible collision wall ever look
  mismatched to a player walking the edge, re-measure `w`/`d` in `structures.js` against the new
  GLB's bounding box the way `ASSETS.md` §Import checklist describes.
- **The outdoor arena landmark could eventually BE the duel space**, matching the Wizard101
  reference more closely — walk up, get visually drawn toward the platform, camera cuts to the
  `battle3d.js` view. Right now the two are unconnected (a decorative building outside, a fully
  separate procedural scene for the fight). Not urgent, but worth a design pass once step 6
  content is in, since it's the kind of polish that reads as "one game" rather than "a menu on
  top of a 3D backdrop."
- **A general "verify before trusting" pattern for future asset swaps**: this session's arena
  work is a decent template — render standalone, render post-compression, run `model-check.mjs`,
  confirm via debug hooks in-game, then run the *specific* existing test that would catch the
  failure mode you're worried about (here: the camera-collision orbit check) rather than assuming
  a fresh screenshot proves anything on its own. Worth keeping as the default checklist for any
  future generated-model integration, character or landmark alike.

**Refinements flagged during the docs review (2026-08-08)** — all four are now done, and were done
as part of the dorm work rather than left as notes:
- ✅ **Naming collision: "home" meant two things.** `S.home` / `buyHome` / `HOME_UPGRADES` /
  `screen="home"` were the *guild hall* meta-progression while the building labelled "Student
  Dorms" was the physical place — with the nav tab reading "Hall", the NPC saying "Your Home" and
  the building saying "Dorms". Resolved in favour of **"Dorm"** everywhere user-facing. Save keys
  were deliberately left alone (`S.home`, `buyHome`, `HOME_UPGRADES` all stay), so there is no
  migration risk and no second name for the same field. "Guild hall" is gone — guilds are a
  separate unstarted item (`BACKLOG.md` §8) and the old name was borrowing from it.
- ✅ **The `home` station skipped a step every other building takes.** `library` and `tavern` are
  `noStation:true` (decorative); `scribe`/`smith`/`market` open a working screen. `home` opened a
  screen too, so the dorm interior is the *first* time a campus building became a place you enter.
  Made generic rather than special-cased: a building declares `interior:"<id>"` and
  `interiorFor(stationId)` is the seam the entry path reads, so the Scribing Hall and Smithy
  (`docs/DESIGN-DECISIONS.md` §1) need only room content, not entry-path code.
- ✅ **Housing is listed twice in the backlog**, as §2 "Dorm customization / display cases / trophy
  room" and again as §7 "Housing furniture / slab display cases / boss trophies". Same feature,
  two sections. §2 is now the canonical entry; §7's duplicates point at it.
- ✅ **`docs/plan.md` and `design/plan.md` are near-identical copies** of the same original design
  doc. `docs/plan.md` now carries a HISTORICAL banner pointing at `design/plan.md` as the maintained one.

## 10. Roadmap (in priority order)

1. ~~**Dorm phases D1–D4**~~ — ✅ done; architecture in §6.8.
2. ~~**WORLDSPEC step 6 — content pass**~~ — ✅ done; all six steps complete.
3. ~~**Character creation & 3D preview**~~ — ✅ done (§6.9). Still open from this line: **visible
   equipment on the 3D model** (unblocked — the rig exposes `RightHand`/`LeftHand`, and the repo
   already ships CC0 KayKit weapons) and genuinely different **per-school garments**, which needs
   new geometry rather than tinting — `BLENDERTODO.md` Tier 5.
4. **Deepen the Academy curriculum** — actual class/lesson content, not just the numeric perks
   `academy.js` already grants.
5. **Collection depth** — card evolution, foil/holo variants, an encyclopedia (`BACKLOG.md` §5).
6. **Social layer** — PvP ranking, guilds, leaderboards (`BACKLOG.md` §8).
7. **Endgame** — pets/mounts, prestige, seasonal content (`BACKLOG.md` §10).

---

*This document is the source of truth for AI collaborators. If you change architecture or add a system, keep this file updated — including the "Where we left off" note above, so the next session knows exactly what to pick up.*