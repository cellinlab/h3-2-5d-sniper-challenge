import { describe, expect, it } from "vitest";
import { isCoordOutOfBounds, validateSceneConfig } from "../state/validation";
import { SCENE_PROTOCOL_VERSION } from "../types/scene";

const baseConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "north-relay",
  title: "北境中继站",
  subtitle: "工业设施 · 蓝色时刻",
  sectorLabel: "SECTOR 07 // BLUE HOUR",
  masterMedia: { kind: "procedural" },
  grid: { cols: 4, rows: 3 },
  targets: [
    {
      id: "operative-01",
      center: { u: 0.5, v: 0.5 },
      halfSize: { hU: 0.05, hV: 0.07 },
      artPath: "/generated/target-operative.png",
      distanceMeters: 612,
    },
  ],
  audio: {
    voice: {
      briefing: "观察区域，确认目标。",
      scopeOpen: "保持呼吸。",
    },
    music: null,
  },
  roundBudgetMs: 22000,
  warningAt: 0.55,
  finalWarningAt: 0.85,
};

describe("validateSceneConfig - happy path", () => {
  it("accepts a well-formed scene config", () => {
    const r = validateSceneConfig(baseConfig);
    expect(r.ok).toBe(true);
  });

  it("accepts a config with no optional voice keys", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      audio: { voice: {}, music: null },
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateSceneConfig - protocol & top-level", () => {
  it("rejects configs with a missing protocolVersion", () => {
    const { protocolVersion: _omit, ...rest } = baseConfig;
    void _omit;
    const r = validateSceneConfig(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("protocolVersion"))).toBe(true);
    }
  });

  it("rejects configs with a wrong protocolVersion", () => {
    const r = validateSceneConfig({ ...baseConfig, protocolVersion: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("protocolVersion"))).toBe(true);
    }
  });

  it("rejects unknown top-level keys", () => {
    const r = validateSceneConfig({ ...baseConfig, mysterious: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.mysterious"))).toBe(true);
    }
  });

  it("rejects empty ids", () => {
    const r = validateSceneConfig({ ...baseConfig, id: "" });
    expect(r.ok).toBe(false);
  });
});

describe("validateSceneConfig - grid", () => {
  it("rejects grids that are not 4x3", () => {
    const r = validateSceneConfig({ ...baseConfig, grid: { cols: 3, rows: 4 } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("4 x 3"))).toBe(true);
    }
  });

  it("rejects unknown grid keys", () => {
    const r = validateSceneConfig({ ...baseConfig, grid: { cols: 4, rows: 3, depth: 2 } });
    expect(r.ok).toBe(false);
  });
});

describe("validateSceneConfig - targets", () => {
  it("rejects empty target arrays", () => {
    const r = validateSceneConfig({ ...baseConfig, targets: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("at least one"))).toBe(true);
    }
  });

  it("rejects target coords outside [0, 1]", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      targets: [
        {
          ...baseConfig.targets[0],
          center: { u: 1.5, v: -0.1 },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.includes("center.u") || e.includes("center.v")),
      ).toBe(true);
    }
  });

  it("rejects non-positive halfSize", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      targets: [
        {
          ...baseConfig.targets[0],
          halfSize: { hU: 0, hV: 0.05 },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("halfSize.hU"))).toBe(true);
    }
  });

  it("rejects unknown target keys", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      targets: [{ ...baseConfig.targets[0], reward: 100 }],
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateSceneConfig - timing", () => {
  it("rejects budgets outside [4000, 60000]", () => {
    const r = validateSceneConfig({ ...baseConfig, roundBudgetMs: 2000 });
    expect(r.ok).toBe(false);
  });

  it("rejects warningAt >= finalWarningAt", () => {
    const r = validateSceneConfig({ ...baseConfig, warningAt: 0.9, finalWarningAt: 0.85 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("strictly less"))).toBe(true);
    }
  });

  it("rejects unit-interval violations", () => {
    const r = validateSceneConfig({ ...baseConfig, warningAt: 1.2 });
    expect(r.ok).toBe(false);
  });
});

describe("validateSceneConfig - status", () => {
  it("accepts active", () => {
    const r = validateSceneConfig({ ...baseConfig, status: "active" });
    expect(r.ok).toBe(true);
  });
  it("accepts locked", () => {
    const r = validateSceneConfig({ ...baseConfig, status: "locked" });
    expect(r.ok).toBe(true);
  });
  it("rejects unknown status values", () => {
    const r = validateSceneConfig({ ...baseConfig, status: "beta" });
    expect(r.ok).toBe(false);
  });
});

describe("validateSceneConfig - masterMedia", () => {
  it("accepts the procedural kind without extra keys", () => {
    const r = validateSceneConfig({ ...baseConfig, masterMedia: { kind: "procedural" } });
    expect(r.ok).toBe(true);
  });
  it("rejects extra keys on a procedural masterMedia", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      masterMedia: { kind: "procedural", src: "/x.mp4" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.masterMedia.src"))).toBe(true);
    }
  });
  it("accepts a video masterMedia with src (and optional loop)", () => {
    const r1 = validateSceneConfig({
      ...baseConfig,
      masterMedia: { kind: "video", src: "/generated/north-relay.mp4" },
    });
    expect(r1.ok).toBe(true);
    const r2 = validateSceneConfig({
      ...baseConfig,
      masterMedia: { kind: "video", src: "/generated/north-relay.mp4", loop: false },
    });
    expect(r2.ok).toBe(true);
  });
  it("rejects a video masterMedia without src", () => {
    const r = validateSceneConfig({ ...baseConfig, masterMedia: { kind: "video" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.masterMedia.src"))).toBe(true);
    }
  });
  it("rejects unknown keys on a video masterMedia", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      masterMedia: { kind: "video", src: "/x.mp4", autoplay: true },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.masterMedia.autoplay"))).toBe(true);
    }
  });
  it("rejects unknown masterMedia kinds", () => {
    const r = validateSceneConfig({ ...baseConfig, masterMedia: { kind: "stream" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.masterMedia.kind"))).toBe(true);
    }
  });
  it("rejects a masterMedia that is null (the legacy shape)", () => {
    const r = validateSceneConfig({ ...baseConfig, masterMedia: null });
    expect(r.ok).toBe(false);
  });
  it("rejects a masterMedia that is a string (the legacy shape)", () => {
    const r = validateSceneConfig({ ...baseConfig, masterMedia: "/x.mp4" });
    expect(r.ok).toBe(false);
  });
  it("rejects a non-boolean loop on a video masterMedia", () => {
    const r = validateSceneConfig({
      ...baseConfig,
      masterMedia: { kind: "video", src: "/x.mp4", loop: "yes" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("scene.masterMedia.loop"))).toBe(true);
    }
  });
});

describe("isCoordOutOfBounds", () => {
  it("flags values below 0 or above 1", () => {
    expect(isCoordOutOfBounds({ u: -0.01, v: 0.5 })).toBe(true);
    expect(isCoordOutOfBounds({ u: 0.5, v: 1.01 })).toBe(true);
  });
  it("accepts in-range values", () => {
    expect(isCoordOutOfBounds({ u: 0, v: 0 })).toBe(false);
    expect(isCoordOutOfBounds({ u: 1, v: 1 })).toBe(false);
  });
});
