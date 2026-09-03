/**
 * Scene manifest for the H3 2.5D sniper challenge.
 *
 * The protocolVersion field is required; validateSceneConfig enforces
 * it. Scene 01 uses a local H3 master MP4 that drives
 * both the wide observation view and the magnified scope view. The
 * two additional H2.3 plates extend the shipped mission set with
 * urban-rooftop and airport high-vantage observation scenes.
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
  badgeLabel: "H3 MAIN MISSION",
  briefingText: "观察区域，确认目标。",
  scopeOpenText: "保持呼吸。",
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
  badgeLabel: "FREE PRACTICE · H2.3",
  briefingText: "自由练习。清除全部目标。",
  scopeOpenText: "保持呼吸。",
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

const URBAN_ROOFTOP: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "urban-rooftop",
  title: "城市天际线",
  subtitle: "摩天楼顶 · 雨后步行街",
  sectorLabel: "SECTOR 31 // CITY OVERWATCH",
  badgeLabel: "H2.3 FIELD MISSION",
  briefingText: "城市视野建立。锁定黄衣、青色挎包的目标。",
  scopeOpenText: "稳住。听心跳。",
  masterMedia: {
    kind: "video",
    src: "/generated/urban-rooftop-h23-6s-768p.mp4",
    loop: true,
  },
  grid: { cols: 4, rows: 3 },
  ruleMode: "timed-mission",
  targets: [
    {
      id: "urban-courier",
      // Calibrated against the delivered H2.3 plate: the courier
      // stands on the open central plaza, at the same distant scale
      // as the native pedestrians. The yellow coat reads as a clue
      // at 1× while the 2.6× optical crop reveals the bag and face.
      center: { u: 0.5, v: 0.66 },
      halfSize: { hU: 0.013, hV: 0.028 },
      artPath: "/generated/target-urban-courier.png",
      distanceMeters: 438,
    },
  ],
  audio: {
    voice: {
      briefing: "/generated/audio/voice-radio-urbanBriefing.mp3",
      scopeOpen: "/generated/audio/voice-radio-scope.mp3",
      warning: "/generated/audio/voice-radio-warning.mp3",
      finalWarning: "/generated/audio/voice-radio-finalWarning.mp3",
      success: "/generated/audio/voice-radio-success.mp3",
      failure: "/generated/audio/voice-radio-failure.mp3",
      retry: "/generated/audio/voice-radio-retry.mp3",
    },
    music: "/generated/audio/music-overwatch-protocol.mp3",
  },
  roundBudgetMs: 26000,
  warningAt: 0.6,
  finalWarningAt: 0.86,
  status: "active",
};

const AIRPORT_ARRIVAL: SceneConfig = {
  protocolVersion: SCENE_PROTOCOL_VERSION,
  id: "airport-arrival",
  title: "机场到达区",
  subtitle: "塔台制高点 · 暮色停机坪",
  sectorLabel: "SECTOR 44 // APRON ARRIVAL",
  badgeLabel: "H2.3 FIELD MISSION",
  briefingText: "航站区接管。锁定红衣、青色行李的目标。",
  scopeOpenText: "稳住。听心跳。",
  masterMedia: {
    kind: "video",
    src: "/generated/airport-arrival-h23-6s-768p.mp4",
    loop: true,
  },
  grid: { cols: 4, rows: 3 },
  ruleMode: "timed-mission",
  targets: [
    {
      id: "airport-traveler",
      // The traveler joins the deplaning flow beside the yellow
      // apron lane. Her sprite scale matches the nearby passengers
      // while the red coat and cyan case remain a fair visual clue.
      center: { u: 0.67, v: 0.63 },
      halfSize: { hU: 0.023, hV: 0.047 },
      artPath: "/generated/target-airport-traveler.png",
      distanceMeters: 521,
    },
  ],
  audio: {
    voice: {
      briefing: "/generated/audio/voice-radio-airportBriefing.mp3",
      scopeOpen: "/generated/audio/voice-radio-scope.mp3",
      warning: "/generated/audio/voice-radio-warning.mp3",
      finalWarning: "/generated/audio/voice-radio-finalWarning.mp3",
      success: "/generated/audio/voice-radio-success.mp3",
      failure: "/generated/audio/voice-radio-failure.mp3",
      retry: "/generated/audio/voice-radio-retry.mp3",
    },
    music: "/generated/audio/music-overwatch-protocol.mp3",
  },
  roundBudgetMs: 26000,
  warningAt: 0.6,
  finalWarningAt: 0.86,
  status: "active",
};

export const SCENES: ReadonlyArray<SceneConfig> = [
  NORTH_RELAY,
  RAINFOREST_PRACTICE,
  URBAN_ROOFTOP,
  AIRPORT_ARRIVAL,
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
