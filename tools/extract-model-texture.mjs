#!/usr/bin/env node
/**
 * extract-model-texture.mjs — pull a GLB's baseColorTexture out to a standalone image file.
 *
 * Companion to repaint-model-texture.mjs: the region-aware repaint workflow needs the model's
 * EXISTING texture as a starting point (see paint-texture.mjs --input), not a texture generated
 * from scratch, so this is the first step of that pipeline:
 *
 *   node tools/extract-model-texture.mjs <model.glb> <out.png>
 *   node tools/paint-texture.mjs <painted.png> --input <out.png>
 *   node tools/repaint-model-texture.mjs <model.glb> <painted.png> <model.glb>
 *
 * Only the first material's first baseColorTexture is extracted — every asset checked during the
 * docs/ART-DIRECTION.md widened-scope pass has exactly one (a shared colour-swatch atlas is the
 * whole reason region-aware repainting exists in the first place).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import fs from "fs";

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath){
  console.error("Usage: node tools/extract-model-texture.mjs <model.glb> <out.png>");
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
const doc = await io.read(srcPath);
const root = doc.getRoot();

const mat = root.listMaterials()[0];
const tex = mat && mat.getBaseColorTexture();
if (!tex){
  console.error(`${srcPath}: no baseColorTexture on its first material`);
  process.exit(1);
}
fs.writeFileSync(outPath, Buffer.from(tex.getImage()));
console.log("wrote", outPath, `(${tex.getMimeType()})`);
