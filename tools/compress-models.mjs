// Re-compress every character GLB: Draco geometry + WebP textures at 512px.
//
//   node tools/compress-models.mjs            compress in place
//   node tools/compress-models.mjs --check    report sizes only
//
// Run this after generating any new model. Draco is where the win is — across the character
// set the folder goes 22MB -> 3.4MB, and textures-only compression only reaches 17MB, so the
// geometry is the bulk. The decoder is vendored at public/vendor/draco/ and wired up in
// world.js; a model that is NOT Draco-compressed still loads fine, so this is safe to re-run.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public", "assets", "models");
const check = process.argv.includes("--check");
const mb = b => (b / 1048576).toFixed(2) + "MB";

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".glb"));
let before = 0, after = 0;
for (const f of files){
  const p = path.join(DIR, f);
  const size0 = fs.statSync(p).size; before += size0;
  if (check){ after += size0; console.log(`  ${f.padEnd(24)} ${mb(size0)}`); continue; }
  const tmp = p + ".tmp";
  try {
    execFileSync("npx", ["gltf-transform", "optimize", p, tmp,
      "--compress", "draco", "--texture-compress", "webp", "--texture-size", "512"],
      { stdio:"pipe", cwd:ROOT });
    fs.renameSync(tmp, p);
    const size1 = fs.statSync(p).size; after += size1;
    console.log(`  ${f.padEnd(24)} ${mb(size0)} -> ${mb(size1)}`);
  } catch (e){
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    after += size0;
    console.log(`  ${f.padEnd(24)} FAILED (left unchanged): ${e.message.split("\n")[0]}`);
  }
}
console.log(`\n${files.length} models: ${mb(before)} -> ${mb(after)}`);
