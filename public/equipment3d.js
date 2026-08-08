// equipment3d.js — showing equipped gear on the 3D character (BACKLOG §2).
//
// PURE (no THREE, no DOM), like charcreate.js / dorm.js, so tools/test.mjs can validate every
// attachment headlessly. `world.js` and `preview3d.js` consume a resolved attachment list; they
// never decide which model goes on which bone.
//
// WHAT IS AND IS NOT POSSIBLE HERE, and why — the same wall charcreate.js ran into:
// `player_wizard.glb` is ONE skinned mesh with ONE material. There is no hat submesh, no robe
// submesh, no boot submesh, so `hat`, `robe` and `boots` CANNOT be shown as gear — there is
// nothing to swap and nothing to hide underneath a replacement. Those three are listed in
// UNSUPPORTED with their reason rather than silently omitted, so the next person does not spend
// an afternoon rediscovering it.
//
// What IS possible is anything that hangs off a BONE, because the auto-rig
// (tools/rig-character.py) produced a real skeleton with usable names:
//   Head, Neck, Spine, Spine1, Hips, Left/RightShoulder, Left/RightArm,
//   Left/RightForeArm, Left/RightHand, Left/RightUpLeg, Left/RightLeg, Left/RightFoot
// So the wand goes in the right hand and the amulet hangs at the neck. Two of five slots is not
// everything, but it is the honest maximum for this mesh, and both are the slots a player
// actually looks at.
//
// The models are CC0 KayKit, already in the repo — no new asset bytes.

/** Slots that cannot be shown, and the reason. Surfaced in the UI so it is not a silent no-op. */
export const UNSUPPORTED = {
  hat:   "the character is a single mesh — there is no hat to swap or hide",
  robe:  "the character is a single mesh — the robe is painted into its texture",
  boots: "the character is a single mesh — the boots are painted into its texture",
};

/**
 * How each showable slot attaches.
 *
 * `pos`/`rot` are in the BONE's local space. Bone axes on a generated rig are arbitrary — they are
 * whatever the auto-rigger produced — so these numbers were arrived at by rendering and looking,
 * not derived. Treat them as measurements, and re-measure if the player model is ever replaced.
 *
 * `height` is the target size in metres, fitted the same way world.js fits any other model.
 */
export const ATTACHMENTS = {
  wand: {
    bone: "RightHand",
    // Tier picks the silhouette: a novice holds a stubby wand, an archmage carries a staff. This
    // is the cheapest possible "my gear is visibly better" signal and it costs no new assets.
    byTier: [
      { maxTier: 2, model: "wpn_wand_A.glb",  height: 0.85 },
      { maxTier: 4, model: "wpn_staff_A.glb", height: 1.9  },
      { maxTier: 9, model: "wpn_staff_B.glb", height: 2.1  },
    ],
    // MEASURED, not derived. The rig's hand bone has its local +Y pointing DOWN in world terms,
    // so an unrotated staff hangs upside-down through the floor and a Z-rotation lays it
    // horizontally across the body. A half-turn about X puts it vertical with the crystal up.
    // Both wrong versions were visible on screen before this one; if the player model is ever
    // replaced, re-measure rather than assuming these carry over.
    pos: [0.0, 0.08, 0.0],
    rot: [Math.PI, 0, 0],
    tintByMetal: true,
  },
  amulet: {
    bone: "Neck",
    byTier: [{ maxTier: 9, model: null, height: 0.16 }],   // procedural: a small glowing bead
    pos: [0, 0.06, 0.14],
    rot: [0, 0, 0],
    tintByMetal: true,
    glow: true,
  },
};
export const SHOWABLE_SLOTS = Object.keys(ATTACHMENTS);

// Metal colours, matched to items.js METALS. Duplicated deliberately rather than imported: this
// module must stay free of engine imports to stay headless-testable, and `validateAttachments`
// asserts the two lists agree, which is the same guard sync-cards.mjs applies to the card catalog.
export const METAL_COLORS = {
  bronze:  0xcd7f32,
  iron:    0xc8c8c8,
  gold:    0xffd766,
  mithril: 0x5aa2ff,
  rune:    0xb58cff,
};

function modelForTier(spec, tier){
  for (const step of spec.byTier) if (tier <= step.maxTier) return step;
  return spec.byTier[spec.byTier.length - 1];
}

/**
 * What should currently be hanging off the player, derived from `save.loadout` and
 * `save.equipment` every time it is read.
 *
 * Nothing about the visual is stored: unequip a wand and it vanishes, upgrade from iron to rune
 * and the model and colour change on their own. Same derived-state rule as everything else here.
 */
export function attachmentsFor(save){
  const out = [];
  const loadout = (save && save.loadout) || {};
  const owned = (save && save.equipment) || [];
  for (const slot of SHOWABLE_SLOTS){
    const uid = loadout[slot];
    if (!uid) continue;
    const item = owned.find(e => e.uid === uid);
    if (!item) continue;                       // equipped something that was since sold
    const spec = ATTACHMENTS[slot];
    const step = modelForTier(spec, item.tier || 1);
    out.push({
      slot,
      bone: spec.bone,
      model: step.model,                        // null => world.js builds a procedural stand-in
      height: step.height,
      pos: spec.pos.slice(),
      rot: spec.rot.slice(),
      glow: !!spec.glow,
      color: spec.tintByMetal ? (METAL_COLORS[item.metal] || 0xc8c8c8) : null,
      label: item.id,
    });
  }
  return out;
}

/** Human-readable summary for the equipment screen: what is visible and what cannot be. */
export function visibilityNote(slot){
  if (UNSUPPORTED[slot]) return UNSUPPORTED[slot];
  return ATTACHMENTS[slot] ? null : "not shown on the character";
}

/** Problems with the attachment table. Same contract as the other validators: a list. */
export function validateAttachments(opts = {}){
  const problems = [];
  for (const [slot, spec] of Object.entries(ATTACHMENTS)){
    if (!spec.bone) problems.push(`${slot}: no bone`);
    if (opts.bones && !opts.bones.includes(spec.bone))
      problems.push(`${slot}: bone "${spec.bone}" is not in the player rig`);
    if (!spec.byTier.length) problems.push(`${slot}: no model for any tier`);
    let last = -1;
    for (const step of spec.byTier){
      if (step.maxTier <= last) problems.push(`${slot}: tier steps are not ascending`);
      last = step.maxTier;
      if (!(step.height > 0)) problems.push(`${slot}: a tier step has no height`);
      if (step.model && opts.knownModels && !opts.knownModels.includes(step.model))
        problems.push(`${slot}: model "${step.model}" does not exist`);
    }
    // Every tier 1..5 must resolve to something, or a player with rune gear sees nothing.
    for (let t = 1; t <= 5; t++) if (!modelForTier(spec, t)) problems.push(`${slot}: tier ${t} resolves to nothing`);
    if (UNSUPPORTED[slot]) problems.push(`${slot} is listed both as showable and as unsupported`);
  }
  if (opts.slotIds){
    for (const s of Object.keys(ATTACHMENTS)) if (!opts.slotIds.includes(s))
      problems.push(`"${s}" is not a real equipment slot`);
    for (const s of Object.keys(UNSUPPORTED)) if (!opts.slotIds.includes(s))
      problems.push(`unsupported slot "${s}" is not a real equipment slot`);
    // Every slot must be accounted for one way or the other — that is what stops a future slot
    // from silently doing nothing on the character with nobody noticing.
    for (const s of opts.slotIds) if (!ATTACHMENTS[s] && !UNSUPPORTED[s])
      problems.push(`slot "${s}" is neither shown nor explained`);
  }
  if (opts.metalIds){
    for (const m of opts.metalIds) if (METAL_COLORS[m] == null) problems.push(`metal "${m}" has no colour`);
    for (const m of Object.keys(METAL_COLORS)) if (!opts.metalIds.includes(m)) problems.push(`"${m}" is not a real metal`);
  }
  return problems;
}
