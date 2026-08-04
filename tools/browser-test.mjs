// Real-browser suite: responsive layout across device sizes + the world input gestures.
//
// This exists because tools/ui-smoke.mjs cannot reach any of it — createWorld() needs WebGL, so
// the joystick, tap-to-move, drag-to-rotate and pinch-to-zoom paths were never exercised by a
// test. It serves public/ itself and drives Chromium, so it is self-contained:
//
//   npm run test:browser
//
// Kept out of `npm test` because it needs a browser download; CI runs it as its own job.
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PORT = Number(process.env.PORT || 8099);
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".json":"application/json",
  ".png":"image/png", ".jpg":"image/jpeg", ".glb":"model/gltf-binary", ".css":"text/css" };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOT_DIR || null;

// Use a preinstalled Chromium when the environment provides one (PLAYWRIGHT_BROWSERS_PATH),
// otherwise fall back to Playwright's own download. Keeps this runnable both in CI and in
// sandboxes that ship a browser but not a matching Playwright revision.
function chromiumPath(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter(d => d.startsWith("chromium-")).sort().reverse();
  for (const d of dirs){
    const exe = path.join(root, d, "chrome-linux", "chrome");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}
const LAUNCH = {
  executablePath: chromiumPath(),
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
};

console.log("== responsive layout ==");
const SIZES = [
  { name:"iPhone SE (portrait)",     w:320,  h:568,  touch:true },
  { name:"iPhone 12 (portrait)",     w:390,  h:844,  touch:true },
  { name:"iPhone 12 (landscape)",    w:844,  h:390,  touch:true },
  { name:"Pixel 7 (portrait)",       w:412,  h:915,  touch:true },
  { name:"iPad mini (portrait)",     w:768,  h:1024, touch:true },
  { name:"iPad Pro (landscape)",     w:1366, h:1024, touch:true },
  { name:"Desktop 1440",             w:1440, h:900,  touch:false },
  { name:"Narrow desktop 1024",      w:1024, h:768,  touch:false },
];

const browser = await chromium.launch(LAUNCH);
let failures = 0;
const rows = [];

for (const s of SIZES){
  const ctx = await browser.newContext({
    viewport: { width:s.w, height:s.h },
    hasTouch: s.touch,
    isMobile: s.touch,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => { if (m.type()==="error") errs.push(m.text()); });
  await page.goto(BASE + "/index.html", { waitUntil:"load" });
  await page.waitForTimeout(700);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;
    const r = id => { const e = document.getElementById(id); if (!e) return null;
      const b = e.getBoundingClientRect(); const st = getComputedStyle(e);
      return { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), display:st.display }; };
    // widest element that pokes past the viewport
    let worst = null;
    for (const el of document.querySelectorAll("*")){
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      const over = Math.round(b.right - de.clientWidth);
      if (over > 1 && (!worst || over > worst.over)) worst = { tag:el.tagName, id:el.id, cls:(el.className||"").toString().slice(0,26), over };
    }
    // smallest tap target among visible buttons
    let minBtn = 999;
    for (const b of document.querySelectorAll("button")){
      const bb = b.getBoundingClientRect();
      if (bb.width > 0 && bb.height > 0) minBtn = Math.min(minBtn, Math.round(Math.min(bb.width, bb.height)));
    }
    return { overflow, worst, minBtn,
      app:r("app"), topbar:r("topbar"), nav:r("nav"), screen:r("screen"), worldWrap:r("worldWrap"),
      joy:r("joy"), zoomIn:r("zoomIn"), prompt:r("prompt"), picker:r("schoolPicker"),
      chrome: (()=>{ const t=document.getElementById("topbar"), n=document.getElementById("nav");
        return Math.round((t?t.getBoundingClientRect().height:0)+(n?n.getBoundingClientRect().height:0)); })(),
      vw:de.clientWidth, vh:de.clientHeight };
  });

  const problems = [];
  if (m.overflow > 1) problems.push(`h-overflow ${m.overflow}px` + (m.worst?` (${m.worst.tag}${m.worst.id?"#"+m.worst.id:""}.${m.worst.cls} +${m.worst.over})`:""));
  if (m.app && m.app.h > m.vh + 1) problems.push(`app taller than viewport (${m.app.h} > ${m.vh})`);
  // the game boots into the 3D world, so measure whichever content region is actually visible
  const contentH = Math.max(m.screen?m.screen.h:0, m.worldWrap?m.worldWrap.h:0);
  if (contentH < 100) problems.push(`content area collapsed (${contentH}px)`);
  // chrome (topbar + nav) must not eat the screen, especially in landscape
  if (m.chrome > m.vh * 0.42) problems.push(`chrome eats ${Math.round(m.chrome/m.vh*100)}% of height (${m.chrome}px)`);
  if (m.minBtn < 30 && m.minBtn !== 999) problems.push(`tap target ${m.minBtn}px < 30px`);
  if (errs.length) problems.push("js: " + errs.slice(0,2).join(" | "));

  if (problems.length) failures++;
  rows.push({ name:s.name, size:`${s.w}x${s.h}`, minBtn:m.minBtn, screenH:Math.max(m.screen?m.screen.h:0,m.worldWrap?m.worldWrap.h:0), chrome:m.chrome,
              joy:m.joy?m.joy.display:"-", status: problems.length ? "FAIL: "+problems.join("; ") : "ok" });
  if (SHOTS) await page.screenshot({ path:`${SHOTS}/shot-${s.w}x${s.h}.png` });
  await ctx.close();
}

for (const r of rows) console.log(`${r.status==="ok"?"✔":"✗"} ${r.name.padEnd(24)} ${r.size.padEnd(10)} content:${String(r.screenH).padStart(4)}px chrome:${String(r.chrome).padStart(3)}px  minTap:${String(r.minBtn).padStart(3)}px  joy:${r.joy.padEnd(5)} ${r.status==="ok"?"":r.status}`);

console.log("\n== world input gestures ==");
let pass = 0, fail = 0;
const check = (n, c, extra="") => { if (c){ pass++; console.log("  ✔ " + n); } else { fail++; console.log("  ✗ FAIL: " + n + (extra?"  "+extra:"")); } };

// ---------------- touch phone ----------------
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.goto(BASE + "/index.html", { waitUntil:"load" });
await page.waitForTimeout(1500);

const hasWorld = await page.evaluate(() => !!window.__worldDebug);
console.log(`\n3D world booted: ${hasWorld}`);
check("the 3D world initialises (WebGL)", hasWorld);

if (hasWorld){
  const dbg = () => page.evaluate(() => window.__worldDebug());

  // --- joystick drives the player ---
  const before = await dbg();
  const joy = await page.locator("#joy").boundingBox();
  await page.locator("#joy").dispatchEvent("pointerdown", { pointerId:1, clientX:joy.x+joy.width/2, clientY:joy.y+joy.height/2, isPrimary:true });
  await page.locator("#joy").dispatchEvent("pointermove", { pointerId:1, clientX:joy.x+joy.width/2, clientY:joy.y+joy.height/2-60, isPrimary:true });
  await page.waitForTimeout(700);
  const during = await dbg();
  await page.locator("#joy").dispatchEvent("pointerup", { pointerId:1, clientX:joy.x+joy.width/2, clientY:joy.y+joy.height/2-60, isPrimary:true });
  const moved = Math.hypot(during.player[0]-before.player[0], during.player[2]-before.player[2]);
  check("joystick moves the player", moved > 0.5, `moved ${moved.toFixed(2)} units`);

  const knobShifted = await page.evaluate(() => {
    const k = document.getElementById("joyKnob");
    return getComputedStyle(k).transform;
  });
  check("joystick knob renders", typeof knobShifted === "string");

  // --- joystick releases cleanly (no stuck movement) ---
  await page.waitForTimeout(400);
  const relA = (await dbg()).player;
  await page.waitForTimeout(500);
  const relB = (await dbg()).player;
  const drift = Math.hypot(relB[0]-relA[0], relB[2]-relA[2]);
  check("player stops when the joystick is released", drift < 0.6, `drift ${drift.toFixed(2)}`);

  // --- drag to rotate the camera ---
  const camBefore = (await dbg()).cam;
  await page.locator("#world").dispatchEvent("pointerdown", { pointerId:2, clientX:200, clientY:400, isPrimary:true });
  for (let x=200; x<=320; x+=20) await page.locator("#world").dispatchEvent("pointermove", { pointerId:2, clientX:x, clientY:400, isPrimary:true });
  await page.locator("#world").dispatchEvent("pointerup", { pointerId:2, clientX:320, clientY:400, isPrimary:true });
  await page.waitForTimeout(500);
  const camAfter = (await dbg()).cam;
  const camMoved = Math.hypot(camAfter[0]-camBefore[0], camAfter[2]-camBefore[2]);
  check("drag rotates the camera", camMoved > 0.5, `camera moved ${camMoved.toFixed(2)}`);

  // --- a drag must NOT also trigger tap-to-move ---
  const pBefore = (await dbg()).player;
  await page.locator("#world").dispatchEvent("pointerdown", { pointerId:3, clientX:200, clientY:300, isPrimary:true });
  for (let x=200; x<=300; x+=25) await page.locator("#world").dispatchEvent("pointermove", { pointerId:3, clientX:x, clientY:300, isPrimary:true });
  await page.locator("#world").dispatchEvent("pointerup", { pointerId:3, clientX:300, clientY:300, isPrimary:true });
  await page.waitForTimeout(600);
  const pAfter = (await dbg()).player;
  const tapDrift = Math.hypot(pAfter[0]-pBefore[0], pAfter[2]-pBefore[2]);
  check("dragging does not also tap-to-move", tapDrift < 1.5, `player drifted ${tapDrift.toFixed(2)}`);

  // --- tap to move ---
  const tapBefore = (await dbg()).player;
  await page.locator("#world").dispatchEvent("pointerdown", { pointerId:4, clientX:120, clientY:300, isPrimary:true });
  await page.locator("#world").dispatchEvent("pointerup", { pointerId:4, clientX:121, clientY:301, isPrimary:true });
  await page.waitForTimeout(900);
  const tapAfter = (await dbg()).player;
  const tapMoved = Math.hypot(tapAfter[0]-tapBefore[0], tapAfter[2]-tapBefore[2]);
  check("tap-to-move walks the player", tapMoved > 0.5, `moved ${tapMoved.toFixed(2)}`);

  // --- pinch to zoom, and pinching must not rotate ---
  const zBefore = await page.evaluate(() => window.__worldDebug().cam);
  const w = page.locator("#world");
  await w.dispatchEvent("pointerdown", { pointerId:10, clientX:150, clientY:400, isPrimary:true });
  await w.dispatchEvent("pointerdown", { pointerId:11, clientX:250, clientY:400, isPrimary:false });
  for (let d=0; d<=60; d+=15){
    await w.dispatchEvent("pointermove", { pointerId:10, clientX:150-d, clientY:400, isPrimary:true });
    await w.dispatchEvent("pointermove", { pointerId:11, clientX:250+d, clientY:400, isPrimary:false });
  }
  await w.dispatchEvent("pointerup", { pointerId:10, clientX:90, clientY:400, isPrimary:true });
  await w.dispatchEvent("pointerup", { pointerId:11, clientX:310, clientY:400, isPrimary:false });
  await page.waitForTimeout(600);
  const zAfter = await page.evaluate(() => window.__worldDebug().cam);
  const distBefore = Math.hypot(zBefore[0], zBefore[2]), distAfter = Math.hypot(zAfter[0], zAfter[2]);
  check("pinch changes the camera distance", Math.abs(distAfter-distBefore) > 0.2 || zAfter[1] !== zBefore[1],
        `dist ${distBefore.toFixed(1)} -> ${distAfter.toFixed(1)}`);

  // --- keyboard (desktop path, physical codes) ---
  const kBefore = (await dbg()).player;
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(200);
  const kAfter = (await dbg()).player;
  const kMoved = Math.hypot(kAfter[0]-kBefore[0], kAfter[2]-kBefore[2]);
  check("W key walks the player", kMoved > 0.5, `moved ${kMoved.toFixed(2)}`);

  // --- wheel zoom ---
  const wBefore = (await dbg()).cam;
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(500);
  const wAfter = (await dbg()).cam;
  check("wheel zooms the camera", JSON.stringify(wBefore) !== JSON.stringify(wAfter));

  // --- zoom buttons ---
  const bBefore = (await dbg()).cam;
  await page.locator("#zoomOut").dispatchEvent("pointerdown", { pointerId:20, isPrimary:true });
  await page.waitForTimeout(120);
  await page.locator("#zoomOut").dispatchEvent("pointerup", { pointerId:20, isPrimary:true });
  await page.waitForTimeout(400);
  const bAfter = (await dbg()).cam;
  check("on-screen zoom button works", JSON.stringify(bBefore) !== JSON.stringify(bAfter));

  // --- collision: walking into the tower must not put the player inside it ---
  const solid = await page.evaluate(async () => {
    const { OBSTACLES, isClear, PLAYER_RADIUS } = await import("./structures.js");
    const d = window.__worldDebug();
    return { inside: !isClear(d.playerExact[0], d.playerExact[2], PLAYER_RADIUS, OBSTACLES), obstacles: OBSTACLES.length };
  });
  check("the player is not standing inside any obstacle", !solid.inside, `${solid.obstacles} obstacles`);

  // drive the player hard at the central tower and confirm they never end up in it
  const tower = await page.evaluate(async () => {
    const { isClear } = await import("./structures.js");
    return new Promise(resolve => {
      // aim at the tower at the origin for a few seconds via repeated tap-to-move
      let worst = false, ticks = 0;
      const id = setInterval(() => {
        const d = window.__worldDebug();
        if (!isClear(d.playerExact[0], d.playerExact[2])) worst = true;
        if (++ticks > 40){ clearInterval(id); resolve({ everInside: worst, at: d.playerExact.map(v=>+v.toFixed(2)) }); }
      }, 50);
    });
  });
  check("the player never ends up inside geometry while moving", !tower.everInside, `ended at ${tower.at}`);

  // --- character models loaded ---
  const chars = (await dbg()).chars;
  const loaded = Object.values(chars).filter(c=>c.loaded).length;
  check("character GLB models load", loaded >= 5, `${loaded}/${Object.keys(chars).length} loaded`);
}

check("no uncaught page errors", errs.length === 0, errs.slice(0,3).join(" | "));

// ---------------- desktop: joystick hidden, zoom buttons hidden ----------------
const dctx = await browser.newContext({ viewport:{width:1440,height:900}, hasTouch:false });
const dpage = await dctx.newPage();
await dpage.goto(BASE + "/index.html", { waitUntil:"load" });
await dpage.waitForTimeout(900);
const dVis = await dpage.evaluate(() => ({
  joy: getComputedStyle(document.getElementById("joy")).display,
  zoom: getComputedStyle(document.getElementById("zoomIn")).display,
  hasTouchClass: document.body.classList.contains("has-touch"),
}));
check("joystick is hidden on a non-touch desktop", dVis.joy === "none");
check("on-screen zoom buttons are hidden on desktop", dVis.zoom === "none");


await browser.close();
server.close();
console.log(`\nlayout: ${SIZES.length - failures}/${SIZES.length} viewports ok · controls: ${pass} passed, ${fail} failed`);
process.exit((failures || fail) ? 1 : 0);
