// pets.js — Pets / familiars + Pet progression (BACKLOG §7).
//
// PURE (no THREE, no DOM, no game.js), like the other small catalog modules.
//
// WHY NO NEW ASSETS: `assets/models/` already ships ~35 KayKit creature GLBs, generated for
// dungeon/world enemies but never restricted to that use — six friendly ones (cat/dog/bunny/frog/
// chicken/panda) make a complete pet roster with zero new generation cost, the same "reuse what's
// already in the repo" instinct Ashen Mountains' props and Hard Mode's boss rematch both followed.
//
// WHY PROGRESSION IS DERIVED, NOT STORED: a pet's level is computed straight from `s.stats.won` —
// no separate pet-XP counter to keep in sync, migrate, or ever disagree with the wizard's own
// record. It grows WITH the wizard who owns it, the same "derive from a counter the save already
// keeps" instinct academy score's curriculum reads through, not a second grind bolted on.
//
// WHY THIS IS FLAVOUR, NOT A FIFTH STACKING ECONOMY BONUS: Prestige, Seasons and Cooking already
// stack a gold/xp bonus through `academyPerks`; a pet doing the same again would be the same
// reward under a fourth name. §7 files this under "Pets, Housing & Cosmetics", not Crafting &
// Economy, so pet progression stays purely cosmetic — a level number and a glow at max level, not
// another multiplier.

export const PETS = [
  { id:"cat",     name:"Familiar Cat",     icon:"🐱", model:"creature_Cat.glb",     height:0.55, cost:150 },
  { id:"dog",     name:"Familiar Dog",     icon:"🐶", model:"creature_Dog.glb",     height:0.65, cost:150 },
  { id:"bunny",   name:"Familiar Bunny",   icon:"🐰", model:"creature_Bunny.glb",   height:0.45, cost:120 },
  { id:"frog",    name:"Familiar Frog",    icon:"🐸", model:"creature_Frog.glb",    height:0.35, cost:110 },
  { id:"chicken", name:"Familiar Chick",   icon:"🐔", model:"creature_Chicken.glb", height:0.45, cost:130 },
  { id:"panda",   name:"Familiar Panda",   icon:"🐼", model:"creature_Panda.glb",   height:0.75, cost:260 },
];
export const PET_MAP = Object.fromEntries(PETS.map(p => [p.id, p]));

export const PET_MAX_LEVEL = 10;
const WINS_PER_LEVEL = 5;

/** A pet's level — fully derived from PvE+PvP wins already recorded on the save. */
export function levelFor(s){
  const wins = (s && s.stats && s.stats.won) || 0;
  return Math.min(PET_MAX_LEVEL, 1 + Math.floor(wins / WINS_PER_LEVEL));
}
export function isMaxLevel(s){ return levelFor(s) >= PET_MAX_LEVEL; }

/** Progress-bar shape toward the next level, same contract as academy.js/prestige.js's own. */
export function progressToNextLevel(s){
  if (isMaxLevel(s)) return { have:0, need:0, pct:100, maxed:true };
  const wins = (s && s.stats && s.stats.won) || 0;
  const have = wins % WINS_PER_LEVEL;
  return { have, need: WINS_PER_LEVEL, pct: Math.round((have / WINS_PER_LEVEL) * 100), maxed:false };
}

export function validatePets(){
  const problems = [];
  const ids = new Set();
  for (const p of PETS){
    if (ids.has(p.id)) problems.push(`duplicate pet id "${p.id}"`);
    ids.add(p.id);
    if (!p.name || !p.icon || !p.model) problems.push(`${p.id}: incomplete`);
    if (!(p.height > 0)) problems.push(`${p.id}: invalid height`);
    if (!(p.cost > 0)) problems.push(`${p.id}: invalid cost`);
  }
  return problems;
}
