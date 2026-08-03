// Wizard TCG — items, skills, equipment, recipes (RPG economy layer)
export const SKILLS = {
  mining: { name:"Mining", icon:"⛏️" },
  fishing: { name:"Fishing", icon:"🎣" },
  woodcutting: { name:"Woodcutting", icon:"🪓" },
  smithing: { name:"Smithing", icon:"⚒️" },
  alchemy: { name:"Alchemy", icon:"⚗️" },
  scribing: { name:"Scribing", icon:"🪶" },
};

// Gatherable materials: [id, name, icon, skill, level, xp, value]
export const MATERIALS = [
  // mining
  { id:"copper", name:"Copper Ore", icon:"🪨", skill:"mining", lvl:1, xp:8, value:4 },
  { id:"tin", name:"Tin Ore", icon:"🪨", skill:"mining", lvl:1, xp:8, value:4 },
  { id:"iron", name:"Iron Ore", icon:"🪨", skill:"mining", lvl:15, xp:18, value:10 },
  { id:"silver", name:"Silver Ore", icon:"🪨", skill:"mining", lvl:20, xp:25, value:16 },
  { id:"gold", name:"Gold Ore", icon:"🪨", skill:"mining", lvl:30, xp:40, value:30 },
  { id:"mithril", name:"Mithril Ore", icon:"🪨", skill:"mining", lvl:50, xp:70, value:55 },
  { id:"runite", name:"Runite Ore", icon:"🪨", skill:"mining", lvl:70, xp:110, value:90 },
  // fishing
  { id:"raw_shrimp", name:"Raw Shrimp", icon:"🦐", skill:"fishing", lvl:1, xp:10, value:5 },
  { id:"raw_salmon", name:"Raw Salmon", icon:"🐟", skill:"fishing", lvl:20, xp:30, value:14 },
  { id:"raw_lobster", name:"Raw Lobster", icon:"🦞", skill:"fishing", lvl:40, xp:55, value:32 },
  { id:"raw_shark", name:"Raw Shark", icon:"🦈", skill:"fishing", lvl:65, xp:95, value:70 },
  // woodcutting
  { id:"oak_log", name:"Oak Log", icon:"🪵", skill:"woodcutting", lvl:1, xp:12, value:6 },
  { id:"willow_log", name:"Willow Log", icon:"🪵", skill:"woodcutting", lvl:20, xp:32, value:16 },
  { id:"magic_log", name:"Magic Log", icon:"🪵", skill:"woodcutting", lvl:50, xp:70, value:48 },
];

export const BARS = [
  { id:"bar_bronze", name:"Bronze Bar", icon:"🟤", metal:"bronze", lvl:1, xp:15, value:12, req:{copper:1, tin:1} },
  { id:"bar_iron", name:"Iron Bar", icon:"⚪", metal:"iron", lvl:15, xp:32, value:25, req:{iron:1} },
  { id:"bar_silver", name:"Silver Bar", icon:"🌫️", metal:"silver", lvl:20, xp:45, value:38, req:{silver:1} },
  { id:"bar_gold", name:"Gold Bar", icon:"🟡", metal:"gold", lvl:30, xp:65, value:65, req:{gold:1} },
  { id:"bar_mithril", name:"Mithril Bar", icon:"🔷", metal:"mithril", lvl:50, xp:110, value:120, req:{mithril:1} },
  { id:"bar_rune", name:"Rune Bar", icon:"🟣", metal:"rune", lvl:70, xp:170, value:210, req:{runite:1} },
];

export const POTIONS = [
  { id:"potion_small", name:"Small Healing Potion", icon:"🧪", lvl:1, xp:20, heal:15, value:15, req:{raw_shrimp:1} },
  { id:"potion_medium", name:"Healing Potion", icon:"🧪", lvl:20, xp:45, heal:35, value:40, req:{raw_salmon:1} },
  { id:"potion_large", name:"Great Healing Potion", icon:"🧪", lvl:40, xp:80, heal:60, value:80, req:{raw_lobster:1} },
  { id:"potion_great", name:"Master Healing Potion", icon:"🧪", lvl:65, xp:130, heal:100, value:160, req:{raw_shark:1} },
];

// Metal tiers: stats scale with tier. tier: bronze=1, iron=2, gold=3, mithril=4, rune=5
export const METALS = {
  bronze: { name:"Bronze", tier:1, color:"#cd7f32" },
  iron:   { name:"Iron",   tier:2, color:"#c8c8c8" },
  gold:   { name:"Gold",   tier:3, color:"#ffd766" },
  mithril:{ name:"Mithril",tier:4, color:"#5aa2ff" },
  rune:   { name:"Rune",   tier:5, color:"#b58cff" },
};
export const SLOTS = [
  { id:"wand", name:"Wand", icon:"🪄" },
  { id:"hat", name:"Hat", icon:"🎩" },
  { id:"robe", name:"Robe", icon:"🥻" },
  { id:"boots", name:"Boots", icon:"👢" },
  { id:"amulet", name:"Amulet", icon:"📿" },
];

// one equipment per metal × slot (5 × 5 = 25)
export function equipmentFor(metalId, slotId){
  const m = METALS[metalId], s = SLOTS.find(x=>x.id===slotId);
  const t = m.tier;
  const stats = { atk:0, def:0, hp:0, pip:0, gold:0 };
  if (slotId==="wand") stats.atk = t*2;
  if (slotId==="hat") stats.def = t+1;
  if (slotId==="robe"){ stats.def = t*2; stats.hp = t*3; }
  if (slotId==="boots") stats.def = t;
  if (slotId==="amulet"){ stats.atk = t; stats.hp = t*2; if(t>=4) stats.pip = 1; }
  stats.gold = t*2;
  const bars = { wand:2, hat:2, robe:3, boots:2, amulet:2 }[slotId];
  return {
    id: `${metalId}_${slotId}`, name: `${m.name} ${s.name}`, slot: slotId,
    metal: metalId, tier: t, stats, bars, color: m.color,
    barId: `bar_${metalId}`, lvl: m.tier*10 + 5, icon: s.icon,
    value: (t*40) + (slotId==="robe"?20:0),
  };
}

export function allEquipment(){
  const out = [];
  for (const metal of Object.keys(METALS)) for (const slot of SLOTS) out.push(equipmentFor(metal, slot.id));
  return out;
}

// item -> readable stats string for the UI
export function equipStatsLabel(e){
  const s = e.stats; const parts = [];
  if (s.atk) parts.push("+"+s.atk+" Attack");
  if (s.def) parts.push("+"+s.def+" Defense");
  if (s.hp) parts.push("+"+s.hp+" Max HP");
  if (s.pip) parts.push("+"+s.pip+" Pip");
  if (s.gold) parts.push("+"+s.gold+"% Gold");
  return parts.join(" · ");
}

export const HOME_UPGRADES = [
  { id:"treasury", name:"Treasury", icon:"💰", desc:"+10% gold from wins", max:5, cost(n){ return 120 + n*90; }, timber(n){ return 1 + n; } },
  { id:"library", name:"Library", icon:"📚", desc:"+10% card drop chance", max:5, cost(n){ return 150 + n*110; }, timber(n){ return 1 + n; } },
  { id:"armory", name:"Armory", icon:"🛡️", desc:"+5% gear stats", max:5, cost(n){ return 140 + n*100; }, timber(n){ return 1 + n; } },
  { id:"tavern", name:"Tavern", icon:"🍺", desc:"+10% skill XP", max:5, cost(n){ return 100 + n*80; }, timber(n){ return 1 + n; } },
];

// Card-creation materials (the Arcanum scribing loop). Refined from raw craft via the Scribing skill.
// canvas  <- wood (timber), ink <- fish, reagent <- ore.
export const CARD_MATERIALS = [
  { id:"canvas",  name:"Blank Canvas", icon:"🖼️", from:["oak_log","willow_log","magic_log"], xp:12, value:8 },
  { id:"ink",     name:"Elemental Ink", icon:"🖋️", from:["raw_shrimp","raw_salmon","raw_lobster","raw_shark"], xp:12, value:8 },
  { id:"reagent", name:"Arcane Reagent", icon:"🧪", from:["copper","tin","iron","silver","gold","mithril","runite"], xp:12, value:8 },
];
// Which raw material feeds which card material (for "refine" UI).
export function refineSource(cardMat){ return CARD_MATERIALS.find(m=>m.id===cardMat).from; }