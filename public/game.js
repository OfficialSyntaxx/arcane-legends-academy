// Wizard TCG — engine (saved state, skills, economy, market, auctions, housing, duels, AI)
import { CARDS, CARD_MAP, SCHOOLS, RARITY, SCHOOL_BONUS, GRADES, gradeForRoll, cardValue, gradeFee } from "./cards.js";
import { MATERIALS, BARS, POTIONS, METALS, SLOTS, equipmentFor, HOME_UPGRADES, CARD_MATERIALS } from "./items.js";
import * as ACADEMY from "./academy.js";
import * as LESSONS from "./lessons.js";
import * as VAR from "./variants.js";
import * as ARCH from "./archetypes.js";

const SAVE_KEY = "arcane_legends_save_v1";
export const MAX_DECK = 20, MAX_COPIES = 3, START_GOLD = 80, PACK_COST = 100;

// ---------- RNG (seeded for determinism) ----------
export function mulberry32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export const rng = mulberry32((Date.now()>>>0) % 2147483647);

// ---------- Save / load ----------
export function newGame(){
  const starterTypes = ["fire_dragon","storm_titan","ice_golem","firebolt","lightning","pixie","elixir","fire_elf","novice","myth_walker"];
  const deck = [];
  for (const id of starterTypes) for (let i=0;i<2;i++) deck.push(id); // 20-card deck format
  // Starters can't go through mintCard (there is no save yet), so they mirror its shape by hand:
  // always a normal printing — a free deck should not also hand out the rarest thing in the game
  // — and the FIRST copy of each type carries the first-edition stamp, which is true.
  const cards = [];
  for (const id of starterTypes) for (let i=0;i<3;i++){
    const inst = { uid: uid(), id, roll: Math.floor(rng()*101), graded:false, variant:"normal" };
    if (i === 0) inst.fe = true;
    cards.push(inst);
  }
  return {
    version:1, school:"balance", gold:START_GOLD, xp:0, level:1,
    skills:{ mining:1, fishing:1, woodcutting:1, smithing:1, alchemy:1, scribing:1 },
    skillXp:{ mining:0, fishing:0, woodcutting:0, smithing:0, alchemy:0, scribing:0 },
    inventory:{}, cards, equipment:[],
    loadout:{ wand:null, hat:null, robe:null, boots:null, amulet:null },
    deck,
    // `name` starts EMPTY on purpose: charcreate.js derives "creation unfinished" from a missing
    // name, so a default here would skip the creation screen entirely on a fresh save.
    name:"", appearance:{ variant:"standard", aura:"ring" },
    home:{ owned:false, upgrades:{ treasury:0, library:0, armory:0, tavern:0 }, stock:{}, furniture:{}, cases:{} },
    quests:{ current:0, done:[] },
    pvp:{ wins:0, losses:0 },
    stats:{ packs:0, graded:0, won:0, slabs:0, scribed:0, refined:0 },
    // WORLDSPEC §10: world progression lives in the save. `zone` is where the player logs back
    // in; `visited` gates fast travel and "new area" moments later.
    worldState:{ zone:"academy", visited:["academy"], dungeons:{} },
    // Quests given by NPCs out in the world (zonequests.js). Only the player's CHOICES live
    // here — progress is derived from inventory/dungeon state every time it is read.
    zoneQuests:{ accepted:[], done:[] },
    // Academy classes (lessons.js). Only the CHOICES: enrolled and passed. What each class taught
    // is recomputed from `done` on every read.
    lessons:{ enrolled:[], done:[] },
    // Favourited card TYPES (codex.js). The one stored bit of the codex — everything else about a
    // collection (completion, achievements, filters) is derived from `cards` on every read.
    favorites:[],
    // NPC reputation (reputation.js). Only quest givers earn any right now — see that module
    // for why this is a flat {npcKey: number} map rather than a richer per-NPC shape.
    reputation:{},
    auctions:[], slabCounter:0, daily:{ date:"", type:"win", progress:0, target:3, claimed:false }, flags:{ starters:true, schoolPicked:false },
  };
}
export function load(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.version){ const m = migrate(s); settleAuctions(m); return m; }
  }catch(e){}
  return newGame();
}
export function save(s){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){} }
function migrate(s){
  // v1 -> aligned: add scribing skill, slab fields, trim deck to 20-card format
  if (!s.skills.scribing) s.skills.scribing = 1;
  if (!s.skillXp.scribing) s.skillXp.scribing = 0;
  if (!s.stats.slabs) s.stats.slabs = 0;
  // Counters the onboarding chain asks about. They record an ACTION the save had no other record
  // of — a scribed card is indistinguishable from a starter one once it is in `cards`.
  if (s.stats.scribed == null) s.stats.scribed = 0;
  if (s.stats.refined == null) s.stats.refined = 0;
  if (s.slabCounter == null) s.slabCounter = 0;
  if (!s.daily) s.daily = { date:"", type:"win", progress:0, target:3, claimed:false };
  if (!s.school) s.school = "balance";
  if (!s.flags) s.flags = {};
  // Only a save that predates the school system (flag ABSENT) skips the picker. The old check
  // was `if (!s.flags.schoolPicked)`, which also fired on an explicit false — so a player who
  // quit during character creation never saw the picker again and was silently stuck on Balance.
  if (s.flags.schoolPicked === undefined) s.flags.schoolPicked = true;
  if (!s.auctions) s.auctions = [];
  if (!s.worldState) s.worldState = { zone:"academy", visited:["academy"], dungeons:{} };
  if (!Array.isArray(s.worldState.visited)) s.worldState.visited = ["academy"];
  // WORLDSPEC §6: per-dungeon progress (cleared rooms, boss kills) lives in the save.
  if (!s.worldState.dungeons || typeof s.worldState.dungeons !== "object") s.worldState.dungeons = {};
  if (!s.zoneQuests) s.zoneQuests = { accepted: [], done: [] };
  if (!Array.isArray(s.zoneQuests.accepted)) s.zoneQuests.accepted = [];
  if (!Array.isArray(s.zoneQuests.done)) s.zoneQuests.done = [];
  if (!s.reputation || typeof s.reputation !== "object") s.reputation = {};
  if (!Array.isArray(s.favorites)) s.favorites = [];
  if (!s.lessons) s.lessons = { enrolled: [], done: [] };
  if (!Array.isArray(s.lessons.enrolled)) s.lessons.enrolled = [];
  if (!Array.isArray(s.lessons.done)) s.lessons.done = [];
  // The Dorm phases. `stock` is what the player has BOUGHT, `furniture` is slot -> item id, and
  // `cases` is slot -> card uid. Nothing derived is stored: the room's size and slot count come
  // from the upgrade levels, a displayed slab's grade is read off the live card, and trophies are
  // recomputed from boss kills — so none of that can drift out of sync with the save.
  // Character creation (BACKLOG §2). `name` and `appearance` are CHOICES, so they are stored;
  // the resolved hue/saturation/aura are derived by charcreate.js on every read and never saved,
  // which is what lets the palette be retuned later without a migration.
  //
  // NOTE the asymmetry: `appearance` is defaulted here so every save renders, but `name` is left
  // UNSET on purpose. charcreate.js derives "creation is unfinished" from a missing name, so
  // filling one in here would silently skip the creation screen for every existing save.
  if (!s.appearance || typeof s.appearance !== "object") s.appearance = { variant:"standard", aura:"ring" };
  if (!s.appearance.variant) s.appearance.variant = "standard";
  if (!s.appearance.aura) s.appearance.aura = "ring";
  if (!s.home.stock || typeof s.home.stock !== "object") s.home.stock = {};
  if (!s.home.furniture || typeof s.home.furniture !== "object") s.home.furniture = {};
  if (!s.home.cases || typeof s.home.cases !== "object") s.home.cases = {};
  // `defeated` arrived after `cleared`/`bossDead`, so older saves have the object but not the list.
  for (const d of Object.values(s.worldState.dungeons)){
    if (!Array.isArray(d.defeated)) d.defeated = [];
    if (!Array.isArray(d.cleared)) d.cleared = [];
  }
  // Printings (variants.js). An absent `variant` already reads as "normal", so no backfill is
  // needed there. First edition is different: without a stamp, a long-standing player could never
  // earn one for anything already in their collection and the feature would be dead for them. So
  // grandfather the first copy of each type they own, once. `feStamped` makes it once-only —
  // re-running it after they sold and re-bought a card would mint a second "first" edition.
  if (!s.flags.feStamped){
    const seen = new Set();
    for (const c of s.cards || []){
      if (c.variant == null) c.variant = "normal";
      if (!seen.has(c.id)){ seen.add(c.id); if (c.fe == null) c.fe = true; }
    }
    s.flags.feStamped = true;
  }
  if (s.deck && s.deck.length > MAX_DECK) s.deck = s.deck.slice(0, MAX_DECK);
  return s;
}
/**
 * Mint one card instance. THE only place a card enters the collection.
 *
 * There were four near-identical copies of this line (scribe, buyPack, dropCards, buyCard) plus a
 * fifth in newGame, and adding printings to a card meant getting the same three fields right in
 * five places — exactly the drift that put the logic.js catalog out of sync with cards.js. One
 * function, and a printing can no longer be applied inconsistently.
 *
 * `luck` scales the odds of a rare printing: packs are luckier than a card bought off the shelf.
 * First edition is decided BEFORE the push, so a card is never its own predecessor.
 */
export function mintCard(s, cardId, roll, opts = {}){
  const inst = {
    uid: uid(), id: cardId, roll, graded: false,
    variant: opts.variant || VAR.rollVariant(rng, opts.luck || 1),
  };
  if (VAR.firstEditionFor(s.cards, cardId)) inst.fe = true;
  s.cards.push(inst);
  return inst;
}
/** A card instance's value, including its printing and first-edition stamp. */
export function instanceValue(c){ return VAR.valueOf(c, cardValue(c.id, c.roll)); }

let _uid = 0; export function uid(){ return "c" + (Date.now().toString(36)) + (++_uid).toString(36) + Math.floor(rng()*1000); }

// ---------- Leveling ----------
export function setSchool(s, school){ s.school = school; }
// Each school grants its own starter cards so the choice is meaningful.
export const SCHOOL_STARTER = {
  fire: ["fire_cat","fire_elf","firebolt","fire_dragon"],
  ice: ["ice_golem","frost_giant","ice_armor","frost_shield"],
  storm: ["storm_bat","storm_shark","storm_shift","lightning"],
  myth: ["myth_walker","minotaur","myth_blast","basilisk"],
  life: ["pixie","unicorn","healing_wave","satyr"],
  death: ["skeleton","ghoul","dark_pact","vampire"],
  balance: ["novice","sunbird","balance_blade","golden_golem"],
};
export function issueSchoolStarter(s, school){
  const ids = SCHOOL_STARTER[school] || [];
  for (const id of ids){
    for (let i=0;i<3;i++) mintCard(s, id, Math.floor(rng()*101), { variant:"normal" });
  }
}
export function xpForLevel(l){ return Math.floor(50*l + l*l*2.5); }
export function wizardLevel(xp){ let l=1, need=xpForLevel(1); while(xp>=need){ l++; need += xpForLevel(l); } return l; }
export function addWizardXp(s, amt){ s.xp += amt; s.level = wizardLevel(s.xp); }
export function skillLevel(s, skill){ return s.skills[skill]; }
export function addSkillXp(s, skill, amt){
  const tavern = s.home.owned ? s.home.upgrades.tavern : 0;
  amt = Math.round(amt * (1 + tavern*0.10));
  s.skillXp[skill] += amt;
  while (s.skillXp[skill] >= xpForLevel(s.skills[skill])){ s.skillXp[skill] -= xpForLevel(s.skills[skill]); s.skills[skill]++; }
}
export function addItem(s, id, n=1){ s.inventory[id] = (s.inventory[id]||0) + n; }
export function hasItems(s, req){ return Object.entries(req).every(([id,n]) => (s.inventory[id]||0) >= n); }
export function removeItems(s, req){ for (const [id,n] of Object.entries(req)) s.inventory[id] -= n; }
export function gainGold(s, amt){ s.gold += Math.round(amt); }

// ---------- Skills: gather / craft ----------
export function canGather(s, mat){ return skillLevel(s, mat.skill) >= mat.lvl; }
export function gather(s, mat){
  if (!canGather(s, mat)) return { ok:false, err:"level" };
  // "Husbandry", taught in the field-studies classes: a chance at a second unit. One of the four
  // places a lesson changes an existing system rather than adding a number to a screen.
  const bonus = masteries(s).gatherBonus;
  const extra = bonus > 0 && rng() * 100 < bonus ? 1 : 0;
  addItem(s, mat.id, 1 + extra); addSkillXp(s, mat.skill, mat.xp);
  dailyProgress(s, "gather");
  return { ok:true, item:mat, xp:mat.xp, extra };
}
export function canCraft(s, spec){ return skillLevel(s,"smithing") >= spec.lvl && hasItems(s, spec.req); }
export function smelt(s, bar){
  if (!canCraft(s, bar)) return { ok:false, err:'level' };
  removeItems(s, bar.req); addItem(s, bar.id, 1); addSkillXp(s,"smithing", bar.xp);
  return { ok:true, item:bar, xp:bar.xp };
}
export function forge(s, equip){
  if (skillLevel(s,"smithing") < equip.lvl) return { ok:false, err:'level' };
  if ((s.inventory[equip.barId]||0) < equip.bars) return { ok:false, err:'resources' };
  s.inventory[equip.barId] -= equip.bars;
  s.equipment.push({ uid:uid(), id:equip.id, metal:equip.metal, slot:equip.slot, tier:equip.tier });
  addSkillXp(s,"smithing", equip.tier*25 + 10);
  return { ok:true, item:equip };
}
export function brew(s, potion){
  if (skillLevel(s,"alchemy") < potion.lvl) return { ok:false, err:'level' };
  if (!hasItems(s, potion.req)) return { ok:false, err:'resources' };
  removeItems(s, potion.req); addItem(s, potion.id, 1); addSkillXp(s,"alchemy", potion.xp);
  return { ok:true, item:potion };
}

// ---------- Scribing (the Arcanum card-craft loop) ----------
// Refine one raw material into a card material (canvas <- wood, ink <- fish, reagent <- ore).
export function refine(s, cardMatId, sourceId){
  const cm = CARD_MATERIALS.find(m=>m.id===cardMatId);
  if (!cm || !cm.from.includes(sourceId)) return {ok:false};
  if ((s.inventory[sourceId]||0) < 1) return { ok:false, err:"resources" };
  s.inventory[sourceId]--; s.inventory[cardMatId] = (s.inventory[cardMatId]||0)+1;
  s.stats.refined = (s.stats.refined || 0) + 1;
  addSkillXp(s, "scribing", cm.xp);
  return { ok:true, item:cm };
}
// Scribe a card: 1 canvas + 1 ink + 1 reagent -> a random card. Higher Scribing skill -> better grades.
export function scribe(s){
  if ((s.inventory.canvas||0) < 1 || (s.inventory.ink||0) < 1 || (s.inventory.reagent||0) < 1) return { ok:false, err:"materials" };
  s.inventory.canvas--; s.inventory.ink--; s.inventory.reagent--;
  const lvl = skillLevel(s,"scribing");
  // Skill sets the floor; "Penmanship" from the scribing classes adds on top of it.
  const bonus = Math.min(30, Math.floor(lvl * 0.3)) + masteries(s).scribeBonus;
  const roll = Math.min(100, Math.max(0, Math.floor(rng()*100) + bonus));
  const c = randomCardOfRarity(rollRarity());
  // Scribed cards are slightly luckier than shop stock — the player made this one.
  const inst = mintCard(s, c.id, roll, { luck: 1.25 });
  s.stats.scribed = (s.stats.scribed || 0) + 1;
  addSkillXp(s, "scribing", 30);
  dailyProgress(s, "scribe");
  return { ok:true, inst };
}
export function countSlabs(s){ return s.cards.filter(c=>c.graded && gradeForRoll(c.roll).slab).length; }

// ---------- Daily quest / login + academy rank ----------
export function todayStr(){ return new Date().toISOString().slice(0,10); }
export function checkDaily(s){
  if (!s.daily) s.daily = { date:"", type:"win", progress:0, target:3, claimed:false };
  if (s.daily.date !== todayStr()){
    s.daily.date = todayStr(); s.daily.claimed = false; s.daily.progress = 0;
    const types = ["win","gather","scribe"];
    s.daily.type = types[Math.floor(rng()*types.length)];
    s.daily.target = s.daily.type==="win" ? 3 : s.daily.type==="gather" ? 12 : 3;
  }
  return s.daily;
}
export function dailyProgress(s, type){
  checkDaily(s);
  if (s.daily.type === type && !s.daily.claimed && s.daily.progress < s.daily.target) s.daily.progress++;
}
export function claimDaily(s){
  checkDaily(s);
  if (s.daily.claimed || s.daily.progress < s.daily.target) return {ok:false};
  s.daily.claimed = true;
  const reward = 150 + s.level*10;
  gainGold(s, reward);
  const drops = dropCards(s, 2);
  return {ok:true, reward, drops};
}
export function dailyLabel(s){
  const d = checkDaily(s);
  return { type: d.type, text: d.type==="win" ? "Win duels" : d.type==="gather" ? "Gather materials" : "Scribe cards", progress: d.progress, target: d.target, claimed: d.claimed };
}
// Score/tier names live in academy.js now (BACKLOG "Academy progression"), which also defines
// what a rank actually UNLOCKS. This kept the exact formula and the seven names untouched, so an
// existing save's rank does not shift under it — only what the rank DOES is new.
export function academyScore(s){ return s.level + Math.floor(totalCollectionValue(s)/1000) + s.stats.won; }
export function academyRank(s){ return ACADEMY.yearFor(academyScore(s)).name; }
export function academyPerks(s){ return ACADEMY.perksFor(academyScore(s)); }
// Techniques learned in class (lessons.js). Derived from the classes PASSED, never stored, so
// re-tuning what a class teaches applies to every existing save with no migration.
export function masteries(s){ return LESSONS.masteryFor(s); }

// ---------- Equipment / loadout ----------
export function equipStats(s){
  const stats = { atk:0, def:0, hp:0, pip:0, gold:0 };
  for (const slot of Object.keys(s.loadout)){
    const uid = s.loadout[slot]; if (!uid) continue;
    const eq = s.equipment.find(e=>e.uid===uid); if (!eq) continue;
    const def = equipmentFor(eq.metal, eq.slot).stats;
    for (const k of Object.keys(def)) stats[k] += def[k];
  }
  const armory = s.home.owned ? s.home.upgrades.armory : 0;
  if (armory) for (const k of ["atk","def","hp"]) stats[k] = Math.round(stats[k] * (1 + armory*0.05));
  return stats;
}
export function equip(s, uidE){
  const eq = s.equipment.find(e=>e.uid===uidE); if (!eq) return {ok:false};
  s.loadout[eq.slot] = uidE; return {ok:true};
}
export function unequip(s, slot){ s.loadout[slot] = null; return {ok:true}; }

// ---------- Cards: packs, drops, grade, sell ----------
const RARITY_POOL = [ ["common",60],["uncommon",25],["rare",11],["epic",3],["legendary",1] ];
function rollRarity(){ let r = rng()*100; for (const [k,w] of RARITY_POOL){ if (r<w) return k; r-=w; } return "common"; }
function randomCardOfRarity(rarity){
  const pool = CARDS.filter(c=>c.rarity===rarity);
  return pool[Math.floor(rng()*pool.length)];
}
export function openPack(s){
  if (s.gold < PACK_COST) return { ok:false, err:"gold" };
  s.gold -= PACK_COST; s.stats.packs++;
  const drops = [];
  for (let i=0;i<5;i++){
    const c = randomCardOfRarity(rollRarity());
    // A pack is where a foil is SUPPOSED to come from, so it carries the best odds in the game.
    drops.push(mintCard(s, c.id, Math.floor(rng()*101), { luck: 2 }));
  }
  return { ok:true, drops };
}
export function dropCards(s, n=3){
  const drops = [];
  for (let i=0;i<n;i++){
    const c = randomCardOfRarity(rollRarity());
    drops.push(mintCard(s, c.id, Math.floor(rng()*101), { luck: 1.4 }));
  }
  return drops;
}
/** A grading fee after the Appraisal discount. Floored at 1 so a fee never becomes free or negative. */
export function gradeCost(s, base){
  const pct = Math.min(90, masteries(s).gradeDiscount);
  return Math.max(1, Math.round(base * (1 - pct / 100)));
}
export function gradeCard(s, uidC){
  const c = s.cards.find(x=>x.uid===uidC); if (!c || c.graded) return {ok:false};
  // "Appraisal", from the grading classes: a discount, so it SUBTRACTS. applyBonus() is built for
  // rewards (which go up) and using it here would make a better-taught wizard pay more — the same
  // trap buyCard's market discount already documents.
  const fee = gradeCost(s, gradeFee(c.id));
  if (s.gold < fee) return { ok:false, err:"gold" };
  s.gold -= fee; c.graded = true; s.stats.graded++;
  const g = gradeForRoll(c.roll);
  if (g.slab){ c.serial = (s.slabCounter||0) + 1000; s.slabCounter = c.serial; s.stats.slabs++; }
  return { ok:true, grade: g };
}
// Regrade: risk/reward — re-roll an already-graded card's grade for a higher fee (could go up or down).
export function regradeCard(s, uidC){
  const c = s.cards.find(x=>x.uid===uidC); if (!c || !c.graded) return {ok:false};
  const fee = gradeCost(s, Math.round(gradeFee(c.id) * 1.5));
  if (s.gold < fee) return { ok:false, err:"gold" };
  s.gold -= fee;
  const old = gradeForRoll(c.roll);
  c.roll = Math.floor(rng()*101);
  const g = gradeForRoll(c.roll);
  if (g.slab && !old.slab){ c.serial = (s.slabCounter||0)+1000; s.slabCounter = c.serial; s.stats.slabs++; }
  if (!g.slab && c.serial != null) delete c.serial;
  return { ok:true, old, grade: g };
}
export function sellCard(s, uidC){
  const i = s.cards.findIndex(x=>x.uid===uidC); if (i<0) return {ok:false};
  const c = s.cards[i];
  // "Haggling", from the market and duelling classes.
  const value = ACADEMY.applyBonus(instanceValue(c), masteries(s).sellBonus);
  s.gold += value; s.cards.splice(i,1);
  return { ok:true, value };
}
export function buyCard(s, id){
  const c = CARD_MAP[id]; const base = RARITY[c.rarity].base * 2;
  // A discount reduces price, so the bonus percentage is subtracted rather than added — applying
  // applyBonus() (built for rewards, which go up) here would make higher rank COST more.
  const price = Math.max(1, ACADEMY.applyBonus(base, -academyPerks(s).market));
  if (s.gold < price) return { ok:false, err:"gold" };
  s.gold -= price;
  // Bought off the shelf: no luck bonus. A guaranteed card should not also be a lottery ticket.
  mintCard(s, id, Math.floor(rng()*101));
  return { ok:true, price };
}
export function sellItem(s, itemId, qty=1){
  const mat = MATERIALS.find(m=>m.id===itemId) || BARS.find(b=>b.id===itemId) || POTIONS.find(p=>p.id===itemId);
  if (!mat || (s.inventory[itemId]||0) < qty) return {ok:false};
  s.inventory[itemId] -= qty; s.gold += mat.value * qty;
  return { ok:true, value: mat.value*qty };
}
export function sellEquipment(s, uidE){
  const i = s.equipment.findIndex(e=>e.uid===uidE); if (i<0) return {ok:false};
  const e = s.equipment[i]; const def = equipmentFor(e.metal, e.slot).value;
  // unequip if equipped
  for (const slot of Object.keys(s.loadout)) if (s.loadout[slot]===uidE) s.loadout[slot]=null;
  s.equipment.splice(i,1); s.gold += def;
  return { ok:true, value: def };
}

// ---------- Deck building ----------
export function deckCounts(deck){ const m={}; for (const id of deck) m[id]=(m[id]||0)+1; return m; }
export function deckValid(s){ return s.deck.length===MAX_DECK; }
export function addToDeck(s, id){
  const own = s.cards.filter(c=>c.id===id).length;
  if (deckCounts(s.deck)[id] >= own) return { ok:false, err:"copies" };
  if (deckCounts(s.deck)[id] >= MAX_COPIES) return { ok:false, err:"max" };
  if (s.deck.length >= MAX_DECK) return { ok:false, err:"full" };
  s.deck.push(id); return { ok:true };
}
export function removeFromDeck(s, id){ const i = s.deck.lastIndexOf(id); if (i>=0) s.deck.splice(i,1); return {ok:true}; }

// ---------- Auctions (simulated) ----------
export const AUCTION_MS = 60000;
// Auctions are persisted to localStorage, so their deadline must be a wall-clock timestamp.
// They used to store performance.now() + 60s — but performance.now() restarts at 0 on every
// page load, so after any reload every listing was already "expired" and paid out instantly at
// the base price with no bidding.
export function listAuction(s, uidC, price){
  const i = s.cards.findIndex(c=>c.uid===uidC); if (i<0) return {ok:false};
  const c = s.cards[i];
  s.auctions.push({ id:uid(), card: c, price, bid:0, bidder:null, ends: Date.now() + AUCTION_MS, t: 0 });
  s.cards.splice(i,1);
  return { ok:true };
}
export function auctionTick(s){
  const now = Date.now();
  const settled = [];
  for (const a of s.auctions){
    // NPCs occasionally bid up over time
    a.t += 1;
    if (a.t % 12 === 0 && a.bid < a.price * 2.2){
      const raise = Math.max(1, Math.round(a.price * 0.05 + rng()*a.price*0.1));
      a.bid += raise; a.bidder = "NPC";
    }
  }
  s.auctions = s.auctions.filter(a => {
    if (now < a.ends) return true;
    // expired: pay the seller the winning bid (or the reserve if nobody bid)
    const pay = a.bid || a.price;
    s.gold += pay;
    settled.push({ id:a.id, card:a.card, pay, bidder:a.bidder });
    return false;
  });
  return settled;
}
// Settle any auctions that ran out while the game was closed. Called once on load: without it,
// a listing left running across a session would sit in the list forever until the market screen
// happened to tick.
export function settleAuctions(s){
  if (!s.auctions || !s.auctions.length) return [];
  const now = Date.now();
  // A save from before the Date.now() switch carries a tiny performance.now()-based deadline;
  // treat those as due now rather than leaving them stuck in the past forever.
  for (const a of s.auctions) if (a.ends < 1e12) a.ends = now;
  return auctionTick(s);
}
export function collectAuction(s, id){ return {ok:true}; } // payout handled on expiry

// ---------- Home ----------
export function buyHome(s){ if (s.home.owned) return {ok:false}; if (s.gold < 200) return {ok:false,err:"gold"}; s.gold-=200; s.home.owned=true; return {ok:true}; }
export function upgradeHome(s, id){
  const u = HOME_UPGRADES.find(x=>x.id===id); if (!u) return {ok:false};
  const n = s.home.upgrades[id];
  if (n >= u.max) return {ok:false};
  const cost = u.cost(n), timber = u.timber(n);
  if (s.gold < cost) return {ok:false,err:"gold"};
  if ((s.inventory.oak_log||0) < timber) return {ok:false,err:"timber"};
  s.gold -= cost; s.inventory.oak_log -= timber; s.home.upgrades[id] = n+1;
  return {ok:true};
}

// ---------- Quests (bosses) ----------
// `archetype` (archetypes.js) gives each rival its own BATTLE PERSONALITY on top of its
// hand-authored deck — the deck stays exactly as designed, only how it is PLAYED changes.
// Defaults to "midrange" (the old, only, unconditional behaviour) when not given.
const q = (id,name,title,school,deck,hp,reward,dropN,gear,archetype)=>({id,name,title,school,deck,hp,reward,dropN,gear,archetype:archetype||"midrange"});
export const QUESTS = [
  q(0,"Battle Mage","The Academy Rookie","fire",["fire_cat","fire_cat","fire_elf","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf"], 40, 120, 2, {hp:0,atk:0,def:0,pip:0}, "aggro"),
  q(1,"The Sprite","A Garden Guardian","life",["pixie","pixie","healing_wave","unicorn","healing_wave","pixie","unicorn","pixie","healing_wave","satyr","pixie","unicorn","healing_wave","pixie","unicorn","elixir","pixie","healing_wave","pixie","unicorn"], 60, 180, 3, {hp:5,atk:0,def:1,pip:0}, "control"),
  q(2,"Stone Golem","The Balance of Power","balance",["novice","balance_blade","sunbird","golden_golem","balance_blade","novice","sunbird","golden_golem","balance_blade","novice","balance_blade","sunbird","golden_golem","master_wand","novice","sunbird","balance_blade","golden_golem","balance_dragon","master_wand"], 75, 260, 3, {hp:8,atk:1,def:1,pip:0}, "control"),
  q(3,"Death Knight","Champion of the Underworld","death",["skeleton","dark_pact","ghoul","vampire","dark_pact","skeleton","ghoul","vampire","dark_pact","skeleton","ghoul","dark_pact","vampire","skeleton","ghoul","dark_pact","vampire","skeleton","ghoul","reaper"], 90, 360, 4, {hp:10,atk:1,def:2,pip:0}, "control"),
  q(4,"Storm Caller","Lord of the Tempest","storm",["storm_bat","storm_shift","storm_shift","storm_bat","storm_shift","storm_bat","storm_shift","storm_shift","storm_bat","storm_shift","storm_bat","storm_shift","storm_shift","storm_bat","storm_shift","storm_bat","storm_shift","storm_shift","storm_bat","storm_shift"], 60, 500, 4, {hp:6,atk:2,def:1,pip:0}, "tempo"),
  q(5,"Ice Queen","Guardian of the Frost","ice",["ice_golem","ice_armor","frost_shield","frost_giant","ice_armor","ice_golem","frost_shield","frost_giant","ice_armor","ice_golem","frost_giant","ice_armor","frost_shield","frost_giant","ice_golem","frost_giant","ice_armor","blizzard","ice_wyrm","frost_shield"], 110, 700, 5, {hp:15,atk:2,def:2,pip:0}, "control"),
  q(6,"Myth Master","Keeper of the Beasts","myth",["myth_walker","myth_blast","minotaur","basilisk","myth_blast","myth_walker","minotaur","basilisk","myth_blast","myth_walker","minotaur","basilisk","myth_blast","hydra","myth_walker","minotaur","basilisk","hydra","myth_blast","minotaur"], 120, 900, 5, {hp:15,atk:3,def:2,pip:1}, "tempo"),
  q(7,"The Archon","Final Trial of the Arcane","balance",["balance_streak","sunbird","master_wand","golden_golem","arcane_guardian","balance_dragon","hydra","reaper","ice_wyrm","basilisk","balance_streak","sunbird","arcane_guardian","balance_dragon","hydra","reaper","ice_wyrm","blizzard","master_wand","golden_golem"], 95, 1500, 6, {hp:15,atk:3,def:2,pip:1}, "boss"),
];
export function currentQuest(s){ return QUESTS[s.quests.current]; }
export function questDone(s, id){ return s.quests.done.includes(id); }
export function canDoQuest(s, i){ return i===0 || s.quests.done.includes(i-1); }
export function completeQuest(s, i){
  const qq = QUESTS[i];
  if (s.quests.done.includes(i)) return {ok:false};
  const perks = academyPerks(s);   // read BEFORE the xp/level change this call makes
  addWizardXp(s, ACADEMY.applyBonus(100 + i*60, perks.xp));
  gainGold(s, ACADEMY.applyBonus(qq.reward, perks.questGold));
  s.quests.done.push(i);
  if (s.quests.current === i) s.quests.current = i+1;
  const drops = dropCards(s, qq.dropN);
  return { ok:true, drops };
}

// ---------- Pack / drop helpers ----------
export function goldBonus(s){ return equipStats(s).gold; }

// ---------- Duel engine (local PvE / AI PvP) ----------
function makeCreature(cardId, p){
  const c = CARD_MAP[cardId];
  const atk = c.atk + (p.atkBonus||0) + fieldAtkBonus(p) + (p.school && c.school === p.school ? 1 : 0); // school affinity
  const fx = c.fx || [];
  return {
    uid: uid(), id: cardId, school: c.school, name: c.name, atk, hp: c.hp, maxHp: c.hp,
    exhausted:false, summoning:true, taunt: fx.includes("taunt"), haste: fx.includes("haste"),
    drain: fx.includes("drain"), multi: fx.includes("multiAttack")?2:1, attacks:0, freeze:0, owner: p.id,
  };
}
// Shuffles use the battle's own RNG so a duel is reproducible from its seed (the `gear` argument
// was never used — the shuffle doesn't depend on equipment).
function buildDeck(defs, rand){
  const d = [...defs];
  for (let i=d.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}
function schoolBonus(att, def){ return SCHOOL_BONUS.some(([a,b])=>a===att && b===def) ? 1 : 0; }
function damageWizard(p, dmg, defBonus){
  dmg = Math.max(0, dmg - (defBonus||0));
  const absorb = Math.min(p.shield, dmg); p.shield -= absorb; dmg -= absorb;
  p.hp -= dmg;
}
// A duel cannot run forever: after MAX_TURNS the higher-HP wizard takes it, equal HP is a draw.
export const MAX_TURNS = 100;
// Pass a `seed` to replay an exact duel (same shuffle, same draws) — used by the tests and
// useful for reproducing a reported bug. Omit it and one is drawn for you.
export function startDuel(playerCardIds, playerGear, enemyDefs, enemyGear, enemyHp=100, playerSchool="balance", enemySchool="balance", seed=null){
  const s = seed == null ? (rng()*4294967296)>>>0 : seed>>>0;
  const rand = mulberry32(s);
  const you = { id:"you", school:playerSchool, hp:100+playerGear.hp, maxHp:100+playerGear.hp, shield:0, maxPips:1+playerGear.pip, pips:1+playerGear.pip, hand:[], deck:buildDeck(playerCardIds, rand), board:[], field:[], traps:[], atkBonus:playerGear.atk, defBonus:playerGear.def, fatigue:0 };
  const enemy = { id:"enemy", school:enemySchool, hp:enemyHp, maxHp:enemyHp, shield:0, maxPips:1+enemyGear.pip, pips:1+enemyGear.pip, hand:[], deck:buildDeck(enemyDefs, rand), board:[], field:[], traps:[], atkBonus:enemyGear.atk, defBonus:enemyGear.def, fatigue:0 };
  const b = { you, enemy, turn:"you", phase:"play", winner:null, log:[], seed:s, rand, turns:0 };
  for (let i=0;i<5;i++){ draw(you); draw(enemy); }  // 5-card opening hand
  return b;
}
function draw(p){ if (p.hand.length >= 10) return; if (p.deck.length){ p.hand.push(p.deck.pop()); } }
export function beginTurn(b, p){
  p.maxPips = Math.min(10, p.maxPips + 1);
  let pipBonus = 0;
  if (p.field) for (const f of p.field){
    const def = CARD_MAP[f.id];
    for (const fx of def.fx){
      if (fx.k === "fieldPip") pipBonus += fx.n;
      if (fx.k === "fieldHeal") p.hp = Math.min(p.maxHp, p.hp + fx.n);
    }
  }
  p.pips = Math.min(10, p.maxPips + pipBonus);
  if (p.deck.length) draw(p);
  else { p.fatigue = (p.fatigue||0) + 1; p.hp -= p.fatigue; b.log.push(p.id+" takes "+p.fatigue+" fatigue"); }
  p.potionUsed = false;   // one potion per turn (see usePotion)
  // NB: freeze is NOT cleared here — it ticks down at the END of the frozen player's turn
  // (see endTurn), so a creature frozen on the opponent's turn actually misses one turn.
  for (const c of p.board){ c.exhausted = false; c.attacks = 0; }
}
export function fieldAtkBonus(p){
  let n = 0;
  if (p.field) for (const f of p.field){ const def = CARD_MAP[f.id]; for (const fx of def.fx) if (fx.k === "fieldAtk") n += fx.n; }
  return n;
}
export function canPlay(b, p, handIndex){
  const id = p.hand[handIndex]; if (!id) return {ok:false};
  const c = CARD_MAP[id];
  return p.pips >= c.cost ? {ok:true} : {ok:false, err:"pips"};
}
// The side opposing a given player. Spell effects must resolve against the CASTER's opponent,
// not the fixed b.enemy slot — otherwise the AI's AoE damages its own board and wizard.
export function foeOf(b, owner){ return owner === b.you ? b.enemy : b.you; }
// The UI passes a target descriptor ({kind:"wiz"} / {kind:"creature", idx}), not an entity.
// Resolve it to the real creature or wizard before applying damage.
function resolveTarget(b, foe, target){
  if (!target) return foe;
  if (target.kind === "creature") return foe.board[target.idx] || null;
  return foe;  // "wiz" (or an unrecognised descriptor) hits the opposing wizard
}
const applyFx = (b, owner, fx, zone) => {
  const foe = foeOf(b, owner);
  for (const f of fx){
    if (typeof f === "string") continue;
    if (f.k === "dmg"){
      const t = resolveTarget(b, foe, zone && zone.target);
      if (!t) continue;
      if (t === foe) damageWizard(foe, f.n, foe.defBonus);
      else t.hp -= f.n;                       // creatures have no shield/defBonus
    }
    else if (f.k === "dmgAll"){ for (const c of [...foe.board]) c.hp -= f.n; }
    else if (f.k === "dmgWiz"){ damageWizard(foe, f.n, foe.defBonus); }
    else if (f.k === "heal"){ owner.hp = Math.min(owner.maxHp, owner.hp + f.n); }
    else if (f.k === "shield"){ owner.shield += f.n; }
    else if (f.k === "buffAll"){ for (const c of owner.board) c.atk += f.n; }
    else if (f.k === "draw"){ for (let i=0;i<f.n;i++) draw(owner); }
    else if (f.k === "freezeAll"){ for (const c of foe.board) c.freeze = 1; }
  }
  // cleanup deaths
  for (const side of [b.you, b.enemy]) side.board = side.board.filter(c => c.hp > 0);
};
export function playCard(b, p, handIndex, target){
  const id = p.hand[handIndex]; const c = CARD_MAP[id];
  p.pips -= c.cost; p.hand.splice(handIndex,1);
  b.log.push(p.id+" plays "+c.name);
  const enemy = p.id==="you" ? b.enemy : b.you;
  if (c.type === "creature"){
    const cr = makeCreature(id, p);
    for (const f of c.fx){
      if (typeof f === "string"){ if (f==="healPlay") p.hp = Math.min(p.maxHp, p.hp + (c.fx.find(x=>x.k==="healPlay")?.n||0)); }
      else if (f.k==="healPlay") p.hp = Math.min(p.maxHp, p.hp + f.n);
      else if (f.k==="buffAll") for (const x of p.board) x.atk += f.n;
    }
    if (cr.haste) cr.summoning = false;
    p.board.push(cr);
    // enemy traps trigger on creature play
    if (enemy.traps && enemy.traps.length){
      const t = enemy.traps.shift();
      for (const fx of t.fx) if (fx.k === "trapDmg"){ cr.hp -= fx.n; b.log.push("Trap! "+cr.name+" takes "+fx.n+" damage"); }
    }
    if (cr.hp <= 0) p.board = p.board.filter(x=>x.uid!==cr.uid);
  } else if (c.type === "field"){
    p.field = p.field || [];
    p.field.push({ id });
    for (const f of c.fx) if (f.k === "fieldAtk") for (const x of p.board) x.atk += f.n;
  } else if (c.type === "trap"){
    p.traps = p.traps || [];
    p.traps.push({ fx: c.fx });
  } else {
    applyFx(b, p, c.fx, { target });
  }
  return {ok:true};
}
export function attack(b, attackerIdx, targetKind, targetIdx){
  const p = b[b.turn];
  const atk = p.board[attackerIdx]; if (!atk) return {ok:false,err:"no creature"};
  if (atk.freeze > 0) return {ok:false,err:"frozen"};
  if (atk.exhausted || atk.summoning) return {ok:false,err:"tired"};
  if (atk.attacks >= atk.multi) return {ok:false,err:"tired"};
  const enemy = b.turn==="you" ? b.enemy : b.you;
  // taunt check
  if (targetKind === "wiz" && enemy.board.some(c=>c.taunt && c.hp>0)) return {ok:false,err:"taunt"};
  let dmg = atk.atk;
  if (targetKind === "creature"){
    const t = enemy.board[targetIdx]; if (!t) return {ok:false};
    dmg += schoolBonus(atk.school, t.school);
    t.hp -= dmg;
    // Drain heals the ATTACKER's wizard for damage dealt (it used to heal the defender,
    // which made every Death-school creature a liability to its own owner).
    if (atk.drain) p.hp = Math.min(p.maxHp, p.hp + dmg);
    enemy.board = enemy.board.filter(c=>c.hp>0);
    // retaliation (damage taken — never a drain heal)
    if (t.hp > 0) atk.hp -= t.atk;
  } else {
    damageWizard(enemy, dmg, enemy.defBonus);
    if (atk.drain) p.hp = Math.min(p.maxHp, p.hp + dmg);
  }
  atk.attacks++;
  if (atk.attacks >= atk.multi) atk.exhausted = true;
  p.board = p.board.filter(c=>c.hp>0);
  // defender traps trigger on attack
  if (enemy.traps && enemy.traps.length){
    const t = enemy.traps.shift();
    for (const fx of t.fx) if (fx.k === "trapShield"){ enemy.shield += fx.n; b.log.push("Trap! +"+fx.n+" shield"); }
  }
  b.log.push(p.id+" attacks "+targetKind);
  return {ok:true};
}
// Drink a brewed potion mid-duel. Costs 1 pip and is limited to one per turn, so Alchemy is a
// real comeback option without letting a stack of potions stall the game out.
// This is what makes the Alchemy skill worth levelling — potions were previously craftable but
// had no use at all except vendoring them below the value of the raw fish.
export function usePotion(s, b, p, potionId){
  const pot = POTIONS.find(x => x.id === potionId);
  if (!pot) return { ok:false };
  if (isOver(b).over) return { ok:false, err:"over" };
  if (b.turn !== p.id) return { ok:false, err:"turn" };
  if (p.potionUsed) return { ok:false, err:"used" };
  if (p.pips < 1) return { ok:false, err:"pips" };
  if ((s.inventory[potionId]||0) < 1) return { ok:false, err:"resources" };
  s.inventory[potionId]--;
  p.pips -= 1;
  p.potionUsed = true;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + pot.heal);
  b.log.push(p.id + " drinks " + pot.name);
  return { ok:true, healed: p.hp - before, potion: pot };
}
// Potions the player currently holds, for the duel UI.
export function heldPotions(s){
  return POTIONS.filter(p => (s.inventory[p.id]||0) > 0).map(p => ({ ...p, count: s.inventory[p.id] }));
}
export function endTurn(b){
  const outgoing = b[b.turn];
  if (outgoing) for (const c of outgoing.board) if (c.freeze > 0) c.freeze--;
  beginTurn(b, b.turn==="you" ? b.enemy : b.you);
  b.turn = b.turn==="you" ? "enemy" : "you";
  b.turns = (b.turns || 0) + 1;
  return {ok:true};
}
export function isOver(b){
  if (!b || !b.you || !b.enemy) return { over:false };
  if (b.you.hp <= 0 && b.enemy.hp <= 0) return { over:true, winner:null, draw:true, reason:"double knockout" };
  if (b.you.hp <= 0) return { over:true, winner:"enemy" };
  if (b.enemy.hp <= 0) return { over:true, winner:"you" };
  if ((b.turns || 0) >= MAX_TURNS){
    if (b.you.hp === b.enemy.hp) return { over:true, winner:null, draw:true, reason:"turn limit" };
    return { over:true, winner: b.you.hp > b.enemy.hp ? "you" : "enemy", reason:"turn limit" };
  }
  return { over:false };
}
export function cleanDeaths(b){ b.you.board = b.you.board.filter(c=>c.hp>0); b.enemy.board = b.enemy.board.filter(c=>c.hp>0); }

// ---------- AI (archetypes.js decides WHAT the personality prefers; this carries it out) ----------
//
// `b.enemy.archetype` picks the personality. Absent, it resolves to "midrange" — which is defined
// in archetypes.js to reproduce the OLD unconditional behaviour exactly (descending cost, damage
// spells finish the weakest enemy creature, always race face unless a taunt forces a trade), so
// every existing call site and every existing test keeps its old behaviour with zero changes here.
export function aiTurn(b){
  const ai = b.enemy;
  const policy = ARCH.policyFor(ai.archetype);
  applyBossPhase(b, ai);

  // play ONE affordable card, ordered by the archetype's preference (cheap-first for Aggro,
  // priciest-first for everyone else — see archetypes.js `orderCards`)
  const playable = ai.hand.map((id,i)=>({id,i,cost:CARD_MAP[id].cost})).filter(x=>x.cost<=ai.pips);
  const ordered = ARCH.orderCards(policy, playable);
  for (const pick of ordered){
    const c = CARD_MAP[pick.id];
    if (c.type === "creature" || c.type === "field" || c.type === "trap"){ playCard(b, ai, pick.i, null); break; }
    if (c.type === "spell" && c.fx.some(f=>f.k==="dmg")){
      const enemyBoard = b.you.board.map(x=>({atk:x.atk, hp:x.hp}));
      const ownPower = ai.board.reduce((a,x)=>a+x.atk,0), enemyPower = b.you.board.reduce((a,x)=>a+x.atk,0);
      const t = ARCH.pickSpellTarget(policy, enemyBoard, ownPower, enemyPower);
      playCard(b, ai, pick.i, t === "face" ? {kind:"wiz"} : {kind:"creature", idx:t});
      b.you.board = b.you.board.filter(x=>x.hp>0);
      break;
    }
  }
  // attack: taunt is a RULE (every archetype obeys it); beyond that, the archetype decides
  // between a favourable trade and racing face — see archetypes.js `pickAttackTarget`.
  const you = b.you;
  for (const atk of ai.board){
    if (atk.exhausted || atk.summoning || isOver(b).over) continue;
    const tauntIdx = you.board.findIndex(c=>c.taunt && c.hp>0);
    const enemyBoard = you.board.map(x=>({atk:x.atk, hp:x.hp}));
    const target = ARCH.pickAttackTarget(policy, {atk:atk.atk, hp:atk.hp}, enemyBoard, tauntIdx>=0?tauntIdx:null);
    if (target === "face") attack(b, ai.board.indexOf(atk), "wiz", -1);
    else attack(b, ai.board.indexOf(atk), "creature", target);
  }
  endTurn(b);
}

// A boss's escalations (BACKLOG "multi-phase bosses"). Checked once per AI turn; a phase, once
// triggered, is permanent for the rest of the duel — `b.enemy.phasesApplied` is the record of
// which ones already fired, so healing back above a threshold cannot un-trigger it.
function applyBossPhase(b, ai){
  if (ai.archetype !== "boss" || ai.maxHp <= 0) return;
  ai.phasesApplied = ai.phasesApplied || [];
  // A LOOP, not a single check: a big player hit between the boss's turns can cross both
  // thresholds at once, and archetypes.js promises both fire "in order" when that happens rather
  // than making the boss wait a whole extra turn to catch up on the one it skipped.
  let phase;
  while ((phase = ARCH.nextBossPhase(ai.hp / ai.maxHp, ai.phasesApplied))){
    ai.phasesApplied.push(phase.id);
    for (const c of ai.board) c.atk += phase.buffAtk;
    ai.atkBonus = (ai.atkBonus || 0) + phase.buffAtk;   // creatures played AFTER the phase too
    ai.shield = (ai.shield || 0) + phase.shield;
    b.log.push(ai.id + " " + phase.log);
  }
}

// ---------- Self-test (smoke reference route) ----------
export function runSelfTest(){
  const log = [];
  const s = newGame();
  // reference: play Fire Cat turn 1, then build pips to Fire Dragon, attack, win
  const b = startDuel(s.deck, equipStats(s), QUESTS[0].deck, QUESTS[0].gear, QUESTS[0].hp);
  let steps = 0, guard = 0;
  while (!isOver(b).over && guard++ < 200){
    if (b.turn==="you"){
      const p = b.you;
      // flood the board with affordable creatures (pips refresh each turn)
      let played = true;
      while (played && !isOver(b).over){
        played = false;
        const playable = p.hand.map((id,i)=>({id,i})).filter(x=>CARD_MAP[x.id].cost<=p.pips && CARD_MAP[x.id].type==="creature").sort((a,b)=>CARD_MAP[b.id].cost-CARD_MAP[a.id].cost);
        for (const pick of playable){ playCard(b,p,pick.i,null); played=true; break; }
      }
      // cast removal spells on the weakest enemy creature (or face if none)
      let cast = true;
      while (cast && !isOver(b).over){
        cast = false;
        const removals = p.hand.map((id,i)=>({id,i})).filter(x=>CARD_MAP[x.id].cost<=p.pips && CARD_MAP[x.id].type==="spell" && CARD_MAP[x.id].fx.some(f=>f.k==="dmg")).sort((a,b)=>CARD_MAP[b.id].cost-CARD_MAP[a.id].cost);
        for (const pick of removals){
          const t = b.enemy.board.length ? b.enemy.board.reduce((m,x)=>x.hp<m.hp?x:m, b.enemy.board[0]) : null;
          playCard(b,p,pick.i, t?{kind:"creature",idx:b.enemy.board.indexOf(t)}:{kind:"wiz"});
          cast=true; break;
        }
      }
      // tempo: clear taunts, else race face
      for (const atk of [...b.you.board]){
        if (atk.exhausted || atk.summoning) continue;
        const taunt = b.enemy.board.find(c=>c.taunt && c.hp>0);
        if (taunt) attack(b, b.you.board.indexOf(atk), "creature", b.enemy.board.indexOf(taunt));
        else attack(b, b.you.board.indexOf(atk), "wiz", -1);
      }
      endTurn(b);
    } else { aiTurn(b); }
    steps++;
  }
  const over = isOver(b);
  log.push({ reference: over.over ? "won" : "stalled", winner: over.winner, steps });
  // contrast: never play anything → should lose
  const b2 = startDuel(s.deck, equipStats(s), QUESTS[0].deck, QUESTS[0].gear, QUESTS[0].hp);
  let g2=0; while(!isOver(b2).over && g2++<200){ aiTurn(b2); } // player never acts
  log.push({ contrast: isOver(b2).over ? "lost" : "stalled", winner: isOver(b2).winner });
  return log;
}

// ---------- getters for UI ----------
export function totalCollectionValue(s){
  return s.cards.reduce((m,c)=>m+instanceValue(c),0);
}
export function ownedCount(s, id){ return s.cards.filter(c=>c.id===id).length; }
export function cardInstance(s, uidC){ return s.cards.find(c=>c.uid===uidC); }