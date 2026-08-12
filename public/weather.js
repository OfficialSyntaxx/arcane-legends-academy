// weather.js — dynamic weather (BACKLOG §3 "Weather").
//
// PURE (no THREE, no DOM, no game.js). Same "derive from wall-clock time, no server" shape as
// world.js's day/night cycle, seasons.js's seasons, and worldevents.js's dynamic events — this
// game has no persistent server, so weather can't be pushed live; it has to be something every
// client derives identically from the real clock, with nothing to synchronise.
//
// PURELY ATMOSPHERIC BY DESIGN (no gameplay effect) — unlike Dynamic world events, which
// deliberately DOES touch gather() with a real bonus. Weather changing gather rates or visibility
// would double up on that mechanic under a different name; this stays a mood change: rain, a
// darker sky, dimmer light, same "shadows and depth, lighting" spirit the day/night cycle shipped
// under, just weather-flavoured instead of time-of-day-flavoured.

export const WEATHER_INTERVAL_MS = 15 * 60 * 1000;   // a new roll every 15 real minutes, per zone
export const RAIN_CHANCE = 0.3;

// Same tiny deterministic hash worldevents.js uses. Duplicated on purpose rather than shared —
// each of these small time-derived modules stays a standalone, independently-testable unit with
// no cross-imports, the same low-coupling shape this project's other pure modules already follow.
function hash01(str){
  let h = 2166136261;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Is it raining in this zone right now? `now` is injectable for tests. */
export function isRaining(zoneId, now = Date.now()){
  if (!zoneId) return false;
  const slot = Math.floor(now / WEATHER_INTERVAL_MS);
  return hash01(`${zoneId}:weather:${slot}`) < RAIN_CHANCE;
}

export function validateWeather(){
  const problems = [];
  if (!(RAIN_CHANCE > 0 && RAIN_CHANCE < 1)) problems.push("RAIN_CHANCE must be in (0,1)");
  if (!(WEATHER_INTERVAL_MS > 0)) problems.push("WEATHER_INTERVAL_MS must be positive");
  return problems;
}
