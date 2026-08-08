# Changelog — Arcane Legends: Wizard TCG

> Reverse-chronological. Companion docs: `CLAUDEREADME.md` (state + "Where we left off"), `BACKLOG.md` (feature backlog), `WORLDSPEC.md` (world architecture), `ASSETS.md` (asset library).

## 2026-08-08 — UI redesign: bottom nav + muted palette
- **Bottom navigation bar** (mobile-RPG convention) replacing the top nav — the tabs (World, Hall, Skills, Collection, Loadout, Market, Quests, Duel) now sit at the bottom of the screen, above the safe area, evenly spaced and fully visible on mobile (verified at 412px).
- **Softer, more elegant palette** replacing the cartoonish bright purple + saturated gold: deep charcoal/slate backgrounds with a muted champagne-gold accent, softer borders and buttons, and a gold-tinted quest bar (no more purple banners or pillars).
- All 8 nav tabs fit on mobile (min-width tuning so nothing is cut off).

## 2026-08-07 — Input, camera, and noclip fixes
- **Input controls no longer inverted**: the touch joystick's Y axis was mapping screen-down (positive) to *forward*, so pushing the stick UP moved the player backward. Negated the touch-joystick Y so pushing up moves forward (away from the camera). Keyboard/gamepad were already correct.
- **Smoother camera**: the follow used a fixed `0.12`/frame lerp (frame-rate dependent — sluggish at low fps, wavy during fast rotation). Replaced with a time-based exponential ease (`1-exp(-dt*k)`): pulls in quickly on collision, eases out smoothly, frame-rate independent.
- **No noclip through map trees/rocks**: the map-collision footprints now include sub-building shapes (threshold lowered from 2u to 0.8u), so map trees/rocks/structures and snow hills all block the player (alongside the existing elevated-surface check).

## 2026-08-07 — Player collision against the GLB map geometry
Reusing the camera-collision raycasts, the player now collides with the baked maps:
- **Can't walk through buildings**: `mapBlocks(x,z)` raycasts down onto the map and blocks the player where the surface is elevated (a building wall / steep terrain) OR where (x,z) sits inside a building's 2D footprint (so a hollow structure's interior also blocks). Integrated into movement with slide-along-wall behaviour, NPC wanderers, and teleport (a teleport into a building is rejected).
- **Sits on the terrain surface**: for map zones the player's ground height now follows the map's actual surface (`mapSurfaceY`) instead of the spawn floor, so they no longer sink slightly into the ground.
- Fixed a temporal-dead-zone bug (groundY referenced `chars` before its declaration) that initially broke the world boot.
Verified in-game: teleporting into the academy tower's wall is rejected (player stays on open ground), and the player stands on the surface (Y=0.5). Deployed + pushed.

## 2026-08-07 — Camera collision against the GLB map geometry
The camera now collides with the baked maps' buildings and terrain via raycasts against the loaded map model:
- **Terrain**: the camera is always kept above the map surface (raycast down at the camera position), so it no longer sinks into hills or white-outs on the snow/mountains maps.
- **Buildings**: the player→camera view ray is raycast against the map, pulling the camera in before any structure it would clip through (both on the main follow step and the post-step orbit correction).
Verified in-game: the previously-broken snow and mountains zones now show clean follow-cam views on the surface. Deployed + pushed.

## 2026-08-07 — Bring in the re-exported Blender maps
The 4 maps were re-exported from Blender (right-sized ~56u, recentered at origin, saturated ground colours, no black bakes). Wired into all 4 zones and repositioned so each zone spawn lands **on** its map with the central structure offset from spawn. Deployed + pushed.

## 2026-08-06 — Map zone positioning fixes (floor grounding, spawns, camera)
Addressing in-game feedback on the baked map zones:
- **Ground on the walkable floor, not the water plane**: the map was grounded on its lowest point (the water plane below the terrain), which raised the whole map and sank the player/NPCs through the floor. Now grounded on the walkable terrain (water excluded).
- **Entities sit on the surface**: NPCs/nodes/buildings/player were placed at y=0 before the map's floor was known; they're now lifted onto the map's floor (sampled by raycast at the spawn) once the map loads — no more sinking into hills.
- **Spawns moved off the central towers/spires** so the player starts on open ground with the landmark in the distance.
- **Duplicate hub tower actually removed**: hideLandmarks now removes the landmark group (model AND procedural placeholder), which previously left the purple placeholder tower next to the spawn.

## 2026-08-06 — Wire the baked GLB maps in as zone visuals
The 4 fixed maps (`assets/blender/maps/*.glb`) are now the environment for 4 zones:
- **Zone map base layer** (`ZONE_MAPS` in worldconfig.js): a zone with a `mapModel` loads the GLB map as its terrain/structures visual. The map is **centered on its configured position** (the baked GLBs carry large local offsets — e.g. the forest at x=220 — so the loader recenters the model before placing it, which is what previously parked each map far from the player) and **grounded** at y=0; entities (NPCs, nodes, props) sit on the map rather than the procedural heightmap.
- **Wired**: `academy` → Plains/Academy map, `whispering_forest` → Forest map, `ashen_mountains` → Mountains map, and a **new `snow` zone** (Frostborne Peaks) → Snow map, connected to/from the Ashen Mountains.
- **Brighter lighting for map zones** (×1.9 hemisphere/sun/moon): the PBR bakes were authored in a bright renderer and read as black/grey under the dim procedural rig.
- Central-structure placement offsets the map so the player never spawns inside a tower/spire; the hub's duplicate tower landmark is hidden for the map-backed academy.
- **Verified in-game** by rendering each zone in Chromium — all four maps render correctly (green plains + academy towers, forest + shrine, grey mountains + watchtower, snow + ice spires). 256 engine tests pass (incl. a new ZONE_MAPS test). Deployed + pushed.

## 2026-08-06 — Fix the 4 baked zone maps (materials + scale)
Repaired `assets/blender/maps/*.glb` (Plains/Academy, Forest, Mountains, Snow) programmatically with `gltf-transform` — no Blender re-export needed:
- **Black scatter props fixed**: rocks/wood/foliage/mushrooms/path-stones had `baseColorFactor [0,0,0]` (black) with no texture → gave each a stylized color (rock grey, foliage green, wood brown, etc.).
- **Black baked textures removed**: the Stone/Roof bakes in Plains and the Roof bake in Mountains were exported as empty black images (the bake missed those nodes) → unbound and replaced with clean fallback colors (grey stone, terracotta roof), keeping all good bakes (ground/water/door-wood/shrine/ice).
- **Glow materials** (lamps, shrine, ice) given visible color + emissive so they read as lights.
- **Scale normalized**: Forest/Mountains already open-zone scale (128w, matches the 144-unit world) kept at 1×; compact Plains (×2) and Snow (×2.5) scaled up so the ground is walkable.
- **Visually verified by rendering each GLB** in Chromium (SwiftShader) + three.js and reviewing the screenshots — all four render as proper colored maps with no black/glitched areas.

## 2026-08-05 — Display Case
- Added a **Display Case** (Collection → 🖼️) that showcases the player's slabbed **Mint / Gem Mint** cards (grade 80+/90+) with their serial numbers, school, grade, and value — a trophy shelf for the prestige collection. Deployed + pushed.

## 2026-08-05 — Visual equipment + Academy classes
- **Visual equipment:** the equipped wand-slot weapon is now shown on the 3D player's right hand (`world.setWeapon` attaches the matching weapon GLB by metal tier — bronze→wand, iron/gold→staffs, mithril→sword, rune→axe). `syncPlayerWeapon` updates it on world entry and on equip/unequip.
- **Academy classes (real curriculum content):** 7 classes (Dueling→Archmagistery) unlocked by year, each costing gold and granting academy-rank progress — **one class per day** (a stored `academyBonus` added to `academyScore`). Attendable from the Hall screen. 3 new regression tests. All 255 engine / 34 logic / UI-smoke / 36 creature-rule tests pass. Deployed + pushed.

## 2026-08-05 — Target highlight on enemy creatures during targeting
- Enemy creatures now glow with a **cyan target highlight** (`.card.target` — glowing outline + inner glow, brighter on hover) whenever a targeting mode is active (Frog Tongue, Firespell, targeted spells, attacks), so valid targets are clearly visible before clicking. Deployed + pushed.

## 2026-08-05 — Frog Tongue is now a targetable on-play action
- Playing a Frog creature enters **targeting mode**: the player clicks which enemy creature to **steal +1 attack from** (AI keeps random fallback via `game.js` on-play steal honouring a supplied target).
- UI: `__EV.play` detects Tongue creatures and prompts ("👅 Choose an enemy to steal attack from!"); enemy creatures become clickable. Wizard is *not* a valid Tongue target (you can't steal attack from a wizard).
- Added a manual-targeting regression test (steals from the chosen creature only). `tools/creature-rule-test.mjs` now 36. All 252 engine / 34 logic / UI-smoke / 36 creature-rule tests pass. Deployed + pushed.

## 2026-08-05 — Wizard Firespell is now a targetable on-play action
- Playing a Wizard creature enters **targeting mode**: the player clicks which enemy creature (or the enemy wizard) to bolt for 2. `game.js` on-play bolt honours a supplied target with a **random fallback for the AI / no-target** plays.
- UI: `__EV.play` detects Firespell creatures and prompts ("🎯 Choose a target for Firespell!"); enemy board + wizard become clickable targets; `dmgTarget`/`dmgWiz` handle the bolt.
- Added regression tests for manual targeting (chosen creature only; wizard directly) while keeping the random-fallback tests. `tools/creature-rule-test.mjs` now 35. All 252 engine / 34 logic / UI-smoke / 35 creature-rule tests pass. Deployed + pushed.

## 2026-08-05 — Creature active abilities implemented + locked in
- **Wizard Firespell** (`onPlayBolt:2`) — on play, deal 2 to a random enemy creature (else the enemy wizard).
- **Frog Tongue** (`onPlayStealAtk:1`) — on play, steal +1 attack from a random enemy creature.
- **Orc Rage** (`rageAtk:2`) — +2 attack while the Orc is at/below half HP.
- All three wired into the engine (`game.js` `makeCreature`/`playCard`/`attack`) and covered by regression tests in `tools/creature-rule-test.mjs` (now 33 total). All 252 engine / 34 logic / UI-smoke / 33 creature-rule tests pass. Deployed + pushed.

## 2026-08-05 — Creature balance pass + regression tests
- **Balanced strong passives:** Dragon on-play AoE 2→1; **Yeti** freeze-on-hit removed (taunt wall was oppressive); Mushnub_Evolved taunt + heal-all 2 removed; Monkroose heal-on-hit 3→2.
- Added **`tools/creature-rule-test.mjs`** — 28 regression tests, one per battle mechanic (Taunt, Haste, Drain, Regen, Poison, Thorns, Evade, Shield, Survive, Spell/Freeze-immune, WizardDmg, on-attack AoE/debuff, HealOnHit, FreezeOnHit, Warband, dragon on-play AoE) + the balance assertions. Wired into `npm test`. All 252 engine / 34 logic / UI-smoke / 28 creature-rule tests pass. Deployed + pushed.

## 2026-08-05 — Creature combat pass
**All 39 creature passives wired into the duel engine battle math** (`game.js` + `creatures.js`):
- Added `RULES` (mechanical effects per creature) + `traitForCard()` (pure card→creature resolver).
- Applied in combat: **Taunt, Haste, Drain, Regen, Poison/venom, Thorns, Evade, Shield, Survive, Spell-immune, Freeze-immune**, plus on-play (AoE blast, heal-all, buff-all, freeze, draw, wizard-snipe) and on-attack (AoE stomp, wizard nick, debuff, heal-on-hit, freeze-on-hit, warband) effects.
- Verified: dragon on-play AoE + regen both fire in real duels. All 252 engine / 34 logic / UI-smoke tests pass. Deployed + pushed (`555119e`).

## 2026-08-05 — Creature identities (codex + battle labels)
- Added `creatures.js` — 39 creatures, each with unique name, category, school, stats, ability, passive, flavor.
- **Creature Codex** screen (from Collection, filter by category) showing all 39.
- In-battle floating trait labels (name + passive) over summoned creatures in the 3D duel arena. (`57aff7e`)

## 2026-08-05 — Complete creature roster (39 models)
- Imported the full **Quaternius Ultimate Monsters** pack (via the Google Drive connector) + **Textured Cute Monsters**: Dragon, Slime, Bat, Skeleton, Chicken, Panda, Deer, Ghost, Mushroom, Yeti, Dino, Orc, Orc_Skull, Demon, BlueDemon, Frog, MushroomKing, Mushnub(_Evolved), Fish, Bunny, Alien, Wizard, Ninja, Monkroose, Birb, Cactoro, Cat, Dog, Pigeon, PinkBlob, GreenBlob, GreenSpikyBlob, Glub, Goleling, Squidle, Hywirl, Alpaking, Armabee — each 8–14 animations. Expanded the duel arena card→model mapping. (`6675bd8`, `47810bf`, `b575832`)

## 2026-08-05 — Tier 1: world content + character creation
- **Ashen Mountains** zone (mining: iron/gold/mithril/runite, 2 NPCs) + **Ashen Caverns** dungeon (4 rooms, boss The Ember Wyrm), reciprocal exits to the Whispering Forest. (`b8c9447`)
- **Character-creation screen** — live rotating 3D wizard preview tinted by school, hover-to-preview in the all-schools view (free tinting version). (`f3bd20e`)

## 2026-08-05 — Atmosphere: skybox, clouds, cloud shadows
- Procedural **skybox** (gradient dome, sun, stars) replacing the blank void. (`ff54ff5`)
- Animated **drifting clouds** (large near-horizon masses + baked hazy cloud band). (`38834f0`)
- **Cloud shadow pass** — soft moving shadows projected onto the terrain. (`7395395`)

## 2026-08-04 — Merged Claude collaboration branches
- Merged `claude/integrate-cc0-and-systems` (WORLDSPEC 1–5: zone config, procedural terrain, chunk streaming, zone transitions, dungeon instancing; spell VFX, field quests, onboarding, curriculum, reputation, rigged player, painted terrain) + the systems audit (Phases A–D core fixes, Draco compression, 252 engine tests) into `main`. Deployed + pushed (`621896f`).