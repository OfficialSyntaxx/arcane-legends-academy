# Free Asset Plan (CC0 / free-for-commercial)

Reference list of free 3D asset packs we can pull into the game. **Verify each pack's license + file formats before importing** (KayKit is confirmed CC0; others marked "check").

> **ART DIRECTION (decided Aug 2026):** the everyday campus is **CC0 KayKit** — one consistent
> flat-shaded style, free. The two **hero landmarks** (Central Tower, Duel Arena) are the richer
> **generated Tripo** models. See `docs/DESIGN-DECISIONS.md`. Do not mix styles on ordinary
> buildings.
>
> **Placement is data, not code.** Buildings, landmarks, props and NPCs all live in
> `public/structures.js`; gathering-node models in `public/nodes.js`. `world.js` builds from those
> tables, and `npm test` fails if anything ends up sealed inside geometry or missing a file.
> Never place an asset by editing `world.js` directly.

> **Pipeline (always):** everything enters the game as a resized `.glb`.
> `node tools/import-asset.mjs <url|path> [--name x.glb] [--out public/assets/models] [--resize 512] [--target-height N]`
> → downloads → converts FBX/GLTF→GLB → caps textures at **2048px** → prints scale + texture status.
> Then run `npm run compress` (Draco + WebP@92). **The 512px default was dropped** — it was a 16x
> loss of texel density and the reason imported assets looked soft. Draco keeps the deploy small,
> texture downsizing is not needed for that. Prefer the pack's `.gltf`/`.glb` when available (native, no conversion); `.fbx` converts via FBX2glTF. Keep the deploy under ~50MB (512px textures).

---

## ✅ Already in use
*Characters:* all 10 NPC/player GLBs (Meshy 2D→3D) — see `CLAUDEREADME` §9.

| File | Source | License | Used as |
|---|---|---|---|
| `kaykit_tree.glb` | KayKit – Forest Nature Pack | CC0 | Woodcutting node (Chop Oak/Willow) |
| `kaykit_rock.glb` | KayKit – Forest Nature Pack | CC0 | Mining node (Mine Copper/Iron) |
| `hex_castle.glb` | KayKit – Medieval Hexagon | CC0 | **Library** (-31,12) — the Tripo tower holds (0,0) |
| `hex_blacksmith.glb` | KayKit – Medieval Hexagon | CC0 | Smithy & Forge (31,-14) |
| `hex_church.glb` | KayKit – Medieval Hexagon | CC0 | Scribing Hall (-31,-14) |
| `hex_market.glb` | KayKit – Medieval Hexagon | CC0 | Merchant Stall (31,12) |
| `hex_tavern.glb` | KayKit – Medieval Hexagon | CC0 | The Rested Quill (-16,26) |
| `hex_tower_A.glb` | KayKit – Medieval Hexagon | CC0 | *unused* — the Tripo tower is the hero landmark |
| `hex_home_A.glb` | KayKit – Medieval Hexagon | CC0 | Student Dorms (0,32) |
| `dng_doorway.glb` | KayKit – Dungeon Remastered | CC0 | Dungeon entrance (20,-20) |
| `dng_torch.glb` | KayKit – Dungeon Remastered | CC0 | Lit torch (20.5,-18.5) |
| `enemy_skeleton.glb` | KayKit – Character Pack Skeletons | CC0 | PvE skeleton mob (95 anims), idles at (20,-23) |
| `nat_CommonTree_1.glb` | Stylized Nature MegaKit (Quaternius) | CC0 | Decorative trees (22,10),(24,-6) |
| `nat_Mushroom_Common.glb` | Stylized Nature MegaKit (Quaternius) | CC0 | Decorative mushrooms |
| `nat_Flower_3_Single.glb` | Stylized Nature MegaKit (Quaternius) | CC0 | Decorative flower |
| `fur_book_set.glb` | KayKit – Furniture Bits | CC0 | Library bookshelf (-14,8) |
| `fur_armchair.glb` | KayKit – Furniture Bits | CC0 | Library armchair (-13.5,8.5) |
| `fur_lamp_standing.glb` | KayKit – Furniture Bits | CC0 | Standing lamp (-13,9) |
| `fur_bed_single_A.glb` | KayKit – Furniture Bits | CC0 | Dorms bed (1,17) |
| `fur_chair_A.glb` | KayKit – Furniture Bits | CC0 | Dorms chair (0.5,16.5) |
| `npc_mage.glb` | KayKit – Character Pack Adventures | CC0 | Spell-tutor wizard NPC (76 anims), (-16,8) |
| `wpn_staff_A/B`, `wpn_wand_A`, `wpn_sword_A`, `wpn_shield_A`, `wpn_bow_A`, `wpn_axe_A`, `wpn_hammer_A` | KayKit – Fantasy Weapons Bits | CC0 | Wizard weapons (staffs, wand, sword, shield, bow, axe, hammer) |
| `creature_Dragon.glb`, `creature_Slime.glb`, `creature_Bat.glb`, `creature_Skeleton.glb` | Quaternius Animated Monsters | CC0 | 3D duel creature summons (animated, tinted by school) |

**3D duel arena:** `battle3d.js` renders the duel battlefield as animated 3D creature models that drop in when a creature card is played, synced to `logic.js` (`battle.you/.enemy.board`). Card→model mapping by keyword (dragon/wyrm→Dragon, bat→Bat, slime→Slime, skeleton→Skeleton, mage/elf→Mage, default→Skeleton). See CLAUDEREADME §combat.

### Generated (paid) — hero landmarks only
| File | Source | Used as |
|---|---|---|
| `buildings/tower.glb` | Tripo 2D→3D | Central Tower (0,0), 40m — the campus silhouette |
| `buildings/arena.glb` | Tripo 2D→3D | Duel Arena (0,-32), 25m across |
| `buildings/scribe.glb` | Tripo 2D→3D | **unused** — the KayKit church took the Scribing Hall role when the campus went CC0. Kept in the repo since it was paid for; available if a slot wants it. |

**Skipped (off-theme):** KayKit **City Builder Bits** — modern city (cars, traffic lights, dumpsters) doesn't fit the medieval wizard academy.

**Downloaded (on disk, not yet imported):** KayKit Dungeon-Remastered, Character Pack Skeletons, Character Pack Adventures, Furniture Bits, City Builder Bits (all CC0, `.glb`/`.gltf`); **Universal Animation Library 2** by Quaternius (CC0, 130+ animations on a universal humanoid rig, `UAL2_Standard.glb` — for retargeting to our NPC skeletons later).

## 🔗 Pack links — attach these if you want them (itch downloads are session-protected, so I can't auto-fetch)
- **Universal Animation Library 2** (Quaternius) — CC0, 130+ anims — https://quaternius.itch.io/universal-animation-library-2 — *already grabbed via OpenGameArt, so skip unless you want the paid source `.blend`.*
- **Ghibli-inspired nature pack** ("110+ unique nature models") — on the itch [3D tag](https://itch.io/game-assets/free/tag-3d) — needs manual download.
- **"300+ models… fully textured medieval town"** — on the itch 3D tag — needs manual download.
- **Modular Character Outfits – Fantasy** — on the itch 3D tag — needs manual download.

## ⚔️ Combat assets — recommended (need your download; itch-session-protected)
- **KayKit: Fantasy Weapons Bits** — CC0, 25+ low-poly weapons incl. **staves, wands** (wizard on-theme!), swords, bows, shields — https://kaylousberg.itch.io/fantasy-weapons-bits
- **FlexUnit Medieval Fantasy Weapon Collection** — CC0, 14 weapons (sword, axe, mace, spear…) — https://flexunit.itch.io/medieval-fantasy-weapon-collection
- **Binbun RPG Weapons** — CC0, 70 weapons (incl. pickaxes) — https://binbun3d.itch.io/rpg-weapons
- **Spell-cast animations:** already have **Universal Animation Library 2** (Quaternius) — includes casting/attack anims to retarget to our rigged NPCs.
- **Character creation:** this is a UI screen — build in code with the wizard GLB models (not an imported asset), see CLAUDEREADME roadmap.

## 🐲 Creature / monster assets for duels (recommended; itch-session-protected)
- **Quaternius Ultimate Monsters** — 50 fully animated monsters (CC0, FBX/OBJ) — https://quaternius.com/packs/ultimatemonsters.html — *we already imported 4 of the "Animated Monsters" set (Dragon/Slime/Bat/Skeleton) as 3D duel summons.*
- **Quaternius 3D Card Kit – Fantasy** — 50 fully modeled fantasy scenes (heroes, elements, enemies) ideal for "cards come to life" — CC0, glTF — https://quaternius.com/packs/3dcardkitfantasy.html
- **Quaternius Ultimate Fantasy RTS / Medieval Village / RPG packs** — more units/props for creature variety (CC0).
- **KayKit Dungeon Pack** (already imported) — dungeon props for PvE arenas.

## 📦 Asset library (all categories, CC0 unless noted)
> **✅ Have** = already imported/in-game. **⬇️ I can fetch** = direct download works. **🔗 Attach** = itch session-protected, send the zip.

### 🎨 Character creation / customization
- 🔗 **Modular Character Outfits – Fantasy** (Quaternius) — 12 outfits / 62 modular parts / 3 colors each, humanoid-rigged — *the* customization pack — https://quaternius.itch.io/modular-character-outfits-fantasy (280MB)
- 🔗 **RPG Character Pack** (Quaternius) — CC0, quaternius.com
- 🔗 **Ultimate Modular Men / Women Pack** (Quaternius) — CC0
- ✅ **Character-creation screen** — built in code (live 3D preview, school tint); garments from the outfit pack above when you attach it.

### 🧙 NPCs / characters
- ✅ **KayKit Character Pack: Adventurers** (Mage NPC in-game), **Skeletons** (enemy in-game)
- 🔗 **Quaternius Animated Knights / Medieval Village / RPG Characters** — CC0, quaternius.com
- 🔗 **Ultimate Animated Character Pack** (Quaternius, 50+ characters) — quaternius.com

### 🐾 Familiars / card monsters
- ✅ **Textured Cute Monster Pack** (Quaternius) — 21 animated monsters (Chicken, Panda, Deer, Ghost, Yeti, Cthulhu, Cyclops, Demon, Mushroom…) — 6 imported so far
- ✅ **LowPoly Animated Monsters** — Dragon, Slime, Bat, Skeleton (in-game)
- 🔗 **Ultimate Monsters** (Quaternius, 50) — quaternius.com
- 🔗 **Ultimate Animated Animal Pack** (Quaternius, 12 animals × 13 anims) — familiars — quaternius.com
- 🔗 **Farm Animal Pack / Animated Dinosaur Pack** (Quaternius) — CC0

### 🏗 World / buildings / props
- ✅ **KayKit** Medieval Hexagon, Dungeon, Forest, Furniture (in-game)
- 🔗 **Quaternius Medieval Village MegaKit, Modular Dungeon Pack, Fantasy Props MegaKit, Buildings Pack** — CC0, quaternius.com

### 🎬 Animations
- ✅ **Universal Animation Library 2** (130+ anims, have)
- 🔗 **KayKit Character Animations** — https://kaylousberg.itch.io/character-animations

### 🖥 UI menus (2D)
- 🔗 Free UI/icon kits on the itch [UI tag](https://itch.io/game-assets/free/tag-ui) — attach the ones you like (e.g. a fantasy UI kit, RPG icon pack).

### ⚙️ Backend
- Not asset-based — the save/state/test systems are already built (see CLAUDEREADME).

> **KayKit packs are NOT here** — they're on GitHub (KayKit-Game-Assets org), so I can fetch them directly. Done for: Medieval Hexagon, Dungeon, Skeletons, Adventures, Furniture, City Builder.

## ☁️ CDN hosting (keeps the deploy small)
Large models (>1MB) are hosted on the **Higgsfield CDN** and loaded at runtime by URL, so the deployed `public/` stays ~6.5MB (well under the ~50MB deploy limit) while the world can hold many more models.

- **`cdn.js`** (`public/`) maps local filename → CDN url (`modelUrl(name)` routes to the CDN if present, else `./assets/models/`).
- **`world.js`** `makeCharModel`/`loadProp` and **`battle3d.js`** route their loads through `modelUrl()`.
- **`models_cdn/`** (repo root, git-tracked, NOT in `public/`) holds the local copies of the CDN-hosted GLBs: `player_wizard, merchant, referee, trainer, librarian, student_{emerald,violet,pink,gold}, enemy_skeleton, npc_mage, nat_CommonTree_1`.
- To add a big model to the CDN: `higgsfield_upload` it → add the url to `cdn.js` → move the local file to `models_cdn/`.

---

## 🏰 Buildings / academy (top priority)
- **KayKit – Medieval Hexagon Pack** — 200+ stylised low-poly medieval hexagonal tiles, buildings, props. CC0, FBX+GLTF. → academy campus, halls, towers.
- **KayKit – Medieval Builder Pack (Legacy)** — free medieval buildings + tiles. CC0. → academy structures.
- *"300+ models to create your own fully textured medieval town"* (itch 3D tag) — check license.

## 🌲 Terrain / nature
- **KayKit – Forest Nature Pack** — already using (trees/rocks); bring in bushes, grass, more tree variants, terrain.
- *"110+ unique nature models, Ghibli-inspired"* (itch 3D tag) — check license → softer, storybook nature dressing.
- **Retro PSX Style Tree Pack** — only if we want a retro accent (probably skip).

## 🏚 Dungeons / PvE (bosses, arenas)
- **KayKit – Dungeon Pack** — modular dungeon tiles/props. CC0. → dungeon levels, boss arenas.
- **KayKit – Character Pack : Skeletons** — rigged + animated skeleton enemies. CC0. → PvE mobs.

## 🧙 Characters / NPCs
- **KayKit – Character Pack : Adventurers** — rigged + animated adventurer characters. CC0. → extra NPCs / player cosmetic skins.
- **Modular Character Outfits – Fantasy** — 200+ styled props/outfits. → equipment/loadout visuals.

## 🎬 Animations (retarget to our rigged NPCs)
- **KayKit – Character Animations** — humanoid character animations. CC0.
- **Universal Animation Library 2** — 130+ combat/parkour/farming animations (Unity/Unreal/Godot; FBX → convert). → spell casts, gathering, emotes.

## 🛠 Props / crafting (OSRS skills)
- **KayKit : Resource Bits** — resources/materials, made for crafting games. CC0. → gathering nodes, smelting/forging props.
- **KayKit : Furniture Bits** — interiors. CC0. → halls, dorms, houses.
- **Medieval town modular props** (itch 3D tag, several) — check license.

---

## Notes
- **KayKit** = by Kay Lousberg, CC0 (free for personal/educational/commercial, no attribution required). Ships `.fbx` + `.gltf` + `.obj`.
- **Non-KayKit** — always read the pack's `License.txt` before importing; prefer CC0 / "free for commercial".
- To add a pack: run it through `tools/import-asset.mjs`, drop the GLB into `public/assets/models/`, wire it in via `loadProp()` (props) or `makeCharModel()` (characters), verify in-game, commit + push.

## Rigging generated characters

Generated characters (Tripo, Meshy, Higgsfield) arrive as a single static mesh with **no skeleton
and no animations**. The game cannot use them as-is: `makeCharModel` drives the player from a
mixer clip and NPCs from a procedural cycle keyed on bone names, so an unrigged GLB is a statue
that slides around the world.

    pip install bpy
    python3 tools/rig-character.py in.glb out.glb
    node tools/compress-models.mjs

`tools/rig-character.py` measures the mesh (arm span, hem, foot split, shoulder height) rather
than carrying hand-tuned numbers, so it rigs the next character without re-tuning. It emits
Mixamo-style bone names, `Idle` and `Walk` clips, and orients the model to face glTF +Z, which is
what `player.rotation.y = atan2(moveX, moveZ)` assumes.

Three things it works around, all found the hard way:

- **Blender's bone-heat solver fails on generated meshes.** They are non-manifold and full of
  interior geometry. It does not raise — it warns and leaves every vertex group empty, which
  exports as an unskinned mesh that ignores the skeleton. Envelope parenting is not a fallback
  either: it stores no vertex groups, so glTF has nothing to write. Weights are computed by bone
  proximity instead.
- **A robe tears in half if you bind it to the legs.** The skirt is one surface spanning both, so
  it rips down the middle on the first stride. The script finds the hem by vertex density (width
  does not work — the skirt flares wider than the feet are apart) and lets the legs claim only
  what is below it.
- **Limb swing axes must be derived, not assumed.** A pose bone rotates in its own space, and a
  downward leg and a sideways A-pose arm swing about different axes. Getting this wrong is not
  obvious by eye — it looks like a subtle shimmy — so verify by measuring vertex deflection, not
  by watching it.

A fourth thing, found when the wizard still looked T-posed in game:

- **The bind pose is not a standing pose.** Generated characters are authored in an A-pose with
  the arms out, because that is what makes them riggable. Animating a small swing around that
  pose leaves the arms permanently spread and the character reads as T-posed however correct the
  skeleton underneath is. Every clip is now built on a standing pose that brings the arms down,
  with the swing layered on top — and the arms are keyed even where they barely move, because a
  bone with no key falls back to its bind transform and snaps straight back out.

Separating a **robe** from **legs** is the fiddly part, and a height threshold cannot do it: the
hem and the boot tops overlap, so cutting above the hem tears the robe and cutting below it
detaches the boots. Both were visible on screen. Legs are gated by DISTANCE instead — boots hug
the leg bones, a skirt flares clear of them.

Characters are normalised to `CHARACTER_HEIGHT` (`structures.js`), measured as the larger of the
skeleton span and the mesh box. Neither alone is right: some rigs put bones outside the mesh,
while a pointed hat or a cloak puts mesh outside the bones. Using the skeleton alone scaled this
wizard 43% too large, because its bones stop at the top of the head and the hat does not.
