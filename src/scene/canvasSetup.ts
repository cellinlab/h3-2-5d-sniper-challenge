/**
 * Pure helpers for sizing and positioning the wide scene canvas.
 *
 * The wide canvas is positioned in the DOM via CSS at
 * `(rect.x, rect.y)` with size `(rect.w, rect.h)`. Inside the
 * canvas, drawing at canvas-local `(0, 0)` must therefore map to
 * stage `(rect.x, rect.y)` — which is exactly the scene rect's
 * top-left. The only transform allowed on the context is the
 * device-pixel-ratio scale; an extra `translate(rect.x, rect.y)`
 * would double-count the offset and break every non-16:9 viewport.
 */

import type { SceneRect } from "../state/coordinate";

/**
 * Size the canvas's backing store to `rect.w * dpr` x `rect.h * dpr`
 * and reset the context transform to a pure DPR scale. The caller is
 * responsible for positioning the canvas in the DOM via CSS using
 * `wideCanvasCssRect(rect)` so that canvas-local (0, 0) lands at
 * stage (rect.x, rect.y).
 *
 * Calling this with a context that already has a translate is a bug:
 * it would double-offset. The transform is reset unconditionally to
 * a DPR-only matrix.
 */
export function applyWideCanvasSetup(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  rect: SceneRect,
  dpr: number,
): void {
  const targetW = Math.max(0, Math.round(rect.w * dpr));
  const targetH = Math.max(0, Math.round(rect.h * dpr));
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  // The wide canvas is positioned via CSS at (rect.x, rect.y) with
  // size (rect.w, rect.h). The context transform must be DPR only.
  // Do NOT add ctx.translate(rect.x, rect.y) here.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * CSS rect that positions the wide canvas exactly on the active
 * scene rectangle. Returning this shape (not a raw object) keeps
 * the contract of "the wide canvas = the scene rect" explicit.
 */
export function wideCanvasCssRect(rect: SceneRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
  };
}
