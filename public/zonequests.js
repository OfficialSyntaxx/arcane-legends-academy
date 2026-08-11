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

  // ---- Lake Arcanum (WORLDSPEC step 6, second content zone) ----
  // The lake gates on the forest: `shores` requires the Cinder Wyrm, so a player arrives here
  // having finished the forest chain rather than wandering in at level 1 and meeting a level-14
  // boss. The gate is on the FIRST lake quest only — once you are here, the zone is yours.
  {
    id: "shores",
    zone: "lake_arcanum",
    giver: "lake_hermit",
    title: "The Silver Shore",
    brief: "The lake gives up silver when it is calm. Bring me some and I will tell you what sank here.",
    objective: { kind: "gather", id: "silver", n: 10 },
    reward: { gold: 420, xp: 260 },
    requires: ["wyrm"],
  },
  {
    id: "deepcatch",
    zone: "lake_arcanum",
    giver: "lake_hermit",
    title: "Deep Catch",
    brief: "There are sharks under the far shelf. Land four and the barge crews will believe you.",
    objective: { kind: "gather", id: "raw_shark", n: 4 },
    reward: { gold: 480, xp: 300 },
    requires: ["shores"],
  },
  {
    id: "vaultmouth",
    zone: "lake_arcanum",
    giver: "lake_diver",
    title: "What the Water Took",
    brief: "There is a vault down there the lake swallowed. Get inside and put down whatever is still moving.",
    objective: { kind: "slay", dungeon: "drowned_vault", n: 4 },
    reward: { gold: 520, xp: 340 },
    requires: ["shores"],
  },
  {
    id: "reliquary",
    zone: "lake_arcanum",
    giver: "lake_diver",
    title: "The Reliquary",
    brief: "The wardens guard a side room. Whatever they are guarding, I want the room empty.",
    objective: { kind: "clear", dungeon: "drowned_vault", room: "reliquary" },
    reward: { gold: 600, xp: 400 },
    requires: ["vaultmouth"],
  },
  {
    id: "archon",
    zone: "lake_arcanum",
    giver: "lake_diver",
    title: "The Drowned Archon",
    brief: "Something at the bottom keeps the water black. Finish it and the lake clears.",
    objective: { kind: "boss", dungeon: "drowned_vault" },
    reward: { gold: 1400, xp: 1000, cards: 3 },
    requires: ["vaultmouth"],
  },

  // ---- Ashen Mountains (WORLDSPEC step 6, third content zone) ----
  // Gated on the Drowned Archon, same reasoning as the lake gating on the Cinder Wyrm: a player
  // who can reach these ore veins has already cleared two dungeons, so the level-12 Ember Wyrm at
  // the bottom of Ashen Caverns is a real step up rather than a wall met on arrival.
  {
    id: "ore_run",
    zone: "ashen_mountains",
    giver: "mountain_miner",
    title: "The Ore Run",
    brief: "Iron doesn't dig itself out of ash. Bring me twelve pieces and I'll cut you in on the smelter's rate.",
    objective: { kind: "gather", id: "iron", n: 12 },
    reward: { gold: 560, xp: 380 },
    requires: ["archon"],
  },
  {
    id: "gold_seam",
    zone: "ashen_mountains",
    giver: "mountain_miner",
    title: "The Gold Seam",
    brief: "There's a seam of gold under the ridge that the last crew never finished. Six pieces and it's yours to boast about.",
    objective: { kind: "gather", id: "gold", n: 6 },
    reward: { gold: 640, xp: 420 },
    requires: ["ore_run"],
  },
  {
    id: "cindercleave",
    zone: "ashen_mountains",
    giver: "mountain_smith",
    title: "Cindercleave",
    brief: "Skeletons keep dragging ore off the carts before it reaches the forge. Put six of them down.",
    objective: { kind: "slay", dungeon: "ashen_caverns", n: 6 },
    reward: { gold: 700, xp: 480 },
    requires: ["archon"],
  },
  {
    id: "deepmines",
    zone: "ashen_mountains",
    giver: "mountain_smith",
    title: "The Deep Mines",
    brief: "There's a chamber past the forge nobody's cleared since the wyrm moved in. Make it safe.",
    objective: { kind: "clear", dungeon: "ashen_caverns", room: "deepmines" },
    reward: { gold: 780, xp: 540 },
    requires: ["cindercleave"],
  },
  {
    id: "ember_wyrm",
    zone: "ashen_mountains",
    giver: "mountain_smith",
    title: "The Ember Wyrm",
    brief: "The thing nesting in the forge chamber is why the mountain never cools. End it and the mines are ours again.",
    objective: { kind: "boss", dungeon: "ashen_caverns" },
    reward: { gold: 1600, xp: 1200, cards: 3 },
    requires: ["cindercleave"],
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

/**
 * Display names for the dungeons quests refer to. Kept here rather than read from dungeons.json
 * so this module stays pure and synchronous; `validateQuests` asserts the two agree.
 */
export const DUNGEON_NAMES = {
  cinderhollow_caverns: "Cinderhollow Caverns",
  drowned_vault: "the Drowned Vault",
  ashen_caverns: "Ashen Caverns",
};
const dungeonName = id => DUNGEON_NAMES[id] || id;

/** A one-line description of what the objective asks for. */
export function objectiveText(q, materialName){
  const o = q.objective;
  if (o.kind === "gather") return `Gather ${o.n} × ${materialName || o.id}`;
  // Named from the quest's own dungeon. This used to say "the caverns" unconditionally, which was
  // fine while one dungeon existed and became a lie the moment a second one shipped.
  if (o.kind === "slay") return `Defeat ${o.n} creatures in ${dungeonName(o.dungeon)}`;
  if (o.kind === "boss") return `Defeat the boss of ${dungeonName(o.dungeon)}`;
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

/**
 * Problems with the quest table, human-readable — same contract as validateZone/validateDungeon.
 * Catches the things that break a chain silently: a prerequisite that does not exist, a cycle
 * (nothing in the chain would ever unlock), a quest pointing at a zone or dungeon that is not
 * real, and an unnamed dungeon (which would surface to the player as a raw id).
 */
export function validateQuests(opts = {}){
  const problems = [];
  const byId = new Map();
  for (const q of ZONE_QUESTS){
    if (byId.has(q.id)) problems.push(`duplicate quest id "${q.id}"`);
    byId.set(q.id, q);
    if (!q.giver) problems.push(`${q.id}: no giver`);
    if (!q.reward || !(q.reward.gold > 0)) problems.push(`${q.id}: no reward`);
    for (const r of q.requires || []) if (!ZONE_QUESTS.some(x => x.id === r))
      problems.push(`${q.id}: requires "${r}", which is not a quest`);
    const o = q.objective;
    if (o.dungeon && !DUNGEON_NAMES[o.dungeon]) problems.push(`${q.id}: dungeon "${o.dungeon}" has no display name`);
    if (opts.zoneIds && !opts.zoneIds.includes(q.zone)) problems.push(`${q.id}: zone "${q.zone}" does not exist`);
    if (opts.dungeonIds && o.dungeon && !opts.dungeonIds.includes(o.dungeon))
      problems.push(`${q.id}: dungeon "${o.dungeon}" does not exist`);
    if (opts.dungeonRooms && o.kind === "clear" && !(opts.dungeonRooms[o.dungeon] || []).includes(o.room))
      problems.push(`${q.id}: room "${o.room}" is not in ${o.dungeon}`);
    if (opts.gatherable && o.kind === "gather" && !opts.gatherable.includes(o.id))
      problems.push(`${q.id}: asks for "${o.id}", which cannot be gathered anywhere`);
  }
  // reachability: walk from the quests with no prerequisites
  const done = new Set();
  let grew = true;
  while (grew){
    grew = false;
    for (const q of ZONE_QUESTS){
      if (done.has(q.id)) continue;
      if ((q.requires || []).every(r => done.has(r))){ done.add(q.id); grew = true; }
    }
  }
  for (const q of ZONE_QUESTS) if (!done.has(q.id))
    problems.push(`${q.id} can never be unlocked (its prerequisite chain is unsatisfiable or cyclic)`);
  return problems;
}
