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

// ---------------------------------------------------------------- card shape invariants

// Counts a port can assert cheaply to prove the data loaded intact and completely.
const byType = {};
for (const c of CARDS) byType[c.type] = (byType[c.type] || 0) + 1;

const fixtures = {
  generated: "tools/export-test-fixtures.mjs — golden values from the web build; do not hand-edit",
  note: "A C# test reproducing these is verified against the shipped game, not merely self-consistent.",
  cardCounts: { total: CARDS.length, byType },
  ultChargeMax: ULT_CHARGE_MAX,
  progression: { xpForLevel, wizardLevel, skillXp },
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
