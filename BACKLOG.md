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

- [ ] **Academy progression / curriculum**
  - Make the Academy the central progression loop.
  - Add years, classes, school progression, and unlocks.

- [ ] **First 10 minutes / onboarding**
  - Character creation → Academy → gathering → scribing → grading → first deck → first duel.

- [ ] **Connect existing systems**
  - Make exploration, gathering, crafting, cards, grading, quests, equipment, combat, and housing feel like one game loop.

- [~] **Combat rules cleanup**
  - Create one source of truth for card/combat rules.
  - Resolve current documented vs. implementation differences.
  - Expand automated combat/status-effect tests.

## 2. Academy & Character

- [~] Character creation — school questionnaire + picker exist; a full creation screen with 3D preview is designed but not built (`docs/DESIGN-DECISIONS.md` §4)
- [~] School identity / specialization — 7 schools, starter decks, +1 affinity and the elemental ring all live; per-school *visuals* not yet
- [ ] Academy classes and curriculum
- [ ] NPC reputation
- [ ] Main story + side quests
- [ ] Visual equipment on 3D character
- [ ] Dorm customization
- [ ] Card/slab display cases
- [ ] Trophy room
- [ ] Achievements and player titles

## 3. Open World

- [ ] Expand beyond the Academy
- [~] Whispering Forest — streams, and is now reachable through the academy's north gateway; needs its own quests/enemies/NPCs
- [ ] Lake Arcanum
- [ ] Ashen Mountains
- [ ] Cinderhollow Caverns
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
- [ ] Boss battles — WORLDSPEC step 5 (dungeon instancing)
- [ ] Multi-phase bosses
- [ ] Dungeon progression — WORLDSPEC step 5
- [ ] Spell VFX — costs nothing, see `docs/DESIGN-DECISIONS.md` §2 phase 1
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
- [x] Expanded automated tests — 135 engine / 34 online / 8 viewports / 20 gestures, plus CI
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

**Changes made:** WORLDSPEC steps 1–3 (zone config, procedural terrain, chunk streaming),
camera collision, and the character-model fix — the player and every NPC were CDN-only with no
retry, so any CDN failure silently replaced the whole cast with the procedural stand-in. They now
ship locally as a fallback, guarded by a test.

**Next step:** WORLDSPEC step 4 (zone transitions), which unblocks §3 Open World, and then the
two §1 items that need no new art — spell VFX (§4) and the onboarding chain (§1).


---

# Where this sits with WORLDSPEC

`WORLDSPEC.md` is the detailed plan for **§3 Open World** and the world half of **§4 PvE**.
This backlog is the wider game. When the two disagree, WORLDSPEC wins for world architecture.

**Currently in progress:** WORLDSPEC steps 1–3 (zone config, procedural terrain, chunk
streaming) are complete, along with camera collision. Step 4 (zone transitions) is next — it is
what actually lets a player reach `whispering_forest`, which currently streams correctly but has
no door into it.
