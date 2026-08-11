// prestige.js — Archmage prestige (BACKLOG §10 "Archmage progression", "Prestige").
//
// PURE (no THREE, no DOM, no game.js), same shape as academy.js's neighbours.
//
// THE PROBLEM THIS SOLVES: `academyScore(s)` in game.js is UNCAPPED — level, collection value and
// wins all keep climbing forever — but academy.js's 7-year curriculum tops out at Archmage (score
// 140) and then just stops. `ACADEMY.progressToNext()` returns `{pct:100, maxed:true}` forever
// after. A player who hits Archmage at hour 20 looks identical to one at hour 200. This module is
// what happens next.
//
// WHY IT MIRRORS pvprank.js'S SEASON SYSTEM, not a fresh design: that module already solved "reset
// some progress, keep a permanent record, grant a lasting reward for having done it" for this exact
// codebase. Prestige is the same shape with two changes: it's PLAYER-INITIATED (available once you
// reach Archmage) rather than calendar-driven, and what resets is different (see below) — so it
// reuses the pattern, not the code.
//
// WHAT RESETS, WHAT DOESN'T: prestiging resets `academyBonus` — the ONE stored input to
// `academyScore` (see game.js) that represents "credit earned by attending classes". Wizard level,
// collection value and win count are never touched; they are real, permanent progress that lives
// and is displayed elsewhere in the game, and resetting them would make prestige feel like losing
// the account rather than an achievement. Losing academyBonus alone (attending classes again) is a
// legible, honest cost for a mechanic that also hands out a permanent, stacking reward — the same
// trade PvP's season soft-reset makes.

import { YEARS } from "./academy.js";

const ARCHMAGE_MIN = YEARS[YEARS.length - 1].min;   // 140 today — read from academy.js so the two
                                                      // tables can never silently disagree about
                                                      // where the curriculum tops out.

// Five tiers, matching academy.js's YEARS and pvprank.js's TIERS in count and shape. Perks are
// CUMULATIVE (tier 3's numbers already include tiers 1-2), same convention as academy.js's YEARS,
// so a caller never sums a range — `perksFor(level)` is the one lookup.
export const TIERS = [
  { level: 1, name: "Ascendant Archmage",    icon: "✨", perks: { questGold: 2,  market: 1,  xp: 2  } },
  { level: 2, name: "Luminous Archmage",     icon: "🌟", perks: { questGold: 4,  market: 2,  xp: 4  } },
  { level: 3, name: "Paragon Archmage",      icon: "💫", perks: { questGold: 6,  market: 3,  xp: 6  } },
  { level: 4, name: "Sovereign Archmage",    icon: "👑", perks: { questGold: 8,  market: 4,  xp: 8  } },
  { level: 5, name: "Transcendent Archmage", icon: "🌌", perks: { questGold: 10, market: 5,  xp: 10 } },
];
export const MAX_PRESTIGE = TIERS.length;

const state = s => (s && s.prestige) || { level: 0, history: [] };

/** Current prestige level (0 = never prestiged). */
export function levelOf(s){ return state(s).level || 0; }

/** The tier entry for a level, or null at level 0 (no prestige perks yet). */
export function tierFor(level){ return TIERS[level - 1] || null; }

/** Cumulative perk percentages this prestige level grants — {questGold:0,market:0,xp:0} at 0. */
export function perksFor(level){
  const t = tierFor(level);
  return t ? t.perks : { questGold: 0, market: 0, xp: 0 };
}

/** Can this save prestige right now? Needs the live academy score (computed by game.js, same
 * "score passed in, not stored" contract academy.js's own functions use) and to not already be
 * at the top tier. */
export function canPrestige(s, score){
  return score >= ARCHMAGE_MIN && levelOf(s) < MAX_PRESTIGE;
}

/**
 * Prestige: bump the level, record an honest history entry (this save's own past, same "no fake
 * leaderboard" rule pvprank.js's season history follows), and report what to reset. Deliberately
 * does NOT touch `s.academyBonus` itself — same split as zonequests.js `turnIn`/pvprank.js
 * `applyResult`: this module computes what happened, game.js applies it to the save fields it
 * already owns, so this file never needs to know academyBonus's storage shape.
 */
export function prestige(s, score){
  if (!canPrestige(s, score)) return { ok: false, err: levelOf(s) >= MAX_PRESTIGE ? "maxed" : "not_ready" };
  if (!s.prestige) s.prestige = { level: 0, history: [] };
  const newLevel = s.prestige.level + 1;
  s.prestige.history.unshift({ level: newLevel, scoreAtPrestige: score, at: Date.now() });
  s.prestige.level = newLevel;
  return { ok: true, tier: tierFor(newLevel) };
}

/** Progress-bar shape toward the next tier, same contract as academy.js `progressToNext`/
 * pvprank.js `progressToNextTier` — `maxed` once every tier is spent. */
export function progressToNext(s){
  const level = levelOf(s);
  if (level >= MAX_PRESTIGE) return { level, next: null, maxed: true };
  return { level, next: TIERS[level], maxed: false };
}

export function validatePrestige(){
  const problems = [];
  if (TIERS.length < 1) problems.push("no prestige tiers defined");
  let prevLevel = 0;
  for (const t of TIERS){
    if (t.level !== prevLevel + 1) problems.push(`tier out of order: expected level ${prevLevel + 1}, got ${t.level}`);
    prevLevel = t.level;
    if (!t.name || !t.icon) problems.push(`tier ${t.level}: incomplete`);
    if (!(t.perks.questGold >= 0) || !(t.perks.market >= 0) || !(t.perks.xp >= 0))
      problems.push(`tier ${t.level}: invalid perks`);
  }
  // perks must be non-decreasing tier to tier, since they are advertised as cumulative
  for (let i = 1; i < TIERS.length; i++){
    const a = TIERS[i-1].perks, b = TIERS[i].perks;
    if (b.questGold < a.questGold || b.market < a.market || b.xp < a.xp)
      problems.push(`tier ${TIERS[i].level}: perks are lower than tier ${TIERS[i-1].level}, but perks are advertised as cumulative`);
  }
  return problems;
}
