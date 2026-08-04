# CLAUDE README — Arcane Legends: Wizard TCG

**This file is the complete onboarding document for Claude Code (or any AI collaborator) working on this project through the GitHub repo.** Read it fully before touching any code. It explains the vision, the architecture, every system, the conventions, and how to build/deploy/test.

---

## 1. The Project in One Paragraph

**Arcane Legends** is a browser-based, mobile-first open-world collectible card game that blends **Wizard101** (magical academy, school identity, duels) with **OSRS** (gathering, skilling, crafting, economy, progression). You explore a **3D academy campus**, gather and refine resources, **scribe spell cards**, grade them into collectible **slabs**, build decks, and duel AI rivals or real players online. The core loop is:

> **gather → refine → scribe → grade → slab → deckbuild → duel → progress**

It is **NOT an idle/menu simulator.** All skilling, crafting, and activities happen **interactively in the 3D world** — you walk to a node to gather, enter a hall to craft, talk to an NPC to start a quest or duel. The 2D systems (collection, deckbuilder, market) are overlays that open on top of the world.

**Live URL:** https://magic-woodland-396.higgsfield.gg/
**Deploy game_id:** `128d122c-a09a-4312-b89f-31224452ba25`
**GitHub repo:** https://github.com/OfficialSyntaxx/arcane-legends-academy (user `OfficialSyntaxx`)

---

## 2. The Design Vision (non-negotiable)

The player should feel like **a rising master wizard at a magical academy**, building a legendary card collection and a thriving magic guild, constantly rewarded with new cards, gold, gear, and dueling decisions that visibly matter.

Design pillars (from the source design doc, "The Arcanum Academy"):
1. **One-minute-to-fun** — a clear next action within seconds of loading.
2. **Meaningful idle-adjacent progression** — skills/resources progress even in short sessions.
3. **Collectible satisfaction** — every card has real value; grade, foil, and slab serials make each card feel tangible.
4. **Seamless social fantasy** — a living academy with AI students, professors, merchants, and real players.
5. **Readable mobile-first gameplay** — clean, touch-friendly, one primary action per screen.

**Hard rules for any new feature:** it must improve at least one of — progression, collection value, social life in the hub, duel depth, mobile usability, or long-term retention. Otherwise cut it.

---

## 3. Architecture & Tech Stack

- **Client:** Vanilla JavaScript (ES modules) + **Three.js r128** (vendored UMD build) for the 3D world, with a DOM-based UI for the 2D overlays. PWA-installable (manifest + mobile meta tags).
- **3D model loading:** `GLTFLoader.js` (r128 addon, vendored) for generated `.glb` character models.
- **Online duels:** a **server-authoritative turn-based rules module** (`logic.js`) passed to the game platform as `code`. It runs in a sandbox (no imports, no timers, pure functions) and is the referee for 2-player online matches.
- **Persistence:** `localStorage` for all client-side meta progression (collection, skills, gold, deck, quests, home, market). Not authoritative — just the player's local save.
- **Hosting:** the game platform's `deploy_game` tool (NOT a website builder). It serves the `public/` folder as-is and runs `logic.js` for online rooms.

### File layout
```
wizard-tcg/                 (the repo root)
├── CLAUDEREADME.md         ← this file
├── README.md               public-facing overview
├── logic.js                online-duel rules module (server-authoritative)
├── package.json            (type: module, for the node test runner)
├── public/                 the game client (deployed as-is)
│   ├── index.html          the game page (all UI + boot)
│   ├── cards.js            card catalog + grading + elemental matrix
│   ├── items.js            skills, materials, equipment, recipes, home upgrades
│   ├── game.js             engine: skills, economy, market, auctions, housing, duels, AI
│   ├── world.js            the 3D academy world (Three.js scene, movement, camera, NPCs, GLB loading)
│   ├── strings.js          ALL player-visible text (external on purpose)
│   ├── manifest.json       PWA manifest
│   ├── vendor/             pinned libs (three.min.js, GLTFLoader.js)
│   └── assets/             generated art + GLB character models (models/)
├── tools/                  headless test suites
│   ├── test.mjs            engine tests (35 checks)
│   ├── logic-test.mjs      online-rules tests (14 checks)
│   └── ui-smoke.mjs        UI boot smoke test (stubs DOM/THREE)
└── design/                 design docs (plan, thresholds, asset manifest)
```

---

## 4. The 3D World

The world is a walkable academy campus built in Three.js (procedural low-poly + generated GLB characters). Key facts:

- **Camera:** auto-follow, **drag-to-rotate** (orbit), **pinch-to-zoom**, camera-relative movement. Touch joystick on the left, drag on the right, tap-to-move.
- **Movement:** WASD/arrow keys (bound to `event.code`), touch joystick, gamepad thumbstick, tap-to-move.
- **Stations** (each opens an in-world overlay or dialogue):
  - Scribing Hall → Scribing overlay (refine + scribe cards)
  - Smithy → Forge overlay (smelt, forge equipment, brew)
  - Library / Professor → quests
  - Merchant / Merchant Vell → market
  - Duel Arena / Referee → PvP
  - Duel Trainer → practice duel
  - Student Dorms → home
  - Librarian → daily challenge
- **Gathering nodes:** ore crystals (copper/iron/gold/silver/mithril/runite), wood stumps (oak/willow), ponds (shrimp/salmon/lobster). Plus **CC0 KayKit forest trees/rocks** (imported via `tools/import-asset.mjs`) as additional woodcutting and mining nodes — see §4.1.
- **NPCs:** Professor, Merchant, Referee, Trainer, Librarian, and wandering students — all with dialogue.
- **Character models:** generated via Meshy 2D→3D (`.glb`). All 10 characters render at ~1.8 units; walk is added procedurally (see §9).

### 4.1 Importing free 3D assets (itch.io / CraftPix / KayKit…)

We can reuse free low-poly assets even though most ship as `.fbx`. Pipeline: **everything ends up as a resized `.glb`** before it enters the game. One command does it all:

```bash
node tools/import-asset.mjs <url|path> [--name out.glb] [--out public/assets/models] [--resize 512] [--target-height 6]
```

It will: download (if a URL) → convert FBX/GLTF→GLB → resize textures to 512px → **print raw height + scale-to-target + texture status** (flags blank 1px textures).

**Import checklist (do these before wiring a model into `world.js`):**
1. **License first.** Prefer CC0 / "free for commercial use" packs (KayKit, Kenney, etc.). If the pack requires attribution, note it in the README. Do NOT ship unmodified copies as-is.
2. **Format.** `.fbx` and `.gltf`/`.glb` are supported by the script. `.obj` is not — use the pack's gltf/fbx version or convert in Blender first.
3. **Run the script** and check the output:
   - `textures: N` — if it prints `⚠ BLANK (1px)` or `0 textures`, the pack is untextured (renders flat white). Skip it or retexture.
   - `raw height` / `scale to Nu` — free assets use arbitrary units. Set `model.scale` to the printed scale (or pass `--target-height` to match world units: characters ~1.8, trees/rocks ~3–6, buildings ~6–8).
4. **Wire it into `world.js`:** characters via `makeCharModel(key, url, group)` (auto-detects skinned vs static, scales to target); props/buildings via `new THREE.GLTFLoader().load(url, gltf => { resize + scene.add })` or a small loader helper.
5. **Keep the deploy under ~50MB.** The script resizes textures to 512px; if the folder still grows too big, run `gltf-transform resize` at 256px or drop the lowest-use models.
6. **Verify in-game** (walk to it, confirm scale + that it looks right), then commit + push.

**Tools:** `@gltf-transform/core` + `@gltf-transform/functions` (read/resize/write GLB), `fbx2gltf` (binary FBX→GLB). Installed as npm dependencies (see `package.json`).

**In use:** `kaykit_tree.glb` + `kaykit_rock.glb` (in `public/assets/models/`) are from the **KayKit Forest Nature Pack** by Kay Lousberg — **CC0** (free for commercial use, no attribution required; details in the pack's `License.txt`). Wired in via `loadProp()` in `world.js` as woodcutting + mining nodes.

## 5. The Card Systems (core gameplay)

### 5.1 Schools & elemental identity
- **7 schools:** Fire, Ice, Storm, Myth, Life, Death, Balance.
- **Character creation:** a questionnaire (3 questions) that suggests a school, or a manual pick. Player can change their school anytime (home screen).
- **School affinity:** creatures of your school gain **+1 attack** in duels.
- **Elemental damage matrix** (non-transitive ring, +1 damage when you counter): Fire > Ice > Storm > Myth > Life > Death > Fire. Balance is neutral.
- Each school grants its own **starter cards** when picked.

### 5.2 Card types
- **Creature** — cost/atk/hp; keywords: haste, taunt, drain, multiAttack, heal-on-play, buff-all. Mutual combat (attacker and defender trade damage).
- **Spell** — targeted damage, AoE, heal, shield, buff-all, draw, freeze.
- **FIELD** — persistent effect on the board (e.g., +1 attack to all your creatures, heal per turn, +1 pip per turn).
- **TRAP** — played face-down; triggers when the enemy plays a creature (damage) or attacks (shield). Hidden from the opponent in `viewFor`.

### 5.3 Duel rules
- Wizard HP 100 (raised by equipment). **5-card opening hand**, draw 1/turn. **20-card deck**, max 3 copies per card.
- **Pips (mana):** start at 1, +1 per turn (capped 10). Hearthstone-style refresh each turn.
- **30-second turn timer** (local duels).
- Win by reducing the opponent's HP to 0. **Fatigue** if a deck empties (escalating damage).

### 5.4 Scribing (card creation)
- Refine raw materials into **canvas** (from wood), **ink** (from fish), **reagent** (from ore) via the Scribing skill.
- Spend 1 canvas + 1 ink + 1 reagent to **scribe a random card**. Higher Scribing skill raises the grade roll.

### 5.5 Grading & slabs
- Cards have a hidden roll (0–100). **Grade 1–10** bands. Grades **9–10 (Mint / Gem Mint) become slabs** with a unique serial number and a foil treatment.
- **Regrade:** re-roll a graded card's grade for a higher fee (risk/reward — it can go up or down).
- Card value = rarity base × grade multiplier.

### 5.6 Deck building
- Loadout screen: equip 5 gear slots + build a 20-card deck (max 3 copies). School cards encouraged by the affinity bonus.

---

## 6. The RPG / Progression Layer

### 6.1 Skills (OSRS-style, levels 1–99)
- **Mining, Fishing, Woodcutting** — gather from world nodes (level-gated tiers).
- **Smithing** — smelt ore → bars, forge equipment from bars.
- **Alchemy** — brew healing potions from fish.
- **Scribing** — refine card materials + scribe cards.

### 6.2 Equipment & loadout
- 5 slots: **Wand, Hat, Robe, Boots, Amulet**. Metal tiers Bronze → Rune. Stats: +Atk, +Def, +MaxHP, +Pip, +Gold. Equipment enhances duels (these apply locally, not in online fair duels).

### 6.3 Home & guild
- Buy a guild hall, upgrade rooms (Treasury +gold, Library +card drops, Armory +gear stats, Tavern +skill XP) with gold + timber.

### 6.4 Economy
- **Gold sources:** quest wins, PvP wins, selling cards/items, auction sales, gathering.
- **Gold sinks:** booster packs, bazaar, grading/regrade fees, housing, smithing/alchemy.
- **Market:** Bazaar (NPC buy/sell, grade-aware) + Auction House (NPC-driven bids).

### 6.5 Quests & PvP
- **8 quest bosses** (Rookie Battle Mage → The Archon) with a tuned difficulty curve.
- **Local PvP:** dueling AI wizards (and a practice duel with the Trainer).
- **Online PvP:** real players via `logic.js` — create a room, share the invite link (two tabs = two players).

### 6.6 Retention
- **Daily quests** (win duels / gather materials / scribe cards) with a gold + card reward.
- **Academy rank** (Novice → Apprentice → … → Archmage) based on level + collection value + duels won.

---

## 7. Conventions & Rules (follow these)

1. **All player-visible strings live in `public/strings.js`** (or the data files `cards.js`/`items.js`). Zero UI string literals in game code.
2. **Keyboard bindings use physical `event.code`** (`KeyW`, `Space`), never typed letters — they break on non-Latin layouts.
3. **All asset/module references are RELATIVE paths** (the game is served under a subpath). Never root-absolute.
4. **The STYLE_FORMULA** (approved storybook fantasy) is embedded in every generated asset prompt. Keep the look consistent.
5. **Third-party libs are vendored** into `public/vendor/` (pinned). No CDN hotlinks.
6. **`logic.js` must stay pure** — no imports, no timers, six exports (`meta`, `setup`, `validateAction`, `applyAction`, `isGameOver`, `viewFor`). It mirrors the card catalog from `cards.js` (keep them in sync).
7. **Hidden info is masked server-side** in `viewFor` (opponent hand, deck, traps) — never in the client.
8. **Mobile-first** — touch controls, big targets, responsive layout. Everything must work touch-only.
9. **Deterministic duel logic** — fixed timestep, seeded RNG where it matters.

---

## 8. How to Run, Test, Deploy

### Run locally
```bash
cd public && python3 -m http.server 8080   # then open http://localhost:8080
```
(ES modules need a server, not `file://`.)

### Test
```bash
node tools/test.mjs          # 35 engine checks
node tools/logic-test.mjs    # 14 online-rules checks
node tools/ui-smoke.mjs      # UI boot smoke test
```

### Deploy (the game platform)
Use the `deploy_game` tool:
- `code` = `logic.js` (the online rules module)
- `assets_dir` = `public/` (contains `index.html` + everything)
- `meta` = `{title, description, thumbnail, favicon}` (thumbnail/favicon are stable https CDN URLs from generated images)
- **Re-deploying an update:** pass the SAME `game_id` (`128d122c-a09a-4312-b89f-31224452ba25`) with the full content again. The URL stays the same.
- A deploy can 404 for ~60s before propagation.

### Git / GitHub
- The repo is `https://github.com/OfficialSyntaxx/arcane-legends-academy`.
- The user's fine-grained PAT is used for push (the account is `OfficialSyntaxx`). When pushing via the terminal, temporarily set the remote URL to include the PAT as the username, then scrub it back to the clean URL. **Never commit the token.**
- Keep the local git repo (at `wizard-tcg/`) synced: commit + push after each feature change.

---

## 9. Current State & Known Issues

**Working:** 3D world, camera, movement, in-world gathering/crafting, NPC dialogue, school system + elemental matrix, field/trap cards, grading/slabs + regrade, daily quests, academy rank, market/auctions, home/guild, all 8 quests, local AI PvP, online PvP, PWA manifest, all tests green.

**Known issues / next steps:**
1. **All character models are now generated 3D models.** The player wizard, professor, merchant, referee, trainer, librarian, and 4 wandering students are all 2D→3D generated GLBs (except the professor, which is a static text-to-3D mesh). They load at ~1.8 units and render correctly. The fix in `makeCharModel` (`world.js`): for **skinned Meshy GLBs** the object box is degenerate (0) and the raw mesh box is only the *bind pose* — the real size is the **skeleton node span** (bones sit far above the mesh), so height is computed from node world positions. For **static meshes** (e.g. professor.glb has no skeleton), the real size is the **geometry box**. The loader auto-detects skinned vs static. NPC GLB keys match their roles (`duel`, `trainer`, `librarian`, `wander0`–`wander3`) so the update loop uses the GLB mixer. **All models were texture-resized to 512px** (gltf-transform) to keep the deploy under the ~50MB upload limit — the models folder is now ~22MB total.
2. **The 2D→3D pipeline** (generate a 2D character portrait → image-to-3D, ~40 credits/model: ~2 for the image + ~38 for the conversion) produces a much better, recognizable character than text-to-3D (~25 credits, generic blob). All character GLBs were generated this way.
3. **GLB files are compressed to 512px textures** (gltf-transform resize) — down from 4–9MB to ~2–3MB each for mobile. True Draco compression is still a future mobile optimization.
4. **Procedural walk animation.** The Meshy GLBs only carry ONE animation clip each (idle). Rather than regenerate (which would cost credits and drop the idle), `makeCharModel` collects the skeleton bones (standard biped names: LeftLeg, RightLeg, LeftArm, RightArm, Spine…) and `world.js` applies a procedural walk cycle (bones swing via quaternion on top of the base pose) whenever a wanderer NPC is moving; it falls back to the idle clip when stationary. The stationary NPCs (referee, trainer, librarian) keep their idle. Same technique can add swing/attack/emote poses to any GLB character without extra generation.
5. **Buildings, nodes, and props are still procedural** primitives — these are next to generate as 3D models.
6. **Sound** is not yet implemented (procedural WebAudio SFX only in a few places).
7. **Models/animations** need rigging verification once quality models are in.

## 10. Roadmap (in priority order)

1. **Fix the GLB character integration** — get the 2D→3D player wizard rendering correctly (scale + position + walk/idle animations), then load the professor/merchant GLBs and generate the remaining NPCs.
2. **Character model quality** — finish the full roster via 2D→3D (player + 6 named NPCs).
3. **Buildings & world assets** — generate 3D models for the Scribing Hall, Smithy, Library, Merchant, Duel Arena, Dorms, tower, trees, nodes, fountain.
4. **Mobile optimization** — Draco-compress GLBs, lower poly counts, verify on a phone viewport.
5. **Sound** — music, SFX, and animated rigs.
6. **More depth** — expand to 9 schools (Water/Earth/Air/etc.), a sideboard, houses/factions, seasonal events, more elemental spells.

---

*This document is the source of truth for AI collaborators. If you change architecture or add a system, keep this file updated.*