/**
 * Pure helpers for the shared master video.
 *
 * The wide observation view and the magnified scope view both read
 * from the same HTMLVideoElement. The video's intrinsic dimensions
 * (videoWidth / videoHeight) and the target scene's aspect ratio
 * are combined here into a deterministic source rect that keeps the
 * picture 16:9 without ever stretching pixels. The same source rect
 * is fed into both the wide and scope draws so the magnifier is a
 * true zoom on the same frame.
 *
 * The selection helper below makes the choice between the video
 * master and the procedural fallback a pure function, so it can be
 * unit-tested in jsdom (which does not decode real video frames).
 */

import type { NormalizedCoord, SceneConfig } from "../types/scene";
import type { SceneRect } from "../state/coordinate";

/** Source rectangle inside the video element, in video pixels. */
export type VideoSourceRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Target aspect ratio for the scene canvas. The shot is 16:9. */
export const SCENE_ASPECT = 16 / 9;

/**
 * Compute the largest centered 16:9 sub-rectangle inside the video.
 * If the video is already 16:9, the source is the full frame. If
 * the video is wider than 16:9, the left and right are cropped. If
 * it is narrower, the top and bottom are cropped. The result keeps
 * the video pixel-perfect 16:9 so it can fill a 16:9 canvas without
 * any stretching.
 *
 * Returns zeros for an unready video (videoW or videoH is zero);
 * callers should treat that as "do not draw" rather than "draw 0x0".
 */
export function videoSourceRectForScene(
  videoW: number,
  videoH: number,
  targetAspect: number = SCENE_ASPECT,
): VideoSourceRect {
  if (videoW <= 0 || videoH <= 0 || targetAspect <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const videoAspect = videoW / videoH;
  if (Math.abs(videoAspect - targetAspect) < 1e-6) {
    return { sx: 0, sy: 0, sw: videoW, sh: videoH };
  }
  if (videoAspect > targetAspect) {
    // Video wider than 16:9: crop the sides, keep full height.
    const sh = videoH;
    const sw = Math.round(videoH * targetAspect);
    const sx = Math.round((videoW - sw) / 2);
    return { sx, sy: 0, sw, sh };
  }
  // Video narrower than 16:9: crop top and bottom, keep full width.
  const sw = videoW;
  const sh = Math.round(videoW / targetAspect);
  const sy = Math.round((videoH - sh) / 2);
  return { sx: 0, sy, sw, sh };
}

/**
 * Minimum readyState needed before drawing a video into a canvas.
 * HAVE_CURRENT_DATA (2) means the current playback position has
 * decoded data, which is what the first paint after seeking needs.
 */
export const VIDEO_DRAW_READY_STATE = 2;

/** Type guard: the supplied element is ready to be drawn. */
export function isVideoReady(video: HTMLVideoElement | null | undefined): video is HTMLVideoElement {
  if (!video) return false;
  if (video.readyState < VIDEO_DRAW_READY_STATE) return false;
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
  return true;
}

/** Decision returned by `selectMedia`. */
export type MediaSelection =
  | { kind: "procedural" }
  | { kind: "video"; src: string; loop: boolean };

/**
 * Pick the rendering strategy for a scene based on its config and
 * the available video element. Pure: no DOM side effects. The result
 * tells the renderer whether to use the procedural atmosphere (no
 * video configured, or video not yet ready) or to draw the master
 * video at its current currentTime.
 */
export function selectMedia(
  scene: SceneConfig,
  video: HTMLVideoElement | null,
): MediaSelection {
  if (scene.masterMedia.kind === "video" && isVideoReady(video)) {
    const loop = scene.masterMedia.loop ?? true;
    return { kind: "video", src: scene.masterMedia.src, loop };
  }
  return { kind: "procedural" };
}

/**
 * Source rect inside the video that corresponds to the scope lens
 * on the wide scene. The wide scene is drawn as `sourceRect` mapped
 * to `rect.w x rect.h`; the scope magnifies the same scene by
 * `magnification`, so the scope's source rect is the entry-centered
 * sub-rectangle of `sourceRect`. Both rects are returned so the
 * caller can pass them straight into `ctx.drawImage` without
 * recomputing.
 *
 * The function is pure; it does not read `video.currentTime`. The
 * time component is shared because both the wide draw and the scope
 * draw sample the same `HTMLVideoElement` (the video element's
 * internal clock is the master).
 */
export function scopeSourceRect(
  source: VideoSourceRect,
  rect: SceneRect,
  entry: NormalizedCoord,
  lens: SceneRect,
  magnification: number,
): VideoSourceRect {
  if (source.sw === 0 || source.sh === 0) return source;
  if (rect.w <= 0 || rect.h <= 0 || lens.w <= 0 || lens.h <= 0) {
    return { sx: source.sx, sy: source.sy, sw: 0, sh: 0 };
  }
  // Convert the lens extents (in scene CSS pixels) to the same
  // fraction of the source rect that they take of the wide scene.
  // Then translate by the entry so the scope samples around the
  // entry, not the top-left.
  const halfWFrac = (lens.w / 2) / (magnification * rect.w);
  const halfHFrac = (lens.h / 2) / (magnification * rect.h);
  const cxFrac = entry.u;
  const cyFrac = entry.v;
  const sx = source.sx + (cxFrac - halfWFrac) * source.sw;
  const sw = Math.max(0, 2 * halfWFrac * source.sw);
  const sy = source.sy + (cyFrac - halfHFrac) * source.sh;
  const sh = Math.max(0, 2 * halfHFrac * source.sh);
  return { sx, sy, sw, sh };
}

/**
 * Build a no-op video element reference for callers that need the
 * shape but do not have a real DOM. The returned object implements
 * only the surface that `isVideoReady` and `selectMedia` use, so it
 * is safe to pass into tests.
 */
export type MinimalVideo = Pick<HTMLVideoElement, "readyState" | "videoWidth" | "videoHeight">;

export function isMinimalVideoReady(video: MinimalVideo | null | undefined): boolean {
  if (!video) return false;
  if (video.readyState < VIDEO_DRAW_READY_STATE) return false;
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
  return true;
}
