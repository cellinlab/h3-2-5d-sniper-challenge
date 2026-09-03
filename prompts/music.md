# Music and Sound Design Prompts

## Final Music 3.0 Prompt

Instrumental was enabled. The song name was `Blue Hour Relay`.

> Instrumental cinematic stealth underscore, 72 BPM, minimal dark ambient tension for a fixed-camera industrial outpost at blue hour. Cold synth pads, restrained analog low pulse, distant metallic resonance, sparse sub-bass, subtle air and long negative space. Slow controlled tension arc without a climax. No vocals, no lead melody, no heroic brass, no trailer drums, no impacts, no alarm, no gunshot. Wide immersive stereo but quiet and uncluttered enough under short Mandarin mission-control speech. Stable harmony and seamless-feeling atmosphere.

## Sound Effect Experiment

The music model may be tested for short source material, but precise scope, trigger, hit, and UI feedback must remain synchronized and readable. If the model output is too musical or too long, use deterministic Web Audio synthesis or clearly licensed assets instead of misrepresenting the model's capability.

## Actual account result and selection

The official `music-2.6-free` API request returned that Music API access is no longer open to new users. The logged-in MiniMax Audio Music 3.0 web product was available, used 600 points, and returned two instrumental candidates:

- Candidate A: about 3:29; full-track integrated loudness about -13.1 LUFS, LRA 13.7, true peak +1.8 dBFS. It was too dynamic and peak-heavy for the speech-led game mix.
- Candidate B: about 2:16; full-track integrated loudness about -18.3 LUFS, LRA 3.4, true peak -0.3 dBFS. This steadier version was selected.

The selected local file is `public/generated/audio/music-blue-hour-relay.mp3`: 44.1 kHz stereo, 4,357,686 bytes, SHA-256 `5cace375a123509d33dcb3a56096e418787b1930b085b0a15253ec401ed8525c`. The file is intentionally ignored by Git.

The playable build loops this Music 3.0 result at volume `0.16`, ducks it to `0.048` during MiniMax Speech, keeps the H3 video's own ambience at a lower spatial layer, and reserves deterministic Web Audio for UI, scope, heartbeat, shot, hit and failure cues. `M` mutes all four layers.
