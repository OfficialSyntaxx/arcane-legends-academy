// onboarding.js — the guided first session (BACKLOG §1 "First 10 minutes").
//
// PURE (no THREE, no DOM), like the other spec modules, so tools/test.mjs can walk the whole
// chain headlessly and prove it is completable.
//
// THE DESIGN DECISION: every step is DERIVED from the save, never tracked in it.
//
// The obvious implementation is a `s.tutorial.step` counter that the UI bumps. That counter is a
// second copy of information the save already holds, and the two drift the moment anything
// changes state by another route — a player who scribes a card from the Hall before the tutorial
// tells them to would be stuck on "scribe your first card" while holding one. It is the same trap
// as the logic.js card catalog and the zones.json duplication, and it gets the same answer:
// one source of truth. Each step asks the save a question, so the chain self-corrects, needs no
// migration, and cannot be desynchronised by playing out of order.
//
// A step is:
//   id     stable key
//   title  what the player is asked to do
//   why    one line of context — the chain should teach the loop, not just issue orders
//   done   (state) => boolean, answered entirely from the save
//   goto   which screen takes them there ("world" means go outside and find it)
//   where  optional label naming the place/NPC in the world

import { MAX_DECK } from "./game.js";

/** Materials the scribing bench consumes. Kept here so the hints name the real inputs. */
export const SCRIBE_INPUTS = ["canvas", "ink", "reagent"];

export const STEPS = [
  {
    id: "school",
    title: "Choose your school",
    why: "Your school sets your starter deck and the element you are strongest with.",
    goto: "world",
    done: s => !!(s.flags && s.flags.schoolPicked),
  },
  {
    id: "gather",
    title: "Gather raw materials",
    why: "Everything you craft starts as something you mined, chopped or fished.",
    goto: "world",
    where: "any glowing node on the campus",
    done: s => totalRaw(s) > 0,
  },
  {
    id: "refine",
    title: "Refine them into scribing supplies",
    why: "Raw logs and ore become canvas, ink and reagent at the Smithy.",
    goto: "skills",
    where: "the Smithy & Forge",
    // Either you are holding supplies now, or you already spent them scribing.
    done: s => SCRIBE_INPUTS.some(id => (s.inventory && s.inventory[id]) > 0)
            || (s.stats && (s.stats.refined > 0 || s.stats.scribed > 0)),
  },
  {
    id: "scribe",
    title: "Scribe your first card",
    why: "Scribing is how you make cards rather than buying them.",
    goto: "skills",
    where: "the Scribing Hall",
    // A scribed card is indistinguishable from a starter one once it is in `cards`, and the
    // school starter adds more on top, so counting cards cannot answer this. `stats.scribed`
    // records the action itself — the one thing the save had no other trace of.
    done: s => (s.stats && s.stats.scribed) > 0,
  },
  {
    id: "grade",
    title: "Grade a card",
    why: "Grading reveals a card's condition. High grades are worth far more.",
    goto: "collection",
    where: "the Library of Echoes",
    done: s => (s.stats && s.stats.graded) > 0,
  },
  {
    id: "deck",
    title: `Build a deck of ${MAX_DECK}`,
    why: "You cannot duel without a legal deck.",
    goto: "loadout",
    done: s => (s.deck || []).length === MAX_DECK,
  },
  {
    id: "duel",
    title: "Win your first duel",
    why: "Duels are where the cards you made finally get used.",
    goto: "duel",
    where: "the Duel Arena",
    done: s => (s.stats && s.stats.won) > 0 || (s.quests && s.quests.done.length > 0),
  },
];

function totalRaw(s){
  let n = 0;
  for (const k in (s.inventory || {})) n += s.inventory[k] || 0;
  return n;
}

/** The first unfinished step, or null when the chain is complete. */
export function currentStep(s){
  return STEPS.find(st => !st.done(s)) || null;
}

/**
 * Progress as {done, total, complete, index} for the header.
 *
 * `index` is the CURRENT step's position in the chain, which is what the bar should show —
 * counting completed steps instead reads wrong, because a fresh save already satisfies the
 * "build a legal deck" step (the starter deck is legal), so the very first task announced itself
 * as step 3 of 7.
 */
export function progress(s){
  const done = STEPS.filter(st => st.done(s)).length;
  const cur = currentStep(s);
  return { done, total: STEPS.length, complete: done === STEPS.length,
           index: cur ? STEPS.indexOf(cur) + 1 : STEPS.length };
}

/** Every step with its state, in order — for rendering the checklist. */
export function checklist(s){
  const cur = currentStep(s);
  return STEPS.map(st => ({
    id: st.id, title: st.title, why: st.why, goto: st.goto, where: st.where,
    done: st.done(s),
    active: !!cur && cur.id === st.id,
  }));
}
