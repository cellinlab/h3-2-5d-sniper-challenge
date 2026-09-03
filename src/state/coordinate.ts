/**
 * Coordinate mapping between the rendered 16:9 scene rectangle and
 * screen space. We always work in normalized [0, 1] coordinates inside
 * the active scene rectangle so a reticle position survives viewport
 * resizes, letterboxing, and the wide <-> scope switch.
 *
 * All screen inputs are absolute CSS pixels (clientX / clientY). The
 * active scene rectangle is computed by `fitSceneRect` and accounts
 * for letterboxing, so callers can simply subtract the rect origin
 * to drop into scene-local coordinates.
 */

import type { NormalizedCoord } from "../types/scene";

export type SceneRect = {
  /** left edge in CSS pixels relative to the viewport */
  x: number;
  /** top edge in CSS pixels relative to the viewport */
  y: number;
  /** width in CSS pixels */
  w: number;
  /** height in CSS pixels */
  h: number;
};

export const REFERENCE_W = 1920;
export const REFERENCE_H = 1080;
export const SCENE_ASPECT = REFERENCE_W / REFERENCE_H;

/** Default scope magnification. A 1px movement inside the lens moves
 *  the aim 1/magnification px in the scene. */
export const SCOPE_MAGNIFICATION = 2.6;

/**
 * Fit a 16:9 scene inside a viewport using letterboxing.
 * Returns the scene rectangle in CSS pixels.
 */
export function fitSceneRect(viewportW: number, viewportH: number): SceneRect {
  if (viewportW <= 0 || viewportH <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const viewportAspect = viewportW / viewportH;
  let w: number;
  let h: number;
  if (viewportAspect > SCENE_ASPECT) {
    // viewport wider than 16:9, letterbox left/right
    h = viewportH;
    w = h * SCENE_ASPECT;
  } else {
    w = viewportW;
    h = w / SCENE_ASPECT;
  }
  return {
    x: (viewportW - w) / 2,
    y: (viewportH - h) / 2,
    w,
    h,
  };
}

/**
 * Convert absolute clientX/Y into scene-local CSS pixels (the
 * position relative to the scene rect's top-left corner, not the
 * viewport). The caller decides whether the result lies inside the
 * scene by checking the [0, rect.w] x [0, rect.h] range.
 */
export function clientToSceneLocal(
  clientX: number,
  clientY: number,
  rect: SceneRect,
): { x: number; y: number } {
  return { x: clientX - rect.x, y: clientY - rect.y };
}

/** Convert a clientX/Y to a normalized scene coord; returns null
 *  when the point is outside the scene rect. */
export function clientToSceneCoord(
  clientX: number,
  clientY: number,
  rect: SceneRect,
): NormalizedCoord | null {
  if (rect.w === 0 || rect.h === 0) return null;
  const local = clientToSceneLocal(clientX, clientY, rect);
  const u = local.x / rect.w;
  const v = local.y / rect.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  if (Number.isNaN(u) || Number.isNaN(v)) return null;
  return { u, v };
}

/** Convert a normalized scene coord back to absolute screen-space CSS pixels. */
export function sceneCoordToClient(coord: NormalizedCoord, rect: SceneRect): { x: number; y: number } {
  return {
    x: rect.x + coord.u * rect.w,
    y: rect.y + coord.v * rect.h,
  };
}

/** Clamp a normalized coord into [0, 1] on both axes. */
export function clampCoord(coord: NormalizedCoord): NormalizedCoord {
  return {
    u: Math.min(1, Math.max(0, coord.u)),
    v: Math.min(1, Math.max(0, coord.v)),
  };
}

/** Distance between two normalized coords, in scene-space units. */
export function coordDistance(a: NormalizedCoord, b: NormalizedCoord): number {
  const du = a.u - b.u;
  const dv = a.v - b.v;
  return Math.hypot(du, dv);
}

/**
 * Map a normalized coord to its logical grid cell. The grid is
 * `cols` x `rows` covering the full [0, 1] x [0, 1] scene.
 */
export function coordToGridCell(
  coord: NormalizedCoord,
  grid: { cols: number; rows: number },
): { col: number; row: number } {
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(coord.u * grid.cols)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(coord.v * grid.rows)));
  return { col, row };
}

/** Lens rectangle in absolute CSS pixels, centered on the entry's
 *  screen position and sized as a fraction of the scene rect. */
export function lensRectForEntry(
  entry: NormalizedCoord,
  rect: SceneRect,
  sizeFraction: number = 0.5,
): SceneRect {
  const center = sceneCoordToClient(entry, rect);
  // Keep the lens square in CSS pixels but clamp to a fraction of
  // the scene rect so it always fits on a 16:9 canvas.
  const size = Math.min(rect.w * sizeFraction, rect.h * sizeFraction);
  return {
    x: center.x - size / 2,
    y: center.y - size / 2,
    w: size,
    h: size,
  };
}

/**
 * Convert a clientX/Y inside the scope lens to the corresponding
 * normalized scene coord, accounting for magnification and the
 * entry anchor. Returns null if the point is outside the lens.
 *
 *   scene_u = entry.u + (mx - lens.centerX) / (mag * rect.w)
 *   scene_v = entry.v + (my - lens.centerY) / (mag * rect.h)
 */
export function lensToSceneCoord(
  clientX: number,
  clientY: number,
  entry: NormalizedCoord,
  rect: SceneRect,
  lens: SceneRect,
  magnification: number = SCOPE_MAGNIFICATION,
): NormalizedCoord | null {
  if (rect.w === 0 || rect.h === 0) return null;
  if (magnification <= 0) return null;
  const centerX = lens.x + lens.w / 2;
  const centerY = lens.y + lens.h / 2;
  const u = entry.u + (clientX - centerX) / (magnification * rect.w);
  const v = entry.v + (clientY - centerY) / (magnification * rect.h);
  return { u, v };
}

/**
 * Inverse of `lensToSceneCoord`. Given a scene coord, project it
 * onto the lens screen using the same magnification that
 * `lensToSceneCoord` uses. The two functions are exact inverses.
 */
export function sceneCoordToScreenInScope(
  coord: NormalizedCoord,
  rect: SceneRect,
  lens: SceneRect,
  entry: NormalizedCoord,
  magnification: number = SCOPE_MAGNIFICATION,
): { x: number; y: number } {
  const centerX = lens.x + lens.w / 2;
  const centerY = lens.y + lens.h / 2;
  return {
    x: centerX + (coord.u - entry.u) * magnification * rect.w,
    y: centerY + (coord.v - entry.v) * magnification * rect.h,
  };
}

/** Clamp an (x, y) point in absolute screen pixels to the lens
 *  rectangle, so the on-screen reticle never leaves the lens even
 *  when the user drags the mouse off-screen. */
export function clampPointToLens(
  clientX: number,
  clientY: number,
  lens: SceneRect,
): { x: number; y: number } {
  return {
    x: Math.min(lens.x + lens.w, Math.max(lens.x, clientX)),
    y: Math.min(lens.y + lens.h, Math.max(lens.y, clientY)),
  };
}
