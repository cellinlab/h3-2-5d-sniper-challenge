# Game Studio Optimization Review

Date: 2026-09-03

This pass keeps the existing React + Canvas 2D/2.5D architecture. Do not migrate the game to Phaser or 3D. The goal is a tighter, more reliable desktop recording build, not a larger game.

## Baseline

- Real H3-derived 1920×1080 loop drives one shared `HTMLVideoElement` for both wide and scope canvases.
- MiniMax Speech 2.8 provides seven local voice lines.
- H3 ambience, synthesized UI/shot/hit cues, and adaptive heartbeat already form the audio hierarchy.
- Baseline verification: 8 test files, 127 tests, and production build pass.

## P0 — correctness and protocol integrity

1. Fix the scene protocol drift.
   - `validateSceneConfig` requires `protocolVersion`, but `SceneConfig` and the runtime `SCENES` objects omit it.
   - Add the protocol version to the public type and every scene manifest.
   - Validate exported runtime scenes, not only test fixtures.
   - Locked teaser scenes may legitimately have zero targets; active playable scenes must have at least one target.
   - Add focused tests for both cases and for unknown protocol versions.

2. Preserve exact target geometry.
   - The source target is 1024×1536, but the current compositor stretches it into a landscape rectangle.
   - Separate the logical hit area from the image draw rectangle.
   - Compute a pure, tested, aspect-preserving `contain` rectangle around the target's bottom-center anchor.
   - The wide view should be subtle enough to require observation; the scope view may be clearer. Do not add a glowing outline or HUD marker that gives the answer away.

3. Make first-click scope entry deterministic.
   - Opening the scope at a point must initialize both the scope entry and the live reticle from that event, even when no previous pointer move has fired.
   - The first left click at the lens center must hit a target when the scope was opened exactly on its center.
   - Add a regression test around this interaction contract.

## P1 — interaction and recording polish

1. Add minimal progressive onboarding.
   - During a player's first observation, show a small transient hint for moving the reticle and right-clicking to scope.
   - On first scope entry, replace it with a short hint for aiming and left-clicking to fire.
   - Fade or dismiss after the relevant action. Keep the lower center and target area clear.
   - Existing persistent corner controls remain the reference; do not add a tutorial modal.

2. Remove the duplicate cursor.
   - Hide the operating-system cursor only over the active scene while the custom reticle is visible.
   - Normal cursor behavior must remain on start/result buttons and recovery UI.

3. Reduce unnecessary high-frequency work.
   - The round clock currently dispatches a React state update on every animation frame. A hidden numeric timer does not need 60 Hz React updates. Throttle it to a stable low frequency while preserving accurate warning/final/timeout thresholds.
   - Avoid one global React state update plus one round-state update for every pointer event. Batch pointer work per animation frame or keep the raw viewport pointer local to the scene component.
   - For video-backed scenes, prefer `requestVideoFrameCallback` when available, with an animation-frame/event fallback for unsupported browsers and procedural scenes. Do not let the scope and wide canvases drift.
   - Keep helpers pure where practical and cover timing/mapping behavior with focused tests.

## P2 — only if clean and bounded

- If the implementation stays small, pause the active round when the page becomes hidden and require a click/key to resume. Do not let a hidden tab consume the player's unseen time. If this would destabilize the state machine, document it as deferred instead of partially implementing it.

## Audio decision — updated after the Music 3.0 generation pass

- Keep the truthful four-layer stack: H3 native ambience + MiniMax Speech 2.8 + MiniMax Audio Music 3.0 + code-generated cues/heartbeat.
- The chosen `Blue Hour Relay` file was generated in the logged-in Music 3.0 web product after the Music 2.6 API rejected new-user access. Do not describe it as an API-generation success, and do not commit the generated file.
- Music uses one cached looping element at `0.16`; active Speech ducks it to `0.048` over 220 ms and restores it only when the current voice ends or errors. A superseded voice must not restore the mix.
- `M` silences H3, Speech, Music and Web Audio together. Page-hidden pause keeps music `currentTime`; round resolution resets it so retry starts from the beginning. Autoplay rejection and missing audio remain non-fatal.

## Non-goals

- No Phaser/Three.js rewrite.
- No mobile acceptance expansion.
- No new H3 generation or paid credit consumption.
- No additional scenes or progression system.
- No credentials or generated media committed to Git.

## Required verification

- Run the complete test suite and production build.
- Report changed files, test totals, build result, manual checks, and anything deliberately deferred.
- Preserve the existing missing-media recovery, retry, mute, one-shot, warning/final-warning, and 22-second timeout behavior.

## Completed result

- P0, P1 and the bounded P2 pause path are implemented without changing the React + Canvas architecture.
- Final verification: 10 test files, 178 tests, `tsc --noEmit`, and Vite production build pass.
- Browser playtest covers wide movement, right-click scope entry, scoped movement, deterministic center hit, scope exit, mute, danger escalation and timeout with no console error or warning.
- A second unlimited multi-target practice scene remains deferred because it needs another H3 environment clip; current 80 credits are below the 400-credit minimum for `4s / 768P`.
