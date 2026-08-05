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
