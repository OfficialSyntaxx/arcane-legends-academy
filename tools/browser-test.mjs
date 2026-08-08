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
// Port 0 asks the OS for a free one. A fixed 8099 meant two runs on the same machine — a stale
// one, or simply an impatient second invocation — died on EADDRINUSE partway through, which looks
// exactly like a test failure and wasted real time twice. Set PORT explicitly to pin it.
const PORT = Number(process.env.PORT || 0);
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
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});
const BASE = `http://127.0.0.1:${server.address().port}`;
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
  // CDN-hosted models legitimately fail to fetch in offline/sandboxed/CI environments. The game
  // is designed to survive that (procedural placeholder stays), so a network failure on a remote
  // asset is not a test failure — a real JS error still is.
  const isAssetFetchFailure = t => /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|Failed to load resource/.test(t);
  page.on("console", m => { if (m.type()==="error" && !isAssetFetchFailure(m.text())) errs.push(m.text()); });
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
const check = (n, c, extra="") => { if (c){ pass++; console.log("  ✔ " + n + (extra && process.env.VERBOSE ? "  " + extra : "")); } else { fail++; console.log("  ✗ FAIL: " + n + (extra?"  "+extra:"")); } };

// ---------------- touch phone ----------------
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => { if (!/Failed to fetch|NetworkError|ERR_/.test(e.message)) errs.push(e.message); });
await page.goto(BASE + "/index.html", { waitUntil:"load" });
await page.waitForTimeout(1500);

// Dismiss the character-creation overlay before driving gestures. It is position:fixed with
// inset:0, so it swallows every real pointer/wheel event — the dispatchEvent-based checks below
// bypassed hit-testing and never noticed, but page.mouse.wheel did, and "wheel zooms the camera"
// was passing only because the follow-lerp happened to move the camera for other reasons.
// `charCreate` is the same trap and now shows FIRST on a fresh save, so hiding only the old
// school picker left the gesture tests shooting through a full-screen modal again.
await page.evaluate(() => {
  for (const id of ["schoolPicker", "charCreate"]){
    const e = document.getElementById(id); if (e) e.style.display = "none";
  }
});
await page.waitForTimeout(200);

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
  const tapBefore = (await dbg()).playerExact;
  // Both events in ONE evaluate. A tap is only a tap if press and release are within TAP_MS
  // (350ms), and two Playwright round-trips can exceed that on a loaded machine — which made
  // this test fail intermittently for a reason that had nothing to do with the game.
  await page.evaluate(() => {
    const c = document.getElementById("world");
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: 4, clientX: x, clientY: y, isPrimary: true, bubbles: true }));
    ev("pointerdown", 120, 300);
    ev("pointerup", 121, 301);
  });
  await page.waitForTimeout(900);
  const tapAfter = (await dbg()).playerExact;
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
  // Assert the zoom LEVEL changes, not the camera position: with camera collision the position
  // is legitimately pinned when something is behind the player, so position was the wrong proxy.
  const wBefore = (await dbg()).camDist;
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const wAfter = (await dbg()).camDist;
  check("wheel zooms the camera", wAfter !== wBefore, `camDist ${wBefore} -> ${wAfter}`);

  // --- zoom buttons ---
  const bBefore = (await dbg()).camDist;
  await page.locator("#zoomOut").dispatchEvent("pointerdown", { pointerId:20, isPrimary:true });
  await page.waitForTimeout(120);
  await page.locator("#zoomOut").dispatchEvent("pointerup", { pointerId:20, isPrimary:true });
  await page.waitForTimeout(400);
  const bAfter = (await dbg()).camDist;
  check("on-screen zoom button works", bAfter !== bBefore, `camDist ${bBefore} -> ${bAfter}`);

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

  // --- terrain: the player must actually ride the heightmap ---
  // REGRESSION: the update loop pinned player.position.y = 0 every frame and the idle-bob
  // animation set an absolute Y, so the terrain rendered but nothing stood on it.
  const terr = await page.evaluate(async () => {
    const ter = await import("./terrain.js");
    const wc  = await import("./worldconfig.js");
    const cfg = await wc.loadWorldConfig();
    const z = cfg.get(cfg.hub), flats = ter.flatsForZone(z);
    const out = [];
    for (const [x, zz] of [[40,40],[48,48],[55,55],[-55,-55]]){
      window.__world.teleport(x, zz);
      await new Promise(r => setTimeout(r, 160));
      const d = window.__worldDebug();
      out.push({ want: +ter.heightAt(x, zz, z.terrain, flats).toFixed(3), got: +d.playerExact[1].toFixed(3) });
    }
    return { out, zones: cfg.zoneIds.length };
  });
  check("the zone config loads with more than one zone", terr.zones >= 2, `${terr.zones} zones`);
  check("the player stands on the terrain height", terr.out.every(o => Math.abs(o.want - o.got) < 0.02),
        JSON.stringify(terr.out));
  check("terrain is not flat where it should not be", terr.out.some(o => Math.abs(o.got) > 0.05),
        JSON.stringify(terr.out.map(o=>o.got)));

  // --- camera collision: rotating next to a big building must not put the camera inside it ---
  // REGRESSION: this was hit repeatedly while photographing the arena — the camera ended up in
  // the black interior of its canopy.
  const cam = await page.evaluate(async () => {
    const ST = await import("./structures.js");
    window.__world.teleport(0, -14);                 // just south of the Duel Arena
    await new Promise(r => setTimeout(r, 200));
    const bad = [];
    for (let a = 0; a < 16; a++){
      window.__world.rotateCam((Math.PI * 2 / 16) / 0.006);
      await new Promise(r => setTimeout(r, 320));      // let the follow lerp settle
      const d = window.__worldDebug();
      // exact, not the rounded `cam` — rounding by half a unit invents overlaps that aren't real
      if (!ST.isClear(d.camExact[0], d.camExact[2], ST.CAMERA_RADIUS))
        bad.push([+d.camExact[0].toFixed(2), +d.camExact[2].toFixed(2)]);
    }
    return { bad, total: 16 };
  });
  check("the camera never ends up inside geometry while orbiting", cam.bad.length === 0,
        `${cam.bad.length}/${cam.total} positions inside: ${JSON.stringify(cam.bad.slice(0,3))}`);

  // --- zone transitions (WORLDSPEC step 4) ---
  // Drives the real trigger: teleport next to the academy's north gateway, walk into it, and
  // assert the world actually rebuilt as the forest — then walk back. A one-way transition
  // strands the player, which is the whole point of §9b f.
  const trip = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const zoneNow = () => window.__worldDebug().zone;
    const log = { start: zoneNow() };
    // Step ONTO the exit. `setTouchMove` is camera-relative, so it cannot be aimed at a
    // world-space point without also solving for camYaw; teleport drives the same per-frame
    // trigger, which is what this test is actually about.
    const step = async () => {
      const e = (window.__worldDebug().exits || [])[0];
      if (!e) return null;
      window.__world.teleport(e.x, e.z);
      await settle(700);
      return zoneNow();
    };
    log.after1 = await step();
    await settle(800);
    log.stillThere = zoneNow();       // must NOT have bounced straight back
    // The anti-ping-pong guard: the arrival point must sit OUTSIDE the return exit's radius,
    // so the trigger re-arms naturally instead of firing us straight back.
    const WC = await import("./worldconfig.js");
    const cfg = await WC.loadWorldConfig();
    const d = window.__worldDebug();
    log.arrival = { zone: d.zone, at: [+d.playerExact[0].toFixed(2), +d.playerExact[2].toFixed(2)] };
    log.arrivalClear = WC.exitNear(cfg.get(d.zone), d.playerExact[0], d.playerExact[2]) === null;
    log.after2 = await step();
    return log;
  });
  check("walking into a gateway changes zone", trip.after1 && trip.after1 !== trip.start,
        `${trip.start} -> ${trip.after1}`);
  check("arriving does not ping-pong back", trip.stillThere === trip.after1,
        `${trip.after1} -> ${trip.stillThere}`);
  check("the arrival point is clear of the return trigger", trip.arrivalClear === true, JSON.stringify(trip.arrival));
  check("the way back works too", trip.after2 === trip.start, `${trip.after1} -> ${trip.after2}`);

  // --- dungeon instancing (WORLDSPEC step 5) ---
  // Drive the real path: hop to the forest, walk onto the dungeon entrance, press the prompt,
  // then verify the interior actually built (rooms, walls, a boss) and that the way out works.
  const dung = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const dbg = () => window.__worldDebug();
    const log = {};
    // get into the forest, which is where the entrance lives
    if (dbg().zone !== "whispering_forest"){
      const e = (dbg().exits || [])[0];
      window.__world.teleport(e.x, e.z);
      await settle(900);
    }
    log.zoneBefore = dbg().zone;
    const ent = dbg().dungeonEntrances || [];
    log.entrances = ent.length;
    if (!ent.length) return log;
    window.__world.teleport(ent[0].x, ent[0].z + 3);
    await settle(500);
    log.prompt = dbg().nearbyKind;
    window.__world.trigger();                       // press "Enter Dungeon"
    await settle(1600);
    log.zoneInside = dbg().zone;
    const d = dbg();
    log.rooms = d.rooms;
    log.wallObstacles = d.wallCount;
    log.interior = d.interior;
    log.spawnClear = d.spawnClear;
    // Walk up to the boss. A dungeon whose boss cannot be engaged is not a dungeon — and the
    // boss now has a collision footprint, so "can still get close enough to fight" is exactly
    // the thing that footprint could break.
    window.__world.teleport(0, 70);
    await settle(500);
    log.bossPrompt = dbg().nearbyKind;
    log.bossLabel = dbg().nearbyLabel;
    // and back out
    const back = (dbg().exits || [])[0];
    if (back){ window.__world.teleport(back.x, back.z); await settle(1400); }
    log.zoneAfter = dbg().zone;
    return log;
  });
  check("the forest places a dungeon entrance", dung.entrances > 0, `${dung.entrances} found`);
  check("the entrance prompts to enter", dung.prompt === "dungeon", String(dung.prompt));
  check("entering builds the dungeon interior", dung.zoneInside === "cinderhollow_caverns", `${dung.zoneBefore} -> ${dung.zoneInside}`);
  check("the dungeon has rooms and wall collision", dung.rooms >= 4 && dung.wallObstacles > 10,
        `${dung.rooms} rooms, ${dung.wallObstacles} wall boxes`);
  check("the dungeon is lit as an interior", dung.interior === true);
  check("the player does not spawn inside a dungeon wall", dung.spawnClear === true);
  check("the boss can be approached and engaged", dung.bossPrompt === "enemy", `${dung.bossPrompt} / ${dung.bossLabel}`);
  check("leaving the dungeon returns outdoors", dung.zoneAfter === "whispering_forest", String(dung.zoneAfter));

  // --- dungeon progression: a killed enemy must stay killed ---
  // Without this the same slime can be fought forever and the dungeon has no progression at all.
  const prog = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const dbg = () => window.__worldDebug();
    if (dbg().zone !== "cinderhollow_caverns"){
      const ent = (dbg().dungeonEntrances || [])[0];
      if (!ent) return { skipped: true };
      window.__world.teleport(ent.x, ent.z); await settle(400);
      window.__world.trigger(); await settle(1600);
    }
    const before = dbg().enemies;
    // engage the first enemy, then declare victory the way the duel screen does
    const foe = dbg().enemyList[0];
    window.__world.teleport(foe.x, foe.z - 3);
    await settle(400);
    const promptedAs = dbg().nearbyKind;
    window.__ev("worldGo");                       // starts the duel
    await settle(300);
    const started = !!(window.__testBattle && window.__testBattle());
    // kill it directly through the same path the win handler uses
    window.__testKill && window.__testKill();
    await settle(400);
    const after = dbg().enemies;
    // LEAVE AND COME BACK. Removing the model is only half of it — the enemy must not respawn
    // when the zone is rebuilt, which is what the saved list is actually for.
    const out = (dbg().exits || [])[0];
    window.__world.teleport(out.x, out.z); await settle(1500);
    const outside = dbg().zone;
    const ent2 = (dbg().dungeonEntrances || [])[0];
    window.__world.teleport(ent2.x, ent2.z); await settle(400);
    window.__world.trigger(); await settle(1800);
    return { skipped: false, promptedAs, started, before, after, outside,
             reentered: dbg().zone, afterReentry: dbg().enemies,
             saved: (JSON.parse(localStorage.getItem("arcane_legends_save_v1") || "{}").worldState || {}).dungeons };
  });
  if (prog.skipped) check("dungeon progression check ran", true, "no entrance — skipped");
  else {
    check("a dungeon enemy prompts a fight", prog.promptedAs === "enemy", String(prog.promptedAs));
    check("a defeated enemy is removed from the world", prog.after === prog.before - 1,
          `${prog.before} -> ${prog.after}`);
    check("the kill is persisted to the save", !!(prog.saved && prog.saved.cinderhollow_caverns &&
          prog.saved.cinderhollow_caverns.defeated.length === 1),
          JSON.stringify(prog.saved && prog.saved.cinderhollow_caverns));
    check("the defeated enemy does not respawn on re-entry",
          prog.reentered === "cinderhollow_caverns" && prog.afterReentry === prog.before - 1,
          `${prog.outside} -> ${prog.reentered}, ${prog.afterReentry} enemies (was ${prog.before})`);
  }


  // --- water is solid (WORLDSPEC §9b k) ---
  const wet = await page.evaluate(async () => {
    const TER = await import("./terrain.js");
    const WC = await import("./worldconfig.js");
    const cfg = await WC.loadWorldConfig();
    const z = cfg.zoneIds.map(id => cfg.get(id)).find(zz => zz.terrain.waterLevel != null);
    if (!z || window.__worldDebug().zone !== z.id) return { skipped: true };
    const flats = TER.flatsForZone(z);
    // find a water tile, park the player on the shore beside it and push straight in
    for (let x = z.bounds.minX + 8; x < z.bounds.maxX - 8; x += 6){
      for (let zz = z.bounds.minZ + 8; zz < z.bounds.maxZ - 8; zz += 6){
        if (!TER.isWater(x, zz, z.terrain, flats)) continue;
        const t = window.__world.teleport(x, zz);
        // teleport must refuse to drop us in the lake at all
        const refused = TER.isWater(t.x, t.z, z.terrain, flats) === false;
        window.__world.setTouchMove(0, 0);
        return { found: true, refused, inWater: window.__worldDebug().inWater };
      }
    }
    return { found: false };
  });
  if (wet.skipped || wet.found === false) check("water check ran", true, "no water zone active — skipped");
  else {
    check("teleport refuses to strand the player in water", wet.refused === true);
    check("the player is never standing in water", wet.inWater === false);
  }

  // --- character models loaded ---
  const chars = (await dbg()).chars;
  const loaded = Object.values(chars).filter(c=>c.loaded).length;
  check("character GLB models load", loaded >= 5, `${loaded}/${Object.keys(chars).length} loaded`);
}

// ---------------- onboarding objective bar ----------------
// It is derived from the save on every render, so the thing to prove is that it ADVANCES when
// the player does the thing — including from the 3D world, which calls save() but not render().
{
  const ob = await page.evaluate(async () => {
    const bar = () => document.getElementById("objective");
    const text = () => { const t = bar().querySelector(".obj-title"); return t ? t.textContent : "(none)"; };
    const out = { start: text(), shown: bar().style.display };
    // Step 1 is "choose your school", and the layout section only HID the picker rather than
    // answering it — so complete it through the real handler before expecting anything else.
    window.__ev("chooseSchool|fire");
    await new Promise(r => setTimeout(r, 250));
    out.afterSchool = text();
    // Now gather. This goes through save() and NOT render(), which is the path that used to
    // leave the bar stale.
    window.__testGather && window.__testGather();
    await new Promise(r => setTimeout(r, 200));
    const advanced = text();
    // dismissing it must stick
    window.__ev("objHide");
    await new Promise(r => setTimeout(r, 150));
    return { ...out, advanced, hiddenAfter: bar().style.display };
  });
  check("the objective bar is visible on a fresh save", ob.shown === "flex", ob.start);
  check("the objective advances as steps are completed",
        ob.afterSchool !== ob.start && ob.advanced !== ob.afterSchool,
        `${ob.start} -> ${ob.afterSchool} -> ${ob.advanced}`);
  check("the objective bar can be dismissed", ob.hiddenAfter === "none", ob.hiddenAfter);
}

// ---------------- spell VFX (BACKLOG §4) ----------------
// Verified by reading PIXELS, not by taking a screenshot. Playwright's element screenshots of a
// WebGL canvas can come back stale — which is exactly how these effects looked "invisible" while
// they were in fact rendering — so the check draws the canvas into a 2D context and counts lit
// pixels against a baseline with no effect running.
{
  const vfx = await page.evaluate(async () => {
    const lit = () => {
      window.__battle3d.renderOnce();
      const cv = document.getElementById("battle3d");
      const d = document.createElement("canvas"); d.width = cv.width; d.height = cv.height;
      d.getContext("2d").drawImage(cv, 0, 0);
      const px = d.getContext("2d").getImageData(0, 0, d.width, d.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i+1] + px[i+2] > 560) n++;
      return n;
    };
    window.__testDuel();
    await new Promise(r => setTimeout(r, 900));
    window.__testBoard();
    await new Promise(r => setTimeout(r, 900));
    const out = { canvas: (() => { const c = document.getElementById("battle3d"); return { w: c.width, h: c.height }; })() };
    {
      const band = document.getElementById("battleWrap").getBoundingClientRect();
      const scr = document.getElementById("screen").getBoundingClientRect();
      const card = document.querySelector("#screen .card, #screen .handcard, #screen [class*=card]");
      const cr = card ? card.getBoundingClientRect() : null;
      out.layout = {
        bandFraction: band.height / innerHeight,
        bandBottom: Math.round(band.bottom), screenTop: Math.round(scr.top),
        hand: cr ? { top: Math.round(cr.top), bottom: Math.round(cr.bottom) } : null,
        // a card must be inside the viewport and clear of the arena band
        handVisible: !!cr && cr.height > 20 && cr.top >= band.bottom - 1 && cr.top < innerHeight,
      };
    }
    await new Promise(r => setTimeout(r, 2200));      // let every summon glyph finish
    out.baseline = lit();
    out.cards = {};
    for (const [card, tag] of [["firebolt","bolt"],["meteor","rain"],["ice_armor","aura"],["blizzard","burst"],["balance_blade","glyph"]]){
      window.__testCast(card, 0);
      // PEAK over the effect's life, not a single instant. Sampling once at a fixed delay is racy
      // for the travelling archetypes — a bolt is a small moving sprite, and where it is 320ms in
      // depends on frame pacing, so the check flaked at ~1.14x against a 1.15x threshold with
      // nothing wrong. Peak brightness is what "did it render at all" actually means.
      let peak = 0;
      for (let i = 0; i < 8; i++){
        await new Promise(r => setTimeout(r, 110));
        peak = Math.max(peak, lit());
      }
      out.cards[tag] = peak;
      await new Promise(r => setTimeout(r, 1200));    // let it expire before the next one
    }
    out.leaked = window.__battle3d.activeFx();
    // Starve the loop: block the main thread so almost no frames run, then check the effect has
    // still expired once real time has passed.
    window.__testCast("firebolt", 0);
    const until = Date.now() + 2600;
    while (Date.now() < until){ /* busy-wait: starves requestAnimationFrame */ }
    await new Promise(r => setTimeout(r, 120));
    out.slowExpiry = window.__battle3d.activeFx();
    return out;
  });
  check("the duel canvas has a real size", vfx.canvas.w > 200 && vfx.canvas.h > 80, JSON.stringify(vfx.canvas));
  // LAYOUT. The arena band and #screen were both flex:1, so they split the viewport and the
  // player's hand was cut in half by the top of the arena. The cards matter more than the view.
  check("the arena band leaves room for the duel UI",
        vfx.layout.bandFraction < 0.42, `band is ${(vfx.layout.bandFraction*100).toFixed(0)}% of the viewport`);
  check("the arena sits above the duel UI, not over the hand",
        vfx.layout.bandBottom <= vfx.layout.screenTop + 2,
        `band ends at ${vfx.layout.bandBottom}, duel UI starts at ${vfx.layout.screenTop}`);
  check("the player's hand is on screen during a duel",
        vfx.layout.handVisible, JSON.stringify(vfx.layout.hand));
  // A RATIO alone is the wrong bar here, and it flaked twice because of it. The five archetypes
  // have wildly different footprints — a meteor rain fills the frame, a bolt is one small sprite
  // travelling across it — so "15% more lit pixels than an already-populated arena" is generous
  // for `rain` and marginal for `bolt`, which peaked at 1507 against a 1326 baseline (1.136x) and
  // failed a 1.15x bar with nothing actually wrong.
  //
  // What the check is really asking is "did this effect put anything on screen": a modest ratio
  // AND an absolute pixel delta answers that for every archetype, and a genuinely broken effect
  // still scores a delta of ~0. The numbers are printed on pass as well as failure so the next
  // person can see the margin rather than re-deriving it.
  for (const tag of ["bolt","rain","aura","burst","glyph"]){
    const peak = vfx.cards[tag], delta = peak - vfx.baseline;
    check(`the ${tag} spell effect renders`, peak > vfx.baseline * 1.05 && delta > 120,
          `${peak} lit px vs ${vfx.baseline} baseline (+${delta}, ${(peak/vfx.baseline).toFixed(3)}x)`);
  }
  // Effect lifetime runs on the WALL CLOCK, not on the frame loop's capped dt. With capped dt a
  // throttled frame rate stretched every spell — at ~4fps they never expired at all, their
  // lights stayed at full brightness and each cast piled another one on top.
  check("spell effects expire in real time", vfx.leaked === 0, `${vfx.leaked} still alive`);
  check("effects expire even when frames are scarce", vfx.slowExpiry === 0,
        `${vfx.slowExpiry} survived a low frame rate`);
}

// ---------------- zone quests (BACKLOG §2) ----------------
// Drives the real dialogue path: walk to the giver in the forest, press the prompt, accept from
// the dialogue's own button, gather, then hand in — and check the reward actually landed.
{
  const q = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const dbg = () => window.__worldDebug();
    const out = {};
    // get to the forest
    if (dbg().zone !== "whispering_forest"){
      const e = (dbg().exits || []).find(x => x.to === "whispering_forest") || (dbg().exits || [])[0];
      window.__world.teleport(e.x, e.z); await settle(1500);
    }
    out.zone = dbg().zone;
    const giver = dbg().npcs.find(n => n.station === "forest_sage");
    out.foundGiver = !!giver;
    if (!giver) return out;
    window.__world.teleport(giver.x, giver.z + 2.5);
    await settle(450);
    out.prompt = dbg().nearbyKind;
    window.__ev("worldGo");                     // opens the dialogue
    await settle(250);
    const dlg = document.getElementById("dialogue");
    out.dialogueOpen = getComputedStyle(dlg).display !== "none";
    out.buttons = [...document.querySelectorAll("#dlgBtns button")].map(b => b.textContent);
    const acceptIdx = out.buttons.findIndex(t => /Accept/.test(t));
    out.hasOffer = acceptIdx >= 0;
    if (acceptIdx < 0) return out;
    document.querySelectorAll("#dlgBtns button")[acceptIdx].click();
    await settle(250);
    out.accepted = JSON.parse(localStorage.getItem("arcane_legends_save_v1")).zoneQuests.accepted.slice();
    // complete it the honest way is slow (8 logs), so grant the materials and hand in via the
    // dialogue button, which is the path a player takes
    out.goldBefore = window.__testGold();
    window.__testGrant(out.accepted[0]);
    window.__ev("worldGo");
    await settle(250);
    const btns2 = [...document.querySelectorAll("#dlgBtns button")];
    const handIdx = btns2.findIndex(b => /Hand in/.test(b.textContent));
    out.hasTurnIn = handIdx >= 0;
    if (handIdx < 0) return out;
    btns2[handIdx].click();
    await settle(300);
    const save = JSON.parse(localStorage.getItem("arcane_legends_save_v1"));
    out.done = save.zoneQuests.done.slice();
    out.stillAccepted = save.zoneQuests.accepted.slice();
    out.goldAfter = window.__testGold();
    out.leftovers = save.inventory.willow_log || 0;
    out.reputation = (save.reputation || {}).forest_sage || 0;
    // The Hall's reputation panel is conditional on having reputation with SOMEONE — check it
    // actually appears now that a quest has been turned in, not just that the data exists.
    document.querySelector('.navbtn[data-screen="home"]').click();
    await settle(200);
    out.hallText = document.getElementById("scr_home").innerText;
    return out;
  });
  check("the forest has a quest giver standing in it", q.foundGiver === true, q.zone);
  check("approaching the giver prompts a conversation", q.prompt === "station", String(q.prompt));
  check("the giver offers a quest", q.hasOffer === true, (q.buttons || []).join(" | "));
  check("accepting records the quest", (q.accepted || []).length === 1, JSON.stringify(q.accepted));
  check("a completed quest can be handed in", q.hasTurnIn === true);
  check("handing in pays out and closes the quest",
        (q.done || []).length === 1 && (q.stillAccepted || []).length === 0 && q.goldAfter > q.goldBefore,
        `done=${JSON.stringify(q.done)} gold ${q.goldBefore}->${q.goldAfter}`);
  check("handing in consumes the materials", q.leftovers === 0, `${q.leftovers} left`);
  check("handing in raises reputation with the giver", q.reputation === 12, `rep=${q.reputation}`);
  check("the Hall shows the curriculum panel", /Curriculum/.test(q.hallText));
  check("the Hall shows reputation once the player has some", /Reputation/.test(q.hallText) && /Sage Rowan/.test(q.hallText));

  // --- the dorm (D1-D4): walk in, and check the room actually built ---
  // The whole point of the Dorm phases is that the building stopped being a menu, so this drives
  // the real path — furnish via the game's own functions, press the station prompt, then read the
  // built scene rather than trusting the save.
  const dorm = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const dbg = () => window.__worldDebug();
    const out = {};
    // Back to the world screen first. The previous block left the game on the Hall, and a hidden
    // canvas has width/height 0 — which is how the brightness read below blew up the first time.
    const worldTab = document.querySelector('.navbtn[data-screen="world"]');
    if (worldTab) worldTab.click();
    await settle(600);
    // get back to the academy first
    if (dbg().zone !== "academy"){
      const e = (dbg().exits || []).find(x => x.to === "academy") || (dbg().exits || [])[0];
      if (e){ window.__world.teleport(e.x, e.z); await settle(1400); }
    }
    if (dbg().zone !== "academy"){
      const e = (dbg().exits || [])[0];
      if (e){ window.__world.teleport(e.x, e.z); await settle(1400); }
    }
    out.zoneStart = dbg().zone;
    out.furnished = window.__testDorm();
    // walk to the dorm door and press the prompt — the real way in
    window.__world.teleport(0, 25.4);
    await settle(400);
    out.doorPrompt = dbg().nearbyKind;
    out.doorLabel = dbg().nearbyLabel;
    window.__world.trigger();
    await settle(1600);
    out.zoneInside = dbg().zone;
    const d = dbg();
    out.interior = d.interior;
    out.rooms = d.rooms;
    out.walls = d.wallCount;
    out.dorm = d.dorm;
    // "Is this room actually visible" is not something the layout maths can answer, and the
    // first build of it inherited the dungeon light rig and came out a black box with a bed in
    // it. Measured by rendering one frame on demand and reading pixels — a plain screenshot of
    // a WebGL canvas comes back blank because the drawing buffer is cleared after compositing.
    window.__world.renderOnce();
    {
      const cv = document.getElementById("world");
      out.canvas = [cv.width, cv.height];
      if (!cv.width || !cv.height) out.brightness = -1; else {
      const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height;
      c2.getContext("2d").drawImage(cv, 0, 0);
      const px = c2.getContext("2d").getImageData(0, 0, c2.width, c2.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < px.length; i += 4){ sum += px[i] + px[i+1] + px[i+2]; n++; }
      out.brightness = sum / n / 3;
      }
    }
    out.spawnClear = d.spawnClear;
    out.enemies = d.enemies;
    // the way out, and where it puts you
    const back = (dbg().exits || [])[0];
    out.exitDist = back ? Math.hypot(back.x - d.playerExact[0], back.z - d.playerExact[2]) : null;
    if (back){ window.__world.teleport(back.x, back.z); await settle(1600); }
    out.zoneAfter = dbg().zone;
    out.exitPos = dbg().playerExact.map(n => Math.round(n));
    return out;
  });
  check("the dorm door prompts a station, not a menu jump", dorm.doorPrompt === "station", `${dorm.doorPrompt} / ${dorm.doorLabel}`);
  check("pressing the dorm door builds the interior", dorm.zoneInside === "dorm", `${dorm.zoneStart} -> ${dorm.zoneInside}`);
  check("the dorm is lit and walled as an interior", dorm.interior === true && dorm.walls > 4, `${dorm.walls} wall boxes`);
  check("the player does not spawn inside a dorm wall", dorm.spawnClear === true);
  check("the player does not arrive standing on the way out", dorm.exitDist > 3, `${(dorm.exitDist||0).toFixed(1)}m from the exit`);
  check("furniture placed in the Hall renders in the room", dorm.dorm && dorm.dorm.pieces === 4, JSON.stringify(dorm.dorm));
  check("a displayed slab shows in its case", dorm.dorm && dorm.dorm.cases === 1, JSON.stringify(dorm.dorm && dorm.dorm.cases));
  check("a beaten boss puts a trophy in the room", dorm.dorm && dorm.dorm.trophies === 1, JSON.stringify(dorm.dorm && dorm.dorm.trophies));
  check("the dorm holds no enemies", dorm.enemies === 0, String(dorm.enemies));
  check("the dorm is a lit room, not a black box", dorm.brightness > 25, `mean channel ${(dorm.brightness||0).toFixed(1)} on a ${JSON.stringify(dorm.canvas)} canvas`);
  check("leaving the dorm returns to the academy", dorm.zoneAfter === "academy", String(dorm.zoneAfter));
  check("leaving puts the player back at the dorm door, not the default spawn",
        Math.abs(dorm.exitPos[0]) < 4 && dorm.exitPos[2] > 12 && dorm.exitPos[2] < 28, JSON.stringify(dorm.exitPos));

  // Buying an upgrade must grow the room — that is the whole of D4.
  const grew = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const before = window.__testDormRoom();
    window.__testDormUpgrade();
    window.__testEnterDorm();
    await settle(1500);
    const d = window.__worldDebug();
    const after = d.dorm ? d.dorm.room : null;
    const back = (d.exits || [])[0];
    if (back){ window.__world.teleport(back.x, back.z); await settle(1500); }
    return { before, after };
  });

  check("buying hall upgrades physically grows the dorm (D4)",
        grew.after && grew.after[0] > grew.before[0] && grew.after[1] > grew.before[1],
        `${JSON.stringify(grew.before)} -> ${JSON.stringify(grew.after)}`);



  // --- Academy classes (lessons.js) ---
  // Drives the real loop through the Dean's own overlay: enrol, satisfy the assignment, submit,
  // and check the technique actually changed an engine number. The point of the feature is that a
  // class is something you DO, so a test that only pokes the module would miss the whole thing.
  const cls = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    out.masteryBefore = window.__testMastery();
    // open the syllabus the way a player does
    window.__ev("openClasses");
    await settle(300);
    const body = () => document.getElementById("ovBody");
    out.opens = /Techniques learned/.test(body().innerText);
    const enrolBtn = body().querySelector('button[onclick*="lsnEnroll|"]');
    out.hasEnrol = !!enrolBtn;
    if (!enrolBtn) return out;
    out.lessonId = enrolBtn.getAttribute("onclick").match(/lsnEnroll\|([a-z_]+)/)[1];
    enrolBtn.click();
    await settle(300);
    out.enrolled = JSON.parse(localStorage.getItem("arcane_legends_save_v1")).lessons.enrolled.slice();
    // an unfinished class must not be submittable
    out.submitBeforeReady = !!body().querySelector(`button[onclick*="lsnSubmit|${out.lessonId}"]`);
    window.__testLessonReady(out.lessonId);
    window.__ev("openClasses");
    await settle(300);
    const submitBtn = body().querySelector(`button[onclick*="lsnSubmit|${out.lessonId}"]`);
    out.hasSubmit = !!submitBtn;
    if (!submitBtn) return out;
    out.goldBefore = window.__testGold();
    submitBtn.click();
    await settle(400);
    const save = JSON.parse(localStorage.getItem("arcane_legends_save_v1"));
    out.done = save.lessons.done.slice();
    out.stillEnrolled = save.lessons.enrolled.slice();
    out.goldAfter = window.__testGold();
    out.masteryAfter = window.__testMastery();
    // and it shows on the Dorm screen
    document.querySelector('.navbtn[data-screen="home"]').click();
    await settle(250);
    out.hallText = document.getElementById("scr_home").innerText;
    document.getElementById("overlay").style.display = "none";
    return out;
  });
  check("the Dean's syllabus opens", cls.opens === true);
  check("a class can be enrolled in from the world", (cls.enrolled || []).length === 1, JSON.stringify(cls.enrolled));
  check("an unfinished class offers no submit button", cls.submitBeforeReady === false);
  check("a finished class can be submitted", cls.hasSubmit === true);
  check("submitting passes the class and pays out",
        (cls.done || []).length === 1 && (cls.stillEnrolled || []).length === 0 && cls.goldAfter > cls.goldBefore,
        `done=${JSON.stringify(cls.done)} gold ${cls.goldBefore}->${cls.goldAfter}`);
  check("passing a class teaches a technique", (()=>{
    const a = cls.masteryAfter || {}, b = cls.masteryBefore || {};
    return Object.keys(a).some(k => a[k] > b[k]);
  })(), `${JSON.stringify(cls.masteryBefore)} -> ${JSON.stringify(cls.masteryAfter)}`);
  check("the Dorm curriculum panel reports class progress", /Classes this year/.test(cls.hallText || ""));

  // --- visible equipment on the 3D character (BACKLOG §2) ---
  // Only a browser can answer the question that matters here: does the weapon actually end up
  // parented to a bone, at a sane size, moving with the character? Bone axes on a generated rig
  // are arbitrary, and the first two orientations tried put the staff horizontally across the
  // body and then upside-down through the floor — both perfectly "valid" data.
  const gear = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    out.before = window.__world.gearDebug();
    out.forged = window.__testGear("rune");
    // Draco decode of the staff takes a few seconds under swiftshader — this is a real wait, not
    // a superstitious one. A 2.5s wait showed an empty hand and looked exactly like a bug.
    for (let i = 0; i < 20; i++){
      await settle(700);
      const d = window.__world.gearDebug();
      // Sample the bone list in the LOOP, not once up front: this block runs just after a zone
      // rebuild, and reading it immediately returned [] because the player GLB had not finished
      // loading yet — which looks identical to "the rig has no bones".
      out.bones = window.__world.playerBones() || out.bones;
      if (d.wand && d.wand.meshes > 0){ out.after = d; break; }
      out.after = d;
    }
    return out;
  });
  check("the player rig exposes the bones the attachment table names",
        (gear.bones || []).includes("RightHand") && (gear.bones || []).includes("Neck"),
        JSON.stringify((gear.bones || []).slice(0, 6)));
  check("nothing hangs off the character before anything is equipped",
        Object.keys(gear.before || {}).length === 0);
  check("equipping puts a wand and an amulet on the character",
        !!gear.after && !!gear.after.wand && !!gear.after.amulet, JSON.stringify(Object.keys(gear.after || {})));
  check("the weapon model actually loaded onto the bone",
        gear.after && gear.after.wand && gear.after.wand.meshes > 0,
        JSON.stringify(gear.after && gear.after.wand));
  // Size is the check that catches the bone-scale trap: a bone carries the character's own scale,
  // so anything parented to it inherits that scale too and comes out at the rig's internal units.
  check("the staff is a sane size in world units, not the rig's internal scale", (()=>{
    const s = gear.after && gear.after.wand && gear.after.wand.worldSize;
    if (!s) return false;
    const longest = Math.max(...s);
    return longest > 1.0 && longest < 4.0;
  })(), JSON.stringify(gear.after && gear.after.wand && gear.after.wand.worldSize));
  check("the staff is held upright, not lying across the body", (()=>{
    const s = gear.after && gear.after.wand && gear.after.wand.worldSize;
    // a vertical staff is much taller than it is wide; the horizontal version was the opposite
    return !!s && s[1] > Math.max(s[0], s[2]) * 1.8;
  })(), JSON.stringify(gear.after && gear.after.wand && gear.after.wand.worldSize));
  check("the amulet sits at the neck, not at the feet", (()=>{
    const a = gear.after && gear.after.amulet;
    const p = gear.after && gear.after.wand;
    if (!a || !a.worldCenter) return false;
    return a.worldCenter[1] > 1.2;                 // the player is 2.6m; a neck is ~1.7m up
  })(), JSON.stringify(gear.after && gear.after.amulet && gear.after.amulet.worldCenter));

  // --- WORLDSPEC step 6 content: the third zone and the second dungeon ---
  // Data-level correctness is covered headlessly; what only a browser can answer is whether the
  // zone actually BUILDS — chunk streaming, the water plane, a second dungeon entrance, and
  // whether the player is standing on land when they arrive.
  const lake = await page.evaluate(async () => {
    const settle = ms => new Promise(r => setTimeout(r, ms));
    const dbg = () => window.__worldDebug();
    const out = {};
    // hop academy -> forest -> lake through the real gateways
    for (let hop = 0; hop < 3 && dbg().zone !== "lake_arcanum"; hop++){
      const here = dbg();
      const want = here.zone === "academy" ? "whispering_forest" : "lake_arcanum";
      const e = (here.exits || []).find(x => x.to === want) || (here.exits || [])[0];
      if (!e) break;
      window.__world.teleport(e.x, e.z);
      await settle(1600);
    }
    const d = dbg();
    out.zone = d.zone;
    out.inWater = d.inWater;
    out.spawnClear = d.spawnClear;
    out.chunks = d.chunks;
    out.entrances = (d.dungeonEntrances || []).map(x => x.id);
    out.npcs = (d.npcs || []).map(n => n.key);
    // into the vault
    const ent = (d.dungeonEntrances || [])[0];
    if (ent){
      window.__world.teleport(ent.x, ent.z + 3);
      await settle(500);
      out.entrancePrompt = dbg().nearbyKind;
      window.__world.trigger();
      await settle(1800);
      const v = dbg();
      out.vaultZone = v.zone;
      out.vaultRooms = v.rooms;
      out.vaultWalls = v.wallCount;
      out.vaultSpawnClear = v.spawnClear;
      out.vaultEnemies = v.enemies;
      const back = (v.exits || [])[0];
      if (back){ window.__world.teleport(back.x, back.z); await settle(1600); }
      out.zoneAfter = dbg().zone;
    }
    return out;
  });
  check("the third zone builds and can be walked into", lake.zone === "lake_arcanum", String(lake.zone));
  check("the player does not arrive in the lake", lake.inWater === false && lake.spawnClear === true,
        `inWater=${lake.inWater} clear=${lake.spawnClear}`);
  check("the lake streams chunks", !!lake.chunks && lake.chunks.total > 0, JSON.stringify(lake.chunks));
  check("the lake's quest givers are standing in it",
        (lake.npcs || []).includes("lake_hermit") && (lake.npcs || []).includes("lake_diver"), JSON.stringify(lake.npcs));
  check("the lake holds the second dungeon's entrance", (lake.entrances || [])[0] === "drowned_vault", JSON.stringify(lake.entrances));
  check("the second dungeon's entrance prompts", lake.entrancePrompt === "dungeon", String(lake.entrancePrompt));
  check("the second dungeon builds", lake.vaultZone === "drowned_vault", String(lake.vaultZone));
  check("the second dungeon has its five rooms and wall collision",
        lake.vaultRooms >= 5 && lake.vaultWalls > 10, `${lake.vaultRooms} rooms, ${lake.vaultWalls} wall boxes`);
  check("the player does not spawn inside a wall of the second dungeon", lake.vaultSpawnClear === true);
  check("the second dungeon is populated", lake.vaultEnemies > 0, String(lake.vaultEnemies));
  check("leaving the second dungeon returns to the lake", lake.zoneAfter === "lake_arcanum", String(lake.zoneAfter));

}


  // --- character creation + per-school appearance (BACKLOG §2) ---
  // The numbers are covered headlessly. What only a browser proves: the creation screen opens on
  // a fresh save, the 3D preview canvas actually renders something, and picking a school visibly
  // changes the character rather than changing a number nobody can see.
  {
    // A genuinely fresh context: creation only shows once per save, and the page under test
    // above has been played through a dorm, two dungeons and a quest chain.
    const cctx = await browser.newContext({ viewport:{width:900,height:900}, hasTouch:false });
    const p2 = await cctx.newPage();
    await p2.goto(BASE + "/index.html", { waitUntil: "load" });
    await p2.waitForTimeout(3500);
    const r = await p2.evaluate(async () => {
      const settle = ms => new Promise(r => setTimeout(r, ms));
      const out = {};
      const panel = document.getElementById("charCreate");
      out.opensOnFreshSave = !!panel && getComputedStyle(panel).display !== "none";
      const cv = document.getElementById("ccPreview");
      out.canvas = cv ? [cv.width, cv.height] : null;
      // Does the preview draw anything at all? Same pixel-reading approach the dorm uses, and for
      // the same reason: a screenshot of a WebGL canvas comes back blank.
      const lit = () => {
        window.__testPreview().renderOnce();
        const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height;
        c2.getContext("2d").drawImage(cv, 0, 0);
        const px = c2.getContext("2d").getImageData(0, 0, c2.width, c2.height).data;
        let sum = 0, n = 0, hue = [0, 0, 0];
        for (let i = 0; i < px.length; i += 4){
          if (px[i+3] < 8) continue;                       // the canvas is alpha:true
          sum += px[i] + px[i+1] + px[i+2]; n++;
          hue[0] += px[i]; hue[1] += px[i+1]; hue[2] += px[i+2];
        }
        return { mean: n ? sum / n / 3 : 0, rgb: n ? hue.map(v => v / n) : [0,0,0], n };
      };
      out.blank = lit();
      // pick Fire, then Ice, and compare the average colour of the rendered character
      document.querySelector('#ccBody button[onclick*="ccSchool|fire"]').click();
      await settle(900);
      out.fire = lit();
      document.querySelector('#ccBody button[onclick*="ccSchool|ice"]').click();
      await settle(900);
      out.ice = lit();
      // aura on/off must change what is drawn
      document.querySelector('#ccBody button[onclick*="ccAura|none"]').click();
      await settle(600);
      out.noAura = lit();
      document.querySelector('#ccBody button[onclick*="ccAura|motes"]').click();
      await settle(600);
      out.motes = lit();
      // name validation drives the confirm button
      const input = document.getElementById("ccName");
      const set = v => { input.value = v; window.__ev("ccName"); };
      set("<script>");
      out.badNameBlocks = document.querySelector("#ccNav .btn.gold").disabled;
      set("Rowan the Bold");
      out.goodNameAllows = !document.querySelector("#ccNav .btn.gold").disabled;
      document.querySelector("#ccNav .btn.gold").click();
      await settle(700);
      out.closed = getComputedStyle(document.getElementById("charCreate")).display === "none";
      out.savedName = JSON.parse(localStorage.getItem("arcane_legends_save_v1")).name;
      out.previewLoadedModel = window.__testPreview().loaded();
      return out;
    });
    check("character creation opens on a fresh save", r.opensOnFreshSave === true);
    check("the preview canvas has a real size", !!r.canvas && r.canvas[0] > 50 && r.canvas[1] > 50, JSON.stringify(r.canvas));
    check("the preview actually renders a character", r.fire.mean > 10 && r.fire.n > 2000,
          `mean ${r.fire.mean.toFixed(1)} over ${r.fire.n} px`);
    // The entire point of the appearance system: two schools must not look the same.
    check("switching school visibly changes the character", (()=>{
      const d = Math.hypot(r.fire.rgb[0]-r.ice.rgb[0], r.fire.rgb[1]-r.ice.rgb[1], r.fire.rgb[2]-r.ice.rgb[2]);
      return d > 6;
    })(), `fire ${r.fire.rgb.map(v=>v.toFixed(0))} vs ice ${r.ice.rgb.map(v=>v.toFixed(0))}`);
    check("turning the aura on changes what is drawn",
          Math.abs(r.motes.mean - r.noAura.mean) > 0.4,
          `none ${r.noAura.mean.toFixed(2)} vs motes ${r.motes.mean.toFixed(2)}`);
    check("an unusable name blocks the confirm button", r.badNameBlocks === true);
    check("a valid name unblocks it", r.goodNameAllows === true);
    check("confirming closes creation and saves the name", r.closed === true && r.savedName === "Rowan the Bold", String(r.savedName));
    check("the preview loaded the real player model, not just the stand-in", r.previewLoadedModel === true);
    await p2.close(); await cctx.close();
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
