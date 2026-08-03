# Wizard TCG — Game Plan (mode S, merged §§1–5) — v3 (current implementation)

## Profile (9 axes + delivery context)
- Time: turn-based (card duels) + short timed gathering actions (skills) + asynchronous meta.
- Space: abstract (menus, inventories, collection) + one discrete battlefield (creature rows) + a full 3D academy world (walkable hub).
- Player agency: one embodied hero — a wizard with a name, school, level, gold, a card collection, an inventory, equipment, skills, and a home.
- Conflict: versus the system (PvE quest bosses) + versus other players (online PvP via the rules module) + versus AI wizards (local PvP) + scarcity (economy).
- Content: authored — fixed card catalog + item/recipe data + quests; procedural economy.
- Outcome: finite per duel + endless meta (collection, skills, housing, auction profits).
- Players: solo (single-player meta layer) + competitive (online PvP, 2 players per match).
- Session: minutes per duel; the skills/economy/housing meta runs for dozens of hours.
- Engagement source (primary): growth & accumulation (collection, skills, equipment, housing) + calculation (deck building, combat math, market timing). Secondary: discovery (pack openings, grading gambles, auction swings).

Delivery context: desktop web + mobile web (both). Keyboard/mouse (event.code), touch (joystick + drag-to-rotate camera + pinch-zoom), gamepad. English (all strings external). Strictness: S.

## Systems (current implementation)
1. 3D academy world. A walkable Three.js campus (procedural low-poly) with a Scribing Hall, Smithy, Library, Merchant, Duel Arena, Student Dorms, a central tower, gathering nodes, and NPCs (Professor, Merchant, Referee, Trainer, Librarian, students) with dialogue. Drag-to-rotate camera, pinch-zoom, touch joystick + tap-to-move, camera-relative movement. Crafting happens in-world via overlays.
2. Schools. A character-creation questionnaire (or manual pick) assigns one of 7 schools (Fire, Ice, Storm, Myth, Life, Death, Balance). Each grants its own starter cards, a +1 attack affinity for its creatures, and an elemental damage matrix (Fire>Ice>Storm>Myth>Life>Death>Fire; Balance neutral).
3. Skills (OSRS-style). Mining, Fishing, Woodcutting (gather on a short timer, level-gated tiers), Smithing (smelt ore->bars, forge equipment), Alchemy (brew potions from fish), Scribing (refine canvas/ink/reagent and scribe cards). Levels 1-99, XP, level gates.
4. Card scribing. Spend 1 canvas + 1 ink + 1 reagent (refined from wood/fish/ore) to scribe a random spell card. Higher Scribing skill raises the grade roll.
5. Grading & slabs. Cards are graded 1-10. Grades 9-10 (Mint/Gem Mint) become slabbed collectibles with unique serial numbers. A risky regrade re-rolls a graded card's grade.
6. Card types. Creature, Spell, FIELD (persistent effects: +attack, heal-per-turn, +pip), and TRAP (face-down, triggers on enemy creature-play or attack).
7. Equipment & loadout. 5 gear slots (Wand, Hat, Robe, Boots, Amulet), metal tiers (Bronze->Rune) with stats (+Atk, +Def, +MaxHP, +Pip, +Gold) that enhance duels.
8. Player-owned home & guild. Buy a home; upgrade rooms (Treasury, Library, Armory, Tavern) with gold + timber.
9. Trading & auctions. Bazaar (NPC buy/sell, grade-aware) + Auction House (NPC-driven bids).
10. Retention. Daily quests (win/gather/scribe), daily login, academy rank (Novice->Archmage).

## Combat (card duel) — core rules
- Wizard HP 100 (boosted by equipment). Start: 5-card hand, 1 pip (capped 10, +1/turn). Deck 20 (max 3 copies).
- Creatures: cost/atk/hp; haste, taunt, drain, multiAttack, heal-on-play, buff-all. Mutual combat. School affinity: your school's creatures +1 attack.
- Spells: targeted damage, AoE, heal, shield, buff, draw, freeze. Field cards give persistent effects; Trap cards trigger face-down.
- Elemental matrix: +1 damage when your school counters the target's school.
- AI (local): greedy — play best affordable creature/field/trap, cast spells, attack wizard unless taunt up.

## Economy
- Sources: quest wins, PvP wins, selling cards/items, auction sales, gathering. Sinks: packs, bazaar, grading fees, regrade fees, housing, smithing/alchemy.
- Card value = rarity base x grade multiplier. Equipment value scales with metal tier.
- Inflation guarded by sinks; grading EV approx 0 (genuine gamble).

## Balance
- Creature power approx cost+1; spell dmg approx cost x 2. Equipment scales with metal tier.
- Non-transitive elemental ring in schools; skill/progression curves gentle-decelerate.