#!/usr/bin/env node
/**
 * import-asset.mjs — drop a free 3D asset into the game, the easy way.
 *
 * Full pipeline: download → convert FBX/GLTF→GLB → resize textures to 512px → print scale + texture status.
 *
 * Usage:
 *   node tools/import-asset.mjs <source> [options]
 *
 *   <source>   A URL (http/https) or a local path to an .fbx, .gltf or .glb file.
 *
 * Options:
 *   --name <name>          Output filename (default: source basename, .glb)
 *   --out <dir>            Output directory (default: public/assets/models)
 *   --resize <px>          Max texture size, 0 to skip (default: 512)
 *   --target-height <h>    World units to suggest a scale for (default: 6.0 — environment/buildings;
 *                          pass 1.8 for characters)
 *
 * Examples:
 *   node tools/import-asset.mjs https://cdn.example.com/tree.fbx --name tree_pine.glb
 *   node tools/import-asset.mjs ./downloads/rock.gltf --target-height 1.5 --name rock_1.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { textureCompress } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ---------- arg parsing ----------
const args = process.argv.slice(2);
const opts = { resize: 512, target: 6.0, out: 'public/assets/models', name: null };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--name') opts.name = args[++i];
  else if (a === '--out') opts.out = args[++i];
  else if (a === '--resize') opts.resize = parseInt(args[++i], 10);
  else if (a === '--target-height') opts.target = parseFloat(args[++i]);
  else positional.push(a);
}
if (positional.length === 0) {
  console.error('Usage: node tools/import-asset.mjs <url|path> [--name <n>] [--out <dir>] [--resize <px>] [--target-height <h>]');
  process.exit(1);
}
const source = positional[0];

// ---------- helpers ----------
function findFbx2gltf() {
  const candidates = [
    'node_modules/fbx2gltf/bin/Linux/FBX2glTF',
    'node_modules/fbx2gltf/bin/Darwin/FBX2glTF',
    'node_modules/fbx2gltf/bin/Windows_NT/FBX2glTF.exe',
  ];
  for (const c of candidates) {
    const p = resolve(c);
    if (existsSync(p)) return p;
  }
  return null;
}
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status}) for ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`  downloaded ${Math.round((await import('node:fs')).statSync(dest).size / 1024)} KB`);
}
function computeBounds(doc) {
  const root = doc.getRoot();
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        min[0] = Math.min(min[0], arr[i]); min[1] = Math.min(min[1], arr[i + 1]); min[2] = Math.min(min[2], arr[i + 2]);
        max[0] = Math.max(max[0], arr[i]); max[1] = Math.max(max[1], arr[i + 1]); max[2] = Math.max(max[2], arr[i + 2]);
      }
    }
  }
  return { min, max, height: max[1] - min[1] };
}
// Read image dimensions from raw bytes (PNG/JPEG) without an image lib.
function imageSize(bytes, mime) {
  if (!bytes) return null;
  if (mime === 'image/png' && bytes.length >= 24 && bytes[1] === 0x50) {
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    return [w, h];
  }
  if (mime === 'image/jpeg' && bytes.length > 4 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const h = bytes.readUInt16BE(i + 5), w = bytes.readUInt16BE(i + 7);
        return [w, h];
      }
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

// ---------- 1. resolve source (download if URL) ----------
let localPath;
if (/^https?:\/\//i.test(source)) {
  const ext = extname(new URL(source).pathname) || '.glb';
  localPath = join(tmpdir(), `dl_${Date.now()}${ext}`);
  console.log(`Downloading ${source}`);
  await download(source, localPath);
} else {
  localPath = resolve(source);
  if (!existsSync(localPath)) { console.error(`File not found: ${localPath}`); process.exit(1); }
}

// ---------- 2. convert FBX/GLTF → GLB ----------
const ext = extname(localPath).toLowerCase();
let glbPath;
if (ext === '.fbx') {
  const fx = findFbx2gltf();
  if (!fx) { console.error('FBX2glTF binary not found — run: npm install --save fbx2gltf'); process.exit(1); }
  const outBase = join(tmpdir(), `fbx_${Date.now()}`);
  console.log(`Converting FBX → GLB (FBX2glTF)`);
  execFileSync(fx, ['--binary', '-i', localPath, '-o', outBase], { stdio: 'inherit' });
  glbPath = outBase + '.glb';
} else if (ext === '.gltf') {
  const io = new NodeIO();
  console.log(`Converting GLTF → GLB`);
  const doc = await io.read(localPath);
  glbPath = join(tmpdir(), `gltf_${Date.now()}.glb`);
  writeFileSync(glbPath, Buffer.from(await io.writeBinary(doc)));
} else if (ext === '.glb') {
  glbPath = localPath;
} else if (ext === '.obj') {
  console.error('OBJ is not supported by this pipeline. Use the pack\'s .gltf/.fbx version, or convert in Blender and re-run.');
  process.exit(1);
} else {
  console.error(`Unsupported format: "${ext}" (expected .fbx, .gltf or .glb)`);
  process.exit(1);
}

// ---------- 3. resize textures + write final GLB ----------
const io = new NodeIO();
const doc = await io.read(glbPath);
const texCount = doc.getRoot().listTextures().length;
if (opts.resize > 0 && texCount > 0) {
  console.log(`Resizing ${texCount} texture(s) to max ${opts.resize}px`);
  await doc.transform(textureCompress({ resize: [opts.resize, opts.resize], targetFormat: 'png' }));
}
const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const name = opts.name || (basename(source).replace(extname(source), '') + '.glb');
const outPath = join(outDir, name);
writeFileSync(outPath, Buffer.from(await io.writeBinary(doc)));

// ---------- 4. print scale + texture status ----------
const root = doc.getRoot();
const bounds = computeBounds(doc);
const isSkinned = root.listSkins().length > 0;
const animCount = root.listAnimations().length;
const meshCount = root.listMeshes().length;
const textures = root.listTextures();
const scale = bounds.height > 0.0001 ? (opts.target / bounds.height) : null;

console.log('\n=== Import result ===');
console.log(`  wrote        : ${outPath}`);
console.log(`  size         : ${Math.round((await import('node:fs')).statSync(outPath).size / 1024)} KB`);
console.log(`  meshes       : ${meshCount}`);
console.log(`  skinned      : ${isSkinned ? 'yes (game loader uses skeleton-node-span for scale)' : 'no (static)'}`);
console.log(`  animations   : ${animCount}`);
console.log(`  raw height   : ${bounds.height.toFixed(2)} units`);
console.log(`  scale to ${opts.target}u : ${scale ? scale.toFixed(3) : 'n/a (empty geometry)'}  (set model.scale to this, or patch makeCharModel)`);
console.log(`  textures     : ${textures.length}`);
for (const t of textures) {
  const sz = imageSize(t.getImage(), t.getMimeType());
  const label = sz ? sz.join('x') : t.getMimeType() || 'unknown';
  const blank = sz && sz[0] <= 1 ? '  ⚠ BLANK (1px — pack likely missing real textures)' : '';
  console.log(`    - ${label} px${blank}`);
}
if (textures.length === 0) console.log('    (no textures — model will render flat white; add materials in three.js)');
console.log('\nNext: wire into world.js (makeCharModel for characters, or scene.add for props), then run gltf-transform resize if needed.');