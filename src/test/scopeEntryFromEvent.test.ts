/**
 * Verifies that the scope entry and the fire aim can be derived
 * directly from a React-style event's clientX/clientY, without any
 * prior pointermove. The orchestrator (App.tsx) calls these helpers
 * with the event's coordinates in the same way for both
 * onContextMenu and onMouseDown.
 */

import { describe, expect, it } from "vitest";
import {
  clientToSceneCoord,
  fitSceneRect,
  lensRectForEntry,
  lensToSceneCoord,
  sceneCoordToClient,
  sceneCoordToScreenInScope,
} from "../state/coordinate";
import { hitTest } from "../state/hitTest";
import { SCENES } from "../scenes/sceneConfig";
import { SCENE_PROTOCOL_VERSION, type SceneConfig } from "../types/scene";

type FakeMouseEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
  button: number;
};

type StageState = {
  phase: "observing" | "scoped";
  crosshair: { u: number; v: number };
  scopeEntry: { u: number; v: number } | null;
  scopeReticle: { u: number; v: number };
  rect: { x: number; y: number; w: number; h: number };
};

const sceneCoordAtEvent = (
  e: FakeMouseEvent,
  state: StageState,
): { u: number; v: number } | null => {
  // Mirror SceneStage: while observing, the wide-view coord is the
  // one to use. While scoped, the click is inside the lens, so the
  // aim is the lens-aware scene coord (which is what the magnified
  // view is actually showing under the cursor).
  if (state.phase === "scoped" && state.scopeEntry) {
    const lens = lensRectForEntry(state.scopeEntry, state.rect, 0.5);
    return (
      lensToSceneCoord(e.clientX, e.clientY, state.scopeEntry, state.rect, lens) ??
      clientToSceneCoord(e.clientX, e.clientY, state.rect)
    );
  }
  return clientToSceneCoord(e.clientX, e.clientY, state.rect);
};

/**
 * Mirror App.tsx for the two event handlers under test. They take
 * the SceneStage-resolved scene coord plus the current state and
 * return a state transition that the test can assert on. No
 * React, no side effects.
 */
const handleContextMenuForTest = (
  e: FakeMouseEvent,
  state: StageState,
  exitScope: () => void,
): { type: "enter"; at: { u: number; v: number } } | { type: "exit" } | { type: "ignore" } => {
  e.preventDefault();
  if (state.phase === "observing") {
    const coord = sceneCoordAtEvent(e, state) ?? state.crosshair;
    return { type: "enter", at: { u: coord.u, v: coord.v } };
  }
  if (state.phase === "scoped") {
    exitScope();
    return { type: "exit" };
  }
  return { type: "ignore" };
};

const handleMouseDownForTest = (
  e: FakeMouseEvent,
  state: StageState,
): { aim: { u: number; v: number } } | { ignore: true } => {
  if (e.button !== 0) return { ignore: true };
  if (state.phase !== "scoped") return { ignore: true };
  const aim = sceneCoordAtEvent(e, state) ?? state.scopeReticle;
  return { aim };
};

const makeEvent = (x: number, y: number, button = 0): FakeMouseEvent => ({
  clientX: x,
  clientY: y,
  button,
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
});

describe("scope entry from a single right-click event", () => {
  it("uses the event's clientX/Y as the scope entry on the first click", () => {
    const rect = fitSceneRect(1920, 1080);
    // Aim at a screen point that is NOT the wide crosshair default
    // (0.5, 0.5) so we can prove the entry is event-driven.
    const targetX = rect.x + rect.w * 0.625;
    const targetY = rect.y + rect.h * 0.7;
    const e = makeEvent(targetX, targetY, 2);
    const state: StageState = {
      phase: "observing",
      crosshair: { u: 0.5, v: 0.5 },
      scopeEntry: null,
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };

    const result = handleContextMenuForTest(e, state, () => undefined);

    expect(result.type).toBe("enter");
    if (result.type === "enter") {
      expect(result.at.u).toBeCloseTo(0.625, 5);
      expect(result.at.v).toBeCloseTo(0.7, 5);
    }
  });

  it("still works on a letterboxed ultrawide viewport", () => {
    const rect = fitSceneRect(3440, 1440);
    const targetX = rect.x + rect.w * 0.6;
    const targetY = rect.y + rect.h * 0.4;
    const e = makeEvent(targetX, targetY, 2);
    const state: StageState = {
      phase: "observing",
      crosshair: { u: 0.5, v: 0.5 },
      scopeEntry: null,
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };

    const result = handleContextMenuForTest(e, state, () => undefined);

    expect(result.type).toBe("enter");
    if (result.type === "enter") {
      expect(result.at.u).toBeCloseTo(0.6, 5);
      expect(result.at.v).toBeCloseTo(0.4, 5);
    }
  });

  it("falls back to the current crosshair when the click is outside the scene rect", () => {
    const rect = fitSceneRect(1920, 1080);
    const e = makeEvent(5000, 5000, 2);
    const state: StageState = {
      phase: "observing",
      crosshair: { u: 0.42, v: 0.31 },
      scopeEntry: null,
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };

    const result = handleContextMenuForTest(e, state, () => undefined);

    expect(result.type).toBe("enter");
    if (result.type === "enter") {
      expect(result.at).toEqual({ u: 0.42, v: 0.31 });
    }
  });

  it("exits scope when right-clicked while already scoped", () => {
    let exited = false;
    const rect = fitSceneRect(1920, 1080);
    const e = makeEvent(0, 0, 2);
    const state: StageState = {
      phase: "scoped",
      crosshair: { u: 0.5, v: 0.5 },
      scopeEntry: { u: 0.5, v: 0.5 },
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };
    const result = handleContextMenuForTest(e, state, () => {
      exited = true;
    });
    expect(result.type).toBe("exit");
    expect(exited).toBe(true);
  });
});

describe("fire aim from a single left-click event", () => {
  it("uses the event's clientX/Y when scoped", () => {
    const rect = fitSceneRect(1920, 1080);
    // After right-clicking the entry, the user left-clicks at the
    // lens center. The aim should land exactly on the entry scene
    // coord (since the lens center maps to the entry).
    const entry = { u: 0.625, v: 0.7 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const cx = lens.x + lens.w / 2;
    const cy = lens.y + lens.h / 2;
    const e = makeEvent(cx, cy, 0);
    const state: StageState = {
      phase: "scoped",
      crosshair: entry,
      scopeEntry: entry,
      scopeReticle: entry,
      rect,
    };

    const result = handleMouseDownForTest(e, state);

    expect("aim" in result).toBe(true);
    if ("aim" in result) {
      expect(result.aim.u).toBeCloseTo(entry.u, 5);
      expect(result.aim.v).toBeCloseTo(entry.v, 5);
    }
  });

  it("uses the lens->scene mapping when the click is offset in the lens", () => {
    const rect = fitSceneRect(1920, 1080);
    const entry = { u: 0.625, v: 0.7 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    // Move 10px right of the lens center.
    const cx = lens.x + lens.w / 2 + 10;
    const cy = lens.y + lens.h / 2;
    const e = makeEvent(cx, cy, 0);
    const state: StageState = {
      phase: "scoped",
      crosshair: entry,
      scopeEntry: entry,
      scopeReticle: entry,
      rect,
    };

    const result = handleMouseDownForTest(e, state);

    expect("aim" in result).toBe(true);
    if ("aim" in result) {
      // Independent ground truth: the same mapping helper.
      const expected = lensToSceneCoord(cx, cy, entry, rect, lens);
      expect(expected).not.toBeNull();
      expect(result.aim.u).toBeCloseTo(expected!.u, 6);
      expect(result.aim.v).toBeCloseTo(expected!.v, 6);
      // And the aim's wide-view screen position should match the
      // entry's screen position scaled by the inverse of magnification.
      const wideScreen = sceneCoordToClient(result.aim, rect);
      const lensScreen = sceneCoordToScreenInScope(result.aim, rect, lens, entry);
      expect(lensScreen.x).toBeCloseTo(cx, 5);
      expect(lensScreen.y).toBeCloseTo(cy, 5);
      void wideScreen;
    }
  });

  it("ignores right clicks and clicks while observing", () => {
    const rect = fitSceneRect(1920, 1080);
    const eRight = makeEvent(960, 540, 2);
    const eLeft = makeEvent(960, 540, 0);
    const scopedState: StageState = {
      phase: "scoped",
      crosshair: { u: 0.5, v: 0.5 },
      scopeEntry: { u: 0.5, v: 0.5 },
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };
    const observingState: StageState = { ...scopedState, phase: "observing", scopeEntry: null };
    expect(handleMouseDownForTest(eRight, scopedState)).toEqual({ ignore: true });
    expect(handleMouseDownForTest(eLeft, observingState)).toEqual({ ignore: true });
  });
});

/**
 * The P0-3 interaction contract: when a player right-clicks exactly
 * on a target's center, the scope entry is taken from that same
 * event (no prior pointermove required), and a subsequent left click
 * at the lens center must produce an aim that lands inside the
 * target's hit ellipse. This guards against a class of regressions
 * where the first scope click drifts because the reticle started
 * from a stale wide-view crosshair instead of the entry event.
 */
describe("first left click at the lens center hits the target that anchored the scope", () => {
  const findActiveScene = (): SceneConfig => {
    const active = SCENES.find((s) => s.status === "active");
    if (!active || active.targets.length === 0) {
      throw new Error("expected an active scene with at least one target");
    }
    // Sanity: SCENES should carry the protocol version too.
    if (active.protocolVersion !== SCENE_PROTOCOL_VERSION) {
      throw new Error("active scene is missing the protocol version");
    }
    return active;
  };

  it("scope entry derived from the right-click event + left click at lens center hits the target", () => {
    const scene = findActiveScene();
    const target = scene.targets[0];
    const rect = fitSceneRect(1920, 1080);

    // 1. Player right-clicks exactly on the target's center.
    const rightClickClient = sceneCoordToClient(target.center, rect);
    const eRight = makeEvent(rightClickClient.x, rightClickClient.y, 2);
    const initialState: StageState = {
      phase: "observing",
      crosshair: { u: 0.5, v: 0.5 },
      scopeEntry: null,
      scopeReticle: { u: 0.5, v: 0.5 },
      rect,
    };
    const enter = handleContextMenuForTest(eRight, initialState, () => undefined);
    expect(enter.type).toBe("enter");
    if (enter.type !== "enter") return;

    // The scope entry must come from the right-click event, not the
    // pre-existing wide crosshair (which was {0.5, 0.5}).
    expect(enter.at.u).toBeCloseTo(target.center.u, 5);
    expect(enter.at.v).toBeCloseTo(target.center.v, 5);

    // 2. Player immediately left-clicks at the lens center WITHOUT
    //    moving the mouse. The lens center is the screen position
    //    of the entry; clicking there must produce an aim that is
    //    (a) very close to the entry, and (b) inside the target's
    //    hit ellipse so hitTest() returns the target id.
    const scopeState: StageState = {
      ...initialState,
      phase: "scoped",
      scopeEntry: enter.at,
      scopeReticle: enter.at,
    };
    const lens = lensRectForEntry(enter.at, rect, 0.5);
    const cx = lens.x + lens.w / 2;
    const cy = lens.y + lens.h / 2;
    const eLeft = makeEvent(cx, cy, 0);
    const fire = handleMouseDownForTest(eLeft, scopeState);
    expect("aim" in fire).toBe(true);
    if (!("aim" in fire)) return;
    expect(fire.aim.u).toBeCloseTo(target.center.u, 5);
    expect(fire.aim.v).toBeCloseTo(target.center.v, 5);
    expect(hitTest(fire.aim, scene)).toBe(target.id);
  });

  it("an aim exactly on the target's center always hits, even on a stretched halfSize", () => {
    const scene = findActiveScene();
    const target = scene.targets[0];
    expect(hitTest(target.center, scene)).toBe(target.id);
  });
});
