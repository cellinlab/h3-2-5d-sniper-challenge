import { describe, expect, it } from "vitest";
import {
  INITIAL_ROUND_STATE,
  reduceRound,
  startObservation,
} from "../state/roundStateMachine";

describe("roundStateMachine - happy path", () => {
  it("walks idle -> observing -> scoped -> success", () => {
    let s = startObservation("north-relay", { u: 0.4, v: 0.4 });
    expect(s.phase).toBe("observing");
    expect(s.sceneId).toBe("north-relay");
    expect(s.crosshair).toEqual({ u: 0.4, v: 0.4 });

    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.4, v: 0.4 } });
    expect(s.phase).toBe("scoped");
    expect(s.scopeEntry).toEqual({ u: 0.4, v: 0.4 });
    expect(s.scopeReticle).toEqual({ u: 0.4, v: 0.4 });

    s = reduceRound(s, { type: "MOVE_SCOPE_RETICLE", reticle: { u: 0.55, v: 0.5 } });
    expect(s.scopeReticle).toEqual({ u: 0.55, v: 0.5 });

    s = reduceRound(s, { type: "FIRE", hitTargetId: "operative-01" });
    expect(s.phase).toBe("success");
    expect(s.hasFired).toBe(true);
    expect(s.hitTargetId).toBe("operative-01");
  });

  it("a missed shot resolves to failure without a hit id", () => {
    let s = startObservation("north-relay", { u: 0.2, v: 0.2 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.2, v: 0.2 } });
    s = reduceRound(s, { type: "FIRE", hitTargetId: null });
    expect(s.phase).toBe("failure");
    expect(s.hasFired).toBe(true);
    expect(s.hitTargetId).toBeNull();
  });

  it("returns to observing on EXIT_SCOPE and preserves the entry", () => {
    let s = startObservation("north-relay", { u: 0.4, v: 0.4 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.4, v: 0.4 } });
    s = reduceRound(s, { type: "MOVE_SCOPE_RETICLE", reticle: { u: 0.7, v: 0.7 } });
    s = reduceRound(s, { type: "EXIT_SCOPE" });
    expect(s.phase).toBe("observing");
    expect(s.crosshair).toEqual({ u: 0.4, v: 0.4 });
  });
});

describe("roundStateMachine - timeout", () => {
  it("transitions to failure when TICK exceeds the round budget", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 22000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(s.phase).toBe("failure");
  });

  it("does not double-resolve after a previous fire", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "FIRE", hitTargetId: "operative-01" });
    expect(() =>
      reduceRound(s, {
        type: "TICK",
        elapsedMs: 30000,
        warningAt: 12000,
        finalWarningAt: 19000,
        roundBudgetMs: 22000,
      }),
    ).not.toThrow();
  });
});

describe("roundStateMachine - danger escalation", () => {
  it("remains calm before warningAt", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 5000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(s.danger).toBe("calm");
  });

  it("escalates to warning at warningAt", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 0.55 * 22000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(s.danger).toBe("warning");
  });

  it("escalates to final at finalWarningAt", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 0.85 * 22000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(s.danger).toBe("final");
  });
});

describe("roundStateMachine - illegal transitions throw", () => {
  it("rejects FIRE before scope opens", () => {
    const s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    expect(() => reduceRound(s, { type: "FIRE", hitTargetId: null })).toThrow();
  });

  it("rejects a second FIRE", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "FIRE", hitTargetId: "operative-01" });
    expect(() => reduceRound(s, { type: "FIRE", hitTargetId: null })).toThrow();
  });

  it("rejects ENTER_SCOPE from scoped", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    expect(() =>
      reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } }),
    ).toThrow();
  });

  it("rejects EXIT_SCOPE from observing", () => {
    const s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    expect(() => reduceRound(s, { type: "EXIT_SCOPE" })).toThrow();
  });
});

describe("roundStateMachine - reset", () => {
  it("RESET returns to the initial state", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "EXIT_SCOPE" });
    s = reduceRound(s, { type: "RESET" });
    expect(s).toEqual({ ...INITIAL_ROUND_STATE, lastEvent: "reset" });
  });
});
