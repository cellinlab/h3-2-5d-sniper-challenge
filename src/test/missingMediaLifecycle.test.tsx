import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneStage } from "../components/SceneStage";
import { SCENES } from "../scenes/sceneConfig";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("SceneStage missing-media lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("surfaces a late video error without changing the component hook count", async () => {
    const onMissingMedia = vi.fn();
    const { unmount } = render(
      <SceneStage
        scene={SCENES[0]}
        phase="observing"
        crosshair={{ u: 0.5, v: 0.5 }}
        scopeReticle={{ u: 0.5, v: 0.5 }}
        scopeEntry={null}
        onPointerMove={() => undefined}
        onMouseDown={() => undefined}
        onContextMenu={() => undefined}
        startedAt={0}
        danger="calm"
        showTarget
        hitFlash={null}
        audioOn
        onMissingMedia={onMissingMedia}
      />,
    );

    fireEvent.error(screen.getByTestId("master-video"));

    await waitFor(() => expect(onMissingMedia).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("master-video")).toBeInTheDocument();
    expect(screen.queryByTestId("reticle")).not.toBeInTheDocument();
    unmount();
  });
});
