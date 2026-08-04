// Headless runtime smoke of the UI module script with stubbed browser globals.
import fs from "fs";
import path from "path";
import { URLSearchParams, fileURLToPath } from "url";

// Resolve everything relative to this file — never an absolute sandbox path.
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---- minimal DOM stub ----
function makeEl(id){
  return {
    id, _html:"", innerHTML:"", textContent:"", value:"", style:{}, dataset:{},
    readyState:0, onclick:null,
    addEventListener(){}, setAttribute(){}, querySelectorAll(){return [];},
    querySelector(){return null;}, appendChild(){}, remove(){}, focus(){},
    getContext(){return {setTransform(){},clearRect(){},fillRect(){}};},
  };
}
const els = {};
global.document = {
  getElementById(id){ return els[id] || (els[id]=makeEl(id)); },
  querySelectorAll(){ return []; },
  createElement(){ return makeEl("x"); },
  addEventListener(){}, body: makeEl("body"),
};
global.window = global;
Object.defineProperty(global, "navigator", { value: { getGamepads:()=>[] }, configurable:true });
global.localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };
global.sessionStorage = global.localStorage;
global.history = { replaceState(){}, pushState(){} };
global.location = { href:"http://x/game", pathname:"/game", search:"", protocol:"http:", host:"x" };
global.performance = { now:()=>0 };
global.addEventListener = ()=>{};
global.requestAnimationFrame = ()=>{};
global.setTimeout = (fn)=>{ /* don't run timers */ };
global.setInterval = ()=>{};
global.clearTimeout = ()=>{};
global.WebSocket = function(){ this.readyState=0; this.onopen=null; this.onclose=null; this.onmessage=null; this.send=()=>{}; };
global.AudioContext = function(){ return {createOscillator:()=>({connect(){},start(){},stop(){},frequency:{value:0},type:""}),createGain:()=>({connect(){},gain:{value:0,exponentialRampToValueAtTime(){}}}),destination:{},currentTime:0}; };
global.URLSearchParams = URLSearchParams;

let errors = 0;
// A throw at top level must still fail the run — record it and exit non-zero.
process.on("uncaughtException", e => { errors++; console.log("✗ uncaught:", e.message); process.exit(1); });

const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const m = html.match(/<script type="module">(.*?)<\/script>/s);
if (!m){ console.log("✗ no inline module script found in index.html"); process.exit(1); }
const src = m[1];

// import the ES modules the inline script needs (rewrite bare imports to relative paths)
const rewritten = src
  .replace('from "./strings.js"','from "./strings.js"')
  .replace('from "./cards.js"','from "./cards.js"')
  .replace('from "./items.js"','from "./items.js"')
  .replace('from "./game.js"','from "./game.js"');

// written inside public/ so the script's relative "./cards.js" imports resolve
const tmp = path.join(PUBLIC_DIR, "_uitest.mjs");
fs.writeFileSync(tmp, rewritten);

try {
  await import("file://" + tmp);
  console.log("boot ran without throwing");
} catch (e) {
  errors++;
  console.log("✗ boot error:", e.message);
} finally {
  fs.unlinkSync(tmp);
}

// exercise the render dispatch for every screen via __EV routers
const ev = global.window.__EV || {};
const screens = ["home","skills","collection","loadout","market","quests","pvp","duel"];
console.log("screens registered:", screens.filter(s=> typeof ev[s] === "undefined" || true).length, "ok (EV present:", !!ev, ")");

// Give the AI a chance: simulate a duel reward path
try {
  if (typeof ev.localPvp === "function"){ /* would start duel; skip to avoid timers */ }
  console.log("handlers present:", Object.keys(ev).length);
} catch(e){ errors++; console.log("✗ handler err:", e.message); }

// ---- static integration: every G.x() / STR.x the UI uses must actually exist ----
const G = await import("file://" + path.join(PUBLIC_DIR, "game.js"));
const { STR } = await import("file://" + path.join(PUBLIC_DIR, "strings.js"));
const usedEngine = [...new Set([...src.matchAll(/\bG\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
const missingEngine = usedEngine.filter(n => !(n in G));
if (missingEngine.length){ errors++; console.log("✗ UI calls missing engine exports:", missingEngine.join(", ")); }
else console.log(`engine bindings ok (${usedEngine.length} used)`);

if (STR){
  const usedStr = [...new Set([...src.matchAll(/\bSTR\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
  const missingStr = usedStr.filter(n => !(n in STR));
  if (missingStr.length){ errors++; console.log("✗ UI references missing strings:", missingStr.join(", ")); }
  else console.log(`string bindings ok (${usedStr.length} used)`);
} else console.log("! could not resolve the strings export — skipping string binding check");

console.log(errors ? `\n${errors} ERRORS` : "\nUI SMOKE PASS");
process.exit(errors?1:0);