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

> **KayKit packs are NOT here** — they're on GitHub (KayKit-Game-Assets org), so I can fetch them directly. Done for: Medieval Hexagon, Dungeon, Skeletons, Adventures, Furniture, City Builder.

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