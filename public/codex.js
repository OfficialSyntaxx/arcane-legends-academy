// codex.js — the collection index: filters, sorting, completion and collection achievements
// (BACKLOG §5 "card lore / encyclopedia", "collection achievements", "better collection filters",
// "favorite cards").
//
// PURE (no THREE, no DOM, no game.js), like variants.js / lessons.js / dorm.js.
//
// WHY NOW: the collection screen was a single flat grid. That was survivable at 30 starter cards
// and stopped being so the moment printings landed — a player with a prismatic first edition
// somewhere in ninety cards has no way to find it, and no way to answer the question a collection
// game is supposed to keep asking: *what am I missing?*
//
// THE DIVISION OF LABOUR, same as everywhere else here:
//   * this module answers questions about a collection (what is owned, what is missing, what
//     matches a filter, how far along a set is)
//   * index.html renders the answers
//   * game.js owns the cards themselves
// Nothing here mutates a save except `toggleFavorite`, which is a stored CHOICE.
//
// EVERYTHING IS DERIVED except favourites. Completion, set progress and every achievement are
// recomputed from `save.cards` on each read, so selling a card immediately un-earns whatever it
// was propping up. An achievement list written into the save would drift the first time a player
// sold something, and that drift is invisible until someone notices a badge for a card they no
// longer own.

import * as VAR from "./variants.js";

// ---------------------------------------------------------------- ownership

/**
 * A map of cardId -> { count, best, bestVariant, fe, graded } for everything owned.
 *
 * `best` is the highest-value copy's multiplier rather than its grade: a Foil at grade 5 is a
 * better *possession* than a plain Near Mint, and the collection should say so.
 */
export function ownedIndex(cards){
  const idx = {};
  for (const c of cards || []){
    const e = idx[c.id] || (idx[c.id] = { count: 0, best: 0, bestVariant: "normal", fe: false, graded: 0, bestRoll: -1 });
    e.count++;
    if (c.graded) e.graded++;
    if (c.fe) e.fe = true;
    if (c.roll > e.bestRoll) e.bestRoll = c.roll;
    const m = VAR.multiplierFor(c);
    if (m > e.best){ e.best = m; e.bestVariant = VAR.variantOf(c).id; }
  }
  return idx;
}

export function owns(cards, cardId){ return (cards || []).some(c => c.id === cardId); }

// ---------------------------------------------------------------- completion

/**
 * Completion for an arbitrary grouping of the catalog.
 *
 * `groupBy` is a function from a card definition to a key, so the same code answers "how complete
 * is each school" and "how complete is each rarity" without a second implementation.
 */
export function completionBy(catalog, cards, groupBy){
  const idx = ownedIndex(cards);
  const out = {};
  for (const def of catalog){
    const key = groupBy(def);
    const g = out[key] || (out[key] = { total: 0, owned: 0, missing: [] });
    g.total++;
    if (idx[def.id]) g.owned++; else g.missing.push(def.id);
  }
  for (const g of Object.values(out)) g.pct = g.total ? Math.round((g.owned / g.total) * 100) : 0;
  return out;
}

export function overallCompletion(catalog, cards){
  const idx = ownedIndex(cards);
  const owned = catalog.filter(d => idx[d.id]).length;
  return { owned, total: catalog.length, pct: catalog.length ? Math.round((owned / catalog.length) * 100) : 0 };
}

// ---------------------------------------------------------------- favourites (the one stored bit)

export function isFavorite(save, cardId){
  return !!(save && save.favorites && save.favorites.includes(cardId));
}
export function toggleFavorite(save, cardId){
  save.favorites = save.favorites || [];
  const i = save.favorites.indexOf(cardId);
  if (i >= 0) save.favorites.splice(i, 1); else save.favorites.push(cardId);
  return { ok: true, favorite: i < 0 };
}

// ---------------------------------------------------------------- filters & sorting

export const FILTERS = [
  { id: "all",      label: "All",        match: () => true },
  { id: "owned",    label: "Owned",      match: (def, e) => !!e },
  { id: "missing",  label: "Missing",    match: (def, e) => !e },
  { id: "favorite", label: "Favourites", match: (def, e, ctx) => isFavorite(ctx.save, def.id) },
  { id: "printed",  label: "Special",    match: (def, e) => !!e && (e.bestVariant !== "normal" || e.fe) },
  { id: "graded",   label: "Graded",     match: (def, e) => !!e && e.graded > 0 },
];
export const FILTER_IDS = FILTERS.map(f => f.id);

export const SORTS = [
  { id: "school",  label: "School" },
  { id: "rarity",  label: "Rarity" },
  { id: "cost",    label: "Cost" },
  { id: "value",   label: "Best copy" },
  { id: "name",    label: "Name" },
];
export const SORT_IDS = SORTS.map(s => s.id);

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

/**
 * Apply a filter, a school restriction, a text query and a sort to the CATALOG (not the
 * collection), so "missing" is answerable at all — you cannot filter a list of owned cards for
 * the ones you do not own.
 */
export function browse(catalog, save, opts = {}){
  const cards = (save && save.cards) || [];
  const idx = ownedIndex(cards);
  const filter = FILTERS.find(f => f.id === opts.filter) || FILTERS[0];
  const q = (opts.query || "").trim().toLowerCase();
  const ctx = { save };

  let rows = catalog.filter(def => {
    if (opts.school && def.school !== opts.school) return false;
    if (opts.type && def.type !== opts.type) return false;
    if (q && !(def.name.toLowerCase().includes(q) || (def.text || "").toLowerCase().includes(q))) return false;
    return filter.match(def, idx[def.id], ctx);
  });

  const sort = opts.sort || "school";
  const dir = opts.desc ? -1 : 1;
  rows = rows.slice().sort((a, b) => {
    let d = 0;
    if (sort === "rarity")      d = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    else if (sort === "cost")   d = a.cost - b.cost;
    else if (sort === "name")   d = a.name.localeCompare(b.name);
    else if (sort === "value")  d = (idx[a.id] ? idx[a.id].best : 0) - (idx[b.id] ? idx[b.id].best : 0);
    else                        d = a.school.localeCompare(b.school);
    // Name is the tie-break for every sort, so the grid is stable rather than re-ordering itself
    // between renders on equal keys.
    return (d || a.name.localeCompare(b.name)) * dir;
  });
  return rows.map(def => ({ def, owned: idx[def.id] || null, favorite: isFavorite(save, def.id) }));
}

// ---------------------------------------------------------------- achievements
//
// All DERIVED. Each has a `have`/`need` so the UI can show progress rather than a binary, and each
// reads the collection directly — sell the cards and the achievement un-earns itself, which is the
// honest behaviour and the reason none of this is written into the save.

export const ACHIEVEMENTS = [
  { id: "first_steps", name: "First Steps",    icon: "🃏", desc: "Own 25 different cards",
    of: (cat, cards) => ({ have: Object.keys(ownedIndex(cards)).length, need: 25 }) },
  { id: "archivist",   name: "Archivist",      icon: "📚", desc: "Own every card in the catalog",
    of: (cat, cards) => ({ have: Object.keys(ownedIndex(cards)).length, need: cat.length }) },
  { id: "shiny",       name: "Something Shiny",icon: "✨", desc: "Own a foil card",
    of: (cat, cards) => ({ have: VAR.tallyFor(cards).foil > 0 ? 1 : 0, need: 1 }) },
  { id: "rainbow",     name: "Rainbow Chaser", icon: "🌈", desc: "Own a holographic card",
    of: (cat, cards) => ({ have: VAR.tallyFor(cards).holo > 0 ? 1 : 0, need: 1 }) },
  { id: "prismatic",   name: "Prismatic",      icon: "💠", desc: "Own a prismatic card",
    of: (cat, cards) => ({ have: VAR.tallyFor(cards).prism > 0 ? 1 : 0, need: 1 }) },
  { id: "founder",     name: "Founder",        icon: "①", desc: "Own 20 first editions",
    of: (cat, cards) => ({ have: VAR.tallyFor(cards).firstEditions, need: 20 }) },
  { id: "curator",     name: "Curator",        icon: "💎", desc: "Own 5 slabbed cards",
    of: (cat, cards, opts) => ({ have: cards.filter(c => c.graded && c.serial != null).length, need: 5 }) },
  { id: "legends",     name: "Legends Only",   icon: "🏆", desc: "Own every legendary card",
    of: (cat, cards) => {
      const legends = cat.filter(d => d.rarity === "legendary");
      const idx = ownedIndex(cards);
      return { have: legends.filter(d => idx[d.id]).length, need: legends.length };
    } },
  { id: "scholar",     name: "Full Faculty",   icon: "🎓", desc: "Own at least one card from every school",
    of: (cat, cards) => {
      const schools = [...new Set(cat.map(d => d.school))];
      const owned = new Set(cards.map(c => c.id));
      return { have: schools.filter(s => cat.some(d => d.school === s && owned.has(d.id))).length, need: schools.length };
    } },
];

export function achievementsFor(catalog, cards){
  return ACHIEVEMENTS.map(a => {
    const p = a.of(catalog, cards || []);
    return { ...a, have: Math.min(p.have, p.need), need: p.need, done: p.have >= p.need,
             pct: p.need ? Math.min(100, Math.round((p.have / p.need) * 100)) : 0 };
  });
}
export function achievementCount(catalog, cards){
  const all = achievementsFor(catalog, cards);
  return { done: all.filter(a => a.done).length, total: all.length };
}

/** Problems with the codex tables. Same contract as the other validators: a list. */
export function validateCodex(catalog){
  const problems = [];
  const ids = new Set();
  for (const a of ACHIEVEMENTS){
    if (ids.has(a.id)) problems.push(`duplicate achievement id "${a.id}"`);
    ids.add(a.id);
    if (!a.name || !a.desc || !a.icon) problems.push(`${a.id}: incomplete`);
    if (typeof a.of !== "function") problems.push(`${a.id}: no progress function`);
    if (catalog){
      // Every achievement must be ACHIEVABLE against the real catalog. One asking for more
      // legendaries than exist would sit at 96% forever with nothing the player could do.
      const p = a.of(catalog, []);
      if (!(p.need > 0)) problems.push(`${a.id}: needs a positive target`);
      // The probe must be the BEST POSSIBLE collection, which means one of every printing — not
      // one printing repeated. Making every card prismatic reported the foil and holographic
      // achievements as unreachable, because a tally of prismatics contains no foils. The
      // validator was right to complain; the sample was wrong.
      const printings = VAR.VARIANTS.map(v => v.id);
      const everything = catalog.map((d, i) => ({ id: d.id, roll: 100, graded: true, serial: 1,
                                                  variant: printings[i % printings.length], fe: true }));
      const full = a.of(catalog, everything);
      if (full.have < full.need) problems.push(`${a.id}: unreachable even with the whole catalog owned (${full.have}/${full.need})`);
    }
  }
  for (const f of FILTERS) if (typeof f.match !== "function") problems.push(`filter "${f.id}" has no matcher`);
  if (!FILTERS.some(f => f.id === "all")) problems.push("there must be an unfiltered view");
  if (!SORTS.length) problems.push("no sort options");
  return problems;
}
