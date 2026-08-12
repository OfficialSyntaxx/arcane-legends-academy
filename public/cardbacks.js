// cardbacks.js — collectible card backs (BACKLOG §5 "Card backs").
//
// PURE (no THREE, no DOM, no game.js), like variants.js's neighbours.
//
// WHY TIED TO EXISTING ACHIEVEMENTS, NOT A NEW GRIND: codex.js's nine achievements are already a
// complete, derived "what have you accomplished with this collection" ladder. Inventing a second,
// parallel unlock currency for card backs would either duplicate that ladder under a new name or
// sit awkwardly alongside it. Every back but the default is unlocked by finishing the matching
// achievement — the same collection effort now buys two rewards, not one.
//
// WHY CSS GRADIENTS, NOT IMAGES: every visual system in this project that could be data instead of
// an asset is (`tint.js`'s hue shift, `vfx.js`'s procedural spell archetypes) — zero new bytes to
// generate, host or compress, and a back reads clearly at card-grid size where a busy illustration
// would not.
//
// WHICH backs are UNLOCKED is derived every time from the save's achievements, exactly like
// codex.js's own achievements are derived from the collection. WHICH one is EQUIPPED is the one
// stored bit — `save.cardBack` — the same shape as codex.js's favourites: everything else about a
// collection is derived, a *choice* is what gets stored.

export const DEFAULT_BACK = "academy";

export const CARD_BACKS = [
  { id: "academy",    name: "Academy Crest",        achievement: null,
    css: "linear-gradient(160deg,#3a2d6e,#1a1440)", emblem: "✦", emblemColor: "#ffc94d" },
  { id: "first_steps",name: "Novice's Ink",         achievement: "first_steps",
    css: "linear-gradient(160deg,#2d4a6e,#141a2e)", emblem: "🃏", emblemColor: "#7aa8ff" },
  { id: "archivist",  name: "Archivist's Binding",  achievement: "archivist",
    css: "linear-gradient(160deg,#4a3d1e,#241c0a)", emblem: "📚", emblemColor: "#e8c36a" },
  { id: "shiny",      name: "Foil Sheen",           achievement: "shiny",
    css: "linear-gradient(135deg,#16213e,#3a5d8e,#16213e)", emblem: "✨", emblemColor: "#9fd8ff" },
  { id: "rainbow",    name: "Rainbow Veil",         achievement: "rainbow",
    css: "linear-gradient(135deg,#4a1e4e,#1e4a3a,#4e2e1a)", emblem: "🌈", emblemColor: "#ff9ecb" },
  { id: "prismatic",  name: "Prismatic Weave",      achievement: "prismatic",
    css: "linear-gradient(135deg,#5a2ea8,#2e6ea8,#a82e8e)", emblem: "💠", emblemColor: "#f2ecff" },
  { id: "founder",    name: "Founder's Seal",       achievement: "founder",
    css: "linear-gradient(160deg,#4a3418,#241a0a)", emblem: "①", emblemColor: "#ffd98a" },
  { id: "curator",    name: "Curator's Vault",      achievement: "curator",
    css: "linear-gradient(160deg,#1a3a3a,#0a1a1a)", emblem: "💎", emblemColor: "#7be0ff" },
  { id: "legends",    name: "Legendary Gilt",       achievement: "legends",
    css: "linear-gradient(160deg,#6e5218,#2e2008)", emblem: "🏆", emblemColor: "#fbbf24" },
  { id: "scholar",    name: "Full Faculty Robe",    achievement: "scholar",
    css: "conic-gradient(from 0deg,#ff6b35,#5fd6ff,#a06bff,#3ddc84,#ff9ecb,#e8e6f0,#ffc94d,#ff6b35)",
    emblem: "🎓", emblemColor: "#1a1440" },
  // BACKLOG §10 "Seasonal events" — one per real season, unlocked by the matching season_<id>
  // achievement in achievements.js (which reads a STORED claim, see seasons.js's own header for
  // why). This module needs no changes to support them: `achievement` is just another id here.
  { id: "season_spring", name: "Spring Bloom",    achievement: "season_spring",
    css: "linear-gradient(160deg,#4a6e3a,#1a2e14)", emblem: "🌸", emblemColor: "#ffb3d9" },
  { id: "season_summer", name: "Summer Solstice", achievement: "season_summer",
    css: "linear-gradient(160deg,#6e5a1a,#2e2408)", emblem: "☀️", emblemColor: "#ffe066" },
  { id: "season_autumn", name: "Autumn Harvest",  achievement: "season_autumn",
    css: "linear-gradient(160deg,#8a4a1a,#3a1e08)", emblem: "🍂", emblemColor: "#ff9a4d" },
  { id: "season_winter", name: "Winter's Hush",   achievement: "season_winter",
    css: "linear-gradient(160deg,#2a4a6e,#0a1a2e)", emblem: "❄️", emblemColor: "#a8d8ff" },
];
export const BACK_MAP = Object.fromEntries(CARD_BACKS.map(b => [b.id, b]));

/** Whether a back is available to equip, given the achievement ids the save has actually earned. */
export function isUnlocked(backId, doneAchievementIds){
  const b = BACK_MAP[backId];
  if (!b) return false;
  return b.achievement == null || (doneAchievementIds || []).includes(b.achievement);
}
export function unlockedBacks(doneAchievementIds){
  return CARD_BACKS.filter(b => isUnlocked(b.id, doneAchievementIds));
}
/** The back this save currently has equipped — falls back to the default for an old or bad id. */
export function equippedBack(save){
  const id = save && save.cardBack;
  return BACK_MAP[id] || BACK_MAP[DEFAULT_BACK];
}
export function setBack(save, backId, doneAchievementIds){
  if (!isUnlocked(backId, doneAchievementIds)) return { ok:false, err:"locked" };
  save.cardBack = backId;
  return { ok:true };
}

export function validateCardBacks(){
  const problems = [];
  const b0 = BACK_MAP[DEFAULT_BACK];
  if (!b0) problems.push("DEFAULT_BACK is not a real back id");
  else if (b0.achievement != null) problems.push("the default back must be unconditionally unlocked");
  const ids = new Set();
  for (const b of CARD_BACKS){
    if (ids.has(b.id)) problems.push(`duplicate back id "${b.id}"`);
    ids.add(b.id);
    if (!b.name || !b.css || !b.emblem) problems.push(`${b.id}: missing name/css/emblem`);
  }
  return problems;
}
