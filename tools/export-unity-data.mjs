#!/usr/bin/env node
/**
 * export-unity-data.mjs — emit the game's design data as plain JSON for the Unity port.
 *
 * WHY THIS EXISTS RATHER THAN HAND-COPYING: the content (47 cards, creature traits, ultimates,
 * affinities, rarity/school tables) is the most valuable and least reproducible part of this
 * project. Retyping it into C# would silently introduce transcription errors that no compiler
 * catches — a wrong `atk` reads as a balance decision, not a bug. Generating it from the modules
 * the web build actually runs on makes the Unity data faithful BY CONSTRUCTION, and re-runnable
 * if the source data ever changes before the port completes.
 *
 * This is the same drift-guard reasoning `tools/sync-cards.mjs` already applies between cards.js
 * and logic.js — one source of truth, generated copies, never hand-edited.
 *
 * Usage:
 *   node tools/export-unity-data.mjs [outDir]      (default: unity-data/)
 *
 * Output is engine-agnostic JSON: it can be dropped in Unity's StreamingAssets/ and read with
 * Newtonsoft.Json, or fed to an editor script that bakes ScriptableObjects. Nothing here is
 * Unity-specific, so it stays useful if the target ever changes again.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { CARDS, SCHOOLS, RARITY, SCHOOL_BONUS } from "../public/cards.js";
import { CREATURES, RULES, traitForCard } from "../public/creatures.js";
import { AFFINITY_FX, ULTIMATES, ULT_CHARGE_MAX } from "../public/schoolmagic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] || path.join(ROOT, "unity-data"));
fs.mkdirSync(outDir, { recursive: true });

// Card `fx` is a mixed array in the source: bare strings for keyword traits ("haste", "taunt")
// and {k,n} objects for effects. C# wants those separated rather than an object-or-string union,
// which is painful to deserialise into a typed language.
function splitFx(fx){
  const keywords = [];
  const effects = [];
  for (const f of fx || []){
    if (typeof f === "string") keywords.push(f);
    else effects.push({ k: f.k, n: f.n ?? 0 });
  }
  return { keywords, effects };
}

const cards = CARDS.map(c => {
  const { keywords, effects } = splitFx(c.fx);
  return {
    id: c.id,
    name: c.name,
    school: c.school,
    type: c.type,                       // "creature" | "spell"
    cost: c.cost ?? 0,
    atk: c.atk ?? 0,
    hp: c.hp ?? 0,
    rarity: c.rarity,
    keywords,                           // haste / taunt / drain / multiAttack ...
    effects,                            // [{k,n}] — the same shapes applyFx dispatches on
    targeted: !!c.target,
    text: c.text || "",
    art: c.art || "",
  };
});

const schools = Object.entries(SCHOOLS).map(([id, s]) => ({ id, name: s.name, color: s.color }));
const rarities = Object.entries(RARITY).map(([id, r]) => ({ id, name: r.name, color: r.color, baseValue: r.base }));

// The non-transitive elemental ring: attacker beats defender for +1 damage.
const schoolBonus = SCHOOL_BONUS.map(([attacker, defender]) => ({ attacker, defender }));

const creatureTraits = Object.entries(RULES).map(([id, r]) => ({
  id,
  // Flatten to explicit fields so C# gets a fixed schema instead of a dictionary of unknowns.
  // Any trait added to RULES later must be added here too — validate-unity-data catches drift.
  haste: !!r.haste, taunt: !!r.taunt, drain: !!r.drain, evade: !!r.evade,
  spellImmune: !!r.spellImmune, survive: !!r.survive, warband: !!r.warband,
  regen: r.regen ?? 0, thorns: r.thorns ?? 0, poison: r.poison ?? 0, shield: r.shield ?? 0,
  healOnHit: r.healOnHit ?? 0, wizardDmg: r.wizardDmg ?? 0, rageAtk: r.rageAtk ?? 0,
  onPlayDmgAll: r.onPlayDmgAll ?? 0, onPlayHealAll: r.onPlayHealAll ?? 0,
  onPlayBuffAll: r.onPlayBuffAll ?? 0, onPlayBolt: r.onPlayBolt ?? 0,
  onPlayStealAtk: r.onPlayStealAtk ?? 0, onPlayDraw: r.onPlayDraw ?? 0,
  onPlayFreeze: !!r.onPlayFreeze,
  onAttackDmgAll: r.onAttackDmgAll ?? 0, onAttackDebuff: r.onAttackDebuff ?? 0,
}));

const creatureModels = Object.entries(CREATURES).map(([id, c]) => ({ id, ...c }));

// card id -> creature-trait key, RESOLVED BY THE REAL traitForCard() rather than by a
// re-implementation of its keyword matching.
//
// The first draft of the C# port hand-transcribed that matcher into a keyword table and got it
// wrong in several places: "skeleton" needs a word-boundary check as well as the loose match,
// "orc"+"skull" resolves to orc_skull, "demon"+blue/frost/ice must be tested BEFORE plain demon,
// and mage/elf/pixie/novice falls through to `ninja`, not `wizard`. Every one of those is a
// silent mis-resolution — the creature simply gets the wrong passive, which reads as a balance
// quirk rather than a bug.
//
// Exporting the resolved mapping removes the entire class of error: C# looks the answer up
// instead of deriving it. Same reasoning as generating the card data rather than retyping it.
const cardTraits = {};
for (const c of CARDS){
  if (c.type !== "creature") continue;
  const t = traitForCard(c.id, c.name);
  if (!t) continue;
  // recover the slug by identity against the RULES table the function indexed into
  const slug = Object.keys(RULES).find(k => RULES[k] === t.rules);
  if (slug) cardTraits[c.id] = slug;
}

const affinities = Object.entries(AFFINITY_FX).map(([school, f]) => ({
  school, effect: { k: f.k, n: f.n }, why: f.why,
}));

const ultimates = Object.entries(ULTIMATES).map(([school, u]) => ({
  school, name: u.name, icon: u.icon, text: u.text,
  effects: u.fx.map(f => ({ k: f.k, n: f.n ?? 0 })),
}));

const bundle = {
  generated: "tools/export-unity-data.mjs — do not hand-edit; edit the source modules and re-run",
  sourceCommit: process.env.GIT_COMMIT || null,
  ultChargeMax: ULT_CHARGE_MAX,
  schools, rarities, schoolBonus, cards, creatureTraits, creatureModels, cardTraits, affinities, ultimates,
};

const files = {
  "cards.json": cards,
  "schools.json": { schools, rarities, schoolBonus },
  "creatures.json": { traits: creatureTraits, models: creatureModels, cardTraits },
  "schoolmagic.json": { ultChargeMax: ULT_CHARGE_MAX, affinities, ultimates },
  "gamedata.json": bundle,          // everything in one file, for a single-load path
};
for (const [name, data] of Object.entries(files)){
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2) + "\n");
}

// A summary rather than silence, so a bad export is obvious rather than discovered in Unity.
console.log(`exported to ${path.relative(ROOT, outDir)}/`);
console.log(`  cards          ${cards.length}`);
console.log(`  schools        ${schools.length}   rarities ${rarities.length}   ring ${schoolBonus.length}`);
console.log(`  creatureTraits ${creatureTraits.length}`);
console.log(`  creatureModels ${creatureModels.length}`);
console.log(`  cardTraits     ${Object.keys(cardTraits).length} of ${cards.filter(c=>c.type==="creature").length} creature cards resolved`);
console.log(`  affinities     ${affinities.length}   ultimates ${ultimates.length}`);
const spells = cards.filter(c => c.type === "spell").length;
console.log(`  (${cards.length - spells} creatures, ${spells} spells)`);
