# Asset budget & platform strategy — Arcane Legends

*Last revised August 2026. Supersedes the Higgsfield-only version of this document.*

---

## 1. What is already generated (done, in-game, compressed)

| Asset | Route | Status |
|---|---|---|
| Player wizard + 9 NPCs (professor, merchant, referee, trainer, librarian, 4 students) | Higgsfield 2D→3D | ✅ in-game |
| Central Tower (40m) | Tripo 2D→3D | ✅ in-game |
| Scribing Hall (11.1 × 10.7 × 10.5m) | Tripo 2D→3D | ✅ in-game |
| Duel Arena (25m across) | Tripo 2D→3D | ✅ in-game |
| School art, card art, backgrounds, pack art | Higgsfield image | ✅ in-game |
| PWA icons | generated locally (headless Chromium) | ✅ free |

*(Corrected Aug 2026: the Library, Smithy, Merchant Stall and Student Dorms are **no longer
procedural** — they use CC0 KayKit hex models, see `ASSETS.md`.)*

Still procedural primitives: the **fountain**, street lamps, crystal spires, the fishing-spot node
(the only node kind with no model at all), every piece of **dorm furniture**, boss trophies, the
**dungeon wall/floor kit**, the in-duel arena, and zone gateways. Each of these has a full
modelling brief in **`BLENDERTODO.md`**.

---

## 2. Platform costs — measured, not estimated

Higgsfield rates below are **confirmed from the account's own transaction history**. Tripo and
Meshy rates are from their published pricing (August 2026).

| Platform | Plan | Credits | Credits per textured model | **Effective $/model** |
|---|---|---|---|---|
| **Higgsfield** | $50 | 1,000 | 40 (2 image + 38 conversion) | **$2.00** |
| **Tripo** | Pro $19.90/mo | 3,000 | ~45–75 (25 mesh + 20–50 texture) | **$0.30–0.50** |
| **Meshy** | Pro $20/mo | 1,000 | 20 (mesh + texture) | **$0.40** |

**Higgsfield is 4–6× more expensive per 3D asset than either 3D specialist.** That is not a flaw
in Higgsfield — it is a general media platform priced for video generation, and this project is
paying video rates for meshes. Its image models (Nano Banana, ~1.5–2 cr) remain good value and are
what produced the card/school art.

### Free tiers and the licensing trap

- **Tripo free (300 cr/mo):** models are **CC BY 4.0, non-commercial**. Not safe for a commercial
  release. Paid tiers grant full commercial rights.
- **Meshy free (100 cr/mo ≈ 5 models):** verify the current licence text before shipping anything
  from it — free tiers on these platforms commonly restrict commercial use.
- **Higgsfield free:** 10 credits/day, no rollover. A single image-to-3D is 38 credits, so the free
  tier cannot complete even one 3D generation.

> **Rule for this project: never ship a model generated on a free tier.** The cost of a paid month
> is trivial next to the cost of re-doing the art later or a licensing dispute.

### Higgsfield community/marketplace models

There is no free-3D-asset path there. Higgsfield's community marketplace hosts **apps** (image and
video generation workflows), not shareable 3D meshes.

**Recommendation: move 3D generation to Tripo Pro ($19.90/mo).** It is the platform that produced
the tower, hall and arena already in the build, and it is ~5× cheaper per asset.

---

## 3. Free CC0 asset sources (no credits, commercial-safe)

| Source | Licence | Notes |
|---|---|---|
| [Kenney](https://kenney.nl) | **CC0** | Tens of thousands of game-ready assets, consistent styles, no attribution needed |
| [Quaternius](https://quaternius.com) | **CC0** | Stylized low-poly packs + a universal animation library |
| [Poly Haven](https://polyhaven.com) | **CC0** | HDRIs, textures, models |
| [Poly Pizza](https://poly.pizza) | mostly **CC-BY** | 10,600+ models incl. the archived Google Poly set — *attribution required* on most |

**Quaternius "Modular Character Outfits: Fantasy"** is worth singling out: 12 outfits built from
**62 modular parts**, CC0, designed to snap onto their Universal Base Characters. That is
structurally the school-outfit system this project wants, for free.

**The catch is art direction, not licensing.** Quaternius is flat-shaded low-poly; the generated
characters are painterly and textured. Mixing them looks inconsistent. It is an either/or:

- **Keep generated characters** → school outfits come from tinting (free, see §4) or generation.
- **Switch characters wholesale to Quaternius** → free forever, modular, pre-animated, internally
  consistent, and credits are then reserved entirely for landmarks, where generation is doing its
  best work.

---

## 4. Remaining work, costed at Tripo Pro rates

Assuming ~$0.40/model (mid-range of the Tripo Pro band).

### Tier 1 — the four remaining buildings

| Asset | Footprint (from `structures.js`) | Cost |
|---|---|---|
| Smithy & Forge | 15 × 11 × 9 | $0.40 |
| Library | 13 × 11 × 9 | $0.40 |
| Merchant Stall | 13 × 9 × 7 | $0.40 |
| Student Dorms | 15 × 11 × 9 | $0.40 |
| **Subtotal** | | **~$1.60** |

### Tier 2 — props (each reused many times)

Fountain, tree, ore crystal, stump, street lamp, torch — 6 models, **~$2.40**.
Lowest visual payoff per unit: they are small, mostly distant, and the procedural versions read
acceptably at the current scale. Also the best candidates for **free CC0 substitutes**.

### Tier 3 — school outfits (7) and duel creatures (7 school archetypes)

14 models, **~$5.60** — versus **560 Higgsfield credits (~$28)** for the same work.
This is the clearest illustration of why the platform switch matters.

**Everything above: roughly $10 of Tripo credits, inside a single $19.90 month.**

---

## 5. Rules when generating

1. **Author to the footprint.** Every building in `public/structures.js` has explicit `w`/`d`/`h`
   and `ry`. A model that does not match will float or clip its collision box. A building with a
   `model` field has its `w`/`d` set from the model's *real* footprint at its target height.
2. **Texture quality: 2048px, PBR on.** The pipeline keeps source resolution now. Do **not** drop
   the generator's texture setting to save time — that detail cannot be recovered later.
3. **Polycount: ~20–30k triangles.** Do not use the generator's maximum (2M); it does not match the
   art style and bloats the file for no visible gain.
4. **Run `npm run compress` on anything new.** Draco + WebP@92. Two traps the script now avoids:
   `gltf-transform optimize` runs `simplify` by **default** (decimates geometry), and the `webp`
   pass **decodes Draco without re-applying it** — so textures must run first, Draco last.
5. **Budget the reroll.** The conversion charge applies whether or not the result is usable.

---

## 6. Recommendation

1. **Cancel Higgsfield; subscribe to Tripo Pro ($19.90/mo).** ~5× more asset per dollar, and it is
   already the source of the best models in the build.
2. **Build the free school-appearance system first** (§4 of `docs/DESIGN-DECISIONS.md`) — it costs
   nothing and may remove the need for 7 generated robes entirely.
3. **Use CC0 (Kenney/Quaternius/Poly Haven) for props**, where style-matching matters least and
   the current procedural versions are weakest.
4. **Spend generation credits on the four remaining buildings**, which is where the campus still
   visibly falls short of the three already replaced.
