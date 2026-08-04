// Compress generated GLBs: Draco geometry + high-quality WebP textures.
//
//   node tools/compress-models.mjs            compress everything in place
//   node tools/compress-models.mjs --check    report sizes only
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
const mb = b => (b / 1048576).toFixed(2) + "MB";

function run(args){ execFileSync("npx", args, { stdio:"pipe", cwd:ROOT }); }

let before = 0, after = 0, count = 0;
for (const dir of DIRS){
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".glb"))){
    const p = path.join(dir, f);
    const size0 = fs.statSync(p).size; before += size0; count++;
    if (check){ after += size0; console.log(`  ${f.padEnd(24)} ${mb(size0)}`); continue; }
    const tmpA = p + ".a.glb", tmpB = p + ".b.glb";
    try {
      // ORDER MATTERS: the `webp` pass decodes Draco and does not re-apply it ("Decoded
      // KHR_draco_mesh_compression"), so textures must be done FIRST and Draco applied LAST.
      // Running them the other way round silently ships uncompressed geometry.
      // 1. textures, with real quality control
      run(["gltf-transform", "webp", p, tmpA, "--quality", WEBP_QUALITY]);
      // 2. geometry — Draco, no simplification, textures already handled
      run(["gltf-transform", "optimize", tmpA, tmpB,
        "--compress", "draco",
        "--simplify", "false",
        "--texture-compress", "false",
        "--texture-size", TEXTURE_SIZE]);
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
