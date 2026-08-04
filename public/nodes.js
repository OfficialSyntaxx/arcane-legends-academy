// Gathering nodes in the 3D academy, as data.
//
// This lives outside world.js on purpose: world.js needs THREE and a canvas, so it can't be
// loaded headlessly, and for a long time the node list drifted out of sync with items.js —
// `tin`, `raw_shark` and `magic_log` had recipes but no source anywhere in the world, which
// made Bronze Bars (the entry rung of the whole Smithing ladder) impossible to craft.
// Keeping the table here lets tools/test.mjs assert that every recipe input is reachable.
//
// Coordinates scaled with the world (see structures.js SCALE note).
// kind: "crystal" (ore, needs a color), "wood" (stump + tree), "pond" (fishing spot).
export const WORLD_NODES = [
  // ---- mining ----
  { kind:"crystal", id:"copper",      x:-11.7,  z:-7.8,  color:0xcd7f32, label:"Mine Copper" },
  { kind:"crystal", id:"tin",         x:-19.5, z:-9.8,  color:0x9aa8b8, label:"Mine Tin" },
  { kind:"crystal", id:"iron",        x:-7.8,  z:-15.6,  color:0xb0b0b0, label:"Mine Iron" },
  { kind:"crystal", id:"silver",      x:-15.6,  z:1.9,   color:0xc9c9e0, label:"Mine Silver" },
  { kind:"crystal", id:"gold",        x:11.7,   z:-7.8,  color:0xffd766, label:"Mine Gold" },
  { kind:"crystal", id:"mithril",     x:15.6,   z:1.9,   color:0x4a90d9, label:"Mine Mithril" },
  // runite sat at (-3,-9), 1.4 units from the iron node — inside the 2.6 interaction radius,
  // so the two nodes fought over the prompt. Moved out to the courtyard edge, which also
  // suits it as the level-70 tier.
  { kind:"crystal", id:"runite",      x:-27.3, z:-27.3, color:0xffb3c9, label:"Mine Runite" },
  // ---- woodcutting ----
  { kind:"wood",    id:"oak_log",     x:17.6,   z:-9.8,  label:"Chop Oak" },
  { kind:"wood",    id:"willow_log",  x:21.4,  z:-15.6,  label:"Chop Willow" },
  { kind:"wood",    id:"magic_log",   x:27.3,  z:-23.4, label:"Chop Magic Tree", magic:true },
  // ---- fishing ----
  { kind:"pond",    id:"raw_shrimp",  x:23.4,  z:35.1,  label:"Fish Shrimp" },
  { kind:"pond",    id:"raw_salmon",  x:33.1,  z:23.4,  label:"Fish Salmon" },
  { kind:"pond",    id:"raw_lobster", x:39.0,  z:15.6,   label:"Fish Lobster" },
  { kind:"pond",    id:"raw_shark",   x:42.9,  z:25.3,  label:"Fish Shark", deep:true },
];

// Every material the player can obtain by hand in the world.
export const GATHERABLE = WORLD_NODES.map(n => n.id);
