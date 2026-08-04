// logic.js (online rules module) verification: submit decks, check hidden info, play to completion.
import * as L from "../logic.js";

let pass=0, fail=0;
function check(n,c){ if(c) pass++; else { fail++; console.log("  ✗ FAIL:",n); } }

const players = ["p1","p2"];
let state = L.setup(players);
check("meta min/max 2", L.meta.minPlayers===2 && L.meta.maxPlayers===2);

// valid 20-card deck (10 types x 2 = 20)
const types=["fire_cat","ice_golem","pixie","novice","elixir","fire_elf","firebolt","lightning","fire_dragon","storm_titan"];
const deck=[]; for(const id of types) for(let i=0;i<2;i++) deck.push(id); // 20
check("deck has 20", deck.length===20);

// invalid: >3 copies of one card
const badDeck = [...deck]; badDeck[2]="fire_cat"; badDeck[3]="fire_cat"; // fire_cat x4 (was 2)
const vBad = L.validateAction(L.setup(players), "p1", {type:"setDeck", deck:badDeck});
check("rejects >3 copies", vBad.ok===false);

let v = L.validateAction(state, "p1", {type:"setDeck", deck});
check("p1 setDeck valid", v.ok);
state = L.applyAction(state, "p1", {type:"setDeck", deck});
check("waiting for p2 (phase deck)", state.phase==="deck");
state = L.applyAction(state, "p2", {type:"setDeck", deck});
check("battle starts after both decks", state.phase==="play" && !!state.battle);
check("turn is first player", state.turn==="p1");

// hidden info masking
const v1 = L.viewFor(state, "p1");
const v2 = L.viewFor(state, "p2");
check("p1 sees own hand as array", Array.isArray(v1.you.hand));
check("p1 sees p2 hand as count", typeof v1.opp.hand==="number");
check("p2 sees p1 hand as count", typeof v2.opp.hand==="number");
check("p2 does NOT see p1 hand contents", !Array.isArray(v2.opp.hand));

// wrong player can't act
check("p2 can't act on p1 turn", L.validateAction(state,"p2",{type:"endTurn"}).ok===false);

// play to completion: each turn play a card if affordable (validate handles cost), then end turn
let over=false, guard=0, plays=0;
while (!over && guard++ < 300){
  const turn = state.turn;
  const b = state.battle.you.id === turn ? state.battle.you : state.battle.enemy;
  // flood: play every affordable card (validateAction checks cost)
  let played = true;
  while (played && !over){
    played = false;
    for (let i=0;i<b.hand.length;i++){
      const pr = L.validateAction(state, turn, {type:"play", handIndex:i});
      if (pr.ok){ state = L.applyAction(state, turn, {type:"play", handIndex:i}); plays++; played=true; break; }
    }
  }
  // attack if any creature is ready
  const p = state.battle.you.id === turn ? state.battle.you : state.battle.enemy;
  const en = state.battle.you.id === turn ? state.battle.enemy : state.battle.you;
  for (let i=0;i<p.board.length;i++){
    const atk = p.board[i];
    if (atk.exhausted || atk.summoning || atk.attacks>=atk.multi) continue;
    const taunt = en.board.find(c=>c.taunt && c.hp>0);
    if (taunt) state = L.applyAction(state, turn, {type:"attack", attacker:i, targetKind:"creature", targetIdx:en.board.indexOf(taunt)});
    else state = L.applyAction(state, turn, {type:"attack", attacker:i, targetKind:"wiz"});
  }
  state = L.applyAction(state, turn, {type:"endTurn"});
  over = L.isGameOver(state).over;
}
check("game reaches a winner without stalling", over);
check("several cards were played", plays >= 6);

// ---- duel mechanics parity with the local engine ----
// Helper: bring a fresh match to the play phase with both players on a chosen deck.
function started(d1, d2){
  let st = L.setup(players);
  st = L.applyAction(st, "p1", {type:"setDeck", deck:d1});
  st = L.applyAction(st, "p2", {type:"setDeck", deck:d2});
  return st;
}
const twenty = id => Array(20).fill(id);
const sideFor = (st, id) => st.battle.you.id === id ? st.battle.you : st.battle.enemy;

// drain heals the attacker's wizard, not the defender's
let sd = started(twenty("ghoul"), twenty("skeleton"));
const dP1 = sideFor(sd,"p1"), dP2 = sideFor(sd,"p2");
dP1.hand = ["ghoul"]; dP1.pips = 10;
sd = L.applyAction(sd, "p1", {type:"play", handIndex:0});
dP1.board[0].summoning = false; dP1.hp = 50;
sd = L.applyAction(sd, "p1", {type:"attack", attacker:0, targetKind:"wiz"});
check("online drain heals the attacker", dP1.hp > 50);
check("online drain damages the defender", dP2.hp < 100);

// a frozen creature is rejected, and thaws after its owner's turn ends
let sf = started(twenty("blizzard"), twenty("fire_cat"));
const fP1 = sideFor(sf,"p1"), fP2 = sideFor(sf,"p2");
fP2.hand = ["fire_cat"]; fP2.pips = 10;
fP1.hand = ["blizzard"]; fP1.pips = 10;
sf.turn = "p2"; sf.battle.turn = "p2";
sf = L.applyAction(sf, "p2", {type:"play", handIndex:0});
sf = L.applyAction(sf, "p2", {type:"endTurn"});
sf = L.applyAction(sf, "p1", {type:"play", handIndex:0});   // Blizzard
check("online blizzard freezes the opponent's board", fP2.board.every(c=>c.freeze===1));
sf = L.applyAction(sf, "p1", {type:"endTurn"});
const frozen = L.validateAction(sf, "p2", {type:"attack", attacker:0, targetKind:"wiz"});
check("online frozen creature is rejected", frozen.ok===false && /frozen/.test(frozen.error));
sf = L.applyAction(sf, "p2", {type:"endTurn"});
check("online freeze wears off", fP2.board.every(c=>c.freeze===0));

// AoE resolves against the caster's opponent even when player 2 casts it
let sa = started(twenty("fire_cat"), twenty("meteor"));
const aP1 = sideFor(sa,"p1"), aP2 = sideFor(sa,"p2");
aP1.hand = ["fire_cat"]; aP1.pips = 10;
sa = L.applyAction(sa, "p1", {type:"play", handIndex:0});
sa = L.applyAction(sa, "p1", {type:"endTurn"});
const p1HpBefore = aP1.hp, p2HpBefore = aP2.hp;
aP2.hand = ["meteor"]; aP2.pips = 10;
sa = L.applyAction(sa, "p2", {type:"play", handIndex:0});   // p2 casts Meteor
check("p2's AoE clears p1's board", aP1.board.length === 0);
check("p2's AoE damages p1's wizard", aP1.hp === p1HpBefore - 4);
check("p2's AoE does not damage p2's own wizard", aP2.hp === p2HpBefore);

// a targeted spell hits the chosen enemy creature, not the caster's own
let stg = started(twenty("firebolt"), twenty("frost_giant"));
const tP1 = sideFor(stg,"p1"), tP2 = sideFor(stg,"p2");
tP2.hand = ["frost_giant"]; tP2.pips = 10;
stg.turn = "p2"; stg.battle.turn = "p2";
stg = L.applyAction(stg, "p2", {type:"play", handIndex:0});
stg = L.applyAction(stg, "p2", {type:"endTurn"});
const tHp = tP2.board[0].hp;
tP1.hand = ["firebolt"]; tP1.pips = 10;
stg = L.applyAction(stg, "p1", {type:"play", handIndex:0, target:{kind:"creature", idx:0}});
check("online targeted spell hits the chosen creature", tP2.board[0].hp === tHp - 4);
check("online targeted spell spares the enemy wizard", tP2.hp === 100);

// ---- turn cap: a match always terminates ----
let sCap = started(twenty("elixir"), twenty("elixir"));   // heals only: neither side can ever win
let capGuard = 0;
while (!L.isGameOver(sCap).over && capGuard++ < L.MAX_TURNS + 50){
  sCap = L.applyAction(sCap, sCap.turn, {type:"endTurn"});
}
const capEnd = L.isGameOver(sCap);
check("a passive match ends at the turn cap", capEnd.over && capGuard <= L.MAX_TURNS + 1);
check("the turn cap decides on HP or declares a draw", capEnd.winner !== undefined);
// equal HP at the cap is an explicit draw, not an arbitrary win
let sDraw = started(twenty("elixir"), twenty("elixir"));
sDraw.turns = L.MAX_TURNS;
sDraw.battle.you.hp = 40; sDraw.battle.enemy.hp = 40;
const drawRes = L.isGameOver(sDraw);
check("equal HP at the cap is a draw", drawRes.over && drawRes.draw === true && drawRes.winner === null);
sDraw.battle.you.hp = 55;
check("higher HP at the cap wins", L.isGameOver(sDraw).winner === sDraw.battle.you.id);
// a double knockout is a draw rather than a win for whichever side is checked first
let sKo = started(twenty("elixir"), twenty("elixir"));
sKo.battle.you.hp = 0; sKo.battle.enemy.hp = 0;
check("a double knockout is a draw", L.isGameOver(sKo).draw === true);
check("viewFor exposes the turn budget", (()=>{ const v = L.viewFor(sCap, "p1"); return typeof v.turns === "number" && v.maxTurns === L.MAX_TURNS; })());

// ---- seeded shuffle: a match is reproducible from its state ----
const seedDeck = ["fire_cat","ice_golem","pixie","novice","elixir","fire_elf","firebolt","lightning","fire_dragon","storm_titan"].flatMap(id=>[id,id]);
function handsForSeed(seed){
  let st = L.setup(players); st.seed = seed;
  st = L.applyAction(st, "p1", {type:"setDeck", deck:seedDeck});
  st = L.applyAction(st, "p2", {type:"setDeck", deck:seedDeck});
  return JSON.stringify([st.battle.you.hand, st.battle.enemy.hand]);
}
check("the same seed deals the same opening hands", handsForSeed(12345) === handsForSeed(12345));
check("a different seed deals a different shuffle", handsForSeed(12345) !== handsForSeed(99999));
check("setup assigns a seed", Number.isInteger(L.setup(players).seed));

// deck-size error text matches the rule it enforces
const badLen = L.validateAction(L.setup(players), "p1", {type:"setDeck", deck:twenty("fire_cat").slice(0,19)});
check("deck error text says 20 cards", badLen.ok===false && badLen.error.includes("20 cards"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);