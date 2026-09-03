#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env.local");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public", "generated", "audio");

const SPEECH_LINES = {
  briefing: "观察区域，确认目标。",
  scopeOpen: "保持呼吸。",
  warning: "目标正在搜索你。",
  finalWarning: "位置即将暴露。",
  success: "目标已确认。撤离。",
  failure: "位置暴露。",
  retry: "重新建立观察。",
};

const MUSIC_PROMPT = [
  "Minimal cinematic stealth game underscore for a fixed-camera industrial outpost at blue hour.",
  "Dark ambient tension, restrained low pulse, distant metallic resonance, sparse sub-bass, cold air and long negative space.",
  "No vocals, no melody hook, no heroic brass, no trailer drums, no jump scare, no gunshot, no alarm.",
  "The loop must stay quiet enough beneath short Mandarin mission-control speech.",
].join(" ");

// MiniMax's current international API exposes a free-tier variant
// with the same instrumental contract. Keep the model configurable
// for reproducibility without putting account details in source.
const MUSIC_MODEL = process.env.MINIMAX_MUSIC_MODEL ?? "music-2.6-free";

function parseEnv(source) {
  const entries = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) return null;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    })
    .filter(Boolean);
  return Object.fromEntries(entries);
}

async function getApiKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  const env = parseEnv(await readFile(ENV_PATH, "utf8"));
  if (!env.MINIMAX_API_KEY) {
    throw new Error("MINIMAX_API_KEY is missing from .env.local");
  }
  return env.MINIMAX_API_KEY;
}

async function postJson(endpoint, body, apiKey) {
  const response = await fetch(`https://api.minimax.io${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  const statusCode = result?.base_resp?.status_code;
  if (!response.ok || (statusCode !== undefined && statusCode !== 0)) {
    const statusMessage = result?.base_resp?.status_msg ?? `HTTP ${response.status}`;
    throw new Error(`${endpoint} failed: ${statusMessage}`);
  }
  return result;
}

function audioBytes(result) {
  const audio = result?.data?.audio;
  if (typeof audio !== "string" || audio.length === 0) {
    throw new Error("MiniMax response did not contain audio data");
  }
  return Buffer.from(audio, "hex");
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function generateSpeech(apiKey) {
  const outputs = [];
  for (const [name, text] of Object.entries(SPEECH_LINES)) {
    const result = await postJson(
      "/v1/t2a_v2",
      {
        model: "speech-2.8-hd",
        text,
        stream: false,
        language_boost: "Chinese",
        output_format: "hex",
        voice_setting: {
          voice_id: "Chinese (Mandarin)_Reliable_Executive",
          speed: 0.92,
          vol: 1,
          pitch: -1,
        },
        audio_setting: {
          sample_rate: 44100,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      },
      apiKey,
    );
    const bytes = audioBytes(result);
    const filename = `voice-${name}.mp3`;
    await writeFile(path.join(OUTPUT_DIR, filename), bytes);
    outputs.push({
      kind: "speech",
      name,
      text,
      file: filename,
      model: "speech-2.8-hd",
      voiceId: "Chinese (Mandarin)_Reliable_Executive",
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
    console.log(`Generated ${filename} (${bytes.length} bytes)`);
  }
  return outputs;
}

async function generateMusic(apiKey) {
  const result = await postJson(
    "/v1/music_generation",
    {
      model: MUSIC_MODEL,
      prompt: MUSIC_PROMPT,
      is_instrumental: true,
      stream: false,
      output_format: "hex",
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: "mp3",
      },
    },
    apiKey,
  );
  const bytes = audioBytes(result);
  const filename = "music-stealth-underscore.mp3";
  await writeFile(path.join(OUTPUT_DIR, filename), bytes);
  console.log(`Generated ${filename} (${bytes.length} bytes)`);
  return {
    kind: "music",
    name: "stealthUnderscore",
    prompt: MUSIC_PROMPT,
    file: filename,
    model: MUSIC_MODEL,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function main() {
  const mode = process.argv[2] ?? "all";
  if (!new Set(["speech", "music", "all"]).has(mode)) {
    throw new Error("Usage: node scripts/generate-minimax-audio.mjs [speech|music|all]");
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const apiKey = await getApiKey();
  const manifestPath = path.join(OUTPUT_DIR, "minimax-audio-manifest.json");
  let manifest = [];
  try {
    const previous = JSON.parse(await readFile(manifestPath, "utf8"));
    if (Array.isArray(previous.outputs)) manifest = previous.outputs;
  } catch {
    // The first run has no manifest yet. A malformed local manifest
    // is also safe to replace because generated media is never source.
  }
  const mergeOutput = (next) => {
    const items = Array.isArray(next) ? next : [next];
    for (const item of items) {
      manifest = manifest.filter(
        (existing) => !(existing.kind === item.kind && existing.name === item.name),
      );
      manifest.push(item);
    }
  };
  if (mode === "speech" || mode === "all") {
    mergeOutput(await generateSpeech(apiKey));
  }
  if (mode === "music" || mode === "all") {
    mergeOutput(await generateMusic(apiKey));
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), outputs: manifest }, null, 2)}\n`,
  );
  console.log(`Wrote ${manifest.length} generated audio asset record(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
