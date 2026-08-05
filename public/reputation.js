// reputation.js — standing with the NPCs you actually deal with (BACKLOG §2 "NPC reputation").
//
// PURE (no THREE, no DOM), same pattern as academy.js: this module knows what a reputation
// NUMBER means (levels, perks, progress); the save just holds the number per NPC, and game code
// decides when to raise it.
//
// SCOPE: reputation is tracked for QUEST GIVERS, not every NPC in the game. A merchant you never
// talk to has nothing to have an opinion about. The mechanism is intentionally generic
// (`gainRep(s, npcKey, amt)` works for any key), so a future NPC only needs to start calling it —
// nothing here hardcodes the forest's two givers.

export const REP_LEVELS = [
  { name: "Stranger",   min: 0,   bonus: 0  },
  { name: "Acquainted", min: 15,  bonus: 5  },
  { name: "Friendly",   min: 35,  bonus: 10 },
  { name: "Trusted",    min: 70,  bonus: 15 },
  { name: "Honored",    min: 120, bonus: 25 },
];

/** How much reputation a completed quest is worth. Kept here, not per-quest, so every quest
 * builds the same relationship regardless of its gold reward — a quest is not worth more to the
 * NPC just because it paid more. */
export const REP_PER_QUEST = 12;

export function repOf(s, npcKey){ return ((s && s.reputation) || {})[npcKey] || 0; }

export function levelIndexFor(rep){
  let idx = 0;
  for (let i = 0; i < REP_LEVELS.length; i++) if (rep >= REP_LEVELS[i].min) idx = i;
  return idx;
}
export function levelFor(rep){ return REP_LEVELS[levelIndexFor(rep)]; }

/** The bonus percentage this NPC's rewards get, from the save. */
export function bonusFor(s, npcKey){ return levelFor(repOf(s, npcKey)).bonus; }

/** Progress toward the next reputation level, same shape as academy.js progressToNext. */
export function progressToNext(rep){
  const i = levelIndexFor(rep);
  const cur = REP_LEVELS[i], next = REP_LEVELS[i + 1];
  if (!next) return { have: rep, need: rep, pct: 100, maxed: true, next: null };
  const span = next.min - cur.min;
  const have = Math.max(0, rep - cur.min);
  return { have, need: span, pct: Math.min(100, Math.round((have / span) * 100)), maxed: false, next };
}

/** Raise reputation with an NPC. Mutates the save; the caller decides how much and when. */
export function gainRep(s, npcKey, amt){
  if (!s.reputation) s.reputation = {};
  s.reputation[npcKey] = (s.reputation[npcKey] || 0) + amt;
  return s.reputation[npcKey];
}
