// creatures.js — the 39 deployed creature models, each with a distinct battle identity.
// Stats are the "codex" numbers (they flavour the creature and drive the codex screen); the
// ability is a one-off-on-play/on-attack effect, the passive is always-on. Where a passive maps
// to an existing card rule (taunt/haste/drain/multiAttack/heal/freeze) it mentions it so the
// duel engine can apply it; otherwise it's a flavourful rule surfaced in the codex + battle tag.
export const CREATURES = {
  slime:        { name: "Slime",        cat: "Blob",      school: "life",  atk: 2, hp: 3, cost: 1, ability: "Squish: heal 1 when it takes damage.", passive: "Regen 1 — heals 1 at the start of your turn." },
  bat:          { name: "Cave Bat",     cat: "Beast",     school: "storm", atk: 2, hp: 1, cost: 1, ability: "Swoop: attacks the enemy wizard immediately on play.", passive: "Haste — can attack the turn it's played." },
  skeleton:     { name: "Bone Skeleton",cat: "Undead",    school: "death", atk: 2, hp: 1, cost: 1, ability: "Rattle: deal 1 to the enemy wizard when it dies.", passive: "Cheap fodder — costs 1 pip." },
  dragon:       { name: "Ember Dragon", cat: "Dragon",    school: "fire",  atk: 8, hp: 7, cost: 7, ability: "Breathe fire: deal 2 to ALL enemy creatures on play.", passive: "Haste — the heart of the school." },
  chicken:      { name: "Brave Chicken",cat: "Beast",     school: "life",  atk: 1, hp: 1, cost: 0, ability: "Cluck: +2 attack while any ally is on the board.", passive: "Courage — costs 0 pips." },
  panda:        { name: "Temple Panda", cat: "Beast",     school: "ice",   atk: 2, hp: 4, cost: 2, ability: "Roll: gains +1 HP when played.", passive: "Taunt — enemies must attack it first." },
  deer:         { name: "Forest Deer",  cat: "Beast",     school: "life",  atk: 3, hp: 2, cost: 2, ability: "Leap: dodges the first attack made against it.", passive: "Swift — +1 attack vs enemy wizards." },
  ghost:        { name: "Wandering Ghost",cat: "Undead",  school: "death", atk: 3, hp: 2, cost: 3, ability: "Haunt: when it dies, return a random dead creature to your hand.", passive: "Ethereal — immune to poison and drain." },
  mushroom:     { name: "Spore Mushroom",cat: "Plant",    school: "life",  atk: 1, hp: 2, cost: 1, ability: "Spore: heal 1 to all friendly creatures on play.", passive: "Regen 1." },
  yeti:         { name: "Frost Yeti",   cat: "Beast",     school: "ice",   atk: 4, hp: 6, cost: 4, ability: "Freeze: freezes the creature that damages it.", passive: "Taunt — a wall of frost." },
  dino:         { name: "Stomp Dino",   cat: "Beast",     school: "myth",  atk: 5, hp: 5, cost: 5, ability: "Stomp: deal 1 to all enemy creatures when it attacks.", passive: "Sturdy — takes 1 less damage from spells." },
  orc:          { name: "Orc Grunt",    cat: "Humanoid",  school: "balance",atk: 4, hp: 4, cost: 3, ability: "Rage: +2 attack while below half HP.", passive: "Warband — +1 attack while another creature is on your board." },
  orc_skull:    { name: "Orc Skull",    cat: "Undead",    school: "death", atk: 4, hp: 3, cost: 3, ability: "Trophy: +2 attack whenever it kills a creature.", passive: "Drain — heals for damage dealt." },
  demon:        { name: "Cinder Demon", cat: "Fiend",     school: "fire",  atk: 5, hp: 4, cost: 4, ability: "Burning: deal 1 to the enemy wizard each turn.", passive: "Drain — heals for damage dealt." },
  bluedemon:    { name: "Frost Demon",  cat: "Fiend",     school: "ice",   atk: 4, hp: 4, cost: 4, ability: "Frostbite: freeze a random enemy creature on play.", passive: "Chilled — enemy spells cost 1 more while it's alive." },
  frog:         { name: "Tongue Frog",  cat: "Beast",     school: "life",  atk: 3, hp: 3, cost: 2, ability: "Tongue: steal +1 attack from an enemy creature on play.", passive: "Hop — can't be blocked by taunt." },
  mushroomking: { name: "Mushroom King",cat: "Plant",     school: "life",  atk: 4, hp: 5, cost: 4, ability: "Regal: give all friendly creatures +1 attack on play.", passive: "Regen 2 — heals 2 at the start of your turn." },
  mushnub:      { name: "Mushnub",      cat: "Plant",     school: "life",  atk: 2, hp: 3, cost: 2, ability: "Spore: heal 1 to all friendly creatures on play.", passive: "Regen 2." },
  mushnub_evolved: { name: "Grand Mushnub",cat: "Plant",  school: "life",  atk: 3, hp: 5, cost: 3, ability: "Grand spore: heal 2 to all friendly creatures on play.", passive: "Regen 2 + Taunt." },
  fish:         { name: "Deep Fish",    cat: "Beast",     school: "storm", atk: 4, hp: 2, cost: 3, ability: "Tide: dodge the first spell cast at it.", passive: "Swim — can't be targeted by single-target spells." },
  bunny:        { name: "Hop Bunny",    cat: "Beast",     school: "life",  atk: 2, hp: 2, cost: 1, ability: "Hop: dodge the first attack made against it.", passive: "Haste — can attack the turn it's played." },
  alien:        { name: "Void Alien",   cat: "Alien",     school: "myth",  atk: 5, hp: 5, cost: 5, ability: "Teleport: swap with a random enemy creature on play.", passive: "Aberrant — can't be targeted by spells." },
  wizard:       { name: "Runic Wizard", cat: "Humanoid",  school: "balance",atk: 3, hp: 3, cost: 3, ability: "Firespell: deal 2 to a random enemy on play.", passive: "Scholar — spells cost 1 less while it's alive." },
  ninja:        { name: "Shadow Ninja", cat: "Humanoid",  school: "storm", atk: 4, hp: 2, cost: 3, ability: "Stealth: dodge the first attack made against it.", passive: "Assassin — attacks the enemy wizard when it kills a creature." },
  monkroose:    { name: "Monkroose",    cat: "Beast",     school: "life",  atk: 4, hp: 5, cost: 4, ability: "Meditate: heal 3 when it takes damage.", passive: "Serene — immune to freeze." },
  birb:         { name: "Peck Birb",    cat: "Beast",     school: "storm", atk: 2, hp: 1, cost: 1, ability: "Peck: deal 1 to the enemy wizard when it attacks.", passive: "Haste — can attack the turn it's played." },
  cactoro:      { name: "Cactoro",      cat: "Plant",     school: "life",  atk: 3, hp: 3, cost: 2, ability: "Thorns: attackers take 1 damage.", passive: "Regen 1." },
  cat:          { name: "Fire Kitten",  cat: "Beast",     school: "fire",  atk: 2, hp: 2, cost: 1, ability: "Nine lives: survives the first lethal hit.", passive: "Haste — a loyal little blaze." },
  dog:          { name: "Loyal Hound",  cat: "Beast",     school: "balance",atk: 3, hp: 3, cost: 2, ability: "Loyal: +2 attack when a friendly creature dies.", passive: "Guard — Taunt." },
  pigeon:       { name: "Messenger Pigeon",cat: "Beast",  school: "storm", atk: 1, hp: 1, cost: 1, ability: "Message: draw a card when played.", passive: "Haste." },
  pinkblob:     { name: "Pink Blob",    cat: "Blob",      school: "life",  atk: 2, hp: 4, cost: 2, ability: "Jelly: heal 2 when it takes damage.", passive: "Regen 2 — it's just squishy." },
  greenblob:    { name: "Toxic Blob",   cat: "Blob",      school: "death", atk: 3, hp: 3, cost: 2, ability: "Toxic: poison the creature it attacks.", passive: "Regen 1." },
  greenspikyblob: { name: "Spiky Blob", cat: "Blob",      school: "myth",  atk: 3, hp: 4, cost: 3, ability: "Thorns: attackers take 1 damage.", passive: "Regen 1 + Taunt." },
  glub:         { name: "Bubble Glub",  cat: "Elemental", school: "storm", atk: 3, hp: 4, cost: 3, ability: "Bubble: gain 2 shield when played.", passive: "Shielded — first hit each turn deals 0." },
  goleling:     { name: "Goleling",     cat: "Golem",     school: "balance",atk: 3, hp: 6, cost: 3, ability: "Rocky: gain 1 HP when it takes damage.", passive: "Taunt — a wall of stone." },
  squidle:      { name: "Squidle",      cat: "Beast",     school: "storm", atk: 4, hp: 3, cost: 3, ability: "Inky: the creature it attacks loses 1 attack.", passive: "Slippery — can't be blocked by taunt." },
  hywirl:       { name: "Hywirl",       cat: "Elemental", school: "myth",  atk: 3, hp: 3, cost: 3, ability: "Whirl: deal 1 to all enemy creatures on play.", passive: "Windborne — can attack the enemy wizard directly." },
  alpaking:     { name: "Alpaking",     cat: "Beast",     school: "life",  atk: 3, hp: 4, cost: 3, ability: "Royal fleece: heal 1 to all friendly creatures on play.", passive: "Regen 1." },
  armabee:      { name: "Armabee",      cat: "Beast",     school: "storm", atk: 3, hp: 2, cost: 2, ability: "Sting: poison a creature when it attacks.", passive: "Haste — buzzes in fast." },
};

// Map a model filename (e.g. 'creature_Orc_Skull.glb') to its codex entry.
export function creatureFor(modelFile) {
  const key = (modelFile || '').replace(/^creature_/, '').replace(/\.glb$/, '').toLowerCase();
  return CREATURES[key] || null;
}

// Mechanical battle rules per creature slug — these are what the duel engine (game.js) applies.
// Keys: taunt, haste, drain, multi, regen, poison, thorns, evade, shield, survive, spellImmune,
// wizardDmg (to enemy wiz on attack), onPlayDmgAll, onPlayHealAll, onPlayBuffAll, onPlayFreeze,
// onPlayDraw, healOnHit, freezeOnHit.
export const RULES = {
  slime:        { regen: 1 },
  dragon:       { haste: true, onPlayDmgAll: 1 },
  bat:          { haste: true },
  skeleton:     {},
  chicken:      {},
  panda:        { taunt: true },
  deer:         { evade: true },
  ghost:        { regen: 1, spellImmune: true },
  mushroom:     { regen: 1, onPlayHealAll: 1 },
  yeti:         { taunt: true },   // balance: freeze-on-hit removed (taunt wall was oppressive)
  dino:         { onAttackDmgAll: 1 },
  orc:          { warband: true, rageAtk: 2 },   // active: Rage — +2 atk while below half HP
  orc_skull:    { drain: true },
  demon:        { drain: true, wizardDmg: 1 },
  bluedemon:    { onPlayFreeze: true },
  frog:         { onPlayStealAtk: 1 },   // active: Tongue — steal +1 atk from a random enemy creature
  mushroomking: { regen: 2, onPlayBuffAll: 1 },
  mushnub:      { regen: 2, onPlayHealAll: 1 },
  mushnub_evolved: { regen: 2, onPlayHealAll: 1 },   // balance: taunt + heal-all 2 removed
  fish:         { spellImmune: true },
  bunny:        { haste: true, evade: true },
  alien:        { spellImmune: true },
  wizard:       { onPlayBolt: 2 },   // active: Firespell — deal 2 to a random enemy on play
  ninja:        { evade: true },
  monkroose:    { healOnHit: 2 },   // balance: 3 -> 2
  birb:         { haste: true, wizardDmg: 1 },
  cactoro:      { thorns: 1, regen: 1 },
  cat:          { haste: true, survive: true },
  dog:          { taunt: true, warband: true },
  pigeon:       { haste: true, onPlayDraw: 1 },
  pinkblob:     { regen: 2, healOnHit: 1 },
  greenblob:    { regen: 1, poison: 1 },
  greenspikyblob: { regen: 1, thorns: 1, taunt: true },
  glub:         { shield: 2 },
  goleling:     { taunt: true, healOnHit: 1 },
  squidle:      { onAttackDebuff: 1 },
  hywirl:       { onPlayDmgAll: 1 },
  alpaking:     { regen: 1, onPlayHealAll: 1 },
  armabee:      { haste: true, poison: 1 },
};

// Resolve a CARD to its creature rules by keyword (kept in step with battle3d.js modelFor).
export function traitForCard(cardId, name) {
  const n = (name || cardId || '').toLowerCase();
  let slug = null;
  if (/dragon|wyrm|titan|snake|serpent/.test(n)) slug = 'dragon';
  else if (/bat/.test(n)) slug = 'bat';
  else if (/slime|blob|ooze/.test(n)) slug = 'slime';
  else if (/skeleton|bone/.test(n) && /\bskeleton\b/.test(n)) slug = 'skeleton';
  else if (/dino|dinosaur|rex/.test(n)) slug = 'dino';
  else if (/orc/.test(n)) slug = /skull/.test(n) ? 'orc_skull' : 'orc';
  else if (/demon/.test(n) && /blue|frost|ice/.test(n)) slug = 'bluedemon';
  else if (/demon|devil|imp|ghoul/.test(n)) slug = 'demon';
  else if (/frog|toad/.test(n)) slug = 'frog';
  else if (/mushroomking/.test(n)) slug = 'mushroomking';
  else if (/mushnub/.test(n)) slug = /evolved|grand/.test(n) ? 'mushnub_evolved' : 'mushnub';
  else if (/shark|fish|squid|crab|shrimp/.test(n)) slug = /squid|kraken/.test(n) ? 'squidle' : 'fish';
  else if (/bunny|rabbit/.test(n)) slug = 'bunny';
  else if (/yeti|giant|ogre/.test(n)) slug = 'yeti';
  else if (/golem|rock|stone/.test(n)) slug = 'goleling';
  else if (/alien/.test(n)) slug = 'alien';
  else if (/chicken|rooster|bird/.test(n)) slug = /pigeon|messenger/.test(n) ? 'pigeon' : (/birb/.test(n)?'birb':'chicken');
  else if (/panda|bear/.test(n)) slug = 'panda';
  else if (/deer|stag|elk/.test(n)) slug = 'deer';
  else if (/ghost|wraith|spirit|reaper|vampire/.test(n)) slug = 'ghost';
  else if (/cat|kitten|feline/.test(n)) slug = 'cat';
  else if (/dog|hound|wolf|pup/.test(n)) slug = 'dog';
  else if (/ninja|assassin|shadow/.test(n)) slug = 'ninja';
  else if (/mushroom|shroom|fungus/.test(n)) slug = 'mushroom';
  else if (/cactus|cactoro/.test(n)) slug = 'cactoro';
  else if (/alpaca|llama|alpaking/.test(n)) slug = 'alpaking';
  else if (/bee|wasp|armabee/.test(n)) slug = 'armabee';
  else if (/monk|monkroose/.test(n)) slug = 'monkroose';
  else if (/whirl|elemental|cyclone|hywirl|wind/.test(n)) slug = 'hywirl';
  else if (/glub|bubble/.test(n)) slug = 'glub';
  else if (/mage|wizard|elf|pixie|walker|novice|assistant|fairy/.test(n)) slug = /wizard/.test(n) ? 'wizard' : 'ninja';
  else if (/blob/.test(n)) slug = /pink/.test(n) ? 'pinkblob' : (/spiky/.test(n) ? 'greenspikyblob' : 'greenblob');
  return slug ? { creature: CREATURES[slug], rules: RULES[slug] || {} } : null;
}