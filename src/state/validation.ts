/**
 * Strict validation for SceneConfig. Unknown keys, out-of-range numbers,
 * and missing assets are all rejected so a malformed config can never
 * silently enter a round.
 */

import {
  SCENE_PROTOCOL_VERSION,
  type SceneConfig,
  type NormalizedCoord,
  type MasterMedia,
} from "../types/scene";

type ValidationResult =
  | { ok: true; value: SceneConfig }
  | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isOptionalString = (v: unknown): v is string | undefined =>
  v === undefined || typeof v === "string";

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isUnitInterval = (v: number) => v >= 0 && v <= 1;

const ALLOWED_SCENE_KEYS: ReadonlySet<string> = new Set([
  "protocolVersion",
  "ruleMode",
  "id",
  "title",
  "subtitle",
  "sectorLabel",
  "masterMedia",
  "grid",
  "detailTiles",
  "targets",
  "audio",
  "roundBudgetMs",
  "warningAt",
  "finalWarningAt",
  "status",
]);

const ALLOWED_GRID_KEYS = new Set(["cols", "rows"]);
const ALLOWED_TARGET_KEYS = new Set(["id", "center", "halfSize", "artPath", "distanceMeters"]);
const ALLOWED_HALF_SIZE_KEYS = new Set(["hU", "hV"]);
const ALLOWED_AUDIO_KEYS = new Set(["voice", "music"]);
const ALLOWED_VOICE_KEYS = new Set([
  "briefing",
  "scopeOpen",
  "warning",
  "finalWarning",
  "success",
  "failure",
  "retry",
]);
const ALLOWED_MASTER_MEDIA_KEYS = new Set(["kind", "src", "loop"]);
const ALLOWED_MASTER_MEDIA_VIDEO_KEYS = new Set(["kind", "src", "loop"]);
const ALLOWED_MASTER_MEDIA_PROCEDURAL_KEYS = new Set(["kind"]);

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      errors.push(`unknown key: ${path}.${k}`);
    }
  }
}

/**
 * Validate the masterMedia discriminated union. The function only
 * inspects the shape; it does not touch the network. Unknown `kind`
 * values and extra keys are rejected.
 */
function validateMasterMedia(
  v: unknown,
  path: string,
  errors: string[],
): MasterMedia | null {
  if (!isObject(v)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  // Top-level keys are validated by the union's accepted shape; we
  // still reject any unknown key at the top level so a typo fails
  // before the discriminator is even read.
  rejectUnknownKeys(v, ALLOWED_MASTER_MEDIA_KEYS, path, errors);
  if (v.kind === "procedural") {
    rejectUnknownKeys(v, ALLOWED_MASTER_MEDIA_PROCEDURAL_KEYS, path, errors);
    return { kind: "procedural" };
  }
  if (v.kind === "video") {
    rejectUnknownKeys(v, ALLOWED_MASTER_MEDIA_VIDEO_KEYS, path, errors);
    if (!isString(v.src)) {
      errors.push(`${path}.src must be a non-empty string when kind is "video"`);
      return null;
    }
    if (v.loop !== undefined && typeof v.loop !== "boolean") {
      errors.push(`${path}.loop must be a boolean when present`);
    }
    return { kind: "video", src: v.src, loop: v.loop as boolean | undefined };
  }
  errors.push(`${path}.kind must be "procedural" or "video" (got ${String(v.kind)})`);
  return null;
}

function validateCoord(v: unknown, path: string, errors: string[]): NormalizedCoord | null {
  if (!isObject(v)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  rejectUnknownKeys(v, new Set(["u", "v"]), path, errors);
  if (!isNumber(v.u) || !isUnitInterval(v.u)) {
    errors.push(`${path}.u must be a number in [0, 1]`);
    return null;
  }
  if (!isNumber(v.v) || !isUnitInterval(v.v)) {
    errors.push(`${path}.v must be a number in [0, 1]`);
    return null;
  }
  return { u: v.u, v: v.v };
}

export function validateSceneConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["scene config must be an object"] };
  }

  // protocol version is required and must match exactly
  if (!("protocolVersion" in raw)) {
    errors.push("scene config is missing protocolVersion");
  } else if (!isNumber(raw.protocolVersion) || !Number.isInteger(raw.protocolVersion)) {
    errors.push(
      `scene.protocolVersion must be an integer (got ${String(raw.protocolVersion)})`,
    );
  } else if (raw.protocolVersion !== SCENE_PROTOCOL_VERSION) {
    errors.push(
      `unsupported protocolVersion: ${raw.protocolVersion} (expected ${SCENE_PROTOCOL_VERSION})`,
    );
  }

  // top-level keys
  rejectUnknownKeys(raw, ALLOWED_SCENE_KEYS, "scene", errors);

  if (!isString(raw.id)) errors.push("scene.id must be a non-empty string");
  if (!isString(raw.title)) errors.push("scene.title must be a non-empty string");
  if (!isString(raw.subtitle)) errors.push("scene.subtitle must be a non-empty string");
  if (!isString(raw.sectorLabel)) errors.push("scene.sectorLabel must be a non-empty string");
  validateMasterMedia(raw.masterMedia, "scene.masterMedia", errors);

  // grid: 4 x 3
  if (!isObject(raw.grid)) {
    errors.push("scene.grid must be an object");
  } else {
    rejectUnknownKeys(raw.grid, ALLOWED_GRID_KEYS, "scene.grid", errors);
    if (raw.grid.cols !== 4 || raw.grid.rows !== 3) {
      errors.push(`scene.grid must be 4 x 3 (got ${String(raw.grid.cols)} x ${String(raw.grid.rows)})`);
    }
  }

  // detail tiles optional
  if (raw.detailTiles !== undefined) {
    if (!Array.isArray(raw.detailTiles) || raw.detailTiles.length !== 3) {
      errors.push("scene.detailTiles must be a 3-row array when provided");
    } else {
      raw.detailTiles.forEach((row, ri) => {
        if (!Array.isArray(row) || row.length !== 4) {
          errors.push(`scene.detailTiles[${ri}] must be a 4-element array`);
        } else {
          row.forEach((cell, ci) => {
            if (!(cell === null || isString(cell))) {
              errors.push(`scene.detailTiles[${ri}][${ci}] must be a string or null`);
            }
          });
        }
      });
    }
  }

  // targets: an active playable scene must have at least one target;
  // a locked teaser scene may legitimately have zero.
  if (!Array.isArray(raw.targets)) {
    errors.push("scene.targets must be an array");
  } else {
    if (raw.targets.length === 0 && raw.status !== "locked") {
      errors.push(
        "scene.targets must contain at least one target (active scenes need a target; locked teaser scenes may have zero)",
      );
    }
    raw.targets.forEach((t: unknown, i: number) => {
      const path = `scene.targets[${i}]`;
      if (!isObject(t)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(t, ALLOWED_TARGET_KEYS, path, errors);
      if (!isString(t.id)) errors.push(`${path}.id must be a non-empty string`);
      if (!isString(t.artPath)) errors.push(`${path}.artPath must be a non-empty string`);
      if (!isNumber(t.distanceMeters) || t.distanceMeters <= 0) {
        errors.push(`${path}.distanceMeters must be a positive number`);
      }
      const center = validateCoord(t.center, `${path}.center`, errors);
      if (center) {
        // halfSize lives inside a nested object, validate it manually
        if (!isObject(t.halfSize)) {
          errors.push(`${path}.halfSize must be an object`);
        } else {
          rejectUnknownKeys(t.halfSize, ALLOWED_HALF_SIZE_KEYS, `${path}.halfSize`, errors);
          if (!isNumber(t.halfSize.hU) || t.halfSize.hU <= 0 || t.halfSize.hU > 1) {
            errors.push(`${path}.halfSize.hU must be in (0, 1]`);
          }
          if (!isNumber(t.halfSize.hV) || t.halfSize.hV <= 0 || t.halfSize.hV > 1) {
            errors.push(`${path}.halfSize.hV must be in (0, 1]`);
          }
        }
      }
    });
  }

  // audio
  if (!isObject(raw.audio)) {
    errors.push("scene.audio must be an object");
  } else {
    rejectUnknownKeys(raw.audio, ALLOWED_AUDIO_KEYS, "scene.audio", errors);
    if (!isObject(raw.audio.voice)) {
      errors.push("scene.audio.voice must be an object");
    } else {
      rejectUnknownKeys(raw.audio.voice, ALLOWED_VOICE_KEYS, "scene.audio.voice", errors);
      for (const key of ALLOWED_VOICE_KEYS) {
        if (!isOptionalString((raw.audio.voice as Record<string, unknown>)[key])) {
          errors.push(`scene.audio.voice.${key} must be a string when present`);
        }
      }
    }
    if (!(raw.audio.music === null || isString(raw.audio.music))) {
      errors.push("scene.audio.music must be a string or null");
    }
  }

  // Timing fields are now mode-dependent; the strict checks are
  // run below once `raw.ruleMode` is known. The legacy
  // unconditional block that used to live here is gone.

  if (raw.status !== undefined && raw.status !== "active" && raw.status !== "locked") {
    errors.push(`scene.status must be "active" or "locked" (got ${String(raw.status)})`);
  }

  // Rule mode is required and must be one of the two known modes.
  // The type-level discriminant is mirrored here: an unknown
  // value must be rejected before the scene reaches a round.
  if (!isString(raw.ruleMode)) {
    errors.push("scene.ruleMode must be a non-empty string");
  } else if (raw.ruleMode !== "timed-mission" && raw.ruleMode !== "untimed-practice") {
    errors.push(
      `scene.ruleMode must be "timed-mission" or "untimed-practice" (got ${String(raw.ruleMode)})`,
    );
  }

  // Timing fields are required only for timed missions. A practice
  // scene carrying them is a structural mistake; we reject it so a
  // typo cannot silently change the round's behavior.
  if (raw.ruleMode === "timed-mission") {
    if (!isNumber(raw.roundBudgetMs) || raw.roundBudgetMs < 4000 || raw.roundBudgetMs > 60000) {
      errors.push("scene.roundBudgetMs must be a number in [4000, 60000]");
    }
    if (!isNumber(raw.warningAt) || !isUnitInterval(raw.warningAt)) {
      errors.push("scene.warningAt must be a number in [0, 1]");
    }
    if (!isNumber(raw.finalWarningAt) || !isUnitInterval(raw.finalWarningAt)) {
      errors.push("scene.finalWarningAt must be a number in [0, 1]");
    }
    if (
      isNumber(raw.warningAt) &&
      isNumber(raw.finalWarningAt) &&
      raw.warningAt >= raw.finalWarningAt
    ) {
      errors.push("scene.warningAt must be strictly less than scene.finalWarningAt");
    }
  } else if (raw.ruleMode === "untimed-practice") {
    if (raw.roundBudgetMs !== undefined) {
      errors.push("scene.roundBudgetMs is forbidden on untimed-practice scenes");
    }
    if (raw.warningAt !== undefined) {
      errors.push("scene.warningAt is forbidden on untimed-practice scenes");
    }
    if (raw.finalWarningAt !== undefined) {
      errors.push("scene.finalWarningAt is forbidden on untimed-practice scenes");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Re-narrow to SceneConfig once all checks pass.
  return { ok: true, value: raw as unknown as SceneConfig };
}

/** Normalized coordinate is out of bounds if either axis leaves [0, 1]. */
export function isCoordOutOfBounds(coord: NormalizedCoord): boolean {
  return !isUnitInterval(coord.u) || !isUnitInterval(coord.v);
}
