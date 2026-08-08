# Arcane Legends Academy — Feature & Improvement Backlog

> Working backlog for the whole game. Companion documents:
> - **`WORLDSPEC.md`** — the world architecture blueprint (zones, terrain, chunks, dungeons) and its implementation order.
> - **`docs/DESIGN-DECISIONS.md`** — answers to open design questions (interiors, 3D duels, school outfits).
> - **`docs/ASSET-BUDGET.md`** — asset platform costs, CC0 sources, licensing.
> - **`docs/NEXT-PHASE-PLAN.md`** — the systems audit and phase tracker (Phases A–D).
> - **`BLENDERTODO.md`** — modelling briefs for every asset still drawn as a procedural primitive.
>
> **Status markers below:** `[x]` done, `[~]` partly done. Items were re-checked against the
> codebase on merge, since several were already complete.

## 1. Highest Priority

- [~] **Academy progression / curriculum**
  - `academy.js`: 7 curriculum years (Novice → Archmage) each unlocking real perks — bonus quest
    gold, a market discount, bonus wizard XP — applied at `completeQuest`/`buyCard`. Shown on the
    Hall screen (current year, perks, progress to next). Still missing: actual class/lesson
    *content* — right now a year only grants numeric bonuses, there's nothing to attend or choose.

- [~] **First 10 minutes / onboarding**
  - A 7-step guided chain (`onboarding.js`) with a persistent objective bar: school → gather → refine → scribe → grade → deck → first duel. Every step is DERIVED from the save, so playing out of order cannot desync it. A full character-creation screen is still pending.

- [ ] **Connect existing systems**
  - Make exploration, gathering, crafting, cards, grading, quests, equipment, combat, and housing feel like one game loop.

- [~] **Combat rules cleanup**
  - Create one source of truth for card/combat rules.
  - Resolve current documented vs. implementation differences.
  - Expand automated combat/status-effect tests.

## 2. Academy & Character

- [x] Character creation — a three-step screen (name → school → look) with a **live rotating 3D
  preview** (`charcreate.js` / `preview3d.js`). Every step is derived from the save, so backing
  out or changing school later cannot desync it. Name validation is a correctness matter, not
  taste: the name goes into `innerHTML` on the Dorm screen.
- [~] School identity / specialization — 7 schools, starter decks, +1 affinity and the elemental
  ring all live. Per-school **visuals** now ship as a fragment-shader hue shift (`tint.js`) plus a
  school-coloured ground aura. Genuinely different *garments* are still open: the player GLB is a
  single mesh with a single white-based material, so there is nothing to recolour per part —
  see `BLENDERTODO.md` Tier 5 and `docs/DESIGN-DECISIONS.md` §4.
- [~] Academy classes and curriculum — see §1 above (`academy.js`); numeric perks only, no lesson content yet
- [x] NPC reputation — `reputation.js`: per-NPC standing (Stranger→Honored) from turning in that NPC's field quests, stacking a reward bonus on top of the academy curriculum bonus
- [~] Main story + side quests — ten field quests across two zones (`zonequests.js`): five in the
  Whispering Forest, five at Lake Arcanum gated behind the Cinder Wyrm, with gather/slay/clear/boss
  objectives, prerequisites and a quest log. `validateQuests` proves the whole chain is completable
  and that no prerequisite is missing or cyclic. The main story is still to write.
- [~] Visual equipment on 3D character — **wand and amulet ship** (`equipment3d.js`): parented to
  the rig's real `RightHand`/`Neck` bones so they inherit the animation, with the tier picking the
  silhouette (wand → staff → greater staff) and the metal picking the colour, using CC0 KayKit
  weapons already in the repo. `hat`, `robe` and `boots` **cannot** be shown — the character is a
  single mesh, so there is nothing to swap or hide underneath; they are listed in `UNSUPPORTED`
  with the reason and the Loadout screen labels them "stats only". Making those three visible
  needs per-part geometry — `BLENDERTODO.md` Tier 5.
- [x] **Dorm customization — DONE (D1–D4).** The Student Dorms is no longer a menu. Walking up and
  pressing the prompt builds a real interior *zone* (`dorm.js`, pure; it reuses `dungeons.js` to
  lay the room out, so a dorm is a one-room dungeon with no enemies and inherits zone transitions,
  saved position and camera collision for free). Furniture is bought with gold + timber and placed
  into typed anchor slots authored as fractions of the room; every piece is a procedural
  primitive, so zero new asset bytes. The interior seam in `structures.js` (`interior:` +
  `interiorFor`) is generic — the Scribing Hall and Smithy can follow with no new entry-path code.
- [x] Card/slab display cases — DONE (D3). The save stores only `slot -> card uid`; grade, serial
  and name are read from the live card, so selling a displayed slab empties its case rather than
  leaving a ghost (covered by a test).
- [x] Trophy room — DONE (D3). Trophies are never stored: they are derived from
  `worldState.dungeons[...].bossDead`, so they cannot disagree with the world. Beat the Cinder
  Wyrm and one appears in the room's corner.
- [ ] Achievements and player titles

## 3. Open World

- [x] Expand beyond the Academy — three outdoor zones now chain academy → forest → lake
- [x] Whispering Forest — streams, reachable through the academy's north gateway, three NPCs and five quests that lead into Cinderhollow
- [x] Lake Arcanum — a real lake (29% water) reached through the forest's west gateway; shoreline
  fishing (salmon/lobster/shark), silver + mithril + magic trees, 3 NPCs, 5 quests gated behind
  the Cinder Wyrm, and the Drowned Vault entrance
- [ ] Ashen Mountains
- [x] Cinderhollow Caverns — 4-room dungeon reachable from the Whispering Forest, boss + persistent kill/room/boss progress
- [x] The Drowned Vault — 5-room dungeon under Lake Arcanum, cold flooded palette, the Drowned Archon (Lv14) at the bottom
- [x] Zone transitions — walkable gateways, reciprocal arrival, world state persisted in the save
- [x] Chunk streaming — scatter-once/bucket-once with load/unload hysteresis and GPU disposal
- [ ] Fast travel
- [ ] Hidden areas / treasure
- [ ] Day/night cycle
- [ ] Weather
- [ ] Dynamic world events

## 4. PvE & Combat

- [ ] Enemy levels and archetypes
- [ ] Better AI deck archetypes
- [~] Boss battles — the Cinder Wyrm fights via the duel engine; multi-phase/abilities pending
- [ ] Multi-phase bosses
- [~] Dungeon progression — two dungeons playable end to end (Cinderhollow Caverns, the Drowned
  Vault); kills, cleared rooms and boss defeat all persist and enemies stay dead, and each dungeon
  carries its own palette/lighting so the second is not the first reskinned. Locked doors / key
  gating still pending
- [x] Spell VFX — six procedural archetypes (bolt/burst/rain/aura/beam/glyph) driven from each card's own effects and school; zero assets
- [~] Attack / summon / death animations — `battle3d.js` exists; procedural walk cycle already added for NPCs
- [ ] Reusable combat effect system
- [ ] School-specific mechanics
- [ ] School ultimate abilities

## 5. Cards & Collection

- [ ] Card evolution
- [ ] Foil / holo / special variants
- [ ] First editions
- [x] Serialized cards — grades 9–10 mint slabs with unique serials
- [ ] Card lore / encyclopedia
- [ ] Collection achievements
- [ ] Better collection filters
- [ ] Favorite cards
- [ ] Card backs
- [ ] Booster opening animations
- [ ] Deck archetypes
- [ ] Deck testing laboratory

## 6. Crafting & Economy

- [ ] Expand Alchemy
- [ ] Enchanting
- [ ] Rune crafting
- [ ] Cooking
- [ ] Advanced Scribing
- [ ] Resource node regeneration
- [ ] Rare resource variants
- [ ] Player marketplace
- [ ] Auction history / price history
- [ ] Collection value analytics

## 7. Pets, Housing & Cosmetics

- [ ] Pets / familiars
- [ ] Pet progression
- [ ] Mounts
- [ ] Robes / hats / cloaks
- [ ] Wand cosmetics
- [ ] Auras
- [ ] Emotes
- [x] Housing furniture — shipped as §2 "Dorm customization" (D2). §2 is canonical.
- [x] Slab display cases — shipped as §2 (D3). §2 is canonical.
- [x] Boss trophies — shipped as §2 "Trophy room" (D3). §2 is canonical.

## 8. Multiplayer & Social

- [ ] PvP ranking
- [ ] PvP seasons
- [ ] Leaderboards
- [ ] Multiplayer Academy
- [ ] Player presence
- [ ] Guild creation
- [ ] Guild halls
- [ ] Guild quests
- [ ] Guild storage
- [ ] Guild wars

## 9. Technical / Quality

- [~] Centralize game rules/data — cards/items/nodes/structures/zones are all data; `logic.js` catalog is generated and drift-checked by `npm test`
- [x] Save versioning + migration — `migrate()` in `game.js`, covered by tests
- [ ] Save backup/import/export
- [ ] Cloud save later
- [ ] Server-authoritative economy
- [ ] Server validation / anti-cheat
- [x] Expanded automated tests — 326 engine / 34 online / 102 real-browser (8 viewports + gestures + world/dungeon/quest/dorm/lake/creation/gear/VFX flows) + model-integrity check, plus CI
- [ ] Performance profiling
- [x] Mobile UX pass — safe areas, fluid cards, landscape, 44px targets, Pointer-Events input rewrite
- [x] Audio system — `public/audio.js`, fully procedural (SFX + ambience + music), zero asset bytes
- [x] Ambient world audio — procedural pad in the 3D world
- [~] Music per zone / activity — mode changes per screen (campus/duel/menu); per-*zone* pending step 4

## 10. Long-Term Endgame

- [x] Academy ranks — Novice → Archmage, driven by level + collection value + wins
- [ ] Archmage progression
- [ ] Prestige
- [ ] Seasonal events
- [ ] Rare collectibles
- [ ] Endgame dungeon tiers
- [ ] The Arcanum / ultimate endgame zone

---

# Recommended Development Order

### Phase 1 — Polish the Core
Academy → tutorial → card loop → combat → progression → save system → tests.

### Phase 2 — Make the Academy a Game
Character creation → classes → NPCs → quests → equipment visuals → housing.

### Phase 2b — The Dorm ✅ done
Interior zone → furniture placement → display cases & trophies → visual upgrade tiers.

### Phase 3 — Expand the World
Forest → Lake → Mountains → Dungeons → bosses → world events.

### Phase 4 — Deepen Collection & Combat
Card variants → evolution → serialized cards → VFX → advanced AI → boss mechanics.

### Phase 5 — Social Layer
PvP ranking → multiplayer Academy → guilds → marketplace → leaderboards.

### Phase 6 — Endgame
Pets → mounts → prestige → seasonal content → Archmage → Arcanum.

---

# Working Rule

**Do not build everything at once.**

For each feature we select, we should decide:

1. What does the player experience?
2. What existing systems does it connect to?
3. What files/systems need to change?
4. What is the smallest playable version?
5. How do we test it?
6. What comes after it?

## Current Review Status

**Repository:** `OfficialSyntaxx/arcane-legends-academy`
**Branch:** `claude/integrate-cc0-and-systems`

**Changes made, most recent first:** **visible equipment on the 3D character** (`equipment3d.js`)
→ **character creation + per-school appearance**
(`charcreate.js` / `tint.js` / `preview3d.js`) and **`BLENDERTODO.md`** → **WORLDSPEC step 6, the content pass** (Lake Arcanum + the
Drowned Vault, five new quests, per-dungeon palettes, `nearWater` scatter) → the **Dorm phases D1–D4** (`dorm.js` — walk-in interior
zone, furniture placement, display cases, boss trophies, upgrade-driven room tiers) → the outdoor
**Duel Arena landmark** swapped for a
user-provided Tripo model (`public/assets/buildings/arena.glb`, rune-floor platform with a pillar
ring, compressed 1.12MB→0.71MB) — verified via standalone render, post-compression render,
`model-check.mjs`, in-game debug, and the full `browser-test.mjs` suite (incl. the camera-orbit
check next to the arena) before pushing; confirmed with the user that this landmark is decorative
collision only, since duels render in the separate `battle3d.js` scene, not on this platform →
Academy curriculum + NPC reputation (`academy.js` / `reputation.js` — perks and per-NPC standing
bonuses on quest/market rewards) → spell VFX + a rebuilt *in-duel* arena (`vfx.js` / `battle3d.js`)
→ field quests for the Whispering Forest (`zonequests.js`) → the onboarding chain
(`onboarding.js`) → dungeon-enemy persistence (kills, cleared rooms, boss defeat actually stick
and don't respawn) → a rigged, correctly-posed and correctly-scaled player character
(`tools/rig-character.py`, `CHARACTER_HEIGHT = 2.6`) → painted terrain (vertex-colour height
bands/rock/shoreline/mottling, no textures) → WORLDSPEC steps 3–5 (chunk streaming, zone
transitions, dungeon instancing).

**Next step:** **visible equipment is done** — the equipped wand and amulet hang off the rig's real
bones, tier picks the silhouette and metal picks the colour; the three slots that cannot be shown
say so instead of silently doing nothing (`CLAUDEREADME.md` §6.10).

Before that, **character creation + per-school appearance were done** (a three-step screen with a
live 3D preview; the school look is a shader hue-shift plus a coloured aura — see `CLAUDEREADME.md`
§6.9 for why it could not be a colour assignment). **`BLENDERTODO.md` is new**: a full modelling
brief for every asset still drawn as a procedural primitive, written for an AI agent driving
Blender, each with dimensions, budgets and the exact table row to edit afterwards.

Before that, WORLDSPEC **step 6 (the content pass) was done** — Lake Arcanum and the Drowned
Vault ship, so the world now chains academy → forest → Cinderhollow → lake → vault with ten field
quests across the two outdoor zones. All six WORLDSPEC steps are complete. What remains for the
world is polish rather than architecture: fast travel, day/night, weather, hidden areas, and the
Ashen Mountains as a fourth zone.

Before that, the Dorm phases (D1–D4) were **done** — the Student Dorms is a walk-in interior with
furniture placement, display cases, trophies and upgrade-driven room tiers (§2 above,
`CLAUDEREADME.md` §6.8). Landed alongside it from the docs review: the home/hall/dorm naming
collision resolved to "Dorm" everywhere user-facing, `docs/plan.md` marked historical, and §7's
duplicated housing entries pointed at §2.

**After that**, the §2 Academy items that still need real work: a character-creation screen with a
3D preview + per-school outfit visuals (`docs/DESIGN-DECISIONS.md` §4), visual equipment on the 3D
character, and actual class/lesson *content* for the curriculum (right now a year only grants
numeric bonuses). Then §5 collection depth and §8 the social layer.
See `CLAUDEREADME.md` §9 "Where we left off" for the fuller narrative version of this note,
including suggestions flagged during the arena swap (re-measuring its collision circle against
the new mesh, and a longer-term idea to make the outdoor landmark the actual duel space instead
of two disconnected scenes).

---

# Where this sits with WORLDSPEC

`WORLDSPEC.md` is the detailed plan for **§3 Open World** and the world half of **§4 PvE**.
This backlog is the wider game. When the two disagree, WORLDSPEC wins for world architecture.

**Status:** **all six WORLDSPEC steps are complete** — zone config, procedural terrain, chunk
streaming, zone transitions, dungeon instancing, and the content pass (three outdoor zones, two
dungeons). Further world work is now content and polish against settled schemas, not architecture:
a fourth zone (Ashen Mountains), fast travel, day/night, weather.
