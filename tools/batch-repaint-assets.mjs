#!/usr/bin/env node
/**
 * batch-repaint-assets.mjs — apply the region-aware painted-texture treatment across the whole
 * asset library in one pass (docs/ART-DIRECTION.md §6.2 "widen scope now" decision).
 *
 * Generalizes past what paint-texture.mjs/repaint-model-texture.mjs handle individually, because
 * real assets in this library are messier than the pilot's single-material fishing stand:
 *   - Some materials have a baseColorTexture (the common case — a shared colour-swatch atlas).
 *     Overlay mode applies (see paint-texture.mjs's big comment for why: preserves which part is
 *     which colour instead of collapsing them all to one tone).
 *   - Some materials have NO texture at all, just a flat baseColorFactor (checked: creature_Bat,
 *     _Chicken, _Deer, _Dragon, _Mushroom, _Panda, _Skeleton, _Slime, each with 1-5 materials).
 *     From-scratch mode applies instead, seeded from that material's own colour.
 *   - A model can have MULTIPLE materials (creature_Bat: 5, creature_Dragon: 5, creature_Slime: 2,
 *     enemy_skeleton: 2) — each is treated independently so per-part colour differentiation (e.g.
 *     a Dragon's body vs. horns vs. wings) survives, the same principle as region-aware overlay
 *     but at the material level instead of the swatch-atlas-pixel level.
 *
 * One Playwright browser for the whole run (not one per file/material) — the earlier per-model
 * CLI tools each pay a ~1s browser launch; at ~80 models x up to 5 materials that adds up for no
 * reason since the actual paint work is a few canvas draws.
 *
 * Usage:
 *   node tools/batch-repaint-assets.mjs [--dry-run] [--only file1.glb,file2.glb] [--skip a.glb,b.glb]
 */
import { chromium } from "playwright";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public", "assets", "models");

const args = process.argv.slice(2);
const flagVal = (name) => { const i = args.indexOf(name); return i === -1 ? "" : (args[i + 1] || ""); };
const dryRun = args.includes("--dry-run");
const only = flagVal("--only").split(",").filter(Boolean);
const skip = new Set(flagVal("--skip").split(",").filter(Boolean));
// node_fishing.glb already got the from-scratch pilot treatment directly (no swatch atlas to
// preserve — it was a single baked photo texture, not a colour-swatch material). Not reprocessed.
skip.add("node_fishing.glb");

function chromiumPath(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter(d => d.startsWith("chromium-")).sort().reverse();
  for (const d of dirs){ const exe = path.join(root, d, "chrome-linux", "chrome"); if (fs.existsSync(exe)) return exe; }
  return undefined;
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
// Load once; called many times below via page.evaluate's function-serialisation.
async function paint({ size = 512, seed, inputBytes, base }){
  const inputB64 = inputBytes ? Buffer.from(inputBytes).toString("base64") : null;
  const dataUrl = await page.evaluate(async ({ size, seed, base, inputB64 }) => {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const x = c.getContext("2d");
    const overlayMode = !!inputB64;
    if (overlayMode){
      const img = new Image();
      const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      img.src = `data:image/png;base64,${inputB64}`;   // Chromium sniffs actual format from bytes
      await loaded;
      x.drawImage(img, 0, 0, size, size);
    } else {
      x.fillStyle = base;
      x.fillRect(0, 0, size, size);
    }
    let s = seed;
    const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const warmTint = "#e8a33d", coolTint = "#4a3a6a";
    const warmScratch = ["#c98f4e", "#e8c68a", "#a5723f", "#d9a35c", "#7a4f2a", "#f0d9a8"];
    const coolScratch = ["#4a3a6a", "#3a2f56", "#5a4a7a"];

    for (let i = 0; i < 40; i++){
      const cx = rand() * size, cy = rand() * size, r = 18 + rand() * 48;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      if (overlayMode){ g.addColorStop(0, warmTint + "40"); g.addColorStop(1, warmTint + "00"); }
      else { const col = warmScratch[Math.floor(rand()*warmScratch.length)]; g.addColorStop(0, col+"cc"); g.addColorStop(1, col+"00"); }
      x.save(); x.globalCompositeOperation = overlayMode ? "soft-light" : "source-over";
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill(); x.restore();
    }
    for (let i = 0; i < 12; i++){
      const cx = rand() * size, cy = rand() * size, r = 16 + rand() * 36;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      if (overlayMode){ g.addColorStop(0, coolTint + "35"); g.addColorStop(1, coolTint + "00"); }
      else { const col = coolScratch[Math.floor(rand()*coolScratch.length)]; g.addColorStop(0, col+"55"); g.addColorStop(1, col+"00"); }
      x.save(); x.globalCompositeOperation = overlayMode ? "multiply" : "source-over";
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI*2); x.fill(); x.restore();
    }
    for (let i = 0; i < 260; i++){
      const px = rand() * size, py = rand() * size;
      const len = 10 + rand() * 22, ang = rand() * Math.PI * 2;
      x.save();
      if (overlayMode){
        x.globalCompositeOperation = "overlay";
        const lighter = rand() > 0.45;
        x.strokeStyle = (lighter ? "#ffffff" : "#000000") + Math.floor(50 + rand()*50).toString(16).padStart(2,"0");
      } else {
        const col = warmScratch[Math.floor(rand()*warmScratch.length)];
        x.strokeStyle = col + Math.floor(70 + rand()*60).toString(16).padStart(2,"0");
      }
      x.lineWidth = 1.5 + rand() * 2.5; x.lineCap = "round";
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px+Math.cos(ang)*len*0.5+(rand()-0.5)*8, py+Math.sin(ang)*len*0.5+(rand()-0.5)*8, px+Math.cos(ang)*len, py+Math.sin(ang)*len);
      x.stroke(); x.restore();
    }
    return c.toDataURL("image/png");
  }, { size, seed, base, inputB64 });
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

function hashSeed(str){
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0) || 1;
}
function factorToHex([r, g, b]){
  const c = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

let files = fs.readdirSync(DIR).filter(f => f.endsWith(".glb")).sort();
if (only.length) files = files.filter(f => only.includes(f));
files = files.filter(f => !skip.has(f));

const report = [];
for (const file of files){
  const p = path.join(DIR, file);
  let doc;
  try { doc = await io.read(p); } catch (e){ report.push(`${file}: READ FAILED — ${e.message}`); continue; }
  const root = doc.getRoot();
  const mats = root.listMaterials();
  if (!mats.length){ report.push(`${file}: no materials, skipped`); continue; }

  let touched = 0;
  for (let mi = 0; mi < mats.length; mi++){
    const mat = mats[mi];
    const seed = hashSeed(file + ":" + mi);
    const existingTex = mat.getBaseColorTexture();
    let pngBytes;
    if (existingTex){
      pngBytes = await paint({ seed, inputBytes: existingTex.getImage() });
    } else {
      const base = factorToHex(mat.getBaseColorFactor());
      pngBytes = await paint({ seed, base });
    }
    const newTex = doc.createTexture(`painted_${mi}`).setImage(pngBytes).setMimeType("image/png");
    mat.setBaseColorTexture(newTex);
    mat.setBaseColorFactor([1, 1, 1, mat.getBaseColorFactor()[3] ?? 1]);
    mat.setNormalTexture(null);
    mat.setOcclusionTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setEmissiveTexture(null);
    mat.setEmissiveFactor([0, 0, 0]);
    mat.setMetallicFactor(0);
    mat.setRoughnessFactor(0.9);
    touched++;
  }
  // drop now-orphaned old textures
  for (const tex of root.listTextures()){
    if (tex.listParents().every(pp => pp === root) && !mats.some(m => m.getBaseColorTexture() === tex)) tex.dispose();
  }

  if (!dryRun){
    try { await io.write(p, doc); }
    catch (e){ report.push(`${file}: WRITE FAILED — ${e.message}`); continue; }
  }
  report.push(`${file}: ${touched} material(s) repainted${dryRun ? " (dry run)" : ""}`);
}

console.log(report.join("\n"));
console.log(`\n${files.length} files processed.`);
await browser.close();
