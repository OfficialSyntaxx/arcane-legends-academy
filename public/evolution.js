// evolution.js — card evolution (BACKLOG §5 "Card evolution").
//
// PURE (no THREE, no DOM, no game.js), like variants.js's neighbours.
//
// THE DESIGN CALL (BACKLOG §5 flagged this as needing one before it could be built, with three
// options costed out): a **tiered creature line** — Fire Cat → Fire Elf → Fire Dragon, and the
// same shape for every other school — built entirely from creatures already in `cards.js`. Zero
// new cards, zero new art: every school's own cost-tiered creature spread (a 1-2 cost common, a
// 3-5 cost rare/epic, a 6-8 cost legendary) already reads as a natural line once it's named one,
// the same way `variants.js` found a whole rarity system sitting inside the printing mechanic
// instead of inventing new card entries for it.
//
// THE TRIGGER: spend N copies of the current tier to mint one copy of the next. This is the same
// shape refining/scribing already use (consume a resource, produce a result) and — critically — a
// CHOICE the player makes and the save stores the outcome of (a new card instance), never
// something that fires automatically and silently changes a deck's math underneath a player who
// wasn't paying attention (BACKLOG §5's own explicit requirement).
//
// WHY A GRADED COPY IS NEVER SPENT (enforced in game.js `evolveCard`, not here — this module only
// says what's ALLOWED, never touches the save): a player who paid to grade a specific card instance
// chose to keep that exact one. Evolution consuming it out from under them would be the same
// betrayal `claimTreasure` refusing a repeat claim, or a trophy never disappearing when a slab
// sells, exists to prevent elsewhere in this codebase — a stored choice must survive an unrelated
// system touching the same pool.

export const EVOLUTION_LINES = [
  // costs[i] = copies of tiers[i] needed to mint one copy of tiers[i+1]. The second step costs
  // more than the first — the top tier is a school's own legendary, not a small bump.
  { school: "fire",    tiers: ["fire_cat", "fire_elf", "fire_dragon"],       costs: [3, 5] },
  { school: "ice",     tiers: ["ice_golem", "frost_giant", "ice_wyrm"],     costs: [3, 5] },
  { school: "storm",   tiers: ["storm_bat", "storm_shark", "storm_titan"], costs: [3, 5] },
  { school: "myth",    tiers: ["myth_walker", "minotaur", "hydra"],         costs: [3, 5] },
  { school: "life",    tiers: ["pixie", "unicorn", "satyr"],                costs: [3, 5] },
  { school: "death",   tiers: ["skeleton", "ghoul", "reaper"],              costs: [3, 5] },
  { school: "balance", tiers: ["novice", "sunbird", "balance_dragon"],      costs: [3, 5] },
];

// cardId -> { line, tierIndex } for O(1) lookups instead of scanning every line on every call.
const LINE_BY_CARD = new Map();
for (const line of EVOLUTION_LINES){
  line.tiers.forEach((id, i) => LINE_BY_CARD.set(id, { line, tierIndex: i }));
}

/** The card id this one evolves into, or null if it's not in a line or already at the top. */
export function evolvesInto(cardId){
  const at = LINE_BY_CARD.get(cardId);
  if (!at) return null;
  return at.line.tiers[at.tierIndex + 1] || null;
}

/** Copies of `cardId` needed to evolve it, or null if it can't evolve (not in a line, or maxed). */
export function evolveCost(cardId){
  const at = LINE_BY_CARD.get(cardId);
  if (!at || at.tierIndex >= at.line.tiers.length - 1) return null;
  return at.line.costs[at.tierIndex];
}

/** How many copies of a card a collection holds — every instance, graded or not (display figure;
 * game.js `evolveCard` applies the graded exclusion when it actually spends copies). */
export function copiesOf(cards, cardId){
  return (cards || []).filter(c => c.id === cardId).length;
}

export function canEvolve(cards, cardId){
  const cost = evolveCost(cardId);
  return cost != null && copiesOf(cards, cardId) >= cost;
}

/** Every line, flattened to one row per possible evolution step — what a UI actually renders. */
export function evolutionSteps(){
  const steps = [];
  for (const line of EVOLUTION_LINES){
    for (let i = 0; i < line.tiers.length - 1; i++){
      steps.push({ school: line.school, from: line.tiers[i], to: line.tiers[i + 1], cost: line.costs[i] });
    }
  }
  return steps;
}

/** `cardIds`: the real ids from cards.js, so a typo'd or renamed id in a line is caught here
 * instead of silently rendering a blank row or crashing the Codex panel. */
export function validateEvolution(cardIds){
  const problems = [];
  const known = new Set(cardIds || []);
  const seen = new Set();
  for (const line of EVOLUTION_LINES){
    if (line.tiers.length < 2) problems.push(`${line.school}: a line needs at least 2 tiers`);
    if (line.costs.length !== line.tiers.length - 1) problems.push(`${line.school}: costs must have one entry per step`);
    for (const c of line.costs) if (!(c > 0)) problems.push(`${line.school}: evolve cost must be positive`);
    for (const id of line.tiers){
      if (known.size && !known.has(id)) problems.push(`${line.school}: "${id}" is not a real card id`);
      if (seen.has(id)) problems.push(`"${id}" appears in more than one evolution line`);
      seen.add(id);
    }
  }
  return problems;
}
