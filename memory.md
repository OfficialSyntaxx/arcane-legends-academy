# Project Memory / Operations Notes

> This file is the durable, version-controlled memory for the Arcane Legends — Wizard TCG
> project. It holds the operational details (deploy, analytics, asset pipeline, conventions)
> that the agent needs across sessions. Keep it current — edit + commit with every change.

## How to update this file (convention)
- **New durable learnings go HERE, appended, not into the agent memory store.** The agent memory
  tool only holds a short pointer to this file.
- When a new fact / preference / operational detail comes up, edit the relevant section or add a
  dated entry under **Learnings log** below, then commit + push.
- See the `append-project-memory` skill for the full rule.

## Learnings log
- 2026-08-08 — Analytics dashboard is at `/api/dashboard` (bare `/dashboard` is intercepted by the
  platform SPA fallback). Worker routes: `/api/analytics` (POST/GET), `/api/dashboard` (HTML).
- 2026-08-08 — `memory.md` established as the durable project memory; agent memory store holds only
  a pointer. Convention: append learnings here, not to the memory tool.

## Live deployment
- Play URL: **https://magic-woodland-396.higgsfield.app** (website id `c739c4e5-9f2e-4aab-8ed5-9127cd802ec4`)
- Source repo: **https://github.com/OfficialSyntaxx/arcane-legends-academy** (user `OfficialSyntaxx`)
- Local repo: `wizard-tcg/` workspace folder. Workflow: commit + push each feature to `main`.
- Push: temporarily set the git remote URL to include the fine-grained PAT as the username, push, then scrub back to the clean URL. Never commit the PAT.

## Client analytics
Live endpoints (worker = `app/src/worker.ts`, client tracker = `public/analytics.js`):
- **`GET /api/analytics`** — JSON summary: `{total, byType, zones, recentErrors, recent}`.
- **`GET /api/dashboard`** — human-readable analytics dashboard (HTML). (Note: `/dashboard` is intercepted by the platform's SPA fallback — keep it under `/api/`.)
- **`POST /api/analytics`** — record events (used by the client tracker).
- Storage: **D1** table `analytics(id, ts, type, pid, data)`. Query via `website_db` (read-only) with website id `c739c4e5-9f2e-4aab-8ed5-9127cd802ec4`.
- Client API: `window.__analytics.track(type, data)` — available after `analytics.js` loads.

### Event types
| type | data | meaning |
|---|---|---|
| `session_start` | `{}` | page loaded |
| `session_meta` | `{mobile, screen, dpr, lang, ua, gl}` | device/WebGL info (attached once per session) |
| `session_end` | `{duration_sec}` | tab closed / hidden |
| `zone_visit` | `{zone, from}` | player entered a zone / dungeon |
| `tab_click` | `{tab}` | bottom-nav tab pressed |
| `movement` | `{event:"stuck", at:[x,z]}` | tap-to-move hit a wall (collision) |
| `error` | `{message, source, line}` | uncaught JS error (incl. movement/collision code) |
| `fps` | `{fps}` | low-frame-rate sample (< 30) |
| `world` | `{event, zone, ok, model}` | world/map load events (`map_loaded`/`map_failed`) |
| `debug` | `{k, v}` | opportunistic debug breadcrumbs |

### Adding tracking
In the game client, call `window.__analytics.track("type", { ... })` anywhere. Events are batched
and POSTed every ~4s and on page-hide (sendBeacon). Add new event types above as they appear.

## Asset pipeline
- CC0 sources: **KayKit** (GitHub org `KayKit-Game-Assets`), **Quaternius** (OpenGameArt / quaternius.com).
  itch.io packs are session-protected — the user must attach them.
- Import: `tools/import-asset.mjs` (download → FBX/GLTF→GLB → resize 512px → print scale/texture status).
- Deploy ceiling ~50MB. Large models (>1MB) are CDN-hosted on Higgsfield (CloudFront URLs) and
  loaded at runtime via `cdn.js` `modelUrl(name)`; the 12 large GLBs live in git-tracked `models_cdn/`
  (not bundled), keeping `public/` small.

## Standing vision
Full 3D open world blending **Wizard101** (magical academy, school identity, duels) and **OSRS**
(gathering, skilling, crafting, economy) — NOT an idle/menu simulator. All activities happen
interactively in the 3D world.

### GLB / character tech
- Skinned Meshy GLBs have a degenerate (0) object box; the real size is the **SKELETON NODE SPAN**
  (bones sit far above the mesh). `makeCharModel` auto-detects skinned (node-span) vs static
  (geometry box) and scales to ~1.8.
- Meshy GLBs carry only an idle clip; **walk is added procedurally** by animating skeleton bones.
- Buildings/dungeon/nature/props are imported GLB models (CC0 packs), not purely procedural.

## Conventions
- Build out game mechanics before generating 3D assets; rig animations + sound later.
- Keep `CHANGELOG.md`, `CLAUDREREADME.md`, `BACKLOG.md`, `ASSETS.md`, `WORLDSPEC.md` current.
- All tests pass: engine (`tools/test.mjs`, ~256), logic (`tools/logic-test.mjs`), UI smoke
  (`tools/ui-smoke.mjs`), creature-rule (`tools/creature-rule-test.mjs`).