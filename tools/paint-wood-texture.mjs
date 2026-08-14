#!/usr/bin/env node
/**
 * paint-wood-texture.mjs — generate a hand-painted-style wood texture, procedurally.
 *
 * One concrete answer to docs/ART-DIRECTION.md §7's open question ("hand-paint via image
 * generation vs. a human painting directly") — a third option: paint it with code. No image-gen
 * credits spent, no network dependency, fully reproducible, and (being a Canvas2D script) needs a
 * real 2D canvas context, which this repo has no Node package for — so it runs inside a headless
 * Chromium page via Playwright rather than node-canvas/skia.
 *
 * Deliberately UV-agnostic: a scattered, non-directional pattern (soft colour blobs + wood-grain
 * streaks + brush strokes) maps cleanly onto ANY UV unwrap without needing to know its layout,
 * unlike a precise decal. That's what makes this safe to bake onto an existing model (e.g. a
 * Tripo generation) sight-unseen — see repaint-model-texture.mjs.
 *
 * Style rules from docs/ART-DIRECTION.md §4.1/§4.2, all followed here:
 *   - warm base (gold/amber/cream/brown), cool violet-blue for shadow-side variation
 *   - visible brushwork, not a flat swatch
 *   - scattered colour variation, not a single sweep — a sweep reads as baked lighting
 *   - no baked AO/shadow gradient
 *
 * Usage:
 *   node tools/paint-wood-texture.mjs [out.png] [--size 512] [--seed 20260814]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith("--"));
const out = positional[0] || "painted_wood.png";
const size = Number(args[args.indexOf("--size") + 1]) || 512;
const seed = Number(args[args.indexOf("--seed") + 1]) || 20260814;

function chromiumPath(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter(d => d.startsWith("chromium-")).sort().reverse();
  for (const d of dirs){ const exe = path.join(root, d, "chrome-linux", "chrome"); if (fs.existsSync(exe)) return exe; }
  return undefined;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: size, height: size } });

const dataUrl = await page.evaluate(({ size, seed }) => {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const x = c.getContext("2d");
  x.fillStyle = "#8a5a34";
  x.fillRect(0, 0, size, size);

  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const S = size / 512;   // scale every constant below against the 512px reference design

  // wood grain: soft near-vertical streaks, alternating slightly darker/lighter
  for (let i = 0; i < 34; i++){
    const gx = rand() * size;
    const col = rand() > 0.5 ? "#c9925a" : "#6b4726";
    const g = x.createLinearGradient(gx - 14*S, 0, gx + 14*S, 0);
    g.addColorStop(0, col + "00"); g.addColorStop(0.5, col + "33"); g.addColorStop(1, col + "00");
    x.fillStyle = g;
    x.save();
    x.translate(gx, size/2);
    x.rotate((rand() - 0.5) * 0.35);
    x.fillRect(-14*S, -size*1.2, 28*S, size*2.4);
    x.restore();
  }

  const warm = ["#c98f4e", "#e8c68a", "#a5723f", "#d9a35c", "#7a4f2a", "#f0d9a8"];
  for (let i = 0; i < 40; i++){
    const cx = rand() * size, cy = rand() * size, r = (18 + rand() * 48) * S;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = warm[Math.floor(rand() * warm.length)];
    g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
  }

  const cool = ["#4a3a6a", "#3a2f56", "#5a4a7a"];
  for (let i = 0; i < 12; i++){
    const cx = rand() * size, cy = rand() * size, r = (16 + rand() * 36) * S;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = cool[Math.floor(rand() * cool.length)];
    g.addColorStop(0, col + "55"); g.addColorStop(1, col + "00");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill();
  }

  for (let i = 0; i < 260; i++){
    const px = rand() * size, py = rand() * size;
    const len = (10 + rand() * 22) * S, ang = rand() * Math.PI * 2;
    const col = warm[Math.floor(rand() * warm.length)];
    x.strokeStyle = col + Math.floor(70 + rand() * 60).toString(16).padStart(2, "0");
    x.lineWidth = (1.5 + rand() * 2.5) * S;
    x.lineCap = "round";
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(
      px + Math.cos(ang)*len*0.5 + (rand()-0.5)*8*S, py + Math.sin(ang)*len*0.5 + (rand()-0.5)*8*S,
      px + Math.cos(ang)*len, py + Math.sin(ang)*len
    );
    x.stroke();
  }

  return c.toDataURL("image/png");
}, { size, seed });

fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
console.log("wrote", out, `(${size}x${size})`);
await browser.close();
