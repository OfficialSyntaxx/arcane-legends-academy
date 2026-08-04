// Engine smoke test — runs the card engine, economy, and economy-balance checks headlessly.
import * as G from "../public/game.js";
import { CARDS, CARD_MAP, cardValue, gradeForRoll, gradeFee, GRADES } from "../public/cards.js";
import { equipmentFor, BARS, POTIONS, MATERIALS, CARD_MATERIALS } from "../public/items.js";
import { WORLD_NODES, GATHERABLE } from "../public/nodes.js";
import * as ST from "../public/structures.js";
import { SFX as AUDIO_SFX } from "../public/audio.js";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const fsReadIndex = () => fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "index.html"), "utf8");

let pass = 0, fail = 0;
function check(name, cond){ if(cond) pass++; else { fail++; console.log("  ✗ FAIL:", name); } }

// Minimal localStorage so save/load/migrate can be exercised headlessly.
// game.js only touches it inside load()/save(), so installing it here is soon enough.
let _store = null;
globalThis.localStorage = { getItem(){ return _store; }, setItem(k,v){ _store = v; }, removeItem(){ _store = null; } };
function localStorage_stub(json){ _store = json; }

// ---- 1. deck validity ----
const s = G.newGame();
check("starter deck is 20", s.deck.length === 20);
// scribing
s.inventory.canvas = 3; s.inventory.ink = 3; s.inventory.reagent = 3;
const sc = G.scribe(s);
check("scribe produces a card", sc.ok && s.cards.length === 31);
check("scribe consumes materials", s.inventory.canvas === 2);
// refine
s.inventory.oak_log = 1;
const rn = G.refine(s, "canvas", "oak_log");
check("refine wood->canvas", rn.ok && (s.inventory.canvas||0) === 3);

// ---- 2. self-test duel (reference vs contrast) ----
const st = G.runSelfTest();
check("reference route wins", st[0].reference === "won");
check("contrast route loses", st[1].contrast === "lost");
check("reference winner is you", st[0].winner === "you");

// ---- 3. full combat loop sanity (no stall, no crash) ----
let b = G.startDuel(s.deck, G.equipStats(s), G.QUESTS[0].deck, G.QUESTS[0].gear);
let guard = 0;
while (!G.isOver(b).over && guard++ < 400){
  const p = b.turn==="you" ? b.you : b.enemy;
  if (p.id==="you"){
    const playable = p.hand.map((id,i)=>({id,i})).filter(x=>CARD_MAP[x.id].cost<=p.pips).sort((a,b)=>CARD_MAP[b.id].cost-CARD_MAP[a.id].cost);
    if (playable.length){ const c=CARD_MAP[playable[0].id]; if(c.type==="creature") G.playCard(b,p,playable[0].i,null); }
    for (const atk of b.you.board){ if(!atk.exhausted&&!atk.summoning) G.attack(b,b.you.board.indexOf(atk),"wiz",-1); }
    G.endTurn(b);
  } else G.aiTurn(b);
}
check("combat loop terminates with a winner", G.isOver(b).over);
check("no infinite loop", guard < 400);

// ---- 4. economy: pack, grade, sell ----
const s2 = G.newGame();
s2.gold = 10000;
const pk = G.openPack(s2);
check("pack costs gold and gives 5 cards", pk.ok && s2.cards.length === s.startC || pk.ok && s2.cards.length >= 10);
// find an ungraded card and grade it
const ungraded = s2.cards.find(c=>!c.graded);
const fee = gradeFee ? gradeFee(ungraded.id) : 10;
const before = s2.gold;
const gr = G.gradeCard(s2, ungraded.uid);
check("grading succeeds and costs gold", gr.ok && s2.gold < before);
check("graded card has a valid grade", gradeForRoll(ungraded.roll).name.length > 0);
const sr = G.sellCard(s2, ungraded.uid);
check("selling a graded card yields gold", sr.ok && sr.value > 0);

// ---- 4.3 world nodes: every recipe input must actually be obtainable ----
// (regression: tin, raw_shark and magic_log had recipes but no node, so Bronze Bars —
//  the first rung of the Smithing ladder — could never be smelted)
const missingNodes = [];
for (const b of BARS) for (const id of Object.keys(b.req)) if (!GATHERABLE.includes(id)) missingNodes.push(`${b.id} needs ${id}`);
for (const p of POTIONS) for (const id of Object.keys(p.req)) if (!GATHERABLE.includes(id)) missingNodes.push(`${p.id} needs ${id}`);
for (const cm of CARD_MATERIALS) for (const id of cm.from) if (!GATHERABLE.includes(id)) missingNodes.push(`${cm.id} needs ${id}`);
if (missingNodes.length) console.log("   unreachable:", missingNodes.join(", "));
check("every recipe input has a world node", missingNodes.length === 0);
check("every world node is a real material", WORLD_NODES.every(n => MATERIALS.some(m=>m.id===n.id)));
check("bronze bar (the first forge rung) is craftable from gathered ore", (()=>{
  const sb = G.newGame();
  const bronze = BARS.find(x=>x.id==="bar_bronze");
  for (const id of Object.keys(bronze.req)) G.gather(sb, MATERIALS.find(m=>m.id===id));
  return G.smelt(sb, bronze).ok;
})());
check("node positions are inside the world bounds", WORLD_NODES.every(n => Math.abs(n.x)<=ST.WORLD_BOUND && Math.abs(n.z)<=ST.WORLD_BOUND));
check("no two nodes overlap within interaction range", (()=>{
  for (let i=0;i<WORLD_NODES.length;i++) for (let j=i+1;j<WORLD_NODES.length;j++){
    const a = WORLD_NODES[i], b2 = WORLD_NODES[j];
    if (Math.hypot(a.x-b2.x, a.z-b2.z) < 4.6) return false;   // 4.6 = the register() radius
  }
  return true;
})());

// ---- 4.35 world collision: the academy must be solid AND walkable ----
const insideTower = ST.resolveCollisions(0, 0);
check("the central tower pushes the player out", Math.hypot(insideTower.x, insideTower.z) >= 8.2);
const insideHall = ST.resolveCollisions(-31, -14);
check("a building pushes the player out", !ST.isClear(-31, -14) && ST.isClear(insideHall.x, insideHall.z));
check("resolving is idempotent (no jitter loop)", (()=>{
  const a = ST.resolveCollisions(-31, -14);
  const b = ST.resolveCollisions(a.x, a.z);
  return Math.hypot(a.x-b.x, a.z-b.z) < 1e-9;
})());
check("open ground is left alone", ST.isClear(13, 40) && ST.isClear(-48, -48));
check("ponds are not solid (you fish from the shallows)",
  WORLD_NODES.filter(n=>n.kind==="pond").every(n => ST.isClear(n.x, n.z)));
// everything the player must reach has to be reachable
const unreachable = [];
for (const n of ST.NPCS) if (!ST.isClear(n.x, n.z)) unreachable.push("npc:"+n.key);
for (const b of ST.BUILDINGS){ if (b.noStation) continue; const d = ST.doorPos(b); if (!ST.isClear(d.x, d.z)) unreachable.push("door:"+b.id); }
for (const n of WORLD_NODES) if (!ST.isClear(n.x, n.z)) unreachable.push("node:"+n.id);
if (!ST.isClear(ST.PLAYER_SPAWN.x, ST.PLAYER_SPAWN.z)) unreachable.push("spawn");
if (unreachable.length) console.log("   sealed inside geometry:", unreachable.join(", "));
check("every NPC, door, node and the spawn point is standing clear", unreachable.length === 0);
// walking straight into a wall must never leave the player inside it — sliding around the
// building is fine and expected, so the assertion is "never inside", not "never past".
check("walking into a building never leaves the player inside it", (()=>{
  for (const b of ST.BUILDINGS){
    for (const dir of [[0,1],[0,-1],[1,0],[-1,0]]){
      let x = b.x - dir[0]*(b.w/2 + 4), z = b.z - dir[1]*(b.d/2 + 4);
      for (let step=0; step<200; step++){
        const r = ST.resolveCollisions(x + dir[0]*0.2, z + dir[1]*0.2, ST.PLAYER_RADIUS);
        x = r.x; z = r.z;
        if (!ST.isClear(x, z)) return false;
      }
    }
  }
  return true;
})());
// a big single step (a lag spike, or tap-to-move across the map) must not jump a wall
check("a large step still resolves out of a building", (()=>{
  const b = ST.BUILDINGS[0];
  const r = ST.resolveCollisions(b.x + 0.2, b.z + 0.2, ST.PLAYER_RADIUS);
  return ST.isClear(r.x, r.z);
})());
check("a swept path across the map stays out of every obstacle", (()=>{
  for (let a=0; a<24; a++){
    const ang = (a/24)*Math.PI*2;
    let x = 0.01, z = 0.01;
    for (let step=0; step<300; step++){
      const r = ST.resolveCollisions(x + Math.cos(ang)*0.4, z + Math.sin(ang)*0.4);
      x = r.x; z = r.z;
      if (!ST.isClear(x, z)) return false;
    }
  }
  return true;
})());

// The original bug was buildings 3.5-5.5m tall against 1.8m wizards — a "hall" barely 2.5 people
// high, which read as a model village. The thresholds below encode THAT property (height, and a
// footprint wide enough to hold a door), not the specific proportions of any one asset pack:
// the CC0 KayKit cottages are legitimately narrower than the generated Tripo halls were.
check("buildings are believably sized next to a 1.8m wizard", (()=>{
  const CH = 1.8;
  const bad = ST.BUILDINGS.filter(b => !(b.h >= CH*3.5 && b.w >= CH*3 && b.d >= CH*3));
  if (bad.length) console.log("   undersized:", bad.map(b=>`${b.id} ${b.w}x${b.d}x${b.h}`).join(", "));
  return bad.length === 0;
})());
check("every building model path resolves to a file that exists", (()=>{
  const missing = ST.BUILDINGS.filter(b => b.model && !fs.existsSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", b.model.replace(/^\.\//, ""))));
  if (missing.length) console.log("   missing:", missing.map(b=>b.model).join(", "));
  return missing.length === 0;
})());
check("every landmark and prop model file exists", (()=>{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
  const urls = [...ST.LANDMARKS.map(l=>l.url), ...ST.PROPS.map(p=>p.url)];
  const missing = urls.filter(u => !fs.existsSync(path.join(root, u.replace(/^\.\//, ""))));
  if (missing.length) console.log("   missing:", [...new Set(missing)].join(", "));
  return missing.length === 0;
})());
check("solid props contribute collision", ST.PROPS.filter(p=>p.solid).every(p =>
  ST.OBSTACLES.some(o => o.id === "prop:" + p.url.split("/").pop())));
check("the tree ring sits outside the walkable campus", ST.TREE_RING.every(t => Math.hypot(t.x,t.z) > 45));

// ---- 4.36 audio config sanity (the synth itself needs a browser; the table does not) ----
check("every SFX cue has a kind and a gain", Object.values(AUDIO_SFX).every(s => s.kind && s.gain > 0));
check("SFX gains stay in a sane range", Object.values(AUDIO_SFX).every(s => s.gain <= 0.4));
check("note-based cues carry notes, tone cues carry a frequency", Object.values(AUDIO_SFX).every(s =>
  (s.kind === "chord" || s.kind === "arp") ? Array.isArray(s.notes) && s.notes.length > 0
  : s.kind === "noise" ? s.dur > 0
  : typeof s.freq === "number"));
check("every cue the UI plays exists in the SFX table", (()=>{
  const html = fsReadIndex();
  const used = [...new Set([...html.matchAll(/AUDIO\.play\("([a-zA-Z]+)"\)/g)].map(m=>m[1]))];
  return used.length > 0 && used.every(n => n in AUDIO_SFX);
})());

// ---- 4.4 grade bands (regression: a forward find collapsed every roll to "Poor") ----
check("roll 0 is grade 1", gradeForRoll(0).g === 1);
check("roll 100 is grade 10", gradeForRoll(100).g === 10);
check("roll 95 is Gem Mint slab", gradeForRoll(95).g === 10 && gradeForRoll(95).slab);
check("roll 85 is Mint slab", gradeForRoll(85).g === 9 && gradeForRoll(85).slab);
check("roll 55 is Excellent, not a slab", gradeForRoll(55).g === 6 && !gradeForRoll(55).slab);
check("every band is reachable at its own min", GRADES.every(g => gradeForRoll(g.min).g === g.g));
check("grade rises monotonically with roll", (()=>{
  let last = 0;
  for (let r=0;r<=100;r++){ const g = gradeForRoll(r).g; if (g < last) return false; last = g; }
  return last === 10;
})());
check("a Gem Mint card is worth more than a Poor one", cardValue("fire_dragon",95) > cardValue("fire_dragon",5));
// slabs are actually minted
const sGrade = G.newGame(); sGrade.gold = 100000;
sGrade.cards[0].roll = 95; sGrade.cards[0].graded = false;
const slabRes = G.gradeCard(sGrade, sGrade.cards[0].uid);
check("grading a 95-roll mints a slab with a serial", slabRes.ok && slabRes.grade.slab && sGrade.cards[0].serial > 0);
check("countSlabs sees the slab", G.countSlabs(sGrade) === 1);

// ---- 4.45 duel mechanics: drain, freeze, targeted spells, AoE ownership ----
const flat = {hp:0,atk:0,def:0,pip:0};
const deck20 = id => Array(20).fill(id);
// drain heals the ATTACKER's wizard, not the defender's
const bd = G.startDuel(deck20("ghoul"), flat, deck20("skeleton"), flat, 100);
bd.you.hand = ["ghoul"]; bd.you.pips = 10;
G.playCard(bd, bd.you, 0, null);
bd.you.board[0].summoning = false;
bd.you.hp = 50; const foeHpBefore = bd.enemy.hp;
G.attack(bd, 0, "wiz", -1);
check("drain heals the attacking wizard", bd.you.hp > 50);
check("drain damages the defending wizard", bd.enemy.hp < foeHpBefore);

// freeze stops an attack, and wears off after the frozen player's turn
const bf = G.startDuel(deck20("fire_cat"), flat, deck20("fire_cat"), flat, 100);
bf.you.hand = ["blizzard"]; bf.you.pips = 10;
bf.enemy.hand = ["fire_cat"]; bf.enemy.pips = 10;
G.playCard(bf, bf.enemy, 0, null);           // enemy has a hasted 2/2
G.playCard(bf, bf.you, 0, null);             // Blizzard
check("blizzard freezes the opposing board", bf.enemy.board.every(c=>c.freeze === 1));
G.endTurn(bf);                               // -> enemy's turn
const frozenAtk = G.attack(bf, 0, "wiz", -1);
check("a frozen creature cannot attack", !frozenAtk.ok && frozenAtk.err === "frozen");
G.endTurn(bf);                               // enemy ends their turn: freeze ticks down
check("freeze wears off after the frozen turn", bf.enemy.board.every(c=>c.freeze === 0));

// targeted damage spells actually hit the chosen creature
const bt = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100);
bt.enemy.hand = ["frost_giant"]; bt.enemy.pips = 10;
G.playCard(bt, bt.enemy, 0, null);
const targetHp = bt.enemy.board[0].hp;
bt.you.hand = ["firebolt"]; bt.you.pips = 10;
G.playCard(bt, bt.you, 0, {kind:"creature", idx:0});
check("targeted spell damages the chosen creature", bt.enemy.board[0].hp === targetHp - 4);
check("targeted spell leaves the enemy wizard alone", bt.enemy.hp === 100);

// an untargeted damage spell hits the opposing wizard
const bWiz = G.startDuel(deck20("firebolt"), flat, deck20("skeleton"), flat, 100);
bWiz.you.hand = ["firebolt"]; bWiz.you.pips = 10;
G.playCard(bWiz, bWiz.you, 0, {kind:"wiz"});
check("wiz-targeted spell damages the enemy wizard", bWiz.enemy.hp === 96);

// AoE resolves against the CASTER's opponent, whichever side casts it
const ba = G.startDuel(deck20("fire_cat"), flat, deck20("meteor"), flat, 100);
ba.you.hand = ["fire_cat","fire_cat"]; ba.you.pips = 10;
G.playCard(ba, ba.you, 0, null);
const youBoardHp = ba.you.board[0].hp, enemyHpBefore = ba.enemy.hp, youHpBefore = ba.you.hp;
ba.enemy.hand = ["meteor"]; ba.enemy.pips = 10;
G.playCard(ba, ba.enemy, 0, null);           // the ENEMY casts Meteor
check("enemy AoE damages the player's board", ba.you.board.length === 0 || ba.you.board[0].hp < youBoardHp);
check("enemy AoE damages the player's wizard", ba.you.hp === youHpBefore - 4);
check("enemy AoE does not damage its own wizard", ba.enemy.hp === enemyHpBefore);

// ---- 4.48 seeded duels + turn cap ----
const seedA = G.startDuel(deck20("fire_cat"), flat, deck20("skeleton"), flat, 100, "balance", "balance", 4242);
const seedB = G.startDuel(deck20("fire_cat"), flat, deck20("skeleton"), flat, 100, "balance", "balance", 4242);
check("the same seed reproduces a duel exactly", JSON.stringify(seedA.you.deck) === JSON.stringify(seedB.you.deck));
check("a duel records its seed", Number.isInteger(seedA.seed));
const mixed = ["fire_cat","ice_golem","pixie","novice","elixir","fire_elf","firebolt","lightning","fire_dragon","storm_titan"].flatMap(id=>[id,id]);
const seedC = G.startDuel(mixed, flat, deck20("skeleton"), flat, 100, "balance", "balance", 1);
const seedD = G.startDuel(mixed, flat, deck20("skeleton"), flat, 100, "balance", "balance", 2);
check("different seeds shuffle differently", JSON.stringify(seedC.you.hand) !== JSON.stringify(seedD.you.hand));
// a duel where nobody can win still terminates
const bCap = G.startDuel(deck20("elixir"), flat, deck20("elixir"), flat, 100);
let capG = 0;
while (!G.isOver(bCap).over && capG++ < G.MAX_TURNS + 50) G.endTurn(bCap);
check("a passive duel ends at the turn cap", G.isOver(bCap).over && capG <= G.MAX_TURNS + 1);
const bTie = G.startDuel(deck20("elixir"), flat, deck20("elixir"), flat, 100);
bTie.turns = G.MAX_TURNS; bTie.you.hp = 30; bTie.enemy.hp = 30;
check("equal HP at the cap is a draw", G.isOver(bTie).draw === true && G.isOver(bTie).winner === null);
bTie.you.hp = 44;
check("higher HP at the cap wins", G.isOver(bTie).winner === "you");
const bKo = G.startDuel(deck20("elixir"), flat, deck20("elixir"), flat, 100);
bKo.you.hp = 0; bKo.enemy.hp = 0;
check("a double knockout is a draw", G.isOver(bKo).draw === true);
check("isOver tolerates a missing battle", G.isOver(null).over === false && G.isOver({}).over === false);

// ---- 4.5 field & trap mechanics ----
const s7 = G.newGame();
const b7 = G.startDuel(s7.deck, G.equipStats(s7), ["fire_cat","fire_cat","fire_elf","firebolt","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat"], {hp:0,atk:0,def:0,pip:0}, 40);
b7.you.hand = ["arcane_nexus","fire_cat","fire_cat","fire_cat","fire_cat"]; b7.you.pips = 10;
G.playCard(b7, b7.you, 0, null);
check("field card played", b7.you.field.length === 1);
G.playCard(b7, b7.you, 0, null); // fire_cat
const fc = b7.you.board[0];
check("field grants +1 atk", fc.atk === CARD_MAP["fire_cat"].atk + 1);
// trap triggers on enemy creature play
b7.you.hand = ["fire_trap","fire_cat","fire_cat","fire_cat","fire_cat"]; b7.you.pips = 10;
G.playCard(b7, b7.you, 0, null);
check("trap placed", b7.you.traps.length === 1);
b7.enemy.hand = ["fire_cat","fire_cat","fire_cat","fire_cat","fire_cat"]; b7.enemy.pips = 10;
G.playCard(b7, b7.enemy, 0, null); // 2/2 vs trapDmg 4 -> dies
check("trap consumed on enemy creature play", b7.you.traps.length === 0);
check("trap killed the enemy creature", b7.enemy.board.length === 0);

// ---- 4.6 daily quest + regrade ----
const s8 = G.newGame();
G.checkDaily(s8);
check("daily quest assigned", s8.daily.date.length > 0 && s8.daily.target > 0);
s8.daily.type = "win"; s8.daily.target = 3; s8.daily.progress = 0; s8.daily.claimed = false;
G.dailyProgress(s8,"win"); G.dailyProgress(s8,"win"); G.dailyProgress(s8,"win");
const cl = G.claimDaily(s8);
check("daily claim rewards gold", cl.ok && cl.reward > 0);
check("daily marked claimed", s8.daily.claimed === true);
const s9 = G.newGame();
s9.gold = 100000;
const un = s9.cards.find(c=>!c.graded);
G.gradeCard(s9, un.uid);
const rg = G.regradeCard(s9, un.uid);
check("regrade re-rolls a graded card", rg.ok && typeof rg.grade.name === "string");

// ---- 4.7 school affinity + starter ----
const s10 = G.newGame();
const beforeCount = s10.cards.length;
G.issueSchoolStarter(s10, "fire");
check("school starter adds 12 cards", s10.cards.length === beforeCount + 12);
const b10 = G.startDuel(s10.deck, G.equipStats(s10), ["fire_cat","fire_cat","fire_elf","firebolt","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat","fire_elf","fire_cat"], {hp:0,atk:0,def:0,pip:0}, 40, "fire", "ice");
b10.you.hand = ["fire_cat","fire_cat","fire_cat","fire_cat","fire_cat"]; b10.you.pips = 10;
G.playCard(b10, b10.you, 0, null);
const saff = b10.you.board.find(c=>c.id==="fire_cat");
check("school affinity gives +1 atk", saff.atk === CARD_MAP["fire_cat"].atk + 1);

// ---- 5. equipment pipeline ----
const s3 = G.newGame();
s3.skills.smithing = 30; s3.skills.alchemy = 20;
s3.inventory.copper = 10; s3.inventory.tin = 10; s3.inventory.iron = 10;
s3.inventory.gold = 5; s3.inventory.raw_shrimp = 5; s3.inventory.raw_salmon = 5;
const bronze = BARS.find(x=>x.id==="bar_bronze");
const sm = G.smelt(s3, bronze);
check("smelt bronze", sm.ok && (s3.inventory.bar_bronze||0) >= 1);
const ironBar = BARS.find(x=>x.id==="bar_iron");
G.smelt(s3, ironBar); G.smelt(s3, ironBar);
const eq = equipmentFor("iron","wand");
const fg = G.forge(s3, eq);
check("forge iron wand", fg.ok && s3.equipment.length === 1);
const eqr = G.equip(s3, s3.equipment[0].uid);
check("equip wand", eqr.ok && s3.loadout.wand === s3.equipment[0].uid);
const est = G.equipStats(s3);
check("equip stats grant atk", est.atk >= 2);
const pot = POTIONS.find(x=>x.id==="potion_small");
const bw = G.brew(s3, pot);
check("brew potion", bw.ok && (s3.inventory.potion_small||0) >= 1);

// ---- 6. balance: creature power budget ----
const budgetOk = CARDS.filter(c=>c.type==="creature").every(c => (c.atk+c.hp) <= 2*c.cost + 2);
check("creature power within budget (atk+hp <= 2cost+2)", budgetOk);

// ---- 7. balance: economy sinks/sources ----
// a reference "play" loop: gather ore -> smelt -> sell -> buy pack
const s4 = G.newGame();
s4.gold = 0;
let net = 0;
for (let i=0;i<20;i++){ const c = MATERIALS.find(m=>m.id==="copper"); G.gather(s4,c); net += c.value; }
check("gathering 20 copper nets positive value", net > 0);

// ---- 8. auctions ----
const s5 = G.newGame();
const c0 = s5.cards[0];
const la = G.listAuction(s5, c0.uid, 50);
check("list auction removes card", la.ok && s5.cards.length === 29);
check("auction pending", s5.auctions.length === 1);

// ---- 8.5 auctions use wall-clock time and settle on load ----
const sAuc = G.newGame();
G.listAuction(sAuc, sAuc.cards[0].uid, 50);
check("auction deadline is a wall-clock timestamp", sAuc.auctions[0].ends > Date.now() + 1000);
check("a fresh auction does not settle immediately", G.auctionTick(sAuc).length === 0 && sAuc.auctions.length === 1);
// a listing whose deadline has passed pays the seller out
const sExp = G.newGame();
G.listAuction(sExp, sExp.cards[0].uid, 50);
sExp.auctions[0].ends = Date.now() - 1;
const goldBefore = sExp.gold;
const settled = G.auctionTick(sExp);
check("an expired auction settles once", settled.length === 1 && sExp.auctions.length === 0);
check("an expired auction pays at least the reserve", sExp.gold >= goldBefore + 50);
// a save carrying a legacy performance.now() deadline is settled rather than stranded
const sLegacy = G.newGame();
G.listAuction(sLegacy, sLegacy.cards[0].uid, 40);
sLegacy.auctions[0].ends = 60000;            // what performance.now()+60s used to produce
const legacyGold = sLegacy.gold;
G.settleAuctions(sLegacy);
check("a legacy performance.now() auction is settled, not stranded", sLegacy.auctions.length === 0 && sLegacy.gold > legacyGold);

// ---- 8.6 school picker survives a quit during character creation ----
const freshSave = G.newGame();
check("a new game has not picked a school yet", freshSave.flags.schoolPicked === false);
localStorage_stub(JSON.stringify(freshSave));
check("quitting mid-creation still shows the picker", G.load().flags.schoolPicked === false);
const legacySave = G.newGame();
delete legacySave.flags.schoolPicked;         // a save from before the school system existed
localStorage_stub(JSON.stringify(legacySave));
check("a pre-school-system save skips the picker", G.load().flags.schoolPicked === true);

// ---- 8.7 potions are usable in a duel ----
const sPot = G.newGame();
sPot.inventory.potion_medium = 2;
check("heldPotions lists what the player carries", G.heldPotions(sPot).some(p=>p.id==="potion_medium" && p.count===2));
const bp = G.startDuel(sPot.deck, G.equipStats(sPot), deck20("skeleton"), flat, 100);
bp.you.hp = 40; bp.you.pips = 5;
const drank = G.usePotion(sPot, bp, bp.you, "potion_medium");
check("drinking a potion heals the wizard", drank.ok && bp.you.hp === 75 && drank.healed === 35);
check("drinking a potion consumes it", sPot.inventory.potion_medium === 1);
check("drinking a potion costs a pip", bp.you.pips === 4);
const twice = G.usePotion(sPot, bp, bp.you, "potion_medium");
check("only one potion per turn", !twice.ok && twice.err === "used");
G.endTurn(bp); G.endTurn(bp);                  // back round to the player
check("the potion limit resets next turn", bp.you.potionUsed === false);
check("healing is capped at max HP", (()=>{
  const s2p = G.newGame(); s2p.inventory.potion_large = 1;
  const b2p = G.startDuel(s2p.deck, G.equipStats(s2p), deck20("skeleton"), flat, 100);
  b2p.you.hp = b2p.you.maxHp - 5; b2p.you.pips = 5;
  const r = G.usePotion(s2p, b2p, b2p.you, "potion_large");
  return r.ok && b2p.you.hp === b2p.you.maxHp && r.healed === 5;
})());
check("cannot drink a potion you do not have", (()=>{
  const s3p = G.newGame();
  const b3p = G.startDuel(s3p.deck, G.equipStats(s3p), deck20("skeleton"), flat, 100);
  b3p.you.pips = 5;
  return G.usePotion(s3p, b3p, b3p.you, "potion_small").err === "resources";
})());
check("cannot drink on the opponent's turn", (()=>{
  const s4p = G.newGame(); s4p.inventory.potion_small = 1;
  const b4p = G.startDuel(s4p.deck, G.equipStats(s4p), deck20("skeleton"), flat, 100);
  b4p.turn = "enemy";
  return G.usePotion(s4p, b4p, b4p.you, "potion_small").err === "turn";
})());
check("every brewable potion actually heals", POTIONS.every(p => p.heal > 0));

// ---- 9. home ----
const s6 = G.newGame();
s6.gold = 500; s6.inventory.oak_log = 5;
check("buy home", G.buyHome(s6).ok && s6.home.owned);
check("upgrade treasury", G.upgradeHome(s6,"treasury").ok && s6.home.upgrades.treasury===1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);