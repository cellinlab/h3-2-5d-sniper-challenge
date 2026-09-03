/**
 * Recording-grade scene-select screen.
 *
 * Layout: a full-bleed `menu-hero-tactical-v2.png` cover with a
 * left-dark, right-clear gradient, light grain, and a single
 * thin reticle calibration line. Four scene cards are arranged
 * in a 1+3 row (one primary mission, three tactical previews)
 * so the layout never overflows at 1280×720 while still showing
 * real art for every card. The primary CTA sits below the cards
 * and a sound toggle sits at the bottom-right.
 *
 * Cues
 * ----
 * A short radio-style cue fires on every card focus / selection
 * (`playSceneSelect`). A heavier confirm cue fires on commit
 * (`playSceneConfirm`). Both are original Web Audio synth tones,
 * short, and never strident.
 *
 * Keyboard
 * --------
 * Arrow keys move the selection; Enter commits. Each card is a
 * focusable button with a visible amber focus ring.
 *
 * Asset map
 * ---------
 * The card / hero images are looked up through a single
 * `SCENE_CARD_ART` map so a test can assert the manifest against
 * the manifest without depending on the network. The map falls
 * back to the hero image if a scene-specific art is missing.
 */

import { useEffect, useRef, useState } from "react";
import type { SceneConfig } from "../types/scene";
import {
  playSceneConfirm,
  playSceneSelect,
  playUi,
} from "../audio/audio";

const HERO_IMAGE = "/generated/menu-hero-tactical-v2.png";

/**
 * Card art per scene. The H3 main mission and the H2.3 practice
 * range use real stills extracted from their generated plates.
 * The two locked teaser scenes use their concept plates. The
 * "card-01" / "card-02" etc. labels below are the on-card
 * numeric tags; they live with the data so a future re-order
 * of SCENES does not change the visible numbering.
 */
const SCENE_CARD_ART: Readonly<Record<string, string>> = {
  "north-relay": "/generated/menu-scene-north.jpg",
  "rainforest-practice": "/generated/menu-scene-rainforest.jpg",
  "black-rain-port": "/generated/menu-scene-black-rain.png",
  "morning-observatory": "/generated/menu-scene-observatory.png",
};

const FALLBACK_ART = HERO_IMAGE;

const cardArtFor = (id: string): string =>
  SCENE_CARD_ART[id] ?? FALLBACK_ART;

type CardTag = "01" | "02" | "03" | "04";

const CARD_TAGS: Readonly<Record<string, CardTag>> = {
  "north-relay": "01",
  "rainforest-practice": "02",
  "black-rain-port": "03",
  "morning-observatory": "04",
};

const cardTagFor = (id: string): CardTag => CARD_TAGS[id] ?? "01";

type Props = {
  scenes: ReadonlyArray<SceneConfig>;
  onStart: (sceneId: string) => void;
  audioOn: boolean;
  onToggleAudio: () => void;
};

const ctaCopyFor = (scene: SceneConfig): string => {
  if (scene.ruleMode === "untimed-practice") return "进入练习";
  if (scene.status === "locked") return "未解锁";
  return "进入任务";
};

const ariaLabelFor = (scene: SceneConfig): string => {
  const tag = cardTagFor(scene.id);
  const locked = scene.status === "locked" ? "，待解锁" : "";
  const kind = scene.ruleMode === "untimed-practice" ? "H2.3 自由练习" : "H3 主任务";
  return `${tag} 号卡：${scene.title}，${kind}${locked}`;
};

export const StartScreen = ({ scenes, onStart, audioOn, onToggleAudio }: Props) => {
  const [selected, setSelected] = useState<string>(
    scenes.find((s) => s.status !== "locked")?.id ?? scenes[0]?.id ?? "",
  );
  const enterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    enterRef.current?.focus();
  }, []);

  // Keep the card geometry stable while selection changes. Moving a card
  // between the primary and tile slots on pointer focus replaces the DOM node
  // before pointer-up, which can swallow the click in a real browser.
  const orderedScenes = [...scenes];

  const primary = orderedScenes[0];
  const tail = orderedScenes.slice(1);

  const focusScene = (id: string) => {
    if (id === selected) return;
    const target = scenes.find((s) => s.id === id);
    if (!target || target.status === "locked") return;
    setSelected(id);
    playSceneSelect();
  };

  const handleSelect = (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene || scene.status === "locked") return;
    setSelected(id);
    playSceneSelect();
  };

  const handleStart = () => {
    const scene = scenes.find((s) => s.id === selected);
    if (!scene || scene.status === "locked") return;
    playSceneConfirm();
    // Defer the navigation by one frame so the confirm tone is
    // not cut off by the round's `playCue("ui")` running on the
    // next click handler.
    window.setTimeout(() => onStart(scene.id), 60);
  };

  const handleCardKey = (e: React.KeyboardEvent, currentId: string) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const idx = orderedScenes.findIndex((s) => s.id === currentId);
      for (let step = 1; step < orderedScenes.length; step += 1) {
        const next = orderedScenes[(idx + step) % orderedScenes.length];
        if (next && next.status !== "locked") {
          focusScene(next.id);
          break;
        }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const idx = orderedScenes.findIndex((s) => s.id === currentId);
      for (let step = 1; step < orderedScenes.length; step += 1) {
        const next =
          orderedScenes[(idx - step + orderedScenes.length) % orderedScenes.length];
        if (next && next.status !== "locked") {
          focusScene(next.id);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(currentId);
    }
  };

  return (
    <div className="menu-screen" data-testid="start-screen">
      <div className="menu-hero" aria-hidden>
        <img src={HERO_IMAGE} alt="" className="menu-hero__img" />
        <div className="menu-hero__veil" />
        <div className="menu-hero__grain" />
        <div className="menu-hero__reticle" />
      </div>

      <div className="menu-grid">
        <header className="menu-headline">
          <h1 className="menu-title" data-testid="menu-title">
            H3 2.5D 狙击挑战
          </h1>
          <div className="menu-subtitle-en" data-testid="menu-subtitle-en">
            START &nbsp;·&nbsp; SCENE SELECTION
          </div>
          <p className="menu-pitch" data-testid="menu-pitch">
            选择一个任务剖面：主任务限时单发；雨林前哨为不限时多目标练习。右键开镜，鼠标瞄准，左键射击。
          </p>
        </header>

        <div className="menu-layout">
          <button
            key={primary.id}
            className={`scene-card scene-card--primary ${
              primary.id === selected ? "selected" : ""
            } ${primary.status === "locked" ? "locked" : ""} ${
              primary.ruleMode === "untimed-practice" ? "practice" : "mission"
            }`}
            onClick={() => handleSelect(primary.id)}
            onKeyDown={(e) => handleCardKey(e, primary.id)}
            onFocus={() => focusScene(primary.id)}
            disabled={primary.status === "locked"}
            data-testid={`scene-card-${primary.id}`}
            data-locked={primary.status === "locked"}
            data-rule-mode={primary.ruleMode}
            aria-label={ariaLabelFor(primary)}
            aria-pressed={primary.id === selected}
          >
            <span className="card-tag">{cardTagFor(primary.id)}</span>
            <img
              src={cardArtFor(primary.id)}
              alt=""
              className="card-art"
              loading="eager"
            />
            <span className="card-veil" />
            <span className="card-bottom">
              <span className="card-title">{primary.title}</span>
              <span className="card-subtitle">{primary.subtitle}</span>
              <span className="card-status">
                {primary.status === "locked"
                  ? "待解锁"
                  : primary.ruleMode === "untimed-practice"
                    ? "FREE PRACTICE · H2.3"
                    : "H3 MAIN MISSION"}
              </span>
            </span>
            <span className="card-energy" aria-hidden />
          </button>

          <div className="scene-card-row" data-testid="scene-card-row">
            {tail.map((scene) => (
              <button
                key={scene.id}
                className={`scene-card scene-card--tile ${
                  scene.id === selected ? "selected" : ""
                } ${scene.status === "locked" ? "locked" : ""} ${
                  scene.ruleMode === "untimed-practice" ? "practice" : "mission"
                }`}
                onClick={() => handleSelect(scene.id)}
                onKeyDown={(e) => handleCardKey(e, scene.id)}
                onFocus={() => focusScene(scene.id)}
                disabled={scene.status === "locked"}
                data-testid={`scene-card-${scene.id}`}
                data-locked={scene.status === "locked"}
                data-rule-mode={scene.ruleMode}
                aria-label={ariaLabelFor(scene)}
                aria-pressed={scene.id === selected}
              >
                <span className="card-tag">{cardTagFor(scene.id)}</span>
                <img
                  src={cardArtFor(scene.id)}
                  alt=""
                  className="card-art"
                  loading="lazy"
                />
                <span className="card-veil" />
                <span className="card-bottom">
                  <span className="card-title">{scene.title}</span>
                  <span className="card-status">
                    {scene.status === "locked"
                      ? "待解锁"
                      : scene.ruleMode === "untimed-practice"
                        ? "FREE PRACTICE · H2.3"
                        : "H3 MAIN MISSION"}
                  </span>
                </span>
                <span className="card-energy" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <div className="menu-footer-row">
          <button
            ref={enterRef}
            className="primary menu-cta"
            onClick={handleStart}
            disabled={!selected}
            data-testid="enter-mission"
          >
            {scenes.find((s) => s.id === selected)
              ? ctaCopyFor(scenes.find((s) => s.id === selected)!)
              : "进入任务"}
          </button>
          <button
            className="audio-toggle menu-audio"
            onClick={() => {
              playUi();
              onToggleAudio();
            }}
            data-testid="audio-toggle-start"
            aria-pressed={!audioOn}
          >
            {audioOn ? "声音：开启" : "声音：关闭"}
          </button>
        </div>
      </div>
    </div>
  );
};
