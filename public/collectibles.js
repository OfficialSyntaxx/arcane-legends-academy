// collectibles.js — rare, non-gameplay treasure-chest finds (BACKLOG §10 "Rare collectibles").
//
// PURE (no THREE, no DOM, no game.js), like items.js's neighbours.
//
// WHY TREASURE CHESTS, NOT DUNGEON BOSSES: every boss in this game dies exactly ONCE per save —
// `index.html`'s `recordDungeonKill` removes a defeated enemy from the world permanently, boss
// included, and `firstBossKill` gates the boss reward to that one moment (see game.js's own
// `TREASURE_REWARDS` neighbour). A %-chance drop off a one-time-ever event means most players
// would simply never see it, with no way to try again — that's a slot machine, not a rare find.
// The 12 hidden treasure caches (`game.js` `TREASURE_REWARDS`) are ALSO one-time-each, but there
// are twelve of them spread across every zone, so a flat per-claim chance gives a real, if
// unlikely, shot at finding one on any given cache without ever guaranteeing (or promising) all of
// them in one save — the same "rare, not rigged" feel `items.js`'s pristine finds have, just off
// a one-shot event instead of a repeatable one.
//
// WHY A SHARED POOL, NOT ONE COLLECTIBLE PER CACHE: pinning specific collectibles to specific
// caches would need a table kept in sync with `game.js` TREASURE_REWARDS (another id list that can
// drift, the exact trap `validateTreasures` in game.js already exists to catch for the reward
// table itself). A shared pool means this module never needs to know a treasure id exists at all —
// `game.js` calls `rollOnClaim` with nothing but the save and its own rng, and the catalog can grow
// with zero coordination.
//
// STORAGE: `s.collectibles` is an array of owned ids — a collectible is either found or not, so
// this is the same "set of ids" shape `favorites`/`worldState.treasuresFound` already use, not a
// count. Once every collectible in the pool is owned, `rollOnClaim` always returns null — nothing
// left to find, so no wasted rolls and no way to hold two of the same one.

export const DROP_CHANCE = 20;   // percent, per treasure claim, only while an unfound one remains

export const COLLECTIBLES = [
  { id: "ember_shard",   name: "Ember Shard",        icon: "🔥", desc: "Still warm, though it has been cold a thousand years. Ashen Mountains folklore says it never truly cools." },
  { id: "frost_locket",  name: "Frost Locket",       icon: "❄️", desc: "A locket from the Drowned Vault, sealed shut by ice that never melts, even held in the hand." },
  { id: "wyrm_scale",    name: "Cinder Wyrm Scale",  icon: "🐲", desc: "Shed, not cut — the wyrm sloughs a scale like this once a decade, and this one predates the caverns." },
  { id: "gilded_quill",  name: "Gilded Quill",       icon: "🪶", desc: "An old Academy scribe's tool, the nib still sharp. Whoever lost it wrote something worth keeping." },
  { id: "hollow_coin",   name: "Hollow Coin",        icon: "🪙", desc: "Minted by no kingdom anyone can name. It rings wrong when dropped — hollow, like the middle was never there." },
  { id: "starlit_shard", name: "Starlit Shard",      icon: "✨", desc: "Cool to the touch under any sky, but colder still by moonlight. Nobody has explained why." },
  { id: "runed_bone",    name: "Runed Bone",         icon: "🦴", desc: "Carved with a script that predates every school of magic taught at the Academy today." },
  { id: "sunken_key",    name: "Sunken Key",         icon: "🗝️", desc: "It opens nothing anyone has found. The lake gave it up all the same." },
];
export const COLLECTIBLE_MAP = Object.fromEntries(COLLECTIBLES.map(c => [c.id, c]));

const owned = s => (s && Array.isArray(s.collectibles)) ? s.collectibles : [];

/** Ids not yet found by this save. */
export function unfoundIds(s){
  const have = owned(s);
  return COLLECTIBLES.filter(c => !have.includes(c.id)).map(c => c.id);
}

/** Everything found so far, in catalog order (not find order — a Codex-style gallery, not a log). */
export function foundFor(s){
  const have = owned(s);
  return COLLECTIBLES.filter(c => have.includes(c.id));
}

export function collectionProgress(s){
  const have = owned(s).length;
  return { have, need: COLLECTIBLES.length, pct: Math.round((have / COLLECTIBLES.length) * 100), complete: have >= COLLECTIBLES.length };
}

/**
 * Roll for a rare find on a treasure claim. `rngFn` is the caller's own seeded rng (game.js's
 * `rng`, same one `gather()`'s pristine roll uses) so this stays deterministic under the same
 * replay rules as everything else in the engine. Mutates `s.collectibles` on a hit; returns the
 * collectible found, or null on a miss or once the pool is exhausted.
 */
export function rollOnClaim(s, rngFn){
  const remaining = unfoundIds(s);
  if (!remaining.length) return null;
  if (rngFn() * 100 >= DROP_CHANCE) return null;
  const pick = remaining[Math.floor(rngFn() * remaining.length)];
  if (!Array.isArray(s.collectibles)) s.collectibles = [];
  s.collectibles.push(pick);
  return COLLECTIBLE_MAP[pick];
}

export function validateCollectibles(){
  const problems = [];
  const ids = new Set();
  for (const c of COLLECTIBLES){
    if (ids.has(c.id)) problems.push(`duplicate collectible id "${c.id}"`);
    ids.add(c.id);
    if (!c.name || !c.icon || !c.desc) problems.push(`${c.id}: incomplete`);
  }
  if (!(DROP_CHANCE > 0 && DROP_CHANCE <= 100)) problems.push("DROP_CHANCE out of range");
  return problems;
}
