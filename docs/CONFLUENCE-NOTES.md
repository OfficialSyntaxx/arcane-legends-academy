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
