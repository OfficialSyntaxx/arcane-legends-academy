// pvprank.js — PvP ranking, seasons and titles (BACKLOG §8 "PvP ranking", "PvP seasons"; also
// feeds §2 "player titles").
//
// PURE (no THREE, no DOM, no game.js), like variants.js's neighbours.
//
// WHY THIS IS THE SECOND DELIBERATE EXCEPTION TO "DERIVE, DON'T STORE" (the first is a card's
// printing in variants.js): rank points are the outcome of a SEQUENCE of match results, each
// adjusted by the state the previous one left behind (a streak bonus, a season floor). There is no
// way to recompute "how many points does this player have" from `pvp.wins`/`pvp.losses` alone —
// two players with the same 40-20 record can be at very different points depending on the ORDER
// their wins and losses came in. So `rankPoints`, `streak`, `season` and `seasonBest` are STORED,
// exactly like a card's `roll`/`variant`. Everything read FROM those four numbers — which tier,
// how far to the next one, the title, the season-floor protection — is still derived every time.
//
// NO CROSS-PLAYER LEADERBOARD: this project has no persistent server — `logic.js` is a stateless
// per-room referee, not a database (see CLAUDEREADME §3). A "leaderboard" that can only ever show
// one player is not a leaderboard, it is a lie with a scoreboard's furniture. What this module
// gives instead is a SEASON HISTORY: the player's own past seasons, honestly labelled as theirs.

// ---------------------------------------------------------------- tiers & titles

export const TIERS = [
  { id: "bronze",     name: "Bronze",     min: 0,    icon: "🥉" },
  { id: "silver",     name: "Silver",     min: 300,  icon: "🥈" },
  { id: "gold",       name: "Gold",       min: 700,  icon: "🥇" },
  { id: "platinum",   name: "Platinum",   min: 1200, icon: "💠" },
  { id: "diamond",    name: "Diamond",    min: 1800, icon: "💎" },
  { id: "master",     name: "Master",     min: 2500, icon: "🌟" },
  { id: "grandmaster",name: "Grandmaster",min: 3500, icon: "👑" },
];

export function tierIndexFor(points){
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (points >= TIERS[i].min) idx = i;
  return idx;
}
export function tierFor(points){ return TIERS[tierIndexFor(points)]; }
export function nextTier(points){ return TIERS[tierIndexFor(points) + 1] || null; }

export function progressToNextTier(points){
  const i = tierIndexFor(points);
  const cur = TIERS[i], next = TIERS[i + 1];
  if (!next) return { have: points, need: points, pct: 100, maxed: true, next: null };
  const span = next.min - cur.min;
  const have = Math.max(0, points - cur.min);
  return { have, need: span, pct: Math.min(100, Math.round((have / span) * 100)), maxed: false, next };
}

/** "Gold Duelist", "Grandmaster of the Arcane" for the top tier — a title, for §2's player titles. */
export function titleFor(points){
  const t = tierFor(points);
  return t.id === "grandmaster" ? "Grandmaster of the Arcane" : `${t.name} Duelist`;
}

// ---------------------------------------------------------------- match results

const WIN_BASE = 20, LOSS_BASE = -15, STREAK_CAP = 5, STREAK_BONUS = 2;

/**
 * The point delta and new streak for one match result. Pure: takes the numbers it needs, returns
 * the numbers that changed, mutates nothing — `game.js` is what writes them back to the save.
 *
 * `seasonFloor` is the SOFT FLOOR: the minimum points a player who reached a tier this season can
 * fall to, however badly they lose afterward — the standard ranked-game promise that a tier once
 * earned cannot be lost to a losing streak, only *within* the tier. It is computed from
 * `seasonBest`, not from the player's current points, so it cannot retreat as they lose.
 */
export function resultOf(won, points, streak, seasonFloor){
  if (won){
    const gain = WIN_BASE + Math.min(streak, STREAK_CAP) * STREAK_BONUS;
    return { points: points + gain, streak: streak + 1, delta: gain };
  }
  const floor = Math.max(0, seasonFloor || 0);
  const lost = Math.max(floor, points + LOSS_BASE);
  return { points: lost, streak: 0, delta: lost - points };
}

// ---------------------------------------------------------------- seasons

/** One season per UTC calendar month, e.g. "2026-08". A pure function of the clock, not a counter. */
export function seasonIdFor(nowMs){
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Roll a save into the CURRENT season if it is not already there: record the finished season in
 * history, then a SOFT RESET — half of the peak reached, never below the tier the player finished
 * in (so a Diamond player restarts partway into Diamond's own range, not back at Bronze).
 *
 * Mutates `pvp` in place and returns it, matching the shape of `settleAuctions` in game.js — this
 * is the one place in the module that is not a pure query, and it is called from exactly one spot
 * (`load()`), the same way settleAuctions is.
 */
export function settleSeason(pvp, nowMs){
  const id = seasonIdFor(nowMs);
  if (pvp.season === id) return pvp;
  if (pvp.season){                                    // nothing to record on a brand-new save
    pvp.history = pvp.history || [];
    pvp.history.unshift({ season: pvp.season, points: pvp.seasonBest || 0, tier: tierFor(pvp.seasonBest || 0).id });
    pvp.history = pvp.history.slice(0, 12);           // keep it a history, not an ever-growing log
  }
  const floor = tierFor(pvp.seasonBest || 0).min;
  pvp.rankPoints = Math.max(floor, Math.floor((pvp.seasonBest || 0) * 0.5));
  pvp.seasonBest = pvp.rankPoints;
  pvp.streak = 0;
  pvp.season = id;
  return pvp;
}

/**
 * Apply one match result to a `pvp` record (the same object `settleSeason` operates on). Updates
 * `rankPoints`, `streak` and `seasonBest` (the season's own high-water mark, which is what next
 * season's soft reset and this season's floor are both computed from).
 */
export function applyResult(pvp, won){
  const floor = tierFor(pvp.seasonBest || 0).min;
  const r = resultOf(won, pvp.rankPoints || 0, pvp.streak || 0, floor);
  pvp.rankPoints = r.points;
  pvp.streak = r.streak;
  pvp.seasonBest = Math.max(pvp.seasonBest || 0, r.points);
  return r;
}

// ---------------------------------------------------------------- validation

export function validateRanks(){
  const problems = [];
  if (TIERS[0].min !== 0) problems.push("the first tier must start at 0");
  let last = -1;
  for (const t of TIERS){
    if (t.min <= last) problems.push(`${t.id}: not strictly above the tier before it`);
    last = t.min;
    if (!t.icon) problems.push(`${t.id}: no icon`);
  }
  if (WIN_BASE <= 0) problems.push("a win must always gain points");
  if (LOSS_BASE >= 0) problems.push("a loss must always be able to cost points");
  if (WIN_BASE + LOSS_BASE <= 0) problems.push("a 50% win rate should not lose points on net, over time");
  return problems;
}
