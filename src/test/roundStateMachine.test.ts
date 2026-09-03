import { describe, expect, it } from "vitest";
import {
  INITIAL_ROUND_STATE,
  computeTickState,
  isGameplayInputAllowed,
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

/**
 * `computeTickState` is the pure helper the React orchestrator calls
 * from a requestAnimationFrame loop. Throttling the dispatch to a
 * low frequency must not change the round's outcome: budget
 * exhaustion still resolves to failure, danger escalation still
 * fires at the exact warning / final thresholds, and a no-change
 * tick returns the same reference (so the caller can skip the
 * React update entirely).
 */
describe("computeTickState - pure tick reducer", () => {
  const warningAt = 0.55 * 22000;
  const finalWarningAt = 0.85 * 22000;
  const roundBudgetMs = 22000;

  it("returns the same reference when nothing changed (no-op signal)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 1000,
      warningAt,
      finalWarningAt,
      roundBudgetMs,
    });
    const before = s;
    const after = computeTickState(s, 1000, warningAt, finalWarningAt, roundBudgetMs);
    expect(after).toBe(before);
  });

  it("escalates danger exactly at the warning threshold", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 5000,
      warningAt,
      finalWarningAt,
      roundBudgetMs,
    });
    expect(s.danger).toBe("calm");
    const next = computeTickState(s, warningAt, warningAt, finalWarningAt, roundBudgetMs);
    expect(next.danger).toBe("warning");
  });

  it("escalates to final at the final-warning threshold", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: warningAt,
      warningAt,
      finalWarningAt,
      roundBudgetMs,
    });
    const next = computeTickState(s, finalWarningAt, warningAt, finalWarningAt, roundBudgetMs);
    expect(next.danger).toBe("final");
  });

  it("resolves to failure the moment the 22000ms budget is reached", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 20000,
      warningAt,
      finalWarningAt,
      roundBudgetMs,
    });
    expect(s.phase).toBe("observing");
    const next = computeTickState(s, 22000, warningAt, finalWarningAt, roundBudgetMs);
    expect(next.phase).toBe("failure");
    expect(next.hasFired).toBe(true);
  });

  it("preserves the timeout contract even after FIRE", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "FIRE", hitTargetId: "operative-01" });
    const next = computeTickState(s, 50000, warningAt, finalWarningAt, roundBudgetMs);
    // TICK is a no-op once the round is resolved.
    expect(next).toBe(s);
  });

  it("is a no-op when the round is not observing or scoped", () => {
    const next = computeTickState(INITIAL_ROUND_STATE, 5000, warningAt, finalWarningAt, roundBudgetMs);
    expect(next).toBe(INITIAL_ROUND_STATE);
  });
});

/**
 * P2: a hidden tab must not consume engagement time. PAUSE freezes
 * the round (TICK is discarded, the timeout cannot fire). RESUME
 * consumes the pause but does not advance elapsed time itself; the
 * orchestrator (App.tsx) shifts the wall clock so the 22000ms
 * budget still represents 22000ms of visible play.
 */
describe("roundStateMachine - PAUSE / RESUME", () => {
  it("PAUSE freezes the round and rejects a second PAUSE", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(s.pausedAtMs).toBe(1000);
    expect(() => reduceRound(s, { type: "PAUSE", atMs: 2000 })).toThrow();
  });

  it("PAUSE only accepts observing or scoped", () => {
    expect(() => reduceRound(INITIAL_ROUND_STATE, { type: "PAUSE", atMs: 1 })).toThrow();
    const resolved = reduceRound(startObservation("north-relay", { u: 0.5, v: 0.5 }), {
      type: "TICK",
      elapsedMs: 22000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(() => reduceRound(resolved, { type: "PAUSE", atMs: 1 })).toThrow();
  });

  it("RESUME consumes a pause and rejects a second RESUME", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    s = reduceRound(s, { type: "RESUME", shiftMs: 2500 });
    expect(s.pausedAtMs).toBeNull();
    expect(() => reduceRound(s, { type: "RESUME", shiftMs: 0 })).toThrow();
  });

  it("RESUME rejects a negative shift (would rewind the round)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(() => reduceRound(s, { type: "RESUME", shiftMs: -1 })).toThrow();
  });

  it("TICK during a pause does not advance elapsed or danger", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    const next = computeTickState(s, 19000, 0.55 * 22000, 0.85 * 22000, 22000);
    expect(next).toBe(s);
  });

  it("the 22000ms timeout still fires after RESUME once visible play has consumed the budget", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    // The orchestrator shifts the wall clock by the pause duration
    // (the resume contract is documented in App.tsx), so when the
    // tab comes back the elapsed value is what was actually visible.
    s = reduceRound(s, { type: "RESUME", shiftMs: 5000 });
    const next = computeTickState(s, 22000, 0.55 * 22000, 0.85 * 22000, 22000);
    expect(next.phase).toBe("failure");
  });
});

/**
 * isGameplayInputAllowed is the single guard the App's handlers
 * use to make a paused round immune to gameplay input. Pinning
 * the table here means a future refactor of the state machine
 * cannot accidentally let a shot / scope-entry / scope-exit fire
 * while the round is paused.
 */
describe("isGameplayInputAllowed", () => {
  it("rejects the initial idle round", () => {
    expect(isGameplayInputAllowed(INITIAL_ROUND_STATE)).toBe(false);
  });

  it("accepts observing and scoped rounds when not paused", () => {
    const observing = startObservation("north-relay", { u: 0.5, v: 0.5 });
    expect(isGameplayInputAllowed(observing)).toBe(true);
    const scoped = reduceRound(observing, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    expect(isGameplayInputAllowed(scoped)).toBe(true);
  });

  it("rejects a paused observing round (the resume mousedown must NOT fire/enter-scope)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(isGameplayInputAllowed(s)).toBe(false);
  });

  it("rejects a paused scoped round (the resume mousedown must NOT fire or exit-scope)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(isGameplayInputAllowed(s)).toBe(false);
  });

  it("rejects resolved rounds (success / failure / missing-media)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "FIRE", hitTargetId: "operative-01" });
    expect(isGameplayInputAllowed(s)).toBe(false);
    s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, {
      type: "TICK",
      elapsedMs: 22000,
      warningAt: 0.55 * 22000,
      finalWarningAt: 0.85 * 22000,
      roundBudgetMs: 22000,
    });
    expect(isGameplayInputAllowed(s)).toBe(false);
    s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "MISSING_MEDIA" });
    expect(isGameplayInputAllowed(s)).toBe(false);
  });

  it("re-accepts gameplay input after RESUME", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(isGameplayInputAllowed(s)).toBe(false);
    s = reduceRound(s, { type: "RESUME", shiftMs: 100 });
    expect(isGameplayInputAllowed(s)).toBe(true);
  });
});
