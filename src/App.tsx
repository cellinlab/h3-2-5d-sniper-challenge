/**
 * Top-level orchestrator. Owns the round state machine, the
 * keyboard bindings, the master clock, the audio lifecycle, and
 * the HUD overlays. Pure logic lives in `state/*`; this file only
 * composes them.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SCENES } from "./scenes/sceneConfig";
import {
  INITIAL_ROUND_STATE,
  reduceRound,
} from "./state/roundStateMachine";
import { clampCoord } from "./state/coordinate";
import { hitTest } from "./state/hitTest";
import {
  playCue,
  playVoice,
  preloadVoiceAssets,
  setMuted,
  startHeartbeat,
  stopHeartbeat,
} from "./audio/audio";
import { StartScreen } from "./components/StartScreen";
import { SceneStage } from "./components/SceneStage";
import { ResultScreen } from "./components/ResultScreen";
import type { NormalizedCoord, SceneConfig } from "./types/scene";

type AppScreen = "start" | "round" | "result" | "missing-media";

const findScene = (id: string | null): SceneConfig | null => {
  if (!id) return null;
  return SCENES.find((s) => s.id === id) ?? null;
};

export const App = () => {
  const [round, dispatch] = useReducer(reduceRound, INITIAL_ROUND_STATE);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [audioOn, setAudioOn] = useState<boolean>(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [resolvedAt, setResolvedAt] = useState<number | null>(null);
  const [hitFlash, setHitFlash] = useState<{ id: string; at: number } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const firedRef = useRef<boolean>(false);
  const sceneRef = useRef<SceneConfig | null>(null);
  const previousDangerRef = useRef<"calm" | "warning" | "final">("calm");
  const subtitleTimerRef = useRef<number | null>(null);
  const [missionSubtitle, setMissionSubtitle] = useState<string | null>(null);

  const scene = useMemo(() => findScene(round.sceneId), [round.sceneId]);
  sceneRef.current = scene;

  useEffect(() => {
    for (const candidate of SCENES) {
      preloadVoiceAssets(Object.values(candidate.audio.voice));
    }
    return () => {
      if (subtitleTimerRef.current !== null) {
        window.clearTimeout(subtitleTimerRef.current);
      }
    };
  }, []);

  const announce = useCallback((copy: string, voiceAsset?: string) => {
    playVoice(voiceAsset);
    setMissionSubtitle(copy);
    if (subtitleTimerRef.current !== null) {
      window.clearTimeout(subtitleTimerRef.current);
    }
    subtitleTimerRef.current = window.setTimeout(() => {
      setMissionSubtitle(null);
      subtitleTimerRef.current = null;
    }, 2200);
  }, []);

  // Track the live pointer in viewport CSS pixels so SceneStage can
  // draw the magnified view and the reticle at the cursor location.
  useEffect(() => {
    if (screen !== "round") return;
    const onMove = (e: PointerEvent) => {
      setPointer({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [screen]);

  // Round clock. Drives the TICK events; stops when the round leaves
  // observing/scoped.
  useEffect(() => {
    if (screen !== "round") return;
    if (round.phase !== "observing" && round.phase !== "scoped") return;
    if (startedAt === null) return;
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      if (sceneRef.current) {
        dispatch({
          type: "TICK",
          elapsedMs: elapsed,
          warningAt: sceneRef.current.warningAt * sceneRef.current.roundBudgetMs,
          finalWarningAt: sceneRef.current.finalWarningAt * sceneRef.current.roundBudgetMs,
          roundBudgetMs: sceneRef.current.roundBudgetMs,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [screen, round.phase, startedAt]);

  // Heartbeat follows the danger level.
  useEffect(() => {
    if (screen !== "round") {
      stopHeartbeat();
      return;
    }
    if (round.phase !== "observing" && round.phase !== "scoped") {
      stopHeartbeat();
      return;
    }
    startHeartbeat(round.danger);
    return () => stopHeartbeat();
  }, [screen, round.phase, round.danger]);

  // Speech cues fire exactly once at each danger threshold. The
  // visible warning copy remains on screen for muted play.
  useEffect(() => {
    if (screen !== "round") {
      previousDangerRef.current = "calm";
      return;
    }
    if (!scene || previousDangerRef.current === round.danger) return;
    previousDangerRef.current = round.danger;
    if (round.danger === "warning") playVoice(scene.audio.voice.warning);
    if (round.danger === "final") playVoice(scene.audio.voice.finalWarning);
  }, [screen, round.danger, scene]);

  // Resolve lines are independent from the result-screen transition,
  // so audio cannot be skipped by a fast React state update.
  useEffect(() => {
    if (!scene) return;
    if (round.phase === "success") playVoice(scene.audio.voice.success);
    if (round.phase === "failure") playVoice(scene.audio.voice.failure);
  }, [round.phase, scene]);

  // Promote the screen based on phase changes.
  useEffect(() => {
    if (screen !== "round") return;
    if (round.phase === "success" || round.phase === "failure") {
      if (resolvedAt === null) setResolvedAt(performance.now());
      setScreen("result");
    } else if (round.phase === "missing-media") {
      setScreen("missing-media");
    }
  }, [screen, round.phase, resolvedAt]);

  // Audio mute is kept in sync with the React state on every change.
  useEffect(() => {
    setMuted(!audioOn);
  }, [audioOn]);

  const startRound = useCallback((sceneId: string, opening: "briefing" | "retry" = "briefing") => {
    const s = findScene(sceneId);
    if (!s) return;
    setStartedAt(performance.now());
    setResolvedAt(null);
    setHitFlash(null);
    firedRef.current = false;
    dispatch({
      type: "START_OBSERVATION",
      sceneId,
      crosshair: { u: 0.5, v: 0.5 },
    });
    setScreen("round");
    playCue("ui");
    if (opening === "retry") {
      announce("重新建立观察。", s.audio.voice.retry);
    } else {
      announce("观察区域，确认目标。", s.audio.voice.briefing);
    }
  }, [announce]);

  const goToStart = useCallback(() => {
    setScreen("start");
    setStartedAt(null);
    setResolvedAt(null);
    setHitFlash(null);
    firedRef.current = false;
    dispatch({ type: "RESET" });
    stopHeartbeat();
  }, []);

  const retryRound = useCallback(() => {
    if (round.sceneId) {
      startRound(round.sceneId, "retry");
    } else {
      goToStart();
    }
  }, [round.sceneId, startRound, goToStart]);

  const exitScope = useCallback(() => {
    dispatch({ type: "EXIT_SCOPE" });
  }, []);

  // Pointer move while observing: update the wide-view crosshair.
  // In scope mode SceneStage computes the reticle scene coord itself
  // and pushes it back through onPointerMove, so we only need to
  // dispatch when we are still in observing.
  const handlePointerMove = useCallback(
    (coord: NormalizedCoord | null) => {
      if (!coord) return;
      if (round.phase === "observing") {
        dispatch({ type: "MOVE_CROSSHAIR", crosshair: clampCoord(coord) });
      } else if (round.phase === "scoped") {
        dispatch({ type: "MOVE_SCOPE_RETICLE", reticle: clampCoord(coord) });
      }
    },
    [round.phase],
  );

  // Right click: enter or leave scope. The scope entry is taken
  // straight from the event's clientX/Y, so it works on the very
  // first click even if no pointermove fired beforehand.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, sceneCoordAtPointer: NormalizedCoord | null) => {
      e.preventDefault();
      if (round.phase === "observing") {
        const entry =
          sceneCoordAtPointer ?? round.crosshair;
        dispatch({ type: "ENTER_SCOPE", at: clampCoord(entry) });
        playCue("scope");
        if (scene) announce("保持呼吸。", scene.audio.voice.scopeOpen);
      } else if (round.phase === "scoped") {
        exitScope();
        playCue("scope");
      }
    },
    [round.phase, round.crosshair, exitScope, scene, announce],
  );

  // Left click in scope fires the single shot. The aim point is the
  // event-derived scene coord, so the click works even when the
  // mouse hasn't moved since scope entry.
  const handleMouseDown = useCallback(
    (button: number, sceneCoordAtPointer: NormalizedCoord | null) => {
      if (button !== 0) return;
      if (round.phase !== "scoped") return;
      if (firedRef.current) return;
      if (!scene) return;
      firedRef.current = true;
      const aim = sceneCoordAtPointer ?? round.scopeReticle;
      playCue("shot");
      const hitId = hitTest(aim, scene);
      if (hitId) {
        setHitFlash({ id: hitId, at: Date.now() });
        playCue("hit");
      } else {
        playCue("fail");
      }
      dispatch({ type: "FIRE", hitTargetId: hitId });
    },
    [round.phase, round.scopeReticle, scene],
  );

  const handleMissingMedia = useCallback(() => {
    dispatch({ type: "MISSING_MEDIA" });
  }, []);

  // Keyboard: Enter confirms start, Esc backs out, M toggles mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (screen === "round" && round.phase === "scoped") {
          exitScope();
        } else if (
          screen === "result" ||
          screen === "missing-media" ||
          (screen === "round" && round.phase !== "observing")
        ) {
          goToStart();
        } else if (screen === "round" && round.phase === "observing") {
          goToStart();
        }
        return;
      }
      if (e.key === "m" || e.key === "M") {
        setAudioOn((cur) => !cur);
        return;
      }
      if (e.key === "Enter") {
        if (screen === "start") {
          const first = SCENES.find((s) => s.status !== "locked");
          if (first) startRound(first.id);
        } else if (screen === "result") {
          if (round.phase === "success" || round.phase === "failure") {
            retryRound();
          } else {
            goToStart();
          }
        } else if (screen === "missing-media") {
          goToStart();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, round.phase, exitScope, goToStart, retryRound, startRound]);

  const toggleAudio = useCallback(() => {
    setAudioOn((cur) => !cur);
  }, []);

  if (screen === "start") {
    return (
      <div className="app-shell">
        <StartScreen
          scenes={SCENES}
          onStart={startRound}
          audioOn={audioOn}
          onToggleAudio={toggleAudio}
        />
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="app-shell">
        <div className="result-screen">
          <h1>任务素材未就绪</h1>
          <p className="explanation">请按 README 配置本地场景媒体后重试。</p>
          <div className="menu-actions">
            <button className="primary" onClick={goToStart}>
              返回选场
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dangerClass = `danger-edge ${round.danger === "final" ? "final" : round.danger === "warning" ? "warning" : ""}`;
  const dangerText =
    round.danger === "final" ? "位置即将暴露。" : round.danger === "warning" ? "目标正在搜索你。" : "";
  const elapsedMs = resolvedAt && startedAt ? resolvedAt - startedAt : 0;
  const phase = round.phase === "scoped" ? "scoped" : "observing";
  const showTarget = true;

  return (
    <div className="app-shell">
      <div className="hud-corner tl" data-testid="hud-sector">
        <span className="label">SECTOR</span>
        <span className="value">{scene.sectorLabel}</span>
      </div>
      <div className="hud-corner tr" data-testid="hud-shot">
        <span className="label">RULES OF ENGAGEMENT</span>
        <span className="value">ONE SHOT</span>
      </div>
      <div className="hud-corner bl">
        <span className="label">CONTROL</span>
        <span className="value">
          {round.phase === "scoped"
            ? "移动寻找目标 · 左键射击 · 右键退出"
            : "移动鼠标观察 · 右键开镜"}
        </span>
      </div>
      <div className="hud-corner br">
        <span className="label">AUDIO</span>
        <span className="value" data-testid="hud-audio">
          {audioOn ? "开启" : "关闭"} · M
        </span>
      </div>
      <SceneStage
        scene={scene}
        phase={phase}
        crosshair={round.crosshair}
        scopeReticle={round.scopeReticle}
        scopeEntry={round.scopeEntry}
        pointer={pointer}
        onPointerMove={handlePointerMove}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        startedAt={startedAt}
        danger={round.danger}
        showTarget={showTarget}
        hitFlash={hitFlash}
        audioOn={audioOn}
        onMissingMedia={handleMissingMedia}
      />
      <div className={dangerClass} data-testid="danger-edge" data-danger={round.danger} />
      <div
        className={`danger-text ${round.danger !== "calm" ? "visible" : ""}`}
        data-testid="danger-text"
      >
        {dangerText}
      </div>
      <div
        className={`mission-subtitle ${missionSubtitle ? "visible" : ""}`}
        aria-live="polite"
        data-testid="mission-subtitle"
      >
        {missionSubtitle}
      </div>
      {(screen === "result" || screen === "missing-media") && (
        <ResultScreen
          variant={
            screen === "missing-media"
              ? "missing-media"
              : round.phase === "success"
                ? "success"
                : "failure"
          }
          scene={scene}
          elapsedMs={elapsedMs}
          onRetry={retryRound}
          onBack={goToStart}
        />
      )}
    </div>
  );
};

export default App;
