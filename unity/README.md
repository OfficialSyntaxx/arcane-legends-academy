# Unity port — work in progress

Drafted ahead of Unity being installed, so there is real work waiting when the project is set up.
Read `docs/UNITY-MIGRATION.md` first for the full plan; this file covers only what is here now.

## ⚠️ Verification status — read this before trusting any of it

**None of this C# has been compiled or run.** There is no Unity, no .NET SDK and no Mono in the
environment it was written in, so it could not be built, executed or tested.

That is a real and unusual downgrade from how the rest of this repository was built. Every earlier
claim in this project ("242/242 passing", "the leak is fixed", "19 creatures were looping death
animations") was *measured*. Nothing here is. Treat this code as **a careful draft**, not as
working software — expect compile errors, and expect at least some behavioural bugs.

The fastest way to find them is in §"First session at the desk" below.

## What is here

```
unity/
  Assets/
    Scripts/
      Data/
        GameData.cs         data model + lookups + Validate()
        GameDataLoader.cs   JSON loading, fails loudly on bad data
      Duel/
        DuelState.cs        DuelSide, CreatureInstance, DuelStateData
        DuelEngine.cs       the rules: play, attack, effects, ultimates, traits
    StreamingAssets/
      gamedata.json         GENERATED — everything, single load
      cards.json / schools.json / creatures.json / schoolmagic.json
```

**The JSON is generated, never hand-edited.** Regenerate with:

```bash
node tools/export-unity-data.mjs
cp unity-data/*.json unity/Assets/StreamingAssets/
```

Hand-transcribing 47 cards into C# would introduce errors no compiler catches — a wrong `atk`
reads as a balance decision, not a bug. Generating from the modules the web build actually runs
makes the data faithful by construction.

## Design decisions worth knowing

- **No `UnityEngine` dependency in `Data/` or `Duel/`.** The rules are plain C# so they can be
  unit-tested without opening the Editor. This mirrors the web build, where pure modules were
  headlessly testable (644 checks) and only rendering needed a browser. It is also what makes the
  existing JS test suite portable as a specification.
- **Code and data over Editor GUI.** Development is mostly remote (phone chat) with occasional
  desk time, and the Editor cannot run on mobile. Anything that must be drag-and-drop wired can
  only happen at the desk, so the project favours generated content and scripted setup. See
  `docs/UNITY-MIGRATION.md` §1.
- **`Card` vs `CreatureInstance` are separate types.** A Card is the immutable printed definition;
  a CreatureInstance is one copy in play with its own hp/atk/state. Conflating them caused real
  bugs in the web build (buffing one copy buffed every copy).
- **Derived, not stored.** `EffectiveAtk()` computes rage/warband bonuses from live board state
  rather than caching them, so the value can never disagree with the board.
- **Injected RNG.** `DuelEngine(data, rand)` takes a random source so duels are reproducible in
  tests — an unseeded `Random` makes a failing test unrepeatable.

## First session at the desk

1. **Create the project:** Unity LTS, **3D (URP)** template — URP, not HDRP; URP is the
   mobile-appropriate pipeline.
2. **Add Newtonsoft.Json** via Package Manager (`com.unity.nuget.newtonsoft-json`). Unity's built-in
   `JsonUtility` does not handle these nested generic lists and fails *silently* with empty
   collections — a bad failure mode. Then wire `GameDataLoader.Parse(json, JsonConvert.DeserializeObject<GameData>)`.
3. **Copy `Assets/` in** and let it compile. **Expect errors** — fix or report them.
4. **Smoke test the data before the rules:** load `gamedata.json` and confirm
   `Validate()` returns empty and `cards.Count == 47`. If the data is wrong, every rule test
   downstream is meaningless.
5. **Then port tests, not features.** `tools/test.mjs` (644 checks) and
   `tools/creature-rule-test.mjs` (36 checks) are the specification. Port a rule's tests, watch
   them fail, make them pass. Do not move to rendering until the duel rules are green.

Report compile errors and failures back and they can be fixed remotely — that loop is the
intended workflow.

## Corrections already made to this draft

Recorded because they show what *else* may still be wrong. The first draft was written from a skim
of `logic.js` rather than a close read, and was wrong in six ways at once — all found and fixed,
but the same cause could easily have produced more:

- Wizard HP was 30; it is **100**.
- Opening hand was 4; it is **5**.
- Only `creature` and `spell` were handled. There are **four** types — `field` (×3) and `trap`
  (×2) would have been silently played as spells.
- **Fatigue** (escalating damage once the deck empties) was missing entirely.
- The **elemental ring +1** on attack was never applied, despite the lookup existing.
- Retaliation was modelled as thorns-only; defenders actually hit back with their **full attack**.

Also: `TraitKeyFor()` originally re-implemented `creatures.js`'s keyword matcher in C# and got
several cases wrong. It has been **deleted** — the exporter now runs the real `traitForCard()` and
emits card→trait as data, so C# looks the answer up instead of deriving it. See
`docs/MISTAKES.md` A5/A6.

## Known gaps in this draft

- **Nothing here is compiled or tested.** See the verification warning above.
- Status effects and behaviour that live in `game.js` rather than `logic.js` (freeze-on-hit,
  multi-phase boss behaviour, archetype AI) are **not ported yet**.
- No deck construction, no PvP, no progression, no rendering. Duel rules only.
- 6 creature cards (minotaur, hydra, basilisk, unicorn, satyr, arcane_guardian) map to no trait.
  That is **correct** — they match no keyword in the source matcher either, so they are plain
  stat-lines by design. Noted so it is not "fixed" later by mistake.
- Evade-spent and survive-used are tracked in `HashSet`s on the engine rather than as fields on
  `CreatureInstance`, to keep the serialised creature shape a faithful mirror of `logic.js`. That
  means those flags do **not** survive serialising a duel mid-game. Fine for a local duel; needs
  revisiting if duels are ever saved or sent over a wire.
