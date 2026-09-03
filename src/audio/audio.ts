/**
 * Lightweight Web Audio synthesizer for the H3 2.5D sniper challenge.
 *
 * Every cue in this module is synthesized at runtime, so the build is
 * fully runnable without any generated media. The interface is
 * intentionally narrow so the later integration with MiniMax Speech
 * and MiniMax Music can replace or layer on top of these cues
 * without touching call sites.
 *
 * Background music
 * ----------------
 * A single <audio> element owns the round's music. The element is
 * created lazily on the first `startMusic` call (which always
 * happens inside a user gesture). The lifecycle is:
 *
 *   startMusic(src)  -> create / resume element, play(), loop
 *   pauseMusic()     -> element.pause(), remember position
 *   resumeMusic()    -> element.play() from the same position
 *   stopMusic()      -> element.pause() + currentTime = 0, drop ref
 *
 * Speech ducking
 * --------------
 * When a voice line plays, music volume ramps down to
 * `BASELINE_VOLUME * DUCK_RATIO`; on `ended` / `error` (and only
 * for the *current* voice) it ramps back. A token guards against
 * the "old voice ended after a new one started" case: if a new
 * `playVoice` supersedes the old one, the old listener's token
 * no longer matches the current token and the unduck is skipped.
 *
 * Mute
 * ----
 * `setMuted(true)` zeroes the Web Audio master gain AND sets
 * `musicEl.muted = true`; voices in the cache are also muted.
 * Unmuting restores everything to its last non-muted target
 * (baseline or ducked) so the player is not jolted back to full
 * volume mid-duck.
 */

export type SoundCue = "ui" | "scope" | "heartbeat" | "shot" | "hit" | "fail";

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let heartbeatTimer: number | null = null;
let heartbeatMuted = false;
let externalMuted = false;
let currentVoice: HTMLAudioElement | null = null;
const voiceCache = new Map<string, HTMLAudioElement>();

// ----- Background music state -----

/** Single, module-level element for the active round's music. */
let musicEl: HTMLAudioElement | null = null;
/** src of the currently-loaded music, so a re-entry to the same
 *  scene does not rebuild the element from scratch. */
let musicSrc: string | null = null;
/** The volume the music element should sit at when nothing else
 *  is happening. The mixer ramps to this target on unduck and on
 *  unmute. */
const BASELINE_VOLUME = 0.16;
/** When speech is active, the music volume ramps down to
 *  `BASELINE_VOLUME * DUCK_RATIO`. */
const DUCK_RATIO = 0.3;
/** How long a volume ramp should take. Long enough to be smooth,
 *  short enough that a fast speech line lands on a still-ducked
 *  music bed. */
const RAMP_MS = 220;
/** The current target volume (not necessarily what the element
 *  reports at any single frame, because the ramp is animated). */
let musicTargetVolume = BASELINE_VOLUME;
/** True while music is below its baseline target. Used so the
 *  pause / resume / mute paths know whether to ramp back to
 *  baseline or to the ducked value. */
let musicDucked = false;
/** Music is paused because the round was paused (PAUSE event) or
 *  the document is hidden. The next resumeMusic() must NOT reset
 *  currentTime, only resume playback. */
let musicPaused = false;
/** rAF handle for the current volume ramp; cancelled when a new
 *  ramp supersedes it. */
let musicRampRaf: number | null = null;
/** The user-gesture retry listener (added on autoplay rejection).
 *  Stored so we can remove it if music is stopped before the
 *  player clicks again. */
let musicGestureCleanup: (() => void) | null = null;

// ----- Voice ducking token -----

/** Increments on every `playVoice` call. The current onEnd/onError
 *  listener captures the token at call time; if a later call
 *  supersedes it, the listener's token no longer matches and
 *  unduck is skipped. */
let voiceToken = 0;

// ----- Scope ambience (breath + heartbeat while scoped) -----

/** Low filtered noise simulating the player's breath through the
 *  scope. The gain is gently modulated by a slow sine to mimic
 *  inhale / exhale; the volume stays just above the music bed. */
let scopeBreathNode: AudioBufferSourceNode | null = null;
let scopeBreathFilter: BiquadFilterNode | null = null;
let scopeBreathGain: GainNode | null = null;
/** Double-pulse low-freq thump at a danger-dependent interval. */
let scopeHeartbeatTimer: number | null = null;
/** Desired lifecycle state, independent of whether this browser
 * exposes Web Audio or whether the ambience was entered while
 * muted. */
let scopeAmbienceRequested = false;
/** The danger level currently driving the scope heartbeat
 *  interval. `calm` is the default; `warning` and `final` shorten
 *  the interval and slightly raise the gain. */
let scopeLevel: "calm" | "warning" | "final" = "calm";
/** A rAF handle used for the breath gain sine. */
let scopeBreathRaf: number | null = null;

/** Stop and tear down the breath noise source and gain node. */
const teardownBreath = () => {
  if (scopeBreathRaf !== null) {
    cancelAnimationFrame(scopeBreathRaf);
    scopeBreathRaf = null;
  }
  if (scopeBreathNode) {
    try {
      scopeBreathNode.stop();
    } catch {
      // already stopped
    }
    try {
      scopeBreathNode.disconnect();
    } catch {
      // ignore
    }
    scopeBreathNode = null;
  }
  if (scopeBreathFilter) {
    try {
      scopeBreathFilter.disconnect();
    } catch {
      // ignore
    }
    scopeBreathFilter = null;
  }
  if (scopeBreathGain) {
    try {
      scopeBreathGain.disconnect();
    } catch {
      // ignore
    }
    scopeBreathGain = null;
  }
};

/** Stop the heartbeat interval. */
const teardownHeartbeat = () => {
  if (scopeHeartbeatTimer !== null) {
    window.clearInterval(scopeHeartbeatTimer);
    scopeHeartbeatTimer = null;
  }
};

const SCOPE_HEARTBEAT_INTERVALS: Record<
  "calm" | "warning" | "final",
  number
> = {
  calm: 1500,
  warning: 900,
  final: 600,
};

const SCOPE_HEARTBEAT_GAIN: Record<"calm" | "warning" | "final", number> = {
  calm: 0.18,
  warning: 0.26,
  final: 0.32,
};

/** Start the breath noise. Safe to call when already started;
 *  the previous source is stopped first. */
const startBreath = () => {
  const c = ensureRunning();
  if (!c || !masterGain) return;
  teardownBreath();
  const sampleRate = c.sampleRate;
  const bufferSize = Math.floor(sampleRate * 4);
  const buffer = c.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  // Pink-ish noise: light low-pass via averaging neighbors so the
  // breath sounds "windy" without a sharp hiss.
  let last = 0;
  for (let i = 0; i < bufferSize; i += 1) {
    const white = Math.random() * 2 - 1;
    const mixed = last * 0.85 + white * 0.15;
    last = mixed;
    data[i] = mixed;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 360;
  filter.Q.value = 0.4;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start();
  scopeBreathNode = src;
  scopeBreathFilter = filter;
  scopeBreathGain = gain;
  // Slow inhale/exhale modulation, period ~3.2s, peak gain
  // ~0.045 (just over the music bed). If muted, stay at zero.
  const startMs = performance.now();
  const targetPeak = externalMuted ? 0 : 0.045;
  const step = () => {
    scopeBreathRaf = null;
    if (!scopeBreathGain) return;
    const t = (performance.now() - startMs) / 3200;
    const envelope = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    scopeBreathGain.gain.value = targetPeak * envelope;
    scopeBreathRaf = requestAnimationFrame(step);
  };
  scopeBreathRaf = requestAnimationFrame(step);
};

/** A single double-pulse thump at the current level. */
const fireHeartbeat = () => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  // Capture as a local so the inner closure can pass it to
  // AudioNode.connect (which requires a non-null node, but TS
  // can't narrow a closure-captured `let` through the outer
  // null check).
  const out: GainNode = masterGain;
  const fireOnce = (startOffset: number, gain: number) => {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(56, now() + startOffset);
    osc.frequency.exponentialRampToValueAtTime(38, now() + startOffset + 0.18);
    env.gain.setValueAtTime(0, now() + startOffset);
    env.gain.linearRampToValueAtTime(gain, now() + startOffset + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now() + startOffset + 0.22);
    osc.connect(env);
    env.connect(out);
    osc.start(now() + startOffset);
    osc.stop(now() + startOffset + 0.26);
  };
  const baseGain = SCOPE_HEARTBEAT_GAIN[scopeLevel];
  // Double-pulse: a tight main thump and a slightly softer echo
  // 0.18s later. Together they read as a single heartbeat.
  fireOnce(0, baseGain);
  fireOnce(0.18, baseGain * 0.55);
};

/**
 * Start the scope ambience: filtered breath noise + a low
 * double-pulse heartbeat. Safe to call repeatedly; the previous
 * instances are torn down first. The level controls only the
 * heartbeat interval / gain; the breath stays at the same
 * quiet baseline so the player does not get jump-scared.
 *
 * `calm` is the only level that matters for the practice scene;
 * the timed-mission orchestrator bumps the level as danger
 * escalates.
 */
export const startScopeAmbience = (
  level: "calm" | "warning" | "final" = "calm",
): void => {
  scopeAmbienceRequested = true;
  scopeLevel = level;
  startBreath();
  teardownHeartbeat();
  if (externalMuted) return;
  const interval = SCOPE_HEARTBEAT_INTERVALS[level];
  scopeHeartbeatTimer = window.setInterval(fireHeartbeat, interval);
};

/**
 * Stop the scope ambience. Called when leaving the scope, when
 * the round resolves, when the page is hidden, or when the
 * component unmounts. Safe to call when not running.
 */
export const stopScopeAmbience = (): void => {
  scopeAmbienceRequested = false;
  teardownBreath();
  teardownHeartbeat();
};

/** Test-only: read the current danger level used by the
 *  scope heartbeat. */
export const __getScopeLevel = (): "calm" | "warning" | "final" => scopeLevel;

/** Test-only: are either the breath or the heartbeat active? */
export const __isScopeAmbienceActive = (): boolean => {
  return scopeAmbienceRequested;
};

/** Test-only: distinguish a muted breath graph from a fully running
 * heartbeat schedule. */
export const __isScopeHeartbeatActive = (): boolean => {
  return scopeHeartbeatTimer !== null;
};

const getContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(ctx.destination);
  return ctx;
};

const ensureRunning = (): AudioContext | null => {
  const c = getContext();
  if (!c) return null;
  if (c.state === "suspended") {
    void c.resume();
  }
  return c;
};

const now = (): number => ctx?.currentTime ?? 0;

/**
 * Play a transient blip. Used for UI clicks and confirmations.
 */
const playBlip = (freq: number, duration: number, type: OscillatorType, gain: number, attack = 0.005) => {
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now());
  env.gain.setValueAtTime(0, now());
  env.gain.linearRampToValueAtTime(gain, now() + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now() + duration);
  osc.connect(env);
  env.connect(masterGain);
  osc.start();
  osc.stop(now() + duration + 0.05);
};

/** Soft UI click for menu focus and selection. */
export const playUi = (): void => {
  if (externalMuted) return;
  playBlip(880, 0.08, "triangle", 0.18);
  playBlip(1320, 0.08, "triangle", 0.12);
};

/** Filter sweep for the optical scope entry. */
export const playScope = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const filter = c.createBiquadFilter();
  const env = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, now());
  osc.frequency.exponentialRampToValueAtTime(880, now() + 0.35);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(200, now());
  filter.frequency.exponentialRampToValueAtTime(2400, now() + 0.35);
  env.gain.setValueAtTime(0, now());
  env.gain.linearRampToValueAtTime(0.22, now() + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, now() + 0.45);
  osc.connect(filter);
  filter.connect(env);
  env.connect(masterGain);
  osc.start();
  osc.stop(now() + 0.5);
};

/** Single heartbeat thump for the danger level escalation. */
const playHeartbeat = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, now());
  osc.frequency.exponentialRampToValueAtTime(45, now() + 0.18);
  env.gain.setValueAtTime(0, now());
  env.gain.linearRampToValueAtTime(0.45, now() + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now() + 0.22);
  osc.connect(env);
  env.connect(masterGain);
  osc.start();
  osc.stop(now() + 0.25);
};

/** Start a heartbeat loop. The interval shrinks with `level`. */
export const startHeartbeat = (level: "calm" | "warning" | "final"): void => {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatMuted = false;
  const intervalMs = level === "final" ? 700 : level === "warning" ? 1400 : 2400;
  heartbeatTimer = window.setInterval(() => {
    if (heartbeatMuted) return;
    playHeartbeat();
  }, intervalMs);
};

/** Stop the heartbeat loop and reset its schedule. */
export const stopHeartbeat = (): void => {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

/** Single gunshot with crack and tail. */
export const playShot = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  // Crack: short noise burst
  const bufferSize = Math.floor(c.sampleRate * 0.18);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 12);
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1200;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.6;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();

  // Body: low sine thump
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now());
  osc.frequency.exponentialRampToValueAtTime(40, now() + 0.25);
  env.gain.setValueAtTime(0, now());
  env.gain.linearRampToValueAtTime(0.5, now() + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, now() + 0.45);
  osc.connect(env);
  env.connect(masterGain);
  osc.start();
  osc.stop(now() + 0.5);
};

/** Clean confirmation: rising two-note motif. */
export const playHit = (): void => {
  if (externalMuted) return;
  playBlip(523.25, 0.18, "sine", 0.25);
  window.setTimeout(() => playBlip(783.99, 0.32, "sine", 0.25), 140);
};

/**
 * Subtle radio-style click for moving the selection on the
 * scene-select screen. Two short, low-gain band-passed tones
 * 70ms apart keep it short and never strident.
 */
export const playSceneSelect = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const out: GainNode = masterGain;
  const tone = (freq: number, start: number, dur: number, gain: number) => {
    const osc = c.createOscillator();
    const env = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now() + start);
    filter.type = "bandpass";
    filter.frequency.value = freq * 1.2;
    filter.Q.value = 4;
    env.gain.setValueAtTime(0, now() + start);
    env.gain.linearRampToValueAtTime(gain, now() + start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now() + start + dur);
    osc.connect(filter);
    filter.connect(env);
    env.connect(out);
    osc.start(now() + start);
    osc.stop(now() + start + dur + 0.02);
  };
  tone(880, 0, 0.05, 0.18);
  tone(1320, 0.07, 0.05, 0.12);
};

/**
 * Heavier confirm tone for committing the selected scene. A
 * two-note rising motif followed by a soft sub-thump, kept
 * under 0.5s total so the next scene's intro still leads.
 */
export const playSceneConfirm = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const out: GainNode = masterGain;
  const tone = (freq: number, start: number, dur: number, type: OscillatorType, gain: number) => {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now() + start);
    env.gain.setValueAtTime(0, now() + start);
    env.gain.linearRampToValueAtTime(gain, now() + start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now() + start + dur);
    osc.connect(env);
    env.connect(out);
    osc.start(now() + start);
    osc.stop(now() + start + dur + 0.05);
  };
  tone(523.25, 0, 0.18, "sine", 0.22);
  tone(783.99, 0.14, 0.22, "sine", 0.22);
  tone(110, 0.32, 0.16, "sine", 0.18);
};

/** Failure cue: descending minor third. */
export const playFail = (): void => {
  if (externalMuted) return;
  playBlip(440, 0.32, "sawtooth", 0.22);
  window.setTimeout(() => playBlip(311.13, 0.5, "sawtooth", 0.22), 160);
};

/** Dispatcher used by React components. */
export const playCue = (cue: SoundCue): void => {
  switch (cue) {
    case "ui":
      playUi();
      break;
    case "scope":
      playScope();
      break;
    case "heartbeat":
      // Public API exposes only the loop; ignore direct hits.
      playHeartbeat();
      break;
    case "shot":
      playShot();
      break;
    case "hit":
      playHit();
      break;
    case "fail":
      playFail();
      break;
  }
};

/**
 * Short encrypted-radio gate that sits immediately before the
 * effect-treated Speech 2.8 files. It is synthesized locally so it
 * follows the global mute state and does not add another downloaded
 * asset. A narrow noise burst plus a falling confirmation tone reads
 * as a comms channel opening without masking the Mandarin line.
 */
const playRadioGate = (): void => {
  if (externalMuted) return;
  const c = ensureRunning();
  if (!c || !masterGain) return;
  const start = now();
  const noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.12), c.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    const envelope = Math.exp(-(i / samples.length) * 7);
    samples[i] = (Math.random() * 2 - 1) * envelope;
  }
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1850;
  band.Q.value = 1.6;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.11, start);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(start);
  noise.stop(start + 0.13);

  const tone = c.createOscillator();
  const toneGain = c.createGain();
  tone.type = "square";
  tone.frequency.setValueAtTime(1680, start);
  tone.frequency.exponentialRampToValueAtTime(980, start + 0.09);
  toneGain.gain.setValueAtTime(0.065, start);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
  tone.connect(toneGain);
  toneGain.connect(masterGain);
  tone.start(start);
  tone.stop(start + 0.11);
};

const getVoice = (src: string): HTMLAudioElement | null => {
  if (typeof Audio === "undefined") return null;
  const cached = voiceCache.get(src);
  if (cached) return cached;
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 0.86;
  voiceCache.set(src, audio);
  return audio;
};

/** Warm generated mission lines before the first round begins. */
export const preloadVoiceAssets = (sources: Array<string | undefined>): void => {
  for (const src of sources) {
    if (src) getVoice(src)?.load();
  }
};

/**
 * Animate music volume to `target` over RAMP_MS via requestAnimationFrame.
 * Cancels any in-flight ramp so the new target is honored immediately.
 * Returns silently when the music element is missing (e.g. the scene
 * has no music).
 */
const rampMusicVolume = (target: number): void => {
  if (!musicEl) return;
  if (musicRampRaf !== null) {
    cancelAnimationFrame(musicRampRaf);
    musicRampRaf = null;
  }
  musicTargetVolume = target;
  if (externalMuted) {
    // setMuted owns the volume while muted.
    musicEl.volume = target;
    return;
  }
  const start = musicEl.volume;
  const delta = target - start;
  if (Math.abs(delta) < 0.001) {
    musicEl.volume = target;
    return;
  }
  const startMs = performance.now();
  const step = () => {
    musicRampRaf = null;
    if (!musicEl) return;
    const t = Math.min(1, (performance.now() - startMs) / RAMP_MS);
    musicEl.volume = start + delta * t;
    if (t < 1 && !musicPaused) {
      musicRampRaf = requestAnimationFrame(step);
    } else {
      musicEl.volume = target;
    }
  };
  musicRampRaf = requestAnimationFrame(step);
};

const removeMusicGestureRetry = (): void => {
  if (musicGestureCleanup) {
    musicGestureCleanup();
    musicGestureCleanup = null;
  }
};

/**
 * Start the round's background music. Always called from a user
 * gesture (the scene-select button click). If the same src is
 * already loaded and only paused, the call resumes from the
 * remembered position. If a different src is supplied the old
 * element is dropped. Missing media (e.g. a typo in the path)
 * must NOT throw — we log nothing in production and leave the
 * round playable without music.
 */
export const startMusic = (src: string): void => {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  // Same src, currently paused -> just resume from currentTime.
  if (musicEl && musicSrc === src) {
    if (musicPaused) {
      const p = musicEl.play();
      if (p && typeof p.then === "function") {
        p.catch(() => undefined);
      }
      musicPaused = false;
    }
    return;
  }
  // New src (or first call) -> drop the old element, build a new one.
  stopMusic();
  try {
    musicEl = new Audio(src);
  } catch {
    // Some browsers throw synchronously on a malformed URL.
    musicEl = null;
    musicSrc = null;
    return;
  }
  if (!musicEl) {
    musicSrc = null;
    return;
  }
  musicEl.preload = "auto";
  musicEl.loop = true;
  musicEl.muted = externalMuted;
  musicEl.volume = BASELINE_VOLUME;
  musicTargetVolume = BASELINE_VOLUME;
  musicDucked = false;
  musicPaused = false;
  musicSrc = src;
  removeMusicGestureRetry();
  const startPromise = musicEl.play();
  if (startPromise && typeof startPromise.then === "function") {
    startPromise
      .then(() => {
        // Resolve any pending ramp target.
        if (musicEl) musicEl.volume = musicTargetVolume;
      })
      .catch(() => {
        // Autoplay policy rejected the play (no user gesture, or a
        // very strict browser). The element is loaded; we just wait
        // for the next user gesture and try again. The promise is
        // intentionally swallowed — autoplay rejection must never
        // bubble up to React.
        //
        // Both pointerdown and keydown are subscribed so a player
        // who tabs back in via the keyboard (Esc / any key) is
        // covered. The first one to fire removes BOTH listeners:
        // if only the firing one auto-removed (via {once: true}) the
        // other would still be live and a subsequent gesture of the
        // other type would double-play the music.
        removeMusicGestureRetry();
        const onInteract = () => {
          if (!musicEl || musicSrc !== src || musicPaused) return;
          // Drop the partner listener synchronously before we play.
          removeMusicGestureRetry();
          const p = musicEl.play();
          if (p && typeof p.then === "function") {
            p.then(() => {
              if (musicEl) musicEl.volume = musicTargetVolume;
            }).catch(() => undefined);
          }
        };
        window.addEventListener("pointerdown", onInteract, { once: true });
        window.addEventListener("keydown", onInteract, { once: true });
        musicGestureCleanup = () => {
          window.removeEventListener("pointerdown", onInteract);
          window.removeEventListener("keydown", onInteract);
        };
      });
  }
};

/** Stop the music and reset to the head. Called on scene-select
 *  return, missing-media recovery, and round resolution. */
export const stopMusic = (): void => {
  removeMusicGestureRetry();
  if (musicEl) {
    try {
      musicEl.pause();
    } catch {
      // ignore
    }
    musicEl.currentTime = 0;
  }
  musicEl = null;
  musicSrc = null;
  musicPaused = false;
  musicDucked = false;
  musicTargetVolume = BASELINE_VOLUME;
  if (musicRampRaf !== null) {
    cancelAnimationFrame(musicRampRaf);
    musicRampRaf = null;
  }
};

/** Pause without resetting currentTime. Round / tab visibility pause. */
export const pauseMusic = (): void => {
  if (!musicEl) return;
  if (musicPaused) return;
  try {
    musicEl.pause();
  } catch {
    // ignore
  }
  musicPaused = true;
};

/** Resume from the same position. The 22s budget is wall-clock
 *  gated by the orchestrator; music resume does not influence it. */
export const resumeMusic = (): void => {
  if (!musicEl) return;
  if (!musicPaused) return;
  const p = musicEl.play();
  if (p && typeof p.then === "function") {
    p.catch(() => undefined);
  }
  musicPaused = false;
};

/** Lower the music volume for the duration of a speech line. */
export const duckForSpeech = (): void => {
  if (!musicEl) return;
  musicDucked = true;
  rampMusicVolume(BASELINE_VOLUME * DUCK_RATIO);
};

/** Restore the music volume after the (current) speech line ends. */
export const unduckForSpeech = (): void => {
  if (!musicEl) return;
  musicDucked = false;
  rampMusicVolume(BASELINE_VOLUME);
};

/** True while a music element is loaded and not paused. */
export const isMusicPlaying = (): boolean => {
  return musicEl !== null && !musicPaused;
};

/** Test-only: read the current music volume (animated, may be in
 *  flight). Useful for asserting the ramp target was reached. */
export const __getMusicVolume = (): number => {
  return musicEl?.volume ?? 0;
};

/** Test-only: read the current music element's src. */
export const __getMusicSrc = (): string | null => musicSrc;

/** Test-only: return the cached voice element for a given src, or
 *  null if it has not been touched. Used by tests to dispatch a
 *  synthetic `ended` event on a superseded voice (which is no
 *  longer `currentVoice`). Not part of the production API. */
export const __getCachedVoice = (src: string): HTMLAudioElement | null => {
  return voiceCache.get(src) ?? null;
};

/** Test-only: read the current music pause state. */
export const __isMusicPaused = (): boolean => musicPaused;

/** Test-only: read the ducked flag. */
export const __isMusicDucked = (): boolean => musicDucked;

/** Play one generated MiniMax Speech line, replacing any active line.
 *  The current voiceToken is captured at call time so a stale ended
 *  event from a superseded voice cannot trigger an unduck. */
export const playVoice = (src: string | undefined): void => {
  if (!src || externalMuted) return;
  const voice = getVoice(src);
  if (!voice) return;
  if (src.includes("voice-radio-")) playRadioGate();
  voiceToken += 1;
  const myToken = voiceToken;
  duckForSpeech();
  if (currentVoice && currentVoice !== voice) {
    try {
      currentVoice.pause();
    } catch {
      // ignore
    }
    currentVoice.currentTime = 0;
  }
  currentVoice = voice;
  voice.currentTime = 0;
  voice.muted = false;
  const start = voice.play();
  if (start && typeof start.then === "function") {
    start.catch(() => {
      // Autoplay rejected (silent in production).
      if (voiceToken === myToken) unduckForSpeech();
    });
  }
  const onEnd = () => {
    voice.removeEventListener("ended", onEnd);
    voice.removeEventListener("error", onEnd);
    if (voiceToken === myToken) unduckForSpeech();
  };
  voice.addEventListener("ended", onEnd, { once: true });
  voice.addEventListener("error", onEnd, { once: true });
};

/** Mute or unmute all cues including the music element. */
export const setMuted = (muted: boolean): void => {
  const scopeWasActive = __isScopeAmbienceActive();
  externalMuted = muted;
  for (const voice of voiceCache.values()) voice.muted = muted;
  if (musicEl) {
    musicEl.muted = muted;
    // The element's volume property is what the user hears when
    // not muted; while muted, the value is irrelevant but we keep
    // it in sync with the ramp target so unmute is graceful.
    if (muted) {
      musicEl.volume = 0;
    } else {
      rampMusicVolume(musicDucked ? BASELINE_VOLUME * DUCK_RATIO : BASELINE_VOLUME);
    }
  }
  // Scope ambience: if we are currently inside a scoped round,
  // the breath gain stays at zero while muted; when unmuted
  // the breath resumes from its current sine phase. The
  // heartbeat is gated by externalMuted at fire time.
  if (scopeBreathGain) {
    if (muted) {
      scopeBreathGain.gain.value = 0;
    }
  }
  if (!muted && scopeWasActive) {
    // startScopeAmbience may have been entered while muted. In that
    // case it created the silent breath graph but deliberately did
    // not schedule a heartbeat. Re-start both layers together so
    // unmute restores the complete scoped soundscape.
    startScopeAmbience(scopeLevel);
  }
  if (masterGain) {
    masterGain.gain.cancelScheduledValues(now());
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, now(), 0.05);
  }
};

export const isMuted = (): boolean => externalMuted;

/** Test-only helpers. */
export const __test = {
  reset() {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    externalMuted = false;
    heartbeatMuted = false;
    stopMusic();
    stopScopeAmbience();
    scopeLevel = "calm";
    if (currentVoice) {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    }
    currentVoice = null;
    voiceToken = 0;
    voiceCache.clear();
    if (masterGain && ctx) {
      try {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(0.55, ctx.currentTime);
      } catch {
        // ignore
      }
    }
  },
  /** Snap the current music volume ramp to its final target. The
   *  real ramp uses rAF, which is timing-dependent in jsdom; tests
   *  call this to assert the ramp *target* without sleeping. */
  completeRamp() {
    if (musicRampRaf !== null) {
      cancelAnimationFrame(musicRampRaf);
      musicRampRaf = null;
    }
    if (musicEl) {
      musicEl.volume = musicTargetVolume;
    }
  },
  /** Force a synthetic voice "ended" event on the current voice
   *  element so tests can assert the unduck token logic without
   *  waiting for the audio to actually finish. */
  endCurrentVoice() {
    if (currentVoice) {
      currentVoice.dispatchEvent(new Event("ended"));
    }
  },
  /** Force a synthetic voice "error" event on the current voice
   *  element. */
  errorCurrentVoice() {
    if (currentVoice) {
      currentVoice.dispatchEvent(new Event("error"));
    }
  },
  /** Inspect the current voice token. */
  voiceToken() {
    return voiceToken;
  },
  /** Music baseline + duck ratio accessors, used by tests. */
  baseline: BASELINE_VOLUME,
  duckRatio: DUCK_RATIO,
  rampMs: RAMP_MS,
};
