// advice.js — the ongoing "Adventurer's Path" (BACKLOG §1 "Connect existing systems").
//
// Onboarding.js teaches the first loop; this module keeps guiding THE SAME loop after it,
// so the game never drops the player into a menu maze. Like onboarding, every suggestion is
// DERIVED from the save — there is no tracked step to desync. The bar always offers the next
// meaningful action, cycling through the whole loop (craft → improve → use → settle → stock),
// so gathering, crafting, cards, duels and housing feel like one continuous loop rather than
// separate screens.
//
// PURE (no THREE, no DOM) so tools/test.mjs can walk it headlessly.

import { PACK_COST, MAX_DECK } from "./game.js";
import { HOME_UPGRADES } from "./items.js";

/** Raw materials you gather in the world (mine / chop / fish). */
export const RAW_IDS = [
  "copper", "tin", "iron", "silver", "gold", "mithril", "runite",
  "oak_log", "willow_log", "magic_log",
  "raw_shrimp", "raw_salmon", "raw_lobster", "raw_shark",
];
/** Refined scribing supplies (made from raw materials at the Smithy). */
export const SUPPLY_IDS = ["canvas", "ink", "reagent"];
export const HOME_COST = 200;
/** Below this many raw items we call you "low" and nudge you to re-stock. */
export const LOW_RAW = 3;

const count = (s, ids) => ids.reduce((n, id) => n + (s.inventory && s.inventory[id] ? s.inventory[id] : 0), 0);

/**
 * The next suggested action, or null if there is nothing sensible to do.
 * Priority cycles the whole loop so no one stage (farming ore, say) permanently hides the rest.
 * @returns {{icon:string, title:string, why:string, goto:string} | null}
 */
export function nextAdvice(s) {
  // 1 — Finish the craft you started: you're holding supplies → scribe a card.
  if (count(s, SUPPLY_IDS) >= 1)
    return { icon: "✍️", title: "Scribe a card", why: "You have scribing supplies — turn them into a fresh card at the Scribing Hall.", goto: "skills" };

  // 2 — Settle in: buy the guild hall, then keep upgrading it.
  if (!s.home.owned && s.gold >= HOME_COST)
    return { icon: "🏰", title: "Buy your guild hall", why: "A home of your own unlocks housing, upgrades and a place to show off.", goto: "home" };
  if (s.home.owned) {
    const up = HOME_UPGRADES.find(u => {
      const lv = s.home.upgrades[u.id] || 0;
      return lv < u.max && s.gold >= u.cost(lv);
    });
    if (up) {
      const lv = s.home.upgrades[up.id] || 0;
      return { icon: "🔨", title: `Upgrade: ${up.name}`, why: `${up.desc} (${up.cost(lv)}g)`, goto: "home" };
    }
  }

  // 3 — Improve your collection: appraise an ungraded card.
  if ((s.cards || []).some(c => !c.graded))
    return { icon: "💎", title: "Grade a card", why: "High grades are worth far more — get a card appraised at the Library.", goto: "collection" };

  // 4 — Use your deck: put it to the test.
  if ((s.deck || []).length === MAX_DECK)
    return { icon: "⚔️", title: "Win a duel", why: "Put your deck to the test and earn gold, xp and cards.", goto: "duel" };

  // 5 — Restock the craft loop: refine raw materials into supplies.
  if (count(s, RAW_IDS) >= 1)
    return { icon: "⚒️", title: "Refine raw materials", why: "Turn your logs, ore and fish into canvas, ink and reagent at the Smithy.", goto: "skills" };

  // 6 — Spend: crack a booster with spare gold.
  if (s.gold >= PACK_COST)
    return { icon: "🃏", title: "Open a pack", why: "You have gold to spare — a booster could hold a high-grade card.", goto: "collection" };

  // 7 — Re-stock: you're running low on raw materials → go gather.
  if (count(s, RAW_IDS) < LOW_RAW)
    return { icon: "⛏️", title: "Gather materials", why: "You're running low — mine, chop or fish to keep the craft loop going.", goto: "world" };

  // 8 — Fallback: explore, quest, or just roam.
  return { icon: "🧭", title: "Explore & quest", why: "Talk to NPCs for quests, or explore a new zone.", goto: "world" };
}