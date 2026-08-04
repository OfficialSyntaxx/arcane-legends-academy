# Higgsfield asset budget — Arcane Legends

Rates are **confirmed from the account's own transaction history**, not estimates:

| Model | Confirmed cost | Notes |
|---|---|---|
| Nano Banana Pro (image) | **2.0 cr** | reference image, best quality |
| Nano Banana 2 (image) | **1.5 cr** | fast/cheap, supports free-trial unlimited |
| Meshy **Image to 3D** | **38 cr** | the 2D→3D pipeline that produced every current character |
| Meshy 6 **Text to 3D** | **25 cr** | cheaper, but produced "generic blob" results (§9.2) |
| Vision Analyze | ~0.03 cr | negligible |

So a **2D→3D asset = 2 + 38 = 40 credits**. Text-to-3D = 25 but the quality was rejected once already.

**Balance at time of writing: 458.22 credits** (Plus plan).

---

## What the world still needs

Prices assume the 2D→3D route at 40 cr each, since that is the pipeline that produced acceptable
characters. Where a text-to-3D result would plausibly be good enough (simple, symmetrical props),
the cheaper option is noted.

### Tier 1 — the buildings players walk up to (highest visual payoff)

| Asset | Route | Cost | Why |
|---|---|---|---|
| Scribing Hall | 2D→3D | 40 | station, always on screen |
| Smithy & Forge | 2D→3D | 40 | station |
| Library | 2D→3D | 40 | station + librarian |
| Merchant Stall | 2D→3D | 40 | station |
| Student Dorms | 2D→3D | 40 | station, at spawn |
| **Subtotal** | | **200 cr** | |

### Tier 2 — the landmarks

| Asset | Route | Cost | Why |
|---|---|---|---|
| Central Tower | 2D→3D | 40 | the campus silhouette; 40m tall after the rescale |
| Duel Arena | 2D→3D | 40 | 25m across, the PvP hub |
| Fountain | text→3D | 25 | simple, symmetrical — good text-to-3D candidate |
| **Subtotal** | | **105 cr** | |

### Tier 3 — props (each one is reused many times across the map)

| Asset | Route | Cost | Instances |
|---|---|---|---|
| Tree (one model, reused) | text→3D | 25 | 18 in the ring |
| Ore node / crystal | text→3D | 25 | 7 nodes, recoloured per ore |
| Tree stump (woodcutting) | text→3D | 25 | 3 nodes |
| Street lamp | text→3D | 25 | 8 |
| Torch | text→3D | 25 | 1 per node |
| **Subtotal** | | **125 cr** | |

### Totals

| Scope | Cost | Leaves |
|---|---|---|
| Tier 1 only | 200 cr | 258 |
| Tier 1 + 2 | 305 cr | 153 |
| Tier 1 + 2 + 3 | **430 cr** | **28** |
| Everything + a 20% reroll allowance | ~516 cr | **short by ~58 cr** |

**Recommendation:** Tier 1 + 2 (**305 cr**) leaves ~153 credits of headroom for rerolls, which
matters — the project's own notes record that text-to-3D produced unusable results once already,
so budgeting zero rerolls is optimistic. Props (Tier 3) are the least visible per credit: they are
small, distant, and the current procedural versions read fine at the new scale.

---

## Before spending anything

1. **Generate one building first** (~40 cr) and drop it in. The rescale changed every footprint,
   and we should confirm a generated mesh sits correctly at 15×11×10.5 before buying four more.
2. **Author to the footprints in `public/structures.js`.** Each building has explicit `w`, `d`, `h`
   and `ry`. A model that doesn't match its footprint will either float or clip its collision box.
3. **Budget the reroll.** Image-to-3D is 38 cr whether or not you like the result.

## After generating

Run `npm run compress` on anything new. Draco + WebP took the current character set from
**22MB → 3.4MB**; textures-only compression only reached 17MB, so the geometry is the bulk and
Draco is doing the real work. Buildings will be geometry-heavy, so this matters more for them,
not less.
