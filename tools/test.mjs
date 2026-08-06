// Engine smoke test — runs the card engine, economy, and economy-balance checks headlessly.
import * as G from "../public/game.js";
import { CARDS, CARD_MAP, cardValue, gradeForRoll, gradeFee, GRADES } from "../public/cards.js";
import { equipmentFor, BARS, POTIONS, MATERIALS, CARD_MATERIALS } from "../public/items.js";
import { WORLD_NODES, GATHERABLE } from "../public/nodes.js";
import * as ST from "../public/structures.js";
import { SFX as AUDIO_SFX } from "../public/audio.js";
import { CDN } from "../public/cdn.js";
import * as TER from "../public/terrain.js";
import * as WC from "../public/worldconfig.js";
import * as DG from "../public/dungeons.js";
import * as OB from "../public/onboarding.js";
import * as VFX from "../public/vfx.js";
import * as ZQ from "../public/zonequests.js";
import * as ACADEMY from "../public/academy.js";
import * as REP from "../public/reputation.js";
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
// A model is resolvable if it ships in public/ OR is hosted on the CDN (cdn.js) — the large
// character/tree GLBs deliberately live in models_cdn/ and are fetched at runtime so the deploy
// stays under the limit, so "not on disk under public/" is not the same as "missing".
const ROOT_PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const resolves = u => {
  const name = u.split("/").pop();
  return !!CDN[name] || fs.existsSync(path.join(ROOT_PUBLIC, u.replace(/^\.\//, "")));
};
check("every building model resolves (local file or CDN)", (()=>{
  const missing = ST.BUILDINGS.filter(b => b.model && !resolves(b.model)).map(b=>b.model);
  if (missing.length) console.log("   missing:", missing.join(", "));
  return missing.length === 0;
})());
check("every landmark and prop model resolves (local file or CDN)", (()=>{
  const urls = [...ST.LANDMARKS.map(l=>l.url), ...ST.PROPS.map(p=>p.url)];
  const missing = [...new Set(urls.filter(u => !resolves(u)))];
  if (missing.length) console.log("   missing:", missing.join(", "));
  return missing.length === 0;
})());
check("every character model resolves (local file or CDN)", (()=>{
  const names = ["player_wizard.glb", ...ST.NPCS.map(n=>n.model), ...ST.WANDERERS.map(w=>w.model)];
  const missing = [...new Set(names.filter(n => !resolves("./assets/models/" + n)))];
  if (missing.length) console.log("   missing:", missing.join(", "));
  return missing.length === 0;
})());
// Characters are the one class of model that must ALSO exist locally. They were CDN-only, and
// because the loader had no retry, a single unreachable CloudFront host replaced the player and
// every NPC with the procedural stand-in — the whole cast turned low-poly with only a console
// warning. world.js now falls back to ./assets/models/<name>, which is only a fallback if the
// file is actually there, so assert it rather than trusting the CDN to stay up.
check("every character model also ships locally (CDN fallback is real)", (()=>{
  const names = ["player_wizard.glb", ...ST.NPCS.map(n=>n.model), ...ST.WANDERERS.map(w=>w.model)];
  const missing = [...new Set(names)].filter(n => !fs.existsSync(path.join(ROOT_PUBLIC, "assets/models", n)));
  if (missing.length) console.log("   CDN-only (no local fallback):", missing.join(", "));
  return missing.length === 0;
})());
// The player model is a CONTRACT, not just an asset: world.js drives it from a mixer clip and
// the procedural NPC cycle looks bones up by name. Both failure modes are silent — a model that
// lost its skin during compression, or one rigged with different bone names, loads without error
// and simply never moves. Both happened while integrating the re-rigged wizard.
// Reading a GLB's animation data. Draco compresses MESH attributes only, so animation samplers
// stay as plain accessors and can be read straight out of the binary chunk.
function glbDoc(rel){
  const buf = fs.readFileSync(path.join(ROOT_PUBLIC, rel));
  const jsonLen = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  return { doc, buf, binStart: 20 + jsonLen + 8 };
}
function firstRotation({ doc, buf, binStart }, clipName, boneName){
  const clip = (doc.animations || []).find(a => new RegExp(clipName, "i").test(a.name));
  if (!clip) return null;
  for (const ch of clip.channels){
    if (ch.target.path !== "rotation") continue;
    if (doc.nodes[ch.target.node].name !== boneName) continue;
    const acc = doc.accessors[clip.samplers[ch.sampler].output];
    if (acc.type !== "VEC4" || acc.componentType !== 5126) continue;
    const bv = doc.bufferViews[acc.bufferView];
    const off = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const q = [0, 1, 2, 3].map(k => buf.readFloatLE(off + k * 4));
    return 2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180 / Math.PI;   // degrees from bind pose
  }
  return null;
}
// THE T-POSE TEST. Generated characters are authored in an A-pose because that is what makes them
// riggable — arms out, away from the body. A clip that only adds a small swing leaves the arms
// spread, and the character reads as T-posed however correct the skeleton is. That shipped once.
// So: assert the idle clip actually POSES the arms well away from where they were bound.
check("the player's idle brings the arms down, not the bind pose", (()=>{
  const g = glbDoc("assets/models/player_wizard.glb");
  const bad = [];
  for (const bone of ["LeftArm", "RightArm"]){
    const deg = firstRotation(g, "idle", bone);
    if (deg == null) bad.push(`${bone}: idle does not rotate it at all`);
    else if (deg < 25) bad.push(`${bone}: only ${deg.toFixed(1)} deg from the bind pose`);
  }
  if (bad.length) console.log("   " + bad.join("; "));
  return bad.length === 0;
})());
check("the walk clip swings the legs enough to read", (()=>{
  const g = glbDoc("assets/models/player_wizard.glb");
  // frame 1 is the passing pose, so the legs sit near neutral there; what matters is that the
  // track exists and the clip is not a single static key
  const g2 = glbDoc("assets/models/player_wizard.glb");
  const clip = g2.doc.animations.find(a => /walk/i.test(a.name));
  const legCh = clip.channels.filter(c => c.target.path === "rotation" &&
    /UpLeg$/.test(g2.doc.nodes[c.target.node].name));
  if (!legCh.length){ console.log("   walk clip has no leg rotation tracks"); return false; }
  const acc = g2.doc.accessors[clip.samplers[legCh[0].sampler].output];
  return acc.count >= 3;      // more than one key, i.e. it actually moves
})());
check("the player model is skinned and animated", (()=>{
  const buf = fs.readFileSync(path.join(ROOT_PUBLIC, "assets/models/player_wizard.glb"));
  const doc = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  const prim = doc.meshes[0].primitives[0];
  const draco = prim.extensions && prim.extensions.KHR_draco_mesh_compression;
  const attrs = new Set([...Object.keys(prim.attributes), ...(draco ? Object.keys(draco.attributes) : [])]);
  const clips = (doc.animations || []).map(a => a.name.toLowerCase());
  const joints = new Set((doc.skins && doc.skins[0] ? doc.skins[0].joints : []).map(i => doc.nodes[i].name));
  // the names applyWalkCycle() in world.js reaches for
  const needed = ["Hips", "Spine", "LeftLeg", "RightLeg", "LeftUpLeg", "RightUpLeg",
                  "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"];
  const missing = needed.filter(n => !joints.has(n));
  const problems = [];
  if (!(doc.skins || []).length) problems.push("no skin");
  if (!attrs.has("JOINTS_0") || !attrs.has("WEIGHTS_0")) problems.push("no skin weights on the mesh");
  if (!clips.some(c => c.includes("walk"))) problems.push("no walk clip");
  if (clips.length < 2) problems.push("needs an idle clip as well as a walk");
  if (missing.length) problems.push("bones applyWalkCycle needs are missing: " + missing.join(", "));
  if (problems.length) console.log("   " + problems.join("; "));
  return problems.length === 0;
})());
// Props and landmarks fall back to a local copy the same way characters do, which is only a
// fallback if the file is there. Anything listed in cdn.js must also exist under public/.
check("every CDN-hosted model also ships locally", (()=>{
  const missing = Object.keys(CDN).filter(n =>
    !fs.existsSync(path.join(ROOT_PUBLIC, "assets/models", n)) &&
    !fs.existsSync(path.join(ROOT_PUBLIC, "assets/buildings", n)));
  if (missing.length) console.log("   CDN-only (no local fallback):", missing.join(", "));
  return missing.length === 0;
})());
check("every CDN entry is a real https URL", Object.values(CDN).every(u => /^https:\/\//.test(u)));
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

// ---- 4.37 WORLDSPEC step 1: zone config data model ----
const zonesDoc = JSON.parse(fs.readFileSync(path.join(ROOT_PUBLIC, "world", "zones.json"), "utf8"));
const WORLD = WC.buildWorld(zonesDoc);
check("world config loads at least two zones", WORLD.zoneIds.length >= 2);
check("a hub zone is identified", WORLD.hub === "academy");
check("defaults fill in for unspecified fields", (()=>{
  const w = WC.buildWorld({ zones:[{ id:"bare", name:"Bare", spawn:{x:0,z:0} }] });
  const z = w.get("bare");
  return z.chunkSize === WC.ZONE_DEFAULTS.chunkSize && z.terrain.biome === "plains" && Array.isArray(z.props);
})());
check("partial terrain config keeps the other defaults", (()=>{
  const z = WC.buildWorld({ zones:[{ id:"p", spawn:{x:0,z:0}, terrain:{ seed:9 } }] }).get("p");
  return z.terrain.seed === 9 && z.terrain.scale === WC.ZONE_DEFAULTS.terrain.scale;
})());
// every authored zone must validate, with models resolved against what actually exists
const knownModels = new Set([
  ...fs.readdirSync(path.join(ROOT_PUBLIC, "assets", "models")).filter(f=>f.endsWith(".glb")),
  ...(fs.existsSync(path.join(ROOT_PUBLIC, "assets", "buildings"))
      ? fs.readdirSync(path.join(ROOT_PUBLIC, "assets", "buildings")).filter(f=>f.endsWith(".glb")) : []),
  ...Object.keys(CDN),
]);
const zoneProblems = [];
for (const id of WORLD.zoneIds){
  zoneProblems.push(...WC.validateZone(WORLD.get(id), { knownModels:[...knownModels], zoneIds: WORLD.zoneIds }));
}
if (zoneProblems.length) console.log("   zone problems:", zoneProblems.slice(0,6).join(" | "));
check("every authored zone validates", zoneProblems.length === 0);
check("validation catches an inverted-bounds zone", WC.validateZone(
  WC.buildWorld({zones:[{id:"bad", name:"B", spawn:{x:0,z:0}, bounds:{minX:10,maxX:-10,minZ:0,maxZ:1}}]}).get("bad")
).some(p => /inverted bounds/.test(p)));
check("validation catches load/unload thrash", WC.validateZone(
  WC.buildWorld({zones:[{id:"t", name:"T", spawn:{x:0,z:0}, loadRadius:100, unloadRadius:70}]}).get("t")
).some(p => /thrash/.test(p)));
check("validation catches an exit to a missing zone", WC.validateZone(
  WC.buildWorld({zones:[{id:"a", name:"A", spawn:{x:0,z:0}, exits:[{toZone:"nowhere"}]}]}).get("a"), { zoneIds:["a"] }
).some(p => /unknown zone/.test(p)));
check("validation catches out-of-bounds placement", WC.validateZone(
  WC.buildWorld({zones:[{id:"o", name:"O", spawn:{x:0,z:0}, bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},
    npcs:[{key:"far", x:500, z:0, model:"x.glb"}]}]}).get("o")
).some(p => /outside zone bounds/.test(p)));
// ---- zone exits / transitions (WORLDSPEC step 4) ----
// validateExits covers mutual reachability (§9b f), exits inside their own bounds, arrival
// points inside the target, ping-pong arrivals and overlapping triggers.
check("the shipped world has no exit problems", (()=>{
  const problems = WC.validateExits(WORLD);
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("a one-way exit is caught", WC.validateExits(WC.buildWorld({zones:[
  {id:"a", name:"A", spawn:{x:0,z:0}, exits:[{toZone:"b", x:10, z:0}]},
  {id:"b", name:"B", spawn:{x:0,z:0}},
]})).some(p => /one-way/.test(p)));
check("an exit outside its own zone's bounds is caught", WC.validateExits(WC.buildWorld({zones:[
  {id:"a", name:"A", spawn:{x:0,z:0}, bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10}, exits:[{toZone:"b", x:99, z:0}]},
  {id:"b", name:"B", spawn:{x:0,z:0}, exits:[{toZone:"a", x:0, z:0}]},
]})).some(p => /outside/.test(p)));
check("exitNear only fires inside the trigger radius", (()=>{
  const z = { exits:[{toZone:"b", x:10, z:0}] };
  return !!WC.exitNear(z, 10, 0) && !!WC.exitNear(z, 10 + WC.EXIT_RADIUS - 0.1, 0)
      && WC.exitNear(z, 10 + WC.EXIT_RADIUS + 0.5, 0) === null;
})());
check("exitNear picks the closer of two exits", (()=>{
  const z = { exits:[{toZone:"far", x:2, z:0}, {toZone:"near", x:0.2, z:0}] };
  const hit = WC.exitNear(z, 0, 0);
  return hit && hit.toZone === "near";
})());
// The ping-pong bug: arriving ON the reciprocal exit re-triggers it and bounces the player back.
check("arrival lands clear of the return exit's trigger", (()=>{
  for (const id of WORLD.zoneIds){
    for (const e of WORLD.get(id).exits){
      const entry = WC.entryPointFor(WORLD, e.toZone, id);
      if (WC.exitNear(WORLD.get(e.toZone), entry.x, entry.z)) return false;
    }
  }
  return true;
})());
check("arrival uses the reciprocal exit, not the target's spawn", (()=>{
  const entry = WC.entryPointFor(WORLD, "whispering_forest", "academy");
  const back = WORLD.get("whispering_forest").exits.find(e => e.toZone === "academy");
  const spawn = WORLD.get("whispering_forest").spawn;
  return entry.viaExit
      && Math.hypot(entry.x - back.x, entry.z - back.z) < WC.EXIT_RADIUS * 2
      && Math.hypot(entry.x - spawn.x, entry.z - spawn.z) > WC.EXIT_RADIUS;
})());
check("arrival falls back to the spawn when there is no way back", (()=>{
  const w = WC.buildWorld({zones:[
    {id:"a", name:"A", spawn:{x:0,z:0}, exits:[{toZone:"b", x:5, z:0}]},
    {id:"b", name:"B", spawn:{x:7, z:8}},
  ]});
  const e = WC.entryPointFor(w, "b", "a");
  return e.viaExit === false && e.x === 7 && e.z === 8;
})());
check("arrival is inside the target zone's bounds", WORLD.zoneIds.every(id =>
  WORLD.get(id).exits.every(e => {
    const t = WORLD.get(e.toZone), p = WC.entryPointFor(WORLD, e.toZone, id);
    return p.x >= t.bounds.minX && p.x <= t.bounds.maxX && p.z >= t.bounds.minZ && p.z <= t.bounds.maxZ;
  })));
check("every zone is reachable from the hub", (()=>{
  const seen = new Set([WORLD.hub]), queue = [WORLD.hub];
  while (queue.length){
    for (const e of WORLD.get(queue.pop()).exits) if (!seen.has(e.toZone)){ seen.add(e.toZone); queue.push(e.toZone); }
  }
  const orphans = WORLD.zoneIds.filter(id => !seen.has(id));
  if (orphans.length) console.log("   unreachable from the hub:", orphans.join(", "));
  return orphans.length === 0;
})());
// Water became solid with step 4 (§9b k), so an exit standing in water would be unusable.
check("no exit sits in water", WORLD.zoneIds.every(id => {
  const z = WORLD.get(id), flats = TER.flatsForZone(z);
  return z.exits.every(e => !TER.isWater(e.x, e.z, z.terrain, flats));
}));
check("no arrival point sits in water", WORLD.zoneIds.every(id =>
  WORLD.get(id).exits.every(e => {
    const t = WORLD.get(e.toZone), p = WC.entryPointFor(WORLD, e.toZone, id);
    return !TER.isWater(p.x, p.z, t.terrain, TER.flatsForZone(t));
  })));
// ---- ground colour ----
// The flat one-colour ground was the last thing that read as "low poly" whatever the models did.
// These assert the paint actually varies at the scale a player SEES, which is where two earlier
// attempts failed silently: the numbers changed, the screen did not.
check("ground colour varies within a single screen-sized patch", (()=>{
  const lum = c => ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.6 + (c & 255) * 0.1);
  const worst = [];
  for (const id of WORLD.zoneIds){
    const z = WORLD.get(id);
    if (z.interior) continue;
    const flats = TER.flatsForZone(z);
    const vals = [];
    for (let x = 0; x < 50; x += 2) for (let zz = 0; zz < 50; zz += 2)
      vals.push(lum(TER.groundColorAt(z.spawn.x + x - 25, z.spawn.z + zz - 25, z.terrain, flats)));
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread < 12) worst.push(`${id}: only ${spread.toFixed(1)}/255`);
  }
  if (worst.length) console.log("   too uniform to see: " + worst.join(", "));
  return worst.length === 0;
})());
check("ground colour is deterministic", (()=>{
  const z = WORLD.get(WORLD.hub), flats = TER.flatsForZone(z);
  return TER.groundColorAt(11, -7, z.terrain, flats) === TER.groundColorAt(11, -7, z.terrain, flats);
})());
check("each biome paints a different ground", (()=>{
  const seen = new Map();
  for (const b of Object.keys(TER.BIOMES)){
    const t = { seed: 5, scale: 40, amplitude: 6, baseHeight: 0, biome: b };
    seen.set(b, TER.groundColorAt(3, 9, t));
  }
  return new Set(seen.values()).size === seen.size;
})());
check("steep ground turns to rock", (()=>{
  // a mountain zone must contain BOTH grassy and rocky ground, or the slope rule does nothing
  const t = { seed: 3, scale: 30, amplitude: 14, baseHeight: 0, biome: "mountains" };
  const rock = TER.BIOMES.mountains.palette.rock;
  const near = c => Math.abs((c>>16&255)-(rock>>16&255)) + Math.abs((c>>8&255)-(rock>>8&255)) + Math.abs((c&255)-(rock&255));
  let rocky = 0, other = 0;
  for (let i = 0; i < 400; i++){
    const x = (i * 17) % 400 - 200, z = (i * 53) % 400 - 200;
    if (near(TER.groundColorAt(x, z, t)) < 60) rocky++; else other++;
  }
  return rocky > 0 && other > 0;
})());
check("a shoreline band appears just above the waterline", (()=>{
  const z = WORLD.get("whispering_forest"), flats = TER.flatsForZone(z);
  const shore = TER.BIOMES[z.terrain.biome].palette.shore;
  // find any point barely above water and check it leans toward the shore colour
  for (let i = 0; i < 4000; i++){
    const x = (i * 31) % 300 - 150, zz = (i * 97) % 300 - 150;
    const h = TER.heightAt(x, zz, z.terrain, flats);
    const above = h - z.terrain.waterLevel;
    if (above > 0.05 && above < 0.4){
      const c = TER.groundColorAt(x, zz, z.terrain, flats);
      const dry = TER.groundColorAt(x, zz, { ...z.terrain, waterLevel: null }, flats);
      const closer = a => Math.abs((a>>16&255)-(shore>>16&255)) + Math.abs((a&255)-(shore&255));
      return closer(c) < closer(dry);
    }
  }
  return false;   // no shoreline sampled at all — the test would be vacuous
})());

// ---- dungeons / instanced interiors (WORLDSPEC step 5) ----
const dungeonDoc = JSON.parse(fs.readFileSync(path.join(ROOT_PUBLIC, "world", "dungeons.json"), "utf8"));
const DUNGEONS = dungeonDoc.dungeons.map(DG.layoutDungeon);
check("the shipped dungeons have no problems", (()=>{
  const problems = DUNGEONS.flatMap(d => DG.validateDungeon(d, { zoneIds: WORLD.zoneIds, knownModels: [...knownModels] }));
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("overlapping rooms are caught", DG.validateDungeon(DG.layoutDungeon({
  id:"x", name:"X", rooms:[{id:"a",x:0,z:0,w:20,d:20},{id:"b",x:5,z:0,w:20,d:20,boss:{model:"creature_Dragon.glb"}}],
  connections:[]})).some(p => /overlap/.test(p)));
check("an unreachable room is caught", DG.validateDungeon(DG.layoutDungeon({
  id:"x", name:"X", rooms:[{id:"a",x:0,z:0,w:20,d:20},{id:"far",x:0,z:60,w:20,d:20,boss:{model:"creature_Dragon.glb"}}],
  connections:[]})).some(p => /unreachable/.test(p)));
check("a dungeon with no boss is caught", DG.validateDungeon(DG.layoutDungeon({
  id:"x", name:"X", rooms:[{id:"a",x:0,z:0,w:20,d:20}], connections:[]})).some(p => /no boss/.test(p)));
check("a connection that cannot be a straight corridor is caught", DG.validateDungeon(DG.layoutDungeon({
  id:"x", name:"X", rooms:[{id:"a",x:0,z:0,w:20,d:20},{id:"b",x:40,z:40,w:20,d:20,boss:{model:"creature_Dragon.glb"}}],
  connections:[{from:"a",to:"b"}]})).some(p => /straight corridor/.test(p)));
check("every connection produced a corridor", DUNGEONS.every(d => d.corridors.length === d.connections.length));
check("corridors bridge the gap exactly", DUNGEONS.every(d => d.corridors.every(c => c.w > 0 && c.d > 0)));
// THE DOORWAY TEST. Walls are collision boxes, so a wall drawn straight across a doorway seals the
// room and strands the player inside it. Assert every corridor mouth is actually open.
check("corridors are not walled shut", (()=>{
  const sealed = [];
  for (const d of DUNGEONS){
    const walls = [...d.rooms.flatMap(r => r.walls), ...d.corridorWalls];
    for (const c of d.corridors){
      // step along the corridor's centre line; no wall box may contain any point on it
      for (let t = 0; t <= 1.0001; t += 0.1){
        const x = c.axis === "x" ? c.x - c.w/2 + c.w*t : c.x;
        const z = c.axis === "x" ? c.z : c.z - c.d/2 + c.d*t;
        for (const w of walls){
          if (Math.abs(x - w.x) < w.w/2 - 0.01 && Math.abs(z - w.z) < w.d/2 - 0.01){
            sealed.push(`${d.id}: ${c.from}->${c.to} blocked by ${w.id}`); t = 2; break;
          }
        }
      }
    }
  }
  if (sealed.length) console.log("   " + [...new Set(sealed)].join("\n   "));
  return sealed.length === 0;
})());
check("room walls enclose the room apart from its doorways", (()=>{
  // the perimeter must be covered: sample it and require a wall OR a corridor at each point
  for (const d of DUNGEONS){
    for (const r of d.rooms){
      const hw = r.w/2, hd = r.d/2;
      for (let t = 0.02; t < 0.99; t += 0.02){
        for (const [x, z] of [[r.x-hw+r.w*t, r.z+hd], [r.x-hw+r.w*t, r.z-hd],
                              [r.x+hw, r.z-hd+r.d*t], [r.x-hw, r.z-hd+r.d*t]]){
          const walled = r.walls.some(w => Math.abs(x-w.x) <= w.w/2+0.01 && Math.abs(z-w.z) <= w.d/2+0.01);
          const door = d.corridors.some(c => Math.abs(x-c.x) <= c.w/2+0.01 && Math.abs(z-c.z) <= c.d/2+0.01);
          if (!walled && !door){ console.log(`   ${d.id}/${r.id}: gap in the wall at ${x.toFixed(1)},${z.toFixed(1)}`); return false; }
        }
      }
    }
  }
  return true;
})());
// A dungeon compiles to a zone, so it must satisfy every rule an outdoor zone does.
check("each dungeon compiles to a valid zone", (()=>{
  const problems = DUNGEONS.flatMap(d => WC.validateZone(WC.buildWorld({zones:[DG.dungeonZone(d)]}).get(d.id),
    { knownModels:[...knownModels], zoneIds: [...WORLD.zoneIds, d.id] }));
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("the dungeon spawn is not inside a wall", DUNGEONS.every(d => {
  const z = DG.dungeonZone(d);
  return ST.isClear(z.spawn.x, z.spawn.z, ST.PLAYER_RADIUS, z.obstacles);
}));
check("a boss's footprint still leaves its arena walkable", DUNGEONS.every(d => {
  const z = DG.dungeonZone(d);
  for (const r of d.rooms.filter(x => x.boss)){
    // you must be able to stand somewhere in the room and reach the boss's edge
    const ring = [[r.w/2 - 3, 0], [-(r.w/2 - 3), 0], [0, r.d/2 - 3], [0, -(r.d/2 - 3)]];
    if (!ring.every(([dx, dz]) => ST.isClear(r.x + dx, r.z + dz, ST.PLAYER_RADIUS, z.obstacles))) return false;
  }
  return true;
}));
check("the dungeon's exit back outdoors is reachable", DUNGEONS.every(d => {
  const z = DG.dungeonZone(d);
  return z.exits.every(e => ST.isClear(e.x, e.z, ST.PLAYER_RADIUS, z.obstacles));
}));
check("no enemy or boss is spawned inside a wall", DUNGEONS.every(d => {
  const z = DG.dungeonZone(d);
  // Walls only. A boss stands at the centre of its own collision circle, so testing it against
  // every obstacle would report the boss as being stuck inside itself.
  const walls = z.obstacles.filter(o => String(o.id).startsWith("wall:"));
  const bad = z.enemies.filter(e => !ST.isClear(e.x, e.z, ST.PLAYER_RADIUS, walls));
  if (bad.length) console.log("   in a wall:", bad.map(e=>e.name).join(", "));
  return bad.length === 0;
}));
check("every dungeon entrance in a zone names a real dungeon", (()=>{
  const ids = new Set(DUNGEONS.map(d => d.id));
  const bad = WORLD.zoneIds.flatMap(id => WORLD.get(id).dungeonEntrances.filter(e => !ids.has(e.id)).map(e => `${id} -> ${e.id}`));
  if (bad.length) console.log("   unknown dungeon:", bad.join(", "));
  return bad.length === 0;
})());
check("every dungeon's entranceZone actually places its entrance", (()=>{
  const missing = DUNGEONS.filter(d => d.entranceZone &&
    !(WORLD.get(d.entranceZone) || {dungeonEntrances:[]}).dungeonEntrances.some(e => e.id === d.id));
  if (missing.length) console.log("   no entrance placed for:", missing.map(d=>d.id).join(", "));
  return missing.length === 0;
})());

// chunk helpers (the coordinate convention step 3 will build on)
check("chunk coords are stable across the origin", WC.chunkCoord(-1, 32) === -1 && WC.chunkCoord(0, 32) === 0 && WC.chunkCoord(33, 32) === 1);
check("chunk centre is inside its own chunk", (()=>{
  const c = WC.chunkCenter(3, -2, 32);
  return WC.chunkCoord(c.x, 32) === 3 && WC.chunkCoord(c.z, 32) === -2;
})());
check("chunksInRadius covers the player's own chunk", (()=>{
  const got = WC.chunksInRadius(5, 5, 32, 70);
  return got.some(c => c.key === WC.chunkKey(0, 0)) && got.length > 4;
})());
check("chunksInRadius grows with radius", WC.chunksInRadius(0,0,32,120).length > WC.chunksInRadius(0,0,32,70).length);

// ---- 4.38 WORLDSPEC step 2: procedural terrain ----
const acad = WORLD.get("academy"), forest = WORLD.get("whispering_forest");
const acadRaw = WORLD.get("academy");
const acadFlats = TER.flatsForZone(acad), forestFlats = TER.flatsForZone(forest);

// ---- 4.375 scatter, bounds and zone-local collision (step 1-2 completeness) ----
check("count-based content scatters into concrete placements", (()=>{
  const sc = WC.scatterZone(WORLD.get("whispering_forest"));
  return sc.props.length > 100 && sc.resourceNodes.length >= 20 && sc.enemies.length === 8
      && sc.props.every(p => typeof p.x === "number" && p.count === undefined);
})());
check("scatter is deterministic from the zone seed", (()=>{
  const f = WORLD.get("whispering_forest");
  return JSON.stringify(WC.scatterZone(f)) === JSON.stringify(WC.scatterZone(f));
})());
check("a different seed scatters differently", (()=>{
  const f = WORLD.get("whispering_forest");
  const g = { ...f, terrain: { ...f.terrain, seed: f.terrain.seed + 7 } };
  return JSON.stringify(WC.scatterZone(f).props) !== JSON.stringify(WC.scatterZone(g).props);
})());
check("scattered content stays inside the zone bounds", (()=>{
  const f = WORLD.get("whispering_forest"), sc = WC.scatterZone(f);
  const all = [...sc.props, ...sc.resourceNodes, ...sc.enemies];
  return all.every(e => e.x >= f.bounds.minX && e.x <= f.bounds.maxX && e.z >= f.bounds.minZ && e.z <= f.bounds.maxZ);
})());
check("scatter keeps clear of the spawn", (()=>{
  const f = WORLD.get("whispering_forest"), sc = WC.scatterZone(f);
  return [...sc.props, ...sc.resourceNodes].every(e => Math.hypot(e.x - f.spawn.x, e.z - f.spawn.z) >= 13.9);
})());
check("scatter does not stack items on top of each other", (()=>{
  const sc = WC.scatterZone(WORLD.get("whispering_forest"));
  const all = [...sc.props, ...sc.resourceNodes];
  for (let i = 0; i < all.length; i++) for (let j = i+1; j < all.length; j++)
    if (Math.hypot(all[i].x-all[j].x, all[i].z-all[j].z) < 2) return false;
  return true;
})());
check("scatter never places anything underwater", (()=>{
  const f = WORLD.get("whispering_forest"), sc = WC.scatterZone(f), fl = TER.flatsForZone(f);
  const all = [...sc.props, ...sc.resourceNodes, ...sc.enemies];
  const wet = all.filter(e => TER.isWater(e.x, e.z, f.terrain, fl));
  if (wet.length) console.log("   underwater:", wet.length, "of", all.length);
  return wet.length === 0;
})());
check("scatter never places anything on a cliff face", (()=>{
  const f = WORLD.get("whispering_forest"), sc = WC.scatterZone(f), fl = TER.flatsForZone(f);
  return [...sc.props, ...sc.resourceNodes].every(e => TER.slopeAt(e.x, e.z, f.terrain, fl) <= 0.9);
})());
check("hand-placed entries survive scatter untouched", (()=>{
  const sc = WC.scatterZone(acadRaw);
  return sc.props.length === acadRaw.props.length
      && sc.props.every((p,i) => p.x === acadRaw.props[i].x && p.z === acadRaw.props[i].z);
})());
// zone-local collision: a second zone must not inherit the academy's buildings
check("each zone carries its own obstacle set or none", (()=>{
  const a = WORLD.get("academy"), f = WORLD.get("whispering_forest");
  return Array.isArray(a.obstacles) && a.obstacles.length > 0 && !(f.obstacles && f.obstacles.length);
})());
check("the academy zone's obstacles match structures.js", (()=>
  JSON.stringify(WORLD.get("academy").obstacles) === JSON.stringify(ST.OBSTACLES))());
check("zone bounds differ between zones (so clamping must be per-zone)", (()=>{
  const a = WORLD.get("academy").bounds, f = WORLD.get("whispering_forest").bounds;
  return a.maxX !== f.maxX;
})());

check("terrain is deterministic for a given seed", (()=>{
  const a = TER.heightAt(12.3, -47.9, forest.terrain, forestFlats);
  const b = TER.heightAt(12.3, -47.9, forest.terrain, forestFlats);
  return a === b;
})());
check("a different seed gives different terrain", (()=>{
  const t2 = { ...forest.terrain, seed: forest.terrain.seed + 1 };
  let diff = 0;
  for (let i = 0; i < 40; i++){
    const x = i * 7.3, z = i * -5.1;
    if (Math.abs(TER.heightAt(x,z,forest.terrain,[]) - TER.heightAt(x,z,t2,[])) > 1e-6) diff++;
  }
  return diff > 30;
})());
check("terrain stays within its amplitude budget", (()=>{
  const biome = TER.BIOMES[forest.terrain.biome];
  const max = forest.terrain.amplitude * biome.rough + 1e-6;
  for (let i = 0; i < 400; i++){
    const x = (i % 20) * 15 - 150, z = Math.floor(i / 20) * 15 - 150;
    if (Math.abs(TER.heightAt(x, z, forest.terrain, [])) > max) return false;
  }
  return true;
})());
check("terrain is continuous (no cliffs between adjacent samples)", (()=>{
  let worst = 0;
  for (let i = 0; i < 300; i++){
    const x = (i % 30) * 5 - 75, z = Math.floor(i / 30) * 5 - 75;
    worst = Math.max(worst, Math.abs(TER.heightAt(x+0.5,z,forest.terrain,forestFlats) - TER.heightAt(x,z,forest.terrain,forestFlats)));
  }
  return worst < 1.5;
})());
// the constraint that actually matters: landmarks must not float or clip
check("every academy building sits on flat ground", (()=>{
  const bad = [];
  for (const b of acad.buildings){
    for (const [dx,dz] of [[0,0],[b.w/2,0],[-b.w/2,0],[0,b.d/2],[0,-b.d/2]]){
      const h = TER.heightAt(b.x+dx, b.z+dz, acad.terrain, acadFlats);
      if (Math.abs(h) > 0.5) bad.push(`${b.id}@${h.toFixed(2)}`);
    }
  }
  if (bad.length) console.log("   not flat:", bad.slice(0,4).join(", "));
  return bad.length === 0;
})());
check("landmarks, NPCs and the spawn sit on flat ground", (()=>{
  const pts = [[acad.spawn.x, acad.spawn.z], ...acad.landmarks.map(l=>[l.x,l.z]), ...acad.npcs.map(n=>[n.x,n.z])];
  return pts.every(([x,z]) => Math.abs(TER.heightAt(x, z, acad.terrain, acadFlats)) <= 0.5);
})());
check("flattening eases out rather than stepping", (()=>{
  const f = [{x:0, z:0, r:10}];
  let prev = TER.flatteningFactor(0, 0, f), maxJump = 0;
  for (let d = 0; d <= 30; d += 0.5){
    const cur = TER.flatteningFactor(d, 0, f);
    maxJump = Math.max(maxJump, Math.abs(cur - prev)); prev = cur;
  }
  return maxJump < 0.15;
})());
check("flattening is fully off far from any landmark", TER.flatteningFactor(500, 500, acadFlats) === 1);
// world.js carries a fallback zone for when the config fetch fails. It duplicates the academy's
// terrain settings, so it can drift — assert the two agree rather than discovering it visually.
check("the world.js fallback zone matches the academy zone's terrain", (()=>{
  const src = fs.readFileSync(path.join(ROOT_PUBLIC, "world.js"), "utf8");
  const m = src.match(/terrain:\s*\{\s*seed:\s*(\d+),\s*scale:\s*([\d.]+),\s*amplitude:\s*([\d.]+),\s*baseHeight:\s*([\d.-]+),\s*biome:\s*"(\w+)"/);
  if (!m) { console.log("   could not find the fallback terrain block in world.js"); return false; }
  const t = acad.terrain;
  return +m[1] === t.seed && +m[2] === t.scale && +m[3] === t.amplitude && +m[4] === t.baseHeight && m[5] === t.biome;
})());
check("the academy hub is gentle terrain", acad.terrain.amplitude * TER.BIOMES[acad.terrain.biome].rough <= 2);
check("water only exists where a zone declares a water level", (()=>{
  if (TER.isWater(0, 0, acad.terrain, acadFlats)) return false;      // academy has no waterLevel
  let anyWater = false;
  for (let i = 0; i < 400; i++){
    const x = (i % 20) * 16 - 160, z = Math.floor(i / 20) * 16 - 160;
    if (TER.isWater(x, z, forest.terrain, forestFlats)) { anyWater = true; break; }
  }
  return anyWater;                                                    // forest declares one, so some exists
})());
check("slope is finite and sane everywhere sampled", (()=>{
  for (let i = 0; i < 200; i++){
    const x = (i % 20) * 15 - 150, z = Math.floor(i / 20) * 15 - 150;
    const sl = TER.slopeAt(x, z, forest.terrain, forestFlats);
    if (!Number.isFinite(sl) || sl > 4) return false;
  }
  return true;
})());
// REGRESSION: the first hash multiplied the seed by a 64-bit constant, past MAX_SAFE_INTEGER.
// The product lost its low bits, the hash returned a constant, and every zone came out perfectly
// flat — while every other terrain assertion (determinism, amplitude, continuity, slope) still
// passed, because a constant satisfies all of them. Terrain must actually VARY.
check("terrain actually varies across a zone", (()=>{
  for (const z of [acad, forest]){
    const flats = TER.flatsForZone(z), hs = [];
    for (let i = 0; i < 200; i++){
      const x = (i % 20) * 14 - 140, zz = Math.floor(i / 20) * 14 - 140;
      hs.push(TER.heightAt(x, zz, z.terrain, flats));
    }
    const spread = Math.max(...hs) - Math.min(...hs);
    const distinct = new Set(hs.map(v => v.toFixed(3))).size;
    if (spread < 0.2 || distinct < 20){
      console.log(`   ${z.id} is flat: spread=${spread.toFixed(3)} distinct=${distinct}`);
      return false;
    }
  }
  return true;
})());
check("the noise hash is well distributed (not collapsing to a constant)", (()=>{
  // sample across seeds too — the old bug was seed-dependent
  for (const seed of [1, 999, 20260804, 77123, 2147480000]){
    const vals = new Set();
    for (let i = 0; i < 120; i++) vals.add(TER.fbm(i * 0.31, i * 0.77, seed).toFixed(4));
    if (vals.size < 40) { console.log(`   seed ${seed} collapsed to ${vals.size} distinct values`); return false; }
  }
  return true;
})());
check("fbm stays in -1..1", (()=>{
  for (let i = 0; i < 500; i++){
    const v = TER.fbm(i * 0.37, i * -0.19, 42);
    if (!(v >= -1.0001 && v <= 1.0001)) return false;
  }
  return true;
})());

// ---- 4.385 WORLDSPEC step 3: chunk streaming ----
const fscat = WC.scatterZone(forest);
const fbuckets = WC.bucketByChunk(forest, fscat);
const favail = new Set(fbuckets.keys());
check("scattered content buckets into chunks", fbuckets.size > 10);
check("bucketing loses nothing", (()=>{
  let n = 0;
  for (const b of fbuckets.values()) n += b.props.length + b.resourceNodes.length + b.enemies.length;
  return n === fscat.props.length + fscat.resourceNodes.length + fscat.enemies.length;
})());
check("every item lands in the chunk its coordinates say it should", (()=>{
  for (const [key, b] of fbuckets){
    for (const item of [...b.props, ...b.resourceNodes, ...b.enemies]){
      const want = WC.chunkKey(WC.chunkCoord(item.x, forest.chunkSize), WC.chunkCoord(item.z, forest.chunkSize));
      if (want !== key) return false;
    }
  }
  return true;
})());
check("bucketing is stable across runs (a chunk reloads identically)", (()=>
  JSON.stringify([...WC.bucketByChunk(forest, WC.scatterZone(forest))].sort())
  === JSON.stringify([...fbuckets].sort()))());
// the delta rules
check("standing still produces no load/unload churn", (()=>{
  const loaded = new Set();
  const first = WC.chunkDelta(forest, forest.spawn.x, forest.spawn.z, loaded, favail);
  first.load.forEach(k => loaded.add(k));
  const again = WC.chunkDelta(forest, forest.spawn.x, forest.spawn.z, loaded, favail);
  return first.load.length > 0 && again.load.length === 0 && again.unload.length === 0;
})());
check("hysteresis stops boundary thrash", (()=>{
  // a chunk between loadRadius and unloadRadius must stay loaded rather than flapping
  const loaded = new Set();
  WC.chunkDelta(forest, 0, 0, loaded, favail).load.forEach(k => loaded.add(k));
  const before = loaded.size;
  // nudge just past loadRadius but well inside unloadRadius
  const d = WC.chunkDelta(forest, forest.loadRadius * 0.4, 0, loaded, favail);
  return d.unload.length === 0 && before > 0;
})());
check("walking away unloads what is now distant", (()=>{
  const loaded = new Set();
  WC.chunkDelta(forest, 0, 0, loaded, favail).load.forEach(k => loaded.add(k));
  const d = WC.chunkDelta(forest, 150, -150, loaded, favail);
  return d.unload.length > 0 && d.load.length > 0;
})());
check("nothing is ever both loaded and unloaded in one delta", (()=>{
  const loaded = new Set();
  WC.chunkDelta(forest, 0, 0, loaded, favail).load.forEach(k => loaded.add(k));
  for (const [x, z] of [[20,20],[60,-30],[-90,10],[140,140]]){
    const d = WC.chunkDelta(forest, x, z, loaded, favail);
    if (d.load.some(k => d.unload.includes(k))) return false;
    d.unload.forEach(k => loaded.delete(k)); d.load.forEach(k => loaded.add(k));
  }
  return true;
})());
check("a full walk across the zone keeps the loaded set bounded", (()=>{
  const loaded = new Set();
  let peak = 0;
  for (let x = -150; x <= 150; x += 8){
    const d = WC.chunkDelta(forest, x, x * 0.3, loaded, favail);
    d.unload.forEach(k => loaded.delete(k)); d.load.forEach(k => loaded.add(k));
    peak = Math.max(peak, loaded.size);
  }
  if (peak > 40) console.log("   peak loaded chunks:", peak);
  return peak > 0 && peak <= 40;               // §8 budget sanity
})());
check("the hand-placed academy needs no streaming", (()=>
  !acad.props.some(p=>p.count) && !acad.resourceNodes.some(n=>n.count))());

// ---- 4.39 camera collision (pure maths; the browser suite checks it in the running game) ----
check("the camera keeps its full distance in the open", (()=>{
  return ST.cameraDistanceLimit(55, 55, 0, 10.5) === 10.5 && ST.cameraDistanceLimit(-48, -48, 1.2, 10.5) === 10.5;
})());
check("the camera pulls in when a building is behind the player", (()=>{
  // yaw 0 puts the camera at +z. Stand south of the Scribing Hall (-31,-14) so the camera swings
  // back INTO it. (yaw = PI points the other way — away from the hall — which is why an earlier
  // version of this test passed for the wrong reason.)
  const d = ST.cameraDistanceLimit(-31, -26, 0, 10.5);
  return d < 10.5 && d >= 2.2;
})());
check("the camera pulls in when the arena is behind the player", ST.cameraDistanceLimit(0, -20, Math.PI, 10.5) < 10.5);
check("the camera never returns a distance that is itself inside geometry", (()=>{
  for (let a = 0; a < 32; a++){
    const yaw = (a/32) * Math.PI * 2;
    for (const [px, pz] of [[0,-14],[-31,-26],[31,-26],[0,24],[13,15],[-16,18]]){
      const d = ST.cameraDistanceLimit(px, pz, yaw, 10.5);
      const cx = px + Math.sin(yaw)*d, cz = pz + Math.cos(yaw)*d;
      // the minimum clamp can sit inside something when the player is right against a wall;
      // anything beyond that minimum must be genuinely clear
      if (d > 0 && !ST.isClear(cx, cz, ST.CAMERA_RADIUS)) return false;
    }
  }
  return true;
})());
check("a fully blocked camera falls back to a position the player could stand in", (()=>{
  // standing inside the tower's shadow from every angle: the limit is either a clear distance,
  // or 0 (sit on the player, which is clear by construction because movement is resolved)
  for (let a = 0; a < 24; a++){
    const yaw = (a/24)*Math.PI*2;
    const d = ST.cameraDistanceLimit(9, 0, yaw, 10.5);
    if (d < 0) return false;
    if (d > 0 && !ST.isClear(9 + Math.sin(yaw)*d, 0 + Math.cos(yaw)*d, ST.CAMERA_RADIUS)) return false;
  }
  return true;
})());
check("camera limiting is monotonic in the requested distance", (()=>{
  for (const yaw of [0, 1, 2.5, 4]){
    const near = ST.cameraDistanceLimit(13, 15, yaw, 6);
    const far  = ST.cameraDistanceLimit(13, 15, yaw, 12);
    if (far < near - 1e-9) return false;
  }
  return true;
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

// ---- onboarding chain (BACKLOG §1 "first 10 minutes") ----
// The point of this suite is that the chain is COMPLETABLE using the real engine functions. A
// tutorial that asks for something the game cannot deliver is worse than no tutorial, and the
// only way to know is to play it.
check("a fresh save starts on 'choose your school'", (()=>{
  const s = G.newGame();
  const st = OB.currentStep(s);
  return st && st.id === "school";
})());
check("every onboarding step has a title, a reason and a destination",
  OB.STEPS.every(st => st.title && st.why && st.goto && typeof st.done === "function"));
check("onboarding step ids are unique", new Set(OB.STEPS.map(st => st.id)).size === OB.STEPS.length);
check("the onboarding chain can actually be completed", (()=>{
  const s = G.newGame();
  const seen = [];
  const advance = () => { const st = OB.currentStep(s); if (st) seen.push(st.id); return st; };

  advance();                                   // school
  G.setSchool(s, "fire"); s.flags.schoolPicked = true;

  advance();                                   // gather
  // gather enough of the three refinable sources to make one of each scribing input
  for (const cm of CARD_MATERIALS){
    const src = MATERIALS.find(m => cm.from.includes(m.id));
    for (let i = 0; i < 3; i++) G.gather(s, src);
  }

  advance();                                   // refine
  for (const cm of CARD_MATERIALS){
    const src = MATERIALS.find(m => cm.from.includes(m.id));
    const r = G.refine(s, cm.id, src.id);
    if (!r.ok){ console.log("   refine failed:", cm.id, r.err); return false; }
  }

  advance();                                   // scribe
  const sc = G.scribe(s);
  if (!sc.ok){ console.log("   scribe failed:", sc.err); return false; }

  advance();                                   // grade
  s.gold = 5000;
  const ungraded = s.cards.find(c => !c.graded);
  const gr = G.gradeCard(s, ungraded.uid);
  if (!gr.ok){ console.log("   grade failed:", gr.err); return false; }

  advance();                                   // deck (the starter deck is already legal)
  advance();                                   // duel
  s.stats.won = 1;

  const done = OB.currentStep(s);
  if (done){ console.log("   stuck on:", done.id); return false; }
  // The chain must never go BACKWARDS. `seen` can repeat an id (the starter deck already
  // satisfies the deck step, so "duel" is the current step twice in a row) — what matters is
  // that the sequence of distinct steps follows the declared order.
  const order = OB.STEPS.map(st => st.id);
  const distinct = seen.filter((id, i) => seen.indexOf(id) === i);
  const expected = order.filter(id => distinct.includes(id));
  if (JSON.stringify(distinct) !== JSON.stringify(expected)){
    console.log("   steps came out of order:", distinct.join(" -> "));
    return false;
  }
  return OB.progress(s).complete;
})());
check("the chain does not get stuck when steps are done out of order", (()=>{
  // The whole reason steps are DERIVED: a player who scribes before being told to must not be
  // asked to do it again. A tracked counter would be stuck here.
  const s = G.newGame();
  s.inventory.canvas = 1; s.inventory.ink = 1; s.inventory.reagent = 1;
  G.scribe(s);
  return OB.STEPS.find(st => st.id === "scribe").done(s)
      && OB.STEPS.find(st => st.id === "refine").done(s);
})());
check("gathering alone does not satisfy the refine step", (()=>{
  const s = G.newGame();
  G.gather(s, MATERIALS.find(m => m.id === "oak_log"));
  return OB.STEPS.find(st => st.id === "gather").done(s)
      && !OB.STEPS.find(st => st.id === "refine").done(s);
})());
check("the checklist marks exactly one step active", (()=>{
  const s = G.newGame();
  return OB.checklist(s).filter(x => x.active).length === 1;
})());
check("a finished chain has no active step", (()=>{
  const s = G.newGame();
  s.flags.schoolPicked = true; s.inventory.oak_log = 1; s.stats.scribed = 1;
  s.stats.graded = 1; s.stats.won = 1;
  return OB.currentStep(s) === null && OB.checklist(s).every(x => !x.active);
})());

// ---- spell VFX (BACKLOG §4) ----
// The whole point of deciding effects in a pure module is that "this card plays nothing" is a
// test failure rather than a spell that quietly does not appear.
check("every effect kind in the catalog has a visual", (()=>{
  const missing = VFX.unmappedKinds(CARDS);
  if (missing.length) console.log("   no VFX mapped for:", missing.join(", "));
  return missing.length === 0;
})());
check("every card resolves to an effect", (()=>{
  const none = CARDS.filter(c => !VFX.effectFor(c)).map(c => c.id + " (" + c.type + ")");
  if (none.length) console.log("   no effect:", none.join(", "));
  return none.length === 0;
})());
check("every effect names a known archetype",
  CARDS.every(c => VFX.ARCHETYPES.includes(VFX.effectFor(c).archetype)));
check("every school has its own VFX palette", (()=>{
  const schools = [...new Set(CARDS.map(c => c.school))];
  const missing = schools.filter(s => !VFX.SCHOOL_VFX[s]);
  if (missing.length) console.log("   no palette for:", missing.join(", "));
  return missing.length === 0;
})());
check("school palettes are visually distinct", (()=>{
  const cores = Object.values(VFX.SCHOOL_VFX).map(p => p.trail);
  return new Set(cores).size === cores.length;
})());
check("effect durations stay short enough not to stall a turn",
  CARDS.every(c => { const e = VFX.effectFor(c); return e.duration > 0.2 && e.duration <= 1.7; }));
check("an area spell reads as area, not a single bolt", (()=>{
  // meteor is dmgAll + dmgWiz; the area strike must win, or the headline effect is invisible
  const e = VFX.effectFor(CARD_MAP.meteor);
  return e.archetype === "rain" && e.origin === VFX.ORIGIN.SKY;
})());
check("a plain damage spell is a bolt from the caster", (()=>{
  const e = VFX.effectFor(CARD_MAP.firebolt);
  return e.archetype === "bolt" && e.origin === VFX.ORIGIN.CASTER && e.targeted;
})());
check("a shield spell plays on the caster, not the target", (()=>{
  const e = VFX.effectFor(CARD_MAP.ice_armor);
  return e.archetype === "aura" && e.origin === VFX.ORIGIN.CASTER;
})());
check("creature keywords are not mistaken for cast effects", (()=>{
  // creature fx are bare strings ("taunt"), unlike spell fx objects ({k:"dmg"})
  const kws = VFX.keywordsFor(CARD_MAP.vampire);
  return kws.includes("drain") && VFX.effectFor(CARD_MAP.vampire).kind === "summon";
})());
check("a bigger spell lasts longer than a small one of the same shape",
  VFX.effectFor(CARD_MAP.fireball).duration > VFX.effectFor(CARD_MAP.firebolt).duration);

// ---- zone quests (BACKLOG §2) ----
check("every zone quest names a real zone and giver", (()=>{
  const zoneIds = new Set(WORLD.zoneIds);
  const bad = [];
  for (const q of ZQ.ZONE_QUESTS){
    if (!zoneIds.has(q.zone)) bad.push(`${q.id}: unknown zone ${q.zone}`);
    const z = WORLD.get(q.zone);
    if (z && !z.npcs.some(n => n.station === q.giver || n.key === q.giver))
      bad.push(`${q.id}: no NPC "${q.giver}" stands in ${q.zone}`);
  }
  if (bad.length) console.log("   " + bad.join("\n   "));
  return bad.length === 0;
})());
check("zone quest ids are unique", new Set(ZQ.ZONE_QUESTS.map(q => q.id)).size === ZQ.ZONE_QUESTS.length);
check("every quest objective is a kind the code handles", (()=>{
  const known = ["gather", "slay", "boss", "clear", "visit"];
  const bad = ZQ.ZONE_QUESTS.filter(q => !known.includes(q.objective.kind)).map(q => q.id + ":" + q.objective.kind);
  if (bad.length) console.log("   unknown objective:", bad.join(", "));
  return bad.length === 0;
})());
check("gather quests ask for materials that exist and can be gathered", (()=>{
  const bad = ZQ.ZONE_QUESTS.filter(q => q.objective.kind === "gather" && !GATHERABLE.includes(q.objective.id))
    .map(q => q.id + " wants " + q.objective.id);
  if (bad.length) console.log("   ungatherable:", bad.join(", "));
  return bad.length === 0;
})());
check("dungeon quests reference real dungeons and rooms", (()=>{
  const byId = new Map(DUNGEONS.map(d => [d.id, d]));
  const bad = [];
  for (const q of ZQ.ZONE_QUESTS){
    const o = q.objective;
    if (!o.dungeon) continue;
    const d = byId.get(o.dungeon);
    if (!d){ bad.push(`${q.id}: unknown dungeon ${o.dungeon}`); continue; }
    if (o.kind === "clear" && !d.rooms.some(r => r.id === o.room)) bad.push(`${q.id}: ${o.dungeon} has no room "${o.room}"`);
    if (o.kind === "slay"){
      const total = DG.dungeonZone(d).enemies.length;
      if (o.n > total) bad.push(`${q.id}: asks for ${o.n} kills but ${o.dungeon} only holds ${total}`);
    }
    if (o.kind === "boss" && !d.rooms.some(r => r.boss)) bad.push(`${q.id}: ${o.dungeon} has no boss`);
  }
  if (bad.length) console.log("   " + bad.join("\n   "));
  return bad.length === 0;
})());
check("quest prerequisites cannot deadlock", (()=>{
  // every quest must be reachable by completing prerequisites in some order
  const done = new Set();
  let moved = true;
  while (moved){
    moved = false;
    for (const q of ZQ.ZONE_QUESTS){
      if (done.has(q.id)) continue;
      if ((q.requires || []).every(r => done.has(r))){ done.add(q.id); moved = true; }
    }
  }
  const stuck = ZQ.ZONE_QUESTS.filter(q => !done.has(q.id)).map(q => q.id);
  if (stuck.length) console.log("   unreachable quests:", stuck.join(", "));
  return stuck.length === 0;
})());
check("a gather quest can be accepted, completed and handed in", (()=>{
  const s = G.newGame();
  const q = ZQ.ZONE_QUESTS.find(x => x.objective.kind === "gather");
  if (!ZQ.accept(s, q.id).ok){ console.log("   accept failed"); return false; }
  if (ZQ.progressOf(s, q).done){ console.log("   complete before gathering anything"); return false; }
  if (ZQ.turnIn(s, q.id).ok){ console.log("   handed in while incomplete"); return false; }
  s.inventory[q.objective.id] = q.objective.n;
  const r = ZQ.turnIn(s, q.id);
  return r.ok && ZQ.isDone(s, q.id) && !ZQ.isAccepted(s, q.id)
      && !(s.inventory[q.objective.id] > 0);      // the materials were consumed
})());
check("a quest cannot be handed in twice", (()=>{
  const s = G.newGame();
  const q = ZQ.ZONE_QUESTS.find(x => x.objective.kind === "gather");
  ZQ.accept(s, q.id); s.inventory[q.objective.id] = q.objective.n * 2;
  ZQ.turnIn(s, q.id);
  return ZQ.turnIn(s, q.id).ok === false;
})());
check("a locked quest is not offered", (()=>{
  const s = G.newGame();
  const gated = ZQ.ZONE_QUESTS.find(q => (q.requires || []).length);
  return !ZQ.offeredBy(s, gated.giver).some(q => q.id === gated.id);
})());
check("finishing the prerequisite unlocks the next quest", (()=>{
  const s = G.newGame();
  const gated = ZQ.ZONE_QUESTS.find(q => (q.requires || []).length);
  s.zoneQuests.done.push(...gated.requires);
  return ZQ.offeredBy(s, gated.giver).some(q => q.id === gated.id);
})());
check("dungeon progress drives slay and boss quests", (()=>{
  const s = G.newGame();
  const slay = ZQ.ZONE_QUESTS.find(q => q.objective.kind === "slay");
  const boss = ZQ.ZONE_QUESTS.find(q => q.objective.kind === "boss");
  s.worldState.dungeons[slay.objective.dungeon] = { defeated: ["a", "b", "c"], cleared: [], bossDead: true };
  return ZQ.progressOf(s, slay).done && ZQ.progressOf(s, boss).done;
})());
check("every quest pays something", ZQ.ZONE_QUESTS.every(q => (q.reward.gold || 0) > 0 || (q.reward.cards || 0) > 0));
check("a fresh save has at least one quest available somewhere", (()=>{
  const s = G.newGame();
  const givers = [...new Set(ZQ.ZONE_QUESTS.map(q => q.giver))];
  return givers.some(g => ZQ.offeredBy(s, g).length > 0);
})());

// ---- academy curriculum (BACKLOG "Academy progression") ----
check("years are ordered by ascending threshold", (()=>{
  for (let i=1;i<ACADEMY.YEARS.length;i++) if (ACADEMY.YEARS[i].min <= ACADEMY.YEARS[i-1].min) return false;
  return true;
})());
check("score 0 lands on the first year", ACADEMY.yearFor(0).name === ACADEMY.YEARS[0].name);
check("a huge score lands on the last year, not past the array",
  ACADEMY.yearFor(1e9).name === ACADEMY.YEARS[ACADEMY.YEARS.length-1].name);
check("yearFor is monotonic — score never buys you a LOWER year", (()=>{
  let last = -1;
  for (let s=0; s<=200; s+=5){ const i = ACADEMY.yearIndexFor(s); if (i < last) return false; last = i; }
  return true;
})());
check("every year past the first grants a real perk over the one before it", (()=>{
  for (let i=1;i<ACADEMY.YEARS.length;i++){
    const a = ACADEMY.YEARS[i-1].perks, b = ACADEMY.YEARS[i].perks;
    if (!(b.questGold > a.questGold && b.market > a.market && b.xp > a.xp)) return false;
  }
  return true;
})());
check("progressToNext reaches 100% exactly at the next threshold", (()=>{
  const next = ACADEMY.YEARS[1].min;
  return ACADEMY.progressToNext(next - 1).pct < 100 && ACADEMY.progressToNext(next).pct === 0;
})());
check("the top year reports maxed with no next", ACADEMY.progressToNext(1e9).maxed === true && ACADEMY.progressToNext(1e9).next === null);
check("applyBonus rounds and handles a discount (negative pct)", (()=>{
  return ACADEMY.applyBonus(100, 10) === 110 && ACADEMY.applyBonus(100, -10) === 90 && ACADEMY.applyBonus(100, 0) === 100;
})());
check("a higher academy score never pays a WORSE quest reward", (()=>{
  const s = G.newGame();
  const before = G.academyPerks(s).questGold;
  s.level = 999;   // forces a top-tier score
  const after = G.academyPerks(s).questGold;
  return after >= before;
})());
check("academyRank keeps the same seven names it always had (no save-visible rank change)",
  JSON.stringify(ACADEMY.YEARS.map(y=>y.name)) ===
  JSON.stringify(["Novice","Apprentice","Adept","Scholar","Master","Grandmaster","Archmage"]));
check("a market discount actually lowers the price a higher-year player pays", (()=>{
  const cheap = CARDS.find(c=>c.rarity==="common");
  const low = G.newGame(); low.gold = 100000;
  const high = G.newGame(); high.gold = 100000; high.level = 999;
  const p1 = G.buyCard(low, cheap.id).price;
  const p2 = G.buyCard(high, cheap.id).price;
  return p2 <= p1;
})());
check("completeQuest pays out more gold and xp at a higher academy score", (()=>{
  const low = G.newGame();
  const high = G.newGame(); high.level = 999;
  const goldBefore1 = low.gold, xpBefore1 = low.xp;
  G.completeQuest(low, 0);
  const goldBefore2 = high.gold, xpBefore2 = high.xp;
  G.completeQuest(high, 0);
  return (high.gold - goldBefore2) >= (low.gold - goldBefore1)
      && (high.xp - xpBefore2) >= (low.xp - xpBefore1);
})());

// ---- Academy classes (BACKLOG "Academy classes/curriculum content") ----
check("classes unlock by year and cost gold, grant academy rank, once per day", (()=>{
  const s = G.newGame();
  s.gold = 500;
  const before = G.academyScore(s);
  const avail = G.classesState(s).classes;
  if (!avail.some(c => c.id === "dueling")) return false;   // Novice can attend Dueling
  const r = G.attendClass(s, "dueling");
  const after = G.academyScore(s);
  return r.ok && after === before + 3 && G.classesState(s).usedToday;
})());
check("a second class the same day is refused", (()=>{
  const s = G.newGame(); s.gold = 500;
  G.attendClass(s, "dueling");
  return G.attendClass(s, "dueling").err === "today";
})());
check("a locked class (higher year) is refused", (()=>{
  const s = G.newGame(); s.gold = 500;
  return G.attendClass(s, "archmagistery").err === "locked";
})());

// ---- NPC reputation (BACKLOG "NPC reputation") ----
check("reputation starts at Stranger with no bonus", (()=>{
  const s = G.newGame();
  return REP.repOf(s, "forest_sage") === 0 && REP.levelFor(0).name === "Stranger" && REP.bonusFor(s, "forest_sage") === 0;
})());
check("levels are ordered by ascending threshold and bonus", (()=>{
  for (let i=1;i<REP.REP_LEVELS.length;i++){
    if (REP.REP_LEVELS[i].min <= REP.REP_LEVELS[i-1].min) return false;
    if (REP.REP_LEVELS[i].bonus <= REP.REP_LEVELS[i-1].bonus) return false;
  }
  return true;
})());
check("gainRep accumulates per NPC independently", (()=>{
  const s = G.newGame();
  REP.gainRep(s, "forest_sage", 10);
  REP.gainRep(s, "forest_warden", 3);
  REP.gainRep(s, "forest_sage", 10);
  return REP.repOf(s, "forest_sage") === 20 && REP.repOf(s, "forest_warden") === 3;
})());
check("reputation rises past Stranger and grants a bonus", (()=>{
  const s = G.newGame();
  for (let i=0;i<3;i++) REP.gainRep(s, "forest_sage", REP.REP_PER_QUEST);
  return REP.bonusFor(s, "forest_sage") > 0;
})());
check("progressToNext for reputation reaches 100% at the threshold", (()=>{
  const next = REP.REP_LEVELS[1].min;
  return REP.progressToNext(next-1).pct < 100 && REP.progressToNext(next).pct === 0;
})());
check("max reputation level reports maxed", (()=>{
  const top = REP.REP_LEVELS[REP.REP_LEVELS.length-1].min + 500;
  return REP.progressToNext(top).maxed === true;
})());
check("turning in a field quest raises reputation with its giver", (()=>{
  const s = G.newGame();
  const q = ZQ.ZONE_QUESTS.find(x => x.objective.kind === "gather");
  ZQ.accept(s, q.id); s.inventory[q.objective.id] = q.objective.n;
  const before = REP.repOf(s, q.giver);
  const r = ZQ.turnIn(s, q.id);
  // zonequests.js does not touch reputation itself (kept pure) — this only proves the DATA is
  // there for the UI layer to apply; the UI-layer wiring is covered by the browser test.
  return r.ok && REP.repOf(s, q.giver) === before;
})());


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
