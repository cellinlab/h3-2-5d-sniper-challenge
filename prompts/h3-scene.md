# H3 Master Scene Prompt

## Purpose

Create one continuous master scene that stays readable when digitally cropped into a scope view. The ideal production target is 15 seconds at 2K; the first account-constrained validation used 4 seconds at 768P.

## Prompt v0

> Create one continuous 15-second 2K cinematic observation view of an original near-future industrial outpost at blue hour, designed as a playable game environment. Use a completely locked 16:9 camera with no cuts, zooms, pans, shakes, reframing, or perspective changes. Establish clearly readable foreground, midground, and background zones with windows, platforms, railings, and shadowed openings where small interactive targets could later be composited. Add only subtle environmental motion—slow steam, light fog, distant machinery, and small warning lights—while keeping spatial landmarks stable and silhouettes readable under a 2.5–3x digital crop. No people, characters, weapons, combat, vehicles crossing the target zones, text, logos, interface, or recognizable franchise design. Native stereo ambience only: soft wind, low mechanical hum, occasional distant metal resonance; no dialogue, narration, alarm, gunshots, or music.

## Actual submission log

### Attempt 1 — 15s / 2K

- Model: `MiniMax-H3`
- Ratio: `16:9`
- Reference: first frame
- Result: stopped at billing validation before generation. The request required 1950 account credits; H3 did not use the account's Token Plan video allowance.

### Attempt 2 — 4s / 768P

- Model: `MiniMax-H3`
- Ratio: `16:9`
- Reference: the same first frame
- Prompt: unchanged; only duration and resolution were reduced
- Result: generated successfully within the available 400 account credits. Downloaded output: 1344×768, 24 FPS, H.264 video plus 32 kHz AAC stereo audio, 4.458 seconds.

## Validation result

- A frame contact sheet showed stable building edges and composition while steam, cloud and warning-light motion changed subtly.
- The original 768P image was usable but slightly soft under the game's 2.6× scope crop.
- The browser runtime derivative preserves the original H3 master, crops it to exact 16:9, crossfades the first and last 0.5 seconds (including audio), then uses Lanczos resampling to 1920×1080 with light sharpening. This derivative is not represented as native 2K.
- A real-browser playthrough confirmed the same video clock continues through wide view and scope, the transparent target aligns with its hitbox, and a real pointer click can complete the shot.
