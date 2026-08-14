#!/usr/bin/env node
/**
 * paint-texture.mjs — generate a hand-painted-style texture, procedurally, for any base palette.
 *
 * Generalized from the art-direction pilot's paint-wood-texture.mjs once the pilot's scope
 * widened past "one wooden prop" to the rest of the asset library (docs/ART-DIRECTION.md §6.2
 * sign-off: "widen scope now"). Two modes:
 *
 *   FROM-SCRATCH (default): paints a whole new texture from a base colour + palettes. Right for
 *   replacing a texture whose STYLE is wrong at the root — a baked photo-real bake (the pilot's
 *   fishing stand) — where painting on top would still read as "photo with brushstrokes over it".
 *
 *   OVERLAY (--input <path>): loads an EXISTING texture and paints variation ON TOP of it using
 *   relative blend modes (soft-light/multiply/overlay) instead of fixed hex colours, so whatever
 *   colour a pixel already is stays that colour, just gains paint texture. Required for any asset
 *   built from a shared colour-swatch atlas — a building whose roof/walls/trim/chimney are one
 *   mesh, one material, differentiated ONLY by which swatch cell each face's UV samples. A
 *   from-scratch texture has no idea that layout exists and collapses every part to one tone;
 *   painting relative to the existing pixel preserves it. Discovered by testing hex_home_A during
 *   this pass — see the region-aware repaint decision in git history for the full story.
 *
 * Either way: no image-gen credits spent, no network dependency, fully reproducible, and (being a
 * Canvas2D script) needs a real 2D canvas context, which this repo has no Node package for — runs
 * inside a headless Chromium page via Playwright rather than node-canvas/skia.
 *
 * Style rules from docs/ART-DIRECTION.md §4.1/§4.2, followed in both modes:
 *   - warm/cool CONTRAST, not one flat tone
 *   - visible brushwork, not a flat swatch
 *   - scattered colour variation, not a single sweep — a sweep reads as baked lighting
 *   - no baked AO/shadow gradient
 *
 * Usage:
 *   node tools/paint-texture.mjs <out.png> --base <hex> --warm <hex,hex,...> --cool <hex,hex,...>
 *     [--size 512] [--seed 20260814] [--grain true|false]
 *   node tools/paint-texture.mjs <out.png> --input <existing.png> [--size 512] [--seed N]
 *
 * Example (stone building, from scratch — only right for a single-material, single-tone asset):
 *   node tools/paint-texture.mjs out.png --base "#8a8a92" \
 *     --warm "#a89a7e,#c9b896,#8a8a92,#9a9aa0" --cool "#5a5a68,#4a4a5a" --grain false
 *
 * Example (region-aware, for a multi-part swatch-atlas asset):
 *   node tools/extract-model-texture.mjs hex_home_A.glb /tmp/src.png
 *   node tools/paint-texture.mjs out.png --input /tmp/src.png
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith("--"));
const flag = (name, def) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? def : args[i + 1];
};
const out = positional[0] || "painted.png";
const size = Number(flag("size", 512));
const seed = Number(flag("seed", 20260814));
const base = flag("base", "#8a5a34");
const warm = flag("warm", "#c98f4e,#e8c68a,#a5723f,#d9a35c,#7a4f2a,#f0d9a8").split(",");
const cool = flag("cool", "#4a3a6a,#3a2f56,#5a4a7a").split(",");
const grain = flag("grain", "true") !== "false";
const inputPath = flag("input", null);
const inputB64 = inputPath ? fs.readFileSync(inputPath).toString("base64") : null;
const inputMime = inputPath && inputPath.endsWith(".webp") ? "image/webp" : "image/png";

function chromiumPath(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter(d => d.startsWith("chromium-")).sort().reverse();
  for (const d of dirs){ const exe = path.join(root, d, "chrome-linux", "chrome"); if (fs.existsSync(exe)) return exe; }
  return undefined;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: size, height: size } });

const dataUrl = await page.evaluate(async ({ size, seed, base, warm, cool, grain, inputB64, inputMime }) => {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const x = c.getContext("2d");

  const overlayMode = !!inputB64;
  if (overlayMode){
    const img = new Image();
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    img.src = `data:${inputMime};base64,${inputB64}`;
    await loaded;
    x.drawImage(img, 0, 0, size, size);
  } else {
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
  }

  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const S = size / 512;

  // In overlay mode every colour below is applied via a relative blend mode (soft-light/multiply)
  // instead of the fixed warm/cool hex palettes — a hardcoded colour would still overwrite
  // whatever's underneath and defeat the entire point of this mode. warmTint/coolTint stay as
  // single anchor colours (not per-blob random picks) so the warm push and the cool push each
  // read as one consistent lean across the whole texture, not a hue lottery per blob.
  const warmTint = "#e8a33d", coolTint = "#4a3a6a";

  if (grain){
    for (let i = 0; i < 34; i++){
      const gx = rand() * size;
      const lighter = rand() > 0.5;
      const g = x.createLinearGradient(gx - 14*S, 0, gx + 14*S, 0);
      const a = overlayMode ? "22" : "33";
      const col = overlayMode ? (lighter ? "#ffffff" : "#000000") : (lighter ? warm[Math.floor(rand()*warm.length)] : cool[Math.floor(rand()*cool.length)]);
      g.addColorStop(0, col + "00"); g.addColorStop(0.5, col + a); g.addColorStop(1, col + "00");
      x.save();
      x.globalCompositeOperation = overlayMode ? "overlay" : "source-over";
      x.fillStyle = g;
      x.translate(gx, size/2);
      x.rotate((rand() - 0.5) * 0.35);
      x.fillRect(-14*S, -size*1.2, 28*S, size*2.4);
      x.restore();
    }
  }

  // warm pass: soft-light with a single warm anchor colour in overlay mode (leans every region
  // warmer without replacing its hue), or scattered warm-palette blobs from scratch
  for (let i = 0; i < 40; i++){
    const cx = rand() * size, cy = rand() * size, r = (18 + rand() * 48) * S;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (overlayMode){
      g.addColorStop(0, warmTint + "40"); g.addColorStop(1, warmTint + "00");
    } else {
      const col = warm[Math.floor(rand() * warm.length)];
      g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00");
    }
    x.save();
    x.globalCompositeOperation = overlayMode ? "soft-light" : "source-over";
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
    x.restore();
  }

  // cool shadow-accent pass: multiply with a single cool anchor colour in overlay mode
  for (let i = 0; i < 12; i++){
    const cx = rand() * size, cy = rand() * size, r = (16 + rand() * 36) * S;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (overlayMode){
      g.addColorStop(0, coolTint + "35"); g.addColorStop(1, coolTint + "00");
    } else {
      const col = cool[Math.floor(rand() * cool.length)];
      g.addColorStop(0, col + "55"); g.addColorStop(1, col + "00");
    }
    x.save();
    x.globalCompositeOperation = overlayMode ? "multiply" : "source-over";
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
    x.restore();
  }

  // brush strokes: alternating light/dark "dry brush" via overlay in overlay mode (reads as paint
  // texture on ANY underlying colour), warm-palette strokes from scratch
  for (let i = 0; i < 260; i++){
    const px = rand() * size, py = rand() * size;
    const len = (10 + rand() * 22) * S, ang = rand() * Math.PI * 2;
    x.save();
    if (overlayMode){
      x.globalCompositeOperation = "overlay";
      const lighter = rand() > 0.45;
      x.strokeStyle = (lighter ? "#ffffff" : "#000000") + Math.floor(50 + rand() * 50).toString(16).padStart(2, "0");
    } else {
      const col = warm[Math.floor(rand() * warm.length)];
      x.strokeStyle = col + Math.floor(70 + rand() * 60).toString(16).padStart(2, "0");
    }
    x.lineWidth = (1.5 + rand() * 2.5) * S;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(
      px + Math.cos(ang)*len*0.5 + (rand()-0.5)*8*S, py + Math.sin(ang)*len*0.5 + (rand()-0.5)*8*S,
      px + Math.cos(ang)*len, py + Math.sin(ang)*len
    );
    x.stroke();
    x.restore();
  }

  return c.toDataURL("image/png");
}, { size, seed, base, warm, cool, grain, inputB64, inputMime });

fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
console.log("wrote", out, `(${size}x${size})`, inputB64 ? "[overlay mode]" : "[from-scratch mode]");
await browser.close();
