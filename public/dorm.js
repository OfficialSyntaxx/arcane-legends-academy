// dorm.js — the player's dorm room: an interior you walk into, furnish, and display things in.
//
// PURE (no THREE, no DOM), like terrain.js / dungeons.js / academy.js, so tools/test.mjs can
// validate every layout, every placement rule and every derived display headlessly.
//
// WHY THIS EXISTS: before this module the "Student Dorms" building was a menu. Its station prompt
// jumped straight to `screen="home"`, which is a stats page plus four numeric upgrade tracks
// (`HOME_UPGRADES` in items.js). Nothing about it was a place. This module makes the dorm a real
// interior — compiled to the same ZONE shape `world.js` already renders, exactly the way a
// dungeon is (see dungeons.js) — and gives it furniture, display cases and trophies.
//
// THE DERIVED-STATE RULE (the one that keeps biting us — see onboarding.js / zonequests.js /
// academy.js): the save stores only what the player CHOSE. What they have EARNED is recomputed
// from the save on every read. So `S.home.furniture` is a slot -> item-id map and
// `S.home.cases` is a slot -> card-uid map; the grade, serial, name and value of a displayed
// slab are looked up live, and a trophy is never stored at all — it is derived from
// `S.worldState.dungeons[...].bossDead`. Sell the card and its case empties itself.
//
// SIZING: 1 unit = 1 metre and CHARACTER_HEIGHT is 2.6, so a room the player does not feel
// cramped in starts at 16x14 and grows with the upgrade tiers (D4).

import { layoutDungeon, dungeonZone } from "./dungeons.js";

// ---------------------------------------------------------------- room tiers (D4)
//
// The four HOME_UPGRADES tracks already existed as pure numbers on a progress bar. Rather than
// invent a fifth currency, the room's SIZE and its number of furniture slots are derived from the
// total levels the player has already bought — so the bars they have been filling all along now
// have a physical readout.
export const TIERS = [
  { id: "bare",     name: "Bare Quarters",    minLevels: 0,  w: 16, d: 14, slots: 4,  wall: 0x4a4160, floor: 0x3f3550 },
  { id: "furnished",name: "Furnished Room",   minLevels: 4,  w: 20, d: 17, slots: 7,  wall: 0x54496e, floor: 0x453a5c },
  { id: "study",    name: "Scholar's Study",  minLevels: 9,  w: 24, d: 20, slots: 10, wall: 0x5d5080, floor: 0x4b3f66 },
  { id: "chambers", name: "Archmage Chambers",minLevels: 15, w: 28, d: 23, slots: 14, wall: 0x6a5b9e, floor: 0x53456f },
];

/** Total upgrade levels bought across every HOME_UPGRADES track. 0 when the hall is not owned. */
export function upgradeLevels(save){
  const home = (save && save.home) || {};
  if (!home.owned) return 0;
  return Object.values(home.upgrades || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function tierFor(save){
  const lv = upgradeLevels(save);
  let out = TIERS[0];
  for (const t of TIERS) if (lv >= t.minLevels) out = t;
  return out;
}

/** How far the player is from the next tier — null once the top tier is reached. */
export function progressToNextTier(save){
  const lv = upgradeLevels(save);
  const next = TIERS.find(t => t.minLevels > lv);
  if (!next) return { maxed: true, pct: 100 };
  const prev = tierFor(save);
  const span = next.minLevels - prev.minLevels;
  return { maxed: false, next, have: lv, need: next.minLevels,
           pct: Math.round(((lv - prev.minLevels) / span) * 100) };
}

// ---------------------------------------------------------------- furniture catalogue (D2)
//
// `kind` is the slot type a piece needs. A bed cannot go in a wall alcove and a display case
// cannot stand in the middle of the floor, and that rule is enforced here rather than trusted to
// the UI — the UI is the one thing a determined player can bypass.
//
// Every piece is PROCEDURAL: `shape` tells world.js which primitive to build. No new GLB bytes,
// which is the same call terrain painting and the spell VFX made.
export const FURNITURE = [
  { id: "bed",       name: "Straw Bed",        icon: "🛏️", kind: "floor", gold: 60,  timber: 2,
    shape: "bed",    w: 2.0, d: 3.4, h: 0.9, color: 0x7a5a6a },
  { id: "desk",      name: "Study Desk",       icon: "🪑", kind: "floor", gold: 90,  timber: 3,
    shape: "desk",   w: 2.4, d: 1.2, h: 1.1, color: 0x8a6a3a },
  { id: "rug",       name: "Woven Rug",        icon: "🧶", kind: "floor", gold: 45,  timber: 0,
    shape: "rug",    w: 3.2, d: 2.4, h: 0.04, color: 0x8a3a2a },
  { id: "brazier",   name: "Arcane Brazier",   icon: "🔥", kind: "floor", gold: 130, timber: 1,
    shape: "brazier",w: 0.9, d: 0.9, h: 1.4, color: 0x5a4a8a,
    light: { color: 0xff9440, intensity: 1.5, distance: 22, y: 1.7 } },
  { id: "bookshelf", name: "Bookshelf",        icon: "📚", kind: "wall",  gold: 120, timber: 4,
    shape: "shelf",  w: 2.6, d: 0.6, h: 2.4, color: 0x4a3a2a },
  { id: "banner",    name: "School Banner",    icon: "🚩", kind: "wall",  gold: 70,  timber: 1,
    shape: "banner", w: 1.6, d: 0.15, h: 3.0, color: null },   // null = takes the player's school colour
  { id: "sconce",    name: "Wall Sconce",      icon: "🕯️", kind: "wall",  gold: 55,  timber: 0,
    shape: "sconce", w: 0.4, d: 0.4, h: 0.8, color: 0x6a5b9e,
    light: { color: 0xffc94d, intensity: 1.1, distance: 16, y: 2.4 } },
  { id: "case",      name: "Slab Display Case",icon: "🏆", kind: "case",  gold: 180, timber: 3,
    shape: "case",   w: 1.2, d: 0.8, h: 2.0, color: 0x2a1f4d },
];
export const FURNITURE_MAP = Object.fromEntries(FURNITURE.map(f => [f.id, f]));

// ---------------------------------------------------------------- slots
//
// Slots are authored as FRACTIONS of the room, not absolute metres, so the same table works at
// every tier — the room grows, the furniture spreads out with it, and nothing has to be re-placed
// when an upgrade is bought. Wall slots sit just inside their wall and face inward.
//
// Order matters: `tier.slots` takes the first N, so the earliest entries are the ones a player
// with a bare room gets. Bed and desk first, decoration later, trophies last.
const SLOT_TABLE = [
  { id: "floor_a", kind: "floor", fx: -0.26, fz:  0.24, ry: 0 },
  { id: "wall_a",  kind: "wall",  side: "n",  fx: -0.22 },
  { id: "floor_b", kind: "floor", fx:  0.26, fz:  0.22, ry: Math.PI },
  { id: "wall_b",  kind: "wall",  side: "e",  fx:  0.10 },
  { id: "floor_c", kind: "floor", fx:  0.00, fz: -0.06, ry: 0 },
  { id: "case_a",  kind: "case",  side: "n",  fx:  0.18 },
  { id: "wall_c",  kind: "wall",  side: "w",  fx: -0.14 },
  { id: "case_b",  kind: "case",  side: "n",  fx:  0.32 },
  { id: "floor_d", kind: "floor", fx: -0.30, fz: -0.24, ry: Math.PI / 2 },
  { id: "wall_d",  kind: "wall",  side: "e",  fx: -0.20 },
  { id: "case_c",  kind: "case",  side: "w",  fx:  0.18 },
  { id: "floor_e", kind: "floor", fx:  0.30, fz: -0.26, ry: -Math.PI / 2 },
  { id: "wall_e",  kind: "wall",  side: "w",  fx:  0.30 },
  { id: "case_d",  kind: "case",  side: "e",  fx:  0.26 },
];

// The door is in the SOUTH wall, so nothing may be placed across it — see `dormRoom`.
export const DOOR_WIDTH = 4.0;
const WALL_INSET = 0.7;

/** The room rectangle for a save's tier, centred on the origin of its own interior zone. */
export function dormRoom(save){
  const t = tierFor(save);
  return { id: "dorm", x: 0, z: 0, w: t.w, d: t.d, tier: t };
}

/**
 * Every slot the player currently has, resolved to world coordinates inside the room.
 *
 * A slot the tier has not unlocked yet is simply absent, which is what makes buying an upgrade
 * feel like it did something: the room grows AND gains places to put things.
 */
export function slotsFor(save){
  const room = dormRoom(save);
  const n = room.tier.slots;
  const half = { x: room.w / 2, z: room.d / 2 };
  return SLOT_TABLE.slice(0, n).map(s => {
    if (s.kind === "floor"){
      return { id: s.id, kind: s.kind, x: room.x + s.fx * room.w, z: room.z + s.fz * room.d, ry: s.ry || 0 };
    }
    // wall / case: pinned to a side, offset along it, facing into the room
    switch (s.side){
      case "n": return { id: s.id, kind: s.kind, x: room.x + s.fx * room.w, z: room.z + half.z - WALL_INSET, ry: Math.PI };
      case "s": return { id: s.id, kind: s.kind, x: room.x + s.fx * room.w, z: room.z - half.z + WALL_INSET, ry: 0 };
      case "e": return { id: s.id, kind: s.kind, x: room.x + half.x - WALL_INSET, z: room.z + s.fx * room.d, ry: -Math.PI / 2 };
      default:  return { id: s.id, kind: s.kind, x: room.x - half.x + WALL_INSET, z: room.z + s.fx * room.d, ry: Math.PI / 2 };
    }
  });
}

export function slotById(save, slotId){ return slotsFor(save).find(s => s.id === slotId) || null; }

// ---------------------------------------------------------------- placement (D2)

/** What the player owns but has not placed, as `{id, count}`. */
export function unplaced(save){
  const owned = (save.home && save.home.owned && save.home.stock) || {};
  const placed = Object.values((save.home && save.home.furniture) || {});
  const out = [];
  for (const f of FURNITURE){
    const have = Number(owned[f.id]) || 0;
    const used = placed.filter(id => id === f.id).length;
    if (have - used > 0) out.push({ id: f.id, count: have - used });
  }
  return out;
}

/**
 * Why a placement would be rejected, or null if it is legal. A list of reasons would be nicer
 * for a form, but placement is a single action with a single failure, so one reason is enough —
 * and it keeps the caller honest about showing it.
 */
export function placementProblem(save, slotId, itemId){
  if (!save.home || !save.home.owned) return "you do not own a dorm yet";
  const item = FURNITURE_MAP[itemId];
  if (!item) return `no such furniture "${itemId}"`;
  const slot = slotById(save, slotId);
  if (!slot) return `no such slot "${slotId}" at this dorm tier`;
  if (slot.kind !== item.kind) return `${item.name} needs a ${item.kind} slot, not a ${slot.kind} one`;
  if ((save.home.furniture || {})[slotId]) return "that slot is already taken";
  if (!unplaced(save).some(u => u.id === itemId)) return `you have no unplaced ${item.name}`;
  return null;
}

/** Buy a piece into the player's stock. Gold and timber only — the same sinks the hall uses. */
export function buyFurniture(save, itemId){
  const item = FURNITURE_MAP[itemId];
  if (!item) return { ok: false, err: "unknown" };
  if (!save.home || !save.home.owned) return { ok: false, err: "nohome" };
  if (save.gold < item.gold) return { ok: false, err: "gold" };
  if ((save.inventory.oak_log || 0) < item.timber) return { ok: false, err: "timber" };
  save.gold -= item.gold;
  save.inventory.oak_log -= item.timber;
  save.home.stock = save.home.stock || {};
  save.home.stock[itemId] = (save.home.stock[itemId] || 0) + 1;
  return { ok: true, item };
}

export function place(save, slotId, itemId){
  const problem = placementProblem(save, slotId, itemId);
  if (problem) return { ok: false, err: problem };
  save.home.furniture = save.home.furniture || {};
  save.home.furniture[slotId] = itemId;
  return { ok: true };
}

/** Take a piece back into stock. Emptying a case does NOT eject the card — see `displayIn`. */
export function unplace(save, slotId){
  const f = (save.home && save.home.furniture) || {};
  if (!f[slotId]) return { ok: false, err: "empty" };
  delete f[slotId];
  if (save.home.cases) delete save.home.cases[slotId];
  return { ok: true };
}

// ---------------------------------------------------------------- display cases (D3)
//
// The pull here is that nothing new has to be tracked: grading already mints slabs with unique
// serials. A case stores ONLY the card's uid. Everything shown — name, grade, serial, value — is
// read from the live card, so selling a displayed slab empties its case instead of leaving a
// ghost of a card the player no longer owns.

/** Slabs eligible for display: graded, and graded well enough to have been slabbed. */
export function displayable(save, gradeOf){
  return (save.cards || []).filter(c => c.graded && c.serial != null)
    .map(c => ({ uid: c.uid, id: c.id, serial: c.serial, roll: c.roll,
                 grade: gradeOf ? gradeOf(c.roll) : null }))
    .sort((a, b) => b.roll - a.roll);
}

export function displayProblem(save, slotId, uid){
  const item = ((save.home && save.home.furniture) || {})[slotId];
  if (item !== "case") return "that slot does not hold a display case";
  const card = (save.cards || []).find(c => c.uid === uid);
  if (!card) return "you do not own that card";
  if (!card.graded || card.serial == null) return "only slabbed cards can be displayed";
  const cases = (save.home && save.home.cases) || {};
  for (const [sid, u] of Object.entries(cases)) if (u === uid && sid !== slotId) return "that slab is already in another case";
  return null;
}

export function displayIn(save, slotId, uid){
  const problem = displayProblem(save, slotId, uid);
  if (problem) return { ok: false, err: problem };
  save.home.cases = save.home.cases || {};
  save.home.cases[slotId] = uid;
  return { ok: true };
}

export function clearCase(save, slotId){
  if (!save.home || !save.home.cases || !save.home.cases[slotId]) return { ok: false, err: "empty" };
  delete save.home.cases[slotId];
  return { ok: true };
}

/**
 * What each case actually shows RIGHT NOW. Cases whose card has been sold, or whose case
 * furniture has been removed, resolve to empty rather than to a stale snapshot.
 */
export function caseContents(save, gradeOf){
  const furniture = (save.home && save.home.furniture) || {};
  const cases = (save.home && save.home.cases) || {};
  return slotsFor(save).filter(s => furniture[s.id] === "case").map(s => {
    const uid = cases[s.id];
    const card = uid && (save.cards || []).find(c => c.uid === uid);
    const live = card && card.graded && card.serial != null;
    return { slot: s.id, x: s.x, z: s.z, ry: s.ry,
             card: live ? { uid: card.uid, id: card.id, serial: card.serial, roll: card.roll,
                            grade: gradeOf ? gradeOf(card.roll) : null } : null };
  });
}

// ---------------------------------------------------------------- trophies (D3)
//
// Pure derivation: a trophy is not stored anywhere. It exists because the save says the boss is
// dead. That means a trophy can never desync from the world, and no migration is needed for it.
export const TROPHIES = [
  { id: "cinder_wyrm", dungeon: "cinderhollow_caverns", name: "Cinder Wyrm Skull", icon: "🐲",
    color: 0x8a3a2a, h: 1.8 },
  { id: "ember_wyrm", dungeon: "ashen_caverns", name: "Ember Wyrm Skull", icon: "🔥",
    color: 0xc45a1e, h: 2.0 },
];

export function trophiesFor(save){
  const dungeons = (save.worldState && save.worldState.dungeons) || {};
  return TROPHIES.filter(t => dungeons[t.dungeon] && dungeons[t.dungeon].bossDead);
}

/**
 * Where each earned trophy stands: along the back wall, spread evenly, behind the furniture.
 *
 * Trophies stand in the CORNERS, working inward from the back of the room. Two earlier attempts
 * put them along the centre line and then along the back wall; the first render showed the first
 * standing between the player and the door like an obstruction, and the second sitting on top of
 * the bed. The corners are the only band no slot in SLOT_TABLE reaches (wall slots stop at
 * ±0.32·w), so a trophy can never land on furniture however the room is arranged — which is why
 * `trophiesDoNotCollide` is a test rather than a hope.
 */
const TROPHY_INSET = 1.4;
export function trophyPlacements(save){
  const room = dormRoom(save);
  const earned = trophiesFor(save);
  return earned.map((t, i) => {
    const row = Math.floor(i / 2);                       // 0 = back corners, 1 = the row in front
    const side = i % 2 ? 1 : -1;
    return { ...t,
      x: room.x + side * (room.w / 2 - TROPHY_INSET),
      z: room.z + room.d / 2 - TROPHY_INSET - row * 3.0,
      ry: Math.PI };
  });
}

// ---------------------------------------------------------------- the resolved layout

/**
 * Everything that should be rendered inside the dorm, in world coordinates. `world.js` reads
 * this and builds primitives; it decides nothing about position, exactly like the dungeon path.
 */
export function layoutFor(save, opts = {}){
  const furniture = (save.home && save.home.furniture) || {};
  const pieces = [];
  for (const slot of slotsFor(save)){
    const item = FURNITURE_MAP[furniture[slot.id]];
    if (!item) continue;
    pieces.push({ slot: slot.id, id: item.id, shape: item.shape, kind: item.kind,
                  w: item.w, d: item.d, h: item.h, ry: slot.ry,
                  x: slot.x, z: slot.z,
                  color: item.color != null ? item.color : (opts.schoolColor || 0x6a5b9e),
                  light: item.light || null });
  }
  return { room: dormRoom(save), pieces,
           cases: caseContents(save, opts.gradeOf), trophies: trophyPlacements(save) };
}

// ---------------------------------------------------------------- the zone (D1)

/**
 * Compile the dorm into the ZONE shape world.js already renders.
 *
 * This is the same trick dungeons.js plays, and deliberately reuses its machinery rather than
 * repeating it: `layoutDungeon` computes the wall segments (including the gap the corridor punches
 * for the door) and `dungeonZone` turns rooms into floors, walls and collision boxes. A dorm is
 * therefore a one-room dungeon with no enemies — which means zone transitions, saved position,
 * interior lighting and camera collision all work here for free, with no new engine code.
 *
 * The doorway is a stub corridor running south out of the room; it exists purely so the south
 * wall is emitted in two pieces with a gap between them, instead of one solid box that would seal
 * the player in. (That failure mode is precisely why wallsForRoom splits walls at all.)
 */
export function dormZone(save, opts = {}){
  const room = dormRoom(save);
  const PORCH_DEPTH = 10, DOOR_GAP = 3;
  // Porch centre, laid out so the corridor between the two rooms is exactly DOOR_GAP long.
  const porchZ = room.z - room.d / 2 - DOOR_GAP - PORCH_DEPTH / 2;
  const raw = {
    id: "dorm",
    name: (opts.name || "Your Dorm") + " — " + room.tier.name,
    wallHeight: 6,
    corridorWidth: DOOR_WIDTH,
    margin: 14,
    entranceZone: opts.entranceZone || "academy",
    rooms: [
      { id: "dorm", x: room.x, z: room.z, w: room.w, d: room.d },
      // The porch is a real (small) room south of the dorm, so `corridorBetween` has two
      // rectangles to bridge — that bridge is what punches the doorway through the south wall.
      // The player arrives at its north end and walks in; the way out is at its south end.
      { id: "porch", x: room.x, z: porchZ, w: DOOR_WIDTH + 2, d: PORCH_DEPTH },
    ],
    connections: [{ from: "dorm", to: "porch", width: DOOR_WIDTH }],
    spawnRoom: "porch",
    spawn: { x: room.x, z: porchZ + PORCH_DEPTH / 2 - 2 },
  };
  // dungeonZone insists on a boss room (validateDungeon does, at least) but the compile itself
  // does not, and a dorm has no enemies at all — so nothing here fabricates one.
  const z = dungeonZone(layoutDungeon(raw));
  z.name = raw.name;
  // The compiled exit is placed for a dungeon's geometry, which does not fit here: it would land
  // outside the porch, behind its south wall. Place it at the porch's south end instead, far
  // enough from the arrival point that the player does not spawn inside their own way out and
  // bounce straight back to the academy (the ping-pong case validateExits exists to catch).
  z.exits = [{ toZone: raw.entranceZone, x: room.x, z: porchZ - PORCH_DEPTH / 2 + 2 }];
  z.dorm = true;
  z.background = opts.background || 0x2a2340;
  // A dorm is an interior but NOT a cave. The dungeon light rig assumes every room ships torches;
  // a bare dorm ships none, so inheriting it gives a first-time player a black box with a bed
  // somewhere in it. The room asks for a warm, lit interior instead — verified by rendering it,
  // because "is this room visible" is not a thing a unit test can answer.
  z.lightScale = 5.0;
  z.lightTint = 0xffd9b0;
  // Furniture, cases and trophies are handed over as a resolved layout. world.js builds
  // primitives from it; it never consults dorm.js for a position.
  z.dormLayout = layoutFor(save, opts);
  // Every piece of furniture with a footprint is a collision box, or the player walks through
  // their own bed. Rugs are flat, so they are deliberately excluded.
  for (const p of z.dormLayout.pieces){
    if (p.shape === "rug") continue;
    z.obstacles.push({ kind: "box", x: p.x, z: p.z, w: p.w + 0.3, d: p.d + 0.3, ry: 0, id: "furn:" + p.slot });
  }
  // Trophies are solid too — a prize the player walks straight through is not on a plinth.
  for (const t of z.dormLayout.trophies) z.obstacles.push({ kind: "circle", x: t.x, z: t.z, r: 1.0, id: "trophy:" + t.id });
  return z;
}

/** Problems with the dorm's own configuration. Same contract as validateDungeon: a list. */
export function validateDorm(){
  const problems = [];
  const kinds = new Set(SLOT_TABLE.map(s => s.kind));
  for (const f of FURNITURE){
    if (!kinds.has(f.kind)) problems.push(`furniture "${f.id}" needs a "${f.kind}" slot, but no slot of that kind exists`);
    if (!(f.gold > 0)) problems.push(`furniture "${f.id}" has no price`);
  }
  const ids = new Set();
  for (const s of SLOT_TABLE){
    if (ids.has(s.id)) problems.push(`duplicate slot id "${s.id}"`);
    ids.add(s.id);
  }
  // Every tier must offer at least one slot of every kind the catalogue can fill, or a player
  // could buy a display case at a tier that has nowhere to put it.
  const top = TIERS[TIERS.length - 1];
  for (const k of kinds){
    if (!SLOT_TABLE.slice(0, top.slots).some(s => s.kind === k))
      problems.push(`no "${k}" slot is reachable even at the top tier`);
  }
  for (let i = 1; i < TIERS.length; i++){
    if (TIERS[i].minLevels <= TIERS[i - 1].minLevels) problems.push(`tier "${TIERS[i].id}" does not require more levels than the one before it`);
    if (TIERS[i].slots <= TIERS[i - 1].slots) problems.push(`tier "${TIERS[i].id}" does not add slots`);
    if (TIERS[i].w <= TIERS[i - 1].w || TIERS[i].d <= TIERS[i - 1].d) problems.push(`tier "${TIERS[i].id}" is not larger than the one before it`);
  }
  if (SLOT_TABLE.length < top.slots) problems.push("the top tier promises more slots than SLOT_TABLE defines");
  // A slot must not sit in the doorway, or its furniture seals the only way out.
  for (const t of TIERS){
    const room = { w: t.w, d: t.d };
    for (const s of SLOT_TABLE.slice(0, t.slots)){
      if (s.kind !== "floor" && s.side === "s") problems.push(`slot "${s.id}" is on the south wall, which holds the door`);
      if (s.kind === "floor"){
        const z = s.fz * room.d;
        if (Math.abs(s.fx * room.w) < DOOR_WIDTH / 2 && z < -room.d / 2 + 2.5)
          problems.push(`slot "${s.id}" blocks the doorway at tier "${t.id}"`);
      }
    }
  }
  return problems;
}
