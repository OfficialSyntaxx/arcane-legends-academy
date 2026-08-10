# Arcane Legends Academy

A browser-based, mobile-first 3D academy game — **Wizard101's card-and-school fantasy meets
OSRS's walk-up-and-gather open world.** Explore a streaming 3D campus and its surrounding zones,
mine/fish/chop your own materials by hand, scribe them into spell cards, grade those cards into
graded slabs, build a deck, and duel AI opponents or real players online.

**Play it live:** https://magic-woodland-396.higgsfield.gg/

---

## What's actually in the game

- **A real 3D open world**, not a menu wearing a 3D skin — the academy hub streams outward into
  Whispering Forest, Lake Arcanum, and the Ashen Mountains, each with its own NPCs, field quests,
  gatherable resources, and an instanced dungeon (Cinderhollow Caverns, the Drowned Vault, Ashen
  Caverns) with a boss and persistent kill/room progress.
- **Seven schools** (Fire, Ice, Storm, Myth, Life, Death, Balance) with an elemental affinity ring,
  per-school starter decks, ultimates, and a tinted 3D character.
- **A full crafting economy**: mine/fish/chop raw materials in the world (real regen cooldowns, a
  rare chance at a valuable "Pristine" find), smelt bars, forge equipment, brew potions, refine
  materials into card components, and scribe new spell cards — with grading (a card's roll decides
  its grade, and the best become serialized slabs) and printings (foil/holo/prismatic, first
  editions) giving the same card real collectible variance.
- **A creature-keyword combat system** — taunt, drain, poison, thorns, evade, survive, spell
  immunity, warband, rage, and more, layered on top of a card-and-pip duel engine shared between
  local AI matches and real online PvP (ranked, seasonal).
- **Progression that actually does something**: an academy curriculum with real perks, a 21-class
  technique system that changes how gathering/scribing/grading/selling behave, achievements that
  unlock equippable titles, a customizable dorm (furniture, display cases, trophies), and NPC
  reputation.
- **Everything derived, nothing faked** — collection value, achievement progress, and completion
  stats are computed from the save on every read rather than tracked separately, so they can never
  drift out of sync with what you actually own.

## Run it locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```

ES modules need a real server, not `file://`.

## Test it

```bash
npm test              # engine + online-rules + UI smoke + creature-rule suites (fast, headless)
npm run test:browser  # real Chromium: responsive layout, input gestures, world/dungeon/quest flows
npm run check:models  # loads and renders every shipped 3D model
```

`npm test` gates every push; CI runs it on every commit.

## Tech

Vanilla JS (ES modules), [three.js](https://threejs.org/) for the 3D world and duel arena, no
build step, no framework. Deterministic, seedable duel logic that runs identically in local AI
matches and on the online multiplayer server. Assets are CC0/procedural where possible; the rest
are compressed GLBs served from a CDN.

## Project docs

This repo documents itself in depth — start here depending on what you're looking for:

| Doc | What it's for |
|---|---|
| [`CLAUDEREADME.md`](CLAUDEREADME.md) | Full architecture reference — every system, why it's built the way it is, and where the project currently stands |
| [`BACKLOG.md`](BACKLOG.md) | Feature backlog and status — what's done, what's in progress, what's next |
| [`WORLDSPEC.md`](WORLDSPEC.md) | The 3D world architecture: zones, terrain, chunk streaming, dungeon instancing |
| [`CHANGELOG.md`](CHANGELOG.md) | Reverse-chronological log of what shipped, with test counts per entry |
| [`ASSETS.md`](ASSETS.md) | The asset pipeline — CDN hosting, compression, rigging |
| [`BLENDERTODO.md`](BLENDERTODO.md) | Modelling briefs for everything still a procedural placeholder |
