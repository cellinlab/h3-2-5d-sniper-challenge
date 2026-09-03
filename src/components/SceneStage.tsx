/**
 * SceneStage owns the master canvas, the wide view, the magnified
 * scope view, the target compositor, the per-round clock, and the
 * danger escalation. It deliberately has no game state of its own
 * beyond the canvas dimensions; everything else is driven by props
 * from the orchestrator in App.tsx so the state machine stays the
 * single source of truth.
 *
 * Media pipeline
 * --------------
 * Each scene declares a `masterMedia` contract. The same
 * `HTMLVideoElement` is the master clock for both the wide view and
 * the magnified scope view, so a single 16:9 camera drives both
 * without drift. The element is `muted + playsInline + loop`, kept
 * off-screen but in the DOM so the browser can preload it. Drawing
 * uses a deterministic source-rect crop (see `videoSource.ts`) so
 * the picture never stretches; the transparent target PNG is still
 * composited on top as a separate overlay.
 *
 * Autoplay gating
 * ---------------
 * `muted` allows autoplay, but a strict browser may still reject the
 * first `play()` if it is not inside a user gesture. The "进入任务"
 * button is the gesture: it dispatches the round start, SceneStage
 * mounts, and `useLayoutEffect` calls `play()` within the same task
 * as the click. If the call still rejects, we retry on the next
 * user interaction with the page.
 *
 * Drawing convention: every canvas is positioned in stage-local
 * CSS pixels via the `left`/`top`/`width`/`height` style. Inside a
 * canvas we translate once to scene-local coordinates and then draw
 * in those coordinates — never re-apply rect.x / rect.y inside the
 * draw helpers. HTML overlays (the reticle, scope frame, danger
 * text) keep using stage coordinates.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { drawAtmosphere, type AtmosphereFrame } from "../scene/blueHourBackground";
import { applyWideCanvasSetup, wideCanvasCssRect } from "../scene/canvasSetup";
import {
  clientToSceneCoord,
  clampPointToLens,
  fitSceneRect,
  lensRectForEntry,
  lensToSceneCoord,
  SCOPE_MAGNIFICATION,
  sceneCoordToClient,
  type SceneRect,
} from "../state/coordinate";
import {
  isVideoReady,
  targetDrawRectFor,
  videoSourceRectForScene,
  type VideoSourceRect,
} from "../scene/videoSource";
import type { NormalizedCoord, SceneConfig, TargetPlacement } from "../types/scene";
import { Reticle } from "./Reticle";

type Props = {
  scene: SceneConfig;
  phase: "observing" | "scoped" | "success" | "failure" | "missing-media";
  crosshair: NormalizedCoord;
  scopeReticle: NormalizedCoord;
  scopeEntry: NormalizedCoord | null;
  onPointerMove: (coord: NormalizedCoord | null) => void;
  /** Right-click handler. Receives the resolved normalized scene
   *  coord at the pointer position so the caller does not depend
   *  on a prior pointermove. */
  onContextMenu: (
    e: React.MouseEvent,
    sceneCoordAtPointer: NormalizedCoord | null,
  ) => void;
  /** Left click. Receives the resolved normalized scene coord. */
  onMouseDown: (
    button: number,
    sceneCoordAtPointer: NormalizedCoord | null,
  ) => void;
  startedAt: number | null;
  danger: "calm" | "warning" | "final";
  showTarget: boolean;
  hitFlash: { id: string; at: number } | null;
  audioOn: boolean;
  onMissingMedia: () => void;
};

/**
 * Draw the target art into an already-translated context. All
 * parameters are scene-local; no rect.x / rect.y allowed here.
 *
 * The logical hit area is the halfSize ellipse (used by `hitTest`).
 * The draw rect is computed by `targetDrawRectFor` so the 1024x1536
 * portrait art is contained inside the hit box without distortion.
 * The hit area and the draw rectangle are intentionally separate:
 * the player can land the shot anywhere inside the ellipse, while
 * the figure stays recognizable as a 2:3 portrait.
 */
const drawTargetSceneLocal = (
  ctx: CanvasRenderingContext2D,
  rect: SceneRect,
  target: TargetPlacement,
  img: HTMLImageElement,
  flash: boolean,
) => {
  const draw = targetDrawRectFor(target.center, target.halfSize, rect);
  if (draw.w === 0 || draw.h === 0) return;
  ctx.save();
  if (flash) {
    ctx.shadowColor = "rgba(214, 150, 74, 0.8)";
    ctx.shadowBlur = 30;
  }
  ctx.globalAlpha = flash ? 1 : 0.92;
  ctx.drawImage(img, draw.x, draw.y, draw.w, draw.h);
  ctx.restore();
};

/**
 * Draw the scene background to an already-translated context. If a
 * video master is configured AND the element has decoded data, the
 * video frame is drawn at the full scene size using the centered
 * 16:9 source rect. Otherwise the procedural atmosphere acts as a
 * deterministic placeholder (also used for `locked` scenes and the
 * brief pre-decode moment of a video scene).
 *
 * Both wide and scope callers draw at canvas-local (0, 0) to
 * (rect.w, rect.h) — the scope's own transform then samples a
 * magnified sub-region of that same draw, so the wide and scope
 * see one identical picture rather than two different ones.
 */
const drawSceneMedia = (
  ctx: CanvasRenderingContext2D,
  rect: SceneRect,
  scene: SceneConfig,
  video: HTMLVideoElement | null,
  sourceRect: VideoSourceRect,
  t: number,
  danger: AtmosphereFrame["danger"],
) => {
  if (
    scene.masterMedia.kind === "video" &&
    isVideoReady(video) &&
    sourceRect.sw > 0 &&
    sourceRect.sh > 0
  ) {
    ctx.drawImage(
      video,
      sourceRect.sx,
      sourceRect.sy,
      sourceRect.sw,
      sourceRect.sh,
      0,
      0,
      rect.w,
      rect.h,
    );
    return;
  }
  const frame: AtmosphereFrame = { t, w: rect.w, h: rect.h, danger };
  drawAtmosphere(ctx, frame);
};

/**
 * Draw the wide scene (media + target) at 1x scale. Caller is
 * responsible for translating to scene-local coordinates and for
 * sizing the underlying canvas.
 */
const drawWideScene = (
  ctx: CanvasRenderingContext2D,
  rect: SceneRect,
  scene: SceneConfig,
  video: HTMLVideoElement | null,
  sourceRect: VideoSourceRect,
  targetImg: HTMLImageElement | null,
  hitFlash: { id: string; at: number } | null,
  t: number,
  danger: AtmosphereFrame["danger"],
) => {
  drawSceneMedia(ctx, rect, scene, video, sourceRect, t, danger);
  if (targetImg && scene.targets[0]) {
    const flash = !!(hitFlash && Date.now() - hitFlash.at < 500);
    drawTargetSceneLocal(ctx, rect, scene.targets[0], targetImg, flash);
  }
};

/**
 * Draw the magnified scope view. Caller is responsible for sizing
 * the underlying canvas to the lens size. After this function
 * returns, the transform is restored.
 */
const drawScopeScene = (
  ctx: CanvasRenderingContext2D,
  rect: SceneRect,
  scene: SceneConfig,
  video: HTMLVideoElement | null,
  sourceRect: VideoSourceRect,
  targetImg: HTMLImageElement | null,
  hitFlash: { id: string; at: number } | null,
  t: number,
  danger: AtmosphereFrame["danger"],
  entry: NormalizedCoord,
  lens: SceneRect,
  magnification: number,
) => {
  // Translate the lens so its center sits at the canvas origin,
  // scale, then translate so the entry point is at the canvas origin.
  // After this, drawing in scene coords (0..rect.w, 0..rect.h) shows
  // the magnified portion centered on the entry. The same source
  // rect used for the wide view is reused here, so the wide and
  // scope pictures come from the same frame at the same instant.
  ctx.save();
  ctx.translate(lens.w / 2, lens.h / 2);
  ctx.scale(magnification, magnification);
  ctx.translate(-entry.u * rect.w, -entry.v * rect.h);
  drawSceneMedia(ctx, rect, scene, video, sourceRect, t, danger);
  if (targetImg && scene.targets[0]) {
    const flash = !!(hitFlash && Date.now() - hitFlash.at < 500);
    drawTargetSceneLocal(ctx, rect, scene.targets[0], targetImg, flash);
  }
  // Subtle optical-feel: very slight edge darken for the scope so it
  // feels like a real lens without going cyberpunk.
  ctx.restore();
  const edge = ctx.createRadialGradient(
    lens.w / 2,
    lens.h / 2,
    Math.min(lens.w, lens.h) * 0.35,
    lens.w / 2,
    lens.h / 2,
    Math.max(lens.w, lens.h) * 0.55,
  );
  edge.addColorStop(0, "rgba(0, 0, 0, 0)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.save();
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, lens.w, lens.h);
  ctx.restore();
};

/**
 * The master `<video>` element lives off-screen but in the DOM. The
 * browser will only preload and decode an element it can see (or
 * can be queried for layout), so we keep it at zero size with
 * `pointer-events: none` and a tiny opacity. Any layout-affecting
 * `display: none` would suppress preloading in some browsers.
 */
const MASTER_VIDEO_STYLE: React.CSSProperties = {
  position: "absolute",
  left: -9999,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};

export const SceneStage = ({
  scene,
  phase,
  crosshair,
  scopeReticle,
  scopeEntry,
  onPointerMove,
  onMouseDown,
  onContextMenu,
  startedAt,
  danger,
  showTarget,
  hitFlash,
  audioOn,
  onMissingMedia,
}: Props) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const wideCanvasRef = useRef<HTMLCanvasElement>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioOnRef = useRef(audioOn);
  const rafRef = useRef<number | null>(null);
  // The live viewport pointer is owned by SceneStage now (it used
  // to be hoisted into App). Keeping it here means each pointer
  // event triggers a state update local to the scene component and
  // does not bubble through the global App reducer.
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pointerTick, setPointerTick] = useState<number>(0);
  const [rect, setRect] = useState<SceneRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [targetImg, setTargetImg] = useState<HTMLImageElement | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);

  // Measure the stage and compute the 16:9 scene rectangle.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      setRect(fitSceneRect(r.width, r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Preload the target image. If the art path is missing or fails to
  // decode, surface a designed error rather than a blank scene.
  useEffect(() => {
    const target = scene.targets[0];
    if (!target) {
      setTargetImg(null);
      return;
    }
    setTargetError(null);
    const img = new Image();
    img.onload = () => setTargetImg(img);
    img.onerror = () => setTargetError(target.artPath);
    img.src = target.artPath;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [scene]);

  // Load and start the configured master in one ordered effect.
  // Calling `load()` in a separate effect after `play()` would pause
  // the element again, which is especially easy to miss when the
  // first decoded frame happens to be dark.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoError(null);
    setAutoplayBlocked(false);
    if (scene.masterMedia.kind === "video") {
      const wantSrc = scene.masterMedia.src;
      if (video.getAttribute("src") !== wantSrc) {
        video.src = wantSrc;
      }
      video.loop = scene.masterMedia.loop ?? true;
      // Muted autoplay gives us moving frames even under strict
      // browser policies. Once play resolves, restore the user's
      // current audio preference.
      video.muted = true;
      video.volume = 0.32;
      video.playsInline = true;
      video.preload = "auto";
      video.load();
      const startPlayback = async () => {
        try {
          await video.play();
          video.muted = !audioOnRef.current;
          setAutoplayBlocked(false);
        } catch {
          setAutoplayBlocked(true);
        }
      };
      void startPlayback();
    } else {
      video.removeAttribute("src");
      video.load();
    }
    return () => video.pause();
  }, [scene.masterMedia]);

  // H3 native ambience follows the same mute control as generated
  // speech and Web Audio cues. Keep its bed deliberately low so the
  // short mission-control lines remain clear.
  useEffect(() => {
    audioOnRef.current = audioOn;
    const video = videoRef.current;
    if (!video) return;
    video.muted = !audioOn;
    video.volume = 0.32;
  }, [audioOn]);

  // Listen for the master video's load error. We intentionally do
  // not listen for `loadeddata` here: the rAF loop reads
  // `video.readyState` every frame, which is the only signal that
  // matters for "can we draw this frame yet".
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onError = () => {
      setVideoError(video.error?.message ?? "video load failed");
    };
    video.addEventListener("error", onError);
    return () => video.removeEventListener("error", onError);
  }, []);

  // Autoplay/audio retry. A following pointer gesture can both start
  // a policy-blocked video and unmute its H3 ambience.
  useEffect(() => {
    if (!autoplayBlocked && !(audioOn && videoRef.current?.muted)) return;
    const video = videoRef.current;
    if (!video) return;
    const onInteract = () => {
      video.muted = true;
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          video.muted = !audioOnRef.current;
          setAutoplayBlocked(false);
        }).catch(() => undefined);
      }
    };
    window.addEventListener("pointerdown", onInteract, { once: true });
    return () => window.removeEventListener("pointerdown", onInteract);
  }, [autoplayBlocked, audioOn]);

  // Reset only when the round clock changes. Entering or leaving the
  // scope must never seek the shared master video.
  useEffect(() => {
    if (scene.masterMedia.kind !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
      // ignore
    }
  }, [startedAt, scene.masterMedia]);

  useEffect(() => {
    if (targetError || videoError) onMissingMedia();
  }, [targetError, videoError, onMissingMedia]);

  // Render loop. Two canvases share the master video element (and
  // therefore its currentTime) so the wide and scope views stay in
  // lock-step. The same source rect is used for both; the scope's
  // transform does the magnification.
  useEffect(() => {
    const wide = wideCanvasRef.current;
    const scope = scopeCanvasRef.current;
    if (!wide) return;
    const wctx = wide.getContext("2d");
    const sctx = scope?.getContext("2d") ?? null;
    if (!wctx) return;

    const dpr = window.devicePixelRatio || 1;

    const drawFrame = (nowMs: number) => {
      const t = startedAt ? (nowMs - startedAt) / 1000 : 0;
      // Canvas is positioned via CSS at (rect.x, rect.y) with size
      // (rect.w, rect.h). applyWideCanvasSetup sizes the backing
      // store and resets the transform to DPR only — drawing at
      // canvas-local (0, 0) maps to stage (rect.x, rect.y), which
      // is exactly the scene rect origin. No extra translate.
      applyWideCanvasSetup(wide, wctx, rect, dpr);
      // Letterbox outside the scene rect is filled by the
      // `.scene-stage` CSS background; we do not paint it here.
      const video = videoRef.current;
      const sourceRect: VideoSourceRect = video
        ? videoSourceRectForScene(video.videoWidth, video.videoHeight)
        : { sx: 0, sy: 0, sw: 0, sh: 0 };
      drawWideScene(
        wctx,
        rect,
        scene,
        video,
        sourceRect,
        showTarget ? targetImg : null,
        hitFlash,
        t,
        danger,
      );

      // Scope view: only render when scoped and the entry is known.
      const inScope = phase === "scoped" && scopeEntry;
      if (inScope && scope && sctx) {
        const lens = lensRectForEntry(scopeEntry, rect, 0.5);
        const sx = Math.max(0, Math.round(lens.w * dpr));
        const sy = Math.max(0, Math.round(lens.h * dpr));
        if (scope.width !== sx || scope.height !== sy) {
          scope.width = sx;
          scope.height = sy;
        }
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.clearRect(0, 0, lens.w, lens.h);
        drawScopeScene(
          sctx,
          rect,
          scene,
          video,
          sourceRect,
          showTarget ? targetImg : null,
          hitFlash,
          t,
          danger,
          scopeEntry,
          lens,
          SCOPE_MAGNIFICATION,
        );
      } else if (scope && sctx) {
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, scope.width, scope.height);
      }

    };
    const animate = (nowMs: number) => {
      drawFrame(nowMs);
      rafRef.current = requestAnimationFrame(animate);
    };
    const drawFromVideoEvent = () => drawFrame(performance.now());
    const video = videoRef.current;
    // Paint once synchronously so background/automated browser tabs
    // do not remain at the canvas default 300x150 while rAF is
    // throttled. Video events keep that fallback frame fresh.
    drawFrame(performance.now());
    video?.addEventListener("loadeddata", drawFromVideoEvent);
    video?.addEventListener("timeupdate", drawFromVideoEvent);

    // Prefer `requestVideoFrameCallback` when the video element is
    // ready. The browser fires it exactly when a new video frame is
    // available, so the wide and scope canvases draw the same
    // picture in lock-step with the video's intrinsic clock instead
    // of polling at 60 Hz. Fall back to rAF for procedural scenes
    // and for browsers that lack the API. The wide/scope canvases
    // are still driven from the same `drawFrame` and the same
    // `sourceRect`, so they cannot drift regardless of which clock
    // triggers the draw.
    type RVFCVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    let rvfcHandle: number | null = null;
    const rvfcVideo = video as RVFCVideo | null;
    if (rvfcVideo?.requestVideoFrameCallback) {
      const rvfcAnimate = () => {
        drawFrame(performance.now());
        rvfcHandle = rvfcVideo.requestVideoFrameCallback!(rvfcAnimate);
      };
      rvfcHandle = rvfcVideo.requestVideoFrameCallback(rvfcAnimate);
    } else {
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (rvfcHandle !== null && rvfcVideo?.cancelVideoFrameCallback) {
        rvfcVideo.cancelVideoFrameCallback(rvfcHandle);
      }
      video?.removeEventListener("loadeddata", drawFromVideoEvent);
      video?.removeEventListener("timeupdate", drawFromVideoEvent);
    };
  }, [rect, danger, scene, startedAt, showTarget, targetImg, hitFlash, phase, scopeEntry]);

  // Pointer move. The raw event only writes the latest clientX/Y
  // into a ref. A pending requestAnimationFrame flush is scheduled
  // at most once per frame; when it fires, the ref is read and we
  // bump `pointerTick` + call `onPointerMove` exactly once. This is
  // real per-frame batching: a 240Hz+ high-DPI mouse cannot flood
  // the React scheduler with one update per event, and unlike the
  // previous 16ms timestamp check, no event in the window is
  // dropped (the ref always holds the freshest position and the
  // next rAF flush picks it up).
  const pendingPointerRafRef = useRef<number | null>(null);
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (pendingPointerRafRef.current !== null) return;
    pendingPointerRafRef.current = requestAnimationFrame(() => {
      pendingPointerRafRef.current = null;
      const { x, y } = pointerRef.current;
      setPointerTick((n) => n + 1);
      onPointerMove(clientToSceneCoord(x, y, rect));
    });
  };
  // Cancel any pending flush on unmount so we never dispatch into
  // an unmounted component.
  useEffect(() => {
    return () => {
      if (pendingPointerRafRef.current !== null) {
        cancelAnimationFrame(pendingPointerRafRef.current);
        pendingPointerRafRef.current = null;
      }
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    // While scoped, the lens is showing a magnified portion of the
    // scene. A click inside the lens is aiming at the scene point
    // under the cursor *in the magnified view*, not the wide view.
    const coord =
      phase === "scoped" && scopeEntry && lens
        ? lensToSceneCoord(e.clientX, e.clientY, scopeEntry, rect, lens)
        : clientToSceneCoord(e.clientX, e.clientY, rect);
    onMouseDown(e.button, coord);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Right-click while observing: use the wide-view scene coord
    // (the same one a pointermove would have produced) as the
    // scope entry. While scoped, the click is interpreted as exit.
    onContextMenu(e, clientToSceneCoord(e.clientX, e.clientY, rect));
  };

  // Onboarding hint. A small transient copy that follows the phase
  // and fades after the relevant first action. Kept on the upper
  // third of the stage (well above the scope's bottom-center anchor
  // and the warning text) so it never occludes the scene. The hint
  // uses a short display window and a single fade transition; it
  // never blocks input and never becomes a modal.
  const [hintVisible, setHintVisible] = useState<boolean>(true);
  useEffect(() => {
    if (phase !== "observing" && phase !== "scoped") {
      setHintVisible(false);
      return;
    }
    setHintVisible(true);
    const dismiss = window.setTimeout(() => setHintVisible(false), 3200);
    return () => window.clearTimeout(dismiss);
  }, [phase]);
  // Dismiss early on the first relevant user action so the hint does
  // not linger over the scene while the player is engaged.
  useEffect(() => {
    if (!hintVisible) return;
    if (phase === "observing" && (crosshair.u !== 0.5 || crosshair.v !== 0.5)) {
      setHintVisible(false);
    }
  }, [phase, crosshair.u, crosshair.v, hintVisible]);
  useEffect(() => {
    if (!hintVisible) return;
    if (
      phase === "scoped" &&
      scopeEntry &&
      (scopeReticle.u !== scopeEntry.u || scopeReticle.v !== scopeEntry.v)
    ) {
      setHintVisible(false);
    }
  }, [phase, scopeEntry, scopeReticle.u, scopeReticle.v, hintVisible]);
  const hintCopy =
    phase === "scoped" ? "移动寻找目标 · 左键射击" : "移动鼠标观察 · 右键开镜";

  // Lens position for rendering the scope frame and the reticle.
  const lens = useMemo(() => {
    if (phase !== "scoped" || !scopeEntry) return null;
    return lensRectForEntry(scopeEntry, rect, 0.5);
  }, [phase, scopeEntry, rect]);

  // The wide-view reticle: scene-local -> absolute screen coords.
  const wideReticleScreen = useMemo(
    () => sceneCoordToClient(crosshair, rect),
    [crosshair, rect],
  );

  // The scope reticle position: clamp the live pointer to the lens,
  // so the reticle never leaves the lens even when the mouse goes
  // outside the scene rect.
  const scopeReticleScreen = useMemo(() => {
    if (!lens) return null;
    return clampPointToLens(pointerRef.current.x, pointerRef.current.y, lens);
    // pointerTick is the React-side throttle; without including it,
    // the memo would never recompute because the ref change does
    // not invalidate it.
  }, [lens, pointerTick]);

  // Compute the reticle's screen position for the current phase.
  const reticleScreen =
    phase === "scoped" ? scopeReticleScreen ?? wideReticleScreen : wideReticleScreen;
  const reticleVariant: "observation" | "scope" = phase === "scoped" ? "scope" : "observation";

  // The aim coord that the reticle is "pointing at" in scene coords.
  // For wide view, that's the crosshair. For scope, recompute from
  // the pointer position so it stays in lock-step with what the
  // magnified lens is actually showing.
  const reticleSceneCoord = useMemo<NormalizedCoord>(() => {
    if (phase === "scoped" && lens && scopeEntry) {
      const coord = lensToSceneCoord(
        reticleScreen.x,
        reticleScreen.y,
        scopeEntry,
        rect,
        lens,
        SCOPE_MAGNIFICATION,
      );
      return coord ?? scopeReticle;
    }
    return crosshair;
  }, [phase, lens, scopeEntry, rect, reticleScreen.x, reticleScreen.y, scopeReticle, crosshair]);

  // Notify the orchestrator when the scope reticle's scene coord
  // changes, so the state machine and the hit test see the same
  // value that the magnified view is rendering.
  useEffect(() => {
    if (phase !== "scoped") return;
    onPointerMove(reticleSceneCoord);
  }, [phase, reticleSceneCoord.u, reticleSceneCoord.v, onPointerMove]);

  // Keep every hook above conditional rendering. Media errors can
  // arrive after the component has already rendered a healthy frame;
  // returning before the reticle hooks would then change the hook
  // count and make React unmount the whole game instead of showing the
  // designed recovery state.
  if (targetError || videoError) {
    return (
      <div className="scene-stage" ref={stageRef}>
        {/* App owns the single recovery overlay. Keep only the media
            node mounted here so returning to scene selection can
            recover without exposing decoder details to the player. */}
        <video
          ref={videoRef}
          muted={!audioOn}
          playsInline
          loop
          preload="auto"
          style={MASTER_VIDEO_STYLE}
          data-testid="master-video"
        />
      </div>
    );
  }

  return (
    <div
      className={`scene-stage crosshair-cursor`}
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      data-phase={phase}
    >
      <video
        ref={videoRef}
        muted={!audioOn}
        playsInline
        loop
        preload="auto"
        style={MASTER_VIDEO_STYLE}
        data-testid="master-video"
      />
      <canvas
        ref={wideCanvasRef}
        className="scene-canvas"
        style={wideCanvasCssRect(rect)}
        data-testid="wide-canvas"
      />
      {lens && (
        <canvas
          ref={scopeCanvasRef}
          className="scope-canvas"
          data-testid="scope-canvas"
          style={{
            left: lens.x,
            top: lens.y,
            width: lens.w,
            height: lens.h,
          }}
        />
      )}
      {lens && (
        <div
          className="scope-frame"
          style={{
            left: lens.x,
            top: lens.y,
            width: lens.w,
            height: lens.h,
          }}
          aria-hidden
        />
      )}
      <div
        className={`reticle ${reticleVariant}`}
        style={{ left: reticleScreen.x, top: reticleScreen.y }}
        data-testid="reticle"
      >
        <Reticle variant={reticleVariant} />
      </div>
      {hintVisible && (phase === "observing" || phase === "scoped") && (
        <div
          className="onboarding-hint"
          data-testid="onboarding-hint"
          data-phase={phase}
        >
          {hintCopy}
        </div>
      )}
    </div>
  );
};
