// vfx.js — what a spell LOOKS like (BACKLOG §4 "spell VFX").
//
// PURE (no THREE, no DOM), like the other spec modules, so tools/test.mjs can assert that every
// card in the catalog resolves to an effect and that no effect kind is silently unhandled.
//
// THE SPLIT: this module decides *what* to play — archetype, colour, origin, target, timing —
// entirely from the card's own `fx` list and school. `battle3d.js` only knows how to draw the
// archetypes. That keeps the visual language data-driven (a new card gets VFX for free, from its
// school and effect kinds) and, more importantly, keeps the decision testable: a card whose fx
// kind nobody mapped is a test failure here rather than a spell that silently plays nothing.
//
// Zero assets. Everything is procedural geometry and additive blending.

/** Where an effect starts and where it lands. */
export const ORIGIN = { CASTER: "caster", SKY: "sky", TARGET: "target" };

/**
 * Visual archetypes. Each is a shape of motion, not a specific spell:
 *   bolt   a projectile that travels caster -> target and bursts on arrival
 *   burst  an expanding shell centred on the target (area damage)
 *   rain   several bolts falling from above onto a whole side
 *   aura   a rising column/ring on the caster (buffs, shields, healing)
 *   beam   a sustained line caster -> target (drains, big single-target)
 *   glyph  a flat rune on the ground under the caster (fields, traps, draw)
 */
export const ARCHETYPES = ["bolt", "burst", "rain", "aura", "beam", "glyph"];

/** Per-school palette: [core, trail]. Core is the bright centre, trail the softer wake. */
export const SCHOOL_VFX = {
  fire:    { core: 0xffd9a0, trail: 0xff4a1e },
  ice:     { core: 0xe8fbff, trail: 0x4fb8ff },
  storm:   { core: 0xf0e2ff, trail: 0x9a4bff },
  myth:    { core: 0xfff2c0, trail: 0xffc233 },
  life:    { core: 0xdcffe4, trail: 0x2fd06a },
  death:   { core: 0xd8dde6, trail: 0x5b6070 },
  balance: { core: 0xfff6d8, trail: 0xffc94d },
};
export const DEFAULT_VFX = { core: 0xffffff, trail: 0xbd9bff };

/**
 * Every effect kind the card catalog uses, mapped to how it should read.
 * `weight` decides which kind wins when a card has several (meteor is dmgAll + dmgWiz — the
 * area strike is the headline, so it outranks the chip damage to the wizard).
 */
export const KIND_VFX = {
  dmg:        { archetype: "bolt",  origin: ORIGIN.CASTER, weight: 5 },
  dmgAll:     { archetype: "rain",  origin: ORIGIN.SKY,    weight: 9 },
  dmgWiz:     { archetype: "bolt",  origin: ORIGIN.CASTER, weight: 4 },
  heal:       { archetype: "aura",  origin: ORIGIN.CASTER, weight: 6 },
  healPlay:   { archetype: "aura",  origin: ORIGIN.CASTER, weight: 3 },
  shield:     { archetype: "aura",  origin: ORIGIN.CASTER, weight: 6 },
  buffAll:    { archetype: "glyph", origin: ORIGIN.CASTER, weight: 7 },
  freezeAll:  { archetype: "burst", origin: ORIGIN.TARGET, weight: 8 },
  draw:       { archetype: "glyph", origin: ORIGIN.CASTER, weight: 2 },
  fieldAtk:   { archetype: "glyph", origin: ORIGIN.CASTER, weight: 7 },
  fieldHeal:  { archetype: "glyph", origin: ORIGIN.CASTER, weight: 7 },
  fieldPip:   { archetype: "glyph", origin: ORIGIN.CASTER, weight: 7 },
  trapDmg:    { archetype: "burst", origin: ORIGIN.TARGET, weight: 5 },
  trapShield: { archetype: "aura",  origin: ORIGIN.CASTER, weight: 5 },
};

/** A summon is not in `fx` at all — a creature card's "effect" is the creature arriving. */
export const SUMMON_VFX = { archetype: "glyph", origin: ORIGIN.CASTER, weight: 1 };

/** Base duration in seconds, per archetype. Scaled a little by the spell's magnitude. */
const DURATION = { bolt: 0.55, burst: 0.7, rain: 1.0, aura: 0.9, beam: 0.8, glyph: 0.85 };

/**
 * The effect to play for a card.
 *
 * @param card  a CARDS entry (id, school, type, fx)
 * @returns {{archetype, origin, core, trail, duration, magnitude, targeted, kind}} or null when
 *          the card genuinely has nothing to show.
 */
export function effectFor(card){
  if (!card) return null;
  const palette = SCHOOL_VFX[card.school] || DEFAULT_VFX;

  // A card's `fx` list mixes two shapes: objects like {k:"dmg",n:4} for effects, and bare
  // strings like "taunt"/"drain"/"haste" for creature keywords. Only the objects describe
  // something that happens on cast; the keywords are passive and get the summon treatment.
  let best = null;
  for (const f of card.fx || []){
    if (typeof f === "string") continue;
    const spec = KIND_VFX[f.k];
    if (!spec) continue;                       // unmapped kinds are caught by the test, not here
    if (!best || spec.weight > best.spec.weight) best = { spec, f };
  }
  if (!best && card.type === "creature") best = { spec: SUMMON_VFX, f: { n: 1 } };
  if (!best) return null;

  const magnitude = Math.max(1, Math.abs(best.f.n || 1));
  return {
    kind: best.f.k || "summon",
    archetype: best.spec.archetype,
    origin: best.spec.origin,
    core: palette.core,
    trail: palette.trail,
    // bigger spells linger a little longer, capped so a 10-damage bolt does not stall the turn
    duration: DURATION[best.spec.archetype] * Math.min(1.6, 1 + magnitude * 0.05),
    magnitude,
    targeted: !!card.target,
  };
}

/** Effect kinds present in the catalog that nobody has mapped — for the test to report. */
export function unmappedKinds(cards){
  const missing = new Set();
  for (const c of cards){
    for (const f of c.fx || []){
      if (typeof f === "string") continue;      // creature keyword, not a cast effect
      if (!KIND_VFX[f.k]) missing.add(f.k);
    }
  }
  return [...missing];
}

/** Passive keywords on a creature card ("taunt", "drain", ...), as a plain list. */
export function keywordsFor(card){
  return (card && card.fx || []).filter(f => typeof f === "string");
}
