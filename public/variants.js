// variants.js — foil / holo / prismatic printings and first editions (BACKLOG §5).
//
// PURE (no THREE, no DOM, no game.js), like cards.js's neighbours here.
//
// WHY: design pillar 3 is "every card has real value; grade, foil, and slab serials make each
// card feel tangible" — and *foil did not exist*. Grade and slabs shipped long ago; the middle
// term of the pillar was never built. Two identical Fire Dragons at the same grade were
// indistinguishable, so the only axis of collection value was the grade roll.
//
// THE ONE PLACE THIS CODEBASE DELIBERATELY STORES INSTEAD OF DERIVING.
// Everything else here recomputes state from the save on every read (onboarding, dorm, lessons,
// appearance…) because it can. A variant CANNOT be: it is the outcome of a dice roll at the
// moment a card was minted, and there is nothing to re-derive it from. `roll` — the grade seed —
// is stored for exactly the same reason and has been since the beginning. So:
//   * `variant` and `fe` are STORED on the instance, alongside `roll`.
//   * everything downstream of them (multiplier, label, badge, sort order, the collection's total
//     value) is DERIVED from those two fields on every read.
// If you find yourself wanting to store a card's computed value, don't — that is the drift trap.
//
// FIRST EDITION is a historical fact, not a roll: the first copy of a card type the player ever
// obtains is stamped. That is also unrecoverable after the fact (nothing records acquisition
// order), so it is stored at mint time and never recomputed.

/**
 * Printings, rarest last. `chance` is the probability of rolling that printing or better, checked
 * from the rarest downward — see `rollVariant`.
 *
 * `x` multiplies the card's value. These are steep on purpose: a printing the player will see
 * roughly once every 300 cards has to be worth stopping for, or it is just a different border.
 */
export const VARIANTS = [
  { id: "normal", name: "Normal",     chance: 1,      x: 1.0,  badge: "",   color: null,     glow: 0 },
  { id: "foil",   name: "Foil",       chance: 0.060,  x: 2.2,  badge: "✨", color: 0x9fd8ff, glow: 0.35 },
  { id: "holo",   name: "Holographic",chance: 0.015,  x: 4.5,  badge: "🌈", color: 0xff9ecb, glow: 0.6 },
  { id: "prism",  name: "Prismatic",  chance: 0.0035, x: 12.0, badge: "💠", color: 0xb58cff, glow: 1.0 },
];
export const VARIANT_MAP = Object.fromEntries(VARIANTS.map(v => [v.id, v]));

/** Value multiplier for a first-edition stamp, on top of the printing. */
export const FIRST_EDITION_X = 1.6;
export const FIRST_EDITION_BADGE = "①";

/**
 * Roll a printing. `rand` is a 0..1 source, injected so tests are deterministic and so this
 * module never reaches for game.js's rng.
 *
 * Checked rarest-first: a prismatic must not be swallowed by the foil band. `luck` is a
 * multiplier on the non-normal chances — packs are luckier than a scribed card, and a future
 * "lucky charm" has an obvious place to plug in.
 */
export function rollVariant(rand, luck = 1){
  const r = typeof rand === "function" ? rand() : rand;
  for (let i = VARIANTS.length - 1; i >= 1; i--){
    if (r < VARIANTS[i].chance * luck) return VARIANTS[i].id;
  }
  return "normal";
}

export function variantOf(card){
  return VARIANT_MAP[(card && card.variant) || "normal"] || VARIANT_MAP.normal;
}
export function isFirstEdition(card){ return !!(card && card.fe); }

/** The full multiplier a printing + stamp applies to a card's base value. */
export function multiplierFor(card){
  return variantOf(card).x * (isFirstEdition(card) ? FIRST_EDITION_X : 1);
}

/** Apply that multiplier to an already-computed base value. */
export function valueOf(card, baseValue){
  return Math.round(baseValue * multiplierFor(card));
}

/** Badges for the card face, most significant first. Empty for an ordinary card. */
export function badgesFor(card){
  const out = [];
  const v = variantOf(card);
  if (v.id !== "normal") out.push({ id: v.id, badge: v.badge, name: v.name, color: v.color });
  if (isFirstEdition(card)) out.push({ id: "fe", badge: FIRST_EDITION_BADGE, name: "First Edition", color: 0xffc94d });
  return out;
}

/** A one-line label, e.g. "Holographic · First Edition". Empty string for an ordinary card. */
export function labelFor(card){
  return badgesFor(card).map(b => b.name).join(" · ");
}

/**
 * Should this card be stamped first edition? True when the player owns no OTHER copy of the type.
 *
 * Takes the existing card list rather than the save so it stays independent of the save's shape,
 * and takes it BEFORE the new instance is pushed — a card is never its own predecessor.
 */
export function firstEditionFor(existingCards, cardId){
  return !(existingCards || []).some(c => c.id === cardId);
}

/** Sort key for the collection: rarer printings and first editions float to the top. */
export function collectionRank(card){
  return multiplierFor(card);
}

/** How many of each printing the player owns — for the collection header and achievements later. */
export function tallyFor(cards){
  const out = { normal: 0, foil: 0, holo: 0, prism: 0, firstEditions: 0 };
  for (const c of cards || []){
    out[variantOf(c).id] = (out[variantOf(c).id] || 0) + 1;
    if (isFirstEdition(c)) out.firstEditions++;
  }
  return out;
}

/** Problems with the table itself. Same contract as the other validators: a list. */
export function validateVariants(){
  const problems = [];
  const ids = new Set();
  let lastChance = Infinity, lastX = 0;
  for (const v of VARIANTS){
    if (ids.has(v.id)) problems.push(`duplicate variant id "${v.id}"`);
    ids.add(v.id);
    if (!v.name) problems.push(`${v.id}: no name`);
    if (!(v.x >= 1)) problems.push(`${v.id}: multiplier must be at least 1`);
    if (!(v.chance > 0 && v.chance <= 1)) problems.push(`${v.id}: chance out of range`);
    // Rarer must mean more valuable, or the collection's incentives point the wrong way.
    if (v.chance > lastChance) problems.push(`${v.id} is more common than the printing before it`);
    if (v.id !== "normal" && v.x <= lastX) problems.push(`${v.id} is rarer than the printing before it but worth no more`);
    lastChance = v.chance; lastX = v.x;
    if (v.id !== "normal" && !v.badge) problems.push(`${v.id}: no badge, so the player cannot tell it apart`);
  }
  if (VARIANTS[0].id !== "normal") problems.push("the first printing must be `normal`");
  if (VARIANTS[0].x !== 1) problems.push("`normal` must not change a card's value");
  // The rarest printing must actually be reachable — a chance below the float grid would make it
  // decorative table content that no player ever sees.
  const rarest = VARIANTS[VARIANTS.length - 1];
  if (rarest.chance < 1e-5) problems.push(`${rarest.id} is so rare it will effectively never drop`);
  return problems;
}
