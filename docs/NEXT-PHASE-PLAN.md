# Pre-Phase Review — Arcane Legends: Academy

Full read-through of the repo at `b5b3d79` (latest: procedural walk animations on NPC GLBs).
Everything below was verified against the actual code, not inferred from the docs.

**Test status:** `tools/test.mjs` 35/35 pass, `tools/logic-test.mjs` 14/14 pass,
`tools/ui-smoke.mjs` **is broken and silently reports success** (see P0-5).

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

**Fix:** add a tin crystal node next to copper, a shark pond, and a magic tree — or drop `tin`
from the bronze recipe. Add a test that asserts every `req` id across `BARS`/`POTIONS`/
`CARD_MATERIALS` is reachable from some registered world node.

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

**Fix:** generate the `logic.js` catalog from `cards.js` with a small `tools/sync-cards.mjs`
build step and assert equality in `logic-test.mjs`, so this can't drift again.

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

### P1-8. Potions are craftable but unusable
Alchemy brews 4 tiers of healing potion with a `heal` value. Nothing in `index.html` or the
duel engine ever consumes one. The whole Alchemy skill currently exists only to be sold to a
vendor at a loss relative to the raw fish.

**Fix:** a "use potion" action in the duel UI (costs the turn, or 1 pip), or cut the skill.

### P1-9. Auctions are built on `performance.now()`
`game.js:287` sets `ends: performance.now() + 60000`, but `performance.now()` restarts at 0 on
every page load while `ends` is persisted to `localStorage`. After a reload every listing is
instantly "expired" and pays out at the base price with no bidding. Also `collectAuction()` is
a no-op stub, and `auctionTick` contains the no-op line `s.stats.won = s.stats.won;`.

**Fix:** store `Date.now()` timestamps; settle elapsed auctions on load.

### P1-10. `migrate()` always flips `schoolPicked` to true
`game.js:44`: `if (!s.flags.schoolPicked) s.flags.schoolPicked = true;` — the guard and the
assignment are the same condition, so the flag can never be false after a load. A player who
quits during character creation never sees the school picker again and is silently locked to
`balance`. (Intentional for *legacy* saves, but it now applies to every save.)

### P1-11. Fatigue is applied but the duel can't end on it
`beginTurn` subtracts escalating fatigue damage, and `isOver` checks `hp <= 0`, so that part
works — but neither `game.js` nor `logic.js` has a turn cap or draw condition, and `runSelfTest`
relies on a `guard++ < 200` loop bound. A stalled online match has no terminating condition.

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
- **Shared module-level `rng`** seeded from `Date.now()` — §7.9 claims "deterministic duel
  logic, seeded RNG". It isn't reproducible; there's no way to seed a duel for a replay or a
  regression test.
- **`package.json` has no scripts.** Add `"test": "node tools/test.mjs && node tools/logic-test.mjs && node tools/ui-smoke.mjs"` so a single command covers all three (and actually fails).
- **No CI.** A GitHub Actions workflow running `npm test` on push would have caught P0-5.

---

## Suggested order of work

**Phase A — correctness (small, high value, ~1 sitting)**
1. `gradeForRoll` descending fix + grade-band test *(P0-1)*
2. `drain` target fix + test *(P0-3)*
3. `freeze` enforcement in `attack` and `validateAction` *(P0-4)*
4. AoE owner-relative targeting *(P1-7)*
5. Repair `ui-smoke.mjs` paths, add `npm test`, add CI *(P0-5)*

**Phase B — close the loops (~1 sitting)**
6. Add tin / shark / magic-tree nodes + reachability test *(P0-2)*
7. Potion use in duels *(P1-8)*
8. `Date.now()` auctions + settle-on-load *(P1-9)*
9. `schoolPicked` migrate fix *(P1-10)*

**Phase C — de-risk the online path**
10. `tools/sync-cards.mjs` generating the `logic.js` catalog, asserted in `logic-test.mjs` *(P1-6)*
11. Turn cap / draw condition for online matches *(P1-11)*
12. Seeded, reproducible duel RNG

**Phase D — then the existing roadmap**
World collision + GLB fallback/loading state first (they make the new building models actually
feel solid), then buildings, Draco compression, sound.
