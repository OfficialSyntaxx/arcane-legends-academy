// achievements.js — account-wide achievements and player titles (BACKLOG §1/§2 "Achievements and
// player titles").
//
// PURE (no THREE, no DOM, no game.js), like variants.js's neighbours. Reads `s` (the whole save)
// directly rather than being handed pre-computed numbers, because unlike academy.js's score this
// module deliberately spans systems (quests, dungeons, PvP, wealth, skills, reputation) that would
// otherwise need a bespoke "extras" object threaded in from game.js for every new achievement.
//
// HOW THIS DIFFERS FROM codex.js's ACHIEVEMENTS: those are scoped to the card collection on
// purpose (see codex.js's own header) and already feed cardbacks.js. This module is everything
// ELSE a player accomplishes — the world, PvP, wealth, crafting, reputation — so the two lists
// never overlap and neither needs to know the other exists.
//
// EVERYTHING IS DERIVED, same rule as codex.js: an achievement reads the save's live state every
// time, so losing the gold or the rank that earned it un-earns it. That is the honest behaviour,
// not a bug — a "Gold Hoarder" who spent it all is not currently a gold hoarder.
//
// TITLES follow cardbacks.js's exact shape: which titles are UNLOCKED is derived from achievements
// every time; WHICH ONE IS EQUIPPED is the one stored bit (`save.title`), the same "everything
// else is derived, a choice is what gets stored" rule as `save.cardBack`/`save.favorites`.

import { ZONE_QUESTS } from "./zonequests.js";
import * as RANK from "./pvprank.js";
import * as PRESTIGE from "./prestige.js";
import * as SEASONS from "./seasons.js";

export const DEFAULT_TITLE = "wizard";

// `title: null` achievements exist (none currently) would grant no title, just a badge — kept as
// an option for future non-title achievements rather than forcing every entry to invent one.
export const ACHIEVEMENTS = [
  { id: "wayfarer",          name: "Wayfarer",           icon: "🗺️",
    desc: "Complete every field quest", title: "Wayfarer",
    of: (s) => ({ have: (s.zoneQuests?.done || []).length, need: ZONE_QUESTS.length }) },
  { id: "wyrmslayer",        name: "Wyrmslayer",         icon: "🐲",
    desc: "Defeat the Cinder Wyrm", title: "Wyrmslayer",
    of: (s) => ({ have: dungeonBoss(s, "cinderhollow_caverns") ? 1 : 0, need: 1 }) },
  { id: "vault_breaker",     name: "Vault Breaker",      icon: "🌊",
    desc: "Defeat the Drowned Archon", title: "Vault Breaker",
    of: (s) => ({ have: dungeonBoss(s, "drowned_vault") ? 1 : 0, need: 1 }) },
  { id: "wyrm_render",       name: "Wyrmrender",         icon: "🔥",
    desc: "Defeat the Ember Wyrm", title: "Wyrmrender",
    of: (s) => ({ have: dungeonBoss(s, "ashen_caverns") ? 1 : 0, need: 1 }) },
  { id: "veteran_duelist",   name: "Veteran Duelist",    icon: "⚔️",
    desc: "Win 50 duels", title: "Veteran Duelist",
    of: (s) => ({ have: s.stats?.won || 0, need: 50 }) },
  { id: "gold_hoarder",      name: "Gold Hoarder",       icon: "💰",
    desc: "Hold 5,000 gold at once", title: "Gold Hoarder",
    of: (s) => ({ have: s.gold || 0, need: 5000 }) },
  { id: "master_artisan",    name: "Master Artisan",     icon: "🛠️",
    desc: "Reach level 20 in any one craft", title: "Master Artisan",
    of: (s) => ({ have: Math.max(0, ...Object.values(s.skills || {})), need: 20 }) },
  { id: "arcane_scholar",    name: "Arcane Scholar",     icon: "🧙",
    desc: "Reach wizard level 20", title: "Arcane Scholar",
    of: (s) => ({ have: s.level || 0, need: 20 }) },
  { id: "gold_duelist",      name: "Gold Duelist",       icon: "🥇",
    desc: "Reach Gold rank in PvP", title: RANK.titleFor(RANK.TIERS[2].min),
    of: (s) => ({ have: s.pvp?.rankPoints || 0, need: RANK.TIERS[2].min }) },
  { id: "grandmaster",       name: "Grandmaster",        icon: "👑",
    desc: "Reach Grandmaster rank in PvP", title: RANK.titleFor(RANK.TIERS[RANK.TIERS.length - 1].min),
    of: (s) => ({ have: s.pvp?.rankPoints || 0, need: RANK.TIERS[RANK.TIERS.length - 1].min }) },
  { id: "well_liked",        name: "Well Liked",         icon: "🤝",
    desc: "Reach Honored standing with any quest giver", title: "Well Liked",
    of: (s) => ({ have: Math.max(0, ...Object.values(s.reputation || {}), 0), need: 120 }) },
  // BACKLOG §10 "Prestige" — one achievement per tier, same shape as the PvP-rank pair above
  // (dungeonBoss achievements read worldState; these read s.prestige.level). The title is the
  // tier's own name, so equipping it is literally wearing the rank prestige just granted.
  ...PRESTIGE.TIERS.map(t => ({
    id: `prestige_${t.level}`, name: t.name, icon: t.icon,
    desc: `Reach ${t.name} (Prestige ${t.level})`, title: t.name,
    of: (s) => ({ have: (s.prestige && s.prestige.level) || 0, need: t.level }),
  })),
  // BACKLOG §10 "Seasonal events" — one per season, `of()` reads a STORED claim (`s.seasons`
  // is one of the few deliberate exceptions to "derive, don't store"; see seasons.js's own header
  // for why: there is no way to recompute after the fact whether a season's real window was open
  // when the claim happened). Reaching this achievement unlocks the matching exclusive card back
  // in cardbacks.js via the existing achievement-gated shape — no new unlock system needed.
  ...SEASONS.SEASONS.map(sn => ({
    id: `season_${sn.id}`, name: sn.name, icon: sn.icon,
    desc: `Claim the ${sn.name} card back during its real-world season`, title: sn.name,
    of: (s) => ({ have: (s.seasons && s.seasons.claimed || []).includes(sn.id) ? 1 : 0, need: 1 }),
  })),
];

function dungeonBoss(s, dungeonId){
  const d = (s.worldState && s.worldState.dungeons) || {};
  return !!(d[dungeonId] && d[dungeonId].bossDead);
}

export function achievementsFor(s){
  return ACHIEVEMENTS.map(a => {
    const p = a.of(s);
    return { ...a, have: Math.min(p.have, p.need), need: p.need, done: p.have >= p.need,
             pct: p.need ? Math.min(100, Math.round((p.have / p.need) * 100)) : 0 };
  });
}
export function achievementCount(s){
  const all = achievementsFor(s);
  return { done: all.filter(a => a.done).length, total: all.length };
}
export function doneAchievementIds(s){
  return achievementsFor(s).filter(a => a.done).map(a => a.id);
}

// ---------------------------------------------------------------- titles

const DEFAULT_TITLE_ENTRY = { id: DEFAULT_TITLE, name: "Wizard", achievement: null };

/** Every title a player COULD ever equip: the default, plus one per achievement that grants one. */
export const TITLES = [
  DEFAULT_TITLE_ENTRY,
  ...ACHIEVEMENTS.filter(a => a.title).map(a => ({ id: a.id, name: a.title, achievement: a.id })),
];
const TITLE_MAP = Object.fromEntries(TITLES.map(t => [t.id, t]));

export function isTitleUnlocked(titleId, doneIds){
  const t = TITLE_MAP[titleId];
  if (!t) return false;
  return t.achievement == null || (doneIds || []).includes(t.achievement);
}
export function unlockedTitles(doneIds){
  return TITLES.filter(t => isTitleUnlocked(t.id, doneIds));
}
export function equippedTitle(save){
  const id = save && save.title;
  return TITLE_MAP[id] || DEFAULT_TITLE_ENTRY;
}
export function setTitle(save, titleId, doneIds){
  if (!isTitleUnlocked(titleId, doneIds)) return { ok:false, err:"locked" };
  save.title = titleId;
  return { ok:true };
}

export function validateAchievements(){
  const problems = [];
  const ids = new Set();
  for (const a of ACHIEVEMENTS){
    if (ids.has(a.id)) problems.push(`duplicate achievement id "${a.id}"`);
    ids.add(a.id);
    if (!a.name || !a.desc || !a.icon) problems.push(`${a.id}: incomplete`);
    if (typeof a.of !== "function") problems.push(`${a.id}: no progress function`);
    // Every achievement must be ACHIEVABLE against a maxed-out save — probe with the best
    // plausible state for every field an `of()` might read, the same "no unreachable target"
    // discipline codex.js's own validator holds card achievements to.
    const maxSave = {
      zoneQuests: { done: ZONE_QUESTS.map(q => q.id) },
      worldState: { dungeons: { cinderhollow_caverns: { bossDead: true }, drowned_vault: { bossDead: true }, ashen_caverns: { bossDead: true } } },
      stats: { won: 9999 },
      gold: 999999,
      skills: { mining: 99, fishing: 99, woodcutting: 99, smithing: 99, alchemy: 99, scribing: 99, enchanting: 99 },
      level: 999,
      pvp: { rankPoints: 99999 },
      reputation: { anyone: 99999 },
      prestige: { level: PRESTIGE.MAX_PRESTIGE },
      seasons: { claimed: SEASONS.SEASONS.map(sn => sn.id) },
    };
    const p = a.of(maxSave);
    if (!(p.need > 0)) problems.push(`${a.id}: needs a positive target`);
    if (p.have < p.need) problems.push(`${a.id}: unreachable even at max plausible progress (${p.have}/${p.need})`);
  }
  const titleIds = new Set();
  for (const t of TITLES){
    if (titleIds.has(t.id)) problems.push(`duplicate title id "${t.id}"`);
    titleIds.add(t.id);
    if (!t.name) problems.push(`title ${t.id}: missing name`);
  }
  if (TITLE_MAP[DEFAULT_TITLE].achievement != null) problems.push("the default title must be unconditionally unlocked");
  return problems;
}
