// zonequests.js — quests given by NPCs out in the world (BACKLOG §2 "main story + side quests").
//
// PURE (no THREE, no DOM), so tools/test.mjs can prove every quest is completable and that none
// of them can deadlock the chain.
//
// NOT the same thing as `game.js QUESTS`, which is the duel gauntlet — a ladder of rival decks
// fought from a menu. These are things to do in a PLACE: gather what grows there, clear what
// lives there, kill the thing at the bottom of its dungeon. They are what turns a zone from
// scenery into somewhere worth walking to.
//
// THE STATE SPLIT, same as onboarding.js: what the player CHOSE is stored, what they ACHIEVED is
// derived. `accepted` and `done` are real save state — the player picked up the quest, and a
// reward must only ever pay once. Progress is asked of the save every time it is drawn, so it
// cannot drift and needs no migration when a quest's objective changes.

/**
 * Objective kinds:
 *   gather   have `n` of material `id` in the inventory (turning in consumes them)
 *   slay     `n` enemies defeated in dungeon `dungeon`
 *   boss     the boss of dungeon `dungeon` is dead
 *   visit    zone `zone` has been visited
 *   clear    room `room` of dungeon `dungeon` is cleared
 */
export const ZONE_QUESTS = [
  {
    id: "roots",
    zone: "whispering_forest",
    giver: "forest_sage",
    title: "Whispering Roots",
    brief: "The willows here hold the old magic. Bring me their wood and I will teach you to read it.",
    objective: { kind: "gather", id: "willow_log", n: 8 },
    reward: { gold: 220, xp: 120 },
  },
  {
    id: "veins",
    zone: "whispering_forest",
    giver: "forest_sage",
    title: "Veins of the Grove",
    brief: "Copper runs shallow under the moss. Ten pieces and the wards can be re-cut.",
    objective: { kind: "gather", id: "copper", n: 10 },
    reward: { gold: 260, xp: 140 },
    requires: ["roots"],
  },
  {
    id: "scouting",
    zone: "whispering_forest",
    giver: "forest_warden",
    title: "Cinderhollow Scouting",
    brief: "Something crawled out of the caverns last winter. Go in, thin them out, and come back.",
    objective: { kind: "slay", dungeon: "cinderhollow_caverns", n: 3 },
    reward: { gold: 300, xp: 200 },
  },
  {
    id: "roost",
    zone: "whispering_forest",
    giver: "forest_warden",
    title: "Clear the Roost",
    brief: "The bats nest in a side chamber. Clear it and the caverns get quieter.",
    objective: { kind: "clear", dungeon: "cinderhollow_caverns", room: "roost" },
    reward: { gold: 340, xp: 240 },
    requires: ["scouting"],
  },
  {
    id: "wyrm",
    zone: "whispering_forest",
    giver: "forest_warden",
    title: "The Cinder Wyrm",
    brief: "The thing at the bottom is why the caverns are warm. End it.",
    objective: { kind: "boss", dungeon: "cinderhollow_caverns" },
    reward: { gold: 800, xp: 600, cards: 2 },
    requires: ["scouting"],
  },
];

const state = s => (s && s.zoneQuests) || { accepted: [], done: [] };

export function isDone(s, id){ return state(s).done.includes(id); }
export function isAccepted(s, id){ return state(s).accepted.includes(id); }

/** Prerequisites satisfied? */
export function unlocked(s, q){
  return (q.requires || []).every(r => isDone(s, r));
}

/** How far along an objective is, derived entirely from the save. */
export function progressOf(s, q){
  const o = q.objective;
  const dun = ((s.worldState && s.worldState.dungeons) || {})[o.dungeon] || { defeated: [], cleared: [], bossDead: false };
  let have = 0, need = o.n || 1;
  if (o.kind === "gather") have = (s.inventory && s.inventory[o.id]) || 0;
  else if (o.kind === "slay") have = dun.defeated.length;
  else if (o.kind === "boss") have = dun.bossDead ? 1 : 0;
  else if (o.kind === "clear") have = dun.cleared.includes(o.room) ? 1 : 0;
  else if (o.kind === "visit") have = ((s.worldState && s.worldState.visited) || []).includes(o.zone) ? 1 : 0;
  return { have: Math.min(have, need), need, done: have >= need };
}

/** A one-line description of what the objective asks for. */
export function objectiveText(q, materialName){
  const o = q.objective;
  if (o.kind === "gather") return `Gather ${o.n} × ${materialName || o.id}`;
  if (o.kind === "slay") return `Defeat ${o.n} creatures in the caverns`;
  if (o.kind === "boss") return `Defeat the boss of the caverns`;
  if (o.kind === "clear") return `Clear the ${o.room}`;
  if (o.kind === "visit") return `Travel to ${o.zone}`;
  return "";
}

/** Quests a giver has to offer right now: not done, unlocked, and not already accepted. */
export function offeredBy(s, giver){
  return ZONE_QUESTS.filter(q => q.giver === giver && !isDone(s, q.id) && !isAccepted(s, q.id) && unlocked(s, q));
}

/** Accepted, unfinished quests from this giver that are ready to hand in. */
export function turnInsFor(s, giver){
  return ZONE_QUESTS.filter(q => q.giver === giver && isAccepted(s, q.id) && !isDone(s, q.id) && progressOf(s, q).done);
}

/** Everything the player is currently carrying, for the quest log. */
export function activeQuests(s){
  return ZONE_QUESTS.filter(q => isAccepted(s, q.id) && !isDone(s, q.id));
}

export function accept(s, id){
  const q = ZONE_QUESTS.find(x => x.id === id);
  if (!q || isDone(s, id) || isAccepted(s, id) || !unlocked(s, q)) return { ok: false };
  s.zoneQuests.accepted.push(id);
  return { ok: true, quest: q };
}

/**
 * Hand a quest in. Consumes gather materials, marks it done and returns the reward to apply.
 * Deliberately does NOT touch gold/xp/cards itself — that is game.js's job, and keeping this
 * module free of engine calls is what lets it stay pure and testable.
 */
export function turnIn(s, id){
  const q = ZONE_QUESTS.find(x => x.id === id);
  if (!q || !isAccepted(s, id) || isDone(s, id)) return { ok: false, err: "not active" };
  if (!progressOf(s, q).done) return { ok: false, err: "incomplete" };
  if (q.objective.kind === "gather"){
    s.inventory[q.objective.id] = (s.inventory[q.objective.id] || 0) - q.objective.n;
    if (s.inventory[q.objective.id] <= 0) delete s.inventory[q.objective.id];
  }
  s.zoneQuests.accepted = s.zoneQuests.accepted.filter(x => x !== id);
  s.zoneQuests.done.push(id);
  return { ok: true, quest: q, reward: q.reward };
}
