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

export type SceneConfig = {
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
  /** Total round budget in ms. The HUD never shows a number. */
  roundBudgetMs: number;
  /** When the first danger copy becomes visible, in [0, 1] of round budget. */
  warningAt: number;
  /** When the second danger copy becomes visible, in [0, 1] of round budget. */
  finalWarningAt: number;
  /** Free-form flag. Only "locked" is recognized; unknown values fail. */
  status?: "active" | "locked";
};

export const SCENE_PROTOCOL_VERSION = 1 as const;
