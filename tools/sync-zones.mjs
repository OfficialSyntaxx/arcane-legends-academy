// Regenerate the `academy` zone in public/world/zones.json from the authoring tables in
// structures.js / nodes.js.
//
//   node tools/sync-zones.mjs           rewrite the academy zone
//   node tools/sync-zones.mjs --check   verify it is up to date (exit 1 if not) — used by npm test
//
// WHY THIS EXISTS: zones.json is the runtime contract (WORLDSPEC §7) but structures.js/nodes.js
// are still the authoring surface for the hub during the migration (WORLDSPEC §10). That is two
// copies of the same data, which is exactly how the logic.js card catalog silently drifted out of
// sync with cards.js — the two engines ended up with different elemental matrices. Same trap, so
// same guard: generated, checked in CI, never hand-edited.
//
// Zones OTHER than `academy` are authored directly in zones.json and are left untouched.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as ST from "../public/structures.js";
import { WORLD_NODES, NODE_MODELS } from "../public/nodes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZONES = path.join(ROOT, "public", "world", "zones.json");

export function buildAcademyZone(){
  return {
    id: "academy",
    name: "The Arcanum Academy",
    hub: true,
    generated: "tools/sync-zones.mjs — do not hand-edit; edit structures.js/nodes.js and re-run",
    spawn: { x: ST.PLAYER_SPAWN.x, z: ST.PLAYER_SPAWN.z },
    bounds: { minX: -ST.WORLD_BOUND, maxX: ST.WORLD_BOUND, minZ: -ST.WORLD_BOUND, maxZ: ST.WORLD_BOUND },
    terrain: { seed: 20260804, scale: 55, amplitude: 1.4, baseHeight: 0, biome: "plains" },
    chunkSize: 32, loadRadius: 70, unloadRadius: 100,
    buildings: ST.BUILDINGS,
    landmarks: ST.LANDMARKS,
    props: ST.PROPS,
    npcs: ST.NPCS,
    wanderers: ST.WANDERERS,
    resourceNodes: WORLD_NODES,
    nodeModels: NODE_MODELS,
    treeRing: ST.TREE_RING,
    // Hub dressing — paths, lamps, the fountain and the distant spires. Zone-scoped so other
    // zones do not inherit the academy's furniture.
    decor: {
      paths: true, spires: true, fountain: [0, -18],
      lamps: [[13,13],[-13,13],[13,-13],[-13,-13],[0,24],[0,-24],[26,0],[-26,0]],
    },
    // The collision shapes are hand-tuned (the tower/arena radii were measured from their
    // models), so they ship with the zone rather than being re-derived at runtime.
    obstacles: ST.OBSTACLES,
    exits: [{ toZone: "whispering_forest", x: 0, z: -70 }],
    dungeonEntrances: [],
    treasures: ST.TREASURES,
  };
}

const doc = JSON.parse(fs.readFileSync(ZONES, "utf8"));
const idx = doc.zones.findIndex(z => z.id === "academy");
if (idx < 0){ console.error("✗ no `academy` zone in zones.json to regenerate"); process.exit(1); }

const next = buildAcademyZone();
const current = doc.zones[idx];
const same = JSON.stringify(current) === JSON.stringify(next);

if (process.argv.includes("--check")){
  if (same){
    console.log(`academy zone in sync (${next.buildings.length} buildings, ${next.resourceNodes.length} nodes, ${next.obstacles.length} obstacles)`);
    process.exit(0);
  }
  console.error("✗ public/world/zones.json academy zone is STALE — run: node tools/sync-zones.mjs");
  process.exit(1);
}

if (same){
  console.log("academy zone already up to date — nothing to write");
} else {
  doc.zones[idx] = next;
  fs.writeFileSync(ZONES, JSON.stringify(doc, null, 2) + "\n");
  console.log(`✔ regenerated the academy zone (${next.buildings.length} buildings, ${next.resourceNodes.length} nodes, ${next.obstacles.length} obstacles)`);
}
