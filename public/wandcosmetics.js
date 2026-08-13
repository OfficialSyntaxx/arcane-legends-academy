// wandcosmetics.js — collectible wand particle effects (BACKLOG §7 "Wand cosmetics").
//
// PURE (no THREE, no DOM, no game.js), same shape as cardbacks.js — its closest sibling, and
// deliberately built the same way.
//
// WHY TIED TO THE SAME 9 COLLECTION ACHIEVEMENTS CARD BACKS USE, NOT A NEW GRIND: codex.js's
// achievements are already a complete "what have you accomplished with this collection" ladder,
// and card backs + titles already spend it twice. A wand cosmetic is a third reward off the SAME
// effort rather than a fourth unlock currency competing for the player's attention.
//
// WHY DATA (a colour + a mote count), NOT A NEW ASSET: every cosmetic system in this project that
// could be numbers instead of a file is (tint.js's hue shift, the character-creation aura's
// ground glow) — this is the aura's own trick, reused at the wand's tip instead of the player's
// feet. World.js already knows how to build a small orbiting-motes particle group from a colour
// and a count; this module only supplies which colour and how many.
//
// WHICH cosmetics are UNLOCKED is derived every time from the save's achievements, exactly like
// cardbacks.js. WHICH one is EQUIPPED is the one stored bit — `save.wandFx` — the same shape as
// `save.cardBack`.

export const DEFAULT_WAND_FX = "none";

export const WAND_FX = [
  { id: "none",       name: "No Effect",        achievement: null,
    color: null, motes: 0 },
  { id: "first_steps",name: "Novice Spark",     achievement: "first_steps",
    color: 0x7aa8ff, motes: 2 },
  { id: "archivist",  name: "Archivist's Glow", achievement: "archivist",
    color: 0xe8c36a, motes: 3 },
  { id: "shiny",      name: "Foil Shimmer",     achievement: "shiny",
    color: 0x9fd8ff, motes: 3 },
  { id: "rainbow",    name: "Rainbow Wisp",     achievement: "rainbow",
    color: 0xff9ecb, motes: 4 },
  { id: "prismatic",  name: "Prismatic Flare",  achievement: "prismatic",
    color: 0xf2ecff, motes: 4 },
  { id: "founder",    name: "Founder's Glow",   achievement: "founder",
    color: 0xffd98a, motes: 3 },
  { id: "curator",    name: "Curator's Wisp",   achievement: "curator",
    color: 0x7be0ff, motes: 4 },
  { id: "legends",    name: "Legendary Blaze",  achievement: "legends",
    color: 0xfbbf24, motes: 5 },
  { id: "scholar",    name: "Scholar's Halo",   achievement: "scholar",
    color: 0xffffff, motes: 6 },
];
export const WAND_FX_MAP = Object.fromEntries(WAND_FX.map(w => [w.id, w]));

/** Whether a wand FX is available to equip, given the achievement ids the save has actually earned. */
export function isUnlocked(fxId, doneAchievementIds){
  const w = WAND_FX_MAP[fxId];
  if (!w) return false;
  if (!w.achievement) return true;
  return (doneAchievementIds || []).includes(w.achievement);
}

/** The equipped wand FX, falling back to the default if the stored id is missing or unknown. */
export function equippedFx(save){
  const id = (save && save.wandFx) || DEFAULT_WAND_FX;
  return WAND_FX_MAP[id] || WAND_FX_MAP[DEFAULT_WAND_FX];
}

/**
 * Equip a wand FX. Refuses a locked or unknown id — the same "reject, don't silently ignore"
 * contract `applyAppearance`/`cardbacks.js`'s own equip path uses.
 */
export function equip(save, fxId, doneAchievementIds){
  if (!WAND_FX_MAP[fxId]) return { ok: false, err: "unknown wand effect" };
  if (!isUnlocked(fxId, doneAchievementIds)) return { ok: false, err: "locked" };
  save.wandFx = fxId;
  return { ok: true };
}

/** Problems with the table, human-readable. Same contract as every other validator here. */
export function validateWandFx(opts = {}){
  const problems = [];
  if (WAND_FX[0].id !== DEFAULT_WAND_FX) problems.push("the default wand FX must be first in the list");
  if (WAND_FX[0].achievement != null) problems.push("the default wand FX must not require an achievement");
  const ids = new Set();
  for (const w of WAND_FX){
    if (ids.has(w.id)) problems.push(`duplicate wand FX id "${w.id}"`);
    ids.add(w.id);
    if (w.id !== DEFAULT_WAND_FX && w.color == null) problems.push(`${w.id}: no colour`);
    if (w.id !== DEFAULT_WAND_FX && !(w.motes > 0)) problems.push(`${w.id}: no motes`);
    if (w.achievement && opts.achievementIds && !opts.achievementIds.includes(w.achievement))
      problems.push(`${w.id}: unknown achievement "${w.achievement}"`);
  }
  return problems;
}
