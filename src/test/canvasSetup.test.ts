/**
 * The wide canvas is positioned in the DOM via CSS at the scene
 * rect's top-left and has a size that matches the scene rect.
 * Inside the canvas, the only allowed transform is the DPR scale:
 * a `ctx.translate(rect.x, rect.y)` would double-count the offset
 * and shift every pixel on non-16:9 viewports. These tests pin
 * that contract on the actual helpers used by SceneStage.
 */

import { describe, expect, it } from "vitest";
import { applyWideCanvasSetup, wideCanvasCssRect } from "../scene/canvasSetup";
import { fitSceneRect, type SceneRect } from "../state/coordinate";

/** Mock canvas that records width/height writes and exposes them
 *  through normal property access (matching HTMLCanvasElement). */
const makeCanvas = (initial: { width: number; height: number } = { width: -1, height: -1 }) => {
  const writes: { width: number; height: number }[] = [];
  let w = initial.width;
  let h = initial.height;
  return {
    get width() {
      return w;
    },
    set width(v: number) {
      if (v !== w) writes.push({ width: v, height: h });
      w = v;
    },
    get height() {
      return h;
    },
    set height(v: number) {
      if (v !== h) writes.push({ width: w, height: v });
      h = v;
    },
    writes,
    current: () => ({ width: w, height: h }),
  };
};

/** Mock CanvasRenderingContext2D that records every method call. */
const makeCtx = () => {
  const calls: { name: string; args: readonly unknown[] }[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
  };
  const ctx = {
    setTransform: record("setTransform"),
    transform: record("transform"),
    translate: record("translate"),
    scale: record("scale"),
    rotate: record("rotate"),
    save: record("save"),
    restore: record("restore"),
    resetTransform: record("resetTransform"),
  };
  return { ctx, calls };
};

describe("applyWideCanvasSetup", () => {
  it("sizes the backing store to rect.w * dpr by rect.h * dpr at dpr=2", () => {
    const canvas = makeCanvas();
    const { ctx } = makeCtx();
    const rect: SceneRect = { x: 100, y: 50, w: 1280, h: 720 };
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 2);
    expect(canvas.current()).toEqual({ width: 2560, height: 1440 });
  });

  it("sizes the backing store correctly at dpr=1", () => {
    const canvas = makeCanvas();
    const { ctx } = makeCtx();
    const rect: SceneRect = { x: 0, y: 0, w: 1920, h: 1080 };
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 1);
    expect(canvas.current()).toEqual({ width: 1920, height: 1080 });
  });

  it("does not re-set the canvas size when it already matches", () => {
    const canvas = makeCanvas({ width: 1920, height: 1080 });
    const { ctx, calls } = makeCtx();
    const rect: SceneRect = { x: 0, y: 0, w: 1920, h: 1080 };
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 1);
    // The transform reset still happens; only the size writes are skipped.
    expect(canvas.writes).toEqual([]);
    expect(calls.map((c) => c.name)).toEqual(["setTransform"]);
  });

  it("resets the transform to a DPR-only matrix", () => {
    const canvas = makeCanvas();
    const { ctx, calls } = makeCtx();
    const rect: SceneRect = { x: 300, y: 75, w: 1280, h: 720 };
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 2);
    expect(calls).toEqual([{ name: "setTransform", args: [2, 0, 0, 2, 0, 0] }]);
  });

  it("never calls ctx.translate with rect.x or rect.y", () => {
    const canvas = makeCanvas();
    const { ctx, calls } = makeCtx();
    // Use a non-16:9 viewport where the bug would be most visible.
    const rect = fitSceneRect(1600, 1000); // letterbox top/bottom, y = 50
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 2);
    const translateCalls = calls.filter((c) => c.name === "translate");
    expect(translateCalls).toEqual([]);
  });

  it("never calls ctx.translate with rect.x or rect.y on an ultrawide viewport", () => {
    const canvas = makeCanvas();
    const { ctx, calls } = makeCtx();
    const rect = fitSceneRect(2200, 900); // letterbox left/right, x = 300
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 1);
    const translateCalls = calls.filter((c) => c.name === "translate");
    expect(translateCalls).toEqual([]);
  });

  it("never calls ctx.save / ctx.restore / ctx.transform / ctx.scale / ctx.rotate", () => {
    const canvas = makeCanvas();
    const { ctx, calls } = makeCtx();
    const rect: SceneRect = { x: 50, y: 50, w: 800, h: 450 };
    applyWideCanvasSetup(canvas as unknown as HTMLCanvasElement, ctx as unknown as CanvasRenderingContext2D, rect, 1);
    expect(calls.map((c) => c.name)).toEqual(["setTransform"]);
  });
});

describe("wideCanvasCssRect — the canvas tracks the active scene rect exactly", () => {
  it("returns the rect's x, y, w, h on a 16:9 viewport", () => {
    const rect: SceneRect = { x: 0, y: 0, w: 1920, h: 1080 };
    expect(wideCanvasCssRect(rect)).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("letterboxes vertically on a 1600x1000 (narrow) viewport", () => {
    // 1600/1000 = 1.6 < 16/9, so the scene is 1600 wide, 900 tall,
    // pushed 50px down from the top.
    const rect = fitSceneRect(1600, 1000);
    expect(rect).toEqual({ x: 0, y: 50, w: 1600, h: 900 });
    expect(wideCanvasCssRect(rect)).toEqual({
      left: 0,
      top: 50,
      width: 1600,
      height: 900,
    });
  });

  it("letterboxes horizontally on a 2200x900 (ultrawide) viewport", () => {
    // 2200/900 = 2.444 > 16/9, so the scene is 1600 wide, 900 tall,
    // pushed 300px right from the left.
    const rect = fitSceneRect(2200, 900);
    expect(rect).toEqual({ x: 300, y: 0, w: 1600, h: 900 });
    expect(wideCanvasCssRect(rect)).toEqual({
      left: 300,
      top: 0,
      width: 1600,
      height: 900,
    });
  });
});

describe("end-to-end: scene rect -> wide canvas draw origin", () => {
  /**
   * Reproduces the rendering setup used by SceneStage. After
   * applying the helpers, drawing at canvas-local (0, 0) must
   * land at the scene rect's top-left in stage coordinates. The
   * matrix math is straightforward: the canvas's transform is
   * `setTransform(dpr, 0, 0, dpr, 0, 0)`, so canvas-local (0, 0)
   * maps to device-pixel (0, 0) which is CSS-pixel (0, 0). The
   * CSS rect places the canvas at (rect.x, rect.y), so the final
   * stage position is (rect.x, rect.y). This test asserts that
   * composition explicitly so that a future refactor cannot
   * accidentally introduce a double offset.
   */
  const projectCanvasPointToStage = (
    canvasPoint: { x: number; y: number },
    canvasCss: { left: number; top: number },
    dpr: number,
  ): { x: number; y: number } => ({
    x: canvasCss.left + canvasPoint.x / dpr,
    y: canvasCss.top + canvasPoint.y / dpr,
  });

  const checkRoundTrip = (viewportW: number, viewportH: number) => {
    const rect = fitSceneRect(viewportW, viewportH);
    const css = wideCanvasCssRect(rect);
    const dpr = 1; // keep the math obvious
    // The wide canvas top-left in stage coordinates equals the
    // scene rect's top-left: no extra translate.
    const origin = projectCanvasPointToStage({ x: 0, y: 0 }, css, dpr);
    expect(origin).toEqual({ x: rect.x, y: rect.y });
    // The wide canvas bottom-right in stage coordinates equals the
    // scene rect's bottom-right.
    const far = projectCanvasPointToStage(
      { x: rect.w * dpr, y: rect.h * dpr },
      css,
      dpr,
    );
    expect(far).toEqual({ x: rect.x + rect.w, y: rect.y + rect.h });
  };

  it("matches for a 1600x1000 viewport", () => {
    checkRoundTrip(1600, 1000);
  });
  it("matches for a 2200x900 viewport", () => {
    checkRoundTrip(2200, 900);
  });
  it("matches for a 1920x1080 viewport", () => {
    checkRoundTrip(1920, 1080);
  });
  it("matches for an 800x1400 (portrait) viewport", () => {
    checkRoundTrip(800, 1400);
  });
  it("matches for a 3440x1440 (ultrawide QHD) viewport", () => {
    checkRoundTrip(3440, 1440);
  });
});
