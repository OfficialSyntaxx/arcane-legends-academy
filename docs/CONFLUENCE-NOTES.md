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
  way earlier zones' exits were placed. Not a problem this time (found dry spots fine), but if
  Step 2's prop/resource-node placement turns up the same friction repeatedly, it's worth writing
  a small one-off "find N dry spots at least D apart" helper rather than hand-sampling every
  position — flagging so it's not rediscovered fresh in Step 2.
