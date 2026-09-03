# Mission Speech Prompts

Use a system voice or Voice Design. Do not clone a real person's voice.

Generated line set:

1. Briefing: `观察区域，确认目标。`
2. Scope opened: `保持呼吸。`
3. Warning: `目标正在搜索你。`
4. Final warning: `位置即将暴露。`
5. Success: `目标已确认。撤离。`
6. Failure: `位置暴露。`
7. Retry: `重新建立观察。`

## Actual parameters

- Endpoint: `POST /v1/t2a_v2`
- Model: `speech-2.8-hd`
- Voice: `Chinese (Mandarin)_Reliable_Executive`
- Format: MP3, 44.1 kHz, mono, 128 kbps

The first request used 192 kbps and was rejected as an invalid bitrate. The public generation script uses 128 kbps. Keep each line short and verify intelligibility against the scene ambience before adding more dialogue.
