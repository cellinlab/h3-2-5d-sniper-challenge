/**
 * Pure hit-testing for the target art. Lives in `state/` so it stays
 * side-effect free and easy to test, even though it is consumed by
 * the React component.
 */

import type { NormalizedCoord, SceneConfig } from "../types/scene";

// Small tolerance so floating-point arithmetic on the hitbox boundary
// still registers as a hit instead of producing a "1.0000000001" miss.
const HIT_TOLERANCE = 1e-6;

export function hitTest(aim: NormalizedCoord, scene: SceneConfig): string | null {
  for (const t of scene.targets) {
    const du = (aim.u - t.center.u) / t.halfSize.hU;
    const dv = (aim.v - t.center.v) / t.halfSize.hV;
    if (Math.hypot(du, dv) <= 1 + HIT_TOLERANCE) {
      return t.id;
    }
  }
  return null;
}
