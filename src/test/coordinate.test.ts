import { describe, expect, it } from "vitest";
import {
  SCENE_ASPECT,
  SCOPE_MAGNIFICATION,
  clampCoord,
  clampPointToLens,
  clientToSceneCoord,
  coordDistance,
  coordToGridCell,
  fitSceneRect,
  lensRectForEntry,
  lensToSceneCoord,
  sceneCoordToClient,
  sceneCoordToScreenInScope,
} from "../state/coordinate";

describe("fitSceneRect", () => {
  it("letterboxes horizontally when the viewport is wider than 16:9", () => {
    const r = fitSceneRect(2560, 1080);
    expect(r.h).toBe(1080);
    expect(r.w).toBeCloseTo(1080 * SCENE_ASPECT, 5);
    expect(r.x).toBeCloseTo((2560 - r.w) / 2, 5);
    expect(r.y).toBe(0);
  });

  it("letterboxes vertically when the viewport is taller than 16:9", () => {
    const r = fitSceneRect(1280, 1600);
    expect(r.w).toBe(1280);
    expect(r.h).toBeCloseTo(1280 / SCENE_ASPECT, 5);
    expect(r.y).toBeCloseTo((1600 - r.h) / 2, 5);
  });

  it("returns zeros for an empty viewport", () => {
    expect(fitSceneRect(0, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("uses the full viewport when the aspect matches exactly", () => {
    const r = fitSceneRect(1920, 1080);
    expect(r.w).toBe(1920);
    expect(r.h).toBe(1080);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("handles an ultrawide viewport by letterboxing left and right", () => {
    const r = fitSceneRect(3440, 1440);
    expect(r.h).toBe(1440);
    expect(r.w).toBeCloseTo(1440 * SCENE_ASPECT, 5);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBe(0);
  });

  it("handles a narrow (portrait) viewport by letterboxing top and bottom", () => {
    const r = fitSceneRect(800, 1400);
    expect(r.w).toBe(800);
    expect(r.h).toBeCloseTo(800 / SCENE_ASPECT, 5);
    expect(r.y).toBeGreaterThan(0);
  });

  it("letterboxes horizontally for any viewport wider than 16:9", () => {
    // The scene rect always preserves 16:9; the height equals the
    // viewport height and the width is height * 16/9, regardless
    // of how much wider the viewport is.
    const a = fitSceneRect(1920, 1080);
    const b = fitSceneRect(3840, 1080);
    const c = fitSceneRect(2560, 1080);
    for (const r of [a, b, c]) {
      expect(r.h).toBe(1080);
      expect(r.w).toBeCloseTo(1080 * SCENE_ASPECT, 5);
    }
    // The wider the viewport, the further the scene is pushed in
    // from the left edge.
    expect(a.x).toBe(0);
    expect(c.x).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(c.x);
  });
});

describe("clientToSceneCoord", () => {
  const rect = fitSceneRect(1920, 1080);

  it("maps the center of the rect to (0.5, 0.5)", () => {
    const c = clientToSceneCoord(960, 540, rect);
    expect(c).toEqual({ u: 0.5, v: 0.5 });
  });

  it("maps the top-left of the rect to (0, 0)", () => {
    const c = clientToSceneCoord(rect.x, rect.y, rect);
    expect(c).toEqual({ u: 0, v: 0 });
  });

  it("maps the bottom-right of the rect to (1, 1)", () => {
    const c = clientToSceneCoord(rect.x + rect.w, rect.y + rect.h, rect);
    expect(c).toEqual({ u: 1, v: 1 });
  });

  it("returns null when the pointer is outside the scene rectangle", () => {
    // 1920x1080 exactly matches 16:9 so the scene fills the viewport;
    // a point above 1920px is genuinely outside the scene rect.
    expect(clientToSceneCoord(0, 0, rect)).not.toBeNull();
    expect(clientToSceneCoord(2000, 1000, rect)).toBeNull();
  });

  it("respects letterbox offset on a wider viewport", () => {
    const r = fitSceneRect(2560, 1080);
    const left = clientToSceneCoord(r.x - 1, r.y + r.h / 2, r);
    const right = clientToSceneCoord(r.x + r.w + 1, r.y + r.h / 2, r);
    expect(left).toBeNull();
    expect(right).toBeNull();
    const inside = clientToSceneCoord(r.x + r.w / 2, r.y + r.h / 2, r);
    expect(inside).toEqual({ u: 0.5, v: 0.5 });
  });

  it("respects letterbox offset on a narrower viewport", () => {
    const r = fitSceneRect(800, 1400);
    const above = clientToSceneCoord(r.x + r.w / 2, r.y - 1, r);
    const below = clientToSceneCoord(r.x + r.w / 2, r.y + r.h + 1, r);
    expect(above).toBeNull();
    expect(below).toBeNull();
    const inside = clientToSceneCoord(r.x + r.w / 2, r.y + r.h / 2, r);
    expect(inside).toEqual({ u: 0.5, v: 0.5 });
  });
});

describe("sceneCoordToClient", () => {
  it("inverts clientToSceneCoord at a few points", () => {
    const rect = fitSceneRect(1920, 1080);
    const samples: Array<[number, number]> = [
      [0.25, 0.5],
      [0.5, 0.25],
      [0.75, 0.9],
    ];
    for (const [u, v] of samples) {
      const s = sceneCoordToClient({ u, v }, rect);
      const back = clientToSceneCoord(s.x, s.y, rect);
      expect(back).not.toBeNull();
      expect(back?.u).toBeCloseTo(u, 6);
      expect(back?.v).toBeCloseTo(v, 6);
    }
  });
});

describe("clampCoord", () => {
  it("clamps negative values to 0", () => {
    expect(clampCoord({ u: -0.2, v: -0.1 })).toEqual({ u: 0, v: 0 });
  });
  it("clamps values above 1 to 1", () => {
    expect(clampCoord({ u: 1.2, v: 1.4 })).toEqual({ u: 1, v: 1 });
  });
  it("leaves in-range values unchanged", () => {
    expect(clampCoord({ u: 0.4, v: 0.6 })).toEqual({ u: 0.4, v: 0.6 });
  });
});

describe("coordDistance", () => {
  it("returns 0 for identical coords", () => {
    expect(coordDistance({ u: 0.3, v: 0.4 }, { u: 0.3, v: 0.4 })).toBe(0);
  });
  it("computes the diagonal distance", () => {
    const d = coordDistance({ u: 0, v: 0 }, { u: 0.3, v: 0.4 });
    expect(d).toBeCloseTo(0.5, 6);
  });
});

describe("coordToGridCell", () => {
  const grid = { cols: 4, rows: 3 };
  it("maps the corners to the four expected cells", () => {
    expect(coordToGridCell({ u: 0, v: 0 }, grid)).toEqual({ col: 0, row: 0 });
    expect(coordToGridCell({ u: 1, v: 0 }, grid)).toEqual({ col: 3, row: 0 });
    expect(coordToGridCell({ u: 0, v: 1 }, grid)).toEqual({ col: 0, row: 2 });
    expect(coordToGridCell({ u: 1, v: 1 }, grid)).toEqual({ col: 3, row: 2 });
  });
  it("maps the center to the central cell", () => {
    expect(coordToGridCell({ u: 0.5, v: 0.5 }, grid)).toEqual({ col: 2, row: 1 });
  });
  it("clamps out-of-bounds coords to the last cell", () => {
    expect(coordToGridCell({ u: 1.2, v: 1.4 }, grid)).toEqual({ col: 3, row: 2 });
    expect(coordToGridCell({ u: -0.4, v: -0.1 }, grid)).toEqual({ col: 0, row: 0 });
  });
});

describe("lensRectForEntry", () => {
  const rect = fitSceneRect(1920, 1080);

  it("centers the lens on the entry's screen position", () => {
    const entry = { u: 0.6, v: 0.4 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const expectedCenter = sceneCoordToClient(entry, rect);
    expect(lens.x + lens.w / 2).toBeCloseTo(expectedCenter.x, 5);
    expect(lens.y + lens.h / 2).toBeCloseTo(expectedCenter.y, 5);
  });

  it("keeps the lens square and the same size for any entry inside the scene", () => {
    const a = lensRectForEntry({ u: 0.1, v: 0.1 }, rect, 0.5);
    const b = lensRectForEntry({ u: 0.9, v: 0.9 }, rect, 0.5);
    expect(a.w).toBeCloseTo(b.w, 5);
    expect(a.h).toBeCloseTo(a.w, 5);
  });

  it("scales the lens with the sizeFraction argument", () => {
    const small = lensRectForEntry({ u: 0.5, v: 0.5 }, rect, 0.3);
    const large = lensRectForEntry({ u: 0.5, v: 0.5 }, rect, 0.6);
    expect(large.w).toBeCloseTo(small.w * 2, 5);
  });
});

describe("lensToSceneCoord", () => {
  const rect = fitSceneRect(1920, 1080);

  it("returns the entry when the pointer sits at the lens center", () => {
    const entry = { u: 0.5, v: 0.5 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const cx = lens.x + lens.w / 2;
    const cy = lens.y + lens.h / 2;
    const c = lensToSceneCoord(cx, cy, entry, rect, lens);
    expect(c).not.toBeNull();
    expect(c?.u).toBeCloseTo(entry.u, 6);
    expect(c?.v).toBeCloseTo(entry.v, 6);
  });

  it("moves the scene coord by 1/magnification when the pointer is one pixel off center", () => {
    const entry = { u: 0.5, v: 0.5 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const cx = lens.x + lens.w / 2 + 1; // 1px right
    const cy = lens.y + lens.h / 2;
    const c = lensToSceneCoord(cx, cy, entry, rect, lens);
    expect(c).not.toBeNull();
    // 1px right of the center maps to +1/(mag * rect.w) in normalized u.
    const expectedDu = 1 / (SCOPE_MAGNIFICATION * rect.w);
    expect(c!.u - entry.u).toBeCloseTo(expectedDu, 9);
    expect(c!.v - entry.v).toBeCloseTo(0, 9);
  });

  it("moves proportionally on both axes at the lens corners", () => {
    const entry = { u: 0.5, v: 0.5 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const tl = lensToSceneCoord(lens.x, lens.y, entry, rect, lens);
    const br = lensToSceneCoord(lens.x + lens.w, lens.y + lens.h, entry, rect, lens);
    // TL maps to entry - (lens.w/2)/(mag*rect.w) on u and v.
    const expectedHalf = (lens.w / 2) / (SCOPE_MAGNIFICATION * rect.w);
    expect(tl).not.toBeNull();
    expect(br).not.toBeNull();
    expect(entry.u - tl!.u).toBeCloseTo(expectedHalf, 6);
    expect(br!.u - entry.u).toBeCloseTo(expectedHalf, 6);
  });

  it("round-trips with sceneCoordToScreenInScope for the magnified scene", () => {
    // A click in the lens at (lx, ly) maps to a scene coord that,
    // when projected back through the same magnification, lands at
    // (lx, ly) again. (This is the property that makes the aim
    // visually correct inside the scope.)
    const entry = { u: 0.36, v: 0.5 };
    const lens = lensRectForEntry(entry, rect, 0.5);
    const samples: Array<[number, number]> = [
      [lens.x + 10, lens.y + 10],
      [lens.x + lens.w / 2, lens.y + lens.h / 2],
      [lens.x + lens.w - 10, lens.y + lens.h - 10],
    ];
    for (const [x, y] of samples) {
      const c = lensToSceneCoord(x, y, entry, rect, lens);
      expect(c).not.toBeNull();
      const screen = sceneCoordToScreenInScope(c!, rect, lens, entry);
      expect(screen.x).toBeCloseTo(x, 6);
      expect(screen.y).toBeCloseTo(y, 6);
    }
  });
});

describe("clampPointToLens", () => {
  const lens = { x: 100, y: 200, w: 80, h: 80 };

  it("keeps an inside point unchanged", () => {
    expect(clampPointToLens(140, 240, lens)).toEqual({ x: 140, y: 240 });
  });
  it("clamps to the left edge when the point is to the left", () => {
    expect(clampPointToLens(20, 240, lens)).toEqual({ x: 100, y: 240 });
  });
  it("clamps to the right edge when the point is to the right", () => {
    expect(clampPointToLens(900, 240, lens)).toEqual({ x: 180, y: 240 });
  });
  it("clamps to both edges for an off-screen point", () => {
    expect(clampPointToLens(-50, 9999, lens)).toEqual({ x: 100, y: 280 });
  });
});
