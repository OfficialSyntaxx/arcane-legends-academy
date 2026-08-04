# Open design questions — answers and recommendations

*August 2026. These are the questions raised during the asset-integration phase. Nothing here is
implemented yet; this document exists so the decisions are recorded before credits are spent.*

Costs are quoted at **Tripo Pro rates (~$0.40/model)** — see `docs/ASSET-BUDGET.md` for why the
project should move off Higgsfield for 3D.

---

## 1. Buildings: can players go inside, or only interact from outside?

### How it works today

Exterior-only. The player walks within ~5.5m of a building's door, a prompt appears, and tapping
it opens either a 2D overlay (Scribing, Forge) or an NPC dialogue. The building is a solid
collision box — there is no interior.

### Options

| | Approach | Asset cost | Trade-off |
|---|---|---|---|
| **A** | Keep exterior-only | 0 | Fast, mobile-friendly, zero load time. But the buildings are scenery — the Scribing Hall's lit windows and workbench imply an interior the player never sees. |
| **B** | Portal into a real interior scene | ~$0.40/interior + significant code | Full immersion. Walk through the door → fade → a small interior scene with the workbench/forge as 3D objects. Needs an interior model per building, an exit affordance, and scene load/unload. |
| **C** | "Diorama" fake interior | 0 assets, moderate code | The camera pushes through the doorway into a small procedural room lit warmly, with the overlay UI on top. Reads as *inside* without a second model or a real scene swap. |

### Important constraint

The generated models are **exterior meshes only**. Walking inside one shows the backfaces of the
walls. Option B genuinely requires a separate interior model per building — it is not a
code-only change.

### Recommendation

**A now, C when there is time, B only for the Scribing Hall and Smithy.**

Those two are where players spend real time (the crafting loops). The Library, Market and Dorms
are one-tap-and-leave screens, so interiors there would be cost with almost no payoff.

---

## 2. The Duel Arena: how do duels actually happen? (the Wizard101 question)

> *"In Wizard101 the cards thrown on the playing field chosen by the players come to life and
> interact with the enemies and field."*

### How it works today

Talking to Referee Kael hides the 3D world entirely and opens a 2D DOM duel screen (hand row,
board rows, HP bars). The arena is a landmark you walk to; nothing happens *on* it. The generated
arena's open circular floor is exactly the right stage and is currently unused.

### The expensive trap

A unique 3D model per creature card is **~30 creature cards**. At Higgsfield rates that is 1,200
credits — not viable. Even at Tripo rates (~$12) it is a lot of generation and rework for cards
the player sees briefly.

### The phased plan

**Phase 1 — stage the duel in 3D. Cost: $0.**
Keep the 2D card hand at the bottom (it is readable and mobile-friendly — Wizard101 does this
too). Instead of hiding the world, move the camera onto the arena, place both wizards facing each
other on the platform, and resolve every action with procedural VFX: spell beams, impact flashes,
heal glows, shield domes, floating damage numbers. All code and particles, no assets.
**This alone delivers most of the feeling.**

**Phase 2 — summons as card-golems. Cost: $0.**
Playing a creature flies the card from hand to field, where it *becomes* a stylized floating
card-construct: the card art, scaled up, hovering, with a school-coloured aura. It lunges to
attack. This is a deliberate aesthetic choice rather than a compromise — it keeps the *collectible
card* fantasy visible on the battlefield, which is the game's actual pillar (#3, "collectible
satisfaction"), and it costs nothing.

**Phase 3 — archetype creature models. Cost: ~$2.80 (7 models).**
One creature per school — a Fire beast, an Ice golem, a Storm elemental, etc. — tinted and scaled
per card. A Fire Cat and a Fire Dragon share a model at different scales. Not per-card fidelity,
but it is the difference between 7 models and 30.

### Recommendation

**Do Phase 1 + 2 first.** They cost nothing and will show whether a 3D duel actually feels better
than the current clean 2D screen *before* any credits are committed.

⚠️ **Caveat worth weighing:** the current 2D duel screen is genuinely good on mobile — everything
readable, one tap per action, 44px targets enforced by the browser test suite. A 3D duel is more
spectacle but risks smaller targets and a busier screen on a phone. Build the 3D staging as a
**layer the 2D UI sits on top of**, not a replacement, so the two can be compared.

---

## 3. Camera collision (known bug, unfixed)

The follow camera has no collision. Standing near a large building and rotating puts the camera
**inside** the geometry — the arena canopy interior, a building's backfaces. This was survivable
when everything was small procedural boxes; with 22–40m generated models it is easy to trigger and
was hit repeatedly while photographing the arena.

**Fix:** raycast from the player to the desired camera position each frame and pull the camera in
to the first hit. Contained change in `updateCamera()` in `world.js`. **Cost: $0.**

Recommended **before** the next batch of building models, since every new large model makes it
easier to hit.

---

## 4. Character creation screen + per-school outfits

### The free version (recommended first step) — cost: $0

`world.js` already has `applyPlayerColor()`, which tints the loaded player GLB with the school
colour. That hook can be expanded into a full per-school appearance system **with no new models**:

- Per-school robe/hat palette — 7 distinct colour schemes on the same mesh
- School-coloured staff orb, aura glow and particle trail
- A proper character-creation screen: rotating 3D preview, the existing school questionnaire, and
  live switching between schools

This gives seven visually distinct wizards and a real creation screen. It does **not** give
different *garments* per school.

### The paid version — cost: ~$2.80 (7 robes)

Generate one robe per school and swap the mesh. Only worth doing if the tinting version proves
insufficient after it is built and looked at.

### The free-asset version — cost: $0, but a style decision

Quaternius **"Modular Character Outfits: Fantasy"** (CC0) is 12 outfits built from 62 modular
parts, designed to snap onto their Universal Base Characters — structurally exactly this feature.

The blocker is art direction: Quaternius is flat-shaded low-poly, the current characters are
painterly and textured. Adopting it means replacing **all** characters for consistency, not just
the player. That is a real option (free forever, pre-animated, modular, and it frees all credits
for landmarks) but it is a deliberate change of look, not a drop-in.

### Recommendation

**Build the free tinting version first.** It is code-only, it may be enough, and it is a
prerequisite for the creation screen either way. Decide on garments after seeing it running.

---

## 5. Priority order

| # | Work | Cost | Why first |
|---|---|---|---|
| 1 | Camera collision fix | $0 | Gets worse with every new large model |
| 2 | Character creation screen + school tinting | $0 | May remove the need for 7 generated robes |
| 3 | Duel Phase 1 + 2 (3D staging, card-golems) | $0 | Proves the concept before any creature spend |
| 4 | Four remaining buildings | ~$1.60 | Biggest remaining visual gap in the campus |
| 5 | Props via CC0 (Kenney/Quaternius) | $0 | Style matters least here; procedural versions are weakest |
| 6 | Duel Phase 3 (7 school creatures) | ~$2.80 | Only if Phase 1+2 proves it is wanted |

**Everything above totals roughly $5 of Tripo credits**, and items 1–3 and 5 are free.
