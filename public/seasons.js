// seasons.js — seasonal events (BACKLOG §10 "Seasonal events").
//
// PURE (no THREE, no DOM, no game.js), like pvprank.js's neighbours.
//
// THE CONSTRAINT THAT SHAPED THIS: this game has no persistent server (see CLAUDEREADME §3 — the
// only server-side code, `logic.js`, is a stateless per-room referee). "Seasonal" therefore cannot
// mean a live, server-pushed event; it can only mean content honestly gated by the REAL CALENDAR
// DATE, the same way `world.js`'s day/night cycle is derived from wall-clock time rather than a
// stored counter. Every player's client agrees on what season it is with nothing to synchronise.
//
// FOUR REAL ASTRONOMICAL SEASONS (meteorological months, not equinox maths — a season starting on
// the 1st of a calendar month is what a player expects, not an astronomically-precise date that
// moves by a few hours each year), each granting two things while active:
//   - a small universal gold/XP bonus (folded into game.js `academyPerks`, the same seam Prestige's
//     bonus already stacks through)
//   - an EXCLUSIVE card back, claimable once, only while that season is the real current season
//
// WHY A CLAIM IS STORED, NOT DERIVED: the whole point is that missing a season's window means
// missing it — the same honest scarcity `pvprank.js`'s season history and the one-time hidden
// treasures already model. `s.seasons.claimed` is a THIRD deliberate exception to "derive, don't
// store" (pvprank.js's rank points are the first, variants.js's printings the second): there is no
// way to recompute "was Winter's Hush the real current season on the date this save claimed it"
// after the fact, so the outcome itself must be the stored fact.
//
// WHY THE UNLOCK REUSES cardbacks.js's EXISTING achievement-gated shape instead of a new one: a
// seasonal card back's unlock condition is "the matching achievement is done", and that achievement
// (achievements.js `season_<id>`) reads `s.seasons.claimed` — exactly the same "achievement reads
// arbitrary save state" shape `prestige_1..5` already established for Prestige. cardbacks.js's
// `isUnlocked(backId, doneAchievementIds)` needs zero changes to support this.

export const SEASONS = [
  { id: "spring", name: "Spring Bloom",    icon: "🌸", months: [3, 4, 5],   bonus: { gold: 5, xp: 5 } },
  { id: "summer", name: "Summer Solstice", icon: "☀️", months: [6, 7, 8],   bonus: { gold: 5, xp: 5 } },
  { id: "autumn", name: "Autumn Harvest",  icon: "🍂", months: [9, 10, 11], bonus: { gold: 5, xp: 5 } },
  { id: "winter", name: "Winter's Hush",   icon: "❄️", months: [12, 1, 2],  bonus: { gold: 5, xp: 5 } },
];
export const SEASON_MAP = Object.fromEntries(SEASONS.map(s => [s.id, s]));

/** The real current season, from wall-clock time — same "derive from Date.now(), not a stored
 * counter" rule world.js's day/night cycle already follows. `now` is injectable for tests. */
export function currentSeason(now = Date.now()){
  const month = new Date(now).getMonth() + 1;   // 1-12
  return SEASONS.find(s => s.months.includes(month)) || SEASONS[0];
}

/** The gold/xp bonus active right now — {gold:0,xp:0} is never actually reachable since every
 * month belongs to exactly one season, but the shape matches academy.js/prestige.js's own
 * `perksFor` return value so game.js can sum all three the same way. */
export function activeBonus(now = Date.now()){
  return currentSeason(now).bonus;
}

const claimed = s => (s && s.seasons && Array.isArray(s.seasons.claimed)) ? s.seasons.claimed : [];

export function hasClaimed(s, seasonId){ return claimed(s).includes(seasonId); }

/** Can this save claim the CURRENT season's back right now? Only while it's actually that season,
 * and only once — the same one-shot shape a hidden treasure or a dungeon boss kill already has. */
export function canClaim(s, now = Date.now()){
  const cur = currentSeason(now);
  return !hasClaimed(s, cur.id);
}

/** Claim the current season. Mutates `s.seasons.claimed`; returns the season claimed, or null if
 * already claimed (idempotent — calling twice in the same season is a no-op, not a double-grant). */
export function claim(s, now = Date.now()){
  const cur = currentSeason(now);
  if (hasClaimed(s, cur.id)) return null;
  if (!s.seasons) s.seasons = { claimed: [] };
  if (!Array.isArray(s.seasons.claimed)) s.seasons.claimed = [];
  s.seasons.claimed.push(cur.id);
  return cur;
}

export function validateSeasons(){
  const problems = [];
  const months = new Set();
  for (const s of SEASONS){
    if (!s.name || !s.icon) problems.push(`${s.id}: incomplete`);
    if (!(s.months && s.months.length === 3)) problems.push(`${s.id}: needs exactly 3 months`);
    for (const m of s.months || []){
      if (m < 1 || m > 12) problems.push(`${s.id}: invalid month ${m}`);
      if (months.has(m)) problems.push(`month ${m} is claimed by more than one season`);
      months.add(m);
    }
    if (!(s.bonus && s.bonus.gold >= 0 && s.bonus.xp >= 0)) problems.push(`${s.id}: invalid bonus`);
  }
  if (months.size !== 12) problems.push(`seasons must cover all 12 months exactly once (covered ${months.size})`);
  return problems;
}
