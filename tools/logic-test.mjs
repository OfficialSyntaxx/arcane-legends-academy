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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);