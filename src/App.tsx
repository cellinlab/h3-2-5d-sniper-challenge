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
  computeTickState,
  isGameplayInputAllowed,
  reduceRound,
} from "./state/roundStateMachine";
import { clampCoord } from "./state/coordinate";
import { hitTest } from "./state/hitTest";
import {
  pauseMusic,
  playCue,
  playVoice,
  preloadVoiceAssets,
  resumeMusic,
  setMuted,
  startHeartbeat,
  startMusic,
  startScopeAmbience,
  stopHeartbeat,
  stopMusic,
  stopScopeAmbience,
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
  // Per-target art images. The parent owns the load lifecycle so
  // SceneStage can stay a pure renderer.
  const [targetImages, setTargetImages] = useState<Map<string, HTMLImageElement>>(
    () => new Map(),
  );
  const firedRef = useRef<boolean>(false);
  const sceneRef = useRef<SceneConfig | null>(null);
  // The latest round is always reachable from inside the rAF loop
  // without putting `round` into the loop's effect dependencies.
  // If `round` were in the deps, every TICK dispatch would tear the
  // loop down (lastDispatchedMs resets to -1) and the throttle would
  // be defeated: the next frame would always dispatch.
  const roundRef = useRef<typeof round>(round);
  roundRef.current = round;
  const previousDangerRef = useRef<"calm" | "warning" | "final">("calm");
  const subtitleTimerRef = useRef<number | null>(null);
  const [missionSubtitle, setMissionSubtitle] = useState<string | null>(null);

  const scene = useMemo(() => findScene(round.sceneId), [round.sceneId]);
  sceneRef.current = scene;

  const handleMissingMedia = useCallback(() => {
    dispatch({ type: "MISSING_MEDIA" });
    // Stop immediately instead of waiting for the phase-to-screen
    // promotion effect. This also covers target-art load failures,
    // which happen in the parent image preloader.
    stopMusic();
  }, []);

  // Preload per-target art images for the current scene. A new
  // round clears the image cache; the loaders run in parallel and
  // atomically swap the map when the last image arrives (or
  // earlier, by replacing the map on each onload). A single
  // missing art path surfaces through the same recovery path
  // SceneStage used for the single-target case.
  useEffect(() => {
    if (!scene) {
      setTargetImages(new Map());
      return;
    }
    const next = new Map<string, HTMLImageElement>();
    let cancelled = false;
    let pending = scene.targets.length;
    if (pending === 0) {
      setTargetImages(next);
      return;
    }
    for (const target of scene.targets) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        next.set(target.id, img);
        // Update on each load so cleared targets fall off cleanly
        // when their art is reloaded; the parent re-renders with
        // the freshest map. We swap the reference every time so
        // React picks it up.
        setTargetImages(new Map(next));
        pending -= 1;
        if (pending === 0) {
          // All loaded; nothing more to do.
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        handleMissingMedia();
      };
      img.src = target.artPath;
    }
    return () => {
      cancelled = true;
    };
  }, [scene, handleMissingMedia]);

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

  // Round clock. The TICK events are computed on every animation
  // frame (so the 22000ms timeout fires on the exact frame the
  // budget is reached) but the React dispatch is throttled to a
  // stable low frequency. `computeTickState` is pure, so the
  // throttled dispatch does not change any visible threshold: the
  // orchestrator only skips a dispatch when the result is the same
  // object reference (i.e. nothing changed). The first phase change
  // (e.g. timeout resolving to failure) is always dispatched so the
  // orchestrator can transition to the result screen.
  //
  // The effect reads the latest round from `roundRef`, NOT from a
  // `round` closure variable. Putting `round` in the dependency
  // array would tear this loop down on every TICK dispatch (the
  // ref resets lastDispatchedMs to -1 and the next frame always
  // re-dispatches), defeating the throttle.
  useEffect(() => {
    if (screen !== "round") return;
    if (round.phase !== "observing" && round.phase !== "scoped") return;
    if (startedAt === null) return;
    // Practice scenes have no time budget; the 22-second timer is
    // a timed-mission contract that the reducer / HUD copy rely
    // on. Skipping the rAF tick loop here is the cleanest way to
    // keep "no time" a structural property of the practice mode
    // rather than a runtime no-op.
    if (scene?.ruleMode === "untimed-practice") return;
    if (scene?.ruleMode !== "timed-mission") return;
    let frame = 0;
    let lastDispatchedMs = -1;
    const TICK_INTERVAL_MS = 100;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const scene = sceneRef.current;
      const current = roundRef.current;
      if (!scene) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (current.phase !== "observing" && current.phase !== "scoped") {
        // Round resolved (success/failure) or paused through
        // PAUSE/RESUME — nothing to advance.
        frame = requestAnimationFrame(tick);
        return;
      }
      // Only timed-mission scenes carry a budget and a danger
      // curve. Practice scenes take the structural "no time"
      // contract from `ruleMode` and are skipped here.
      if (scene.ruleMode !== "timed-mission") {
        frame = requestAnimationFrame(tick);
        return;
      }
      const warningAt = scene.warningAt * scene.roundBudgetMs;
      const finalWarningAt = scene.finalWarningAt * scene.roundBudgetMs;
      const next = computeTickState(
        current,
        elapsed,
        warningAt,
        finalWarningAt,
        scene.roundBudgetMs,
      );
      if (next.phase !== current.phase) {
        // Phase change (typically TIMEOUT). Dispatch so the result
        // screen is reached on the exact frame the budget ends.
        dispatch({
          type: "TICK",
          elapsedMs: elapsed,
          warningAt,
          finalWarningAt,
          roundBudgetMs: scene.roundBudgetMs,
        });
        lastDispatchedMs = elapsed;
      } else if (elapsed - lastDispatchedMs >= TICK_INTERVAL_MS) {
        // Throttled periodic dispatch so the HUD has fresh values
        // but the React update frequency is bounded (~10 Hz) instead
        // of 60 Hz.
        dispatch({
          type: "TICK",
          elapsedMs: elapsed,
          warningAt,
          finalWarningAt,
          roundBudgetMs: scene.roundBudgetMs,
        });
        lastDispatchedMs = elapsed;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [screen, round.phase, startedAt, scene?.ruleMode]);

  // P2: pause the round when the tab becomes hidden, resume only on
  // an explicit user gesture (key press or pointer click). Without
  // this, a player who switches tabs would lose round budget to a
  // hidden tab — the 22-second cap is part of the contract and the
  // tab should not consume engagement time the player cannot see.
  useEffect(() => {
    if (screen !== "round") return;
    if (round.phase !== "observing" && round.phase !== "scoped") return;
    if (round.pausedAtMs !== null) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        dispatch({ type: "PAUSE", atMs: performance.now() });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [screen, round.phase, round.pausedAtMs]);

  // Resume handler. The state machine only consumes a pause; the
  // orchestrator shifts the wall clock so the 22000ms budget still
  // represents 22000ms of *visible* engagement.
  const resumeRound = useCallback(() => {
    if (round.pausedAtMs === null) return;
    const shift = performance.now() - round.pausedAtMs;
    dispatch({ type: "RESUME", shiftMs: shift });
    // After resuming, anchor startedAt forward by `shift` so the
    // next rAF tick sees the unpaused elapsed time.
    if (startedAt !== null) setStartedAt(startedAt + shift);
  }, [round.pausedAtMs, startedAt]);

  // The original wide-view heartbeat follows danger only in the
  // timed mission. Once scoped, startScopeAmbience owns the double
  // pulse so two independent heartbeat loops never stack. Practice
  // is intentionally quiet in wide view and gains its calm pulse
  // only after opening the scope.
  useEffect(() => {
    if (
      screen !== "round" ||
      round.ruleMode !== "timed-mission" ||
      round.phase !== "observing"
    ) {
      stopHeartbeat();
      return;
    }
    startHeartbeat(round.danger);
    return () => stopHeartbeat();
  }, [screen, round.phase, round.ruleMode, round.danger]);

  // Speech cues fire exactly once at each danger threshold. The
  // visible warning copy remains on screen for muted play.
  // Practice rounds have no danger escalation, so this is a
  // structural no-op for them (danger is always "calm" — see
  // roundStateMachine) and the speech lines are not even
  // configured in the practice manifest.
  //
  // The same effect also bumps the scope-ambience level: timed
  // missions scale the heartbeat to the danger level; practice
  // rounds stay at "calm" no matter what the reducer reports.
  useEffect(() => {
    if (screen !== "round") {
      previousDangerRef.current = "calm";
      return;
    }
    if (!scene || previousDangerRef.current === round.danger) return;
    if (round.ruleMode === "untimed-practice") return;
    previousDangerRef.current = round.danger;
    if (round.danger === "warning") playVoice(scene.audio.voice.warning);
    if (round.danger === "final") playVoice(scene.audio.voice.finalWarning);
  }, [screen, round.danger, round.ruleMode, scene]);

  // Scope ambience: start the breath + heartbeat when the player
  // enters scope, update the level when danger escalates, stop
  // on every exit path. Practice rounds always run at "calm";
  // timed-mission rounds track round.danger. The visibility /
  // pause effect below stops the ambience too; resume will
  // re-start it only if the round is still scoped.
  useEffect(() => {
    if (
      screen === "round" &&
      round.phase === "scoped" &&
      round.pausedAtMs === null
    ) {
      const level = round.ruleMode === "untimed-practice" ? "calm" : round.danger;
      startScopeAmbience(level);
    } else {
      stopScopeAmbience();
    }
  }, [
    screen,
    round.phase,
    round.ruleMode,
    round.danger,
    round.pausedAtMs,
  ]);

  // Resolve lines are independent from the result-screen transition,
  // so audio cannot be skipped by a fast React state update.
  useEffect(() => {
    if (!scene) return;
    if (round.phase === "success") playVoice(scene.audio.voice.success);
    if (round.phase === "failure") playVoice(scene.audio.voice.failure);
  }, [round.phase, scene]);

  // Promote the screen based on phase changes. Music stops on
  // round resolution (success / failure / missing-media) and on
  // return to the scene-select screen. The 22s budget is a
  // wall-clock contract; stopping the music does not shift it.
  useEffect(() => {
    if (screen !== "round") return;
    if (round.phase === "success" || round.phase === "failure") {
      if (resolvedAt === null) setResolvedAt(performance.now());
      setScreen("result");
      stopMusic();
    } else if (round.phase === "missing-media") {
      setScreen("missing-media");
      stopMusic();
    }
  }, [screen, round.phase, resolvedAt]);

  // Music pause / resume is driven by the round pause flag. When
  // the document is hidden the visibilitychange listener dispatches
  // PAUSE, which sets `pausedAtMs`; this effect then calls
  // pauseMusic. The 22-second visible-time budget is anchored by
  // the round clock, not by audio, so a paused music does not
  // consume the player's time.
  useEffect(() => {
    if (round.pausedAtMs !== null) {
      pauseMusic();
    } else {
      resumeMusic();
    }
  }, [round.pausedAtMs]);

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
      ruleMode: s.ruleMode,
      targetCount: s.targets.length,
    });
    setScreen("round");
    playCue("ui");
    // Start the scene's background music (if any). Always inside a
    // user gesture: this runs from the "进入任务" / "再来一局" /
    // "重新建立观察" click. The lifecycle is self-contained: stop /
    // pause / resume is driven by the orchestrator.
    if (s.audio.music) {
      startMusic(s.audio.music);
    }
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
    stopMusic();
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
  // first click even if no pointermove fired beforehand. When the
  // round is paused (or otherwise not in observing/scoped) the
  // handler is a strict no-op: the resume gesture is delivered by
  // the paused overlay, not by this gameplay path.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, sceneCoordAtPointer: NormalizedCoord | null) => {
      e.preventDefault();
      if (!isGameplayInputAllowed(round)) return;
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
    [round, exitScope, scene, announce],
  );

  // Left click in scope fires. The aim point is the event-derived
  // scene coord, so the click works even when the mouse hasn't
  // moved since scope entry. The handler is a strict no-op when
  // the round is paused, so the resume mousedown cannot also
  // fire the gun.
  //
  // For a timed-mission scene `firedRef` is a one-shot latch and
  // a second click would be ignored. For an untimed-practice
  // scene the latch is reset at the start of every fire so the
  // player can take another shot after a hit returns them to
  // wide observation.
  const handleMouseDown = useCallback(
    (button: number, sceneCoordAtPointer: NormalizedCoord | null) => {
      if (button !== 0) return;
      if (!isGameplayInputAllowed(round)) return;
      if (round.phase !== "scoped") return;
      if (!scene) return;
      if (firedRef.current) return;
      firedRef.current = true;
      const aim = sceneCoordAtPointer ?? round.scopeReticle;
      playCue("shot");
      // The reducer is the single source of truth for cleared
      // targets. We pass `round.clearedTargetIds` (not a React
      // mirror) so a defensive re-fire on the same hitbox cannot
      // double-count the id and so the renderer, the hit test
      // and the HUD all read the same list.
      const hitId = hitTest(aim, scene, round.clearedTargetIds);
      if (hitId) {
        setHitFlash({ id: hitId, at: Date.now() });
        playCue("hit");
      } else {
        playCue("fail");
      }
      dispatch({ type: "FIRE", hitTargetId: hitId });
    },
    [round, scene],
  );

  // Release the practice latch only after the reducer has committed
  // the shot. Keeping it set through the current render prevents a
  // rapid double-click from dispatching two FIRE events against the
  // same stale scoped state. A miss increments shotCount and stays
  // scoped; a hit increments it and returns to observation.
  useEffect(() => {
    if (round.ruleMode === "untimed-practice") {
      firedRef.current = false;
    }
  }, [round.ruleMode, round.shotCount, round.phase]);

  // Keyboard: Enter confirms start, Esc backs out, M toggles mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Paused: any non-modifier key resumes the round so the
      // player can come back from a hidden tab without losing the
      // 22-second budget.
      if (round.pausedAtMs !== null && screen === "round") {
        if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") {
          resumeRound();
          return;
        }
      }
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
        // StartScreen owns Enter while it is visible. Its focused
        // card/CTA must be allowed to commit the selected practice
        // scene; starting the first manifest scene here would race
        // its 60ms confirm transition and always force north-relay.
        if (screen === "start") return;
        if (screen === "result") {
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
  }, [screen, round.phase, round.pausedAtMs, exitScope, goToStart, retryRound, startRound, resumeRound]);

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

  const isPractice = round.ruleMode === "untimed-practice";
  // Practice scenes never show a danger edge or exposure copy.
  const dangerClass = isPractice
    ? "danger-edge hidden"
    : `danger-edge ${round.danger === "final" ? "final" : round.danger === "warning" ? "warning" : ""}`;
  const dangerText = isPractice
    ? ""
    : round.danger === "final"
      ? "位置即将暴露。"
      : round.danger === "warning"
        ? "目标正在搜索你。"
        : "";
  const elapsedMs = resolvedAt && startedAt ? resolvedAt - startedAt : 0;
  const phase = round.phase === "scoped" ? "scoped" : "observing";
  const showTarget = true;
  const rulesLabel = isPractice ? "FREE PRACTICE" : "ONE SHOT";
  const rulesTestId = isPractice ? "hud-rules-practice" : "hud-rules-mission";
  const progressValue = isPractice
    ? `${round.clearedTargetIds.length} / ${round.targetCount} CLEARED`
    : null;
  const controlValue = isPractice
    ? round.phase === "scoped"
      ? "移动瞄准 · 左键射击 · 右键退出"
      : "移动观察 · 右键开镜"
    : round.phase === "scoped"
      ? "移动寻找目标 · 左键射击 · 右键退出"
      : "移动鼠标观察 · 右键开镜";

  return (
    <div className="app-shell">
      <div className="hud-corner tl" data-testid="hud-sector">
        <span className="label">SECTOR</span>
        <span className="value">{scene.sectorLabel}</span>
      </div>
      <div className="hud-corner tr" data-testid="hud-shot">
        <span className="label">RULES OF ENGAGEMENT</span>
        <span className="value" data-testid={rulesTestId}>
          {rulesLabel}
          {progressValue ? ` · ${progressValue}` : ""}
        </span>
      </div>
      <div className="hud-corner bl">
        <span className="label">CONTROL</span>
        <span className="value">{controlValue}</span>
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
        onPointerMove={handlePointerMove}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        startedAt={startedAt}
        danger={round.danger}
        showTarget={showTarget}
        hitFlash={hitFlash}
        audioOn={audioOn}
        onMissingMedia={handleMissingMedia}
        clearedTargetIds={round.clearedTargetIds}
        targetImages={targetImages}
      />
      <div className={dangerClass} data-testid="danger-edge" data-danger={round.danger} />
      <div
        className={`danger-text ${!isPractice && round.danger !== "calm" ? "visible" : ""}`}
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
      {round.pausedAtMs !== null && (
        // The overlay physically covers the scene stage with a
        // higher z-index. Its onMouseDown is the only path that
        // resumes the round; the scene stage's gameplay handlers
        // are below the overlay and never see the mousedown.
        // The defensive `isGameplayInputAllowed` guard in the
        // gameplay handlers is a backstop for any other route.
        <div
          className="paused-overlay"
          data-testid="paused-overlay"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resumeRound();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resumeRound();
          }}
        >
          <div className="paused-banner" data-testid="paused-banner">
            已暂停 · 点击或按任意键继续
          </div>
        </div>
      )}
      {(screen === "result" || screen === "missing-media") && (
        <ResultScreen
          variant={
            screen === "missing-media"
              ? "missing-media"
              : isPractice
                ? "practice-success"
                : round.phase === "success"
                  ? "success"
                  : "failure"
          }
          scene={scene}
          elapsedMs={elapsedMs}
          onRetry={retryRound}
          onBack={goToStart}
          practiceSummary={
            isPractice
              ? {
                  cleared: round.clearedTargetIds.length,
                  total: round.targetCount,
                  shots: round.shotCount,
                  hits: round.hitCount,
                }
              : null
          }
        />
      )}
    </div>
  );
};

export default App;
