/**
 * Pure hit-testing for the target art. Lives in `state/` so it stays
 * side-effect free and easy to test, even though it is consumed by
 * the React component.
 *
 * The optional `excludedIds` set is the practice-mode escape
 * hatch: once a target has been cleared in a multi-target scene,
 * its id is added to the set and a subsequent click that lands
 * on the same hitbox must return null. A timed-mission scene
 * with a single target never sets this; the function signature
 * stays the same so the same call site works for both modes.
 */

import type { NormalizedCoord, SceneConfig } from "../types/scene";

// Small tolerance so floating-point arithmetic on the hitbox boundary
// still registers as a hit instead of producing a "1.0000000001" miss.
const HIT_TOLERANCE = 1e-6;

export function hitTest(
  aim: NormalizedCoord,
  scene: SceneConfig,
  excludedIds: ReadonlyArray<string> = [],
): string | null {
  const excluded = excludedIds.length === 0 ? null : new Set(excludedIds);
  for (const t of scene.targets) {
    if (excluded && excluded.has(t.id)) continue;
    const du = (aim.u - t.center.u) / t.halfSize.hU;
    const dv = (aim.v - t.center.v) / t.halfSize.hV;
    if (Math.hypot(du, dv) <= 1 + HIT_TOLERANCE) {
      return t.id;
    }
  }
  return null;
}
