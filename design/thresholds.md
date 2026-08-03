# Thresholds & Verification Targets (written before the code)

All strip gates (hard numbers the build must meet or fix before delivery).

## Performance (target the weakest platform: mobile)
- FPS target: 60 fps minimum on the `worst_case_scene` ("duel battlefield, full board + hand + overlays").
- `draw_call_budget` (canvas draw calls / path fills per frame): ≤ 80 on mobile, ≤ 150 web mid-range.
- `entity_count_estimate`: ~60 same-type entities (cards). Rule: >50 same-type entities batch into few draw passes (prerendered card faces to offscreen canvas, blitted as images).
- `pixelRatio` cap = 1.5; no per-frame allocations in the render loop.
- Smoke gate: average FPS on a reference duel route < 45 = red build (fix before delivering).

## Response (§9 — immediacy)
- Every clickable action reflects visually within ≤100 ms (acknowledgment for long ops like online match setup).
- Input buffer / tolerance: none critical for a turn-based game (no motor tolerances). Grace: tap targets ≥ 44 px on mobile.

## Balance (T1 — computed, not run)
- Creature power budget: ATK+HP ≤ 2×cost + 2 (hard cap, checked by a layout script over `cards.js`).
- Spell damage ≈ cost × 2 (within ±2).
- Non-transitive ring: Fire>Life>Death>Fire, Ice slows Storm, Storm bursts Ice — represent as a small school bonus table.
- Economy inflation: gold remainder over a 20-quest reference run must NOT grow monotonically stronger than pack price curve (sinks keep pace).
- Grading expected value ≈ 0 (±10% of fee) → grading is a genuine gamble, not free money.

## Verification routes (smoke, §13.5 — run end-to-end on the live build)
- **Reference duel route:** set decks → draw → play Fire Cat on turn 1 → play Fire Dragon when pips reach 7 → attack each turn → reduce boss to 0 → win screen → reward payout credited.
- **Contrast duel route:** deliberately never play creatures + waste pips → should lose badly (decisions matter, L2).
- **Comeback test (L4):** construct boss at 30 HP vs. player 10 HP → a recovery route (heal + big bomb) exists → comeback reachable.
- **Economy route:** win quest → open pack → grade a card → sell it → gold delta matches the model.
- **Online PvP smoke:** two browser tabs join a room, play a full duel to a winner, reset loop works; hidden hand never leaks (checked in the state frames).

## Deadlines / entry
- Launch → first playable action: ≤ 3 clicks from the page load.
- A fresh player reaches their first duel ≤ 60 s without any external reading (guidance via salience, not walls of text).

## Accessibility / localization
- Every player-visible string lives in `strings.js` (zero UI literals in code).
- Keyboard bindings reference `event.code` (physical keys), gamepad buttons mapped — every verb performable with keyboard, touch, and gamepad.
- Tap targets ≥ 44 px; color pairs on critical signals distinct under common color blindness.
