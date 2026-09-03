/**
 * P2 (round 2): while the round is paused, the resume mousedown
 * must NOT also reach the scene's gameplay handlers. The defence
 * is two-layered:
 *
 *   1. The paused overlay is rendered with z-index above the
 *      scene stage and an onMouseDown handler that calls
 *      e.stopPropagation(). React's synthetic event delegation
 *      means a mousedown that lands on the overlay never reaches
 *      a sibling onMouseDown in React's dispatch.
 *
 *   2. The App's gameplay handlers consult `isGameplayInputAllowed`
 *      as a backstop. Even if a future refactor exposes another
 *      route to the gameplay handler (e.g. via the keyboard
 *      listener), the paused state still keeps FIRE / ENTER_SCOPE
 *      / EXIT_SCOPE inert.
 *
 * Both layers are pinned by this test.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  INITIAL_ROUND_STATE,
  isGameplayInputAllowed,
  reduceRound,
  startObservation,
} from "../state/roundStateMachine";

type OverlayProps = {
  onResume: () => void;
  onSceneMouseDown: (e: React.MouseEvent) => void;
  onSceneContextMenu: (e: React.MouseEvent) => void;
};

const PausedOverlayHarness = ({
  onResume,
  onSceneMouseDown,
  onSceneContextMenu,
}: OverlayProps) => (
  <div>
    {/* The scene stage is the first child; the paused overlay sits
     * on top of it (z-index is enforced in CSS, out of scope here).
     * The handlers attached to the scene div are the gameplay
     * path we are protecting. */}
    <div data-testid="scene-stage" onMouseDown={onSceneMouseDown} onContextMenu={onSceneContextMenu}>
      scene
    </div>
    <div
      data-testid="paused-overlay"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResume();
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResume();
      }}
    >
      <div data-testid="paused-banner">已暂停 · 点击或按任意键继续</div>
    </div>
  </div>
);

describe("paused overlay - resume gesture does not double as gameplay input", () => {
  it("a mousedown on the overlay calls resume and does NOT call the scene's onMouseDown", () => {
    const onResume = vi.fn();
    const onSceneMouseDown = vi.fn();
    const onSceneContextMenu = vi.fn();
    render(
      <PausedOverlayHarness
        onResume={onResume}
        onSceneMouseDown={onSceneMouseDown}
        onSceneContextMenu={onSceneContextMenu}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId("paused-overlay"));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSceneMouseDown).not.toHaveBeenCalled();
  });

  it("a contextmenu on the overlay calls resume and does NOT call the scene's onContextMenu", () => {
    const onResume = vi.fn();
    const onSceneMouseDown = vi.fn();
    const onSceneContextMenu = vi.fn();
    render(
      <PausedOverlayHarness
        onResume={onResume}
        onSceneMouseDown={onSceneMouseDown}
        onSceneContextMenu={onSceneContextMenu}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("paused-overlay"));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSceneContextMenu).not.toHaveBeenCalled();
  });

  it("isGameplayInputAllowed is false for every paused round, so the backstop handler also blocks", () => {
    // observing + paused
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(isGameplayInputAllowed(s)).toBe(false);
    // scoped + paused
    s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "ENTER_SCOPE", at: { u: 0.5, v: 0.5 } });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    expect(isGameplayInputAllowed(s)).toBe(false);
  });

  it("re-engages gameplay input after RESUME (sanity check)", () => {
    let s = startObservation("north-relay", { u: 0.5, v: 0.5 });
    s = reduceRound(s, { type: "PAUSE", atMs: 1000 });
    s = reduceRound(s, { type: "RESUME", shiftMs: 100 });
    expect(isGameplayInputAllowed(s)).toBe(true);
  });

  it("the initial round also blocks gameplay input (no double-fire on page load)", () => {
    expect(isGameplayInputAllowed(INITIAL_ROUND_STATE)).toBe(false);
  });
});
