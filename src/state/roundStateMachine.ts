/**
 * Round state machine for the H3 2.5D sniper challenge.
 *
 * The machine is intentionally explicit: a round must be
 *   idle -> observing -> scoped -> (success | failure)
 * and only ever advances one step at a time. Trying to perform
 * an action that is not legal in the current state throws, which
 * keeps the caller honest and makes bugs easy to find.
 */

import type { NormalizedCoord } from "../types/scene";

export type RoundPhase =
  | "idle"
  | "observing"
  | "scoped"
  | "success"
  | "failure"
  | "missing-media";

export type DangerLevel = "calm" | "warning" | "final";

export type RoundState = {
  phase: RoundPhase;
  sceneId: string | null;
  /** Crosshair position while in the wide view. */
  crosshair: NormalizedCoord;
  /** Crosshair position captured at the moment the scope opened. */
  scopeEntry: NormalizedCoord | null;
  /** Crosshair position while in the scope view. */
  scopeReticle: NormalizedCoord;
  /** Elapsed wall-clock time since observing started, in ms. */
  elapsedMs: number;
  /** Current danger level based on elapsed vs warningAt / finalWarningAt. */
  danger: DangerLevel;
  /** Has the player fired their single shot? */
  hasFired: boolean;
  /** Whether the single shot landed on a target. */
  hitTargetId: string | null;
  /**
   * Wall-clock ms at which the round was paused (via the
   * `visibilitychange` listener), or null when not paused. A
   * `RESUME` event shifts the round's internal `startedAt` forward
   * by the paused duration, so the 22000ms budget still means
   * 22000ms of actual engagement time.
   */
  pausedAtMs: number | null;
  /** Last human-readable message, used by HUDs that want a status line. */
  lastEvent: string;
};

export const INITIAL_ROUND_STATE: RoundState = {
  phase: "idle",
  sceneId: null,
  crosshair: { u: 0.5, v: 0.5 },
  scopeEntry: null,
  scopeReticle: { u: 0.5, v: 0.5 },
  elapsedMs: 0,
  danger: "calm",
  hasFired: false,
  hitTargetId: null,
  pausedAtMs: null,
  lastEvent: "",
};

export type RoundEvent =
  | { type: "START_OBSERVATION"; sceneId: string; crosshair: NormalizedCoord }
  | { type: "MOVE_CROSSHAIR"; crosshair: NormalizedCoord }
  | { type: "ENTER_SCOPE"; at: NormalizedCoord }
  | { type: "EXIT_SCOPE" }
  | { type: "MOVE_SCOPE_RETICLE"; reticle: NormalizedCoord }
  | { type: "FIRE"; hitTargetId: string | null }
  | { type: "TIMEOUT" }
  | { type: "MISSING_MEDIA" }
  | { type: "TICK"; elapsedMs: number; warningAt: number; finalWarningAt: number; roundBudgetMs: number }
  | { type: "PAUSE"; atMs: number }
  | { type: "RESUME"; shiftMs: number }
  | { type: "RESET" };

const assert = (cond: unknown, message: string): void => {
  if (!cond) {
    throw new Error(`[roundStateMachine] illegal transition: ${message}`);
  }
};

const computeDanger = (elapsedMs: number, warningAt: number, finalWarningAt: number): DangerLevel => {
  if (elapsedMs >= finalWarningAt) return "final";
  if (elapsedMs >= warningAt) return "warning";
  return "calm";
};

/**
 * Pure tick reducer: given the current state and the elapsed
 * `now - startedAt` (in ms), return what the round should look like
 * at this instant. The function is intentionally side-effect free
 * so the React orchestrator can call it from a requestAnimationFrame
 * loop, throttle the resulting state dispatch to a low frequency,
 * and still trust the thresholds (warning / final / timeout) to
 * fire on the exact frame the budget is reached.
 *
 * Returning `state` (the same reference) is the canonical "no-op"
 * signal: the caller can skip a React dispatch entirely.
 */
export function computeTickState(
  state: RoundState,
  elapsedMs: number,
  warningAt: number,
  finalWarningAt: number,
  roundBudgetMs: number,
): RoundState {
  if (state.phase !== "observing" && state.phase !== "scoped") {
    return state;
  }
  // While paused, ticks must not advance elapsedMs/danger. The
  // orchestrator still emits them (so the rAF loop is the single
  // scheduling path), but the state machine discards them.
  if (state.pausedAtMs !== null) {
    return state;
  }
  // Budget exhausted: synthesize a TIMEOUT transition so the
  // timeout contract is enforced regardless of the dispatch
  // frequency of the React orchestrator.
  if (elapsedMs >= roundBudgetMs) {
    return reduceRound(state, { type: "TIMEOUT" });
  }
  const danger = computeDanger(elapsedMs, warningAt, finalWarningAt);
  // Pure no-op: nothing visible has changed, so the caller can
  // skip the React state update entirely.
  if (danger === state.danger && elapsedMs === state.elapsedMs) {
    return state;
  }
  return { ...state, elapsedMs, danger };
}

export function reduceRound(state: RoundState, event: RoundEvent): RoundState {
  switch (event.type) {
    case "START_OBSERVATION": {
      assert(state.phase === "idle" || state.phase === "success" || state.phase === "failure",
        `cannot start observation from phase=${state.phase}`);
      return {
        ...INITIAL_ROUND_STATE,
        phase: "observing",
        sceneId: event.sceneId,
        crosshair: event.crosshair,
        scopeReticle: event.crosshair,
        lastEvent: "scope_opening",
      };
    }

    case "MOVE_CROSSHAIR": {
      assert(state.phase === "observing", `MOVE_CROSSHAIR requires observing (got ${state.phase})`);
      return { ...state, crosshair: event.crosshair };
    }

    case "ENTER_SCOPE": {
      assert(state.phase === "observing", `ENTER_SCOPE requires observing (got ${state.phase})`);
      return {
        ...state,
        phase: "scoped",
        scopeEntry: event.at,
        scopeReticle: event.at,
        lastEvent: "scope_opened",
      };
    }

    case "EXIT_SCOPE": {
      assert(state.phase === "scoped", `EXIT_SCOPE requires scoped (got ${state.phase})`);
      return {
        ...state,
        phase: "observing",
        crosshair: state.scopeEntry ?? state.crosshair,
        lastEvent: "scope_closed",
      };
    }

    case "MOVE_SCOPE_RETICLE": {
      assert(state.phase === "scoped", `MOVE_SCOPE_RETICLE requires scoped (got ${state.phase})`);
      return { ...state, scopeReticle: event.reticle };
    }

    case "FIRE": {
      assert(state.phase === "scoped", `FIRE requires scoped (got ${state.phase})`);
      assert(!state.hasFired, "FIRE called after hasFired is already true");
      const phase: RoundPhase = event.hitTargetId ? "success" : "failure";
      return {
        ...state,
        phase,
        hasFired: true,
        hitTargetId: event.hitTargetId,
        lastEvent: event.hitTargetId ? "hit" : "miss",
      };
    }

    case "TIMEOUT": {
      assert(state.phase === "observing" || state.phase === "scoped",
        `TIMEOUT requires observing or scoped (got ${state.phase})`);
      assert(!state.hasFired, "TIMEOUT after a shot is already resolved");
      return {
        ...state,
        phase: "failure",
        hasFired: true,
        hitTargetId: null,
        lastEvent: "timeout",
      };
    }

    case "MISSING_MEDIA": {
      assert(state.phase !== "success" && state.phase !== "failure",
        "MISSING_MEDIA must precede a resolution");
      return { ...state, phase: "missing-media", lastEvent: "missing_media" };
    }

    case "TICK": {
      return computeTickState(
        state,
        event.elapsedMs,
        event.warningAt,
        event.finalWarningAt,
        event.roundBudgetMs,
      );
    }

    case "PAUSE": {
      assert(state.phase === "observing" || state.phase === "scoped",
        `PAUSE requires observing or scoped (got ${state.phase})`);
      assert(state.pausedAtMs === null, "PAUSE while already paused");
      return { ...state, pausedAtMs: event.atMs, lastEvent: "paused" };
    }

    case "RESUME": {
      // RESUME just consumes a pause. The orchestrator (App.tsx) is
      // responsible for shifting the wall clock so the elapsed time
      // excludes the paused interval; the state machine only checks
      // that the transition is legal.
      assert(state.phase === "observing" || state.phase === "scoped",
        `RESUME requires observing or scoped (got ${state.phase})`);
      assert(state.pausedAtMs !== null, "RESUME while not paused");
      assert(event.shiftMs >= 0, `RESUME shiftMs must be non-negative (got ${event.shiftMs})`);
      return { ...state, pausedAtMs: null, lastEvent: "resumed" };
    }

    case "RESET": {
      return { ...INITIAL_ROUND_STATE, lastEvent: "reset" };
    }
  }
}

/** Convenience helper for tests and components. */
export function startObservation(sceneId: string, crosshair: NormalizedCoord): RoundState {
  return reduceRound(INITIAL_ROUND_STATE, { type: "START_OBSERVATION", sceneId, crosshair });
}

/**
 * Pure guard for gameplay input. The two gameplay inputs (left
 * click to fire, right click to enter/exit scope) must be no-ops
 * when the round is not actively engaged: when it is idle, success,
 * failure, missing-media, or paused. The orchestrator (App.tsx)
 * uses this to keep its handlers inert whenever the player is not
 * in a live observation/scope, so a window-level "resume" gesture
 * cannot double as a shot.
 */
export function isGameplayInputAllowed(state: RoundState): boolean {
  if (state.phase !== "observing" && state.phase !== "scoped") return false;
  if (state.pausedAtMs !== null) return false;
  return true;
}
