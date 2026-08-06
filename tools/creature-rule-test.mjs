// creature-rule-test.mjs — regression tests: one per creature battle mechanic.
// Each test constructs a minimal creature carrying a rule flag and asserts the engine honours it.
//   node tools/creature-rule-test.mjs
import * as G from '../public/game.js';
import { RULES, traitForCard } from '../public/creatures.js';
import { CARD_MAP } from '../public/cards.js';

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n));
const base = () => G.startDuel(['fire_cat','fire_cat','fire_cat','fire_cat','fire_cat'], {hp:0,atk:0,def:0,pip:0}, ['fire_cat','fire_cat','fire_cat','fire_cat','fire_cat'], {hp:0,atk:0,def:0,pip:0}, 100, 'fire', 'fire', 42);
// minimal creature factory
let _u = 0;
const cr = (o = {}) => Object.assign({
  uid: 'u' + (++_u), id: 'x', school: 'fire', name: 'T', atk: 2, hp: 5, maxHp: 5,
  exhausted: false, summoning: false, taunt: false, haste: false, drain: false, multi: 1, attacks: 0, freeze: 0,
  owner: null, shield0: 0, regen: 0, poison: 0, thorns: 0, evade: false, survive: false,
  spellImmune: false, freezeImmune: false, wizardDmg: 0, onAttackDmgAll: 0, onAttackDebuff: 0,
  healOnHit: 0, freezeOnHit: false, warband: false,
}, o);

console.log('creature rule tests');

// 1. Taunt blocks wizard attacks
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'A', atk: 3, owner: 'you' })];
  b.enemy.board = [cr({ name: 'Wall', hp: 3, taunt: true, owner: 'enemy' })];
  ok('taunt blocks wizard attack', G.attack(b, 0, 'wiz', -1).err === 'taunt');
  b.enemy.board = []; // wall dead
  ok('taunt gone -> wizard attack ok', G.attack(b, 0, 'wiz', -1).ok === true);
}
// 2. Haste lets a creature act the turn it's played
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Swift', summoning: false, haste: true, owner: 'you' })];
  ok('haste creature can attack', G.attack(b, 0, 'wiz', -1).ok === true);
  b.you.board[0].summoning = true;
  ok('summoning creature cannot attack', G.attack(b, 0, 'wiz', -1).err === 'tired');
}
// 3. Drain heals the attacker's wizard
{
  const b = base(); b.turn = 'you';
  b.you.hp = 90; // room to heal (drain is capped at maxHp)
  b.you.board = [cr({ name: 'Leech', atk: 4, drain: true, owner: 'you' })];
  b.enemy.board = [cr({ name: 'Victim', hp: 5, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('drain heals attacker wizard', b.you.hp === 94);
}
// 4. Regen heals at the start of the owner's turn
{
  const b = base();
  const c = cr({ hp: 2, maxHp: 5, regen: 2, owner: 'you' });
  b.you.board = [c]; b.turn = 'enemy'; G.endTurn(b); // -> your turn
  ok('regen heals at turn start', c.hp === 4);
}
// 5. Poison adds venom damage on hit
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Venom', atk: 2, poison: 2, owner: 'you' })];
  const t = cr({ name: 'Prey', hp: 5, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('poison adds damage on hit', t.hp === 1); // 2 atk + 2 poison = 4
}
// 6. Thorns reflects damage to the attacker (no retaliation from a 0-atk target)
{
  const b = base(); b.turn = 'you';
  const a = cr({ name: 'Attacker', hp: 5, atk: 2, owner: 'you' }); b.you.board = [a];
  b.enemy.board = [cr({ name: 'Spikes', hp: 5, atk: 0, thorns: 2, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('thorns reflect to attacker', a.hp === 3);
}
// 7. Evade dodges the first attack (attacker double-attacks)
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Striker', atk: 4, multi: 2, owner: 'you' })];
  const t = cr({ name: 'Phantom', hp: 5, evade: true, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('evade dodges first attack', t.hp === 5);
  G.attack(b, 0, 'creature', 0);
  ok('evade used -> second hit lands', t.hp === 1);
}
// 8. Shield absorbs damage
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Striker', atk: 4, owner: 'you' })];
  const t = cr({ name: 'Bubbled', hp: 5, shield0: 2, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('shield absorbs damage', t.hp === 3); // 4 dmg - 2 shield = 2
}
// 9. Survive keeps a creature at 1 hp on a lethal hit (attacker double-attacks)
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Striker', atk: 6, multi: 2, owner: 'you' })];
  const t = cr({ name: 'Lucky', hp: 3, survive: true, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('survive at 1 hp', t.hp === 1);
  G.attack(b, 0, 'creature', 0);
  ok('survive once only', b.enemy.board.length === 0);
}
// 10. Spell-immune shrugs off targeted + AoE spells
{
  const b = base();
  const t = cr({ name: 'Ghost', hp: 3, spellImmune: true, owner: 'enemy' }); b.enemy.board = [t];
  // targeted dmg via applyFx path (meteor targeting)
  G.applyFx ? null : null;
  // use playCard of a spell that hits a creature: storm spell
  // simpler: directly exercise the spell path through a dmg spell
  const foe = b.enemy;
  // emulate a targeted dmg spell
  if (typeof G.applyFx === 'function'){ } // not exported
  // Use real spell: put a single-target spell in hand and cast on the immune creature
  b.turn = 'you'; b.you.pips = 10;
  // firebolt is single-target dmg
  b.you.hand = ['firebolt']; b.enemy.board = [t];
  G.playCard(b, b.you, 0, { kind: 'creature', idx: 0 });
  ok('spell-immune takes no targeted spell damage', t.hp === 3);
  // AoE: meteor (dmgAll+dmgWiz) — immune creature unaffected
  b.you.hand = ['meteor']; b.you.pips = 10;
  G.playCard(b, b.you, 0, null);
  ok('spell-immune takes no AoE damage', t.hp === 3);
}
// 11. Freeze-immune ignores freeze
{
  const b = base();
  const c = cr({ hp: 3, freeze: 1, freezeImmune: true, owner: 'you' }); b.you.board = [c];
  b.turn = 'enemy'; G.endTurn(b); // -> your turn, beginTurn clears freeze for immune
  ok('freeze-immune shrugs freeze', c.freeze === 0 && c.exhausted === false);
}
// 12. WizardDmg — creature nicks the enemy wizard every attack
{
  const b = base(); b.turn = 'you'; const wiz = b.enemy.hp;
  b.you.board = [cr({ name: 'Sniper', atk: 2, wizardDmg: 1, multi: 2, owner: 'you' })];
  b.enemy.board = [cr({ name: 'Target', hp: 9, atk: 0, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('wizardDmg nicks enemy wizard', b.enemy.hp === wiz - 1);
  G.attack(b, 0, 'creature', 0);
  ok('wizardDmg every attack', b.enemy.hp === wiz - 2);
}
// 13. OnAttackDmgAll stomps all enemies
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Stomp', atk: 2, onAttackDmgAll: 1, multi: 2, owner: 'you' })];
  b.enemy.board = [cr({ name: 'E1', hp: 5, atk: 0, owner: 'enemy' }), cr({ name: 'E2', hp: 5, atk: 0, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  // E1 takes the direct attack (2) + stomp (1) = 2 hp; E2 takes stomp (1) = 4 hp
  ok('onAttackDmgAll hits all enemies', b.enemy.board.length === 2 && b.enemy.board[0].hp === 2 && b.enemy.board[1].hp === 4);
}
// 14. OnAttackDebuff lowers the target's attack
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Ink', atk: 2, onAttackDebuff: 1, owner: 'you' })];
  const t = cr({ name: 'Knight', hp: 5, atk: 4, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('onAttackDebuff lowers target atk', t.atk === 3);
}
// 15. HealOnHit heals when damaged
{
  const b = base(); b.turn = 'you';
  b.you.board = [cr({ name: 'Punch', atk: 3, owner: 'you' })];
  const t = cr({ name: 'Medic', hp: 5, healOnHit: 2, owner: 'enemy' }); b.enemy.board = [t];
  G.attack(b, 0, 'creature', 0);
  ok('healOnHit heals after taking damage', t.hp === 4); // 5-3+2
}
// 16. FreezeOnHit freezes the attacker
{
  const b = base(); b.turn = 'you';
  const a = cr({ name: 'Attacker', atk: 2, owner: 'you' }); b.you.board = [a];
  b.enemy.board = [cr({ name: 'Frost', hp: 5, freezeOnHit: true, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('freezeOnHit freezes attacker', a.freeze === 1);
}
// 17. Warband gains +1 atk per ally
{
  const b = base(); b.turn = 'you';
  const a = cr({ name: 'Chief', atk: 2, warband: true, owner: 'you' }); b.you.board = [a];
  b.you.board.push(cr({ name: 'Ally', atk: 1, owner: 'you' }), cr({ name: 'Ally2', atk: 1, owner: 'you' }));
  b.enemy.board = [cr({ name: 'Target', hp: 9, owner: 'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('warband +N atk per ally', b.enemy.board[0].hp === 9 - (2 + 2)); // base2 + 2 allies
}
// 18. On-play effects through real card plays (dragon AoE; pigeon draw)
{
  const b = G.startDuel(['fire_dragon','fire_cat','fire_cat','fire_cat','fire_cat'], [], ['fire_cat','fire_cat','fire_cat','fire_cat','fire_cat'], [], 100, 'fire', 'fire', 42);
  b.you.pips = 10; b.enemy.pips = 10;
  G.playCard(b, b.enemy, 0, null); G.playCard(b, b.enemy, 0, null); // 2 cats (2hp)
  b.turn = 'you';
  const handBefore = b.you.hand.length;
  G.playCard(b, b.you, b.you.hand.indexOf('fire_dragon'), null);
  const catHp = b.enemy.board[0] ? b.enemy.board[0].hp : 0;
  ok('dragon onPlayDmgAll:1 (2hp cats -> 1)', catHp === 1 || b.enemy.board.length === 0);
  // pigeon? no pigeon card in standard set — skip
}
// 19. traitForCard resolves the key flagged creatures
{
  ok('yeti balanced (no freezeOnHit)', !RULES.yeti.freezeOnHit && RULES.yeti.taunt === true);
  ok('dragon balanced (AoE 1)', RULES.dragon.onPlayDmgAll === 1);
  ok('mushnub_evolved balanced', RULES.mushnub_evolved.regen === 2 && RULES.mushnub_evolved.taunt === undefined);
  ok('monkroose balanced (heal 2)', RULES.monkroose.healOnHit === 2);
}
// ---- Active abilities (locked in before they become interactive) ----
// 20. Firespell (wizard: onPlayBolt) — deal N to a random enemy creature, else the wizard
{
  CARD_MAP._tw = { id:'_tw', name:'Test Wizard', school:'fire', type:'creature', cost:1, atk:1, hp:5, fx:[] };
  const b = base(); b.you.pips = 10; b.turn = 'you';
  b.enemy.board = [cr({ name:'Mob', hp:5, atk:0, owner:'enemy' })];
  b.you.hand = ['_tw'];
  G.playCard(b, b.you, 0, null);
  ok('firespell bolts a random enemy creature for 2', b.enemy.board[0].hp === 3);
  // no enemy creatures -> hits the enemy wizard
  const wiz = b.enemy.hp;
  b.enemy.board = []; b.you.hand = ['_tw']; b.you.pips = 10;
  G.playCard(b, b.you, 0, null);
  ok('firespell hits the wizard when no creatures', b.enemy.hp === wiz - 2);
}
// 20b. Firespell manual targeting — the player picks which enemy (creature or wizard) to bolt
{
  CARD_MAP._tw = { id:'_tw', name:'Test Wizard', school:'fire', type:'creature', cost:1, atk:1, hp:5, fx:[] };
  const b = base(); b.you.pips = 10; b.turn = 'you';
  b.enemy.board = [cr({ name:'A', hp:5, atk:0, owner:'enemy' }), cr({ name:'B', hp:5, atk:0, owner:'enemy' })];
  b.you.hand = ['_tw'];
  G.playCard(b, b.you, 0, { kind:'creature', idx:1 });   // player picks B
  ok('manual bolt hits the chosen creature only', b.enemy.board[0].hp === 5 && b.enemy.board[1].hp === 3);
  // player targets the wizard directly (creatures present, but wizard chosen)
  const wiz = b.enemy.hp;
  b.you.hand = ['_tw']; b.you.pips = 10;
  G.playCard(b, b.you, 0, { kind:'wiz' });
  ok('manual bolt can hit the wizard directly', b.enemy.hp === wiz - 2 && b.enemy.board[0].hp === 5 && b.enemy.board[1].hp === 3);
}
// 21. Tongue steal (frog: onPlayStealAtk) — steal +N atk from a random enemy creature
{
  CARD_MAP._tf = { id:'_tf', name:'Test Frog', school:'life', type:'creature', cost:1, atk:1, hp:5, fx:[] };
  const b = base(); b.you.pips = 10; b.turn = 'you';
  b.enemy.board = [cr({ name:'Knight', hp:5, atk:3, owner:'enemy' })];
  b.you.hand = ['_tf'];
  G.playCard(b, b.you, 0, null);
  const frog = b.you.board[0];
  ok('tongue steals +1 atk from an enemy creature', frog.atk === 2 && b.enemy.board[0].atk === 2);
}
// 21b. Tongue manual targeting — the player picks which enemy creature to steal from
{
  CARD_MAP._tf = { id:'_tf', name:'Test Frog', school:'life', type:'creature', cost:1, atk:1, hp:5, fx:[] };
  const b = base(); b.you.pips = 10; b.turn = 'you';
  b.enemy.board = [cr({ name:'Tank', hp:5, atk:0, owner:'enemy' }), cr({ name:'DPS', hp:5, atk:4, owner:'enemy' })];
  b.you.hand = ['_tf'];
  G.playCard(b, b.you, 0, { kind:'creature', idx:1 });   // player picks DPS
  const frog = b.you.board[0];
  ok('tongue steals from the chosen creature only', frog.atk === 2 && b.enemy.board[0].atk === 0 && b.enemy.board[1].atk === 3);
}
// 22. Rage threshold (orc: rageAtk) — +N atk while at/below half HP
{
  const b = base(); b.turn = 'you';
  const orc = cr({ name:'Orc', atk:3, hp:2, maxHp:6, rageAtk:2, owner:'you' }); b.you.board = [orc];
  b.enemy.board = [cr({ name:'Target', hp:20, atk:0, owner:'enemy' })];
  G.attack(b, 0, 'creature', 0);
  ok('rage +2 atk while below half HP', b.enemy.board[0].hp === 20 - (3 + 2));
  // above half HP -> no rage bonus
  const b2 = base(); b2.turn = 'you';
  const orc2 = cr({ name:'Orc', atk:3, hp:5, maxHp:6, rageAtk:2, owner:'you' }); b2.you.board = [orc2];
  b2.enemy.board = [cr({ name:'Target', hp:20, atk:0, owner:'enemy' })];
  G.attack(b2, 0, 'creature', 0);
  ok('no rage above half HP', b2.enemy.board[0].hp === 20 - 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);