// archetypes.js — AI battle personalities, thematic enemy decks, and boss phases
// (BACKLOG §4 "enemy levels and archetypes", "better AI deck archetypes", "multi-phase bosses").
//
// PURE (no THREE, no DOM, no game.js, no cards.js), like lessons.js / dorm.js / codex.js.
//
// WHY: every AI opponent in the game — the seven QUESTS rivals, every dungeon monster, every
// open-world skeleton — played the identical strategy: play the highest-cost affordable card,
// cast a damage spell at whichever enemy creature had the least HP, then always attack face unless
// a taunt legally forced a trade. A level-3 Cinder Slime and a level-10 Cinder Wyrm boss differed
// only in their deck and their HP total; their BEHAVIOUR was one strategy wearing different decks.
//
// THE SPLIT: this module decides WHAT an archetype prefers, as data plus small pure decision
// functions over plain numbers. `game.js`'s `aiTurn` still owns the actual battle mutation
// (`playCard`/`attack`) — it asks this module "which of these choices does this personality make"
// and carries out the answer. Nothing here touches a battle object.
//
// BACKWARDS COMPATIBILITY: `midrange` is defined to reproduce the OLD unconditional behaviour
// exactly (descending cost, damage spells hit the weakest enemy creature, always attack face
// unless taunt forces a trade). `aiTurn(b)` with no archetype set still resolves to `midrange`, so
// every existing call site and every existing test keeps its old behaviour unchanged.

// ---------------------------------------------------------------- AI personalities

/**
 * `creatureOrder`: which end of the affordable hand to play first.
 * `faceBias`: how a damage spell chooses between an enemy creature and the enemy's face.
 *   "always"    — burn face regardless of what is on the board (Aggro: close the game out)
 *   "dominant"  — face only when this side's board is stronger than the opponent's (Tempo)
 *   "never"     — always spend removal on a creature when one exists (Control, Midrange)
 * `removalTarget`: which enemy creature a damage spell targets, when it targets a creature.
 *   "weakest"   — least HP (finish something off — the old, only behaviour)
 *   "strongest" — highest ATK (take out the biggest threat first — Control)
 * `tradeAggression`: how a creature attack picks between an enemy creature and the enemy's face.
 *   "always"    — race face whenever legal (the old, only behaviour)
 *   "favorable" — trade into an enemy creature it can kill without dying first, if one exists
 */
export const ARCHETYPES = {
  midrange: { name: "Midrange", creatureOrder: "desc", faceBias: "never",
              removalTarget: "weakest", tradeAggression: "always" },
  aggro:    { name: "Aggro",    creatureOrder: "asc",  faceBias: "always",
              removalTarget: "weakest", tradeAggression: "always" },
  control:  { name: "Control",  creatureOrder: "desc", faceBias: "never",
              removalTarget: "strongest", tradeAggression: "favorable" },
  tempo:    { name: "Tempo",    creatureOrder: "desc", faceBias: "dominant",
              removalTarget: "weakest", tradeAggression: "always" },
  boss:     { name: "Boss",     creatureOrder: "desc", faceBias: "never",
              removalTarget: "strongest", tradeAggression: "favorable" },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);
export function policyFor(id){ return ARCHETYPES[id] || ARCHETYPES.midrange; }

/** Order to try affordable creature/field/trap cards in, cheapest-first or priciest-first. */
export function orderCards(policy, playable){
  const dir = policy.creatureOrder === "asc" ? 1 : -1;
  return playable.slice().sort((a, b) => (a.cost - b.cost) * dir);
}

/**
 * Where a damage spell goes: a creature index, or "face".
 *
 * `enemyBoard` is `[{atk, hp}]`, index-aligned with the real board — this function never sees the
 * real battle object, only the numbers it needs, which is what keeps it callable from a test
 * without constructing a duel.
 */
export function pickSpellTarget(policy, enemyBoard, ownPower, enemyPower){
  const hasTargets = enemyBoard && enemyBoard.length > 0;
  if (!hasTargets) return "face";
  if (policy.faceBias === "always") return "face";
  if (policy.faceBias === "dominant" && ownPower > enemyPower) return "face";
  const pick = policy.removalTarget === "strongest"
    ? enemyBoard.reduce((best, c, i) => (c.atk > enemyBoard[best].atk ? i : best), 0)
    : enemyBoard.reduce((best, c, i) => (c.hp < enemyBoard[best].hp ? i : best), 0);
  return pick;
}

/**
 * Where a creature's attack goes: an enemy creature index, or "face".
 *
 * `tauntIdx` is not optional to pass around — a taunt is a RULE, not a preference, and every
 * archetype must obey it. This function still takes it (rather than being called only when there
 * is no taunt) so the rule lives in exactly one place instead of being re-checked by every caller.
 */
export function pickAttackTarget(policy, attacker, enemyBoard, tauntIdx){
  if (tauntIdx != null) return tauntIdx;
  if (policy.tradeAggression === "favorable" && enemyBoard && enemyBoard.length){
    // A FAVOURABLE trade: kills the target, survives itself. Among those, take the biggest ATK —
    // that is the threat most worth removing before it swings back.
    let best = -1;
    for (let i = 0; i < enemyBoard.length; i++){
      const t = enemyBoard[i];
      const kills = attacker.atk >= t.hp;
      const survives = t.atk < attacker.hp;
      if (kills && survives && (best < 0 || t.atk > enemyBoard[best].atk)) best = i;
    }
    if (best >= 0) return best;
  }
  return "face";
}

// ---------------------------------------------------------------- boss phases
//
// A boss's phases are HP-fraction thresholds, checked once each and never re-applied — a phase is
// a permanent escalation, not a toggle the boss can lose by healing back over the line.
export const BOSS_PHASES = [
  { id: "bloodied", at: 0.5, buffAtk: 2, shield: 0,
    log: "flares with sudden fury" },
  { id: "desperate", at: 0.2, buffAtk: 2, shield: 6,
    log: "shudders and throws up a last, desperate ward" },
];

/**
 * The next phase this boss should enter, or null. `applied` is the set of phase ids already
 * triggered THIS duel — phases are checked highest-threshold-first so a boss that drops straight
 * through 50% to 15% in one hit still gets both, in order, rather than skipping "bloodied".
 */
export function nextBossPhase(hpFraction, applied){
  const done = applied || [];
  for (const p of BOSS_PHASES){
    if (hpFraction <= p.at && !done.includes(p.id)) return p;
  }
  return null;
}

// ---------------------------------------------------------------- thematic enemy decks
//
// The QUESTS ladder hands every AI a fixed human-authored deck. A dungeon monster deserves a deck
// that reads as ITS OWN school and its own style, built from the same 47-card catalog rather than
// borrowing a rival wizard's list — a Cinder Slime playing "The Academy Rookie"'s exact fire deck
// is the "one strategy, different decks" problem this whole module exists to fix.
//
// `pool` is the slice of the card catalog for one school, injected by the caller (cards.js CARDS
// filtered to a school) — this module never imports cards.js, so it stays free of engine deps and
// callable from a test with a five-card fake pool.

const DMG_KINDS = new Set(["dmg", "dmgAll", "dmgWiz"]);
const isDamageSpell = def => def.type === "spell" && (def.fx || []).some(f => typeof f !== "string" && DMG_KINDS.has(f.k));
const isTanky = def => def.type === "creature" && ((def.fx || []).includes("taunt") || def.hp >= 6);

/**
 * Weighted pick order for a 20-card deck, cheapest style first for Aggro, top-end first for a
 * Boss. Every archetype still only draws from cards that actually EXIST in the pool — a school
 * with no damage spell (Ice, Life) does not get one invented for it; Control there leans on tanky
 * creatures instead, which the weight table already prefers when spells are scarce.
 */
export function archetypeDeckFor(archetypeId, pool, count = 20){
  const creatures = pool.filter(d => d.type === "creature");
  const spells = pool.filter(d => d.type === "spell");
  if (!creatures.length) return [];   // nothing to build a deck from at all

  const weighted = [];
  const add = (def, n) => { for (let i = 0; i < n; i++) weighted.push(def); };

  if (archetypeId === "aggro"){
    const cheap = creatures.slice().sort((a, b) => a.cost - b.cost);
    for (const c of cheap) add(c, c.cost <= 3 ? 4 : 1);
    for (const s of spells.filter(isDamageSpell)) add(s, 2);
  } else if (archetypeId === "control"){
    for (const c of creatures) add(c, isTanky(c) ? 3 : 1);
    for (const s of spells.filter(isDamageSpell)) add(s, 3);
  } else if (archetypeId === "tempo"){
    const midCurve = creatures.slice().sort((a, b) => a.cost - b.cost);
    for (const c of midCurve) add(c, c.cost >= 2 && c.cost <= 5 ? 3 : 1);
    for (const s of spells.filter(isDamageSpell)) add(s, 1);
  } else if (archetypeId === "boss"){
    const top = creatures.slice().sort((a, b) => b.cost - a.cost);
    for (const c of top) add(c, c.cost >= 5 ? 4 : 1);
    for (const s of spells.filter(isDamageSpell)) add(s, 2);
  } else {
    for (const c of creatures) add(c, 2);
    for (const s of spells.filter(isDamageSpell)) add(s, 1);
  }
  if (!weighted.length) for (const c of creatures) add(c, 1);   // never return an empty deck

  const deck = [];
  for (let i = 0; deck.length < count; i++) deck.push(weighted[i % weighted.length].id);
  return deck;
}

// ---------------------------------------------------------------- assigning an archetype
//
// Derived from what the enemy visibly IS (its model / name), not authored per instance in
// dungeons.json — so every slime in every dungeon, present and future, plays the same way without
// a content author needing to know this module exists.
const KIND_ARCHETYPE = [
  [/dragon/i, "boss"],
  [/slime/i, "aggro"],
  [/skeleton/i, "control"],
  [/bat|wraith/i, "tempo"],
];
export function archetypeFor(enemy){
  const s = ((enemy && enemy.model) || "") + " " + ((enemy && enemy.name) || "");
  if (enemy && enemy.boss) return "boss";
  for (const [re, id] of KIND_ARCHETYPE) if (re.test(s)) return id;
  return "midrange";
}

/**
 * Which school a monster's DECK should be built from — a flavour pick, not a rules claim (the
 * monster is not "of" that school for elemental-bonus purposes, since it has no `school` field of
 * its own and none is added here). A slime reads as a scorching ooze, a skeleton as Death's own,
 * a bat/wraith as a storm-quick flier, a dragon boss as the biggest fire in the room. Anything
 * unrecognised falls back to Balance, which is the one school with cards to spare (10, the most
 * of any school) and no glaring gaps (it has both a damage spell and tanky creatures).
 */
const KIND_SCHOOL = [
  [/dragon/i, "fire"],
  [/slime/i, "fire"],
  [/skeleton/i, "death"],
  [/bat|wraith/i, "storm"],
];
export function flavorSchoolFor(enemy){
  const s = ((enemy && enemy.model) || "") + " " + ((enemy && enemy.name) || "");
  for (const [re, school] of KIND_SCHOOL) if (re.test(s)) return school;
  return "balance";
}

// ---------------------------------------------------------------- validation

export function validateArchetypes(){
  const problems = [];
  for (const [id, p] of Object.entries(ARCHETYPES)){
    if (!p.name) problems.push(`${id}: no name`);
    if (!["asc", "desc"].includes(p.creatureOrder)) problems.push(`${id}: bad creatureOrder`);
    if (!["always", "dominant", "never"].includes(p.faceBias)) problems.push(`${id}: bad faceBias`);
    if (!["weakest", "strongest"].includes(p.removalTarget)) problems.push(`${id}: bad removalTarget`);
    if (!["always", "favorable"].includes(p.tradeAggression)) problems.push(`${id}: bad tradeAggression`);
  }
  if (!ARCHETYPES.midrange) problems.push("midrange must exist — it is the compatibility default");
  let last = 1;
  for (const p of BOSS_PHASES){
    if (!(p.at > 0 && p.at < 1)) problems.push(`boss phase "${p.id}": threshold must be between 0 and 1`);
    if (p.at >= last) problems.push(`boss phase "${p.id}" is not strictly below the phase before it`);
    last = p.at;
    if (!(p.buffAtk > 0 || p.shield > 0)) problems.push(`boss phase "${p.id}" does nothing`);
  }
  return problems;
}
