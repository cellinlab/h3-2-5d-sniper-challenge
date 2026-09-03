/**
 * Lightweight Web Audio synthesizer for the H3 2.5D sniper challenge.
 *
 * Every cue in this module is synthesized at runtime, so the build is
 * fully runnable without any generated media. The interface is
 * intentionally narrow so the later integration with MiniMax Speech
 * and MiniMax Music can replace or layer on top of these cues
 * without touching call sites.
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

/** Play one generated MiniMax Speech line, replacing any active line. */
export const playVoice = (src: string | undefined): void => {
  if (!src || externalMuted) return;
  const voice = getVoice(src);
  if (!voice) return;
  if (currentVoice && currentVoice !== voice) {
    currentVoice.pause();
    currentVoice.currentTime = 0;
  }
  currentVoice = voice;
  voice.currentTime = 0;
  voice.muted = false;
  void voice.play().catch(() => undefined);
};

/** Mute or unmute all cues. */
export const setMuted = (muted: boolean): void => {
  externalMuted = muted;
  for (const voice of voiceCache.values()) voice.muted = muted;
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
    if (currentVoice) {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    }
    currentVoice = null;
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
};
