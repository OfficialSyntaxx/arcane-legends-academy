#!/usr/bin/env node
/**
 * repaint-model-texture.mjs — swap a GLB's baseColorTexture for a new one, stripping anything
 * that could carry baked lighting/AO from the old bake.
 *
 * Built for the docs/ART-DIRECTION.md pilot: taking a generated model with a baked photo-real
 * texture (e.g. from Tripo) and re-skinning it with a flat-matte painted texture instead, without
 * touching the geometry — the expensive part to regenerate — at all.
 *
 * Applies docs/ART-DIRECTION.md §4.1 unconditionally: strips normal/occlusion/metallic-roughness/
 * emissive maps, zeroes emissiveFactor, sets metallicFactor 0 and roughnessFactor 0.9 (matte,
 * non-metal). If a future asset genuinely needs metal or an emissive glow, do that by hand after
 * running this rather than teaching this script exceptions — it's meant to be a blunt, predictable
 * "make this flat-matte-painted" pass, not a general material editor.
 *
 * Usage:
 *   node tools/repaint-model-texture.mjs <src.glb> <texture.png> <out.glb>
 *
 *   Overwriting the source in place (out === src) is fine and is the common case.
 *
 *   Reads WebP/Draco-compressed input fine (registers both) — most assets past the pilot are
 *   already-shipped, already-compressed models, not fresh Tripo imports like the pilot's own.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import fs from "fs";

const [, , srcPath, texPath, outPath] = process.argv;
if (!srcPath || !texPath || !outPath){
  console.error("Usage: node tools/repaint-model-texture.mjs <src.glb> <texture.png> <out.glb>");
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
const doc = await io.read(srcPath);
const root = doc.getRoot();

const pngData = fs.readFileSync(texPath);
const newTex = doc.createTexture("painted").setImage(pngData).setMimeType("image/png");

for (const mat of root.listMaterials()){
  mat.setBaseColorTexture(newTex);
  mat.setBaseColorFactor([1, 1, 1, 1]);
  mat.setNormalTexture(null);
  mat.setOcclusionTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setEmissiveTexture(null);
  mat.setEmissiveFactor([0, 0, 0]);
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(0.9);
}

// Drop the now-orphaned old textures rather than shipping them as dead weight.
for (const tex of root.listTextures()){
  if (tex === newTex) continue;
  if (tex.listParents().every(p => p === root)) tex.dispose();
}

await io.write(outPath, doc);
console.log("wrote", outPath);
