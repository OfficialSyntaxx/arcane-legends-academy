# Free Asset Plan (CC0 / free-for-commercial)

Reference list of free 3D asset packs we can pull into the game. **Verify each pack's license + file formats before importing** (KayKit is confirmed CC0; others marked "check").

> **Pipeline (always):** everything enters the game as a resized `.glb`.
> `node tools/import-asset.mjs <url|path> [--name x.glb] [--out public/assets/models] [--resize 512] [--target-height N]`
> → downloads → converts FBX/GLTF→GLB → resizes textures → prints scale + texture status. Prefer the pack's `.gltf`/`.glb` when available (native, no conversion); `.fbx` converts via FBX2glTF. Keep the deploy under ~50MB (512px textures).

---

## ✅ Already in use
*Characters:* all 10 NPC/player GLBs (Meshy 2D→3D) — see `CLAUDEREADME` §9.

| File | Source | License | Used as |
|---|---|---|---|
| `kaykit_tree.glb` | KayKit – Forest Nature Pack | CC0 | Woodcutting node (Chop Oak/Willow) |
| `kaykit_rock.glb` | KayKit – Forest Nature Pack | CC0 | Mining node (Mine Copper/Iron) |
| `hex_castle.glb` | KayKit – Medieval Hexagon | CC0 | Central academy hall (0,0) |
| `hex_blacksmith.glb` | KayKit – Medieval Hexagon | CC0 | Smithy & Forge (16,-7) |
| `hex_church.glb` | KayKit – Medieval Hexagon | CC0 | Scribing Hall (-16,-7) |
| `hex_market.glb` | KayKit – Medieval Hexagon | CC0 | Merchant stall (16,6) |
| `hex_tavern.glb` | KayKit – Medieval Hexagon | CC0 | Social hangout (-7,12) |
| `hex_tower_A.glb` | KayKit – Medieval Hexagon | CC0 | Academy tower (-16,-16) |
| `hex_home_A.glb` | KayKit – Medieval Hexagon | CC0 | Student Dorms (0,16) |
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