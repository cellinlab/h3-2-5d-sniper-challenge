import { describe, expect, it } from "vitest";
import { hitTest } from "../state/hitTest";
import { SCENE_PROTOCOL_VERSION, type SceneConfig } from "../types/scene";

const scene: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  ruleMode: "timed-mission",
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

/**
 * Brief acceptance item 7: hit testing must exclude cleared
 * targets. The contract is a Set semantics: the same id passed
 * again yields null even though the aim is still inside the
 * hitbox.
 */
describe("hitTest - excludedIds", () => {
  const multi: SceneConfig = {
    protocolVersion: SCENE_PROTOCOL_VERSION,
    ruleMode: "untimed-practice",
    id: "practice",
    title: "t",
    subtitle: "s",
    sectorLabel: "lbl",
    masterMedia: { kind: "procedural" },
    grid: { cols: 4, rows: 3 },
    targets: [
      {
        id: "op-1",
        center: { u: 0.2, v: 0.5 },
        halfSize: { hU: 0.05, hV: 0.05 },
        artPath: "/x.png",
        distanceMeters: 100,
      },
      {
        id: "op-2",
        center: { u: 0.8, v: 0.5 },
        halfSize: { hU: 0.05, hV: 0.05 },
        artPath: "/x.png",
        distanceMeters: 100,
      },
    ],
    audio: { voice: {}, music: null },
  };

  it("returns the live id when an unrelated id is excluded", () => {
    expect(hitTest({ u: 0.2, v: 0.5 }, multi, ["op-2"])).toBe("op-1");
    expect(hitTest({ u: 0.8, v: 0.5 }, multi, ["op-1"])).toBe("op-2");
  });

  it("returns null when the only target under the aim is excluded", () => {
    expect(hitTest({ u: 0.2, v: 0.5 }, multi, ["op-1"])).toBeNull();
  });

  it("returns null when every id is excluded", () => {
    expect(hitTest({ u: 0.2, v: 0.5 }, multi, ["op-1", "op-2"])).toBeNull();
    expect(hitTest({ u: 0.8, v: 0.5 }, multi, ["op-1", "op-2"])).toBeNull();
  });
});
