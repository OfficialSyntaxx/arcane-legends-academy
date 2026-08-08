// lessons.js — the Academy's actual class content (BACKLOG §1/§2).
//
// PURE (no THREE, no DOM, no game.js), like academy.js / dorm.js / charcreate.js.
//
// WHY THIS EXISTS: `academy.js` gave the curriculum seven YEARS with real perks, and that was
// still the criticism written on it in the backlog — "a year only grants numeric bonuses; there
// is nothing to attend or choose". A year that arrives on its own the moment your score crosses a
// threshold is a progress bar, not a school. This adds the thing a school actually has: a
// SYLLABUS. Three classes per year, each with a brief, an assignment, and something learned.
//
// WHAT MAKES A LESSON DIFFERENT FROM A PERK — the distinction this module is built around:
//   * A YEAR is earned passively and gives a flat percentage.
//   * A LESSON is enrolled in deliberately, has an assignment you must actually go and do, and
//     teaches a NAMED TECHNIQUE that changes how an existing system behaves.
// Every technique below hooks something that already ships — grading fees, scribe quality,
// gathering yield, sale prices — rather than inventing a new number to add up. That is the
// BACKLOG §1 "connect existing systems" item, done in the one place a player is told to go learn.
//
// ASSIGNMENTS ARE READ FROM COUNTERS THE SAVE ALREADY KEEPS (stats.scribed, stats.graded,
// stats.won, skills, cards.length, level). Deliberately NOT "gather 8 willow and hand them in" —
// zonequests.js already does that, consumes the materials, and pays for it. A lesson that also
// consumed materials would be the same errand twice with two different names on it.
//
// THE STATE SPLIT, as everywhere else: `enrolled` and `done` are stored (the player CHOSE to take
// the class, and a reward must pay once). Progress is derived from the save every read, so
// re-tuning an assignment cannot desync anyone and needs no migration.

/**
 * Techniques a lesson can teach. Each names a REAL hook in game.js — see `masteryFor`.
 *   gradeDiscount  percent off grading and regrading fees
 *   scribeBonus    flat bonus to the scribe roll (better average card grade)
 *   gatherBonus    percent chance a gather yields a second unit
 *   sellBonus      percent more gold when selling a card
 */
export const TECHNIQUES = {
  gradeDiscount: { name: "Appraisal", unit: "%", desc: "cheaper grading and regrading" },
  scribeBonus:   { name: "Penmanship", unit: "",  desc: "higher scribe rolls" },
  gatherBonus:   { name: "Husbandry", unit: "%", desc: "chance of a second unit when gathering" },
  sellBonus:     { name: "Haggling",  unit: "%", desc: "more gold when selling cards" },
};

/**
 * The syllabus. `year` is an index into academy.js YEARS (0 = Novice), and a lesson cannot be
 * enrolled in until the player has reached that year — that is what makes the years mean
 * something beyond a label.
 *
 * Assignment kinds, all derived from the save:
 *   scribe/refine/grade/slabs/win/packs   cumulative counters in `stats`
 *   skill {id, level}                     a skill level
 *   collect                               cards owned
 *   level                                 wizard level
 *   lessons                               lessons already completed (used for capstones)
 */
export const LESSONS = [
  // ---- Year 1: Novice ----
  { id: "l_ink", year: 0, title: "Introduction to Inks",
    brief: "Before you may scribe a spell you must know what you are scribing it with. Refine five materials and bring me your notes.",
    assign: { kind: "refine", n: 5 },
    reward: { gold: 90, xp: 60 }, teaches: { scribeBonus: 2 } },
  { id: "l_firstcard", year: 0, title: "Your First Scribing",
    brief: "Theory is not practice. Scribe three cards of your own making.",
    assign: { kind: "scribe", n: 3 },
    reward: { gold: 120, xp: 80 }, teaches: { scribeBonus: 3 }, requires: ["l_ink"] },
  { id: "l_field", year: 0, title: "Field Studies",
    brief: "A wizard who cannot feed themselves is a wizard who does not finish their studies. Raise any gathering skill to level 5.",
    assign: { kind: "skill", id: "woodcutting", level: 5 },
    reward: { gold: 100, xp: 70 }, teaches: { gatherBonus: 4 } },

  // ---- Year 2: Apprentice ----
  { id: "l_grading", year: 1, title: "Principles of Grading",
    brief: "A card's worth is not what it does — it is what a collector believes it does. Have three cards graded.",
    assign: { kind: "grade", n: 3 },
    reward: { gold: 200, xp: 130 }, teaches: { gradeDiscount: 5 } },
  { id: "l_duel1", year: 1, title: "Duelling Fundamentals",
    brief: "Win five duels. I do not much mind how.",
    assign: { kind: "win", n: 5 },
    reward: { gold: 220, xp: 150, cards: 1 }, teaches: { sellBonus: 4 } },
  { id: "l_ore", year: 1, title: "Reagents and Ore",
    brief: "Every reagent begins in the ground. Mining to level 10.",
    assign: { kind: "skill", id: "mining", level: 10 },
    reward: { gold: 210, xp: 140 }, teaches: { gatherBonus: 4 }, requires: ["l_field"] },

  // ---- Year 3: Adept ----
  { id: "l_collection", year: 2, title: "The Collector's Eye",
    brief: "Assemble sixty cards. A library of one book teaches nothing.",
    assign: { kind: "collect", n: 60 },
    reward: { gold: 340, xp: 220 }, teaches: { sellBonus: 5 } },
  { id: "l_slab", year: 2, title: "Mint Condition",
    brief: "Bring a card to a grade worth slabbing. One will do — that is the hard part.",
    assign: { kind: "slabs", n: 1 },
    reward: { gold: 380, xp: 240 }, teaches: { gradeDiscount: 5 }, requires: ["l_grading"] },
  { id: "l_scribe2", year: 2, title: "Advanced Scribing",
    brief: "Scribing to level 20. The hand must be steady before the mind can wander.",
    assign: { kind: "skill", id: "scribing", level: 20 },
    reward: { gold: 360, xp: 230 }, teaches: { scribeBonus: 4 }, requires: ["l_firstcard"] },

  // ---- Year 4: Scholar ----
  { id: "l_duel2", year: 3, title: "Applied Duelling",
    brief: "Twenty wins. At this point I expect you to be choosing your cards, not drawing them.",
    assign: { kind: "win", n: 20 },
    reward: { gold: 520, xp: 340, cards: 1 }, teaches: { sellBonus: 5 }, requires: ["l_duel1"] },
  { id: "l_market", year: 3, title: "Market Theory",
    brief: "Open fifteen packs and tell me honestly whether you came out ahead.",
    assign: { kind: "packs", n: 15 },
    reward: { gold: 560, xp: 360 }, teaches: { sellBonus: 6 } },
  { id: "l_smith", year: 3, title: "Enchanted Metallurgy",
    brief: "Smithing to level 25. A wand is a tool before it is a focus.",
    assign: { kind: "skill", id: "smithing", level: 25 },
    reward: { gold: 540, xp: 350 }, teaches: { gatherBonus: 5 } },

  // ---- Year 5: Master ----
  { id: "l_curation", year: 4, title: "Curation",
    brief: "Five slabs. Not five graded cards — five that were worth the slab.",
    assign: { kind: "slabs", n: 5 },
    reward: { gold: 800, xp: 520 }, teaches: { gradeDiscount: 6 }, requires: ["l_slab"] },
  { id: "l_scribe3", year: 4, title: "Mastery of the Pen",
    brief: "Scribe forty cards. Volume is its own teacher.",
    assign: { kind: "scribe", n: 40 },
    reward: { gold: 840, xp: 540 }, teaches: { scribeBonus: 5 }, requires: ["l_scribe2"] },
  { id: "l_alchemy", year: 4, title: "Practical Alchemy",
    brief: "Alchemy to level 30.",
    assign: { kind: "skill", id: "alchemy", level: 30 },
    reward: { gold: 780, xp: 500 }, teaches: { gatherBonus: 5 } },

  // ---- Year 6: Grandmaster ----
  { id: "l_duel3", year: 5, title: "The Duelling Circuit",
    brief: "Fifty wins. You are teaching the younger students by now, whether you mean to or not.",
    assign: { kind: "win", n: 50 },
    reward: { gold: 1200, xp: 800, cards: 2 }, teaches: { sellBonus: 6 }, requires: ["l_duel2"] },
  { id: "l_archive", year: 5, title: "The Great Archive",
    brief: "One hundred and fifty cards. The Archive does not take a collection smaller than that seriously.",
    assign: { kind: "collect", n: 150 },
    reward: { gold: 1300, xp: 850 }, teaches: { gradeDiscount: 6 }, requires: ["l_collection"] },
  { id: "l_fish", year: 5, title: "Deep Water Studies",
    brief: "Fishing to level 40. The lake keeps its better lessons below the shelf.",
    assign: { kind: "skill", id: "fishing", level: 40 },
    reward: { gold: 1250, xp: 820 }, teaches: { gatherBonus: 6 } },

  // ---- Year 7: Archmage ----
  { id: "l_thesis", year: 6, title: "Thesis: A Collection of Consequence",
    brief: "Fifteen slabs, submitted as a body of work. This is the last thing the Academy will ask of you.",
    assign: { kind: "slabs", n: 15 },
    reward: { gold: 2400, xp: 1600, cards: 3 }, teaches: { gradeDiscount: 7 }, requires: ["l_curation"] },
  { id: "l_capstone", year: 6, title: "Capstone: The Long Study",
    brief: "Complete twelve classes. Not the easy ones — all of them count, so choose well.",
    assign: { kind: "lessons", n: 12 },
    reward: { gold: 2600, xp: 1800 }, teaches: { scribeBonus: 6 } },
  { id: "l_archmage", year: 6, title: "Investiture",
    brief: "Reach wizard level 30 and the Academy will name you what you already are.",
    assign: { kind: "level", n: 30 },
    reward: { gold: 3000, xp: 2000, cards: 3 }, teaches: { sellBonus: 8 }, requires: ["l_capstone"] },
];

const state = s => (s && s.lessons) || { enrolled: [], done: [] };

export function isDone(s, id){ return state(s).done.includes(id); }
export function isEnrolled(s, id){ return state(s).enrolled.includes(id); }
export function byId(id){ return LESSONS.find(l => l.id === id) || null; }

/** How far along an assignment is, derived entirely from the save. */
export function progressOf(s, lesson){
  const a = lesson.assign;
  const stats = s.stats || {};
  let have = 0, need = a.n || a.level || 1;
  switch (a.kind){
    case "scribe":  have = stats.scribed || 0; break;
    case "refine":  have = stats.refined || 0; break;
    case "grade":   have = stats.graded  || 0; break;
    case "slabs":   have = stats.slabs   || 0; break;
    case "win":     have = stats.won     || 0; break;
    case "packs":   have = stats.packs   || 0; break;
    case "collect": have = (s.cards || []).length; break;
    case "level":   have = s.level || 1; break;
    case "skill":   have = (s.skills || {})[a.id] || 1; break;
    case "lessons": have = state(s).done.length; break;
  }
  return { have: Math.min(have, need), need, done: have >= need };
}

/** A one-line description of the assignment. */
export function assignText(lesson, skillName){
  const a = lesson.assign;
  switch (a.kind){
    case "scribe":  return `Scribe ${a.n} cards`;
    case "refine":  return `Refine ${a.n} materials`;
    case "grade":   return `Have ${a.n} cards graded`;
    case "slabs":   return `Own ${a.n} slabbed card${a.n > 1 ? "s" : ""}`;
    case "win":     return `Win ${a.n} duels`;
    case "packs":   return `Open ${a.n} packs`;
    case "collect": return `Own ${a.n} cards`;
    case "level":   return `Reach wizard level ${a.n}`;
    case "skill":   return `${skillName || a.id} to level ${a.level}`;
    case "lessons": return `Complete ${a.n} classes`;
  }
  return "";
}

/** Prerequisites satisfied AND the player has reached the lesson's year. */
export function unlocked(s, lesson, yearIndex){
  if (yearIndex != null && lesson.year > yearIndex) return false;
  return (lesson.requires || []).every(r => isDone(s, r));
}

/** Classes the player can enrol in right now. */
export function available(s, yearIndex){
  return LESSONS.filter(l => !isDone(s, l.id) && !isEnrolled(s, l.id) && unlocked(s, l, yearIndex));
}
/** Enrolled classes not yet handed in. */
export function active(s){
  return LESSONS.filter(l => isEnrolled(s, l.id) && !isDone(s, l.id));
}
/** Enrolled and finished — ready to submit. */
export function submittable(s){
  return active(s).filter(l => progressOf(s, l).done);
}
/** Classes visible but not yet open, so the syllabus reads as a syllabus rather than a short list. */
export function locked(s, yearIndex){
  return LESSONS.filter(l => !isDone(s, l.id) && !isEnrolled(s, l.id) && !unlocked(s, l, yearIndex));
}

export function enroll(s, id){
  const l = byId(id);
  if (!l || isDone(s, id) || isEnrolled(s, id)) return { ok: false, err: "unavailable" };
  s.lessons.enrolled.push(id);
  return { ok: true, lesson: l };
}

/**
 * Submit a finished class. Marks it done and hands the reward back for game.js to apply — this
 * module never touches gold or xp itself, exactly like zonequests.js, which is what keeps it pure.
 */
export function submit(s, id){
  const l = byId(id);
  if (!l || !isEnrolled(s, id) || isDone(s, id)) return { ok: false, err: "not enrolled" };
  if (!progressOf(s, l).done) return { ok: false, err: "unfinished" };
  s.lessons.enrolled = s.lessons.enrolled.filter(x => x !== id);
  s.lessons.done.push(id);
  return { ok: true, lesson: l, reward: l.reward, teaches: l.teaches };
}

/**
 * Everything the player has learned, summed from the classes they have PASSED.
 *
 * Derived, never stored — so re-tuning what a class teaches instantly applies to every save that
 * already passed it, with no migration and no possibility of a stored total drifting from the
 * lessons that produced it. This is the same rule the rest of the codebase follows and the reason
 * `academyScore`-style totals are never written down.
 */
export function masteryFor(s){
  const out = { gradeDiscount: 0, scribeBonus: 0, gatherBonus: 0, sellBonus: 0 };
  for (const id of state(s).done){
    const l = byId(id);
    if (!l || !l.teaches) continue;
    for (const [k, v] of Object.entries(l.teaches)) if (out[k] != null) out[k] += v;
  }
  return out;
}

/** Per-year syllabus progress, for the Hall panel. */
export function yearProgress(s, yearIndex){
  const inYear = LESSONS.filter(l => l.year === yearIndex);
  const done = inYear.filter(l => isDone(s, l.id)).length;
  return { done, total: inYear.length, complete: inYear.length > 0 && done === inYear.length };
}

/** How many full years the player has graduated. */
export function graduatedYears(s){
  let n = 0;
  for (let y = 0; y < 7; y++) if (yearProgress(s, y).complete) n++;
  return n;
}

/** Problems with the syllabus itself. Same contract as the other validators: a list. */
export function validateLessons(opts = {}){
  const problems = [];
  const ids = new Set();
  for (const l of LESSONS){
    if (ids.has(l.id)) problems.push(`duplicate lesson id "${l.id}"`);
    ids.add(l.id);
    if (!l.title || !l.brief) problems.push(`${l.id}: no title or brief`);
    if (!l.reward || !(l.reward.gold > 0)) problems.push(`${l.id}: no reward`);
    if (!l.teaches || !Object.keys(l.teaches).length) problems.push(`${l.id}: teaches nothing`);
    for (const k of Object.keys(l.teaches || {})) if (!TECHNIQUES[k]) problems.push(`${l.id}: unknown technique "${k}"`);
    if (opts.years != null && !(l.year >= 0 && l.year < opts.years)) problems.push(`${l.id}: year ${l.year} is not a real curriculum year`);
    if (opts.skillIds && l.assign.kind === "skill" && !opts.skillIds.includes(l.assign.id))
      problems.push(`${l.id}: "${l.assign.id}" is not a real skill`);
    if (l.assign.kind === "skill" && !(l.assign.level > 1)) problems.push(`${l.id}: skill assignment needs a level`);
    if (l.assign.kind !== "skill" && !(l.assign.n > 0)) problems.push(`${l.id}: assignment needs a target`);
    for (const r of l.requires || []){
      const dep = LESSONS.find(x => x.id === r);
      if (!dep){ problems.push(`${l.id}: requires "${r}", which is not a lesson`); continue; }
      // A prerequisite from a LATER year can never be satisfied in time — the class would appear
      // unlocked by year and stay greyed out forever with no explanation.
      if (dep.year > l.year) problems.push(`${l.id} (year ${l.year}) requires "${r}" from the later year ${dep.year}`);
    }
  }
  // Every year must offer classes, or the curriculum has a dead stretch in the middle of it.
  if (opts.years != null){
    for (let y = 0; y < opts.years; y++)
      if (!LESSONS.some(l => l.year === y)) problems.push(`curriculum year ${y} has no classes`);
  }
  // reachability: walk from the classes with no prerequisites
  const done = new Set();
  let grew = true;
  while (grew){
    grew = false;
    for (const l of LESSONS){
      if (done.has(l.id)) continue;
      if ((l.requires || []).every(r => done.has(r))){ done.add(l.id); grew = true; }
    }
  }
  for (const l of LESSONS) if (!done.has(l.id))
    problems.push(`${l.id} can never be unlocked (its prerequisite chain is unsatisfiable or cyclic)`);
  // A capstone that asks for more classes than exist can never be finished.
  for (const l of LESSONS) if (l.assign.kind === "lessons" && l.assign.n >= LESSONS.length)
    problems.push(`${l.id}: asks for ${l.assign.n} classes but only ${LESSONS.length} exist`);
  return problems;
}
