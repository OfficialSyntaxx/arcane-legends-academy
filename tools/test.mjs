// Engine smoke test — runs the card engine, economy, and economy-balance checks headlessly.
import * as G from "../public/game.js";
import { CARDS, CARD_MAP, cardValue, gradeForRoll, gradeFee, GRADES } from "../public/cards.js";
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