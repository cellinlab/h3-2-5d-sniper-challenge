/**
 * SceneConfig and related types.
 *
 * The runtime treats unknown keys as an error to keep the public
 * configuration contract strict. Coordinates are normalized to the
 * actual rendered scene rectangle, so they stay stable when the
 * viewport resizes.
 */

export type NormalizedCoord = {
  /** u in [0, 1], x axis of the rendered 16:9 scene rectangle. */
  u: number;
  /** v in [0, 1], y axis of the rendered 16:9 scene rectangle. */
  v: number;
};

export type LogicalGrid = {
  cols: number;
  rows: number;
};

export type TargetPlacement = {
  id: string;
  /** center of the target in normalized scene coordinates */
  center: NormalizedCoord;
  /** half-width and half-height in normalized units (u, v) */
  halfSize: { hU: number; hV: number };
  /** asset path for the target art (relative to /public) */
  artPath: string;
  /** distance in meters for the success screen */
  distanceMeters: number;
};

export type SceneAudio = {
  /** Optional local MiniMax Speech asset paths for round events. */
  voice: {
    briefing?: string;
    scopeOpen?: string;
    warning?: string;
    finalWarning?: string;
    success?: string;
    failure?: string;
    retry?: string;
  };
  /** background music / ambience path or null when synth only */
  music: string | null;
};

/**
 * Master media contract for a scene. The same HTMLVideoElement (when
 * configured) is the time source for both the wide observation view
 * and the magnified scope view, so a single 16:9 camera can drive
 * both without drift. Unknown discriminator values are rejected by
 * validation; the type system itself prevents runtime mistakes.
 */
export type MasterMedia =
  | {
      kind: "procedural";
    }
  | {
      kind: "video";
      /** Path to a local MP4/WebM relative to /public. */
      src: string;
      /** Loop the master video across rounds. Defaults to true. */
      loop?: boolean;
    };

/**
 * Rule mode discriminant. The two rule sets are structurally
 * different: a timed mission has a 22-second hidden budget,
 * danger escalation, heartbeat, and exactly one shot; an untimed
 * practice range has no timer, no danger, and a hit removes one
 * target then returns the player to wide observation. The mode
 * is encoded in the public type so a future refactor cannot
 * scatter scene-id checks through components.
 */
export type RuleMode = "timed-mission" | "untimed-practice";

/** Fields every scene manifest must carry. */
type SceneConfigBase = {
  /**
   * Protocol version of the scene manifest. The runtime validator
   * compares it against `SCENE_PROTOCOL_VERSION`; a missing or
   * mismatched value is rejected before the scene can enter a round.
   */
  protocolVersion: typeof SCENE_PROTOCOL_VERSION;
  id: string;
  /** Chinese display title e.g. "北境中继站" */
  title: string;
  /** Short Chinese subtitle e.g. "工业设施 · 蓝色时刻" */
  subtitle: string;
  /** Top-left HUD line e.g. "SECTOR 07 // BLUE HOUR" */
  sectorLabel: string;
  /** Master scene media contract. A scene either draws a procedural
   *  background (e.g. while a generated master is being produced) or
   *  binds to a fixed-camera 16:9 video that drives both the wide
   *  observation view and the magnified scope view. */
  masterMedia: MasterMedia;
  /** Logical 4x3 grid describing the scope sub-tiles. */
  grid: LogicalGrid;
  /** Optional per-tile detail videos, indexed by [row][col]. */
  detailTiles?: Array<Array<string | null>>;
  /** Target placements on the master scene. */
  targets: TargetPlacement[];
  /** Audio configuration. */
  audio: SceneAudio;
  /** Free-form flag. Only "locked" is recognized; unknown values fail. */
  status?: "active" | "locked";
};

/**
 * Timed one-shot mission scene. The 22-second hidden budget,
 * danger escalation, and exactly-one-shot semantics are
 * structurally encoded: the timing fields are required and
 * the state machine's FIRE reducer branch is the only path
 * that resolves the round.
 */
export type TimedMissionSceneConfig = SceneConfigBase & {
  ruleMode: "timed-mission";
  /** Total round budget in ms. The HUD never shows a number. */
  roundBudgetMs: number;
  /** When the first danger copy becomes visible, in [0, 1] of round budget. */
  warningAt: number;
  /** When the second danger copy becomes visible, in [0, 1] of round budget. */
  finalWarningAt: number;
};

/**
 * Untimed elimination practice scene. No countdown, no danger
 * escalation, no heartbeat, multiple shots allowed; each hit
 * removes the cleared target from the live set and the round
 * resolves only when all target ids have been hit. The type
 * system forbids the timed-mission timing fields here.
 */
export type UntimedPracticeSceneConfig = SceneConfigBase & {
  ruleMode: "untimed-practice";
};

/** Public union. The discriminant is `ruleMode`. */
export type SceneConfig = TimedMissionSceneConfig | UntimedPracticeSceneConfig;

export const SCENE_PROTOCOL_VERSION = 1 as const;
