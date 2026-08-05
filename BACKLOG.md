# Arcane Legends Academy — Feature & Improvement Backlog

> Working backlog for the whole game. Companion documents:
> - **`WORLDSPEC.md`** — the world architecture blueprint (zones, terrain, chunks, dungeons) and its implementation order.
> - **`docs/DESIGN-DECISIONS.md`** — answers to open design questions (interiors, 3D duels, school outfits).
> - **`docs/ASSET-BUDGET.md`** — asset platform costs, CC0 sources, licensing.
> - **`docs/NEXT-PHASE-PLAN.md`** — the systems audit and phase tracker (Phases A–D).
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

- [~] Character creation — school questionnaire + picker exist; a full creation screen with 3D preview is designed but not built (`docs/DESIGN-DECISIONS.md` §4)
- [~] School identity / specialization — 7 schools, starter decks, +1 affinity and the elemental ring all live; per-school *visuals* not yet
- [~] Academy classes and curriculum — see §1 above (`academy.js`); numeric perks only, no lesson content yet
- [x] NPC reputation — `reputation.js`: per-NPC standing (Stranger→Honored) from turning in that NPC's field quests, stacking a reward bonus on top of the academy curriculum bonus
- [~] Main story + side quests — five field quests in the Whispering Forest from two NPCs (`zonequests.js`), with gather/slay/clear/boss objectives, prerequisites and a quest log. The main story is still to write.
- [ ] Visual equipment on 3D character
- [ ] Dorm customization
- [ ] Card/slab display cases
- [ ] Trophy room
- [ ] Achievements and player titles

## 3. Open World

- [ ] Expand beyond the Academy
- [x] Whispering Forest — streams, reachable through the academy's north gateway, three NPCs and five quests that lead into Cinderhollow
- [ ] Lake Arcanum
- [ ] Ashen Mountains
- [x] Cinderhollow Caverns — 4-room dungeon reachable from the Whispering Forest, boss + persistent kill/room/boss progress
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
- [~] Dungeon progression — Cinderhollow Caverns is playable end to end; kills, cleared rooms and boss defeat all persist and enemies stay dead. Locked doors / key gating and more dungeons pending
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
- [ ] Housing furniture
- [ ] Slab display cases
- [ ] Boss trophies

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
- [x] Expanded automated tests — 252 engine / 34 online / 62 real-browser (8 viewports + gestures + world/dungeon/quest/VFX flows) + model-integrity check, plus CI
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

**Changes made, most recent first:** the outdoor **Duel Arena landmark** swapped for a
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

**Next step:** WORLDSPEC steps 1–5 are all done. Remaining world work is **step 6, the content
pass** — a second dungeon and a third outdoor zone, mostly authoring against the schemas already
built (§3/§6 in WORLDSPEC.md). In parallel, the §2 Academy items that still need real work:
a character-creation screen with a 3D preview + per-school outfit visuals
(`docs/DESIGN-DECISIONS.md` §4), visual equipment on the 3D character, and actual
class/lesson *content* for the curriculum (right now a year only grants numeric bonuses).
See `CLAUDEREADME.md` §9 "Where we left off" for the fuller narrative version of this note,
including suggestions flagged during the arena swap (re-measuring its collision circle against
the new mesh, and a longer-term idea to make the outdoor landmark the actual duel space instead
of two disconnected scenes).

---

# Where this sits with WORLDSPEC

`WORLDSPEC.md` is the detailed plan for **§3 Open World** and the world half of **§4 PvE**.
This backlog is the wider game. When the two disagree, WORLDSPEC wins for world architecture.

**Status:** WORLDSPEC steps 1–5 (zone config, procedural terrain, chunk streaming, zone
transitions, dungeon instancing) are **all complete**. Step 6 (content pass — a second dungeon,
a third zone) is next; see WORLDSPEC.md §9 for the exact schemas to author against.
