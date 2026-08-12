// cooking.js — Cooking (BACKLOG §6 "Cooking").
//
// PURE (no THREE, no DOM, no game.js), like items.js's neighbours.
//
// WHY THIS ISN'T A RESKINNED ALCHEMY POTION: Alchemy already owns "consumed for an in-duel effect"
// (heal, or — since §6 "Expand Alchemy" — a temporary atkBonus/defBonus). Cooking needed to be
// genuinely distinct, not the same mechanic under a new name, so a meal is eaten OUTSIDE a duel and
// its payoff is economic (gold/xp) rather than combat, over a real TIME WINDOW rather than one
// fight. The two skills stack instead of competing for the same moment.
//
// WHY THE ACTIVE BUFF IS STORED (an id + a real expiry timestamp): "is a buff active right now"
// needs a real wall-clock deadline to check against — the exact same shape `s.gatherCooldowns`
// already uses per material, just one slot instead of many (only one meal's effect applies at a
// time; eating a second meal overwrites the first, the same "spend to change your mind" shape
// re-enchanting an item already has).

export const FOODS = [
  { id:"food_stew",  name:"Hearty Stew",   icon:"🍲", lvl:1,  xp:18,  minutes:10, buff:{gold:5,  xp:5},  value:14,  req:{raw_shrimp:1,  oak_log:1} },
  { id:"food_pie",   name:"Salmon Pie",    icon:"🥧", lvl:20, xp:40,  minutes:15, buff:{gold:8,  xp:8},  value:34,  req:{raw_salmon:1,  oak_log:1} },
  { id:"food_roast", name:"Lobster Roast", icon:"🦞", lvl:40, xp:70,  minutes:20, buff:{gold:12, xp:12}, value:70,  req:{raw_lobster:1, willow_log:1} },
  { id:"food_feast", name:"Shark Feast",   icon:"🦈", lvl:65, xp:110, minutes:30, buff:{gold:18, xp:18}, value:140, req:{raw_shark:1,   magic_log:1} },
];
export const FOOD_MAP = Object.fromEntries(FOODS.map(f => [f.id, f]));

/** The active buff right now, or null if nothing's been eaten or it's expired. `now` is
 * injectable for tests, same convention seasons.js's currentSeason() uses. */
export function foodBuffActive(s, now = Date.now()){
  const f = s && s.foodBuff;
  if (!f || !f.until || now >= f.until) return null;
  const def = FOOD_MAP[f.id];
  return def ? { gold: def.buff.gold, xp: def.buff.xp, food: def, until: f.until } : null;
}

export function validateFoods(){
  const problems = [];
  const ids = new Set();
  for (const f of FOODS){
    if (ids.has(f.id)) problems.push(`duplicate food id "${f.id}"`);
    ids.add(f.id);
    if (!f.name || !f.icon) problems.push(`${f.id}: incomplete`);
    if (!(f.minutes > 0)) problems.push(`${f.id}: invalid duration`);
    if (!(f.buff && f.buff.gold >= 0 && f.buff.xp >= 0)) problems.push(`${f.id}: invalid buff`);
    if (!(f.req && Object.keys(f.req).length)) problems.push(`${f.id}: no recipe`);
  }
  return problems;
}
