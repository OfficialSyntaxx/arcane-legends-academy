# Pre-Phase Review — Arcane Legends: Academy

Full read-through of the repo at `b5b3d79` (latest: procedural walk animations on NPC GLBs).
Everything below was verified against the actual code, not inferred from the docs.

**Test status at review time:** `tools/test.mjs` 35/35 pass, `tools/logic-test.mjs` 14/14 pass,
`tools/ui-smoke.mjs` **is broken and silently reports success** (see P0-5).

> **Update — Phases A, B, C and the mobile/input pass are complete.** P0-1, P0-2, P0-3, P0-4, P0-5, P1-7, P1-8, P1-9 and
> P1-10, P1-6, P1-11 and the seeded-RNG item are fixed, each with a regression test that fails
> against the old code. Extra defects found while fixing neighbours: targeted spells doing
> nothing in local duels (P1-7b), the runite node sitting inside the iron node's interaction
> radius (P0-2b), and the PWA icon/favicon hotlinked to a CDN (P2-b).
> Suites are now **87 engine / 34 online / UI-smoke**, plus a new **real-browser suite**
> (8 viewports + 15 input-gesture checks). Everything below is left as written for context.

The CLAUDEREADME roadmap is all *content* work (buildings, Draco, sound, more schools).
The findings below are mostly *systems* work — several core loops advertised in the design
doc do not actually function. Recommend clearing P0 before starting the next content phase,
because the art phase will not surface any of these.

---

## P0 — Broken core systems (fix before the next phase)

### P0-1. Grading is completely dead — every card is "Poor"
`public/cards.js:112`
```js
export function gradeForRoll(r){ return GRADES.find(g => r >= g.min); }
```
`GRADES` is ordered ascending and `GRADES[0].min === 0`, so `find` returns "Poor" for
*every* roll from 0 to 100. Verified:

```
roll   0 -> Poor (slab false)
roll  45 -> Poor (slab false)
roll  85 -> Poor (slab false)
roll 100 -> Poor (slab false)
```

Consequences: no card ever reaches Mint/Gem Mint, **no slab is ever minted**, serial numbers
are never issued, `countSlabs()` is always 0, every card is worth `base × 0.3`, and Scribing
skill has no effect on card quality. This kills pillar #3 ("collectible satisfaction"),
the regrade gamble, the grade-aware bazaar, and a chunk of academy-rank score.

**Fix:** iterate descending — `[...GRADES].reverse().find(g => r >= g.min)` or pre-sort the
table descending. Add a test asserting `gradeForRoll(95).g === 10` and `gradeForRoll(5).g === 1`.
The existing test only checks `gradeForRoll(roll).name.length > 0`, which passes on the bug.

### P0-2. Bronze bars are impossible to make — the smithing ladder has no first rung
`public/items.js:32` requires `{copper:1, tin:1}` for `bar_bronze`, but **`tin` has no gathering
node anywhere in `world.js`** and no other source. Same problem for `raw_shark` (needed for
`potion_great`) and `magic_log` (level-50 woodcutting). Grepping `world.js` + `index.html` for
`tin`, `raw_shark`, `magic_log` returns nothing.

So a new player cannot forge a single piece of equipment, which gates the entire
Smithing → equipment → duel-power chain.

**Fixed:** the gathering-node table moved out of `world.js` into `public/nodes.js` (world.js
needs THREE and a canvas, so its node list could never be checked headlessly — which is exactly
how the drift went unnoticed). A tin node, a magic tree and a deep-water shark pond were added,
and `tools/test.mjs` now asserts every `req` id across `BARS`/`POTIONS`/`CARD_MATERIALS` has a
node, that every node is a real material, and that a Bronze Bar can be smelted purely from
gathered ore.

### P0-2b. Runite and iron nodes overlapped *(found by the new spacing assertion)*
Runite sat at `(-3,-9)`, **1.4 units** from the iron node at `(-4,-8)` — well inside the 2.6-unit
interaction radius, so the two nodes competed for the same prompt and whichever lost was
effectively unmineable. Runite moved to `(-14,-14)`, which also reads better as the level-70
tier. A test now asserts no two nodes are within interaction range of each other.

### P0-3. `drain` heals the wrong wizard
`public/game.js:468,471,474` and `logic.js:199,201,204`:
```js
if (atk.drain) enemy.hp = Math.min(enemy.maxHp, enemy.hp + dmg);
```
`enemy` is the *defending* side. A Ghoul/Vampire/Reaper attacking you heals **you**, not its
owner. Death school is actively self-harming right now. Affects both local duels and online.

**Fix:** heal `p` (the attacker's owner) in both files; add a duel test asserting a drain
attack raises the attacker's HP.

### P0-4. `freezeAll` does nothing
`freeze` is set (`game.js:418`), decremented (`game.js:396`), and never read. `attack()` checks
`exhausted`/`summoning` but never `freeze`. Blizzard (epic, 4 pips) is a blank card. Same in
`logic.js`.

**Fix:** add `if (atk.freeze > 0) return {ok:false, err:"frozen"}` in both `attack()` and
`logic.js validateAction`.

### P0-5. The UI smoke test is dead and returns exit 0
`tools/ui-smoke.mjs:41,52` read from a hardcoded absolute path from an old sandbox:
`/home/user/f2fba8f6-.../wizard-tcg/public/index.html`. It throws ENOENT, the handler
increments `errors`, but the throw happens at module top level so `process.exit(errors?1:0)`
is never reached — the run ends with **exit 0**. CI (and every "all tests green" claim) has
been reading a false pass.

**Fix:** use paths relative to `import.meta.url`, and re-check that the smoke test actually
boots `index.html` again.

---

## P1 — Systems that are half-wired

### P1-6. `logic.js` and `cards.js` have diverged (the sync rule in §7.6 is being violated)
- **Different elemental matrix.** `cards.js:22` is the 6-link ring
  `fire>ice>storm>myth>life>death>fire`. `logic.js:55` still has the *old* 3-link
  `fire>life, life>death, death>fire`. Online duels resolve elemental damage differently
  from local duels.
- **No school affinity online.** `logic.js makeCreature` omits the `+1 attack for your school`
  bonus that `game.js:356` applies. Deliberate ("fair duels") or not, it isn't documented.
- **`cr.name` is undefined in `logic.js`.** The trap log at `logic.js:177` prints
  `"Trap! undefined takes 4"` — the embedded catalog carries no `name` field.
- **Wrong error text.** `logic.js:81` says "deck must be 30 cards" while validating 20.

**Fixed:** `tools/sync-cards.mjs` generates the embedded catalog from `cards.js` into a marked
block in `logic.js`; `npm test` runs it with `--check` and fails if the block is stale. Online
duels now use the same 6-link elemental ring as local duels (they were resolving elemental
damage differently), embedded cards carry `name` (so trap logs no longer read
"Trap! undefined"), and the deck-size error text says 20. School affinity remains deliberately
absent online — online duels are gear- and school-neutral by design.

### P1-7. AoE spells hit the caster's own board when the AI casts them
`game.js:412-413` and `logic.js:145-146` hardcode `b.enemy`:
```js
else if (f.k === "dmgAll"){ for (const c of [...b.enemy.board]) c.hp -= f.n; }
else if (f.k === "dmgWiz"){ damageWizard(b.enemy, f.n, b.enemy.defBonus); }
```
Correct when *you* cast. When the AI (or player-2 online) casts Meteor or Tempest, it damages
its own board and its own wizard. `aiTurn` currently only casts single-target `dmg` spells so
it mostly hides locally — but online it is directly exploitable, since `applyAction` routes
both players through the same code.

**Fix:** resolve the opposing side from `owner`, not from the fixed `b.enemy` slot.

### P1-7b. Targeted damage spells did nothing at all in local duels *(found during the P1-7 fix)*
The duel UI passes a *descriptor* — `{kind:"creature", idx}` or `{kind:"wiz"}`
(`index.html:845,854`) — but `game.js applyFx` used it directly as if it were an entity:
`damageWizard(t, f.n, t.defBonus)` on a plain `{kind, idx}` object wrote `hp: NaN` onto the
descriptor and left the real board untouched. Every targeted spell in the game — Firebolt,
Fireball, Lightning Bolt, Storm Shift, Myth Blast, Dark Pact, Balance Streak — was a 1–3 pip
blank card in local play. `logic.js` resolved the descriptor correctly, so online was unaffected.

**Fixed:** `resolveTarget()` in `game.js` converts the descriptor to a creature or wizard before
damage is applied; creatures take raw damage (no shield/defBonus), wizards go through
`damageWizard`.

### P1-8. Potions are craftable but unusable
Alchemy brews 4 tiers of healing potion with a `heal` value. Nothing in `index.html` or the
duel engine ever consumes one. The whole Alchemy skill currently exists only to be sold to a
vendor at a loss relative to the raw fish.

**Fixed:** `usePotion(s, b, p, potionId)` in `game.js`, surfaced as a potion row in the duel UI.
Costs **1 pip, one per turn** — enough to be a real comeback option without letting a stack of
potions stall a duel out. The limit resets in `beginTurn`, and the save is written on use so a
drunk potion can't be duplicated by reloading.

### P1-9. Auctions are built on `performance.now()`
`game.js:287` sets `ends: performance.now() + 60000`, but `performance.now()` restarts at 0 on
every page load while `ends` is persisted to `localStorage`. After a reload every listing is
instantly "expired" and pays out at the base price with no bidding. Also `collectAuction()` is
a no-op stub, and `auctionTick` contains the no-op line `s.stats.won = s.stats.won;`.

**Fixed:** deadlines are `Date.now()`-based, `auctionTick` returns what it settled, and a new
`settleAuctions()` runs once from `load()` so listings that expired while the game was closed
pay out instead of waiting for the market screen to tick. Saves carrying a legacy
`performance.now()` deadline are detected (`ends < 1e12`) and settled rather than stranded.
The no-op `s.stats.won = s.stats.won;` line is gone. `collectAuction()` is still a stub — payout
happens on expiry, so it has nothing to do; left for whenever bidding becomes player-facing.

### P1-10. `migrate()` always flips `schoolPicked` to true
`game.js:44`: `if (!s.flags.schoolPicked) s.flags.schoolPicked = true;` — the guard and the
assignment are the same condition, so the flag can never be false after a load. A player who
quits during character creation never sees the school picker again and is silently locked to
`balance`. (Intentional for *legacy* saves, but it now applies to every save.)

**Fixed:** the check is `s.flags.schoolPicked === undefined` — only a save that predates the
school system (flag absent) skips the picker; an explicit `false` is respected.

### P1-11. Fatigue is applied but the duel can't end on it *(fixed)*
`beginTurn` subtracts escalating fatigue damage, and `isOver` checks `hp <= 0`, so that part
works — but neither `game.js` nor `logic.js` has a turn cap or draw condition, and `runSelfTest`
relies on a `guard++ < 200` loop bound. A stalled online match has no terminating condition.

**Fixed:** `MAX_TURNS = 100` in both engines. At the cap the higher-HP wizard wins and equal HP
is an explicit draw; a double knockout is also a draw rather than a win for whichever side
`isOver` happened to check first. `viewFor` exposes `turns`/`maxTurns`, and the duel UI renders
a draw result instead of showing "you lose".

---

## P2 — Quality, safety, and consistency

- **String literals in game code.** §7.1 says all player-visible text lives in `strings.js`,
  but `index.html` is full of inline copy ("Smelt bars and forge equipment…", "⚗️ Brew potions",
  quest/dialogue text). `strings.js` is 104 lines against 1101 lines of UI. Either enforce the
  rule or amend it in the README — right now the doc claims a convention the code doesn't follow.
- **`innerHTML` + `onclick="window.__ev(...)"` everywhere** (~15 sites). Values interpolated in
  are currently all internal, but the player-set wizard name flows into rendered markup; one
  user-controlled string away from script injection. Prefer `textContent` + delegated listeners.
- **No collision in the 3D world.** The player walks straight through every building, the tower,
  and the fountain; movement is only clamped to ±40. Cheap fix: a list of AABB/cylinder blockers
  checked in `input()`.
- **No loading state for GLBs.** `makeCharModel` has no `onError` and no progress UI — a failed
  or slow model fetch leaves an empty `Group` with no fallback to the (still-present) procedural
  wizard. Keep the procedural mesh until `onReady` fires.
- **`setPlayerColor` is a no-op after the GLB loads** — it writes to `player.userData.robe`,
  which `makeCharModel` removes from the group. School color no longer shows on the player.
- **Procedural walk cycle allocates per frame.** `setBone` constructs `new THREE.Quaternion()`
  on each miss and `updateCamera` allocates a `Vector3` every frame; `__worldDebug` builds a
  `Box3` per mesh. Hoist these before the mobile-perf phase.
- **`buildDeck(defs, gear)` ignores `gear`**; `collectAuction` returns `{ok:true}` and does
  nothing; `game.js:431` has a dead `typeof f === "string"` branch checking for `"healPlay"`,
  which is only ever an object.
- ~~**Shared module-level `rng`**~~ **fixed** — `startDuel(..., seed)` and `state.seed` in
  `logic.js` give each duel its own RNG, so a duel replays exactly from its seed. `logic.js`
  no longer keeps mutable module-level RNG shared across every room.
- ~~**`package.json` has no scripts.**~~ **fixed** — Add `"test": "node tools/test.mjs && node tools/logic-test.mjs && node tools/ui-smoke.mjs"` so a single command covers all three (and actually fails).
- ~~**No CI.**~~ **fixed** — two jobs: the headless suites, and the browser suite.
- ~~**PWA icon hotlinked to a CDN**~~ **fixed (P2-b)** — the favicon and the single manifest
  icon both pointed at a CloudFront URL, breaking the installable PWA offline and violating the
  "no CDN hotlinks" rule in §7.5. Replaced with locally generated 192/512 icons (plus a
  maskable entry), and `orientation` relaxed from `portrait` to `any` now that landscape works.

---

## Suggested order of work

**Phase A — correctness — ✅ DONE**
1. ✅ `gradeForRoll` descending fix + 10 grade-band/slab assertions *(P0-1)*
2. ✅ `drain` heals the attacker in both engines + tests *(P0-3)*
3. ✅ `freeze` enforced in `attack` / `validateAction`; the tick moved from `beginTurn` to
   `endTurn` so a frozen creature actually loses a turn *(P0-4)*
4. ✅ Owner-relative AoE + target resolution in both engines *(P1-7, P1-7b)*
5. ✅ `ui-smoke.mjs` resolves paths from `import.meta.url` and exits non-zero;
   `npm test` runs all three suites; GitHub Actions workflow added *(P0-5)*

Also corrected the `logic.js` "deck must be 30 cards" message to 20 (part of P1-6).

**Phase B — close the loops — ✅ DONE**
6. ✅ Node table extracted to `public/nodes.js`; tin / shark / magic-tree nodes added;
   reachability, spacing and bounds assertions *(P0-2, P0-2b)*
7. ✅ Potion use in duels — 1 pip, one per turn *(P1-8)*
8. ✅ `Date.now()` auctions, `settleAuctions()` on load, legacy-deadline recovery *(P1-9)*
9. ✅ `schoolPicked` migrate fix *(P1-10)*

Also added to `ui-smoke.mjs`: a static binding check that every `G.x()` and `STR.x` the UI
references actually exists (55 engine and 33 string bindings today). That catches the class of
break where a screen renders fine until the one code path touching a renamed export runs.

**Phase C — de-risk the online path — ✅ DONE**
10. ✅ `tools/sync-cards.mjs` generates the `logic.js` catalog; `npm test` fails on drift *(P1-6)*
11. ✅ Turn cap, draw conditions, and draw handling in both duel UIs *(P1-11)*
12. ✅ Seeded, reproducible duel RNG in both engines

**Mobile & input pass — ✅ DONE** (verified in Chromium, not by inspection)
- **Layout:** `dvh` sizing, full safe-area insets (notch + home indicator), fluid `clamp()` card
  sizing with `aspect-ratio` art, breakpoints for phones / small phones (≤380px) /
  **landscape phones** / tablets, 44px minimum tap targets, hover effects gated behind
  `@media (hover:hover)` so they don't stick on touch, and `prefers-reduced-motion` support.
  The viewport meta no longer blocks pinch-zoom (`user-scalable=no` was an accessibility
  problem, and it wasn't what stopped the canvas gestures — `touch-action` is).
- **Input:** the whole world-input layer was rewritten onto Pointer Events with per-pointer
  tracking. Previously a two-finger pinch *also* rotated the camera, a drag that ended off the
  canvas left the drag stuck, and a drag could fire tap-to-move on release. Now: pointer
  capture, an explicit tap test (slop + duration), pinch suppresses rotation and hands the drag
  back cleanly when one finger lifts, an analogue joystick knob with a dead zone and circular
  (not square) clamping, mouse-wheel zoom, and on-screen zoom buttons for one-handed play.
- **Verification:** `npm run test:browser` (`tools/browser-test.mjs`) serves `public/` and drives
  a real Chromium: 8 viewports asserted for horizontal overflow, collapsed content, chrome
  height budget and tap-target size, plus 15 gesture checks including
  *"dragging does not also tap-to-move"* and *"player stops when the joystick is released"*.

**Phase D — part 1 (collision + GLB robustness) — ✅ DONE**
- **World collision.** `public/structures.js` holds buildings, NPC positions, obstacle shapes and
  a pure resolver. The player and the wandering NPCs now collide with buildings, the tower, the
  arena and the fountain; ponds are deliberately *not* solid so you can still fish. The resolver
  depenetrates rather than blocking, so you slide along a wall instead of sticking to it.
- **Placements are asserted, not assumed.** Making the world solid immediately sealed several
  things inside it — the professor and the merchant were standing *inside* their own buildings,
  and every building's station prompt was at its centre, i.e. behind a wall. Station prompts now
  sit at each building's door, and a test proves every NPC, door, node and the spawn point is
  standing clear, that a walk into a wall never ends up inside it, and that 24 swept paths
  across the map never enter geometry.
- **GLB loading state + fallback.** `makeCharModel` now has an error handler and reports progress
  through an `onLoadProgress` callback; the procedural wizard stays visible until the real model
  is in the scene, and a failed model leaves the stand-in rather than an invisible character.
  The HUD shows "Summoning the academy… n/m" and names how many models fell back.
- **`setPlayerColor` works again** — it wrote to `userData.robe`, which `makeCharModel` removes
  from the group, so school colour silently stopped applying once the GLB loaded. The colour is
  remembered and re-applied as a tint when the model lands.
- **Per-frame allocations hoisted** (`Vector3` in `updateCamera`, `Quaternion` per bone in
  `setBone`) ahead of the mobile-perf work.

Two visual bugs surfaced while checking the result in a browser:
- **Roofs were 1.56× their building's width** (`0.78 × longest side` used as a *radius*). The
  dorm roof was an 11-unit disc over a 7-unit building, big enough to fill the camera. Now 0.62.
- **The default camera looked straight through the Student Dorms.** The follow camera sits behind
  the player at +z and the spawn was on the z axis south of the dorms, so the first frame of a
  new game was the inside of a building. Spawn moved into the open courtyard lane at (7, 8),
  clear of the tower, the dorm door prompt and the Trainer's prompt radius.

**Phase D — part 2 (remaining, needs a decision)**
- **Buildings & world props as generated 3D models.** This is the big one, and it needs asset
  generation (~40 credits per model via the 2D→3D pipeline, per §9.2 — call it 10+ models for
  the halls, arena, dorms, tower and props). `structures.js` is already the seam: each building
  has an id, position, size and rotation, so a generated mesh can be dropped in per id without
  touching collision or station wiring. **Say the word and how many credits to spend.**
- **Draco compression.** The models folder is ~22MB. Worth doing with `gltf-transform` before
  adding building models, since they will add to it.
- **Sound.** Still only a few procedural WebAudio beeps. Needs no asset spend — music would.
