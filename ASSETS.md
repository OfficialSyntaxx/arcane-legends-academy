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

**Downloaded (on disk in `/tmp/kaykit_packs`, not yet imported):** KayKit Dungeon-Remastered, Character Pack Skeletons, Character Pack Adventures, Furniture Bits, City Builder Bits. All **CC0**, ship `.glb`/`.gltf` natively (no FBX conversion needed).

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