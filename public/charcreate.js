// charcreate.js — character creation and per-school appearance (BACKLOG §2).
//
// PURE (no THREE, no DOM), like dorm.js / academy.js / onboarding.js, so tools/test.mjs can
// validate every look, every step and every derivation headlessly.
//
// WHAT THIS CAN AND CANNOT DO, and why:
// `player_wizard.glb` is ONE mesh with ONE material and one texture set. There is no robe
// submesh, no hat submesh, nothing to recolour independently — so "seven visually distinct
// wizards" cannot be done by assigning colours to parts. What it CAN do, and what this module
// describes, is:
//   1. a per-school HSL shift applied to the whole character, and
//   2. a school-coloured ground aura underneath them.
// Both are free and neither needs a new model. Genuinely different garments need seven generated
// robes or a modular character base — see docs/DESIGN-DECISIONS.md §4 and BLENDERTODO.md Tier 5.
//
// WHY HSL AND NOT A COLOUR LERP: the old `setPlayerColor` lerped every material 45% toward a flat
// school colour, which drags the face, hands and boots toward it too and flattens the painted
// texture into a wash. Rotating HUE while preserving each texel's own LIGHTNESS keeps all the
// painted detail and still produces a recognisably different wizard. That distinction is the
// whole reason this module exists rather than a constant in world.js.
//
// THE STATE SPLIT, same as onboarding.js / zonequests.js / dorm.js: what the player CHOSE is
// saved (`s.name`, `s.school`, `s.appearance`), what follows from it is DERIVED on every read.

// ---------------------------------------------------------------- schools
//
// `hue` is the target hue in degrees that the character is rotated toward; `sat` scales the
// texture's own saturation; `light` nudges lightness. `aura` is the ground glow's colour.
// Deliberately NOT read from cards.js SCHOOLS: that colour is a UI accent tuned for text on a
// dark panel, and several of them are too bright to wear. These are wearable versions.
// The seven ids here must match cards.js SCHOOLS exactly — `validateLooks` asserts it, because a
// school with no look silently falls back to Balance and the player never finds out why their
// wizard is the wrong colour. (The schools are fire/ice/storm/myth/life/death/balance; there is
// no "nature".)
export const SCHOOL_LOOKS = {
  fire:    { hue:  16, sat: 1.15, light: -0.02, aura: 0xff6b3c, label: "Emberweave" },
  ice:     { hue: 196, sat: 1.05, light:  0.06, aura: 0x7be0ff, label: "Frostlinen" },
  storm:   { hue: 268, sat: 1.10, light:  0.00, aura: 0xb07bff, label: "Stormsilk" },
  myth:    { hue: 142, sat: 1.05, light:  0.00, aura: 0x3ddc84, label: "Mythcloth" },
  life:    { hue: 330, sat: 0.95, light:  0.06, aura: 0xff9ecb, label: "Bloomsilk" },
  death:   { hue:  86, sat: 0.55, light: -0.12, aura: 0x9a6bd8, label: "Gravelinen" },
  balance: { hue:  44, sat: 1.05, light:  0.02, aura: 0xffc94d, label: "Balanceweave" },
};
export const SCHOOL_IDS = Object.keys(SCHOOL_LOOKS);

// ---------------------------------------------------------------- variants
//
// Player-chosen on top of the school. These do NOT change hue — the hue is the school's identity
// and letting a Fire wizard pick a blue robe would make the school unreadable at a glance, which
// is the one thing this whole system exists to communicate. They vary richness instead.
export const VARIANTS = [
  { id: "standard", label: "Standard", satMul: 1.00, lightAdd:  0.00, strength: 0.95 },
  { id: "deep",     label: "Deep",     satMul: 1.30, lightAdd: -0.09, strength: 1.00 },
  { id: "pale",     label: "Pale",     satMul: 0.70, lightAdd:  0.10, strength: 0.92 },
  { id: "worn",     label: "Worn",     satMul: 0.55, lightAdd: -0.03, strength: 0.78 },
];
export const VARIANT_IDS = VARIANTS.map(v => v.id);

// `strength` above is how far toward the school hue a texel is rotated, along the SHORT way round
// the wheel: 0 leaves the model as painted, 1 puts every texel exactly on the school hue.
//
// It must stay HIGH — 0.78 and up. This was originally tuned to 0.40–0.85 on the theory that a
// partial rotation would look more natural, and rendering it showed why that is wrong: the base
// texture is purple (hue ≈ 260°), so a 70% rotation toward Fire's 16° *stops at magenta*. Every
// school landed somewhere between purple and its own colour and none of them arrived. If a
// variant needs to look understated it must do it through SATURATION, not by refusing to travel
// the whole way round the wheel — otherwise the school stops being readable, which is the one
// thing this system exists to do. `validateLooks` enforces the floor.

export const AURAS = [
  { id: "none",  label: "None",        ring: false, motes: 0 },
  { id: "ring",  label: "Rune Ring",   ring: true,  motes: 0 },
  { id: "motes", label: "Drifting Motes", ring: true, motes: 7 },
];
export const AURA_IDS = AURAS.map(a => a.id);

// ---------------------------------------------------------------- name
export const NAME_MAX = 18;
export const DEFAULT_NAME = "Apprentice";

export function sanitizeName(raw){
  // Trim and collapse runs of whitespace. Stray spacing is a typo, not an error worth refusing —
  // so it is fixed silently rather than reported.
  const n = String(raw == null ? "" : raw).trim().replace(/\s+/g, " ");
  return n.slice(0, NAME_MAX);
}

/**
 * Why a name would be rejected, or null if it is fine. One reason, like dorm.js placement.
 *
 * Validates the SANITIZED form, so what is judged is exactly what would be stored — otherwise
 * "Rowan   the Green" is refused for double spaces that `sanitizeName` was about to remove anyway.
 */
export function nameProblem(raw){
  const n = sanitizeName(raw);
  if (!n) return "Your name cannot be empty";
  if (String(raw).trim().length > NAME_MAX) return `Keep it to ${NAME_MAX} characters or fewer`;
  // Letters, spaces, apostrophes and hyphens. Deliberately permissive about scripts (\p{L} covers
  // non-Latin alphabets) and deliberately strict about everything that would break the UI: the
  // name is interpolated into innerHTML on the Dorm screen, so angle brackets and ampersands are
  // a correctness matter, not a style preference.
  if (!/^[\p{L}][\p{L} '’-]*$/u.test(n)) return "Letters, spaces, apostrophes and hyphens only";
  return null;
}

// ---------------------------------------------------------------- derived appearance

export function variantFor(save){
  const id = (save && save.appearance && save.appearance.variant) || "standard";
  return VARIANTS.find(v => v.id === id) || VARIANTS[0];
}
export function auraFor(save){
  const id = (save && save.appearance && save.appearance.aura) || "ring";
  return AURAS.find(a => a.id === id) || AURAS[1];
}
export function lookFor(save){
  return SCHOOL_LOOKS[(save && save.school)] || SCHOOL_LOOKS.balance;
}

/**
 * The complete resolved appearance, in the shape world.js consumes. Everything here is derived —
 * nothing in this object is stored, so changing a VARIANT's numbers restyles every existing save
 * without a migration.
 */
export function appearanceFor(save){
  const look = lookFor(save), v = variantFor(save), a = auraFor(save);
  return {
    hue: look.hue,
    sat: +(look.sat * v.satMul).toFixed(3),
    light: +(look.light + v.lightAdd).toFixed(3),
    strength: v.strength,
    aura: a.ring ? look.aura : null,
    motes: a.motes,
    label: look.label + (v.id === "standard" ? "" : " (" + v.label + ")"),
  };
}

export function applyAppearance(save, patch){
  save.appearance = save.appearance || { variant: "standard", aura: "ring" };
  if (patch.variant != null){
    if (!VARIANT_IDS.includes(patch.variant)) return { ok: false, err: "unknown variant" };
    save.appearance.variant = patch.variant;
  }
  if (patch.aura != null){
    if (!AURA_IDS.includes(patch.aura)) return { ok: false, err: "unknown aura" };
    save.appearance.aura = patch.aura;
  }
  if (patch.name != null){
    const problem = nameProblem(patch.name);
    if (problem) return { ok: false, err: problem };
    save.name = sanitizeName(patch.name);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- the creation flow
//
// Three steps, each `done` DERIVED from the save rather than tracked by a cursor — the same
// pattern onboarding.js uses, and for the same reason: a player who backs out halfway, reloads,
// or changes their school later cannot desync a step counter that does not exist.
export const STEPS = [
  { id: "name",   title: "Your name",   sub: "What will the Academy call you?",
    done: s => !!s.name && !nameProblem(s.name) },
  { id: "school", title: "Your school", sub: "This sets your starter deck, your affinity and your colours.",
    done: s => !!s.school && !!s.flags && s.flags.schoolPicked === true },
  { id: "look",   title: "Your look",   sub: "Robe dye and arcane aura.",
    done: s => !!(s.appearance && s.appearance.variant && s.appearance.aura) },
];

/** The first unfinished step, or null when creation is complete. */
export function currentStep(save){
  return STEPS.find(st => !st.done(save)) || null;
}
export function isComplete(save){ return currentStep(save) == null; }
/**
 * `done` counts finished steps; `index` is the position of the step the player is actually ON.
 *
 * Those are NOT the same number and conflating them is what onboarding.js's `progress` already
 * had to fix: doing the school and the look but not the name leaves 2 done while the screen is
 * still asking question 1, and the header read "step 3 of 3" above an empty name box.
 */
export function progress(save){
  const done = STEPS.filter(st => st.done(save)).length;
  const cur = currentStep(save);
  return { done, total: STEPS.length, index: cur ? STEPS.indexOf(cur) : STEPS.length - 1 };
}

/** Problems with the tables themselves. Same contract as the other validators: a list. */
export function validateLooks(opts = {}){
  const problems = [];
  const hues = new Map();
  for (const [id, l] of Object.entries(SCHOOL_LOOKS)){
    if (!(l.hue >= 0 && l.hue < 360)) problems.push(`${id}: hue out of range`);
    if (!(l.sat > 0)) problems.push(`${id}: saturation must be positive`);
    if (l.aura == null) problems.push(`${id}: no aura colour`);
    if (!l.label) problems.push(`${id}: no robe name`);
    // Two schools that land on the same hue are two schools the player cannot tell apart, which
    // defeats the only thing this system does.
    for (const [other, h] of hues){
      // circular distance on the hue wheel: 350° and 10° are 20° apart, not 340°
      const d = 180 - Math.abs(Math.abs(l.hue - h) - 180);
      if (d < 22) problems.push(`${id} and ${other} are only ${d.toFixed(0)}° apart in hue`);
    }
    hues.set(id, l.hue);
  }
  if (opts.schoolIds){
    for (const s of opts.schoolIds) if (!SCHOOL_LOOKS[s]) problems.push(`school "${s}" has no look`);
    for (const s of SCHOOL_IDS) if (!opts.schoolIds.includes(s)) problems.push(`look "${s}" is not a real school`);
  }
  for (const v of VARIANTS){
    if (!(v.strength >= 0 && v.strength <= 1)) problems.push(`variant "${v.id}": strength must be 0..1`);
    // See the note above VARIANTS: below this the hue stops short of the school's own colour and
    // every school reads as a shade of the base texture instead of as itself.
    if (v.strength < 0.75) problems.push(`variant "${v.id}": strength ${v.strength} is too low for the school hue to actually land`);
  }
  if (!VARIANTS.some(v => v.id === "standard")) problems.push("no default variant");
  if (!AURAS.some(a => a.id === "none")) problems.push("the aura must be optional");
  return problems;
}
