# Music and Sound Design Prompts

## Background Music v0

> A restrained 15-second near-future tactical ambience for a patient observation scene. Sparse low electronic pulse, distant metallic resonance, subtle tension that rises during the final five seconds, wide but uncluttered stereo field, no vocals, no melody that competes with short radio speech, no cinematic boom, no trailer percussion, clean ending suitable for a single game round.

## Sound Effect Experiment

The music model may be tested for short source material, but precise scope, trigger, hit, and UI feedback must remain synchronized and readable. If the model output is too musical or too long, use deterministic Web Audio synthesis or clearly licensed assets instead of misrepresenting the model's capability.

## Actual account result

The `music-2.6` API request was not used in the game because the current account reported that Music API access is no longer open to new users. MiniMax Audio's Music 3.0 web flow also required more points than were available. No music asset was generated or shipped.

The playable build therefore uses MiniMax Speech for mission voice, the video's own ambience when present, and deterministic Web Audio for UI, scope, heartbeat, shot, hit and failure cues.
