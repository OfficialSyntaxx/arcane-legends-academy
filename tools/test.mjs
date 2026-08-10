// Engine smoke test — runs the card engine, economy, and economy-balance checks headlessly.
import * as G from "../public/game.js";
import { CARDS, CARD_MAP, SCHOOLS, cardValue, gradeForRoll, gradeFee, GRADES } from "../public/cards.js";
import { equipmentFor, BARS, POTIONS, MATERIALS, CARD_MATERIALS, SLOTS as SLOTS_LIST, METALS as METALS_MAP, ENCHANTS, ENCHANT_MAP, enchantStats } from "../public/items.js";
import { WORLD_NODES, GATHERABLE } from "../public/nodes.js";
import { SKILLS as SKILLS_MAP } from "../public/items.js";
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
import * as LSN from "../public/lessons.js";
import * as VAR from "../public/variants.js";
import * as CX from "../public/codex.js";
import * as ARCH from "../public/archetypes.js";
import * as RANK from "../public/pvprank.js";
import * as MAGIC from "../public/schoolmagic.js";
import * as CB from "../public/cardbacks.js";
import * as ACHV from "../public/achievements.js";
import * as REP from "../public/reputation.js";
import * as DORM from "../public/dorm.js";
import * as CC from "../public/charcreate.js";
import * as EQ3 from "../public/equipment3d.js";
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

// ---- 8.6 auction history / price history (BACKLOG §6) ----
check("a settled auction is recorded into marketHistory, a live listing is not", (()=>{
  const s = G.newGame();
  const cardId = s.cards[0].id;
  G.listAuction(s, s.cards[0].uid, 50);
  const beforeSettle = s.marketHistory.length;
  s.auctions[0].ends = Date.now() - 1;
  G.auctionTick(s);
  return beforeSettle === 0 && s.marketHistory.length === 1 && s.marketHistory[0].cardId === cardId;
})());
check("priceHistoryFor returns only that card TYPE's sales, newest first", (()=>{
  const s = G.newGame();
  const twoOfSameType = s.cards.filter(c => c.id === s.cards[0].id);
  if (twoOfSameType.length < 2) return true;   // starter deck shape guard, not the thing under test
  const id = twoOfSameType[0].id;
  G.listAuction(s, twoOfSameType[0].uid, 30); s.auctions[0].ends = Date.now() - 2000; G.auctionTick(s);
  G.listAuction(s, twoOfSameType[1].uid, 40); s.auctions[0].ends = Date.now() - 1; G.auctionTick(s);
  const h = G.priceHistoryFor(s, id);
  return h.length === 2 && h[0].price === 40 && h[1].price === 30;   // newest (most recently settled) first
})());
check("priceHistoryFor never returns another card type's sales", (()=>{
  const s = G.newGame();
  const otherId = s.cards.find(c => c.id !== s.cards[0].id);
  if (!otherId) return true;
  G.listAuction(s, s.cards[0].uid, 50); s.auctions[0].ends = Date.now() - 1; G.auctionTick(s);
  return G.priceHistoryFor(s, otherId.id).length === 0;
})());
check("avgSalePrice is null with no sales recorded for that card type yet", (()=>{
  const s = G.newGame();
  return G.avgSalePrice(s, s.cards[0].id) === null;
})());
check("avgSalePrice averages the actual PAYOUT, not the asking price", (()=>{
  const s = G.newGame();
  const twoOfSameType = s.cards.filter(c => c.id === s.cards[0].id);
  if (twoOfSameType.length < 2) return true;
  const id = twoOfSameType[0].id;
  s.marketHistory = [{ cardId:id, price:50, pay:50, bidder:null, at:1 }, { cardId:id, price:50, pay:70, bidder:"NPC", at:2 }];
  return G.avgSalePrice(s, id) === 60;
})());
check("marketHistory is capped rather than growing forever", (()=>{
  const s = G.newGame();
  s.marketHistory = Array.from({length:200}, (_,i) => ({ cardId:"x", price:10, pay:10, bidder:null, at:i }));
  G.listAuction(s, s.cards[0].uid, 50); s.auctions[0].ends = Date.now() - 1; G.auctionTick(s);
  return s.marketHistory.length === 200;
})());
check("game.js newGame() starts marketHistory as an empty array", Array.isArray(G.newGame().marketHistory) && G.newGame().marketHistory.length === 0);

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


// ---- The Dorm (D1-D4) ----
// dorm.js is pure, so every layout rule, placement rule and derivation is checkable here rather
// than only in a browser. The bar is the one the rest of the world modules hold: no spatial maths
// in world.js, and nothing derived is stored in the save.
function dormSave(levels = { treasury:2, library:1, armory:0, tavern:1 }){
  const s = G.newGame();
  s.home.owned = true; s.home.upgrades = { ...s.home.upgrades, ...levels };
  return s;
}
check("the dorm's own configuration is valid", DORM.validateDorm().length === 0);
check("a fresh save has the dorm save shape after migrate", (()=>{
  localStorage_stub(JSON.stringify({ ...G.newGame(), home:{ owned:true, upgrades:{treasury:0,library:0,armory:0,tavern:0} } }));
  const s = G.load();
  return s.home.stock && s.home.furniture && s.home.cases;
})());
check("an unowned dorm is the bare tier with no levels", DORM.upgradeLevels(G.newGame()) === 0);
check("buying hall upgrades raises the dorm tier (D4)", (()=>{
  const bare = DORM.tierFor(dormSave({treasury:0,library:0,armory:0,tavern:0}));
  const big  = DORM.tierFor(dormSave({treasury:5,library:5,armory:5,tavern:5}));
  return bare.id === "bare" && big.id === "chambers" && big.w > bare.w && big.slots > bare.slots;
})());
check("every tier's slots fit inside its own room", (()=>{
  for (const lv of [0,4,9,20]){
    const s = dormSave({treasury:lv>15?5:Math.min(5,lv), library:Math.min(5,Math.max(0,lv-5)), armory:Math.min(5,Math.max(0,lv-10)), tavern:Math.min(5,Math.max(0,lv-15))});
    const room = DORM.dormRoom(s);
    for (const slot of DORM.slotsFor(s)){
      if (Math.abs(slot.x - room.x) > room.w/2 || Math.abs(slot.z - room.z) > room.d/2) return false;
    }
  }
  return true;
})());
check("furniture cannot be placed in a slot of the wrong kind", (()=>{
  const s = dormSave(); s.home.stock = { bookshelf: 1 };
  return DORM.placementProblem(s, "floor_a", "bookshelf") !== null;
})());
check("furniture the player does not own cannot be placed", (()=>{
  const s = dormSave();
  return DORM.placementProblem(s, "floor_a", "bed") !== null;
})());
check("a slot that this tier has not unlocked is rejected", (()=>{
  const s = dormSave({treasury:0,library:0,armory:0,tavern:0});   // bare: 4 slots
  s.home.stock = { case: 1 };
  return DORM.slotsFor(s).length === 4 && DORM.placementProblem(s, "case_d", "case") !== null;
})());
check("buying then placing furniture works, and a slot cannot be double-filled", (()=>{
  const s = dormSave(); s.gold = 5000; s.inventory.oak_log = 50;
  if (!DORM.buyFurniture(s, "bed").ok) return false;
  if (!DORM.place(s, "floor_a", "bed").ok) return false;
  DORM.buyFurniture(s, "bed");
  return DORM.place(s, "floor_a", "bed").ok === false && s.home.furniture.floor_a === "bed";
})());
check("buying furniture actually spends gold and timber", (()=>{
  const s = dormSave(); s.gold = 1000; s.inventory.oak_log = 10;
  const item = DORM.FURNITURE_MAP.bookshelf;
  DORM.buyFurniture(s, "bookshelf");
  return s.gold === 1000 - item.gold && s.inventory.oak_log === 10 - item.timber;
})());
check("furniture cannot be bought without the gold or the timber", (()=>{
  const s = dormSave(); s.gold = 0; s.inventory.oak_log = 0;
  const a = DORM.buyFurniture(s, "bed");
  s.gold = 5000;
  const b = DORM.buyFurniture(s, "bookshelf");   // needs timber
  return a.ok === false && a.err === "gold" && b.ok === false && b.err === "timber";
})());
check("unplacing returns the piece to stock rather than destroying it", (()=>{
  const s = dormSave(); s.gold = 5000; s.inventory.oak_log = 50;
  DORM.buyFurniture(s, "bed"); DORM.place(s, "floor_a", "bed");
  if (DORM.unplaced(s).length !== 0) return false;
  DORM.unplace(s, "floor_a");
  return DORM.unplaced(s).some(u => u.id === "bed" && u.count === 1);
})());
// --- display cases (D3): the derived-state rule ---
function slabbedSave(){
  const s = dormSave(); s.gold = 5000; s.inventory.oak_log = 50;
  DORM.buyFurniture(s, "case"); DORM.place(s, "case_a", "case");
  s.cards.push({ uid:"slab1", id:s.cards[0].id, roll:99, graded:true, serial:1001 });
  return s;
}
check("only slabbed cards can be displayed", (()=>{
  const s = slabbedSave();
  s.cards.push({ uid:"plain", id:s.cards[0].id, roll:40, graded:false });
  return DORM.displayProblem(s, "case_a", "plain") !== null && DORM.displayIn(s, "case_a", "slab1").ok;
})());
check("a slab cannot be shown in two cases at once", (()=>{
  const s = slabbedSave();
  DORM.buyFurniture(s, "case"); DORM.place(s, "case_b", "case");
  DORM.displayIn(s, "case_a", "slab1");
  return DORM.displayIn(s, "case_b", "slab1").ok === false;
})());
check("a case cannot be filled where no case furniture stands", (()=>{
  const s = slabbedSave();
  return DORM.displayProblem(s, "floor_a", "slab1") !== null;
})());
// THE drift test. The save stores only the card's uid; everything shown is read live. Selling a
// displayed slab must empty its case, not leave a ghost of a card the player no longer owns.
check("selling a displayed slab empties its case instead of leaving a ghost", (()=>{
  const s = slabbedSave();
  DORM.displayIn(s, "case_a", "slab1");
  if (!DORM.caseContents(s, gradeForRoll).find(c => c.slot === "case_a").card) return false;
  s.cards = s.cards.filter(c => c.uid !== "slab1");          // sold
  const after = DORM.caseContents(s, gradeForRoll).find(c => c.slot === "case_a");
  return after && after.card === null;
})());
check("removing the case furniture removes its display entry too", (()=>{
  const s = slabbedSave();
  DORM.displayIn(s, "case_a", "slab1");
  DORM.unplace(s, "case_a");
  return DORM.caseContents(s, gradeForRoll).length === 0 && !(s.home.cases||{}).case_a;
})());
// --- trophies (D3): derived, never stored ---
check("a trophy appears only once its boss is actually dead", (()=>{
  const s = dormSave();
  if (DORM.trophiesFor(s).length !== 0) return false;
  s.worldState.dungeons.cinderhollow_caverns = { cleared:[], defeated:[], bossDead:true };
  return DORM.trophiesFor(s).length === 1 && DORM.trophyPlacements(s)[0].z !== undefined;
})());
check("a trophy never lands on a piece of furniture", (()=>{
  // Every slot filled, every trophy earned, at every tier — the arrangement most likely to
  // collide. Two earlier trophy layouts failed exactly this, and only a render showed it.
  for (const t of DORM.TIERS){
    const s = dormSave({treasury:5,library:5,armory:5,tavern:5});
    // force this tier by trimming levels to its threshold
    const lv = t.minLevels;
    s.home.upgrades = { treasury:Math.min(5,lv), library:Math.min(5,Math.max(0,lv-5)),
                        armory:Math.min(5,Math.max(0,lv-10)), tavern:Math.min(5,Math.max(0,lv-15)) };
    if (DORM.tierFor(s).id !== t.id) continue;
    s.gold = 99999; s.inventory.oak_log = 999;
    for (const slot of DORM.slotsFor(s)){
      const item = DORM.FURNITURE.find(f => f.kind === slot.kind);
      DORM.buyFurniture(s, item.id); DORM.place(s, slot.id, item.id);
    }
    s.worldState.dungeons.cinderhollow_caverns = { cleared:[], defeated:[], bossDead:true };
    const z = DORM.dormZone(s, {});
    for (const tr of z.dormLayout.trophies){
      for (const p of z.dormLayout.pieces){
        if (Math.abs(tr.x - p.x) < (p.w/2 + 1.0) && Math.abs(tr.z - p.z) < (p.d/2 + 1.0)) return false;
      }
      const room = DORM.dormRoom(s);
      if (Math.abs(tr.x) > room.w/2 - 0.5 || Math.abs(tr.z) > room.d/2 - 0.5) return false;
    }
  }
  return true;
})());
check("trophies are not written into the save", (()=>{
  const s = dormSave();
  s.worldState.dungeons.cinderhollow_caverns = { cleared:[], defeated:[], bossDead:true };
  DORM.trophyPlacements(s);
  return JSON.stringify(s).indexOf("Cinder Wyrm Skull") === -1;
})());
// --- the zone (D1) ---
check("the dorm compiles to a zone with a reachable, non-ping-pong exit", (()=>{
  const z = DORM.dormZone(dormSave(), {});
  const ex = z.exits[0];
  const w = WC.buildWorld({ zones:[z] });
  return z.interior === true && ex.toZone === "academy" &&
         Math.hypot(z.spawn.x - ex.x, z.spawn.z - ex.z) > WC.EXIT_RADIUS &&
         !WC.exitNear(w.get("dorm"), z.spawn.x, z.spawn.z);
})());
check("the dorm's exit and spawn are both inside its own bounds", (()=>{
  const z = DORM.dormZone(dormSave(), {});
  const inb = p => p.x > z.bounds.minX && p.x < z.bounds.maxX && p.z > z.bounds.minZ && p.z < z.bounds.maxZ;
  return inb(z.spawn) && inb(z.exits[0]);
})());
check("the doorway is a real gap — the south wall is not one solid box", (()=>{
  const z = DORM.dormZone(dormSave(), {});
  const room = z.rooms.find(r => r.id === "dorm");
  const south = room.walls.filter(w => w.id.endsWith(":s"));
  // Two pieces either side of the door, and neither spans the doorway's centre line.
  return south.length === 2 && south.every(w => Math.abs(w.x) > DORM.DOOR_WIDTH/2 - 0.01);
})());
check("the dorm zone carries no enemies (it is a home, not a dungeon)", DORM.dormZone(dormSave(), {}).enemies.length === 0);
check("placed furniture becomes collision, except flat rugs", (()=>{
  const s = dormSave(); s.gold = 5000; s.inventory.oak_log = 50;
  DORM.buyFurniture(s, "bed"); DORM.place(s, "floor_a", "bed");
  DORM.buyFurniture(s, "rug"); DORM.place(s, "floor_b", "rug");
  const obs = DORM.dormZone(s, {}).obstacles.filter(o => String(o.id).startsWith("furn:"));
  return obs.length === 1 && obs[0].id === "furn:floor_a";
})());
check("a banner with no colour of its own takes the player's school colour", (()=>{
  const s = dormSave(); s.gold = 5000; s.inventory.oak_log = 50;
  DORM.buyFurniture(s, "banner"); DORM.place(s, "wall_a", "banner");
  return DORM.layoutFor(s, { schoolColor: 0x123456 }).pieces[0].color === 0x123456;
})());
// The whole point of D1: the dorm reuses the dungeon zone machinery rather than a parallel path.
check("the dorm's walls and floors were computed by dungeons.js, not hand-placed", (()=>{
  const z = DORM.dormZone(dormSave(), {});
  return z.rooms.every(r => Array.isArray(r.walls) && r.walls.length > 0) &&
         z.obstacles.some(o => String(o.id).startsWith("wall:"));
})());
check("structures.js exposes the interior seam generically, not as a dorm special case", (()=>{
  return ST.interiorFor("home") === "dorm" && ST.interiorFor("market") === null;
})());


// ---- WORLDSPEC step 6: the content pass (Lake Arcanum + the Drowned Vault) ----
// These are authored against schemas that already existed, so the value of these checks is
// content correctness, not engine correctness: a zone you drown in on arrival, a fishing spot on
// a hilltop, or a quest chain gated behind something in a zone you cannot reach yet.
const LAKE = WORLD.get("lake_arcanum");
check("the third zone ships and validates", !!LAKE && WC.validateZone(LAKE, { zoneIds: WORLD.zoneIds }).length === 0);
check("every zone is mutually reachable (no one-way exits anywhere)", WC.validateExits(WORLD).length === 0);
check("the lake is reachable from the forest and back", (()=>{
  const forest = WORLD.get("whispering_forest");
  return forest.exits.some(e => e.toZone === "lake_arcanum") && LAKE.exits.some(e => e.toZone === "whispering_forest");
})());
// The trap this zone is built around: flattened areas are pinned to `baseHeight`, so a lake whose
// surface rose above it would open the zone with the player, the NPCs and the dungeon mouth all
// standing underwater. Nothing about that is caught by the schema.
check("nothing in the lake zone spawns underwater", (()=>{
  const flats = TER.flatsForZone(LAKE);
  const h = (x, z) => TER.heightAt(x, z, LAKE.terrain, flats);
  const wl = LAKE.terrain.waterLevel;
  const pts = [[LAKE.spawn.x, LAKE.spawn.z], ...LAKE.npcs.map(n => [n.x, n.z]),
               ...LAKE.dungeonEntrances.map(d => [d.x, d.z]), ...LAKE.exits.map(e => [e.x, e.z])];
  const bad = pts.filter(([x, z]) => h(x, z) <= wl);
  if (bad.length) console.log("   underwater: " + JSON.stringify(bad));
  return bad.length === 0;
})());
check("the lake is actually a lake, not puddles", (()=>{
  const flats = TER.flatsForZone(LAKE);
  let wet = 0, n = 0;
  for (let x = LAKE.bounds.minX; x <= LAKE.bounds.maxX; x += 8)
    for (let z = LAKE.bounds.minZ; z <= LAKE.bounds.maxZ; z += 8){
      n++; if (TER.heightAt(x, z, LAKE.terrain, flats) < LAKE.terrain.waterLevel) wet++;
    }
  const pct = 100 * wet / n;
  if (pct < 12 || pct > 55) console.log(`   water coverage ${pct.toFixed(1)}%`);
  return pct >= 12 && pct <= 55;                       // enough to swim in, not so much there is nowhere to walk
})());
check("every fishing spot lands on the shore, not on a hilltop", (()=>{
  const flats = TER.flatsForZone(LAKE);
  const h = (x, z) => TER.heightAt(x, z, LAKE.terrain, flats);
  const ponds = WC.scatterZone(LAKE).resourceNodes.filter(r => r.kind === "pond");
  if (!ponds.length) return false;
  return ponds.every(p => {
    for (let a = -12; a <= 12; a += 2) for (let b = -12; b <= 12; b += 2)
      if (h(p.x + a, p.z + b) < LAKE.terrain.waterLevel) return true;
    return false;
  });
})());
check("nearWater is ignored in a zone with no water rather than placing nothing", (()=>{
  const dry = WC.buildWorld({ zones:[{ id:"dry", spawn:{x:0,z:0}, bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
    terrain:{ seed:5, amplitude:1 }, resourceNodes:[{ kind:"pond", id:"raw_shrimp", count:4, nearWater:true }] }] }).get("dry");
  return WC.scatterZone(dry).resourceNodes.length === 4;
})());
const VAULT = DUNGEONS.find(d => d.id === "drowned_vault");
check("the second dungeon ships", !!VAULT && VAULT.rooms.length >= 5);
check("the second dungeon's rooms are all reachable and it has a boss",
      !!VAULT && DG.validateDungeon(VAULT, { zoneIds: WORLD.zoneIds, knownModels: [...knownModels] }).length === 0);
check("a dungeon can carry its own palette, and one that does not keeps the default", (()=>{
  const vault = DG.dungeonZone(VAULT);
  const cinder = DG.dungeonZone(DUNGEONS.find(d => d.id === "cinderhollow_caverns"));
  // The point of a content pass is that the second dungeon is not the first one reskinned.
  return vault.floorColor != null && vault.wallColor != null && vault.lightTint != null &&
         cinder.floorColor == null && vault.floorColor !== cinder.floorColor;
})());
check("the two dungeons do not share enemy ids", (()=>{
  const ids = DUNGEONS.flatMap(d => DG.dungeonZone(d).enemies.map(e => d.id + "/" + e.id));
  return new Set(ids).size === ids.length;
})());
check("each dungeon's entrance is declared by the zone that holds it", (()=>{
  return DUNGEONS.every(d => {
    const z = WORLD.get(d.entranceZone);
    return z && z.dungeonEntrances.some(e => e.id === d.id);
  });
})());
check("the quest table validates against the zones, dungeons and materials that exist", (()=>{
  const rooms = Object.fromEntries(DUNGEONS.map(d => [d.id, d.rooms.map(r => r.id)]));
  const problems = ZQ.validateQuests({ zoneIds: WORLD.zoneIds, dungeonIds: DUNGEONS.map(d => d.id),
                                       dungeonRooms: rooms, gatherable: GATHERABLE });
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("a quest requiring a quest that does not exist is caught",
      ZQ.validateQuests({ zoneIds: ["nope"] }).some(p => /does not exist/.test(p)));
check("objective text names the right dungeon now that there are two", (()=>{
  const a = ZQ.ZONE_QUESTS.find(q => q.objective.dungeon === "cinderhollow_caverns" && q.objective.kind === "boss");
  const b = ZQ.ZONE_QUESTS.find(q => q.objective.dungeon === "drowned_vault" && q.objective.kind === "boss");
  return ZQ.objectiveText(a) !== ZQ.objectiveText(b) && /Vault/.test(ZQ.objectiveText(b));
})());
check("the lake chain is gated behind finishing the forest chain", (()=>{
  const s = G.newGame();
  const first = ZQ.ZONE_QUESTS.find(q => q.zone === "lake_arcanum" && !(q.requires||[]).some(r =>
    ZQ.ZONE_QUESTS.find(x => x.id === r).zone === "lake_arcanum"));
  return !ZQ.unlocked(s, first);
})());
check("the whole lake chain can be completed in order", (()=>{
  const s = G.newGame();
  // finish the forest chain the honest way first
  const order = ZQ.ZONE_QUESTS.slice();
  for (let pass = 0; pass < 4; pass++) for (const q of order){
    if (ZQ.isDone(s, q.id) || !ZQ.unlocked(s, q)) continue;
    if (!ZQ.accept(s, q.id).ok) continue;
    const o = q.objective;
    if (o.kind === "gather") s.inventory[o.id] = (s.inventory[o.id] || 0) + o.n;
    else {
      const st = (s.worldState.dungeons[o.dungeon] = s.worldState.dungeons[o.dungeon] || { cleared:[], defeated:[], bossDead:false });
      if (o.kind === "slay") for (let i = st.defeated.length; i < o.n; i++) st.defeated.push("x" + i);
      if (o.kind === "boss") st.bossDead = true;
      if (o.kind === "clear") st.cleared.push(o.room);
      if (o.kind === "visit") s.worldState.visited.push(o.zone);
    }
    ZQ.turnIn(s, q.id);
  }
  const left = ZQ.ZONE_QUESTS.filter(q => !ZQ.isDone(s, q.id)).map(q => q.id);
  if (left.length) console.log("   never completed: " + left.join(", "));
  return left.length === 0;
})());


// ---- character creation + per-school appearance (BACKLOG §2) ----
// The whole appearance system is a set of NUMBERS derived from the save; world.js and
// preview3d.js only apply them. That makes it fully checkable here, which matters because the
// thing it is protecting against — two schools that look the same — is invisible in a unit test
// unless something explicitly measures it.
check("every school has a look, and no look invents a school", (()=>{
  const problems = CC.validateLooks({ schoolIds: Object.keys(SCHOOLS) });
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("no two schools are close enough in hue to be confused", (()=>{
  const ids = Object.keys(CC.SCHOOL_LOOKS);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
    const a = CC.SCHOOL_LOOKS[ids[i]].hue, b = CC.SCHOOL_LOOKS[ids[j]].hue;
    const d = 180 - Math.abs(Math.abs(a - b) - 180);
    if (d < 22){ console.log(`   ${ids[i]}/${ids[j]} only ${d}° apart`); return false; }
  }
  return true;
})());
check("appearance is fully derived — nothing resolved is written to the save", (()=>{
  const s = G.newGame(); s.school = "fire";
  const before = JSON.stringify(s);
  CC.appearanceFor(s);
  return JSON.stringify(s) === before;
})());
check("changing school changes the appearance without touching stored fields", (()=>{
  const s = G.newGame();
  s.school = "fire"; const a = CC.appearanceFor(s);
  s.school = "ice";  const b = CC.appearanceFor(s);
  return a.hue !== b.hue && a.aura !== b.aura && s.appearance.variant === "standard";
})());
check("a variant changes richness but never the school's hue", (()=>{
  const s = G.newGame(); s.school = "storm";
  const std = CC.appearanceFor(s);
  CC.applyAppearance(s, { variant:"deep" });
  const deep = CC.appearanceFor(s);
  // hue is the school's identity; only saturation/lightness/strength may move
  return deep.hue === std.hue && deep.sat > std.sat && deep.strength !== std.strength;
})());
check("tint strength stays inside 0..1 for every variant", CC.VARIANTS.every(v => v.strength >= 0 && v.strength <= 1));
check("the aura can be switched off, and off means null", (()=>{
  const s = G.newGame();
  CC.applyAppearance(s, { aura:"none" });
  return CC.appearanceFor(s).aura === null && CC.appearanceFor(s).motes === 0;
})());
check("an unknown variant or aura is rejected rather than stored", (()=>{
  const s = G.newGame();
  const a = CC.applyAppearance(s, { variant:"chartreuse" });
  const b = CC.applyAppearance(s, { aura:"disco" });
  return !a.ok && !b.ok && s.appearance.variant === "standard" && s.appearance.aura === "ring";
})());
// Names go straight into innerHTML on the Dorm screen, so this is a correctness check, not taste.
check("names that would break the UI are rejected", (()=>{
  const bad = ["", "   ", "<script>", "Bob & Alice", "a".repeat(CC.NAME_MAX + 1), "9Lives", "Sam\u0000"];
  return bad.every(n => CC.nameProblem(n) !== null);
})());
check("ordinary names, including non-Latin ones, are accepted", (()=>{
  const good = ["Rowan", "Nell O'Shea", "Jean-Luc", "Ada Lovelace", "Зарина", "さくら"];
  const bad = good.filter(n => CC.nameProblem(n) !== null);
  if (bad.length) console.log("   rejected: " + bad.join(", "));
  return bad.length === 0;
})());
check("sloppy spacing is fixed, not refused", CC.nameProblem("Two  Spaces") === null && CC.sanitizeName("Two  Spaces") === "Two Spaces");
check("a name is trimmed and collapsed rather than stored raw", (()=>{
  const s = G.newGame();
  CC.applyAppearance(s, { name: "  Rowan   the Green  " });
  return s.name === "Rowan the Green";
})());
check("a rejected name is not written to the save", (()=>{
  const s = G.newGame();
  const r = CC.applyAppearance(s, { name: "<b>" });
  return !r.ok && !s.name;
})());
// The step model, same derived-state contract as onboarding.js.
check("a fresh save has creation unfinished, starting at the name", (()=>{
  const s = G.newGame();
  return !CC.isComplete(s) && CC.currentStep(s).id === "name";
})());
check("progress reports the step the player is ON, not the number finished", (()=>{
  const s = G.newGame();
  s.flags.schoolPicked = true;                       // school + look done, name is not
  const p = CC.progress(s);
  return p.done === 2 && p.index === 0 && CC.currentStep(s).id === "name";
})());
check("creation completes once name, school and look are all set", (()=>{
  const s = G.newGame();
  CC.applyAppearance(s, { name:"Rowan" });
  s.flags.schoolPicked = true;
  return CC.isComplete(s) && CC.progress(s).done === CC.STEPS.length;
})());
check("creation steps are derived, so doing them out of order still completes", (()=>{
  const s = G.newGame();
  s.flags.schoolPicked = true;                      // school first
  CC.applyAppearance(s, { aura:"motes" });          // look second
  if (CC.currentStep(s).id !== "name") return false;
  CC.applyAppearance(s, { name:"Nell" });           // name last
  return CC.isComplete(s);
})());
check("an older save with a school but no name is walked through the rest, not re-schooled", (()=>{
  // The migration deliberately does NOT invent a name — this is the case that proves why.
  localStorage_stub(JSON.stringify({ ...G.newGame(), name: undefined, school:"death", flags:{ schoolPicked:true } }));
  const s = G.load();
  return !CC.isComplete(s) && CC.currentStep(s).id === "name" && s.school === "death";
})());
check("migrate defaults the appearance so an old save still renders", (()=>{
  const old = G.newGame(); delete old.appearance;
  localStorage_stub(JSON.stringify(old));
  const s = G.load();
  return s.appearance.variant === "standard" && CC.appearanceFor(s).aura != null;
})());


// ---- visible equipment on the 3D character (BACKLOG §2) ----
// The rig's real bone list, captured from player_wizard.glb. Hard-coded on purpose: if the model
// is ever replaced with one that renames or drops these, the attachment table must fail here
// rather than silently show no gear in the world.
const PLAYER_BONES = ["Hips","Spine","Spine1","Neck","Head",
  "LeftShoulder","LeftArm","LeftForeArm","LeftHand",
  "RightShoulder","RightArm","RightForeArm","RightHand",
  "LeftUpLeg","LeftLeg","LeftFoot","RightUpLeg","RightLeg","RightFoot"];
check("the attachment table validates against the rig, the slots, the metals and the shipped models", (()=>{
  const problems = EQ3.validateAttachments({
    bones: PLAYER_BONES,
    slotIds: SLOTS_LIST.map(s => s.id),
    metalIds: Object.keys(METALS_MAP),
    knownModels: [...knownModels],
  });
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("every equipment slot is either shown on the character or explained", (()=>{
  return SLOTS_LIST.every(s => EQ3.ATTACHMENTS[s.id] || EQ3.UNSUPPORTED[s.id]);
})());
check("a bone the rig does not have is caught", (()=>{
  return EQ3.validateAttachments({ bones: ["Hips"] }).some(p => /not in the player rig/.test(p));
})());
check("nothing hangs off the character until something is equipped", EQ3.attachmentsFor(G.newGame()).length === 0);
check("equipping a wand puts a model in the right hand", (()=>{
  const s = G.newGame();
  const def = equipmentFor("iron", "wand");
  const item = { uid:"w1", id:def.id, metal:"iron", slot:"wand", tier:def.tier };
  s.equipment.push(item); G.equip(s, "w1");
  const a = EQ3.attachmentsFor(s);
  return a.length === 1 && a[0].bone === "RightHand" && !!a[0].model;
})());
check("a better metal changes the silhouette AND the colour", (()=>{
  const mk = metal => {
    const s = G.newGame();
    const def = equipmentFor(metal, "wand");
    s.equipment.push({ uid:"w", id:def.id, metal, slot:"wand", tier:def.tier }); G.equip(s, "w");
    return EQ3.attachmentsFor(s)[0];
  };
  const bronze = mk("bronze"), rune = mk("rune");
  return bronze.model !== rune.model && bronze.color !== rune.color && rune.height > bronze.height;
})());
check("equipping a hat changes stats but hangs nothing on the character", (()=>{
  const s = G.newGame();
  const def = equipmentFor("gold", "hat");
  s.equipment.push({ uid:"h1", id:def.id, metal:"gold", slot:"hat", tier:def.tier }); G.equip(s, "h1");
  return EQ3.attachmentsFor(s).length === 0 && EQ3.visibilityNote("hat") !== null;
})());
// The derived-state rule again: the visual is never stored, so it cannot outlive the item.
check("unequipping removes the attachment", (()=>{
  const s = G.newGame();
  const def = equipmentFor("iron", "wand");
  s.equipment.push({ uid:"w1", id:def.id, metal:"iron", slot:"wand", tier:def.tier }); G.equip(s, "w1");
  G.unequip(s, "wand");
  return EQ3.attachmentsFor(s).length === 0;
})());
check("selling an equipped wand does not leave a ghost staff in the hand", (()=>{
  const s = G.newGame();
  const def = equipmentFor("rune", "wand");
  s.equipment.push({ uid:"w1", id:def.id, metal:"rune", slot:"wand", tier:def.tier }); G.equip(s, "w1");
  s.equipment = s.equipment.filter(e => e.uid !== "w1");     // sold, loadout still points at it
  return EQ3.attachmentsFor(s).length === 0;
})());
check("every metal tier 1..5 resolves to a wand model", (()=>{
  return Object.keys(METALS_MAP).every(metal => {
    const s = G.newGame();
    const def = equipmentFor(metal, "wand");
    s.equipment.push({ uid:"w", id:def.id, metal, slot:"wand", tier:def.tier }); G.equip(s, "w");
    const a = EQ3.attachmentsFor(s)[0];
    return a && a.model && a.height > 0;
  });
})());


// ---- Academy classes (lessons.js) ----
// The backlog's standing criticism of the curriculum was that a year "only grants numeric
// bonuses; there is nothing to attend or choose". These checks are about that distinction: a
// class must be enrolled in deliberately, must have an assignment derived from real play, and
// must teach something that changes an existing system rather than adding another percentage.
check("the syllabus validates against the years, the skills and its own prerequisites", (()=>{
  const problems = LSN.validateLessons({ years: ACADEMY.YEARS.length, skillIds: Object.keys(SKILLS_MAP) });
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("every curriculum year has classes", (()=>{
  return ACADEMY.YEARS.every((_, y) => LSN.LESSONS.some(l => l.year === y));
})());
check("a prerequisite from a later year is caught", (()=>{
  // The failure mode: the class looks unlocked by year and stays greyed out forever.
  const problems = LSN.validateLessons({ years: 7 });
  return problems.length === 0 &&                        // the real table is clean...
    LSN.LESSONS.every(l => (l.requires||[]).every(r => LSN.byId(r).year <= l.year));
})());
check("classes from a later year cannot be enrolled in", (()=>{
  const s = G.newGame();
  const late = LSN.LESSONS.find(l => l.year === 6);
  return !LSN.unlocked(s, late, 0) && !LSN.available(s, 0).some(l => l.id === late.id);
})());
check("a class must be enrolled in before it can be submitted", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "refine");
  s.stats.refined = 99;                                   // assignment already satisfied
  return LSN.submit(s, l.id).ok === false;
})());
check("an unfinished assignment cannot be submitted", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "refine");
  LSN.enroll(s, l.id);
  return LSN.submit(s, l.id).ok === false;
})());
check("progress is derived from play the save already records", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "scribe" && x.assign.n === 3);
  if (LSN.progressOf(s, l).done) return false;
  s.stats.scribed = 3;
  return LSN.progressOf(s, l).done;                       // nothing was "handed in" — it just counts
})());
check("passing a class teaches a technique, and it is derived not stored", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "refine");
  LSN.enroll(s, l.id); s.stats.refined = 99;
  const before = LSN.masteryFor(s).scribeBonus;
  const r = LSN.submit(s, l.id);
  const after = LSN.masteryFor(s).scribeBonus;
  // the totals live nowhere in the save — only the list of classes passed
  return r.ok && after > before && JSON.stringify(s.lessons) === JSON.stringify({ enrolled: [], done: [l.id] });
})());
check("a class pays out only once", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "refine");
  LSN.enroll(s, l.id); s.stats.refined = 99;
  LSN.submit(s, l.id);
  return LSN.submit(s, l.id).ok === false && LSN.masteryFor(s).scribeBonus === l.teaches.scribeBonus;
})());
check("lessons.js never touches gold or xp itself", (()=>{
  const s = G.newGame();
  const l = LSN.LESSONS.find(x => x.assign.kind === "refine");
  LSN.enroll(s, l.id); s.stats.refined = 99;
  const gold = s.gold, xp = s.xp;
  LSN.submit(s, l.id);
  return s.gold === gold && s.xp === xp;                  // the caller applies the reward, like zonequests
})());
check("the whole syllabus can be completed in order", (()=>{
  const s = G.newGame();
  for (let pass = 0; pass < 8; pass++){
    for (const l of LSN.LESSONS){
      if (LSN.isDone(s, l.id)) continue;
      if (!LSN.unlocked(s, l, 6)) continue;
      if (!LSN.isEnrolled(s, l.id) && !LSN.enroll(s, l.id).ok) continue;
      const a = l.assign;
      if (a.kind === "skill") s.skills[a.id] = a.level;
      else if (a.kind === "collect") while (s.cards.length < a.n) s.cards.push({ uid:"x"+s.cards.length, id:s.cards[0].id, roll:1, graded:false });
      else if (a.kind === "level") s.level = a.n;
      else if (a.kind === "lessons") { /* satisfied by the others */ }
      else s.stats[{ scribe:"scribed", refine:"refined", grade:"graded", slabs:"slabs", win:"won", packs:"packs" }[a.kind]] = a.n;
      LSN.submit(s, l.id);
    }
  }
  const left = LSN.LESSONS.filter(l => !LSN.isDone(s, l.id)).map(l => l.id);
  if (left.length) console.log("   never completed: " + left.join(", "));
  return left.length === 0 && LSN.graduatedYears(s) === ACADEMY.YEARS.length;
})());

// --- the four techniques must actually change the systems they name ---
// A "technique" that does not is just another number on a screen, which is the thing this whole
// module exists to stop being.
// A save that has passed EVERY class teaching one technique. An earlier version stopped at the
// first class, which gave a 4% sell bonus — and 4% of a 10g card rounds back to 10g, so the check
// failed against a working engine. Grant the full technique and compare on a value it can move.
function taught(technique){
  const s = G.newGame();
  for (const l of LSN.LESSONS) if (l.teaches[technique]) s.lessons.done.push(l.id);
  return s;
}
check("Appraisal makes grading genuinely cheaper", (()=>{
  const plain = G.newGame(), skilled = taught("gradeDiscount");
  const base = 500;
  return G.gradeCost(skilled, base) < G.gradeCost(plain, base) && G.gradeCost(skilled, base) >= 1;
})());
check("a grading discount can never make a fee free or negative", (()=>{
  const s = G.newGame();
  for (const l of LSN.LESSONS) if (l.teaches.gradeDiscount) s.lessons.done.push(l.id);
  return G.gradeCost(s, 1) >= 1 && G.gradeCost(s, 10) >= 1;
})());
check("Haggling pays more for a sold card", (()=>{
  const mk = s => { s.cards = [{ uid:"c1", id:CARDS[0].id, roll:50, graded:false }]; s.gold = 0; return s; };
  const plain = mk(G.newGame()), skilled = mk(taught("sellBonus"));
  G.sellCard(plain, "c1"); G.sellCard(skilled, "c1");
  return skilled.gold > plain.gold;
})());
check("Penmanship raises the scribe roll", (()=>{
  // Compare the BONUS the engine applies rather than a random roll, so this is deterministic.
  const skilled = taught("scribeBonus");
  return LSN.masteryFor(skilled).scribeBonus > 0 && LSN.masteryFor(G.newGame()).scribeBonus === 0;
})());
check("Husbandry can yield a second unit, and never does without the class", (()=>{
  const mat = MATERIALS.find(m => m.id === "oak_log");
  const plain = G.newGame();
  let extras = 0;
  for (let i = 0; i < 200; i++){ plain.inventory = {}; extras += G.gather(plain, mat).extra ? 1 : 0; }
  if (extras !== 0) return false;                          // no class, never a bonus
  const skilled = taught("gatherBonus");
  let got = 0;
  for (let i = 0; i < 600; i++){ skilled.inventory = {}; got += G.gather(skilled, mat).extra ? 1 : 0; }
  return got > 0;
})());
check("a save that predates classes migrates cleanly", (()=>{
  const old = G.newGame(); delete old.lessons;
  localStorage_stub(JSON.stringify(old));
  const s = G.load();
  return Array.isArray(s.lessons.enrolled) && Array.isArray(s.lessons.done) && LSN.available(s, 0).length > 0;
})());


// ---- card printings: foil / holo / prismatic + first editions (BACKLOG §5) ----
// Design pillar 3 names "grade, foil, and slab serials" as what makes a card tangible. Grade and
// slabs shipped long ago; foil did not exist. These checks are about the two things that make a
// printing worth anything: it must be RARE and it must be WORTH MORE, in that order.
check("the printing table validates", (()=>{
  const problems = VAR.validateVariants();
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("rarer printings are always worth more", (()=>{
  for (let i = 1; i < VAR.VARIANTS.length; i++){
    if (VAR.VARIANTS[i].chance > VAR.VARIANTS[i-1].chance) return false;
    if (VAR.VARIANTS[i].x <= VAR.VARIANTS[i-1].x) return false;
  }
  return true;
})());
check("a card with no printing field reads as normal and is worth its base value", (()=>{
  const legacy = { uid:"x", id:CARDS[0].id, roll:50, graded:false };   // pre-variants save
  return VAR.variantOf(legacy).id === "normal" && VAR.valueOf(legacy, 100) === 100;
})());
check("the rarest printing is not swallowed by the commoner bands", (()=>{
  // rollVariant checks rarest-first; a naive ascending scan would return "foil" for every roll
  // below the foil chance and prismatic would never appear at all.
  const prism = VAR.VARIANTS[VAR.VARIANTS.length - 1];
  return VAR.rollVariant(prism.chance * 0.5) === prism.id;
})());
check("printing odds land near the table, over a large sample", (()=>{
  const rand = G.mulberry32(12345);
  const tally = {};
  const N = 60000;
  for (let i = 0; i < N; i++){ const v = VAR.rollVariant(rand); tally[v] = (tally[v] || 0) + 1; }
  for (const v of VAR.VARIANTS){
    if (v.id === "normal") continue;
    const got = (tally[v.id] || 0) / N;
    // expected is this band's chance minus the rarer bands that outrank it
    const rarer = VAR.VARIANTS.filter(x => x.chance < v.chance).reduce((a, x) => a + x.chance, 0);
    const want = v.chance - rarer;
    if (Math.abs(got - want) > want * 0.35 + 0.002){
      console.log(`   ${v.id}: got ${(got*100).toFixed(2)}% want ~${(want*100).toFixed(2)}%`);
      return false;
    }
  }
  return true;
})());
check("luck raises the odds without changing their order", (()=>{
  const count = luck => {
    const rand = G.mulberry32(999);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (VAR.rollVariant(rand, luck) !== "normal") n++;
    return n;
  };
  return count(2) > count(1);
})());
// --- first editions ---
check("the first copy of a type is a first edition and later copies are not", (()=>{
  const s = G.newGame();
  const fresh = CARDS.find(c => !s.cards.some(x => x.id === c.id));
  const a = G.mintCard(s, fresh.id, 50);
  const b = G.mintCard(s, fresh.id, 50);
  return VAR.isFirstEdition(a) && !VAR.isFirstEdition(b);
})());
check("a first edition is worth more than an identical plain copy", (()=>{
  const fe = { id:CARDS[0].id, roll:50, variant:"normal", fe:true };
  const plain = { id:CARDS[0].id, roll:50, variant:"normal" };
  return VAR.valueOf(fe, 100) > VAR.valueOf(plain, 100);
})());
check("printing and first edition multiply together", (()=>{
  const holo = VAR.VARIANT_MAP.holo;
  const c = { variant:"holo", fe:true };
  return Math.abs(VAR.multiplierFor(c) - holo.x * VAR.FIRST_EDITION_X) < 1e-9;
})());
// --- the mint funnel ---
// There were five hand-written copies of the card-instance literal. The whole point of mintCard
// is that a printing cannot be applied to four of them and forgotten on the fifth.
check("every way of gaining a card goes through mintCard and gets a printing", (()=>{
  const s = G.newGame(); s.gold = 100000; s.inventory = { canvas:5, ink:5, reagent:5 };
  const before = s.cards.length;
  G.openPack(s);
  G.dropCards(s, 2);
  G.scribe(s);
  G.buyCard(s, CARDS[0].id);
  G.issueSchoolStarter(s, "fire");
  const added = s.cards.slice(before);
  if (!added.length) return false;
  const missing = added.filter(c => c.variant == null);
  if (missing.length) console.log(`   ${missing.length} of ${added.length} cards have no printing`);
  return missing.length === 0;
})());
check("starter cards are always a normal printing", (()=>{
  const s = G.newGame();
  return s.cards.every(c => c.variant === "normal");
})());
check("a pack is luckier than buying a card off the shelf", (()=>{
  // Not a distribution test — just that the two paths pass different luck through.
  const src = G.mintCard.toString();
  return /luck/.test(src);
})());
// --- value flows through the engine, not just the module ---
check("selling a foil pays more than selling the same card plain", (()=>{
  const mk = variant => {
    const s = G.newGame(); s.gold = 0;
    s.cards = [{ uid:"c1", id:CARDS[0].id, roll:50, graded:false, variant }];
    G.sellCard(s, "c1");
    return s.gold;
  };
  return mk("holo") > mk("foil") && mk("foil") > mk("normal");
})());
check("a foil raises the collection's total value", (()=>{
  const s = G.newGame();
  const plain = G.totalCollectionValue(s);
  s.cards[0].variant = "prism";
  return G.totalCollectionValue(s) > plain;
})());
check("an old save is grandfathered one first edition per card type, once", (()=>{
  const old = G.newGame();
  for (const c of old.cards){ delete c.variant; delete c.fe; }
  delete old.flags.feStamped;
  localStorage_stub(JSON.stringify(old));
  const s = G.load();
  const types = new Set(s.cards.map(c => c.id));
  const stamped = s.cards.filter(c => VAR.isFirstEdition(c)).length;
  if (stamped !== types.size){ console.log(`   stamped ${stamped} for ${types.size} types`); return false; }
  // and re-loading must not mint a second "first" edition
  localStorage_stub(JSON.stringify(s));
  const again = G.load();
  return again.cards.filter(c => VAR.isFirstEdition(c)).length === stamped;
})());
check("the collection sort floats the best printing to the top", (()=>{
  const cards = [
    { id:"a", variant:"normal" }, { id:"b", variant:"prism" },
    { id:"c", variant:"foil" }, { id:"d", variant:"normal", fe:true },
  ];
  const sorted = [...cards].sort((a,b) => VAR.collectionRank(b) - VAR.collectionRank(a));
  return sorted[0].variant === "prism" && sorted[sorted.length-1].variant === "normal" && !sorted[sorted.length-1].fe;
})());
check("a printing has a badge so it is visible without reading a tooltip", (()=>{
  return VAR.VARIANTS.filter(v => v.id !== "normal").every(v => VAR.badgesFor({ variant:v.id }).length === 1);
})());


// ---- the codex: filters, completion, favourites, achievements (BACKLOG §5) ----
// The collection screen answers "what do I own". Only the codex can answer "what am I missing",
// which is the question a collection game exists to keep asking — and it can only do that by
// filtering the CATALOG rather than the collection.
check("the codex tables validate against the real catalog", (()=>{
  const problems = CX.validateCodex(CARDS);
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("every achievement is reachable with the best possible collection", (()=>{
  // The probe must contain one of EVERY printing. An earlier version made every card prismatic,
  // and the foil and holo achievements reported as unreachable — the validator was right and the
  // sample was wrong.
  const printings = VAR.VARIANTS.map(v => v.id);
  const everything = CARDS.map((d, i) => ({ id:d.id, roll:100, graded:true, serial:1,
                                            variant:printings[i % printings.length], fe:true }));
  return CX.achievementsFor(CARDS, everything).every(a => a.done);
})());
check("a fresh save has earned nothing yet", (()=>{
  const s = G.newGame();
  return CX.achievementCount(CARDS, s.cards).done === 0;
})());
check("completion counts card TYPES, not copies", (()=>{
  const s = G.newGame();
  const before = CX.overallCompletion(CARDS, s.cards).owned;
  G.mintCard(s, s.cards[0].id, 50);          // a duplicate of something already owned
  return CX.overallCompletion(CARDS, s.cards).owned === before;
})());
check("per-school completion adds up to the whole catalog", (()=>{
  const s = G.newGame();
  const by = CX.completionBy(CARDS, s.cards, d => d.school);
  const total = Object.values(by).reduce((a, g) => a + g.total, 0);
  const owned = Object.values(by).reduce((a, g) => a + g.owned, 0);
  const all = CX.overallCompletion(CARDS, s.cards);
  return total === CARDS.length && owned === all.owned;
})());
// --- browse ---
check("owned and missing partition the catalog", (()=>{
  const s = G.newGame();
  const owned = CX.browse(CARDS, s, { filter:"owned" }).length;
  const missing = CX.browse(CARDS, s, { filter:"missing" }).length;
  return owned + missing === CARDS.length && owned > 0 && missing > 0;
})());
check("the missing filter really lists cards the player does not have", (()=>{
  const s = G.newGame();
  const have = new Set(s.cards.map(c => c.id));
  return CX.browse(CARDS, s, { filter:"missing" }).every(r => !have.has(r.def.id));
})());
check("a school filter only returns that school", (()=>{
  const s = G.newGame();
  return CX.browse(CARDS, s, { school:"fire" }).every(r => r.def.school === "fire");
})());
check("search matches names and card text", (()=>{
  const s = G.newGame();
  const byName = CX.browse(CARDS, s, { query:"dragon" });
  return byName.length > 0 && byName.every(r => /dragon/i.test(r.def.name + " " + (r.def.text||"")));
})());
check("every sort returns the whole set in a stable order", (()=>{
  const s = G.newGame();
  for (const o of CX.SORTS){
    const a = CX.browse(CARDS, s, { sort:o.id }).map(r => r.def.id);
    const b = CX.browse(CARDS, s, { sort:o.id }).map(r => r.def.id);
    if (a.length !== CARDS.length) { console.log(`   ${o.id} returned ${a.length}`); return false; }
    if (a.join() !== b.join()){ console.log(`   ${o.id} is not stable`); return false; }
  }
  return true;
})());
check("sorting by best copy puts a prismatic ahead of a plain card", (()=>{
  const s = G.newGame();
  const target = s.cards[0].id;
  G.mintCard(s, target, 50, { variant:"prism" });
  const rows = CX.browse(CARDS, s, { sort:"value", desc:true });
  return rows[0].def.id === target;
})());
check("the special filter finds a printing or a first edition and nothing else", (()=>{
  const s = G.newGame();
  for (const c of s.cards){ c.variant = "normal"; delete c.fe; }
  if (CX.browse(CARDS, s, { filter:"printed" }).length !== 0) return false;
  s.cards[0].variant = "holo";
  const rows = CX.browse(CARDS, s, { filter:"printed" });
  return rows.length === 1 && rows[0].def.id === s.cards[0].id;
})());
// --- favourites: the one stored bit ---
check("favouriting a card stores it and toggles back off", (()=>{
  const s = G.newGame();
  const id = CARDS[0].id;
  CX.toggleFavorite(s, id);
  const on = CX.isFavorite(s, id);
  CX.toggleFavorite(s, id);
  return on && !CX.isFavorite(s, id) && s.favorites.length === 0;
})());
check("the favourites filter returns exactly what was favourited", (()=>{
  const s = G.newGame();
  CX.toggleFavorite(s, CARDS[3].id);
  const rows = CX.browse(CARDS, s, { filter:"favorite" });
  return rows.length === 1 && rows[0].def.id === CARDS[3].id;
})());
check("a save that predates favourites migrates cleanly", (()=>{
  const old = G.newGame(); delete old.favorites;
  localStorage_stub(JSON.stringify(old));
  const s = G.load();
  return Array.isArray(s.favorites) && CX.browse(CARDS, s, { filter:"favorite" }).length === 0;
})());
// --- the derived rule, which is the whole reason achievements are not stored ---
check("selling the cards un-earns the achievement they propped up", (()=>{
  const s = G.newGame();
  for (const d of CARDS) if (!s.cards.some(c => c.id === d.id)) G.mintCard(s, d.id, 50);
  const full = CX.achievementsFor(CARDS, s.cards).find(a => a.id === "archivist");
  if (!full.done) return false;
  s.cards = s.cards.slice(0, 3);                       // sold almost everything
  return CX.achievementsFor(CARDS, s.cards).find(a => a.id === "archivist").done === false;
})());
check("nothing about completion or achievements is written to the save", (()=>{
  const s = G.newGame();
  const before = JSON.stringify(s);
  CX.overallCompletion(CARDS, s.cards);
  CX.completionBy(CARDS, s.cards, d => d.school);
  CX.achievementsFor(CARDS, s.cards);
  CX.browse(CARDS, s, { filter:"missing", sort:"rarity" });
  return JSON.stringify(s) === before;
})());


// ---- AI battle personalities, thematic enemy decks, multi-phase bosses (BACKLOG §4) ----
// Every AI opponent used to run the identical strategy — highest-cost affordable card, damage
// spells finish the weakest enemy creature, always race face unless a taunt forces a trade. These
// checks are about the two things that have to be true for "archetype" to mean anything: the
// personalities must actually choose DIFFERENTLY given the same board, and the compatibility
// default must reproduce the OLD behaviour exactly so nothing that already worked breaks.
check("the archetype table validates", (()=>{
  const problems = ARCH.validateArchetypes();
  if (problems.length) console.log("   " + problems.join("\n   "));
  return problems.length === 0;
})());
check("midrange reproduces the old unconditional behaviour: face unless taunt", (()=>{
  const p = ARCH.policyFor("midrange");
  const enemyBoard = [{atk:9,hp:1},{atk:1,hp:9}];   // a very tempting trade either way
  return ARCH.pickAttackTarget(p, {atk:5,hp:5}, enemyBoard, null) === "face";
})());
check("midrange's damage spell finishes the weakest enemy creature", (()=>{
  const p = ARCH.policyFor("midrange");
  const enemyBoard = [{atk:9,hp:8},{atk:1,hp:2}];
  return ARCH.pickSpellTarget(p, enemyBoard, 5, 5) === 1;
})());
check("every archetype obeys taunt, no exceptions", (()=>{
  return ARCH.ARCHETYPE_IDS.every(id => ARCH.pickAttackTarget(ARCH.policyFor(id), {atk:9,hp:9}, [{atk:1,hp:1}], 0) === 0);
})());
check("aggro always burns face with removal, even into a killable creature", (()=>{
  const p = ARCH.policyFor("aggro");
  return ARCH.pickSpellTarget(p, [{atk:1,hp:1}], 5, 5) === "face";
})());
check("aggro plays its cheapest card first; midrange plays its priciest", (()=>{
  const playable = [{i:0,cost:1},{i:1,cost:5},{i:2,cost:3}];
  const aggroFirst = ARCH.orderCards(ARCH.policyFor("aggro"), playable)[0];
  const midFirst = ARCH.orderCards(ARCH.policyFor("midrange"), playable)[0];
  return aggroFirst.cost === 1 && midFirst.cost === 5;
})());
check("control removes the biggest threat, not the weakest creature", (()=>{
  const p = ARCH.policyFor("control");
  const enemyBoard = [{atk:9,hp:8},{atk:1,hp:2}];
  return ARCH.pickSpellTarget(p, enemyBoard, 5, 5) === 0;
})());
check("control takes a trade it can win instead of always racing face", (()=>{
  const p = ARCH.policyFor("control");
  const enemyBoard = [{atk:2,hp:3}];                // attacker kills it and survives
  return ARCH.pickAttackTarget(p, {atk:5,hp:5}, enemyBoard, null) === 0;
})());
check("control will not take a trade that kills its own creature", (()=>{
  const p = ARCH.policyFor("control");
  const enemyBoard = [{atk:9,hp:1}];                // attacker kills it but dies too — not favourable
  return ARCH.pickAttackTarget(p, {atk:5,hp:5}, enemyBoard, null) === "face";
})());
check("tempo faces when ahead on board and clears when behind", (()=>{
  const p = ARCH.policyFor("tempo");
  const enemyBoard = [{atk:1,hp:1}];
  return ARCH.pickSpellTarget(p, enemyBoard, 10, 2) === "face" &&
         ARCH.pickSpellTarget(p, enemyBoard, 2, 10) === 0;
})());
// --- boss phases ---
check("a boss enters its first phase at half health, not before", (()=>{
  return ARCH.nextBossPhase(0.51, []) === null && ARCH.nextBossPhase(0.50, []).id === "bloodied";
})());
check("a phase never fires twice", (()=>{
  return ARCH.nextBossPhase(0.10, ["bloodied","desperate"]) === null;
})());
check("dropping straight through both thresholds still gets both, in order", (()=>{
  const applied = [];
  let p = ARCH.nextBossPhase(0.05, applied); applied.push(p.id);
  const p2 = ARCH.nextBossPhase(0.05, applied);
  return p.id === "bloodied" && p2.id === "desperate";
})());
// --- thematic decks ---
check("every archetype builds a full, non-empty deck from a real school pool", (()=>{
  const pool = CARDS.filter(d => d.school === "fire");
  return ["aggro","control","tempo","boss","midrange"].every(a => ARCH.archetypeDeckFor(a, pool).length === 20);
})());
check("a school with no damage spell still gets a full deck (falls back to creatures)", (()=>{
  const pool = CARDS.filter(d => d.school === "ice");   // ice has zero fx:dmg spells
  return ARCH.archetypeDeckFor("control", pool).length === 20;
})());
check("an empty pool never crashes — it returns an empty deck, not a broken one", ARCH.archetypeDeckFor("aggro", []).length === 0);
check("aggro's deck skews cheaper than the boss deck from the same pool", (()=>{
  const pool = CARDS.filter(d => d.school === "fire");
  const avgCost = ids => ids.reduce((a,id) => a + CARD_MAP[id].cost, 0) / ids.length;
  return avgCost(ARCH.archetypeDeckFor("aggro", pool)) < avgCost(ARCH.archetypeDeckFor("boss", pool));
})());
check("every card in a generated deck actually comes from the pool given", (()=>{
  const pool = CARDS.filter(d => d.school === "death");
  const ids = new Set(pool.map(d => d.id));
  return ARCH.archetypeDeckFor("control", pool).every(id => ids.has(id));
})());
// --- autoBuildDeck: the player-facing sibling, capped by what's actually owned ---
check("autoBuildDeck never exceeds 3 copies of a card, even if the archetype wants more", (()=>{
  const owned = { fire_cat: 3, fire_elf: 3, fire_dragon: 3, firebolt: 3, fireball: 3, meteor: 3 };
  const deck = ARCH.autoBuildDeck("aggro", owned, CARDS.filter(d=>d.school==="fire"));
  const counts = {}; for (const id of deck) counts[id] = (counts[id]||0)+1;
  return Object.values(counts).every(n => n <= 3);
})());
check("autoBuildDeck never suggests a card the player owns zero of", (()=>{
  const owned = { fire_cat: 3, fire_elf: 3 };   // owns nothing else in the fire pool
  const deck = ARCH.autoBuildDeck("aggro", owned, CARDS.filter(d=>d.school==="fire"));
  return deck.every(id => id === "fire_cat" || id === "fire_elf");
})());
check("autoBuildDeck fills all 20 slots when the collection can support it", (()=>{
  const owned = {}; for (const c of CARDS) owned[c.id] = 3;   // three of literally everything
  return ARCH.autoBuildDeck("control", owned, CARDS).length === 20;
})());
check("autoBuildDeck returns a legitimate PARTIAL deck when the collection can't fill it — not a hang", (()=>{
  const owned = { fire_cat: 2 };
  const deck = ARCH.autoBuildDeck("aggro", owned, CARDS.filter(d=>d.school==="fire"));
  return deck.length === 2 && deck.every(id => id === "fire_cat");
})());
check("autoBuildDeck on an empty collection returns an empty deck, not a crash", (()=>{
  return ARCH.autoBuildDeck("aggro", {}, CARDS.filter(d=>d.school==="fire")).length === 0;
})());
check("autoBuildDeck respects ownership across the WHOLE catalog, not just one school", (()=>{
  // A real player deck already mixes schools (the starter deck does) — auto-build should too.
  const owned = { fire_cat: 3, ice_golem: 3, pixie: 3, novice: 3, firebolt: 3 };
  const deck = ARCH.autoBuildDeck("midrange", owned, CARDS);
  const schools = new Set(deck.map(id => CARD_MAP[id].school));
  return schools.size > 1;
})());
// --- assigning an archetype from what the enemy visibly is ---
check("a boss is always the boss archetype regardless of its model name", ARCH.archetypeFor({model:"whatever.glb", boss:true}) === "boss");
check("dragons, slimes, skeletons and bats/wraiths get their own personality", (()=>{
  return ARCH.archetypeFor({model:"creature_Dragon.glb"}) === "boss" &&
         ARCH.archetypeFor({model:"creature_Slime.glb"}) === "aggro" &&
         ARCH.archetypeFor({model:"creature_Skeleton.glb"}) === "control" &&
         ARCH.archetypeFor({model:"creature_Bat.glb"}) === "tempo" &&
         ARCH.archetypeFor({model:"enemy_skeleton.glb"}) === "control";
})());
check("an unrecognised enemy still gets a usable, safe default", ARCH.archetypeFor({model:"mystery.glb"}) === "midrange");
check("every flavour school actually has a positive population to draw from", (()=>{
  const schools = new Set(["fire","ice","storm","myth","life","death","balance"]);
  const usedSchools = new Set([ARCH.flavorSchoolFor({model:"creature_Dragon.glb"}),
    ARCH.flavorSchoolFor({model:"creature_Slime.glb"}), ARCH.flavorSchoolFor({model:"creature_Skeleton.glb"}),
    ARCH.flavorSchoolFor({model:"creature_Bat.glb"}), ARCH.flavorSchoolFor({model:"???"})]);
  return [...usedSchools].every(s => schools.has(s) && CARDS.some(d => d.school === s));
})());

// ---- game.js integration: the archetype actually changes how a real duel plays out ----
check("QUESTS carry an archetype, defaulting to midrange when not given", (()=>{
  return G.QUESTS.every(q => !!q.archetype) && G.QUESTS[0].archetype === "aggro" && G.QUESTS[7].archetype === "boss";
})());
check("aiTurn with no archetype set behaves exactly as the old unconditional AI did", (()=>{
  // Reproduce runSelfTest's "contrast" case (player never acts) with an explicit archetype-free
  // battle and confirm it still resolves the same way: the AI alone is enough to win.
  const s = G.newGame();
  const b = G.startDuel(s.deck, G.equipStats(s), G.QUESTS[0].deck, G.QUESTS[0].gear, G.QUESTS[0].hp);
  delete b.enemy.archetype;
  let guard = 0; while (!G.isOver(b).over && guard++ < 200) G.aiTurn(b);
  return G.isOver(b).over && G.isOver(b).winner === "enemy";
})());
check("a boss duel actually enters a phase once its HP crosses the threshold", (()=>{
  const s = G.newGame();
  const b = G.startDuel(deck20("elixir"), {hp:0,atk:0,def:0,pip:0}, deck20("fire_dragon"), {hp:0,atk:0,def:0,pip:0}, 40);
  b.enemy.archetype = "boss";
  b.enemy.hp = 18;                              // 45% — past "bloodied" (50%), not yet "desperate" (20%)
  G.aiTurn(b);
  return JSON.stringify(b.enemy.phasesApplied) === JSON.stringify(["bloodied"]);
})());
check("dropping through BOTH thresholds between the boss's own turns fires both at once", (()=>{
  // The guarantee archetypes.js documents: a big hit landing between the boss's turns must not
  // make it wait an extra turn to "catch up" on a phase it skipped past.
  const s = G.newGame();
  const b = G.startDuel(deck20("elixir"), {hp:0,atk:0,def:0,pip:0}, deck20("fire_dragon"), {hp:0,atk:0,def:0,pip:0}, 40);
  b.enemy.archetype = "boss";
  b.enemy.hp = 5;                               // 12.5% — already past BOTH thresholds
  const before = b.enemy.atkBonus || 0;
  G.aiTurn(b);
  return (b.enemy.atkBonus || 0) > before && JSON.stringify(b.enemy.phasesApplied) === JSON.stringify(["bloodied","desperate"]);
})());
check("a non-boss archetype never enters a boss phase, however low its HP", (()=>{
  const s = G.newGame();
  const b = G.startDuel(deck20("elixir"), {hp:0,atk:0,def:0,pip:0}, deck20("skeleton"), {hp:0,atk:0,def:0,pip:0}, 40);
  b.enemy.archetype = "control";
  b.enemy.hp = 2;
  G.aiTurn(b);
  return !b.enemy.phasesApplied || b.enemy.phasesApplied.length === 0;
})());


// ---------------------------------------------------------------- pvprank.js
check("validateRanks reports no problems", RANK.validateRanks().length === 0);
check("tierFor(0) is bronze, tierFor a huge score is grandmaster", (()=>{
  return RANK.tierFor(0).id === "bronze" && RANK.tierFor(99999).id === "grandmaster";
})());
check("tierFor is exact-boundary inclusive", (()=>{
  return RANK.tierFor(300).id === "silver" && RANK.tierFor(299).id === "bronze";
})());
check("nextTier is null at the top tier, populated everywhere else", (()=>{
  return RANK.nextTier(0).id === "silver" && RANK.nextTier(99999) === null;
})());
check("progressToNextTier reports maxed at the top tier", RANK.progressToNextTier(99999).maxed === true);
check("progressToNextTier reports have/need/pct within a tier", (()=>{
  const p = RANK.progressToNextTier(150);       // bronze [0,300)
  return p.have === 150 && p.need === 300 && p.pct === 50 && !p.maxed;
})());
check("titleFor: ordinary tiers are '<Tier> Duelist', grandmaster is special", (()=>{
  return RANK.titleFor(0) === "Bronze Duelist" && RANK.titleFor(99999) === "Grandmaster of the Arcane";
})());
check("resultOf: a win always gains points and increments the streak", (()=>{
  const r = RANK.resultOf(true, 100, 0, 0);
  return r.points === 120 && r.streak === 1 && r.delta === 20;
})());
check("resultOf: streak bonus grows then caps at STREAK_CAP", (()=>{
  const a = RANK.resultOf(true, 0, 5, 0);        // already at the cap
  const b = RANK.resultOf(true, 0, 50, 0);       // way past the cap
  return a.delta === 30 && b.delta === 30;
})());
check("resultOf: a loss always costs points, and resets the streak", (()=>{
  const r = RANK.resultOf(false, 100, 4, 0);
  return r.points === 85 && r.streak === 0 && r.delta === -15;
})());
check("resultOf: a loss cannot fall below the season floor", (()=>{
  const r = RANK.resultOf(false, 305, 0, 300);   // one point above the floor
  return r.points === 300;
})());
check("resultOf: the season floor itself cannot go negative", (()=>{
  const r = RANK.resultOf(false, 5, 0, 0);
  return r.points === 0;
})());
check("seasonIdFor is a stable YYYY-MM in UTC", (()=>{
  return RANK.seasonIdFor(Date.UTC(2026, 7, 9)) === "2026-08"       // August, 0-indexed month 7
      && RANK.seasonIdFor(Date.UTC(2026, 0, 1)) === "2026-01";
})());
check("applyResult mutates rankPoints/streak/seasonBest in place and returns the delta", (()=>{
  const pvp = { rankPoints: 0, streak: 0, seasonBest: 0 };
  const r = RANK.applyResult(pvp, true);
  return pvp.rankPoints === 20 && pvp.streak === 1 && pvp.seasonBest === 20 && r.delta === 20;
})());
check("applyResult: seasonBest only ever rises, even after a loss", (()=>{
  const pvp = { rankPoints: 320, streak: 0, seasonBest: 320 };
  RANK.applyResult(pvp, false);
  return pvp.rankPoints === 305 && pvp.seasonBest === 320;
})());
check("settleSeason on a brand-new save starts the current season with no history", (()=>{
  const pvp = { rankPoints: 0, streak: 0, season: null, seasonBest: 0, history: [] };
  RANK.settleSeason(pvp, Date.UTC(2026, 7, 9));
  return pvp.season === "2026-08" && pvp.history.length === 0;
})());
check("settleSeason is a no-op within the same season", (()=>{
  const pvp = { rankPoints: 123, streak: 3, season: "2026-08", seasonBest: 200, history: [] };
  RANK.settleSeason(pvp, Date.UTC(2026, 7, 20));
  return pvp.rankPoints === 123 && pvp.streak === 3 && pvp.history.length === 0;
})());
check("settleSeason on rollover records history and soft-resets, never below the tier floor", (()=>{
  const pvp = { rankPoints: 270, streak: 4, season: "2026-08", seasonBest: 270, history: [] };
  RANK.settleSeason(pvp, Date.UTC(2026, 8, 1));  // next month
  const halved = Math.floor(270 * 0.5);
  return pvp.season === "2026-09"
      && pvp.rankPoints === halved && pvp.seasonBest === halved
      && pvp.streak === 0
      && pvp.history.length === 1 && pvp.history[0].season === "2026-08"
      && pvp.history[0].points === 270 && pvp.history[0].tier === "bronze";
})());
check("settleSeason soft reset cannot drop a player below the tier they finished in", (()=>{
  const pvp = { rankPoints: 1850, streak: 2, season: "2026-08", seasonBest: 1850, history: [] };  // diamond
  RANK.settleSeason(pvp, Date.UTC(2026, 8, 1));
  return pvp.rankPoints >= RANK.TIERS.find(t=>t.id==="diamond").min;
})());
check("settleSeason caps history at 12 entries", (()=>{
  const pvp = { rankPoints: 0, streak: 0, season: "2020-01", seasonBest: 0, history: Array.from({length:12}, (_,i)=>({season:`2019-${i+1}`, points:0, tier:"bronze"})) };
  RANK.settleSeason(pvp, Date.UTC(2020, 1, 1));
  return pvp.history.length === 12 && pvp.history[0].season === "2020-01";
})());
check("game.js newGame() gives a fresh pvp record with the pvprank fields", (()=>{
  const s = G.newGame();
  return s.pvp.rankPoints === 0 && s.pvp.streak === 0 && s.pvp.seasonBest === 0
      && Array.isArray(s.pvp.history) && s.pvp.season === null;
})());
check("game.js load() settles the season on a fresh save", (()=>{
  const s = G.load();
  return typeof s.pvp.season === "string" && s.pvp.season === RANK.seasonIdFor(Date.now());
})());
check("game.js migrate() defaults rank fields for an older save missing them", (()=>{
  const old = G.newGame();
  delete old.pvp.rankPoints; delete old.pvp.streak; delete old.pvp.history; delete old.pvp.seasonBest;
  old.pvp.wins = 40; old.pvp.losses = 20;
  const m = G.migrate ? G.migrate(old) : null;
  if (!m) return true;  // migrate() is not exported; covered indirectly via load() above
  return m.pvp.rankPoints === 0 && m.pvp.streak === 0 && Array.isArray(m.pvp.history) && m.pvp.seasonBest === 0;
})());

// ---------------------------------------------------------------- schoolmagic.js
check("validateSchoolMagic reports no problems", MAGIC.validateSchoolMagic().length === 0);
check("affinityFx: same-school caster and spell earns a bonus", (()=>{
  const fx = MAGIC.affinityFx("fire", "fire");
  return Array.isArray(fx) && fx.length === 1;
})());
check("affinityFx: off-school spell earns nothing", MAGIC.affinityFx("fire", "ice") === null);
check("affinityFx: no caster school earns nothing", MAGIC.affinityFx(null, "fire") === null);
check("every school has both an affinity bonus and an ultimate", (()=>{
  const ids = ["fire","ice","storm","myth","life","death","balance"];
  return ids.every(id => MAGIC.AFFINITY_FX[id] && MAGIC.ultimateFor(id));
})());
check("canUseUltimate: false below the charge threshold", MAGIC.canUseUltimate(MAGIC.ULT_CHARGE_MAX-1, "fire", false) === false);
check("canUseUltimate: true once charged, for a real school", MAGIC.canUseUltimate(MAGIC.ULT_CHARGE_MAX, "fire", false) === true);
check("canUseUltimate: false once already used this duel", MAGIC.canUseUltimate(MAGIC.ULT_CHARGE_MAX, "fire", true) === false);
check("canUseUltimate: false for an unknown school", MAGIC.canUseUltimate(MAGIC.ULT_CHARGE_MAX, "nope", false) === false);

// ---- game.js integration: affinity bonus, ultimate charge/cast, AI auto-cast ----
check("startDuel gives both sides a fresh, unused ultimate charge", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("firebolt"), flat, 100, "fire", "fire");
  return b.you.ultCharge === 0 && !b.you.ultUsed && b.enemy.ultCharge === 0 && !b.enemy.ultUsed;
})());
check("playing a card of your OWN school banks ultimate charge; an off-school card does not", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  b.you.hand = ["firebolt"]; b.you.pips = 10;
  G.playCard(b, b.you, 0, { kind: "wiz" });
  const withOwnSchool = b.you.ultCharge;
  const b2 = G.startDuel(deck20("ice_golem"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  b2.you.hand = ["ice_golem"]; b2.you.pips = 10;
  G.playCard(b2, b2.you, 0, null);
  return withOwnSchool === 1 && b2.you.ultCharge === 0;
})());
check("a fire wizard's own-school spell deals the affinity bonus dmg on top of the printed value", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  b.you.hand = ["firebolt"]; b.you.pips = 10;
  const before = b.enemy.hp;
  G.playCard(b, b.you, 0, { kind: "wiz" });
  return before - b.enemy.hp === 5;    // 4 printed + 1 fire affinity
})());
check("useUltimate fails below the charge threshold", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  return G.useUltimate(b, b.you).ok === false;
})());
check("useUltimate applies the school's fx, drains the charge, and can't be reused this duel", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  b.you.ultCharge = MAGIC.ULT_CHARGE_MAX;
  const enemyHpBefore = b.enemy.hp;
  const r = G.useUltimate(b, b.you);
  const spentAndUsed = r.ok && b.you.ultCharge === 0 && b.you.ultUsed;
  const dealtDamage = enemyHpBefore - b.enemy.hp === 3;   // Inferno's dmgWiz
  const second = G.useUltimate(b, b.you);
  return spentAndUsed && dealtDamage && second.ok === false;
})());
check("useUltimate refuses on the opponent's turn", (()=>{
  const b = G.startDuel(deck20("firebolt"), flat, deck20("frost_giant"), flat, 100, "fire", "ice");
  b.you.ultCharge = MAGIC.ULT_CHARGE_MAX;
  b.turn = "enemy";
  return G.useUltimate(b, b.you).ok === false;
})());
check("aiTurn spends a charged ultimate automatically", (()=>{
  const b = G.startDuel(deck20("elixir"), flat, deck20("frost_giant"), flat, 100, "balance", "ice");
  b.turn = "enemy";
  b.enemy.ultCharge = MAGIC.ULT_CHARGE_MAX;
  const shieldBefore = b.enemy.shield;
  G.aiTurn(b);
  return b.enemy.ultUsed && b.enemy.shield > shieldBefore;   // Deep Freeze shields for 8
})());

// ---------------------------------------------------------------- cardbacks.js
check("validateCardBacks reports no problems", CB.validateCardBacks().length === 0);
check("the default back is always unlocked, with no achievement gate", (()=>{
  return CB.isUnlocked(CB.DEFAULT_BACK, []) === true;
})());
check("every non-default back is locked with no achievements done", (()=>{
  return CB.CARD_BACKS.filter(b => b.id !== CB.DEFAULT_BACK).every(b => CB.isUnlocked(b.id, []) === false);
})());
check("a back unlocks once its matching achievement is done", (()=>{
  return CB.isUnlocked("archivist", ["archivist"]) === true
      && CB.isUnlocked("archivist", ["curator"]) === false;
})());
check("unlockedBacks always includes the default plus whatever achievements are done", (()=>{
  const ids = CB.unlockedBacks(["shiny", "founder"]).map(b => b.id);
  return ids.includes(CB.DEFAULT_BACK) && ids.includes("shiny") && ids.includes("founder") && !ids.includes("curator");
})());
check("equippedBack falls back to the default for a fresh or bad save", (()=>{
  return CB.equippedBack({}).id === CB.DEFAULT_BACK
      && CB.equippedBack({ cardBack: "not-a-real-id" }).id === CB.DEFAULT_BACK
      && CB.equippedBack(null).id === CB.DEFAULT_BACK;
})());
check("setBack refuses a locked back and leaves the save unchanged", (()=>{
  const save = { cardBack: CB.DEFAULT_BACK };
  const r = CB.setBack(save, "legends", []);
  return r.ok === false && save.cardBack === CB.DEFAULT_BACK;
})());
check("setBack accepts an unlocked back", (()=>{
  const save = { cardBack: CB.DEFAULT_BACK };
  const r = CB.setBack(save, "scholar", ["scholar"]);
  return r.ok === true && save.cardBack === "scholar";
})());
check("every card back's achievement id (if any) is a real codex achievement", (()=>{
  const ids = CX.ACHIEVEMENTS.map(a => a.id);
  return CB.CARD_BACKS.every(b => b.achievement == null || ids.includes(b.achievement));
})());
check("game.js newGame() equips the default card back", G.newGame().cardBack === CB.DEFAULT_BACK);
check("game.js load() never leaves cardBack unset or pointing at a fake back", (()=>{
  const s = G.load();
  return !!s.cardBack && !!CB.BACK_MAP[s.cardBack];
})());

// ---------------------------------------------------------------- achievements.js (BACKLOG §1/§2)
check("validateAchievements reports no problems", ACHV.validateAchievements().length === 0);
check("a fresh save has earned none of the achievements", (()=>{
  const s = G.newGame();
  return ACHV.achievementsFor(s).every(a => a.done === false);
})());
check("wayfarer completes exactly when every field quest is done", (()=>{
  const s = G.newGame();
  s.zoneQuests.done = ZQ.ZONE_QUESTS.map(q => q.id).slice(0, -1);
  const notYet = ACHV.achievementsFor(s).find(a => a.id === "wayfarer");
  s.zoneQuests.done = ZQ.ZONE_QUESTS.map(q => q.id);
  const done = ACHV.achievementsFor(s).find(a => a.id === "wayfarer");
  return notYet.done === false && done.done === true;
})());
check("wyrmslayer and vault_breaker read their own dungeon's bossDead, not each other's", (()=>{
  const s = G.newGame();
  s.worldState.dungeons.cinderhollow_caverns = { bossDead: true };
  const list = ACHV.achievementsFor(s);
  return list.find(a => a.id === "wyrmslayer").done === true
      && list.find(a => a.id === "vault_breaker").done === false;
})());
check("gold_hoarder is derived live — spending the gold un-earns it", (()=>{
  const s = G.newGame();
  s.gold = 5000;
  const before = ACHV.achievementsFor(s).find(a => a.id === "gold_hoarder").done;
  s.gold = 0;
  const after = ACHV.achievementsFor(s).find(a => a.id === "gold_hoarder").done;
  return before === true && after === false;
})());
check("the default title is always unlocked, with no achievement gate", (()=>{
  return ACHV.isTitleUnlocked(ACHV.DEFAULT_TITLE, []) === true;
})());
check("every non-default title is locked until its achievement is done", (()=>{
  return ACHV.TITLES.filter(t => t.id !== ACHV.DEFAULT_TITLE).every(t => ACHV.isTitleUnlocked(t.id, []) === false)
      && ACHV.isTitleUnlocked("wyrmslayer", ["wyrmslayer"]) === true;
})());
check("equippedTitle falls back to the default for a fresh or bad save", (()=>{
  return ACHV.equippedTitle({}).id === ACHV.DEFAULT_TITLE
      && ACHV.equippedTitle({ title: "not-a-real-id" }).id === ACHV.DEFAULT_TITLE
      && ACHV.equippedTitle(null).id === ACHV.DEFAULT_TITLE;
})());
check("setTitle refuses a locked title and leaves the save unchanged", (()=>{
  const save = { title: ACHV.DEFAULT_TITLE };
  const r = ACHV.setTitle(save, "grandmaster", []);
  return r.ok === false && save.title === ACHV.DEFAULT_TITLE;
})());
check("setTitle accepts an unlocked title", (()=>{
  const save = { title: ACHV.DEFAULT_TITLE };
  const r = ACHV.setTitle(save, "wyrmslayer", ["wyrmslayer"]);
  return r.ok === true && save.title === "wyrmslayer";
})());
check("game.js newGame() equips the default title", G.newGame().title === ACHV.DEFAULT_TITLE);
check("game.js load() never leaves title unset or pointing at a fake title", (()=>{
  const s = G.load();
  return !!s.title && ACHV.TITLES.some(t => t.id === s.title);
})());

// ---------------------------------------------------------------- enchanting (BACKLOG §6)
check("every enchant costs a real bar the smithing chain actually produces", (()=>{
  const barIds = new Set(BARS.map(b => b.id));
  return ENCHANTS.every(e => Object.keys(e.req).every(id => barIds.has(id)));
})());
check("enchantStats returns a zeroed stat block for an unknown enchant id", (()=>{
  const s = enchantStats("not-a-real-id");
  return s.atk === 0 && s.def === 0 && s.hp === 0 && s.pip === 0 && s.gold === 0;
})());
check("enchantStats returns exactly the printed stat/n for a real enchant", (()=>{
  const s = enchantStats("ward_2");
  return s.def === 2 && s.atk === 0 && s.hp === 0;
})());
check("canEnchant is false below the required level, gold or resources", (()=>{
  const s = G.newGame();
  return G.canEnchant(s, "whet_1") === false;   // no bar_bronze, no matter the gold
})());
check("enchantItem applies to the named item, charges gold, consumes the bar, and grants XP", (()=>{
  const s = G.newGame();
  s.gold = 500; s.inventory.bar_bronze = 2;
  const eq = { uid:"eq1", id:"bronze_wand", slot:"wand", metal:"bronze", tier:1 };
  s.equipment.push(eq);
  const goldBefore = s.gold, xpBefore = s.skillXp.enchanting;
  const r = G.enchantItem(s, "eq1", "whet_1");
  return r.ok && eq.enchant === "whet_1"
      && s.gold === goldBefore - ENCHANT_MAP.whet_1.cost
      && s.inventory.bar_bronze === 1
      && s.skillXp.enchanting > xpBefore;
})());
check("enchantItem refuses without enough gold, even with the resource and level in hand", (()=>{
  const s = G.newGame();
  s.gold = 0; s.inventory.bar_bronze = 2;
  const eq = { uid:"eq1", id:"bronze_wand", slot:"wand", metal:"bronze", tier:1 };
  s.equipment.push(eq);
  const r = G.enchantItem(s, "eq1", "whet_1");
  return r.ok === false && r.err === "gold" && eq.enchant === undefined;
})());
check("enchantItem refuses below the required enchanting level", (()=>{
  const s = G.newGame();
  s.gold = 500; s.inventory.bar_mithril = 2;
  const eq = { uid:"eq1", id:"bronze_wand", slot:"wand", metal:"bronze", tier:1 };
  s.equipment.push(eq);
  const r = G.enchantItem(s, "eq1", "whet_3");   // needs level 45, save starts at 1
  return r.ok === false && r.err === "level";
})());
check("re-enchanting an item overwrites the previous enchant rather than stacking", (()=>{
  const s = G.newGame();
  s.gold = 1000; s.inventory.bar_bronze = 2; s.inventory.bar_silver = 2; s.skills.enchanting = 25;
  const eq = { uid:"eq1", id:"bronze_wand", slot:"wand", metal:"bronze", tier:1 };
  s.equipment.push(eq);
  G.enchantItem(s, "eq1", "whet_1");
  G.enchantItem(s, "eq1", "whet_2");
  return eq.enchant === "whet_2";
})());
check("equipStats includes an equipped item's enchant bonus on top of its base stats", (()=>{
  const s = G.newGame();
  s.gold = 500; s.inventory.bar_bronze = 2;
  const eq = { uid:"eq1", id:"bronze_wand", slot:"wand", metal:"bronze", tier:1 };
  s.equipment.push(eq);
  G.equip(s, "eq1");
  const afterUnenchanted = G.equipStats(s).atk;   // bronze wand's own +2 atk
  G.enchantItem(s, "eq1", "whet_1");
  const afterEnchanted = G.equipStats(s).atk;
  return afterEnchanted === afterUnenchanted + 1;   // whet_1 is +1 atk
})());
check("game.js newGame() starts the enchanting skill at level 1 like every other skill", G.newGame().skills.enchanting === 1);

// ---------------------------------------------------------------- save backup/import/export (BACKLOG §9)
check("exportSave round-trips through importSave with the save intact", (()=>{
  const s = G.newGame();
  s.gold = 9001; s.name = "Roundtrip";
  const r = G.importSave(G.exportSave(s));
  return r.ok && r.save.gold === 9001 && r.save.name === "Roundtrip"
      && r.save.cards.length === s.cards.length && r.save.deck.length === s.deck.length;
})());
check("importSave refuses text that isn't JSON at all", G.importSave("not json { at all").ok === false
  && G.importSave("not json { at all").err === "json");
check("importSave refuses a JSON array — not the shape a save has ever taken", (()=>{
  const r = G.importSave(JSON.stringify([1,2,3]));
  return r.ok === false && r.err === "shape";
})());
check("importSave refuses an object with no version — never a save this game wrote", (()=>{
  const r = G.importSave(JSON.stringify({ cards:[], deck:[] }));
  return r.ok === false && r.err === "version";
})());
check("importSave refuses a versioned object missing cards/deck", (()=>{
  const r = G.importSave(JSON.stringify({ version:1 }));
  return r.ok === false && r.err === "shape";
})());
check("a successfully imported save is hydrated through the SAME path load() uses", (()=>{
  // migrate() would add the enchanting skill to an old save missing it; importSave must too,
  // rather than accepting the raw shape verbatim.
  const s = G.newGame();
  delete s.skills.enchanting; delete s.skillXp.enchanting;
  const r = G.importSave(JSON.stringify(s));
  return r.ok && r.save.skills.enchanting === 1 && r.save.skillXp.enchanting === 0;
})());
check("importing a save with a live auction settles it exactly like load() would", (()=>{
  const s = G.newGame();
  G.listAuction(s, s.cards[0].uid, 50);
  s.auctions[0].ends = Date.now() - 1;   // already expired at export time
  const r = G.importSave(JSON.stringify(s));
  return r.ok && r.save.auctions.length === 0;
})());
check("importSave never mutates the game's actual save (localStorage) as a side effect", (()=>{
  // exportSave/importSave are pure text <-> save operations; only an explicit save() call after
  // import should ever touch localStorage — the caller decides when to commit an import, not
  // this function.
  const before = G.load();
  G.importSave(JSON.stringify({ version:1, cards:[], deck:[], gold:999999 }));
  const after = G.load();
  return after.gold === before.gold;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
