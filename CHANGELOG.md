# Changelog — Arcane Legends Academy

All notable changes, newest first. Grouped by the phase of work rather than by version, because
this project ships continuously to one branch rather than cutting releases.

**Test counts** are quoted per entry so a regression in coverage is as visible as a regression in
behaviour. The four suites are: `npm test` (engine + online-rules + UI smoke),
`npm run test:browser` (real Chromium: responsive layout, input gestures, world flows), and
`npm run check:models` (every shipped GLB loads *and* renders on a GPU).

> Companion docs: **`CLAUDEREADME.md`** (architecture, why things are the way they are),
> **`BACKLOG.md`** (what is done and what is next), **`WORLDSPEC.md`** (world architecture),
> **`BLENDERTODO.md`** (modelling briefs for everything still procedural).

---

## Combat depth & collection — 2026-08-08 → 09

### Booster pack opening animations — *pending*
- Opening a pack was a gold cost and a toast — the five cards it minted appeared in the collection
  with no moment to see what landed. Now a CSS 3D flip-card reveal, reused into the app's existing
  generic `#overlay`/`showOverlay()` modal (the same one the Codex opens into) rather than a
  bespoke one.
- Each pulled card's front face is the exact same `cardFace(c, {inst})` the collection grid
  already renders — same printing badges, sheen, rarity border — so the reveal is not a second,
  drifting copy of what a card looks like.
- Cards auto-flip in sequence (450ms apart) through `packFlip(i)`, the same function a tap calls —
  it is idempotent (guarded on `.flipped`), so tapping ahead of the timer just gets there early
  rather than double-firing. "Reveal All" flips everything at once via the same function.
- A rare **printing** outranks base rarity for the fanfare, deliberately: a common card rolling
  Prismatic is the bigger pull than a plain-normal legendary, and `sfxForDrop` checks the printing
  first. The glow colour is the printing's own colour when there is one, the card's rarity colour
  otherwise.
- *449 engine / 42 online / 146 browser.*

### Debug dashboard — `ce39fae`
- **`public/debug.html`**: a separate page — never in-game UI, never on the gameplay hot path —
  that reads this browser's own save (via `G.load()`, the same migration/settlement path the game
  itself takes) and runs **every `validateX()` in the codebase live**, plus save/collection/PvP/
  dorm/reputation stats and world/dungeon/quest structural checks fetched fresh from
  `world/*.json`. Auto-refreshes every 5s so a second tab stays live while playing in the first.
- **No cross-session or cross-player telemetry, deliberately** — this project has no persistent
  server, so a dashboard aggregating more than the one browser it's open in would be exactly the
  fake the PvP-ranking work already refused to build for a leaderboard.
- **A real false positive caught and fixed while building it**: merging dungeon zones into the
  outdoor world and running `validateExits` over the result flagged every dungeon as "one-way" —
  a dungeon's own `exits` entry points back to its entrance zone, but the *return* trip is computed
  dynamically by `world.js` at runtime, never a second static entry on the outdoor zone. Fixed by
  validating each dungeon zone SOLO, exactly the way `tools/test.mjs`'s own "each dungeon compiles
  to a valid zone" check already does — the dashboard was testing an invariant the game was never
  designed to satisfy statically, not reporting a real bug.
- Covered by `tools/browser-test.mjs`: plays a bit of the real game, opens `/debug.html` in a
  second tab, and asserts zero page errors, a real save section, every validator reading clean, and
  the raw save JSON inspectable.
- *449 engine / 42 online / 140 browser.*

### An end-to-end audit, then Deck Archetypes — `e03e8dd`
- **Audit**: asked to check the previous stretch of work for anything left unfinished. Working
  tree was clean and every commit pushed, but `CLAUDEREADME.md` had drifted — a "how to run tests"
  section and an "All tests green" line both still quoting 343/34/109, long overtaken by real
  growth. Fixed, since those read as current guidance, not history.
- **Deck Archetypes** (§5): `autoBuildDeck` in `archetypes.js` one-click builds a 20-card deck from
  the player's own collection, weighted the same way an AI opponent's deck of that personality
  would be — refactored `archetypeDeckFor`'s preference weighting into a shared
  `weightedPicksFor` rather than duplicating it for the player-facing version. Caps at 3 owned
  copies, never invents a card the player doesn't have, and returns an honest partial deck (not a
  hang) when the collection can't fill the archetype yet. Wired into the Loadout screen as
  one-click buttons that **replace** the current deck.
- *449 engine / 42 online / 140 browser.*

### Online/local combat parity — `4ae15ef`
- **`logic.js` (the online duel referee) had NO player-school concept at all.** It runs sandboxed
  with no imports, so it never automatically inherited anything landed in `game.js`: online duels
  were already missing the pre-existing creature school-affinity bonus, and had no way to ever
  gain the spell affinity bonus or school ultimates added earlier this session.
- **`setDeck` now carries a `school`** (falling back to `balance`, matching `game.js`'s own
  fallback); `makeCreature` and the spell-cast branch gained the same affinity bonuses `game.js`
  has, ported by hand since `logic.js` cannot `import` `schoolmagic.js`.
- **`logic.js` carries its own generated copy** of the affinity/ultimate fx, emitted into the same
  `tools/sync-cards.mjs` generated block the card catalog already uses (drift-checked by
  `npm test`) — only the `{k,n}` an effect needs to resolve travels here; flavour strings stay
  client-only.
- **A new `"ultimate"` action** mirrors `game.js`'s `useUltimate`; the online duel UI gained the
  same charge-percentage ultimate button the local one has.
- Found by deliberately auditing local/online parity after two sessions of only ever extending the
  local engine — `npm test`'s catalog check already guards data drift, but nothing was watching
  rules drift.
- Online-rules tests: 34 → 42. *443 engine / 42 online / 131 browser.*

### Deck Testing Laboratory; §8 audited and documented as server-blocked — `82faa22`
- **Deck Testing Laboratory** (§5): a PvP-screen panel to play your current deck against any of
  the five AI personalities, fighting a real thematic 20-card deck (the same builder dungeon
  monsters use) from a school that isn't your own. Pays out **nothing** — no gold, no cards, no
  PvP win/loss, no rank change — a lab that pays out is a farm wearing a lab coat, and would have
  quietly poisoned PvP ranking's streak/season-floor maths besides. No new pure module needed.
- **§8 Multiplayer & Social audited before building more of it**: Multiplayer Academy, player
  presence, and every guild feature need a persistent, always-on server tracking state for every
  connected player. This project's only server-side code, `logic.js`, is a *stateless per-room
  referee* per online duel — it holds nothing once a match ends. `BACKLOG.md` now says so directly
  against each blocked §8 item, the same honesty the PvP-ranking work already applied to a
  cross-player leaderboard, one level up — rather than leaving them looking merely unstarted.
- *443 engine / 34 online / 131 browser.*

### School mechanics, ultimates, and a reusable combat effect system — `e352681`
- **The last three open items in §4 PvE & Combat, closed together**: a reusable effect pipeline
  is what made the other two cheap. `game.js`'s `applyFx` if/else chain became `FX_HANDLERS`, a
  `{kind: fn}` dispatch table — every card fx, the new affinity bonus and the new ultimates all
  flow through the same one table now.
- **`schoolmagic.js`**: a same-school spell now does a little more (Fire +1 dmg, Ice +1 shield,
  Storm +1 card, Myth board-wide +1 ATK, Life +2 heal, Death +1 to the enemy wizard, Balance +1
  heal) — the spell-side echo of the creature affinity bonus that already existed.
- **One ultimate per school**, spent once per duel from a charge meter filled by playing your own
  school's cards (`ULT_CHARGE_MAX = 5`), costing neither pips nor a card: Fire's Inferno, Ice's
  Deep Freeze, Storm's Maelstrom, Myth's Titan's Call, Life's Rebirth, Death's Soul Harvest,
  Balance's Judgement. Wired into the duel UI (a button showing charge %) and into every AI
  archetype, which spends a charged ultimate the instant it's available.
- A test bug caught along the way: the first pass of the ultimate browser test read "Judgement"
  off a fixed default school, but an earlier test in the same page session can leave the save on a
  different school — fixed by forcing the school on the *battle* object under test, not assuming
  the save's.
- *443 engine / 34 online / 127 browser.*

### PvP ranking and seasons — `5eead83`
- **`pvprank.js`**: seven tiers Bronze → Grandmaster, driven by a stored `rankPoints`. A win is
  always `+20` plus a capped streak bonus (`+2`/streak win, capped at 5); a loss is always `-15`,
  floored at a **season floor** — a tier reached this season cannot be lost to a losing streak,
  only fallen *within*.
- **Seasons**: one per UTC calendar month. Crossing a boundary soft-resets to half the previous
  peak, never below the tier that peak reached, and records the finished season into a capped
  12-entry personal history — shown on the PvP screen.
- **Deliberately no leaderboard**: the project has no persistent server (`logic.js` is a stateless
  per-room referee), so there is no data source for a cross-player one. A season history — honestly
  the player's own — replaces it.
- `rankPoints`/`streak`/`seasonBest` are the **second** deliberate exception to "derive, don't
  store" (the first is a card's printing in `variants.js`): the outcome of a *sequence* of match
  results, not recomputable from `pvp.wins`/`pvp.losses` alone.
- Wired into every win/loss path — local AI duels and online duels both call `RANK.applyResult`.
- *427 engine / 34 online / 123 browser.*

### AI archetypes, thematic enemy decks, multi-phase bosses — `1051742`
- **`archetypes.js`**: every AI opponent — the seven QUESTS rivals, every dungeon monster, every
  open-world skeleton — ran the identical strategy (highest-cost affordable card, damage spells
  finish the weakest enemy creature, always race face unless a taunt forced a trade). Five real
  personalities now exist: **Aggro** (cheap-first, always burns face), **Control** (removes the
  biggest threat, takes favourable trades instead of always racing), **Tempo** (faces when ahead
  on board), **Boss** (removes + trades + escalates), and **Midrange**, which reproduces the
  **old, only** behaviour exactly — `aiTurn(b)` with no archetype set is unchanged.
- Dungeon monsters now play a deck built from **what they visibly are** (Slime → Aggro/Fire,
  Skeleton → Control/Death, Bat/Wraith → Tempo/Storm, Dragon → Boss/Fire), not borrowed verbatim
  from a human rival's authored ladder deck.
- **Multi-phase bosses**: two HP-fraction thresholds (50%/20%), each a permanent ATK/shield
  escalation, applied in a loop so a hit crossing both between the boss's own turns fires both at
  once.
- **A real, previously-unnoticed bug found while wiring this up**: dungeon boss fights had been
  running at the open-world default of 100 HP — `dungeons.json`'s own `boss.hp` (200 for the
  Cinder Wyrm, 280 for the Drowned Archon) was carried on the enemy object but never read.
- Two bugs in the *tests*, not the code: a duel meant to let the boss's own attacks lower its HP
  used a deck that dealt no damage, so the boss's HP never moved; and an assertion expecting both
  phase thresholds at 15% HP was actually checking 37.5%, which only clears the first.
- *404 engine / 34 online / 123 browser.*

### The Codex, and this changelog — `e0bf4a9`
- **`codex.js`**: the whole catalog browsable — six filters (All / Owned / **Missing** / Favourites
  / Special / Graded), a school filter, a search over names and card text, five sorts, per-school
  completion bars and **nine collection achievements**.
- The collection grid could never answer *"what am I missing?"* — you cannot filter a list of owned
  cards for the ones you do not own. The Codex filters the **catalog** instead, and shows unowned
  cards as greyed silhouettes.
- Achievements are **derived**: sell the cards and the achievement un-earns itself. Favourites are
  the one stored bit, because they are a choice.
- `validateCodex` proves every achievement is reachable against a synthetic best-possible
  collection — and caught a bug in **its own probe** first (every card prismatic ⇒ no foils ⇒ the
  foil achievement read as unreachable).
- **`CHANGELOG.md`** added, backfilled from the full git history.
- *377 engine / 34 online / 120 browser.*

### Card printings, first editions — `2f34f26`
- **`variants.js`**: Foil ✨ ×2.2, Holographic 🌈 ×4.5, Prismatic 💠 ×12, plus a First Edition ①
  ×1.6 stamp on the first copy of each type you obtain. Closes the "foil" third of design pillar 3,
  which had never been built — grade was previously the only axis of collection value.
- Rolled **rarest-first**; per-source `luck` (packs ×2, scribing ×1.25, shop purchases ×1).
- Rare printings get a coloured border, a diagonal sheen and a badge, and sort to the top of the
  collection.
- **`mintCard()`** consolidates five hand-written copies of the card-instance literal into the one
  place a card can enter the collection.
- Migration grandfathers one first edition per card type already owned, once, behind a flag.
- *360 engine / 34 online / 113 browser.*

### Two browser-suite intermittents closed — `c08fccc`
- **Camera orbit** (real): the camera could end a frame grazing the tower's collision circle by
  <15 cm. Both existing clamps solve *along the ray* from player to camera, the weakest geometry
  for a near-tangent pass. `updateCamera` now finishes with `resolveCollisions`, pushing out
  perpendicular to the surface. **Not reproducible in isolation** (0 bad of 192 with *and* without
  the fix) — it closes the invariant directly rather than being verified against a repro.
- **Bolt VFX** (bad threshold, not a bug): one shared 1.15× brightness ratio across five archetypes
  with wildly different footprints. Bolt scores 1.30×, the others 4–5.5×. Now a modest ratio *and*
  an absolute pixel delta, with margins printed under `VERBOSE`.

### Academy class content — `d36bd0e`
- **`lessons.js`**: 21 classes, three per curriculum year, each with a brief, an assignment, and a
  **named technique**. A *year* is passive and flat; a *class* is chosen and teaches something.
- Four techniques hooked into systems that already ship: **Appraisal** (cheaper grading),
  **Penmanship** (better scribe rolls), **Husbandry** (a chance of a second gather), **Haggling**
  (better card sales).
- Assignments read counters the save already keeps, rather than consuming materials —
  `zonequests.js` already does gather-and-hand-in.
- *343 engine / 34 online / 109 browser.*

### Visible equipment on the 3D character — `8a48da0`
- **`equipment3d.js`**: the equipped wand and amulet hang off the rig's real `RightHand`/`Neck`
  bones, inheriting the animation. Tier picks the silhouette, metal picks the colour, using CC0
  KayKit weapons already in the repo.
- `hat`/`robe`/`boots` **cannot** be shown (single-mesh character) and say so, rather than silently
  doing nothing.
- Bone axes on a generated rig are arbitrary: the staff's orientation and the bone-scale division
  were **measured by rendering**, not derived.
- `browser-test.mjs` binds to **port 0** — a fixed port made two overlapping runs die on
  `EADDRINUSE`, which reads exactly like a test failure.
- *326 engine / 34 online / 102 browser.*

### Character creation, per-school appearance, and `BLENDERTODO.md` — `a1a94da`
- **`charcreate.js` / `preview3d.js`**: a three-step creation screen (name → school → look) with a
  live rotating 3D preview.
- **`tint.js`**: the per-school look is a **fragment-shader hue rotation**, because
  `player_wizard.glb` is one mesh whose material Base Color is white — `material.color` can only
  darken, never re-hue. The old 45% colour lerp is why all seven schools looked the same washed
  purple.
- `strength` must stay ≥ 0.75: from a purple base, a 70% rotation toward Fire's 16° *stops at
  magenta*.
- **`BLENDERTODO.md`** (new): a complete modelling brief for every asset still drawn as a
  procedural primitive — dorm furniture, trophies, fountain, lamps, spires, the fishing-spot node,
  a gateway arch, a modular dungeon kit, the duel arena's pillars and banners. Each with
  dimensions, hex colours, triangle budget, origin placement and the exact table row to edit.
- *316 engine / 34 online / 95 browser.*

---

## World completion — 2026-08-08

### WORLDSPEC step 6: the content pass — `fab83d3`
- **Lake Arcanum** (third outdoor zone, 29% water coverage, shoreline fishing) and **the Drowned
  Vault** (second dungeon, 5 rooms, the Drowned Archon). The world now chains academy → forest →
  Cinderhollow → lake → vault.
- Five more field quests, gated behind killing the Cinder Wyrm. **All six WORLDSPEC steps complete.**
- **`nearWater`** on a resource node: `scatterZone` knew what to avoid but not what to be *near* —
  the first pass put all fourteen fishing spots up to 40 m inland on hilltops.
- **`baseHeight` above `waterLevel`**: flattening pins the spawn and NPCs to `baseHeight`, so a lake
  rising past it opens the zone underwater and `validateZone` says nothing.
- Per-dungeon palettes so the second dungeon is not the first reskinned.
- *297 engine / 34 online / 86 browser.*

### The Dorm phases D1–D4 — `e942cfc`
- The Student Dorms stopped being a menu. **`dorm.js`** compiles a real interior *zone* by reusing
  `dungeons.js` — a dorm is a one-room dungeon with no enemies, so zone transitions, saved position
  and camera collision came for free.
- Furniture placement into typed anchor slots (D2); **display cases and boss trophies** (D3);
  room size and slot count derived from the existing upgrade levels (D4).
- The interior seam in `structures.js` is generic, so the Scribing Hall and Smithy can follow.
- **Interiors are not all caves**: the room first inherited the dungeon light rig and rendered as a
  black box. Zones now declare `lightScale`/`lightTint`; `world.renderOnce()` exists so a test can
  read pixels.
- Naming unified to "Dorm" everywhere user-facing; `docs/plan.md` marked historical.
- *280 engine / 34 online / 75 browser.*

---

## Systems & content — 2026-08-05

| Change | Commit |
|---|---|
| Duel Arena landmark replaced with a user-provided Tripo model (decorative collision only) | `208aa7a` |
| Academy curriculum years + NPC reputation (`academy.js`, `reputation.js`) | `93fbb28` |
| Field quests for the Whispering Forest (`zonequests.js`) | `5c473cf` |
| The duel arena rebuilt to look like an arena; duel layout fixed | `b024de4` |
| Spell VFX: six procedural archetypes driven by each card's own effects (`vfx.js`) | `8f6b1e1` |
| Onboarding: a guided first session (`onboarding.js`) | `d8aa9e0` |
| Dungeon enemies actually die and stay dead | `8e3efa2` |
| The hero gets a standing pose — the rig was fine, the bind pose was not | `78a8d30` |
| Painted terrain: height bands, rock on slopes, shorelines, mottling | `d51b271` |
| WORLDSPEC step 5: dungeon instancing; four silently broken GLBs found and fixed | `3e4667f` |
| The new wizard rigged; characters scaled to read at world scale | `8ac7228` |
| WORLDSPEC step 4: zone transitions, solid water, camera fix | `cec0c62` |
| Every character was rendering as the procedural stand-in — CDN failure with no retry | `24d0f1a` |

---

## World architecture — 2026-08-04

| Change | Commit |
|---|---|
| WORLDSPEC step 3: chunk streaming | `5fa3ed1` |
| Camera collision fixed; two browser tests that were passing for the wrong reason | `319d6f6` |
| `BACKLOG.md` added; every gap in WORLDSPEC steps 1–2 closed | `a15a5fb` |
| WORLDSPEC steps 1–2: zone config data model and procedural terrain | `c0baec3` |
| `WORLDSPEC.md` added: zone architecture, chunk rules, terrain spec, dungeon flow | `2441fd2` |
| CDN routing for large models — `public/` dropped 37 MB → 6.5 MB | `6d288a7` |
| 3D duel arena (`battle3d.js`); KayKit weapons + Quaternius monsters imported | `aff3177` |
| CC0 KayKit Medieval Hexagon buildings replace the procedural academy structures | `06316f9` |
| `ASSETS.md` added: curated free-asset backlog and the import pipeline | `f870a43` |

---

## Conventions this project follows

Recorded here because every entry above depends on them.

- **Derive, don't store.** What the player *chose* is saved; what follows from it is recomputed on
  every read. The one deliberate exception is a card's printing and grade seed — dice rolls at mint
  time with nothing to re-derive them from, and the module says so.
- **Pure modules.** Anything spatial or rule-shaped lives in a module with no THREE and no DOM, so
  `tools/test.mjs` can validate it headlessly. `world.js` renders what it is handed; it decides
  nothing.
- **Placement is data.** Buildings, props, nodes and zones live in tables, never in `world.js`.
- **Look at the render.** Several bugs here — a black dorm, a magenta Fire wizard, a horizontal
  staff — were invisible to every passing test. A Playwright screenshot of a WebGL canvas comes
  back blank; use `renderOnce()` and read pixels.
- **A failing test gets diagnosed, not re-run.** Where a flake could not be reproduced, the entry
  above says so plainly rather than claiming a fix was verified.
