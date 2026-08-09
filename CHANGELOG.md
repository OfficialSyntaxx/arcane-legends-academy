# Changelog — Arcane Legends Academy

All notable changes, newest first. Grouped by the phase of work rather than by version, because
this project ships continuously to one branch rather than cutting releases.

**Test counts** are quoted per entry so a regression in coverage is as visible as a regression in
behaviour. The four suites are: `npm test` (engine + online-rules + UI smoke),
`npm run test:browser` (real Chromium: responsive layout, input gestures, world flows), and
`npm run check:models` (every shipped GLB loads *and* renders on a GPU).

> Companion docs: **`CLAUDEREADME.md`** (architecture, why things are the way they are),
> **`BACKLOG.md`** (what is done and what is next), **`WORLDSPEC.md`** (world architecture),
> **`BLENDERTODO.md`** (modelling briefs for everything still procedural).

---

## Collection & Academy depth — 2026-08-08 → 09

### The Codex, and this changelog — *pending*
- **`codex.js`**: the whole catalog browsable — six filters (All / Owned / **Missing** / Favourites
  / Special / Graded), a school filter, a search over names and card text, five sorts, per-school
  completion bars and **nine collection achievements**.
- The collection grid could never answer *"what am I missing?"* — you cannot filter a list of owned
  cards for the ones you do not own. The Codex filters the **catalog** instead, and shows unowned
  cards as greyed silhouettes.
- Achievements are **derived**: sell the cards and the achievement un-earns itself. Favourites are
  the one stored bit, because they are a choice.
- `validateCodex` proves every achievement is reachable against a synthetic best-possible
  collection — and caught a bug in **its own probe** first (every card prismatic ⇒ no foils ⇒ the
  foil achievement read as unreachable).
- **`CHANGELOG.md`** added, backfilled from the full git history.
- *377 engine / 34 online / 120 browser.*

### Card printings, first editions — `2f34f26`
- **`variants.js`**: Foil ✨ ×2.2, Holographic 🌈 ×4.5, Prismatic 💠 ×12, plus a First Edition ①
  ×1.6 stamp on the first copy of each type you obtain. Closes the "foil" third of design pillar 3,
  which had never been built — grade was previously the only axis of collection value.
- Rolled **rarest-first**; per-source `luck` (packs ×2, scribing ×1.25, shop purchases ×1).
- Rare printings get a coloured border, a diagonal sheen and a badge, and sort to the top of the
  collection.
- **`mintCard()`** consolidates five hand-written copies of the card-instance literal into the one
  place a card can enter the collection.
- Migration grandfathers one first edition per card type already owned, once, behind a flag.
- *360 engine / 34 online / 113 browser.*

### Two browser-suite intermittents closed — `c08fccc`
- **Camera orbit** (real): the camera could end a frame grazing the tower's collision circle by
  <15 cm. Both existing clamps solve *along the ray* from player to camera, the weakest geometry
  for a near-tangent pass. `updateCamera` now finishes with `resolveCollisions`, pushing out
  perpendicular to the surface. **Not reproducible in isolation** (0 bad of 192 with *and* without
  the fix) — it closes the invariant directly rather than being verified against a repro.
- **Bolt VFX** (bad threshold, not a bug): one shared 1.15× brightness ratio across five archetypes
  with wildly different footprints. Bolt scores 1.30×, the others 4–5.5×. Now a modest ratio *and*
  an absolute pixel delta, with margins printed under `VERBOSE`.

### Academy class content — `d36bd0e`
- **`lessons.js`**: 21 classes, three per curriculum year, each with a brief, an assignment, and a
  **named technique**. A *year* is passive and flat; a *class* is chosen and teaches something.
- Four techniques hooked into systems that already ship: **Appraisal** (cheaper grading),
  **Penmanship** (better scribe rolls), **Husbandry** (a chance of a second gather), **Haggling**
  (better card sales).
- Assignments read counters the save already keeps, rather than consuming materials —
  `zonequests.js` already does gather-and-hand-in.
- *343 engine / 34 online / 109 browser.*

### Visible equipment on the 3D character — `8a48da0`
- **`equipment3d.js`**: the equipped wand and amulet hang off the rig's real `RightHand`/`Neck`
  bones, inheriting the animation. Tier picks the silhouette, metal picks the colour, using CC0
  KayKit weapons already in the repo.
- `hat`/`robe`/`boots` **cannot** be shown (single-mesh character) and say so, rather than silently
  doing nothing.
- Bone axes on a generated rig are arbitrary: the staff's orientation and the bone-scale division
  were **measured by rendering**, not derived.
- `browser-test.mjs` binds to **port 0** — a fixed port made two overlapping runs die on
  `EADDRINUSE`, which reads exactly like a test failure.
- *326 engine / 34 online / 102 browser.*

### Character creation, per-school appearance, and `BLENDERTODO.md` — `a1a94da`
- **`charcreate.js` / `preview3d.js`**: a three-step creation screen (name → school → look) with a
  live rotating 3D preview.
- **`tint.js`**: the per-school look is a **fragment-shader hue rotation**, because
  `player_wizard.glb` is one mesh whose material Base Color is white — `material.color` can only
  darken, never re-hue. The old 45% colour lerp is why all seven schools looked the same washed
  purple.
- `strength` must stay ≥ 0.75: from a purple base, a 70% rotation toward Fire's 16° *stops at
  magenta*.
- **`BLENDERTODO.md`** (new): a complete modelling brief for every asset still drawn as a
  procedural primitive — dorm furniture, trophies, fountain, lamps, spires, the fishing-spot node,
  a gateway arch, a modular dungeon kit, the duel arena's pillars and banners. Each with
  dimensions, hex colours, triangle budget, origin placement and the exact table row to edit.
- *316 engine / 34 online / 95 browser.*

---

## World completion — 2026-08-08

### WORLDSPEC step 6: the content pass — `fab83d3`
- **Lake Arcanum** (third outdoor zone, 29% water coverage, shoreline fishing) and **the Drowned
  Vault** (second dungeon, 5 rooms, the Drowned Archon). The world now chains academy → forest →
  Cinderhollow → lake → vault.
- Five more field quests, gated behind killing the Cinder Wyrm. **All six WORLDSPEC steps complete.**
- **`nearWater`** on a resource node: `scatterZone` knew what to avoid but not what to be *near* —
  the first pass put all fourteen fishing spots up to 40 m inland on hilltops.
- **`baseHeight` above `waterLevel`**: flattening pins the spawn and NPCs to `baseHeight`, so a lake
  rising past it opens the zone underwater and `validateZone` says nothing.
- Per-dungeon palettes so the second dungeon is not the first reskinned.
- *297 engine / 34 online / 86 browser.*

### The Dorm phases D1–D4 — `e942cfc`
- The Student Dorms stopped being a menu. **`dorm.js`** compiles a real interior *zone* by reusing
  `dungeons.js` — a dorm is a one-room dungeon with no enemies, so zone transitions, saved position
  and camera collision came for free.
- Furniture placement into typed anchor slots (D2); **display cases and boss trophies** (D3);
  room size and slot count derived from the existing upgrade levels (D4).
- The interior seam in `structures.js` is generic, so the Scribing Hall and Smithy can follow.
- **Interiors are not all caves**: the room first inherited the dungeon light rig and rendered as a
  black box. Zones now declare `lightScale`/`lightTint`; `world.renderOnce()` exists so a test can
  read pixels.
- Naming unified to "Dorm" everywhere user-facing; `docs/plan.md` marked historical.
- *280 engine / 34 online / 75 browser.*

---

## Systems & content — 2026-08-05

| Change | Commit |
|---|---|
| Duel Arena landmark replaced with a user-provided Tripo model (decorative collision only) | `208aa7a` |
| Academy curriculum years + NPC reputation (`academy.js`, `reputation.js`) | `93fbb28` |
| Field quests for the Whispering Forest (`zonequests.js`) | `5c473cf` |
| The duel arena rebuilt to look like an arena; duel layout fixed | `b024de4` |
| Spell VFX: six procedural archetypes driven by each card's own effects (`vfx.js`) | `8f6b1e1` |
| Onboarding: a guided first session (`onboarding.js`) | `d8aa9e0` |
| Dungeon enemies actually die and stay dead | `8e3efa2` |
| The hero gets a standing pose — the rig was fine, the bind pose was not | `78a8d30` |
| Painted terrain: height bands, rock on slopes, shorelines, mottling | `d51b271` |
| WORLDSPEC step 5: dungeon instancing; four silently broken GLBs found and fixed | `3e4667f` |
| The new wizard rigged; characters scaled to read at world scale | `8ac7228` |
| WORLDSPEC step 4: zone transitions, solid water, camera fix | `cec0c62` |
| Every character was rendering as the procedural stand-in — CDN failure with no retry | `24d0f1a` |

---

## World architecture — 2026-08-04

| Change | Commit |
|---|---|
| WORLDSPEC step 3: chunk streaming | `5fa3ed1` |
| Camera collision fixed; two browser tests that were passing for the wrong reason | `319d6f6` |
| `BACKLOG.md` added; every gap in WORLDSPEC steps 1–2 closed | `a15a5fb` |
| WORLDSPEC steps 1–2: zone config data model and procedural terrain | `c0baec3` |
| `WORLDSPEC.md` added: zone architecture, chunk rules, terrain spec, dungeon flow | `2441fd2` |
| CDN routing for large models — `public/` dropped 37 MB → 6.5 MB | `6d288a7` |
| 3D duel arena (`battle3d.js`); KayKit weapons + Quaternius monsters imported | `aff3177` |
| CC0 KayKit Medieval Hexagon buildings replace the procedural academy structures | `06316f9` |
| `ASSETS.md` added: curated free-asset backlog and the import pipeline | `f870a43` |

---

## Conventions this project follows

Recorded here because every entry above depends on them.

- **Derive, don't store.** What the player *chose* is saved; what follows from it is recomputed on
  every read. The one deliberate exception is a card's printing and grade seed — dice rolls at mint
  time with nothing to re-derive them from, and the module says so.
- **Pure modules.** Anything spatial or rule-shaped lives in a module with no THREE and no DOM, so
  `tools/test.mjs` can validate it headlessly. `world.js` renders what it is handed; it decides
  nothing.
- **Placement is data.** Buildings, props, nodes and zones live in tables, never in `world.js`.
- **Look at the render.** Several bugs here — a black dorm, a magenta Fire wizard, a horizontal
  staff — were invisible to every passing test. A Playwright screenshot of a WebGL canvas comes
  back blank; use `renderOnce()` and read pixels.
- **A failing test gets diagnosed, not re-run.** Where a flake could not be reproduced, the entry
  above says so plainly rather than claiming a fix was verified.
