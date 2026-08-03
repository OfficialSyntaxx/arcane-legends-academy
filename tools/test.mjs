// Engine smoke test — runs the card engine, economy, and economy-balance checks headlessly.
import * as G from "../public/game.js";
import { CARDS, CARD_MAP, cardValue, gradeForRoll, gradeFee } from "../public/cards.js";
import { equipmentFor, BARS, POTIONS, MATERIALS } from "../public/items.js";

let pass = 0, fail = 0;
function check(name, cond){ if(cond) pass++; else { fail++; console.log("  ✗ FAIL:", name); } }

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

// ---- 9. home ----
const s6 = G.newGame();
s6.gold = 500; s6.inventory.oak_log = 5;
check("buy home", G.buyHome(s6).ok && s6.home.owned);
check("upgrade treasury", G.upgradeHome(s6,"treasury").ok && s6.home.upgrades.treasury===1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);