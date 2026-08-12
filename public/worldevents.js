// worldevents.js — dynamic world events (BACKLOG §3 "Dynamic world events").
//
// PURE (no THREE, no DOM, no game.js), like seasons.js's neighbours.
//
// SAME CONSTRAINT AS SEASONS/DAY-NIGHT: this game has no persistent server, so an "event" cannot
// be pushed live — it has to be something every client can derive identically from wall-clock
// time, the same "derive from Date.now(), not a stored counter" rule world.js's day/night cycle
// and seasons.js's seasons both already follow.
//
// THE SHAPE: time is sliced into EVENT_INTERVAL_MS windows (20 minutes — the same cadence the
// day/night cycle uses, so a player already has a mental model for "things change roughly this
// often"). Each window, per zone, is either quiet or hosts a "Bountiful Harvest" on one of that
// zone's own gatherable materials — deterministically decided by hashing the zone id and the
// window number, so every tab/player agrees on the same event at the same real moment with
// nothing to synchronise. `game.js gather()` reads the result to grant a guaranteed bonus unit
// while the event for THAT material is live — see its own comment for why this reuses the exact
// `extra` field "Husbandry" (a lesson mastery) already adds, rather than a second bonus system.

export const EVENT_INTERVAL_MS = 20 * 60 * 1000;   // matches the day/night cycle's own cadence
export const EVENT_CHANCE = 0.4;                    // fraction of windows that host an event at all

// A tiny deterministic string hash -> [0,1). Not cryptographic, doesn't need to be — this only
// needs to be a stable, evenly-distributed function of (zone, time window), not unpredictable.
function hash01(str){
  let h = 2166136261;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * The active event for a zone right now, or null. `materialIds` is that zone's own gatherable
 * material ids (from its resourceNodes) — the event can only ever pick something actually in
 * that zone, so it's never a tease for a material that isn't there. `now` is injectable for tests.
 */
export function activeEventFor(zoneId, materialIds, now = Date.now()){
  if (!zoneId || !materialIds || !materialIds.length) return null;
  const slot = Math.floor(now / EVENT_INTERVAL_MS);
  const slotKey = `${zoneId}:${slot}`;
  if (hash01(slotKey) >= EVENT_CHANCE) return null;
  const pick = materialIds[Math.floor(hash01(slotKey + ":which") * materialIds.length)];
  const slotStart = slot * EVENT_INTERVAL_MS;
  return { materialId: pick, zoneId, until: slotStart + EVENT_INTERVAL_MS };
}

export function validateWorldEvents(){
  const problems = [];
  if (!(EVENT_CHANCE > 0 && EVENT_CHANCE <= 1)) problems.push("EVENT_CHANCE must be in (0,1]");
  if (!(EVENT_INTERVAL_MS > 0)) problems.push("EVENT_INTERVAL_MS must be positive");
  return problems;
}
