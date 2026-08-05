# Changelog — Arcane Legends: Wizard TCG

> Reverse-chronological. Companion docs: `CLAUDEREADME.md` (state + "Where we left off"), `BACKLOG.md` (feature backlog), `WORLDSPEC.md` (world architecture), `ASSETS.md` (asset library).

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