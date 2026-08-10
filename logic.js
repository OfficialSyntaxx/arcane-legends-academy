// Wizard TCG — online duel rules module (server-authoritative). No imports, no timers, pure functions.
export const meta = { game: "Arcane Legends — Online Duel", minPlayers: 2, maxPlayers: 2 };

// <<< GENERATED CARD CATALOG — do not edit by hand; run: node tools/sync-cards.mjs
// Mirrors public/cards.js and public/schoolmagic.js. Source of truth is those files — edit
// there, then re-run the script. >>>
const C = [
  {id:"fire_cat",name:"Fire Cat",school:"fire",type:"creature",cost:1,atk:2,hp:2,fx:["haste"]},
  {id:"fire_elf",name:"Fire Elf",school:"fire",type:"creature",cost:2,atk:3,hp:3,fx:[]},
  {id:"fire_dragon",name:"Fire Dragon",school:"fire",type:"creature",cost:7,atk:8,hp:7,fx:["haste"]},
  {id:"firebolt",name:"Firebolt",school:"fire",type:"spell",cost:1,fx:[{"k":"dmg","n":4}]},
  {id:"fireball",name:"Fireball",school:"fire",type:"spell",cost:3,fx:[{"k":"dmg","n":6}]},
  {id:"meteor",name:"Meteor Strike",school:"fire",type:"spell",cost:5,fx:[{"k":"dmgAll","n":3},{"k":"dmgWiz","n":4}]},
  {id:"ice_golem",name:"Ice Golem",school:"ice",type:"creature",cost:2,atk:2,hp:4,fx:["taunt"]},
  {id:"frost_giant",name:"Frost Giant",school:"ice",type:"creature",cost:4,atk:4,hp:6,fx:["taunt"]},
  {id:"ice_wyrm",name:"Ice Wyrm",school:"ice",type:"creature",cost:6,atk:6,hp:7,fx:["taunt"]},
  {id:"ice_armor",name:"Ice Armor",school:"ice",type:"spell",cost:2,fx:[{"k":"shield","n":6}]},
  {id:"frost_shield",name:"Frost Shield",school:"ice",type:"spell",cost:1,fx:[{"k":"shield","n":3}]},
  {id:"blizzard",name:"Blizzard",school:"ice",type:"spell",cost:4,fx:[{"k":"freezeAll"}]},
  {id:"storm_bat",name:"Storm Bat",school:"storm",type:"creature",cost:1,atk:2,hp:1,fx:["haste"]},
  {id:"storm_shark",name:"Storm Shark",school:"storm",type:"creature",cost:3,atk:4,hp:2,fx:["haste"]},
  {id:"storm_titan",name:"Storm Titan",school:"storm",type:"creature",cost:8,atk:9,hp:8,fx:[]},
  {id:"storm_shift",name:"Storm Shift",school:"storm",type:"spell",cost:1,fx:[{"k":"dmg","n":3}]},
  {id:"lightning",name:"Lightning Bolt",school:"storm",type:"spell",cost:2,fx:[{"k":"dmg","n":5}]},
  {id:"tempest",name:"Tempest",school:"storm",type:"spell",cost:6,fx:[{"k":"dmgWiz","n":10}]},
  {id:"myth_walker",name:"Myth Walker",school:"myth",type:"creature",cost:2,atk:3,hp:2,fx:[]},
  {id:"minotaur",name:"Minotaur",school:"myth",type:"creature",cost:4,atk:5,hp:4,fx:[]},
  {id:"hydra",name:"Hydra",school:"myth",type:"creature",cost:7,atk:7,hp:7,fx:["multiAttack"]},
  {id:"basilisk",name:"Basilisk",school:"myth",type:"creature",cost:5,atk:5,hp:6,fx:["taunt"]},
  {id:"myth_blast",name:"Myth Blast",school:"myth",type:"spell",cost:2,fx:[{"k":"dmg","n":5}]},
  {id:"pixie",name:"Pixie",school:"life",type:"creature",cost:1,atk:1,hp:2,fx:[{"k":"healPlay","n":2}]},
  {id:"unicorn",name:"Unicorn",school:"life",type:"creature",cost:3,atk:3,hp:4,fx:[{"k":"healPlay","n":3}]},
  {id:"satyr",name:"Satyr",school:"life",type:"creature",cost:5,atk:4,hp:6,fx:[{"k":"healPlay","n":5}]},
  {id:"healing_wave",name:"Healing Wave",school:"life",type:"spell",cost:2,fx:[{"k":"heal","n":5}]},
  {id:"rebirth",name:"Rebirth",school:"life",type:"spell",cost:6,fx:[{"k":"heal","n":10}]},
  {id:"skeleton",name:"Skeleton",school:"death",type:"creature",cost:1,atk:2,hp:1,fx:[]},
  {id:"ghoul",name:"Ghoul",school:"death",type:"creature",cost:3,atk:3,hp:3,fx:["drain"]},
  {id:"vampire",name:"Vampire",school:"death",type:"creature",cost:4,atk:4,hp:4,fx:["drain"]},
  {id:"reaper",name:"Death Reaper",school:"death",type:"creature",cost:6,atk:6,hp:6,fx:["drain"]},
  {id:"dark_pact",name:"Dark Pact",school:"death",type:"spell",cost:2,fx:[{"k":"dmg","n":4},{"k":"heal","n":4}]},
  {id:"balance_blade",name:"Balance Blade",school:"balance",type:"spell",cost:1,fx:[{"k":"buffAll","n":2}]},
  {id:"novice",name:"Novice Assistant",school:"balance",type:"creature",cost:2,atk:2,hp:3,fx:[]},
  {id:"balance_streak",name:"Balance Streak",school:"balance",type:"spell",cost:3,fx:[{"k":"dmg","n":4},{"k":"draw","n":1}]},
  {id:"sunbird",name:"Sunbird",school:"balance",type:"creature",cost:4,atk:4,hp:5,fx:[]},
  {id:"balance_dragon",name:"Balance Dragon",school:"balance",type:"creature",cost:7,atk:7,hp:7,fx:[{"k":"buffAll","n":1}]},
  {id:"elixir",name:"Health Elixir",school:"balance",type:"spell",cost:1,fx:[{"k":"heal","n":3}]},
  {id:"golden_golem",name:"Golden Golem",school:"balance",type:"creature",cost:4,atk:5,hp:5,fx:["taunt"]},
  {id:"master_wand",name:"Master's Wand",school:"balance",type:"spell",cost:3,fx:[{"k":"buffAll","n":2}]},
  {id:"arcane_guardian",name:"Arcane Guardian",school:"balance",type:"creature",cost:5,atk:5,hp:7,fx:["taunt"]},
  {id:"arcane_nexus",name:"Arcane Nexus",school:"balance",type:"field",cost:4,fx:[{"k":"fieldAtk","n":1}]},
  {id:"radiant_aura",name:"Radiant Aura",school:"life",type:"field",cost:3,fx:[{"k":"fieldHeal","n":3}]},
  {id:"storm_conduit",name:"Storm Conduit",school:"storm",type:"field",cost:5,fx:[{"k":"fieldPip","n":1}]},
  {id:"fire_trap",name:"Fire Trap",school:"fire",type:"trap",cost:2,fx:[{"k":"trapDmg","n":4}]},
  {id:"mana_ward",name:"Mana Ward",school:"ice",type:"trap",cost:2,fx:[{"k":"trapShield","n":4}]},
];
const SCHOOL_BONUS = [["fire","ice"],["ice","storm"],["storm","myth"],["myth","life"],["life","death"],["death","fire"]];
const SCHOOL_AFFINITY_FX = {"fire":{"k":"dmg","n":1},"ice":{"k":"shield","n":1},"storm":{"k":"draw","n":1},"myth":{"k":"buffAll","n":1},"life":{"k":"heal","n":2},"death":{"k":"dmgWiz","n":1},"balance":{"k":"heal","n":1}};
const SCHOOL_ULT_FX = {"fire":[{"k":"dmgAll","n":5},{"k":"dmgWiz","n":3}],"ice":[{"k":"freezeAll","n":1},{"k":"shield","n":8}],"storm":[{"k":"dmgWiz","n":6},{"k":"draw","n":2}],"myth":[{"k":"buffAll","n":3},{"k":"draw","n":1}],"life":[{"k":"heal","n":15},{"k":"buffAll","n":2}],"death":[{"k":"dmgAll","n":3},{"k":"heal","n":6}],"balance":[{"k":"heal","n":6},{"k":"shield","n":6},{"k":"draw","n":1}]};
const ULT_CHARGE_MAX = 5;
// <<< END GENERATED >>>
const CM = Object.fromEntries(C.map(c=>[c.id,c]));

// A match cannot run forever: after MAX_TURNS the higher-HP wizard takes it, equal HP is a draw.
// Without this an online match had no terminating condition at all — two players who both
// stopped attacking would sit in a room indefinitely. Fatigue normally ends things far sooner
// (decks are 20 cards and fatigue escalates), so this is a backstop, not a balance lever.
export const MAX_TURNS = 100;

export function setup(players){
  return {
    players, phase:"deck", decks:{}, schools:{}, turn:null, battle:null,
    hands:{ [players[0]]:null, [players[1]]:null },
    // Seeded once per match so the shuffle is reproducible from the state alone — a match can
    // be replayed or a bug report re-run. Module-level RNG would be shared across every room.
    seed: (Math.random()*4294967296)>>>0,
    turns: 0,
    winner:null,
  };
}

function validateDeck(deck){
  if (!Array.isArray(deck) || deck.length !== 20) return false;
  const counts = {};
  for (const id of deck){
    if (!CM[id]) return false;
    counts[id] = (counts[id]||0)+1;
    if (counts[id] > 3) return false;
  }
  return true;
}

export function validateAction(state, playerId, action){
  if (!action || !action.type) return { ok:false, error:"action.type required" };
  if (state.phase === "deck"){
    if (action.type !== "setDeck") return { ok:false, error:"submit your deck first" };
    if (state.decks[playerId]) return { ok:false, error:"deck already submitted" };
    if (!validateDeck(action.deck)) return { ok:false, error:"deck must be 20 cards, max 3 copies" };
    return { ok:true };
  }
  if (state.phase !== "play") return { ok:false, error:"game not in play" };
  if (state.turn !== playerId) return { ok:false, error:"not your turn" };
  const b = state.battle;
  if (action.type === "play"){
    const p = b.you.id === playerId ? b.you : b.enemy;
    if (!Number.isInteger(action.handIndex) || action.handIndex<0 || action.handIndex>=p.hand.length) return {ok:false,error:"bad hand index"};
    const c = CM[p.hand[action.handIndex]];
    if (p.pips < c.cost) return { ok:false, error:"not enough pips" };
    return { ok:true };
  }
  if (action.type === "attack"){
    const p = b.you.id === playerId ? b.you : b.enemy;
    const atk = p.board[action.attacker];
    if (!atk) return { ok:false, error:"no creature" };
    if (atk.freeze > 0) return { ok:false, error:"creature is frozen" };
    if (atk.exhausted || atk.summoning || atk.attacks>=atk.multi) return { ok:false, error:"creature can't attack" };
    const enemy = b.you.id === playerId ? b.enemy : b.you;
    if (action.targetKind === "wiz" && enemy.board.some(c=>c.taunt && c.hp>0)) return { ok:false, error:"taunt creature blocks" };
    if (action.targetKind === "creature" && !enemy.board[action.targetIdx]) return { ok:false, error:"bad target" };
    return { ok:true };
  }
  if (action.type === "endTurn") return { ok:true };
  if (action.type === "ultimate"){
    const p = b.you.id === playerId ? b.you : b.enemy;
    if (!SCHOOL_ULT_FX[p.school]) return { ok:false, error:"no ultimate for this school" };
    if (p.ultUsed) return { ok:false, error:"already used this duel" };
    if ((p.ultCharge||0) < ULT_CHARGE_MAX) return { ok:false, error:"not charged yet" };
    return { ok:true };
  }
  return { ok:false, error:"unknown action" };
}

function mulberry32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function draw(p){ if (p.hand.length>=10) return; if (p.deck.length) p.hand.push(p.deck.pop()); }
function makeCreature(id, p){
  const c = CM[id]; const fx = c.fx||[];
  // School affinity: a creature hits harder for a wizard of its own school, mirrored from
  // game.js's makeCreature — this was missing here entirely, so every online duel undersold same-
  // school creatures relative to a local one.
  const affinity = p.school && c.school === p.school ? 1 : 0;
  return { id, school:c.school, atk:c.atk + fieldAtkBonus(p) + affinity, hp:c.hp, maxHp:c.hp, exhausted:false, summoning:true,
    taunt:fx.includes("taunt"), haste:fx.includes("haste"), drain:fx.includes("drain"),
    multi:fx.includes("multiAttack")?2:1, attacks:0, freeze:0, owner:p.id };
}
function buildDeck(ids, rand){ const d=[...ids]; for(let i=d.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d; }
function damageWizard(p, dmg){ const absorb=Math.min(p.shield,dmg); p.shield-=absorb; dmg-=absorb; p.hp-=dmg; }

function startBattle(state){
  const [p0,p1] = state.players;
  const rand = mulberry32(state.seed >>> 0);
  const you = { id:p0, school:(state.schools && state.schools[p0]) || "balance", hp:100, maxHp:100, shield:0, maxPips:1, pips:1, hand:[], deck:buildDeck(state.decks[p0], rand), board:[], field:[], traps:[], fatigue:0, ultCharge:0, ultUsed:false };
  const enemy = { id:p1, school:(state.schools && state.schools[p1]) || "balance", hp:100, maxHp:100, shield:0, maxPips:1, pips:1, hand:[], deck:buildDeck(state.decks[p1], rand), board:[], field:[], traps:[], fatigue:0, ultCharge:0, ultUsed:false };
  const b = { you, enemy, turn:p0, log:[] };
  for (let i=0;i<5;i++){ draw(you); draw(enemy); }  // 5-card opening hand
  state.battle = b; state.phase="play"; state.turn=p0;
  return b;
}
function fieldAtkBonus(p){
  let n=0; if (p.field) for(const f of p.field){const def=CM[f.id]; for(const fx of def.fx) if(fx.k==="fieldAtk") n+=fx.n;} return n;
}
function beginTurn(b,p){
  p.maxPips=Math.min(10,p.maxPips+1);
  let pipBonus=0;
  if (p.field) for(const f of p.field){const def=CM[f.id]; for(const fx of def.fx){ if(fx.k==="fieldPip") pipBonus+=fx.n; if(fx.k==="fieldHeal") p.hp=Math.min(p.maxHp,p.hp+fx.n); }}
  p.pips=Math.min(10,p.maxPips+pipBonus);
  if(p.deck.length) draw(p); else { p.fatigue=(p.fatigue||0)+1; p.hp-=p.fatigue; }
  // freeze ticks down at the END of the frozen player's turn (see the endTurn branch of
  // applyAction), so a frozen creature actually loses a turn.
  for(const c of p.board){ c.exhausted=false; c.attacks=0; }
}

// The side opposing a given player — spell effects resolve against the CASTER's opponent,
// never the fixed b.enemy slot (which would let player 2's AoE hit player 2's own board).
function foeOf(b, owner){ return owner === b.you ? b.enemy : b.you; }
function applyFx(b, owner, fx, target){
  const foe = foeOf(b, owner);
  for (const f of fx){
    if (typeof f === "string") continue;
    if (f.k==="dmg"){
      if (target && target !== foe) target.hp -= f.n;   // a creature: no shield
      else damageWizard(foe, f.n);
    }
    else if (f.k==="dmgAll"){ for (const c of foe.board) c.hp -= f.n; }
    else if (f.k==="dmgWiz"){ damageWizard(foe, f.n); }
    else if (f.k==="heal"){ owner.hp = Math.min(owner.maxHp, owner.hp+f.n); }
    else if (f.k==="shield"){ owner.shield += f.n; }
    else if (f.k==="buffAll"){ for (const c of owner.board) c.atk += f.n; }
    else if (f.k==="draw"){ for(let i=0;i<f.n;i++) draw(owner); }
    else if (f.k==="freezeAll"){ for (const c of foe.board) c.freeze=1; }
  }
  b.you.board=b.you.board.filter(c=>c.hp>0); b.enemy.board=b.enemy.board.filter(c=>c.hp>0);
}

export function applyAction(state, playerId, action){
  if (action.type === "setDeck"){
    const decks = { ...state.decks, [playerId]: action.deck.slice() };
    const schools = { ...state.schools, [playerId]: SCHOOL_AFFINITY_FX[action.school] ? action.school : "balance" };
    const next = { ...state, decks, schools };
    if (state.players.every(p=>decks[p])) startBattle(next);
    return next;
  }
  const b = state.battle;
  const p = b.you.id === playerId ? b.you : b.enemy;
  if (action.type === "ultimate"){
    const fx = SCHOOL_ULT_FX[p.school];
    p.ultCharge = 0;
    p.ultUsed = true;
    b.log.push(playerId + " unleashes a school ultimate");
    applyFx(b, p, fx, null);
    return state;
  }
  if (action.type === "play"){
    const id = p.hand[action.handIndex]; const c = CM[id];
    p.pips -= c.cost; p.hand.splice(action.handIndex,1);
    // Ultimate charge: playing a card of your OWN school banks charge, mirrored from game.js's
    // playCard — capped so it can't be hoarded past the threshold it unlocks.
    if (p.school && c.school === p.school) p.ultCharge = Math.min(ULT_CHARGE_MAX, (p.ultCharge||0) + 1);
    const enemy = b.you.id===playerId ? b.enemy : b.you;
    if (c.type === "creature"){
      const cr = makeCreature(id, p);
      for (const f of c.fx){ if (typeof f === "string") continue; if (f.k==="healPlay") p.hp=Math.min(p.maxHp,p.hp+f.n); else if (f.k==="buffAll") for(const x of p.board) x.atk += f.n; }
      if (cr.haste) cr.summoning=false;
      p.board.push(cr);
      // enemy traps trigger on creature play
      if (enemy.traps && enemy.traps.length){
        const t = enemy.traps.shift();
        for (const fx of t.fx) if (fx.k==="trapDmg"){ cr.hp -= fx.n; b.log.push("Trap! "+cr.name+" takes "+fx.n); }
      }
      if (cr.hp <= 0) p.board = p.board.filter(x=>x.hp>0);
    } else if (c.type === "field"){
      p.field = p.field || [];
      p.field.push({ id });
      for (const f of c.fx) if (f.k==="fieldAtk") for (const x of p.board) x.atk += f.n;
    } else if (c.type === "trap"){
      p.traps = p.traps || [];
      p.traps.push({ fx: c.fx });
    } else {
      const foe = b.you.id === playerId ? b.enemy : b.you;
      const t = action.target ? (action.target.kind==="wiz" ? foe : foe.board[action.target.idx]) : null;
      applyFx(b, p, c.fx, t);
      // School affinity bonus: a spell cast by a wizard of its own school does a little more —
      // the spell-side echo of the creature affinity bonus above, mirrored from game.js.
      if (p.school && c.school === p.school){
        const bonus = SCHOOL_AFFINITY_FX[p.school];
        if (bonus) applyFx(b, p, [bonus], t);
      }
    }
  } else if (action.type === "attack"){
    const atk = p.board[action.attacker];
    const enemy = b.you.id === playerId ? b.enemy : b.you;
    let dmg = atk.atk;
    if (action.targetKind === "creature"){
      const t = enemy.board[action.targetIdx];
      dmg += SCHOOL_BONUS.some(([a,b])=>a===atk.school && b===t.school) ? 1 : 0;
      t.hp -= dmg;
      // Drain heals the ATTACKER's wizard for damage dealt (previously healed the defender).
      if (atk.drain) p.hp = Math.min(p.maxHp, p.hp + dmg);
      enemy.board = enemy.board.filter(c=>c.hp>0);
      if (t.hp > 0) atk.hp -= t.atk;   // retaliation: damage taken, never a drain heal
    } else {
      damageWizard(enemy, dmg);
      if (atk.drain) p.hp = Math.min(p.maxHp, p.hp + dmg);
    }
    atk.attacks++;
    if (atk.attacks >= atk.multi) atk.exhausted = true;
    p.board = p.board.filter(c=>c.hp>0);
    // defender traps trigger on attack
    if (enemy.traps && enemy.traps.length){
      const t = enemy.traps.shift();
      for (const fx of t.fx) if (fx.k==="trapShield"){ enemy.shield += fx.n; b.log.push("Trap! +"+fx.n+" shield"); }
    }
  } else if (action.type === "endTurn"){
    const outgoing = b.you.id === state.turn ? b.you : b.enemy;
    for (const c of outgoing.board) if (c.freeze > 0) c.freeze--;
    const next = b.you.id === state.turn ? b.enemy : b.you;
    beginTurn(b, next);
    b.turn = next.id;
    state.turn = next.id;
    state.turns = (state.turns || 0) + 1;
  }
  return state;
}

export function isGameOver(state){
  if (state.phase !== "play" || !state.battle) return { over:false };
  const b = state.battle;
  // Both at 0 in the same resolution (e.g. mutual combat) is a draw, not a win for whoever is
  // checked first.
  if (b.you.hp <= 0 && b.enemy.hp <= 0) return { over:true, winner:null, draw:true, reason:"double knockout" };
  if (b.you.hp <= 0) return { over:true, winner: b.enemy.id };
  if (b.enemy.hp <= 0) return { over:true, winner: b.you.id };
  if ((state.turns || 0) >= MAX_TURNS){
    if (b.you.hp === b.enemy.hp) return { over:true, winner:null, draw:true, reason:"turn limit" };
    return { over:true, winner: b.you.hp > b.enemy.hp ? b.you.id : b.enemy.id, reason:"turn limit" };
  }
  return { over:false };
}

export function viewFor(state, playerId){
  if (state.phase === "deck"){
    return { phase:"deck", submitted: !!state.decks[playerId] };
  }
  const b = state.battle;
  const me = b.you.id === playerId ? b.you : b.enemy;
  const opp = b.you.id === playerId ? b.enemy : b.you;
  return {
    phase: state.phase,
    turn: state.turn,
    turns: state.turns || 0, maxTurns: MAX_TURNS,
    you: { hp:me.hp, maxHp:me.maxHp, shield:me.shield, pips:me.pips, hand:me.hand, deck:me.deck.length, board:me.board, field:me.field, traps:me.traps.length, school:me.school, ultCharge:me.ultCharge||0, ultUsed:!!me.ultUsed },
    opp: { hp:opp.hp, maxHp:opp.maxHp, shield:opp.shield, pips:opp.pips, hand:opp.hand.length, deck:opp.deck.length, board:opp.board, field:opp.field, traps:opp.traps.length },
    log: b.log.slice(-6),
  };
}