# The Confluence — BACKLOG §10 endgame zone, build plan

Scoped 2026-08-13. This is the last unbuilt content item in the backlog (`§10 Long-Term Endgame`,
"The Arcanum / ultimate endgame zone") — same scale as the whole Ashen Mountains arc, so it's
staged the same way Ashen Mountains was: a 5-step content pass, one step at a time, each tested
and shipped before the next starts, rather than one giant change.

**Not literally named "The Arcanum"** — that collides with the existing Lake Arcanum zone.
Working name below; easy to rename later since it's just a string.

## Decisions locked with the user

1. **Gating**: reached past Frostborne Peaks (the 4th outdoor zone), the current top of the
   Forest → Lake → Mountains → Snow chain. Frostborne Peaks itself has no boss/dungeon of its own
   (checked `zones.json`: it ships terrain + exits + wanderers + treasures only, no enemies/quest
   NPCs/dungeon) — it's an atmospheric approach zone, not a gate in the "beat this zone's boss"
   sense the earlier three are. The Confluence's own entrance quest supplies that gate instead
   (see below).
2. **Theme**: an all-schools convergence — the one place all seven schools' magic collides at
   once, instead of one more single-element biome. Visually and mechanically distinct from every
   zone so far (each of which is one school's territory).
3. **Assets**: reuse-first, same discipline as every zone built this project. Confirmed feasible
   with zero new asset generation — see below.

## Working name: **The Confluence**

A rift where the barrier between the seven schools' magic has worn through. Reached via a new exit
at the far side of Frostborne Peaks that only opens once the player has beaten all four existing
zone bosses (Cinder Wyrm, Drowned Archon, Ashen Caverns' boss, and — Frostborne Peaks has none, so
this drops to a level/rank gate instead, e.g. Archmage rank or a flat level floor). Exact gate
condition to confirm when Step 1 starts.

## Why zero new assets are needed

- **Lake Arcanum already proves a zone doesn't need a baked GLB map** — it's fully procedural
  (not in `worldconfig.js`'s `ZONE_MAPS`), built from `terrain.js`'s biome system + existing CC0
  props. The Confluence can do the same.
- **A new biome is pure data.** `terrain.js`'s `BIOMES` table is just color values (ground/water/
  palette bands per height+slope) — a `confluence` biome (iridescent, fractured, multi-hued rock)
  is a few hex codes, not new geometry.
- **Props/dressing**: reuse existing dungeon-kit and world-prop GLBs (`assets/models/hex_*`,
  `kaykit_*`, `dng_*`) recolored/recombined for a "reality tearing open" look — the same move
  Ashen Mountains made reusing KayKit props for a volcanic palette instead of authoring new rock
  models.
- **Enemies**: reuse existing `creature_*.glb` models (Demon/Ghost/Orc_Skull/BlueDemon read as
  "corrupted by the convergence" without a new model), themed via `creatures.js` fx/stats rather
  than new geometry — the same move Pets made reusing existing creature GLBs.
- **Boss**: also an existing creature GLB (a large one — `creature_MushroomKing`, `creature_Orc`,
  or `creature_Demon` scaled up, matching how the three existing zone bosses were cast from
  existing models), with the *mechanical* identity carrying the "ultimate" weight instead of a
  bespoke model.

If a real gap turns up once building starts (the way robes/hats did), it gets flagged the same
way — named explicitly, not silently worked around.

## Boss concept: mechanically distinct, not just a bigger number

To earn "ultimate capstone" rather than "one more dungeon," the boss should make the all-schools
theme a mechanic, not just flavor text: e.g. it cycles through a different school's damage/fx
signature each turn (fire bolt → ice freeze → storm chain-hit → myth summon → life heal-block →
death drain → balance buff), so the fight actually differs from every single-school boss before it
instead of reusing one school's kit at higher numbers.

## 5-step build plan (mirrors Ashen Mountains' pace)

1. ✅ **Zone shell** — procedural terrain (new `confluence` biome), bounds, spawn, exit back to
   Frostborne Peaks, the gate condition on entry. *Done — see CHANGELOG "The Confluence, step 1 of
   5: zone shell". Refinement notes for later steps in `docs/CONFLUENCE-NOTES.md`.*
2. ✅ **Props + resource nodes** — visual dressing from reused assets, resource nodes reusing
   existing top-tier materials rather than inventing new ones. *Done — see CHANGELOG "The
   Confluence, step 2 of 5". Notes in `docs/CONFLUENCE-NOTES.md`.*
3. **Enemies** — a small roster of reused creature GLBs, reskinned via existing fx (freeze/drain/
   dmgAll etc.) to feel "converged" rather than single-school.
4. **Dungeon + boss** — a 5-room dungeon (matching Cinderhollow/Drowned Vault/Ashen Caverns'
   shape) ending in the multi-school boss described above.
5. **Field quests** — 5 quests (gather/slay/clear/boss), same shape as every other zone's chain,
   gated behind the zone entry condition.

Each step: real engine tests + a `validateQuests`/`validateZone`-style structural check where one
applies, plus a real-browser Playwright screenshot before calling it done — same bar as every
other zone this project.

## Next action

Start Step 1 (zone shell) when given the go-ahead. Confirm the exact entry-gate condition then,
since it depends on what's actually checkable from the save (rank vs. a flat level number vs. an
explicit "all three existing dungeon bosses defeated" flag — need to check what `game.js` already
tracks before picking one).
