// Compress generated GLBs: Draco geometry + high-quality WebP textures.
//
//   node tools/compress-models.mjs            compress anything not already compressed
//   node tools/compress-models.mjs --check    report sizes only
//   node tools/compress-models.mjs --force    re-compress even already-compressed models
//
// Run after generating any new model.
//
// QUALITY NOTES — this pipeline was retuned after generated models looked noticeably softer
// in-game than in the Tripo/Higgsfield viewer. The original settings threw away most of the
// detail that was paid for:
//   * `optimize` runs `simplify` by DEFAULT, which decimates geometry. Disabled — these are
//     already low-poly game assets (~15-20k tris) and there is nothing to win by cutting them.
//   * Textures were resized to 512px. Generated models ship 2048px textures, so that was a 16x
//     loss in texel density and the single biggest cause of the soft look. Now kept at 2048.
//   * `optimize --texture-compress webp` offers no quality control and was crushing a 124KB
//     base colour to 17KB. Compression is now a separate `webp` pass at quality 92.
// Draco still does the heavy lifting on file size (it compresses geometry, not textures), so
// the deploy stays comfortably small.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = [
  path.join(ROOT, "public", "assets", "models"),      // characters
  path.join(ROOT, "public", "assets", "buildings"),   // landmarks + buildings
];
const TEXTURE_SIZE = "2048";
const WEBP_QUALITY = "92";
const check = process.argv.includes("--check");
const force = process.argv.includes("--force");

// Compression is LOSSY and this script is not idempotent: the `webp` pass decodes Draco and
// re-encodes the textures, so running it twice re-encodes an already-encoded texture and quality
// drops again. Skip anything already compressed unless --force.
function isCompressed(file){
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546C67) return false;                  // not a GLB
  const json = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString("utf8"));
  const used = json.extensionsUsed || [];
  return used.includes("EXT_texture_webp") && used.includes("KHR_draco_mesh_compression");
}
const mb = b => (b / 1048576).toFixed(2) + "MB";

function run(args){ execFileSync("npx", args, { stdio:"pipe", cwd:ROOT }); }

let before = 0, after = 0, count = 0;
for (const dir of DIRS){
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".glb"))){
    const p = path.join(dir, f);
    const size0 = fs.statSync(p).size; before += size0; count++;
    if (check){ after += size0; console.log(`  ${f.padEnd(24)} ${mb(size0)}${isCompressed(p) ? "" : "  (uncompressed)"}`); continue; }
    if (!force && isCompressed(p)){ after += size0; console.log(`  ${f.padEnd(24)} ${mb(size0)}  already compressed, skipped`); continue; }
    const tmpA = p + ".a.glb", tmpB = p + ".b.glb";
    try {
      // ORDER MATTERS: the `webp` pass decodes Draco and does not re-apply it ("Decoded
      // KHR_draco_mesh_compression"), so textures must be done FIRST and Draco applied LAST.
      // Running them the other way round silently ships uncompressed geometry.
      // 1. textures, with real quality control
      run(["gltf-transform", "webp", p, tmpA, "--quality", WEBP_QUALITY]);
      // 2. geometry — Draco only.
      // NOT `optimize --compress draco`: `optimize` is a bundle, and its other passes corrupt
      // ANIMATION data for three r128 — a rigged model compressed that way fails to load with
      // "Cannot read properties of null (reading 'array')" while the same model through the
      // standalone `draco` pass loads fine. We had already had to switch off `optimize`'s
      // simplify and texture-compress, so there was nothing left in it that we wanted. Sizes
      // are within 0.3% of each other.
      run(["gltf-transform", "draco", tmpA, tmpB]);
      fs.renameSync(tmpB, p);
      fs.unlinkSync(tmpA);
      const size1 = fs.statSync(p).size; after += size1;
      console.log(`  ${f.padEnd(24)} ${mb(size0)} -> ${mb(size1)}`);
    } catch (e){
      for (const t of [tmpA, tmpB]) if (fs.existsSync(t)) fs.unlinkSync(t);
      after += size0;
      console.log(`  ${f.padEnd(24)} FAILED (left unchanged): ${e.message.split("\n")[0]}`);
    }
  }
}
console.log(`\n${count} models: ${mb(before)} -> ${mb(after)}`);
