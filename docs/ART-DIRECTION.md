# Art Direction — the Wizard101-anchored pivot

> Status: **planning document, not yet implemented.** Nothing in this file has been built. It
> exists to define the target before any asset work starts, and to be the thing a pilot asset
> gets checked against before the direction rolls out further.
>
> Companion documents this amends: `BLENDERTODO.md` (its Tier system and triangle budgets still
> apply; its §0.2 "Style" section and §0.3 "Materials" section are **superseded by this file** —
> see §5). `docs/ASSET-BUDGET.md` (cost/licensing still applies; its style assumptions are stale
> the same way).

## 1. Why this exists

The map/lighting diagnostic pass earlier (real GLB furniture, PBR materials, tiling textures,
scatter variety) improved individual pieces but hit a ceiling: the game's assets don't share a
style with each other. Right now, in one screen, a player can see:

- KayKit's flat-shaded, hard-edged, low-poly hex buildings,
- a creature pack that leans more detailed/painted,
- hand-coded THREE.js primitives with flat `MeshStandardMaterial` colors and a canvas-doodle
  tiling texture,
- and (as of this session's fishing-stand experiment) a Tripo generation with a baked
  photorealistic wood-grain texture.

None of those were ever asked to agree with each other. That mismatch — not any single asset's
quality — is the actual reason the game reads as "rough" even after real per-asset improvements.
Polishing pieces of a set that doesn't cohere has a ceiling. This document is the "agree with
each other" part.

## 2. The reference: Wizard101, not RuneScape NXT

Both were floated as targets. They are not the same kind of target, and picking the wrong one
means building toward something this project cannot reach.

- **RuneScape (NXT)** is a rendering-engine-level bar: normal maps, real-time water reflections,
  dynamic point-light shadows, physically-based shading, volumetrics, sRGB-correct texture
  pipelines. That is a professional studio's engine team, not an asset pass. It needs geometry
  and texture budgets this project's pipeline was never built for, and matching it would mean
  rewriting the renderer, not the assets.
- **Wizard101** is a *texture and color treatment* bar, not a geometry-density bar. Its whole
  identity is hand-painted, warm, saturated, storybook materials on comparatively simple
  sculpted forms — closer to an illustration than a photograph. That is achievable with a
  generated/hand-authored **texture** pipeline layered onto geometry budgets not far from what
  `BLENDERTODO.md` already uses. It does not require a new renderer.

**Target: Wizard101's painterly-stylized treatment, at KayKit-adjacent geometry complexity.**
Simple, chunky forms; the quality lives in color and texture, not polycount.

## 3. Core visual pillars

1. **Painted, not flat, and not photographic.** Every material gets a hand-painted-style texture
   (visible brushwork, soft color variation, warm highlights) instead of either a flat solid
   `MeshStandardMaterial` color (current procedural primitives) or a baked photo-realistic scan
   texture (the fishing-stand experiment). Both of those are wrong in the same way: neither looks
   *painted*.
2. **Saturated, warm, storybook palette.** Wizard101 leans warm-lit even in "cold" biomes —
   shadows read as cool purple-blue, lit surfaces read as warm gold/amber. The game's existing
   `ACES` tonemap + hemisphere/sun rig (kept from the lighting diagnostic pass) is compatible
   with this; the palette discipline is in the textures, not the lights.
3. **Chunky, simple silhouettes, still.** `BLENDERTODO.md`'s triangle budgets stay. Wizard101
   reads richly at low geometric complexity *because* the detail is painted on, not modeled in.
   This is the load-bearing reason the pivot is achievable at all without a bigger engine or
   budget — don't lose it by chasing higher poly counts instead of better textures.
4. **One family, everywhere.** A tree, a building, a piece of furniture and a gathering node all
   need to look like they were painted by the same hand. No mixing texture treatments within one
   scene, ever — that was the actual failure mode diagnosed in §1.

## 4. Concrete rules

### 4.1 Materials
- **Every visible surface gets a texture.** Flat `MeshStandardMaterial({color})` with no map is
  no longer an acceptable end state for anything the player looks at for more than a second —
  it was a placeholder, and this pivot is what replaces it.
- Texture size: **512px, occasionally 1024px** for a hero asset. Small on purpose — Wizard101's
  look does not need texel density, and small textures keep this a browser game.
  `import-asset.mjs`'s 2048px cap is a ceiling, not a target.
- One texture atlas per asset class where practical (matches `BLENDERTODO.md` §0.3's existing
  "one shared atlas" rule — that rule survives this pivot, only the *content* of the texture
  changes from "flat swatches" to "painted swatches").
- **No baked lighting or ambient occlusion in the texture** (this rule survives unchanged from
  `BLENDERTODO.md`). Painted color variation is fine and wanted; a baked shadow is not — it fights
  the game's own real-time lighting the same way it always did.
- Roughness/metalness stay non-metal, high-roughness by default (also unchanged) — Wizard101 has
  no PBR specular language at all; matte-painted reads correctly under this renderer's tonemap.

### 4.2 Palette
- Warm-lit surfaces: gold, amber, cream, warm brown.
- Shadow/cool surfaces: purple-blue, teal, deep violet — this project already has a violet-leaning
  UI palette (`champagne`/charcoal per `BACKLOG.md` §9's UI redesign note) and a purple-heavy
  world palette (`0x1a1440` clear color, `0x2a1a4a` fog); the pivot leans into that rather than
  fighting it.
- Saturation stays high relative to "realistic" — this is a storybook, not a simulation.

### 4.3 Geometry
- `BLENDERTODO.md`'s Tier budgets (≤300/1200/2000/400/15000 tris by class) are unchanged. Simple
  forms are a feature of this style, not a limitation being worked around.
- Silhouette rules from `BLENDERTODO.md` §0.2 (chunky, readable at 12–18m camera distance, no
  bevels under 2cm) are unchanged — they were already correct for this pivot, they just weren't
  paired with the right texture treatment.

### 4.4 Procedural geometry (world.js hand-built primitives)
- Where a real painted-texture asset does not exist yet, procedural primitives stay as the
  fallback (unchanged practice — `BLENDERTODO.md`'s whole premise). But their flat colors should
  eventually gain the same painted-canvas-texture treatment the tiling floors/walls got in the
  earlier lighting pass (`tileTexture()` in `world.js`) — a warm-toned, hand-painted-*looking*
  canvas bake is much closer to this pivot than a flat color, and costs the same zero asset bytes.
  Not scoped yet; noted here so it isn't lost.

## 5. What this supersedes in `BLENDERTODO.md`

- §0.2 "Colour comes from flat material colours or a small texture atlas — never per-object 2K
  maps": the "flat material colours" half is superseded — see §4.1 above. The "never 2K maps"
  half is *tightened*, not loosened (512–1024px, not "small atlas" left vague).
- §0.3 "Prefer one material per object, colour set on Base Color": superseded the same way —
  Base Color becomes a painted texture, not a flat swatch. Roughness/metalness defaults are kept.
- Everything else in `BLENDERTODO.md` (units, orientation, origin, triangle budgets, export
  settings, the import/compress/check pipeline) is unchanged and still authoritative.

## 6. Rollout plan — pilot before rewrite

Do **not** touch the whole game's assets at once on the strength of a planning document. Order:

1. **One pilot asset**, built to this guide exactly, shown before anything else changes. A good
   candidate: the fishing-stand model from this session, either re-textured (strip the baked
   photo texture, hand-paint a real texture in its place) or regenerated — since the geometry
   work already exists and only the material needs to change to test the theory in §2 (texture
   treatment > geometry density).
2. **Sign-off on the pilot** before a second asset is touched.
3. Only after sign-off: fold this into `BLENDERTODO.md`'s existing per-asset workflow so every
   future brief (Tier 1 dorm props, Tier 2 campus, etc.) is authored against this guide instead
   of the flat-color rule it's replacing.
4. Existing shipped assets (KayKit buildings, the creature pack, the CC0 furniture swapped in
   this session) are **not** in scope for an immediate redo — that is a large, separate
   commitment this document does not authorize on its own. Revisit once the pilot proves the
   direction is worth that cost.

## 7. Open questions for whoever picks this back up

- Hand-paint textures via image generation (prompt-driven, matching §4.2's palette) vs. a human
  painting them directly — either fits this guide; the guide doesn't mandate the tool.
- Whether the procedural-primitive canvas textures (§4.4) are worth doing before or after real
  modeled-asset texturing — they're free and fast, so plausibly first, but not decided here.
- No decision yet on whether existing KayKit/creature-pack assets get re-skinned later, replaced,
  or left as an acknowledged "legacy tier" — see §6.4.
