// academy.js — the curriculum (BACKLOG §1/§2 "Academy progression / curriculum").
//
// PURE (no THREE, no DOM, and deliberately no game.js), like the other spec modules, so
// tools/test.mjs can walk every year headlessly.
//
// THE SHAPE: "academy rank" already existed as a cosmetic title in game.js (`academyRank`), a
// number-to-name lookup that did nothing but decorate the Hall screen. This turns it into an
// actual curriculum — seven years, each unlocking real perks (better quest pay, a market
// discount, faster wizard levelling) — while keeping the score formula and the seven names
// exactly as they were, so no existing save's rank changes underneath it.
//
// SCORE IS A PLAIN NUMBER IN, not a save object. Computing it needs `totalCollectionValue` from
// game.js, and game.js is what calls INTO this module (for perks) — importing game.js here would
// make that a cycle. So game.js computes the score and hands it to `yearFor`/`perksFor`; this
// module only knows what a score MEANS.

export const YEARS = [
  { name: "Novice",      min: 0,   subtitle: "First Year",   perks: { questGold: 0,  market: 0,  xp: 0  } },
  { name: "Apprentice",  min: 15,  subtitle: "Second Year",  perks: { questGold: 5,  market: 2,  xp: 5  } },
  { name: "Adept",       min: 30,  subtitle: "Third Year",   perks: { questGold: 8,  market: 4,  xp: 8  } },
  { name: "Scholar",     min: 50,  subtitle: "Fourth Year",  perks: { questGold: 12, market: 6,  xp: 12 } },
  { name: "Master",      min: 75,  subtitle: "Fifth Year",   perks: { questGold: 16, market: 8,  xp: 16 } },
  { name: "Grandmaster", min: 100, subtitle: "Sixth Year",   perks: { questGold: 20, market: 10, xp: 20 } },
  { name: "Archmage",    min: 140, subtitle: "Seventh Year", perks: { questGold: 25, market: 12, xp: 25 } },
];

/** Index into YEARS for a given score — the highest year whose threshold the score clears. */
export function yearIndexFor(score){
  let idx = 0;
  for (let i = 0; i < YEARS.length; i++) if (score >= YEARS[i].min) idx = i;
  return idx;
}

export function yearFor(score){ return YEARS[yearIndexFor(score)]; }
export function nextYear(score){ return YEARS[yearIndexFor(score) + 1] || null; }

/** Percent bonuses unlocked at this score: questGold (quest rewards), market (buy discount), xp. */
export function perksFor(score){ return yearFor(score).perks; }

/**
 * Progress toward the next year, for a progress bar.
 * `maxed` is true at the top of the curriculum — there is no "next" to show progress toward.
 */
export function progressToNext(score){
  const i = yearIndexFor(score);
  const cur = YEARS[i], next = YEARS[i + 1];
  if (!next) return { have: score, need: score, pct: 100, maxed: true, next: null };
  const span = next.min - cur.min;
  const have = Math.max(0, score - cur.min);
  return { have, need: span, pct: Math.min(100, Math.round((have / span) * 100)), maxed: false, next };
}

/** Apply a perk percentage to an amount, rounded — the one bit of arithmetic every call site needs. */
export function applyBonus(amount, pct){ return Math.round(amount * (1 + pct / 100)); }

// ---- Academy classes (real curriculum content beyond the numeric perks) ----
// Each year unlocks further classes. Attending one costs gold and grants `score` academy-rank
// progress (a stored bonus the player earns by showing up). One class per day.
export const CLASSES = [
  { id:"dueling",    name:"Dueling",      icon:"⚔️", cost:20, score:3, minYear:0, desc:"Practice your dueling form and card timing." },
  { id:"potions",    name:"Potions",      icon:"🧪", cost:25, score:4, minYear:1, desc:"Brew hardier drafts and stronger remedies." },
  { id:"summoning",  name:"Summoning",    icon:"🐉", cost:30, score:5, minYear:2, desc:"Study the creatures and their battle instincts." },
  { id:"scribing",   name:"Scribing",     icon:"📜", cost:35, score:6, minYear:3, desc:"Refine your cardcraft and grading eye." },
  { id:"alchemy",    name:"Alchemy",      icon:"⚗️", cost:40, score:7, minYear:4, desc:"Master the transmutations of the deep cauldron." },
  { id:"battlemagic",name:"Battle Magic", icon:"✨", cost:50, score:8, minYear:5, desc:"Advanced combat spellcraft for the arena." },
  { id:"archmagistery",name:"Archmagistery", icon:"👑", cost:60, score:10, minYear:6, desc:"Master-level study at the VeryTop of the tower." },
];
/** Classes a player at this score can attend (their current year unlocks them). */
export function classesFor(score){
  const yi = yearIndexFor(score);
  return CLASSES.filter(c => c.minYear <= yi);
}
export function classDef(id){ return CLASSES.find(c => c.id === id) || null; }
export function classCost(id){ const c = classDef(id); return c ? c.cost : 0; }
export function classScoreGain(id){ const c = classDef(id); return c ? c.score : 0; }
