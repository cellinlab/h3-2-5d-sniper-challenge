/**
 * Scene manifest for the H3 2.5D sniper challenge.
 *
 * The protocolVersion field is required; validateSceneConfig enforces
 * it. Scene 01 uses a local H3 master MP4 that drives
 * both the wide observation view and the magnified scope view. The
 * other two cards are marked `locked` so they render as `待解锁`
 * instead of pretending their media exists; they keep the procedural
 * fallback so the manifest is still playable in isolation.
 *
 * The practice scene (rainforest-practice) uses an H2.3 6s 768P
 * plate, has three targets that sit on real landmarks on the
 * generated plate, and runs under the untimed-practice rule mode.
 * Target art paths are scene-specific PNGs (binoculars / radio /
 * guard) so each silhouette reads correctly in scope view. The
 * practice scene shares the same H3 generated music bed as the
 * main mission; the speech ducking layer keeps voice lines
 * intelligible over the music.
 */

import { SCENE_PROTOCOL_VERSION, type SceneConfig } from "../types/scene";
import { validateSceneConfig } from "../state/validation";

const NORTH_RELAY: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "north-relay",
  title: "北境中继站",
  subtitle: "工业设施 · 蓝色时刻",
  sectorLabel: "SECTOR 07 // BLUE HOUR",
  // The generated H3 MP4 stays in ignored /public/generated. Wide
  // and scope canvases read the same HTMLVideoElement each frame.
  masterMedia: {
    kind: "video",
    src: "/generated/north-relay-h3-4s-1080p-runtime.mp4",
    loop: true,
  },
  grid: { cols: 4, rows: 3 },
  ruleMode: "timed-mission",
  targets: [
    {
      id: "operative-01",
      // Sit the operative against the left face of the right
      // midground tower (which spans u ≈ 0.62-0.80, v ≈ 0.55-0.97
      // in the H3 master), so the wide view treats it
      // as part of the structure. Scope magnification at 2.6x is
      // what reveals the figure clearly.
      center: { u: 0.625, v: 0.7 },
      halfSize: { hU: 0.022, hV: 0.032 },
      artPath: "/generated/target-operative.png",
      distanceMeters: 612,
    },
  ],
  audio: {
    voice: {
      briefing: "/generated/audio/voice-briefing.mp3",
      scopeOpen: "/generated/audio/voice-scopeOpen.mp3",
      warning: "/generated/audio/voice-warning.mp3",
      finalWarning: "/generated/audio/voice-finalWarning.mp3",
      success: "/generated/audio/voice-success.mp3",
      failure: "/generated/audio/voice-failure.mp3",
      retry: "/generated/audio/voice-retry.mp3",
    },
    music: "/generated/audio/music-blue-hour-relay.mp3",
  },
  roundBudgetMs: 22000,
  warningAt: 0.55,
  finalWarningAt: 0.85,
  status: "active",
};

const RAINFOREST_PRACTICE: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "rainforest-practice",
  title: "热带雨林练习场",
  subtitle: "雨林前哨 · 自由练习",
  // The H2.3 plate is intentionally labeled so it cannot be
  // confused with the H3 main mission. The card itself says
  // "FREE PRACTICE / H2.3" (see StartScreen); the sector line
  // is the in-game HUD copy.
  sectorLabel: "SECTOR 22 // H2.3 PRACTICE",
  masterMedia: {
    kind: "video",
    src: "/generated/rainforest-practice-h23-6s-768p.mp4",
    loop: true,
  },
  grid: { cols: 4, rows: 3 },
  ruleMode: "untimed-practice",
  // Real landmarks on the generated H2.3 plate. The halfSize is
  // slightly taller than the H3 mission's because the practice
  // scope reads the figures at 2.6× magnification and the art is
  // a tight 2:3 portrait; the wider v-extent makes a head-and-
  // shoulders silhouette read correctly without being missed.
  targets: [
    {
      id: "operative-watchtower",
      center: { u: 0.198, v: 0.658 },
      halfSize: { hU: 0.022, hV: 0.040 },
      artPath: "/generated/target-rainforest-binoculars.png",
      distanceMeters: 240,
    },
    {
      id: "operative-platform",
      center: { u: 0.473, v: 0.736 },
      halfSize: { hU: 0.022, hV: 0.040 },
      artPath: "/generated/target-rainforest-radio.png",
      distanceMeters: 260,
    },
    {
      id: "operative-cabin",
      center: { u: 0.769, v: 0.279 },
      halfSize: { hU: 0.022, hV: 0.040 },
      artPath: "/generated/target-rainforest-guard.png",
      distanceMeters: 250,
    },
  ],
  audio: {
    voice: {
      briefing: "/generated/audio/voice-briefing.mp3",
      scopeOpen: "/generated/audio/voice-scopeOpen.mp3",
      success: "/generated/audio/voice-success.mp3",
      retry: "/generated/audio/voice-retry.mp3",
    },
    // Same generated music bed as the H3 main mission. The
    // practice range is not silent: the player should feel the
    // same ambient tension as on the main mission, just without
    // a countdown. Speech lines still duck the music through
    // the audio module.
    music: "/generated/audio/music-blue-hour-relay.mp3",
  },
  // No timing fields: the discriminated union makes them
  // structurally impossible on a practice scene.
  status: "active",
};

const BLACK_RAIN_PORT: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "black-rain-port",
  title: "黑雨集装港",
  subtitle: "港口码头 · 暴雨夜",
  sectorLabel: "SECTOR 12 // BLACK RAIN",
  masterMedia: { kind: "procedural" },
  grid: { cols: 4, rows: 3 },
  ruleMode: "timed-mission",
  targets: [],
  audio: {
    voice: {},
    music: null,
  },
  roundBudgetMs: 22000,
  warningAt: 0.55,
  finalWarningAt: 0.85,
  status: "locked",
};

const MORNING_OBSERVATORY: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "morning-observatory",
  title: "晨曦天文台",
  subtitle: "沙漠高地 · 黎明",
  sectorLabel: "SECTOR 19 // DAWN RIDGE",
  masterMedia: { kind: "procedural" },
  grid: { cols: 4, rows: 3 },
  ruleMode: "timed-mission",
  targets: [],
  audio: {
    voice: {},
    music: null,
  },
  roundBudgetMs: 22000,
  warningAt: 0.55,
  finalWarningAt: 0.85,
  status: "locked",
};

export const SCENES: ReadonlyArray<SceneConfig> = [
  NORTH_RELAY,
  RAINFOREST_PRACTICE,
  BLACK_RAIN_PORT,
  MORNING_OBSERVATORY,
];

/**
 * Validate every exported scene at module load. A malformed scene
 * must crash the bundle immediately rather than reaching a player
 * round and silently rendering a broken state. The orchestrator
 * (App.tsx) relies on the runtime SCENES being well-formed; tests
 * exercise the validator, but a real release runs the validator
 * exactly once when this module is first imported.
 */
for (const scene of SCENES) {
  const result = validateSceneConfig(scene);
  if (!result.ok) {
    throw new Error(
      `[sceneConfig] exported scene "${scene.id}" failed validation: ${result.errors.join("; ")}`,
    );
  }
}

export const SCENES_PROTOCOL_VERSION = SCENE_PROTOCOL_VERSION;
