// Regenerate the card catalog embedded in logic.js from public/cards.js.
//
// logic.js is the server-authoritative rules module and runs in a sandbox with no imports, so
// it has to carry its own copy of the catalog. That copy silently drifted: the two engines
// ended up with DIFFERENT elemental matrices (cards.js had the 6-link ring, logic.js still had
// an old 3-link one), and the embedded cards had no `name`, so trap logs read "Trap! undefined".
//
//   node tools/sync-cards.mjs           rewrite the generated block in logic.js
//   node tools/sync-cards.mjs --check   verify it is up to date (exit 1 if not) — used by npm test
//
// Only the fields the rules module actually needs are emitted; rarity/text/target are UI-only.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CARDS, SCHOOL_BONUS } from "../public/cards.js";
import { AFFINITY_FX, ULTIMATES, ULT_CHARGE_MAX } from "../public/schoolmagic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGIC = path.join(ROOT, "logic.js");
const BEGIN = "// <<< GENERATED CARD CATALOG — do not edit by hand; run: node tools/sync-cards.mjs";
const END = "// <<< END GENERATED >>>";

const j = v => JSON.stringify(v);
function cardLine(c){
  const parts = [`id:${j(c.id)}`, `name:${j(c.name)}`, `school:${j(c.school)}`, `type:${j(c.type)}`, `cost:${c.cost}`];
  if (c.atk != null) parts.push(`atk:${c.atk}`);
  if (c.hp != null) parts.push(`hp:${c.hp}`);
  parts.push(`fx:${j(c.fx || [])}`);
  return `  {${parts.join(",")}},`;
}

function generate(){
  // Only the {k,n} an effect needs to RESOLVE travels here — name/icon/text are UI-only and the
  // client already has public/schoolmagic.js to import them from directly (index.html is not
  // sandboxed the way logic.js is).
  const affinity = Object.fromEntries(Object.entries(AFFINITY_FX).map(([id, fx]) => [id, { k: fx.k, n: fx.n }]));
  const ultFx = Object.fromEntries(Object.entries(ULTIMATES).map(([id, u]) => [id, u.fx]));
  const lines = [
    BEGIN,
    "// Mirrors public/cards.js and public/schoolmagic.js. Source of truth is those files — edit",
    "// there, then re-run the script. >>>",
    "const C = [",
    ...CARDS.map(cardLine),
    "];",
    `const SCHOOL_BONUS = ${j(SCHOOL_BONUS)};`,
    `const SCHOOL_AFFINITY_FX = ${j(affinity)};`,
    `const SCHOOL_ULT_FX = ${j(ultFx)};`,
    `const ULT_CHARGE_MAX = ${ULT_CHARGE_MAX};`,
    END,
  ];
  return lines.join("\n");
}

const src = fs.readFileSync(LOGIC, "utf8");
const start = src.indexOf(BEGIN);
const stop = src.indexOf(END);
if (start < 0 || stop < 0){
  console.error("✗ generated-block markers not found in logic.js — expected:\n  " + BEGIN + "\n  " + END);
  process.exit(1);
}
const current = src.slice(start, stop + END.length);
const next = generate();

if (process.argv.includes("--check")){
  if (current === next){
    console.log(`generated block in sync (${CARDS.length} cards, ${SCHOOL_BONUS.length} elemental links, ${Object.keys(ULTIMATES).length} school ultimates)`);
    process.exit(0);
  }
  console.error("✗ logic.js generated block is STALE — run: node tools/sync-cards.mjs");
  process.exit(1);
}

if (current === next){
  console.log("generated block already up to date — nothing to write");
} else {
  fs.writeFileSync(LOGIC, src.slice(0, start) + next + src.slice(stop + END.length));
  console.log(`✔ regenerated logic.js block (${CARDS.length} cards, ${SCHOOL_BONUS.length} elemental links, ${Object.keys(ULTIMATES).length} school ultimates)`);
}
