# The Confluence — running notes

Observations worth revisiting, logged as they come up during the build (per the user's request:
note refinements as they're found, tackle before moving to the next step where it makes sense to,
otherwise flag for the final polish pass). Not a TODO list with deadlines — a record of what was
noticed and why it was or wasn't acted on immediately.

## Step 1 (zone shell)

- **Frostborne Peaks' "Frost Keeper" NPC has no wired quest content.** `zones.json`'s `snow` zone
  ships an NPC (`snow_keeper`, role `"quest"`, station `"quests"`) but `zonequests.js` has zero
  entries referencing it — it's decorative right now, a dead end if a player walks up expecting a
  quest. Likely intended for a Frostborne Peaks quest chain that was never built. **Plan**: reuse
  this NPC as the quest-giver for The Confluence's own entry quest in Step 5, rather than spawning
  a redundant new one — narratively it fits well (a warden of the frontier warning about the rift
  beyond) and closes the dead-end at the same time. Not fixed yet — noting it for Step 5.
- **The `confluence` biome reads much darker than other zones at night.** Checked at forced noon
  (screenshot, readable — jagged violet terrain, distinct magenta water pools) and at real
  night-time (screenshot, went essentially solid black — darker than the forest zone's ground,
  which still reads green at the same night lighting). Every zone dims at night by design, and
  "the reality tear gets darker at night" is arguably on-theme, but if it turns out to hurt
  navigability during actual play, the fix is cheap: nudge the `low`/`mid` palette values in
  `terrain.js`'s `BIOMES.confluence` up slightly. **Not changed yet** — flagging rather than
  guessing at a fix with no in-game feedback to judge it against.
- **Exit/spawn/treasure placement required manually scanning for dry ground.** The `confluence`
  biome's terrain (rough 3.20, amplitude 8, waterLevel 1.0 — the most jagged combination shipped
  so far) fragments into a LOT of small water pools, more than any existing zone. Positions had to
  be found by directly sampling `TER.isWater()` on a grid rather than eyeballing coordinates the
  way earlier zones' exits were placed. **Resolved in Step 2**: this only matters for HAND-PLACED
  entries (exits, treasures, NPCs — anything with explicit `x`/`z`). Count-based scatter
  (`props`/`resourceNodes` with a `count` instead of coordinates) already avoids water and steep
  slopes automatically (`worldconfig.js`'s `scatterZone` → `groundOk`) — no manual sampling needed
  for those. Turned out to be a narrower problem than it looked in Step 1.

## Step 2 (props + resource nodes)

- **Requesting more props than the fragmented terrain can host silently starves resource nodes.**
  `scatterZone` places `props` before `resourceNodes` (object-literal order in its `return`), each
  reserving ground out of the same limited dry, non-overlapping space (80 bounded attempts per
  item). First pass asked for 65 rocks + 10 torches + 16 resource nodes; only 8 of 16 nodes
  actually landed — the props had already claimed most of the placeable ground in this
  unusually fragmented terrain. Fixed by measuring actual placement counts directly
  (`WC.scatterZone()` from a one-off node script) rather than trusting the requested `count`, and
  trimming the rock count from 65 → 45 until all 16 resource nodes placed cleanly (55/55 props,
  16/16 nodes). **Worth remembering for Step 3 (enemies)**: `enemies` scatters last in the same
  object, so it inherits the same risk — check actual placement counts before committing numbers,
  don't just pick round ones.
- **The wood-gather node model doesn't fit the theme.** `magic_log` (wood-kind) resource nodes
  render as `kaykit_tree.glb` — the only wood-node model that exists, reused from every other
  zone. A cheerful green tree looked wrong in a "reality tear, nothing organic" zone (screenshot
  comparison made this obvious immediately). Swapped `magic_log` for a third crystal-kind material
  (`gold`) instead — kept the zone visually unified around jagged rock/crystal formations, and
  cost nothing since gold/mithril/runite already existed. Chose to route around the mismatch
  rather than force a wood node in for the sake of "resource variety."

## Step 3 (enemies) — a real engine gap, fixed

- **Count-scattered outdoor enemies were completely non-functional for combat, project-wide.**
  Before placing anything for Confluence, checked whether the existing pattern (Ashen Mountains
  ships 16 of these, Whispering Forest 8, Lake Arcanum 7 — 31 total already shipped) actually
  works. It doesn't: the chunk-streaming loader (`world.js` `loadChunk`) calls
  `register("gather", ...)` for resource nodes but had no equivalent `register("enemy", ...)` call
  for enemies — confirmed both by code read and by walking a real browser session through Ashen
  Mountains, where `nearbyKind`/`enemyList` stayed empty the whole time despite 16 enemies
  supposedly present. They render (and presumably wander) but were pure decoration — un-clickable,
  un-fightable, with zero interaction of any kind.
  - This was NOT introduced this session — Ashen Mountains' zone content "shipped fully built
    during the `main` merge" per its own CHANGELOG entry, i.e. arrived from elsewhere already
    broken this way, and nothing built on top of it since (its quest chain only ever added
    hand-placed dungeon enemies, which use the working code path) had reason to notice.
  - **Asked the user how to handle it** rather than deciding alone, since fixing it properly
    touches shared engine code affecting three already-shipped zones, not just Confluence. Chose
    to fix it properly.
  - **The fix**: `register()` now returns its entry so a caller can un-register it later;
    `loadChunk` registers scattered enemies the same way it already did resource nodes (tagging
    the interactive's `data` as `{outdoor:true, id, model, name, level}` rather than a bare
    string id, since scattered instances have no entry in the zone's own hand-authored `enemies`
    list the dungeon lookup path depends on); `unloadChunk` now un-registers everything a chunk
    registered when it unloads.
  - **Also fixed a second, related leak found while touching this code**: gather-node interactive
    entries were never un-registered on chunk unload either (only their 3D model/GPU memory was
    freed) — every gather prompt the player had ever walked near stayed in the interactives list
    for the rest of the session. Same root cause, same fix, bundled in since it was the same two
    functions.
  - **New reward path**: `index.html` gained `startOutdoorFight()` and a `battle.outdoorFoe`
    branch in `duelAgain` — deliberately NOT routed through the generic PvP fallback the code
    would otherwise have hit (that path increments `S.pvp.wins/losses` and touches PvP rank,
    which a wandering trash-mob fight must not do). No new save fields: outdoor fights are fully
    repeatable, same "no stored bit where none is needed" reasoning Hard Mode rematches and Lab
    duels already follow.
  - Verified two ways: a real-browser proof-of-fix script (walked to a real scattered enemy
    position, fought it, confirmed gold paid out and `S.pvp` untouched) which was then promoted
    into a permanent `browser-test.mjs` check rather than thrown away.
  - **Ashen Mountains, Whispering Forest and Lake Arcanum's existing enemies are fixed
    retroactively** by this change — no data edits needed there, since the bug was in the shared
    engine code they all go through.
