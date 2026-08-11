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

## Real shadows + a live wind ambience — 2026-08-11

### Real shadows + a live wind ambience — `9f64a18`
- Asked to check the graphics — "shadows and depths, lighting, sound." A grep across `world.js`
  found dozens of meshes (the generic `add()` helper, every GLB model, treasure chests) already
  setting `castShadow`/`receiveShadow = true` with zero effect, because `renderer.shadowMap.enabled`
  was `false`. Colour management/tone mapping were already correct — this was one dead flag.
- `renderer.shadowMap.enabled = true`, `THREE.PCFSoftShadowMap` for soft edges at this game's
  camera distance.
- Only the outdoor `sun` DirectionalLight casts (one shadow-casting light keeps draw cost down and
  reads as one believable light source, same split as the existing sun/moon fill). Shadow camera:
  140×140 orthographic frustum, 2048² map, `bias:-0.0025`/`normalBias:0.02`.
- The frustum is centered on the player, not the zone origin: `sun`/`sun.target` reposition every
  frame in `frame()` to stay a fixed offset from `player.position`, so the shadow map's resolution
  is always spent on what's on screen rather than a zone's authored origin.
- Interiors untouched — dungeons/dorms already light by torches/fill tuned per `ZONE.lightScale`.
- `audio.js`: the ambience pad was a static held chord — added a wind-gust layer (filtered noise,
  randomised centre frequency/duration, 6-25s between gusts on no fixed beat) mixed under it,
  tied to the existing `startAmbience()`/`stopAmbience()` lifecycle.
- Verified with a real Playwright screenshot (not just code review): the player and forest trees
  now cast real ground shadows.
- *534 engine / 42 online / 36 creature-rule / 193 browser (1 pre-existing, documented VFX flake,
  unrelated) / `check:models`, all green.*

## Gathering is open-world-only — 2026-08-10

### Gathering is open-world-only — `45ca13e`
- Asked directly whether the Skills-screen menu Gather button matched the intent — it didn't: the
  design is OSRS-style, walk up to a real node and gather it yourself, not a menu shortcut that
  happened to coexist with the real 3D nodes.
- `window.__EV.gather` (the menu handler) removed entirely. `index.html`'s world `onGather(matId)`
  — a real registered node, a real prompt — is now the ONLY path into `game.js` `gather()`.
- The Skills screen's "⛏️ Gather" panel is now a reference, not a control: each material's
  skill/level requirement, xp, and current owned count, no button.
- Engine-side (`game.js` `gather`/`gatherCooldowns`/pristine finds) untouched — this was a UI-
  surface change, not a rules change.
- `tools/test.mjs` needed no changes (drives `gather()` directly, never depended on which UI called
  it); rewrote the `tools/browser-test.mjs` "resource node regeneration" block to teleport onto the
  academy's real copper/tin veins and trigger them, the same interaction a player walking up and
  pressing the prompt performs, instead of clicking the now-removed menu button.
- A real environment quirk found while rewriting that test, not a game bug: the UI's own 1.4s
  client-only anti-spam debounce is ticked by a 100ms `setInterval` that was observed NOT clearing
  even after an 8s poll late in a long, CPU-loaded test run. Waiting it out (fixed sleep or a
  `waitForFunction` poll) was itself a flake, so two new test-only hooks —
  `window.__testGatherDebounce()`/`window.__testResetGatherDebounce()` — let a test skip straight
  to the next real gather instead. `world.js`'s `__worldDebug()` also gained `nearbyData` alongside
  `nearbyKind`, which is what made the bug visible to debug in the first place.
- *534 engine / 42 online / 194 browser, all green (including the previously-flaky VFX check).*

## Merge `main` into this branch, push to `main` via PR #1 — 2026-08-10

### Reconcile parallel development — `0db41ef`
- `main` had diverged substantially during parallel development: a full creature-keyword combat
  system (`creatures.js` — taunt, drain, poison, thorns, evade, survive, spell immunity, freeze
  immunity, warband, rage, 36 dedicated tests), baked GLB zone maps replacing procedural-only
  terrain for several zones, its own independently-built Ashen Mountains + Ashen Caverns dungeon, a
  Creature Bestiary + Display Case, an ongoing "Adventurer's Path" advisor system, analytics, and
  its own UI palette pass.
- Reconciled conflict by conflict rather than picking a side wholesale. Kept both academy-
  progression systems (lessons.js's 21-class curriculum and main's gold-cost classes reward
  different things). Kept this branch's PvP ranking, auction/price history, dynamic UI accent
  system, and Lake Arcanum + the Drowned Vault — main had none of these. Adopted main's fuller
  Ashen Mountains (mining nodes, NPCs, a dungeon+boss) over this branch's own shell from earlier the
  same day. Renamed main's Creature Codex event handlers (`openCodex`/`codexFilter` →
  `openBestiary`/`bestiaryFilter`) — they collided with this branch's unrelated Card Codex using the
  same names, which would have silently clobbered one handler with the other.
- `zones.json`/`dungeons.json` reconstructed programmatically from both branches' clean JSON rather
  than hand-edited through conflict markers, to avoid corrupting structured data; backfilled a
  treasure into each newly-adopted zone so the existing "every outdoor zone places at least one"
  invariant holds.
- Two real bugs found and fixed, both surfaced only by finally running the FULL `npm test` pipeline
  (previously verified via its component scripts separately): `tools/ui-smoke.mjs`'s DOM stub had
  no `document.documentElement` or a `style` with `setProperty`, crashing on this branch's own
  `applyAccent()` — a stub gap, not an app bug. `tools/browser-test.mjs`'s terrain-height regression
  check compared against a hardcoded procedural formula, wrong for zones now riding a baked GLB
  map's real surface — fixed by adding `world.groundYAt(x,z)`, exposing the engine's own height
  function, so the check can never drift from what the engine actually does again.
- Also wrote a real root `README.md` (was a bare one-line description) and, separately, opened and
  merged PR #1 into `main` so the reconciled history is on the repo's default branch.
- *534 engine / 42 online / 194 browser (1 pre-existing, untouched-by-either-side VFX flake) / model-check clean.*

## Ashen Mountains, step 1: zone shell — 2026-08-10

### Ashen Mountains, step 1 of 5: zone shell — `fd4c119`
- BACKLOG §3, the last open outdoor zone. Taken as a five-step content pass (the shape Lake Arcanum
  + the Drowned Vault shipped as) but split into separately committable steps this time. This step
  is deliberately the smallest slice: prove the zone exists, loads, connects, and is walkable.
- `ashen_mountains` hangs off Whispering Forest's unused north edge (the forest already had exits
  south to the academy and west to the lake), with a reciprocal exit back — validated by the
  existing whole-world `validateExits`/`validateZone` machinery with zero new code.
- Uses the `mountains` terrain biome that had shipped unused since the terrain system itself was
  built (WORLDSPEC step 2) — this zone is the reason it exists. Amplitude 18 (vs. the forest's 7
  and the lake's 9) for real peaks, confirmed via a real render. No water — a dry range.
- Two treasures placed immediately, not deferred to the polish pass — `tools/test.mjs` already
  asserts every outdoor zone places at least one, and a shippable zone shouldn't leave that broken
  even temporarily. `TREASURE_REWARDS` gained two matching 480g entries.
- Empty NPCs/resource nodes/enemies/dungeon entrances for now — steps 2–5.
- Covered by a new `tools/browser-test.mjs` block walking the real gateway chain academy → forest →
  ashen_mountains and back.
- *524 engine / 42 online / 194 browser.*

## Collection value analytics — 2026-08-10

### Collection value analytics — `6dd287c`
- BACKLOG §5. `totalCollectionValue(s)` already existed and was already shown on the Collection
  screen header, but only ever answered "how much is everything worth" — not where that value sits
  or which cards actually carry it.
- New `game.js` `valueBySchool(s)`/`valueByRarity(s)` — each sums back to exactly
  `totalCollectionValue(s)`, proven by a test, so the breakdown can never disagree with the total a
  player already trusts.
- New `topValuableCards(s, n=5)` ranks individual card INSTANCES, not card types — two copies of the
  same card can carry very different value (a slabbed prismatic vs. a plain ungraded one).
- All three are pure reads over `s.cards`, computed fresh every call — selling a card shrinks its
  slice of every one of these immediately, with nothing left to drift.
- Landed as a new "📊 Collection Value" panel in the Codex overlay (total, by-school, by-rarity,
  most-valuable), reusing the existing `.row`/`justify-content:space-between` pattern rather than
  debug.html's `.kv` classes, which were never defined in the game's own stylesheet.
- *524 engine / 42 online / 191 browser.*

## Rare resource variants — 2026-08-10

### Rare resource variants — `9a8b577`
- BACKLOG §6. A flat, un-boosted 6% chance on every successful gather to ALSO yield a "Pristine"
  find of that same material — a lucky flourish alongside the ordinary yield, never instead of it.
- Sell-only by design: not usable in any craft/refine/smelt recipe. Adding a second tradeable id to
  every `req:{...}` table in `items.js` would double the surface every future recipe has to
  consider for one rare-loot flourish — keeping it sellable-only means `game.js` `sellItem` is the
  one place that needs to know pristine ids exist.
- Fully derived, not stored as a flag: `items.js` `pristineIdFor`/`pristineVariantFor` compute a
  Pristine entry from the base `MATERIALS` row every time (name, `💎` icon, 5× value) — no separate
  catalog row anywhere to drift out of sync. `baseMatIdFor`/`isPristineId` resolve the round trip,
  used by `sellItem` and by the Market's "Sell Materials" panel (synthesises owned pristine rows in
  the same `{id,name,icon,value}` shape a plain material has, zero special-casing). Stacks in
  `s.inventory` under its own id — no new save shape.
- `gather()` returns `{..., pristine:true}` alongside the normal result; the Skills-screen and 3D
  world's toasts share a new `gatherToast()` helper so a Pristine find is folded into the SAME
  message rather than a second `toast()` call silently overwriting the first (`toast()` replaces,
  it does not queue).
- New `window.__testGatherAt(matId, now)` test hook: the pure `gather()` called directly with an
  explicit clock, bypassing the UI's 1.4s debounce and the real regen cooldown, so a real Playwright
  test can gather until a Pristine find actually appears without waiting on wall-clock time or
  needing to know anything about RNG internals.
- *517 engine / 42 online / 188 browser.*

## Resource node regeneration — 2026-08-10

### Resource node regeneration — `da5aa62`
- BACKLOG §6. Gathering was previously unlimited and instant, gated only by a client-only 1.4s UI
  debounce that lived in `index.html`'s own state, not the save — it never survived a reload and
  was never a real limit, just a click-spam guard.
- Per-MATERIAL cooldown, not per-node-instance: the outdoor zones scatter many copies of the same
  node from a deterministic seed with no stable per-instance id chunk streaming preserves across a
  reload, so a cooldown on the material itself is the one thing the hub's one-node-per-ore layout
  and the outdoor zones' scattered layout can share honestly.
- `s.gatherCooldowns: {matId -> readyAtMs}` (sparse), `gatherCooldownRemaining` a pure read,
  `regenMsFor(mat)` scaling with the material's own level requirement (~9s at level 1, ~43s at
  level 70) — meaningful without ever reaching OSRS-punishing minutes on a mobile-first game.
- One choke point: `gather(s, mat, now)` is the single function both the Skills-screen button and
  the 3D world's `onGather` callback call, so the fix cannot be bypassed by using the other path.
- The Skills screen's Gather buttons show a live countdown while on cooldown (a 1s `setInterval`
  gated to the screen, the same pattern the Market's auction countdown already uses).
- Two pre-existing engine tests (onboarding chain, Husbandry) gathered the same material repeatedly
  with no time between calls — exactly what a real cooldown should refuse — fixed by driving an
  explicit advancing clock through the new `now` parameter, not weakened.
- *511 engine / 42 online / 183 browser.*

## Hidden treasure — 2026-08-10

### Hidden treasure — `15cf746`
- BACKLOG §3. A handful of authored, off-path caches per outdoor zone — placed away from the
  tower/arena/NPCs and the routes onboarding/quests already walk a player down, so finding one
  rewards actually exploring the corners of the map.
- Authoring follows the existing WORLDSPEC §10 split: the academy's caches live in `structures.js`
  (`TREASURES`, generated into `zones.json` by `tools/sync-zones.mjs` — the academy zone is a
  build artifact, never hand-edited, same as every other authored table there); the forest's and
  lake's are hand-authored directly in `zones.json`, same as their NPCs and dungeon entrances.
- Ids are globally unique across every zone (`worldconfig.js` `validateTreasureIds`) — a found
  treasure is ONE flat id in the save (`s.worldState.treasuresFound`), not nested per-zone like a
  dungeon's `defeated` list, so a repeated id across two zones would let opening one silently mark
  an unrelated one found too.
- `game.js` `claimTreasure(s, id)` is the source of truth, not the mesh: refuses a repeat claim by
  checking the save. `TREASURE_REWARDS` (flat gold, scaled to the zone) and
  `validateTreasureRewards` catch a placed treasure with no reward or an orphaned reward entry,
  either direction, before it ships.
- `world.js` renders a small procedural chest (glinting, slow-spinning) for every treasure not in
  `opts.foundTreasures`, mirroring `opts.defeated` for dungeon enemies exactly; `removeTreasure(id)`
  disposes it the instant it's opened, the same shape `removeEnemy` already has. No new interaction
  system — `register('treasure', ...)` and `callbacks.onTreasure` slot into the same
  `nearby`/`trigger()` machinery gather nodes and dungeon entrances already use.
- *505 engine / 42 online / 177 browser.*

## Fast travel — 2026-08-10

### Fast travel — `a36d307`
- BACKLOG §3. `changeZone(toZoneId, fromZoneId, spawnOverride)` already tears down the current zone
  and rebuilds the target from `worldconfig.js`, and `entryPointFor` already falls back to a zone's
  own default `spawn` point whenever there's no reciprocal exit to line up against — exactly what
  happens when `fromZoneId` is omitted. So this is not a second teleport system, it's `changeZone`
  called the way a gateway calls it, just without a `fromZoneId`.
- A 🗺️ map button in the 3D world (always visible, unlike the zoom buttons which are touch-only)
  opens a panel of every OUTDOOR zone (`!zone.interior` — dungeons and the dorm stay reached through
  their own doorway) that `S.worldState.visited` already records. Current zone shows disabled
  rather than being hidden, so the panel reads as a map.
- No new save field (`visited` already existed, tracked by `changeZone` itself), no new pure
  module, no new `tools/test.mjs` checks — there is no new derivable rule to assert, just existing
  zone-transition machinery invoked one more way.
- Covered by `tools/browser-test.mjs` against a save that ACTUALLY walked academy → forest → lake →
  the Drowned Vault and back in the same test run: the panel lists exactly the three outdoor zones
  it saw with its own eyes, and choosing one actually moves the live 3D world.
- *497 engine / 42 online / 173 browser.*

## Achievements & player titles — 2026-08-10

### Achievements & player titles — `e82ffe1`
- The last unchecked line in BACKLOG §1/§2's original scope: `codex.js` already had achievements
  (scoped to the card collection, by its own header) and `pvprank.js` already had `titleFor`
  (scoped to PvP rank, always-current rather than equippable) — neither was "player achievements,"
  and nothing let a player choose a title to actually wear.
- New `achievements.js`, 10 account-wide achievements covering everything those two didn't: every
  field quest complete, each dungeon boss defeated, 50 duels won, 5,000 gold held at once, skill
  level 20 in any craft, wizard level 20, Gold/Grandmaster PvP rank (reusing `pvprank.js`'s own
  `TIERS`/`titleFor` rather than re-deriving tier names), Honored standing with any quest giver.
- Derived every time, same rule as `codex.js`'s own achievements: reads the save's live state on
  every read, so losing the gold or the rank un-earns it — the honest behaviour, not a bug.
- Titles follow `cardbacks.js`'s exact shape: which titles are UNLOCKED is derived from
  achievements every time; WHICH ONE IS EQUIPPED is the one stored bit (`save.title`).
- Two new Codex panels (Achievements, Titles) after the existing card-backs gallery; the equipped
  title shows next to the player's name on the Dorm header — the one place a title is actually seen.
- A pre-existing bug found and fixed along the way: the card-backs browser test read its gallery
  HTML via `#ovBody .panel:last-child`, which silently started reading the wrong panel the moment
  the new Titles panel landed after it — fixed by selecting on heading text instead of position.
- A pre-existing `setInputFiles` flake (save/import browser tests) went from occasional to
  consistent once one more browser context landed ahead of it in the same long-lived shared browser
  instance — fixed with a one-retry wrapper, since the failure is a one-off stall, not a slow
  operation a bigger timeout would help.
- *497 engine / 42 online / 171 browser.*

## UI theme pass — 2026-08-10

### Panel depth, school accenting, world sky gradient — `1ed45f3`
- Asked point-blank whether the UI/theme "looked developed" — honest answer was no: every panel
  and button was a flat single colour with a hairline border, the accent colour was a static gold
  regardless of which school a player actually picked, and every outdoor zone's sky was a flat
  `renderer.setClearColor()` colour despite `scene.fog` and a PBR reflection environment already
  existing and going almost entirely unseen.
- `.panel`/`.btn` moved to a gradient background + real `box-shadow`, with a `:active` press
  transform on buttons and `:disabled` explicitly zeroing the shadow.
- New `--accent`/`--accent-glow`/`--accent-dim` CSS custom properties, retinted at runtime by
  `applyAccent()` from `SCHOOLS[S.school].color` (already the source of truth for card art/borders)
  — called on boot, on school selection (`chooseSchool`/`ccSchool`), and on a confirmed save
  import, since an imported save can carry a different school than the one it replaced. The top
  bar's border/glow and the active nav tab now read these instead of a hardcoded gold.
- Every outdoor zone gets a real dusk-gradient `scene.background` (an 8×256 `CanvasTexture` linear
  gradient, tagged `.encoding = THREE.sRGBEncoding` to match the renderer's own `outputEncoding` —
  `public/vendor/three.min.js` is an older revision without the newer `SRGBColorSpace` API,
  confirmed by grep first). Interiors are untouched; their walls already fully occlude it. This is
  the single biggest visible change — the fog now reads as atmosphere instead of a flat colour
  with nothing to fade into.
- Verified visually via real Playwright screenshots (home/collection/world, before/after, and
  again across two different schools) rather than by code review alone.
- Landed alongside a round of flake-hardening in the pre-existing save/import browser tests
  (unrelated in cause, surfaced by repeated `npm run test:browser` verification runs): a nav click
  needed a synthetic `.click()` via `evaluate()` because the character-creation overlay can still
  cover the nav bar on a fresh save; two fixed `waitForTimeout` sleeps were replaced with
  `page.waitForFunction` polling the real DOM condition, since a fixed sleep kept flaking
  specifically when this was the last block in an already-long suite; `setInputFiles` got a
  resilient wrapper with its own 15s timeout so an environment hiccup fails one check with a
  diagnostic instead of throwing an uncaught exception that kills the whole test process.
- No new tests: pure visual/CSS/material change, no new save fields, nothing a `validateX()` would
  meaningfully assert beyond "the page still boots," already covered by the existing suite.
- *485 engine / 42 online / 166 browser.*

## Combat depth & collection — 2026-08-08 → 09

### Save backup / import / export — `0aae248`
- The one place a player's progress lives is this browser's `localStorage` — no account, no
  server copy — so it's also the one thing this game cannot regenerate if lost.
- `exportSave(s)` is literally the bytes `save()` already writes, downloaded as a real file via a
  `Blob` + a synthetic `<a download>` click.
- `importSave(text)` is deliberately conservative: refuses anything that isn't plausibly a save
  this game produced (not JSON, a JSON array, no `version`, missing `cards`/`deck`) with a
  distinct error each time, before ever touching the real save. Hydrated through the exact same
  migrate+settle path `load()` uses — refactored out into a shared `hydrate()` — so an imported
  save can never end up in a state `load()` itself would never produce.
- Import is destructive, so it's gated behind a confirmation overlay naming what it will replace
  with before anything is committed.
- Wired into a new "💾 Save Data" panel on the Dorm/Home screen.
- Two real test-authoring races caught and fixed while covering it: a nav click via Playwright's
  actionability-checked `page.click()` timed out because a fresh save's character-creation overlay
  (z-index 100) was still covering the nav bar in a context with no charcreate walk-through —
  fixed with a synthetic `.click()` via `evaluate()`, the pattern every other click-driven block
  already uses; and the file-picker tests needed a wider margin before checking the result, since
  `FileReader` reads the picked file asynchronously.
- *485 engine / 42 online / 166 browser.*

### Auction history / price history, and a real countdown bug fixed — `6f7f11b`
- **Audit first**: checking §6's remaining unstarted items found "Player marketplace" already
  fully built (`listAuction`/`auctionTick`/`settleAuctions` — a simulated NPC-bidding auction
  house, honestly labelled, no cross-player market) — just never checked off.
- **`s.marketHistory`**: recorded the moment a listing SETTLES inside `auctionTick`, capped at 200,
  newest first, the same shape `pvprank.js`'s season history already uses.
  `priceHistoryFor`/`avgSalePrice` are pure derived queries over it, shown in a new "📈 Price
  History" panel on the Market screen. Honestly local — no persistent server, so it can never be a
  real cross-player price feed.
- **A real bug found and fixed while adding it**: the Auction House's own countdown compared
  `a.ends` (a `Date.now()` wall-clock deadline) against `performance.now()` (a different epoch
  entirely), so a fresh 60-second listing displayed as millions of seconds remaining. Confirmed
  both before and after via a real render (`⏱ 60s` now, not `⏱ 1731024...s`).
- *477 engine / 42 online / 159 browser.*

### Enchanting — `507e196`
- §6 Crafting & Economy was entirely unstarted; equipment (§2/§6.10) had metal×slot stats and
  nothing else to spend a skill level or materials on beyond the one-time forge.
- A new `enchanting` skill gates 3 stats (atk/def/hp) × 3 tiers, each a flat bonus applied to ONE
  specific owned equipment instance (`eq.enchant`) via a Loadout-screen picker — two Bronze Wands
  can carry different runes.
- Deliberately reuses `BARS` already smelted through Smithing rather than inventing a new resource
  chain: an enchant is a metal thing done to a metal item.
- One enchant per item; re-enchanting overwrites at full cost rather than stacking, the same
  "spend to change your mind" shape `regradeCard` already established.
- `equipStats` folds the enchant bonus in per-item, BEFORE the Armory home upgrade's percentage
  multiplier — "+5% gear stats" has to mean gear stats including what got enchanted onto it.
- A test-authoring bug caught along the way: the browser-test's re-enchant check silently failed
  because the test save's Enchanting skill was never raised to the required level, so the second
  rune application was being rejected server-side rather than stacking — fixed by raising the test
  save's own skill level to match the level-gated recipe it was exercising.
- *470 engine / 42 online / 156 browser.*

### Card backs — `918c9f0`
- **`cardbacks.js`**: 9 procedural CSS-gradient backs, unlocked by the matching `codex.js`
  achievement — no new grind, the same collection effort now buys two rewards. `save.cardBack` is
  the one stored bit; which backs are UNLOCKED stays derived from achievements every time, the
  same shape codex favourites already use.
- Shown on the pack-opening reveal's face-down side and a new "Card Backs" gallery in the Codex,
  directly under the achievements that unlock each one.
- *460 engine / 42 online / 151 browser.*

### Booster pack opening animations — `43dcd7b`
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

---

## Merged-in history from the parallel `main` branch (2026-08-07 → 08)

> The commits below shipped independently on `main` while this branch was developed in
> parallel, and are folded in here as-is (not rewritten to this file's later style) after
> reconciling the two branches. See CLAUDEREADME.md/BACKLOG.md for what of this survived
> the merge (e.g. the two independently-built Ashen Mountains zones — main's fuller one was
> kept; this branch's shell was dropped) and what coexists (e.g. the creature-trait combat
> system below alongside this branch's own school-ultimate/enchant systems).

> Reverse-chronological. Companion docs: `CLAUDEREADME.md` (state + "Where we left off"), `BACKLOG.md` (feature backlog), `WORLDSPEC.md` (world architecture), `ASSETS.md` (asset library).

## 2026-08-08 — Phase A: Adventurer's Path (connect the loop)
- **`advice.js`** — ongoing "next step" guidance that keeps the core loop connected after onboarding. The objective bar becomes a persistent advisor suggesting the next meaningful action, derived from the save (no tracked step): **scribe → housing (buy/upgrade) → grade → duel → refine → pack → gather → explore**. Every action has a Go button that jumps you to the right screen.
- The bar shows the guided onboarding chain first, then hands off to the advisor once onboarding completes; a `flags.adviceHidden` toggle (with migration) hides it.
- **Advice analytics**: track `advice_shown` (once per suggestion per session) and `advice_click`, and the analytics dashboard now has an **"Adventurer's Path"** panel showing shown→click per suggestion — so we can see which loop steps players actually follow.
- 6 new regression tests (one per advice branch). 262 engine tests pass.
- Deployed + pushed.

## 2026-08-08 — Analytics dashboard + richer debug tracking
- **Dashboard UI** at **`GET /api/dashboard`** (HTML): KPI cards (events, sessions, unique players, avg session, active days), a 14-day sessions bar chart, zone-visit / tab-click / event-type bars, recent errors, and a recent-events table. (Note: `/dashboard` is intercepted by the platform's SPA fallback — it must live under `/api/`.)
- **Richer client tracking** (`analytics.js`): `session_meta` (device type, screen, DPR, locale, WebGL renderer), `world` events (`map_loaded`/`map_failed` with zone+model), low-FPS sampling (`fps` < 30), and opportunistic `debug` breadcrumbs via `window.__analytics.debug(k, v)`.
- **`memory.md`** added to the repo root — durable, version-controlled project/operations notes (deploy, analytics endpoints/schema, asset pipeline, conventions) so the agent doesn't rely on the memory store.
- Deployed + pushed.

## 2026-08-08 — Client analytics (session, zones, tabs, errors)
Added lightweight client-side analytics to the live build so play-testers' behaviour is visible:
- **`analytics.js`** — tracks session start/end (with duration seconds), UI tab clicks, zone visits, uncaught JS errors, and movement "stuck" events. Events are batched and POSTed to the worker's `/api/analytics` (sendBeacon, flushed on a timer and on page-hide).
- **Worker `/api/analytics`** (D1-backed) — `POST` records events; `GET` returns a summary (total, counts per event type, top zones, recent errors, last 50 events). D1 enabled via `app.manifest.json` (`db: true`).
- Wired into the game: nav-tab clicks, `changeZone` + initial zone load, and a "stuck" signal when tap-to-move hits a wall.
- Verify live: `GET https://magic-woodland-396.higgsfield.app/api/analytics`. Deployed + pushed.

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