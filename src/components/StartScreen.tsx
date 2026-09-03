/**
 * Start + scene selection screen. Implements the copy from
 * specs/DESIGN.md §1. Locked scenes render but cannot be selected.
 */

import { useEffect, useRef, useState } from "react";
import type { SceneConfig } from "../types/scene";
import { playUi } from "../audio/audio";

type Props = {
  scenes: ReadonlyArray<SceneConfig>;
  onStart: (sceneId: string) => void;
  audioOn: boolean;
  onToggleAudio: () => void;
};

export const StartScreen = ({ scenes, onStart, audioOn, onToggleAudio }: Props) => {
  const [selected, setSelected] = useState<string>(scenes[0]?.id ?? "");
  const enterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    enterRef.current?.focus();
  }, []);

  const handleSelect = (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene || scene.status === "locked") return;
    setSelected(id);
    playUi();
  };

  const handleStart = () => {
    const scene = scenes.find((s) => s.id === selected);
    if (!scene || scene.status === "locked") return;
    onStart(scene.id);
  };

  return (
    <div className="menu-screen" data-testid="start-screen">
      <button
        className="audio-toggle"
        onClick={onToggleAudio}
        data-testid="audio-toggle-start"
        aria-pressed={!audioOn}
      >
        {audioOn ? "声音：开启" : "声音：关闭"}
      </button>
      <h1>H3 2.5D 狙击挑战</h1>
      <p className="promise">在目标发现你之前，完成唯一的一枪</p>
      <div className="scene-grid">
        {scenes.map((scene) => {
          const isLocked = scene.status === "locked";
          const isSelected = scene.id === selected;
          return (
            <button
              key={scene.id}
              className={`scene-card ${isSelected ? "selected" : ""} ${isLocked ? "locked" : ""}`}
              onClick={() => handleSelect(scene.id)}
              disabled={isLocked}
              data-testid={`scene-card-${scene.id}`}
              data-locked={isLocked}
            >
              <div className="card-title">{scene.title}</div>
              <div className="card-subtitle">{scene.subtitle}</div>
              <div className="card-status">{isLocked ? "待解锁" : "可用任务"}</div>
            </button>
          );
        })}
      </div>
      <div className="menu-actions">
        <button
          ref={enterRef}
          className="primary"
          onClick={handleStart}
          disabled={!selected}
          data-testid="enter-mission"
        >
          进入任务
        </button>
      </div>
      <div className="menu-footer">MINIMAX CODE // H3 VIDEO // SPEECH 2.8 // MUSIC 3.0</div>
    </div>
  );
};
