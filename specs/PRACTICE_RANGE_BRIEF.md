# Tropical Practice Range — Implementation Brief

## Goal

Add one optional free-practice scene without weakening the verified North Relay mission. The new scene is a tropical rainforest research outpost generated through MiniMax `video-creator` with the Ultra plan's H2.3 video allowance.

## Media contract

- Runtime path: `/generated/rainforest-practice-h23-6s-768p.mp4`
- Actual generation settings: `MiniMax-Hailuo-2.3`, 16:9, 768P, 6 seconds, silent.
- The same `HTMLVideoElement` and frame must drive the wide view and scoped crop.
- Missing media must enter the existing designed recovery path; never silently substitute the North Relay video.
- Do not commit anything under `public/generated/`.

## Practice gameplay contract

- Scene id: `rainforest-practice`.
- The scene-selection card must clearly say this is an unlimited practice range and identify the video as H2.3, so it cannot be mistaken for the H3 main mission.
- No countdown, danger escalation, heartbeat, exposure failure, or one-shot restriction.
- Three targets on real landmarks of the generated H2.3 plate:
  - `operative-watchtower` `u=0.198 v=0.658` (art: `target-rainforest-binoculars.png`)
  - `operative-platform`   `u=0.473 v=0.736` (art: `target-rainforest-radio.png`)
  - `operative-cabin`      `u=0.769 v=0.279` (art: `target-rainforest-guard.png`)
  - `halfSize = { hU: 0.022, hV: 0.040 }` for all three (a slightly taller
    ellipse than the H3 mission's because each silhouette is a
    tight 2:3 portrait that reads correctly at 2.6× scope
    magnification).
- Scoped left click consumes one shot but a miss does not end the round.
- A hit removes only that target and returns the player to wide observation so the next target can be found.
- Success occurs only after all three targets have been hit. The result screen must report all targets cleared and total shots or accuracy.
- Eliminated targets must not render and must not be hittable again.
- The practice range shares the same generated music bed as the
  H3 mission (`music-blue-hour-relay.mp3`); the speech-duck
  layer keeps voice lines intelligible over the music.
- Right-click scope entry/exit, scoped pointer movement, `M` mute, pause/resume, retry, media recovery, shared-video timing, and target aspect-ratio rules remain supported.

## Architecture boundaries

- Keep React + Canvas 2.5D. Do not migrate to Phaser, Three.js, WebGL, or a new state library.
- Make the two rule sets explicit in typed scene configuration; do not scatter scene-id checks through components.
- Recommended discriminant: timed one-shot mission versus untimed elimination practice. Unknown modes must fail runtime scene validation.
- Preserve North Relay's 22-second hidden budget and exactly-one-shot behavior without semantic drift.
- `SceneStage` must render every live target, not only `targets[0]`.
- Hit testing must accept an exclusion set/list so cleared targets cannot be hit again.
- Keep production code free of test-only conditionals.
- The cleared-targets list is owned by the round state machine
  (`round.clearedTargetIds`); App / SceneStage / hitTest all read
  from it. A separate React mirror is forbidden — it drifts.

## HUD and interaction copy

- Main mission top-right rule remains `ONE SHOT`.
- Practice top-right rule should communicate `FREE PRACTICE` and show progress such as `1 / 3 CLEARED`.
- Practice control copy: `移动观察 · 右键开镜` in wide view and `移动瞄准 · 左键射击 · 右键退出` in scope.
- After a practice hit, show a short confirmation such as `目标 1/3 已清除` without covering the next target zone.
- Practice must not display danger-edge or position-exposure copy.

## Minimum verification

Add regression coverage for:

1. Scene config validation accepts both known rule modes and rejects unknown ones.
2. North Relay still times out at 22 seconds and still resolves after its first shot.
3. Practice ignores time ticks for failure and allows multiple shots.
4. Practice miss keeps the round active.
5. Practice hit records one unique target, prevents a duplicate hit, and returns to observation.
6. Practice resolves only when all target ids are cleared.
7. Hit testing excludes cleared targets.
8. SceneStage renders all uncleared targets and hides cleared targets.
9. Start screen exposes both playable scenes and clearly labels H3 main mission versus H2.3 practice.
10. Full test suite, TypeScript check, and production build pass.

Do not commit. Report changed files, test counts, build result, remaining visual-tuning points, and any contract you intentionally deferred.
