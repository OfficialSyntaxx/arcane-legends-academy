// schoolmagic.js — school-specific combat mechanics + ultimate abilities (BACKLOG §4 "School-
// specific mechanics", "School ultimate abilities"; also gives §4's "Reusable combat effect
// system" something worth being reusable FOR).
//
// PURE (no THREE, no DOM, no game.js), like archetypes.js and pvprank.js. This module describes
// WHAT each school's magic does, as plain fx descriptors in the same shape `cards.js` already
// uses ({k, n}) — game.js is what applies them, through the same `applyFx` dispatch every card
// effect already goes through. A school's affinity bonus and ultimate are not a special case; they
// are just more entries flowing through the one effect pipeline.
//
// WHY SPELLS ONLY, NOT CREATURES, FOR THE AFFINITY BONUS: a creature's affinity bonus already
// exists (+1 ATK when `p.school === c.school`, `game.js` `makeCreature`) — this module fills the
// matching gap on the spell side, which had none. Casting a spell of your own school does more
// than an off-school spell of the same printed number, exactly like a same-school creature already
// hits harder than an off-school one.
//
// WHY A CHARGE METER, NOT A COOLDOWN OR A FREE ACTION: an ultimate available every turn would just
// be a better spell, and one on a fixed-turn cooldown rewards nothing about *how you played*. A
// meter that fills from playing your own school's cards rewards staying on-theme, the same value
// the affinity bonus already rewards — and it is spent once, a single finisher per duel, not a
// repeatable engine.

// ---------------------------------------------------------------- affinity: spell school bonus

// One extra fx per school, appended to a spell's own fx ONLY when the caster's `school` matches the
// spell's printed school — the spell-side echo of the creature affinity bonus that already exists.
export const AFFINITY_FX = {
  fire:    { k: "dmg",    n: 1, why: "a fire wizard's fire spells burn hotter" },
  ice:     { k: "shield", n: 1, why: "an ice wizard's ice spells leave a rime of frost behind" },
  storm:   { k: "draw",   n: 1, why: "a storm wizard's storm spells crackle loose an extra card" },
  myth:    { k: "buffAll",n: 1, why: "a myth wizard's myth spells rally the whole board" },
  life:    { k: "heal",   n: 2, why: "a life wizard's life spells heal deeper" },
  death:   { k: "dmgWiz", n: 1, why: "a death wizard's death spells also chip the enemy wizard" },
  balance: { k: "heal",   n: 1, why: "a balance wizard's balance spells give a little of everything" },
};

/** The fx to append to a spell's own fx, or null if this caster/spell pairing earns no bonus. */
export function affinityFx(casterSchool, spellSchool){
  if (!casterSchool || casterSchool !== spellSchool) return null;
  const fx = AFFINITY_FX[casterSchool];
  return fx ? [{ k: fx.k, n: fx.n }] : null;
}

// ---------------------------------------------------------------- ultimates

export const ULT_CHARGE_MAX = 5;

// One finisher per school, spent once per duel. `fx` reuses the exact same {k,n} shapes every
// card already speaks — see applyFx's dispatch table in game.js.
export const ULTIMATES = {
  fire:    { name: "Inferno",        icon: "🔥", fx: [{k:"dmgAll",n:5},{k:"dmgWiz",n:3}],
             text: "Deal 5 to every enemy creature, 3 to the enemy wizard." },
  ice:     { name: "Deep Freeze",    icon: "❄️", fx: [{k:"freezeAll",n:1},{k:"shield",n:8}],
             text: "Freeze every enemy creature. Shield 8." },
  storm:   { name: "Maelstrom",      icon: "⚡", fx: [{k:"dmgWiz",n:6},{k:"draw",n:2}],
             text: "Deal 6 to the enemy wizard. Draw 2 cards." },
  myth:    { name: "Titan's Call",   icon: "🗿", fx: [{k:"buffAll",n:3},{k:"draw",n:1}],
             text: "Give your whole board +3 ATK. Draw a card." },
  life:    { name: "Rebirth",        icon: "🌿", fx: [{k:"heal",n:15},{k:"buffAll",n:2}],
             text: "Heal 15. Give your whole board +2 ATK." },
  death:   { name: "Soul Harvest",   icon: "💀", fx: [{k:"dmgAll",n:3},{k:"heal",n:6}],
             text: "Deal 3 to every enemy creature. Heal 6." },
  balance: { name: "Judgement",      icon: "⚖️", fx: [{k:"heal",n:6},{k:"shield",n:6},{k:"draw",n:1}],
             text: "Heal 6. Shield 6. Draw a card." },
};

export function ultimateFor(schoolId){ return ULTIMATES[schoolId] || null; }

/** Whether a player with this much banked charge may cast their school's ultimate right now. */
export function canUseUltimate(charge, schoolId, alreadyUsed){
  return !alreadyUsed && (charge || 0) >= ULT_CHARGE_MAX && !!ULTIMATES[schoolId];
}

// ---------------------------------------------------------------- validation

export function validateSchoolMagic(){
  const problems = [];
  const SCHOOL_IDS = ["fire","ice","storm","myth","life","death","balance"];
  for (const id of SCHOOL_IDS){
    if (!AFFINITY_FX[id]) problems.push(`${id}: no affinity bonus defined`);
    const u = ULTIMATES[id];
    if (!u) { problems.push(`${id}: no ultimate defined`); continue; }
    if (!u.name || !u.icon || !u.text) problems.push(`${id}: ultimate missing name/icon/text`);
    if (!Array.isArray(u.fx) || u.fx.length === 0) problems.push(`${id}: ultimate has no effect`);
  }
  if (ULT_CHARGE_MAX <= 0) problems.push("ULT_CHARGE_MAX must be positive");
  return problems;
}
