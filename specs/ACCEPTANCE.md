# Acceptance Criteria

## Core Flow

- The app loads without a framework error overlay.
- Start enters scene selection.
- Selecting a scene enters the observation view.
- Mouse movement updates the crosshair only inside the rendered video rectangle.
- Opening the scope preserves the pre-scope location.
- The scope stays synchronized with the master scene time.
- One valid shot enters success exactly once.
- Timeout enters failure exactly once.
- Retry resets state, video, audio, target, and clock.

## Visual and Audio

- Target art does not look like an unprocessed sticker.
- Scope, HUD, scene selection, success, and failure share one deliberate art direction.
- No numeric countdown is shown.
- Danger escalation is understandable with sound on and muted.
- Speech remains intelligible over environment and music.
- Missing media produces a designed error state, not a blank screen.

## Engineering

- Invalid grid dimensions, target coordinates, time ranges, or asset paths fail validation.
- Coordinate and state-machine tests pass.
- Production build passes.
- Relevant browser console errors and warnings are resolved.
- `.env.local`, generated media, screenshots, recordings, account data, and secrets are ignored and absent from Git history.
