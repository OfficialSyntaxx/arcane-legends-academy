#!/usr/bin/env node
/**
 * export-test-fixtures.mjs — generate golden input/output pairs from the WEB BUILD's own engine,
 * so the C# port can be verified the moment it compiles.
 *
 * WHY: none of the C# can be compiled or run in the environment it is being drafted in, so every
 * behavioural claim about it is unverified. These fixtures close that gap without needing Unity:
 * the values here are produced by the real JS functions, so a C# test that reproduces them is
 * genuinely correct, not merely self-consistent.
 *
 * This is the practical form of "the tests are the porting spec" (docs/UNITY-MIGRATION.md §3).
 * A C# test that asserts against these is asserting against the shipped game's actual behaviour.
 *
 * Usage:
 *   node tools/export-test-fixtures.mjs [outDir]     (default: unity/Assets/StreamingAssets/)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as G from "../public/game.js";
import { CARDS } from "../public/cards.js";
import { MATERIALS, BARS, POTIONS, equipmentFor } from "../public/items.js";
import { RULES, traitForCard } from "../public/creatures.js";
import { AFFINITY_FX, ULTIMATES, ULT_CHARGE_MAX } from "../public/schoolmagic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] || path.join(ROOT, "unity", "Assets", "StreamingAssets"));
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- progression

// Straight table lookups. Deliberately includes level 1 and a high level, because the curve is
// quadratic and an off-by-one in the formula shows up at the extremes first.
const xpForLevel = [1, 2, 3, 5, 10, 15, 20, 30, 50].map(l => ({ level: l, xp: G.xpForLevel(l) }));

// wizardLevel is CUMULATIVE — total XP for level N is the sum of xpForLevel(1..N-1), not
// xpForLevel(N). The boundary pairs below pin that specifically: each `justUnder` must resolve one
// level lower than its `exact`. A port that treats the curve as non-cumulative passes the simple
// cases and fails these.
const wizardLevel = [];
{
  let cumulative = 0;
  for (let lvl = 1; lvl <= 12; lvl++) {
    cumulative += G.xpForLevel(lvl);
    wizardLevel.push({ totalXp: cumulative,     expected: G.wizardLevel(cumulative) });
    wizardLevel.push({ totalXp: cumulative - 1, expected: G.wizardLevel(cumulative - 1) });
  }
}
for (const xp of [0, 1, 51, 52, 100, 500, 2000, 10000, 99999]) {
  wizardLevel.push({ totalXp: xp, expected: G.wizardLevel(xp) });
}

// Skill XP SPENDS the requirement on level-up (unlike wizard XP, which accumulates). These
// sequences pin that asymmetry, including the multi-level-in-one-grant case and the Tavern
// upgrade's +10%-per-level multiplier.
const skillXp = [];
for (const [tavern, grants] of [[0, [10, 30, 60]], [0, [500]], [3, [100]], [5, [1000]]]) {
  const s = G.newGame();
  s.home.owned = tavern > 0;
  s.home.upgrades.tavern = tavern;
  const steps = [];
  for (const amt of grants) {
    G.addSkillXp(s, "mining", amt);
    steps.push({ granted: amt, level: s.skills.mining, xpIntoLevel: s.skillXp.mining });
  }
  skillXp.push({ tavern, grants, steps });
}

// ---------------------------------------------------------------- data resolution

// Every creature card's resolved trait key, so the C# lookup table can be proven to agree with
// the JS matcher for all 25 — not just the handful anyone would think to spot-check.
const cardTraitResolution = CARDS
  .filter(c => c.type === "creature")
  .map(c => {
    const t = traitForCard(c.id, c.name);
    const slug = t ? Object.keys(RULES).find(k => RULES[k] === t.rules) : null;
    return { cardId: c.id, name: c.name, trait: slug };
  });

// Affinity is not "same school = bonus" in general — it is specifically caster-school ===
// spell-school. The mismatched pairs below are the ones a sloppy port gets wrong.
const affinity = [];
for (const caster of Object.keys(AFFINITY_FX)) {
  for (const spell of [caster, "balance", "fire", "death"]) {
    const bonus = caster === spell ? AFFINITY_FX[caster] : null;
    affinity.push({
      casterSchool: caster, spellSchool: spell,
      expected: bonus ? { k: bonus.k, n: bonus.n } : null,
    });
  }
}

const ultimateGate = [];
for (const school of Object.keys(ULTIMATES)) {
  for (const [charge, used] of [[0, false], [ULT_CHARGE_MAX - 1, false], [ULT_CHARGE_MAX, false],
                                [ULT_CHARGE_MAX, true], [ULT_CHARGE_MAX + 5, false]]) {
    ultimateGate.push({
      school, charge, alreadyUsed: used,
      expected: !used && charge >= ULT_CHARGE_MAX && !!ULTIMATES[school],
    });
  }
}
// A school with no ultimate must be refused however much charge is banked.
ultimateGate.push({ school: "nonsense", charge: 99, alreadyUsed: false, expected: false });

// ---------------------------------------------------------------- PRNG
// mulberry32 is integer-only, so it ports byte-for-byte to C#. Verifying it FIRST matters: every
// seeded fixture below is meaningless if the stream underneath disagrees, and a mis-ported PRNG
// fails in a way that looks like a logic bug ("the pristine roll is wrong") rather than like a
// broken random source.
const prng = [];
for (const seed of [1, 42, 12345, 2147483647]) {
  const r = G.mulberry32(seed);
  prng.push({ seed, values: Array.from({ length: 8 }, () => r()) });
}

// ---------------------------------------------------------------- economy actions
// Seeded end-to-end runs. `seedRng` makes the shared stream reproducible (see game.js), so the C#
// port driving its own mulberry32 from the same seed must land on identical state.
//
// WHAT THESE CATCH that a static table cannot: the ORDER random draws are made in. gather() draws
// the Husbandry roll only when the bonus is non-zero, then the Pristine roll always. A port that
// draws unconditionally, or in the other order, produces different items from the same seed and
// fails here — while still looking perfectly reasonable in review.

/** Everything about a save that these actions can touch, for a diffable expectation. */
function economySnapshot(s, now) {
  const cooldowns = {};
  for (const [id, at] of Object.entries(s.gatherCooldowns || {})) cooldowns[id] = at - now;
  return {
    gold: s.gold,
    inventory: { ...s.inventory },
    skills: { ...s.skills },
    skillXp: { ...s.skillXp },
    cooldownsFromNow: cooldowns,
    dailyType: s.daily.type,
    dailyProgress: s.daily.progress,
    refined: s.stats.refined,
    equipment: s.equipment.map(e => ({ id: e.id, metal: e.metal, slot: e.slot, tier: e.tier, enchant: e.enchant || null })),
  };
}

const MAT = id => MATERIALS.find(m => m.id === id);
const BAR = id => BARS.find(b => b.id === id);
const NOW = 1700000000000;   // fixed instant; cooldowns are recorded as offsets from it

const economy = [];
function economyCase(name, seed, setup, run) {
  const s = G.newGame();
  // Pin the daily so checkDaily() cannot burn a random draw on a day rollover mid-fixture, and
  // record the pinned values so the C# test can pin them the same way.
  s.daily = { date: G.todayStr(), type: "gather", progress: 0, target: 12, claimed: false };
  s.inventory = {};
  setup(s);
  const before = economySnapshot(s, NOW);
  G.seedRng(seed);
  const results = run(s).map(r => ({
    ok: !!r.ok, err: r.err || null,
    itemId: r.item?.id ?? null,
    xp: r.xp ?? 0,
    extra: r.extra ?? 0,
    pristine: !!r.pristine,
    remaining: r.remaining ?? 0,
    value: r.value ?? 0,
  }));
  economy.push({
    name, seed, dailyDate: s.daily.date,
    // Recorded separately from the snapshot because masteries are DERIVED from this list, never
    // stored — the C# replay has to rebuild the same list to arrive at the same Husbandry chance.
    lessonsDone: s.lessons.done.slice(),
    before, results, after: economySnapshot(s, NOW),
  });
}

// Plain gather, no Husbandry: the bonus roll is SKIPPED entirely, so the pristine roll is the
// FIRST draw off the seed. This is the case a port that always draws twice gets wrong.
economyCase("gather copper, no husbandry", 1,
  s => {}, s => [G.gather(s, MAT("copper"), NOW)]);

// With Husbandry the bonus roll is drawn first, shifting the pristine roll to the second draw.
economyCase("gather copper, husbandry from two lessons", 1,
  s => { s.lessons.done = ["l_field", "l_ore"]; },      // 4 + 4 = 8% second-unit chance
  s => [G.gather(s, MAT("copper"), NOW)]);

// A live world event is a GUARANTEED extra unit and draws NO roll of its own.
economyCase("gather with event bonus", 7,
  s => {}, s => [G.gather(s, MAT("copper"), NOW, true)]);

// Second gather of the same material inside the cooldown must be refused, with the remaining ms.
economyCase("gather twice, second on cooldown", 3, s => {}, s => [
  G.gather(s, MAT("copper"), NOW),
  G.gather(s, MAT("copper"), NOW + 1000),
]);

// ...and allowed once it has elapsed. regenMsFor(copper) is 8500 at lvl 1.
economyCase("gather again after cooldown elapses", 3, s => {}, s => [
  G.gather(s, MAT("copper"), NOW),
  G.gather(s, MAT("copper"), NOW + G.regenMsFor(MAT("copper"))),
]);

// The level gate, and that it refuses BEFORE touching the cooldown.
economyCase("gather runite under-levelled", 5, s => {}, s => [G.gather(s, MAT("runite"), NOW)]);

// Smelt: the bronze bar is the only two-input recipe, so it also pins multi-item consumption.
economyCase("smelt bronze with materials", 11,
  s => { s.inventory = { copper: 2, tin: 1 }; },
  s => [G.smelt(s, BAR("bar_bronze"))]);

economyCase("smelt bronze without tin", 11,
  s => { s.inventory = { copper: 2 }; },
  s => [G.smelt(s, BAR("bar_bronze"))]);

// Forge consumes bars and grants tier*25+10 xp — a formula, not a data column.
economyCase("forge a bronze wand", 13,
  s => { s.inventory = { bar_bronze: 3 }; s.skills.smithing = 20; },
  s => [G.forge(s, equipmentFor("bronze", "wand"))]);

// Brew: a buff potion, because its two-material recipe is the one a port is likeliest to fumble.
economyCase("brew draught of focus", 17,
  s => { s.inventory = { raw_salmon: 1, copper: 1 }; s.skills.alchemy = 30; },
  s => [G.brew(s, POTIONS.find(p => p.id === "potion_focus"))]);

// Refine has NO level gate — it is the entry point to Scribing, so gating it would make the skill
// unstartable. A port that adds a gate "for consistency" fails here.
economyCase("refine ore into reagent at level 1", 19,
  s => { s.inventory = { copper: 1 }; },
  s => [G.refine(s, "reagent", "copper")]);

economyCase("refine rejects a wrong source", 19,
  s => { s.inventory = { copper: 1 }; },
  s => [G.refine(s, "canvas", "copper")]);      // canvas comes from wood, not ore

// Selling: a pristine variant is worth PRISTINE_MULTIPLIER× its base and is not a table row.
economyCase("sell ore and its pristine variant", 23,
  s => { s.inventory = { copper: 3, pristine_copper: 1 }; },
  s => [G.sellItem(s, "copper", 2), G.sellItem(s, "pristine_copper", 1)]);

economyCase("sell more than owned", 23,
  s => { s.inventory = { copper: 1 }; },
  s => [G.sellItem(s, "copper", 5)]);

// Enchanting spends gold AND materials, and re-enchanting replaces rather than stacks.
economyCase("enchant then re-enchant the same item", 29,
  s => {
    s.skills.enchanting = 45;
    s.gold = 1000;
    s.inventory = { bar_bronze: 1, bar_silver: 1 };
    s.equipment = [{ uid: "fixture_eq", id: "bronze_wand", metal: "bronze", slot: "wand", tier: 1 }];
  },
  s => [G.enchantItem(s, "fixture_eq", "whet_1"), G.enchantItem(s, "fixture_eq", "whet_2")]);

// Mastery is DERIVED from completed lessons — never stored — so the totals must be recomputed.
const masteries = [];
for (const done of [[], ["l_field"], ["l_field", "l_ore"], ["l_field", "l_ore", "l_smith", "l_alchemy", "l_fish"]]) {
  const s = G.newGame();
  s.lessons.done = done.slice();
  masteries.push({ lessonsDone: done.slice(), expected: G.masteries(s) });
}

// ---------------------------------------------------------------- card shape invariants

// Counts a port can assert cheaply to prove the data loaded intact and completely.
const byType = {};
for (const c of CARDS) byType[c.type] = (byType[c.type] || 0) + 1;

const fixtures = {
  generated: "tools/export-test-fixtures.mjs — golden values from the web build; do not hand-edit",
  note: "A C# test reproducing these is verified against the shipped game, not merely self-consistent.",
  cardCounts: { total: CARDS.length, byType },
  ultChargeMax: ULT_CHARGE_MAX,
  prng,
  progression: { xpForLevel, wizardLevel, skillXp },
  economy,
  masteries,
  // Read from the source, not typed here — the first C# draft guessed 500 and was wrong.
  startGold: G.START_GOLD,
  cardTraitResolution,
  affinity,
  ultimateGate,
};

const outFile = path.join(outDir, "testfixtures.json");
fs.writeFileSync(outFile, JSON.stringify(fixtures, null, 2) + "\n");

console.log(`wrote ${path.relative(ROOT, outFile)}`);
console.log(`  cardCounts          ${CARDS.length} total ${JSON.stringify(byType)}`);
console.log(`  xpForLevel          ${xpForLevel.length} pairs`);
console.log(`  wizardLevel         ${wizardLevel.length} pairs (incl. cumulative boundaries)`);
console.log(`  skillXp             ${skillXp.length} sequences`);
console.log(`  cardTraitResolution ${cardTraitResolution.length} creature cards`);
console.log(`  affinity            ${affinity.length} pairs`);
console.log(`  ultimateGate        ${ultimateGate.length} cases`);
console.log(`  prng                ${prng.length} seeds x ${prng[0].values.length} draws`);
console.log(`  economy             ${economy.length} seeded action runs`);
console.log(`  masteries           ${masteries.length} lesson sets`);
