import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneStage } from "../components/SceneStage";
import { SCENES } from "../scenes/sceneConfig";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("SceneStage realistic scope optics", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    // Keep playback pending so its success callback cannot schedule a
    // post-assertion React update outside the test's act boundary.
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses one fixed optical reticle in scope and restores the observation reticle after exit", () => {
    const props = {
      scene: SCENES[1],
      crosshair: { u: 0.5, v: 0.5 },
      scopeReticle: { u: 0.5, v: 0.5 },
      onPointerMove: () => undefined,
      onMouseDown: () => undefined,
      onContextMenu: () => undefined,
      startedAt: 1,
      danger: "calm" as const,
      showTarget: true,
      hitFlash: null,
      audioOn: true,
      onMissingMedia: () => undefined,
    };

    const { rerender, unmount } = render(
      <SceneStage
        {...props}
        phase="scoped"
        scopeEntry={{ u: 0.5, v: 0.5 }}
      />,
    );

    expect(screen.getByTestId("scope-reticle")).toBeInTheDocument();
    expect(screen.queryByTestId("reticle")).not.toBeInTheDocument();

    rerender(<SceneStage {...props} phase="observing" scopeEntry={null} />);
    expect(screen.queryByTestId("scope-reticle")).not.toBeInTheDocument();
    expect(screen.getByTestId("reticle")).toBeInTheDocument();
    unmount();
  });
});
