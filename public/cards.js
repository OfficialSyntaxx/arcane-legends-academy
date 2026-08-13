// Wizard TCG — card catalog (shared data). Mirrored in logic.js for server validation.
export const SCHOOLS = {
  fire:    { name: "Fire",    color: "#ff6b35", art: "school_fire.jpg" },
  ice:     { name: "Ice",     color: "#5fd6ff", art: "school_ice.jpg" },
  storm:   { name: "Storm",   color: "#a06bff", art: "school_storm.jpg" },
  myth:    { name: "Myth",    color: "#3ddc84", art: "school_myth.jpg" },
  life:    { name: "Life",    color: "#ff9ecb", art: "school_life.jpg" },
  death:   { name: "Death",   color: "#e8e6f0", art: "school_death.jpg" },
  balance: { name: "Balance", color: "#ffc94d", art: "school_balance.jpg" },
};

export const RARITY = {
  common: { name: "Common",    color: "#6b8cff", base: 10 },
  uncommon: { name: "Uncommon", color: "#4ade80", base: 25 },
  rare: { name: "Rare",        color: "#c084fc", base: 60 },
  epic: { name: "Epic",        color: "#fb923c", base: 150 },
  legendary: { name: "Legendary", color: "#fbbf24", base: 400 },
};

// Elemental damage matrix (non-transitive ring): attacker > defender, +1 damage.
// Fire melts Ice, Ice calms Storm, Storm scatters Myth, Myth hunts Life, Life overcomes Death, Death extinguishes Fire. Balance is neutral.
export const SCHOOL_BONUS = [
  ["fire","ice"],["ice","storm"],["storm","myth"],["myth","life"],["life","death"],["death","fire"],
];

// fx keys: haste, taunt, drain, multiAttack, healPlay{n}, buffAll{n}, freezeAll,
//          dmg{n}, dmgAll{n}, dmgWiz{n}, heal{n}, shield{n}, draw{n}
export const CARDS = [
  // ---- Fire ----
  { id:"fire_cat", name:"Fire Cat", school:"fire", type:"creature", art:"cards/fire_cat.jpg", cost:1, atk:2, hp:2, rarity:"common", fx:["haste"], text:"Haste. A loyal little blaze." },
  { id:"fire_elf", name:"Fire Elf", school:"fire", type:"creature", art:"cards/fire_elf.jpg", cost:2, atk:3, hp:3, rarity:"common", fx:[], text:"Spirited, quick-tempered." },
  { id:"fire_dragon", name:"Fire Dragon", school:"fire", type:"creature", cost:7, atk:8, hp:7, rarity:"legendary", fx:["haste"], text:"Haste. The heart of the school." },
  { id:"firebolt", name:"Firebolt", school:"fire", type:"spell", art:"cards/firebolt.jpg", cost:1, rarity:"common", fx:[{k:"dmg",n:4}], text:"Deal 4 damage.", target:true },
  { id:"fireball", name:"Fireball", school:"fire", type:"spell", art:"cards/fireball.jpg", cost:3, rarity:"uncommon", fx:[{k:"dmg",n:6}], text:"Deal 6 damage.", target:true },
  { id:"meteor", name:"Meteor Strike", school:"fire", type:"spell", art:"cards/meteor.jpg", cost:5, rarity:"epic", fx:[{k:"dmgAll",n:3},{k:"dmgWiz",n:4}], text:"Deal 3 to all enemy creatures, 4 to the enemy wizard." },

  // ---- Ice ----
  { id:"ice_golem", name:"Ice Golem", school:"ice", type:"creature", art:"cards/ice_golem.jpg", cost:2, atk:2, hp:4, rarity:"common", fx:["taunt"], text:"Taunt. A wall of frost." },
  { id:"frost_giant", name:"Frost Giant", school:"ice", type:"creature", art:"cards/frost_giant.jpg", cost:4, atk:4, hp:6, rarity:"rare", fx:["taunt"], text:"Taunt." },
  { id:"ice_wyrm", name:"Ice Wyrm", school:"ice", type:"creature", art:"cards/ice_wyrm.jpg", cost:6, atk:6, hp:7, rarity:"legendary", fx:["taunt"], text:"Taunt. Ancient and patient." },
  { id:"ice_armor", name:"Ice Armor", school:"ice", type:"spell", art:"cards/ice_armor.jpg", cost:2, rarity:"common", fx:[{k:"shield",n:6}], text:"Gain 6 shield." },
  { id:"frost_shield", name:"Frost Shield", school:"ice", type:"spell", art:"cards/frost_shield.jpg", cost:1, rarity:"uncommon", fx:[{k:"shield",n:3}], text:"Gain 3 shield." },
  { id:"blizzard", name:"Blizzard", school:"ice", type:"spell", art:"cards/blizzard.jpg", cost:4, rarity:"epic", fx:[{k:"freezeAll"}], text:"Freeze all enemy creatures this turn." },

  // ---- Storm ----
  { id:"storm_bat", name:"Storm Bat", school:"storm", type:"creature", art:"cards/storm_bat.jpg", cost:1, atk:2, hp:1, rarity:"common", fx:["haste"], text:"Haste." },
  { id:"storm_shark", name:"Storm Shark", school:"storm", type:"creature", art:"cards/storm_shark.jpg", cost:3, atk:4, hp:2, rarity:"rare", fx:["haste"], text:"Haste. Strike fast." },
  { id:"storm_titan", name:"Storm Titan", school:"storm", type:"creature", art:"cards/storm_titan.jpg", cost:8, atk:9, hp:8, rarity:"legendary", fx:[], text:"The storm given form." },
  { id:"storm_shift", name:"Storm Shift", school:"storm", type:"spell", art:"cards/storm_shift.jpg", cost:1, rarity:"common", fx:[{k:"dmg",n:3}], text:"Deal 3 damage.", target:true },
  { id:"lightning", name:"Lightning Bolt", school:"storm", type:"spell", art:"cards/lightning.jpg", cost:2, rarity:"uncommon", fx:[{k:"dmg",n:5}], text:"Deal 5 damage.", target:true },
  { id:"tempest", name:"Tempest", school:"storm", type:"spell", art:"cards/tempest.jpg", cost:6, rarity:"epic", fx:[{k:"dmgWiz",n:10}], text:"Deal 10 damage to the enemy wizard." },

  // ---- Myth ----
  { id:"myth_walker", name:"Myth Walker", school:"myth", type:"creature", art:"cards/myth_walker.jpg", cost:2, atk:3, hp:2, rarity:"common", fx:[], text:"A guardian of legend." },
  { id:"minotaur", name:"Minotaur", school:"myth", type:"creature", art:"cards/minotaur.jpg", cost:4, atk:5, hp:4, rarity:"rare", fx:[], text:"Charge into the maze." },
  { id:"hydra", name:"Hydra", school:"myth", type:"creature", art:"cards/hydra.jpg", cost:7, atk:7, hp:7, rarity:"legendary", fx:["multiAttack"], text:"Attacks twice each turn." },
  { id:"basilisk", name:"Basilisk", school:"myth", type:"creature", art:"cards/basilisk.jpg", cost:5, atk:5, hp:6, rarity:"epic", fx:["taunt"], text:"Taunt." },
  { id:"myth_blast", name:"Myth Blast", school:"myth", type:"spell", art:"cards/myth_blast.jpg", cost:2, rarity:"common", fx:[{k:"dmg",n:5}], text:"Deal 5 damage.", target:true },

  // ---- Life ----
  { id:"pixie", name:"Pixie", school:"life", type:"creature", art:"cards/pixie.jpg", cost:1, atk:1, hp:2, rarity:"common", fx:[{k:"healPlay",n:2}], text:"Heal 2 when played." },
  { id:"unicorn", name:"Unicorn", school:"life", type:"creature", art:"cards/unicorn.jpg", cost:3, atk:3, hp:4, rarity:"rare", fx:[{k:"healPlay",n:3}], text:"Heal 3 when played." },
  { id:"satyr", name:"Satyr", school:"life", type:"creature", art:"cards/satyr.jpg", cost:5, atk:4, hp:6, rarity:"epic", fx:[{k:"healPlay",n:5}], text:"Heal 5 when played." },
  { id:"healing_wave", name:"Healing Wave", school:"life", type:"spell", art:"cards/healing_wave.jpg", cost:2, rarity:"common", fx:[{k:"heal",n:5}], text:"Restore 5 health." },
  { id:"rebirth", name:"Rebirth", school:"life", type:"spell", art:"cards/rebirth.jpg", cost:6, rarity:"legendary", fx:[{k:"heal",n:10}], text:"Restore 10 health." },

  // ---- Death ----
  { id:"skeleton", name:"Skeleton", school:"death", type:"creature", art:"cards/skeleton.jpg", cost:1, atk:2, hp:1, rarity:"common", fx:[], text:"Rattle and roll." },
  { id:"ghoul", name:"Ghoul", school:"death", type:"creature", art:"cards/ghoul.jpg", cost:3, atk:3, hp:3, rarity:"rare", fx:["drain"], text:"Drain. Heal for damage dealt." },
  { id:"vampire", name:"Vampire", school:"death", type:"creature", art:"cards/vampire.jpg", cost:4, atk:4, hp:4, rarity:"uncommon", fx:["drain"], text:"Drain." },
  { id:"reaper", name:"Death Reaper", school:"death", type:"creature", art:"cards/reaper.jpg", cost:6, atk:6, hp:6, rarity:"legendary", fx:["drain"], text:"Drain. The end of all things." },
  { id:"dark_pact", name:"Dark Pact", school:"death", type:"spell", art:"cards/dark_pact.jpg", cost:2, rarity:"common", fx:[{k:"dmg",n:4},{k:"heal",n:4}], text:"Deal 4 damage, heal 4.", target:true },

  // ---- Balance ----
  { id:"balance_blade", name:"Balance Blade", school:"balance", type:"spell", art:"cards/balance_blade.jpg", cost:1, rarity:"common", fx:[{k:"buffAll",n:2}], text:"Your creatures gain +2 attack." },
  { id:"novice", name:"Novice Assistant", school:"balance", type:"creature", art:"cards/novice.jpg", cost:2, atk:2, hp:3, rarity:"common", fx:[], text:"Every school starts somewhere." },
  { id:"balance_streak", name:"Balance Streak", school:"balance", type:"spell", art:"cards/balance_streak.jpg", cost:3, rarity:"rare", fx:[{k:"dmg",n:4},{k:"draw",n:1}], text:"Deal 4 damage, draw a card.", target:true },
  { id:"sunbird", name:"Sunbird", school:"balance", type:"creature", art:"cards/sunbird.jpg", cost:4, atk:4, hp:5, rarity:"rare", fx:[], text:"Warm light on the scales." },
  { id:"balance_dragon", name:"Balance Dragon", school:"balance", type:"creature", art:"cards/balance_dragon.jpg", cost:7, atk:7, hp:7, rarity:"legendary", fx:[{k:"buffAll",n:1}], text:"Your creatures gain +1 attack." },

  // ---- Neutral ----
  { id:"elixir", name:"Health Elixir", school:"balance", type:"spell", art:"cards/elixir.jpg", cost:1, rarity:"common", fx:[{k:"heal",n:3}], text:"Restore 3 health." },
  { id:"golden_golem", name:"Golden Golem", school:"balance", type:"creature", art:"cards/golden_golem.jpg", cost:4, atk:5, hp:5, rarity:"rare", fx:["taunt"], text:"Taunt." },
  { id:"master_wand", name:"Master's Wand", school:"balance", type:"spell", art:"cards/master_wand.jpg", cost:3, rarity:"epic", fx:[{k:"buffAll",n:2}], text:"Your creatures gain +2 attack." },
  { id:"arcane_guardian", name:"Arcane Guardian", school:"balance", type:"creature", art:"cards/arcane_guardian.jpg", cost:5, atk:5, hp:7, rarity:"epic", fx:["taunt"], text:"Taunt." },

  // ---- Field cards (persistent effects) ----
  { id:"arcane_nexus", name:"Arcane Nexus", school:"balance", type:"field", art:"cards/arcane_nexus.jpg", cost:4, rarity:"rare", fx:[{k:"fieldAtk",n:1}], text:"Field: your creatures have +1 attack." },
  { id:"radiant_aura", name:"Radiant Aura", school:"life", type:"field", art:"cards/radiant_aura.jpg", cost:3, rarity:"rare", fx:[{k:"fieldHeal",n:3}], text:"Field: heal 3 at the start of each turn." },
  { id:"storm_conduit", name:"Storm Conduit", school:"storm", type:"field", art:"cards/storm_conduit.jpg", cost:5, rarity:"epic", fx:[{k:"fieldPip",n:1}], text:"Field: gain +1 pip each turn." },

  // ---- Trap cards (face-down, trigger on enemy action) ----
  { id:"fire_trap", name:"Fire Trap", school:"fire", type:"trap", art:"cards/fire_trap.jpg", cost:2, rarity:"uncommon", fx:[{k:"trapDmg",n:4}], text:"Trap: when the enemy plays a creature, deal 4 damage to it." },
  { id:"mana_ward", name:"Mana Ward", school:"ice", type:"trap", art:"cards/mana_ward.jpg", cost:2, rarity:"uncommon", fx:[{k:"trapShield",n:4}], text:"Trap: when the enemy attacks, gain 4 shield." },
];

export const CARD_MAP = Object.fromEntries(CARDS.map(c => [c.id, c]));

// grader bands: roll 0-100 -> grade (docs: Grade 1-5 common, 6-8 fine, 9 Mint slab, 10 Gem Mint slab)
export const GRADES = [
  { name:"Poor",       min:0,  x:0.3, icon:"🪨", g:1,  slab:false },
  { name:"Fair",       min:10, x:0.4, icon:"🪨", g:2,  slab:false },
  { name:"Acceptable", min:20, x:0.5, icon:"🪨", g:3,  slab:false },
  { name:"Good",       min:30, x:0.6, icon:"🪨", g:4,  slab:false },
  { name:"Fine",       min:40, x:0.8, icon:"🪨", g:5,  slab:false },
  { name:"Excellent",  min:50, x:1.0, icon:"🌟", g:6,  slab:false },
  { name:"Rare",       min:60, x:1.3, icon:"🌟", g:7,  slab:false },
  { name:"Near Mint",  min:70, x:1.7, icon:"🌟", g:8,  slab:false },
  { name:"Mint",       min:80, x:3.0, icon:"💎", g:9,  slab:true  },
  { name:"Gem Mint",   min:90, x:5.0, icon:"💠", g:10, slab:true  },
];
// GRADES is authored ascending, so the band for a roll is the LAST entry whose min it clears.
// (A forward `find` would match "Poor" (min 0) for every roll and collapse the whole grade table.)
const GRADES_DESC = [...GRADES].reverse();
export function gradeForRoll(r){ return GRADES_DESC.find(g => r >= g.min) || GRADES[0]; }

export function cardValue(cardId, roll){
  const c = CARD_MAP[cardId];
  const g = gradeForRoll(roll);
  return Math.round(RARITY[c.rarity].base * g.x);
}
export function gradeFee(cardId){
  return Math.round(RARITY[CARD_MAP[cardId].rarity].base * 0.6);
}