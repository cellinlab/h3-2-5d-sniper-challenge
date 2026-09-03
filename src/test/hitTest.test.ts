import { describe, expect, it } from "vitest";
import { hitTest } from "../state/hitTest";
import type { SceneConfig } from "../types/scene";

const scene: SceneConfig = {
  id: "test",
  title: "t",
  subtitle: "s",
  sectorLabel: "lbl",
  masterMedia: { kind: "procedural" },
  grid: { cols: 4, rows: 3 },
  targets: [
    {
      id: "operative-01",
      center: { u: 0.5, v: 0.5 },
      halfSize: { hU: 0.05, hV: 0.07 },
      artPath: "/x.png",
      distanceMeters: 100,
    },
  ],
  audio: { voice: {}, music: null },
  roundBudgetMs: 10000,
  warningAt: 0.5,
  finalWarningAt: 0.8,
};

describe("hitTest", () => {
  it("hits when the aim is inside the target's elliptical hitbox", () => {
    expect(hitTest({ u: 0.5, v: 0.5 }, scene)).toBe("operative-01");
  });
  it("misses when the aim is outside the target's hitbox", () => {
    expect(hitTest({ u: 0.1, v: 0.1 }, scene)).toBeNull();
  });
  it("respects the halfSize extents on each axis", () => {
    // halfSize.hU = 0.05, so 0.05 u away is at the edge
    expect(hitTest({ u: 0.55, v: 0.5 }, scene)).toBe("operative-01");
    expect(hitTest({ u: 0.56, v: 0.5 }, scene)).toBeNull();
  });
});
