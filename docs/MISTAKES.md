# Mistakes log

> A running record of mistakes made on this project — by the developer, by AI assistants, and by
> the original asset/code sources — with the lesson extracted from each.
>
> **Purpose:** these are *pointers*, not confession. The value is in catching the same class of
> error faster next time, especially across the Unity migration where several of these are just as
> easy to repeat. Add to this file whenever something goes wrong and the cause is understood.
>
> **Format:** what happened → why it happened → the rule that would have prevented it.

---

## Category A — trusting reasoning over measurement

### A1. Animation clips selected by array index
**What:** `battle3d.js` played `gltf.animations[0]` as a creature's looping battle idle. glTF
stores clips in authoring order, not semantic order, and in the Quaternius packs clip 0 is
`Death`. **19 creatures looped their own death animation in every duel.** `world.js` had the same
bug in a different shape — "first clip that isn't walk/run" — which resolved to
`1H_Melee_Attack_Chop` for the two richest rigs, so mage NPCs and skeleton enemies stood there
looping a melee swing.

**Why:** index 0 *looked* like a reasonable default and nothing ever checked what it actually
resolved to. It shipped and survived a long time because nobody compared intent against reality.

**Rule:** never select an asset sub-resource by index. Select by name/role, and print what
resolved so it can be eyeballed. Applies directly in Unity — Animator clip assignment across
mismatched packs is still manual.

### A2. Assuming a synthetic test reproduced the real condition
**What:** wrote a test for an async chunk-load race (a chunk unloading before its model finishes
loading), teleported rapidly with 60 ms gaps, saw no leak, and nearly concluded "no bug."

**Why:** a local server with tiny cached assets resolves a "load" in well under 60 ms, so the race
window never opened. The test passed because it never actually tested the thing.

**Rule:** when testing a race or timing bug, **prove the dangerous interleaving actually occurs**
before trusting a pass. Here the fix was throttling every `.glb` response by 250 ms so loads were
genuinely in flight. A green test that cannot fail is worse than no test.

### A3. Using an unrepresentative metric
**What:** tried to profile frame time to judge scene cost, and got 1–3 FPS across every scene.

**Why:** the sandbox renders with SwiftShader (software, no GPU). Wall-clock frame time there says
nothing about real hardware, and reporting it would have been actively misleading.

**Rule:** check whether the measurement environment can produce a meaningful number *before*
drawing conclusions from it. The fix was pivoting to hardware-independent counts — draw calls,
triangles, resident textures, active lights.

### A5. Drafting a port from assumption instead of reading the source (AI mistake)
**What:** the first draft of the C# duel engine was written after skimming `logic.js` rather than
reading it closely. It was wrong in six ways at once: wizard HP was 30 (really **100**), opening
hand 4 (really **5**), it handled only `creature` and `spell` while the game has **four** card
types (`field` ×3 and `trap` ×2 would have been silently played as spells), it omitted **fatigue**
(deck-out damage) entirely, it never applied the **elemental ring +1** on attack despite having
the lookup right there, and it modelled retaliation as thorns-only when defenders actually hit
back with their full attack.

**Why:** the draft was built from a mental model of "how a card game works" plus a skim, rather
than from the file that defines the rules. Every individual assumption was *plausible*, which is
exactly what made them survive review.

**How it surfaced:** not by inspection — by generating the card data and noticing the export
summary contradicted itself (30 creatures by subtraction vs. 25 by filtering). Chasing that
discrepancy revealed the `field`/`trap` types, which prompted a proper read of `logic.js`.

**Rule:** when porting, read the source of truth line by line before writing, not after. And treat
a self-contradicting number as a thread worth pulling — the summary line was "just cosmetic" and
it was hiding a real modelling error.

### A6. Re-implementing a matcher instead of exporting its output (AI mistake)
**What:** the same C# draft hand-transcribed `creatures.js`'s `traitForCard()` keyword matcher —
in the very same commit that argued hand-transcription is how silent bugs get in. It was wrong in
at least four places: `skeleton` needs a word-boundary check as well as a loose match, `orc`+`skull`
resolves to a *different* trait, `demon`+blue/frost/ice must be tested **before** plain demon, and
`mage`/`elf`/`pixie`/`novice` falls through to **`ninja`**, not `wizard`.

**Why:** the card *data* was correctly identified as too risky to retype, but the *logic that maps
cards to traits* was not held to the same standard, even though its failure mode is worse — a
mis-resolved trait gives a creature the wrong passive, which reads as a balance quirk rather than
a bug, so it might never be noticed at all.

**Rule:** if the output of a function is a fixed mapping, **export the mapping, don't port the
function.** Applied: the exporter now runs the real `traitForCard()` and emits card→trait as data,
and the C# looks it up. The whole error class is gone rather than tested around.

### A4. Claiming a bug without verifying it (AI mistake)
**What:** flagged that `npm run compress` had "unnecessarily re-touched 37 creature files" as a
bug, and wrote it into a commit message as a suspected issue.

**Why:** it was inferred from behaviour without checking the files. On investigation,
`creature_Alien.glb` as committed *before* the session had raw PNG textures and had genuinely
never been compressed — the tool was working correctly. Only the *other* half of the report (a
stale `extensionsUsed` flag causing a false "already compressed") was real.

**Rule:** verify before reporting, especially when writing it into a permanent record. Two
suspicious-looking symptoms are not necessarily one bug. The correction was made in the eventual
fix commit rather than left standing.

---

## Category B — applying a technique without checking it fits

### B1. Batch-repainting a colour-swatch atlas
**What:** the painted-texture technique that worked on the pilot asset was about to be applied
across the whole asset library. Tested it on `hex_home_A.glb` first — and it **destroyed** the
building's colour coding, collapsing roof/walls/trim/chimney to one flat tone.

**Why:** KayKit-style assets use **one material** and differentiate parts purely by which cell of
a small colour-swatch atlas each face's UVs sample. Generating a fresh texture has no knowledge of
that layout. (`kaykit_rock.glb`'s atlas literally reads *"space reserved for future nature pack
additions… or you can add your own colours"*.)

**Why it wasn't a disaster:** it was tested on one asset before the batch. The fix was an overlay
mode that paints *on top of* the existing texture with relative blend modes, preserving whatever
colour each pixel already had.

**Rule:** understand an asset's material scheme before batch-editing it. Test the technique on one
representative file and *look at the result* before running it across 78.

### B2. Applying the same technique to assets that didn't need it
**What:** ran the repaint on the three standalone landmark buildings (`arena`, `scribe`, `tower`)
to "finish the art pass." The result was **worse** — the arena's distinct near-black obsidian
pillars washed out toward the surrounding stone, and the brush strokes read as scratch damage.

**Why:** unlike the flat KayKit props, those three are already-detailed Tripo-generated models with
real baked colour variation. The treatment designed to *add* detail to flat surfaces *removed*
contrast from detailed ones.

**Rule:** "finish the pass" is not a reason to apply a transformation to assets it was not designed
for. All three were reverted (byte-identical) rather than shipped. Completeness is not a goal that
justifies a regression.

---

## Category C — language and platform footguns

### C1. Temporal dead zone from calling code above its declarations
**What:** wiring furniture models into the dorm added a `loadLandmarkModel()` call earlier in
`createWorld()` than the `const loadState` / `let dracoLoader` those functions closed over. Result:
`ReferenceError: Cannot access 'loadState' before initialization` — which `createWorld`'s
`try/catch` swallowed, so the zone transition just silently didn't happen.

**Why:** `const`/`let` are hoisted but not initialised. Unlike `undefined` from a `var`, touching
them early *throws*. A broad `try/catch` turned a loud crash into a silent no-op.

**Rule:** when adding a call site above existing code, check what it closes over. And be suspicious
of broad `try/catch` around initialisation — it converts crashes into invisible failures.

### C2. GPU resources are not garbage collected
**What:** `world.dispose()` only called `renderer.dispose()`. It never disposed the outgoing
scene's geometries, materials or textures. Measured: **JS heap grew 74 MB → 633 MB over 20 zone
changes**, unbounded — every zone visit permanently leaked its entire scene.

**Why:** three.js does not free GPU buffers when a JS object becomes unreachable; `.dispose()` must
be called explicitly. Browsers also hand back the *same* WebGL context for the same canvas, so
nothing was ever implicitly reclaimed.

**Rule:** in manual-lifetime graphics APIs, "unreferenced" ≠ "freed". *(Largely moot in Unity —
the asset lifecycle handles this — but the general lesson about explicit resource ownership isn't.)*

### C3. Stale document-level flags
**What:** `compress-models.mjs` decided a model was already compressed by checking
`extensionsUsed.includes("EXT_texture_webp")` — a **document-level declaration**. After a tool
replaced every image with raw PNG, that flag stayed, so genuinely-uncompressed 270 KB textures were
reported "already compressed, skipped."

**Why:** the flag described the file's history, not its current contents.

**Rule:** check the actual thing (each image's own `mimeType`), not a summary flag that can drift
from reality.

---

## Category D — process

### D1. Guessing camera framing instead of computing it
**What:** repeatedly took screenshots that missed the subject — too far, too close, subject
off-frame — burning several cycles guessing distances for models of wildly different scales (a
0.9 m fishing stand vs. a 40 m tower).

**Why:** hardcoded camera positions for models whose bounding boxes differ by ~40×.

**Rule:** frame from the model's actual bounding box. One `Box3` and a radius-based camera position
replaced all the guessing.

### D2. Breadth without a defined goal
**What:** the project reached 43 modules, ~10,500 lines and 686 tests — genuinely broad, genuinely
well-tested — while the answer to *"why would someone play this?"* remained undefined.

**Why:** each individual system was a reasonable thing to build. No single step was wrong; the
aggregate drifted because nothing forced the question.

**Rule:** the highest-leverage question is the one no amount of engineering answers. Revisit it
deliberately and early — an engine migration does not resolve it either. Carried into
`docs/UNITY-MIGRATION.md` §7 specifically so it doesn't evaporate in the transition.

---

## How to add an entry

Keep it honest and specific. A useful entry names the *actual* symptom, the *real* cause (not the
first plausible one), and a rule general enough to catch the next instance but concrete enough to
act on. If a mistake was caught before shipping, say so — near-misses are the most instructive
entries because they show the check that worked.
