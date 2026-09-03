# Design Direction

## Experience

The game should feel like one compressed covert mission: choose a location, scan a large living scene, open the scope exactly where the reticle was resting, find the concealed target, and commit to one shot before the target finds the player.

The interface explains as little as possible during the round. The scene, scope transition, audio cues, edge pressure, and target behavior carry the tension.

## Art Direction

- Mood: patient observation under pressure, not a loud arcade shooter.
- Palette: near-black navy, cold steel blue, desaturated concrete, one warm amber confirmation color.
- Surfaces: transparent smoked glass, hairline borders, restrained film grain, slight optical distortion only inside the scope.
- Typography: condensed display face for mission titles and results; readable sans serif for controls and status.
- Motion: slow atmospheric drift in the scene, precise reticle response, short focus pull into the scope, brief recoil, quiet result reveal.
- Restraint: no neon cyberpunk, dense telemetry wallpaper, fake military logos, gore, or decorative panels without a job.

## Desktop Frame

- Reference canvas: `1920 × 1080`, playable down to `1280 × 720`.
- Primary content uses the full viewport.
- All pointer coordinates are derived from the actual 16:9 scene rectangle, including letterboxing.
- Key prompts stay at least 40 px from the viewport edge at the reference size.

## States and Visible Copy

### 1. Start and scene selection

- Title: `H3 2.5D 狙击挑战`
- Promise: `在目标发现你之前，完成唯一的一枪`
- Scene 01: `北境中继站` / `工业设施 · 蓝色时刻`
- Scene 02: `黑雨集装港` / `港口码头 · 暴雨夜`
- Scene 03: `晨曦天文台` / `沙漠高地 · 黎明`
- Primary action: `进入任务`
- Audio control: `声音：开启` / `声音：关闭`

Only Scene 01 must ship with generated media in this campaign build. The other cards may be visibly marked `待解锁`; they prove the scene protocol without pretending that media exists.

### 2. Observation

- Top left: `SECTOR 07 // BLUE HOUR`
- Top right: `ONE SHOT`
- Bottom hint: `移动鼠标观察 · 右键开镜`
- No numeric timer.
- Reticle is a fine central cross with a small open center so it never hides a tiny target.

### 3. Scope

- Speech subtitle when opened: `保持呼吸。`
- Bottom hint: `移动寻找目标 · 左键射击 · 右键退出`
- Danger copy progresses once per round:
  - `目标正在搜索你。`
  - `位置即将暴露。`
- The danger cue uses a slow desaturated red vignette, a tighter pulse, and a small edge indicator. It must remain readable while muted.

### 4. Success

- Title: `目标已清除`
- Stats: `用时 {seconds} 秒` / `距离 612 米` / `一次命中`
- Primary action: `再来一局`
- Secondary action: `返回选场`
- Footer: `SECTOR 07 // COMPLETE`

### 5. Failure

- Title: `位置已暴露`
- Explanation: `目标先一步锁定了你`
- Primary action: `重新建立观察`
- Secondary action: `返回选场`
- Footer: `SECTOR 07 // COMPROMISED`

### 6. Missing-media error

- Title: `任务素材未就绪`
- Explanation: `请按 README 配置本地场景媒体后重试。`
- Action: `返回选场`

## Interaction Contract

- `Enter`: confirm the focused menu action.
- Pointer move: move reticle only inside the active scene rectangle.
- Right click: enter or leave scope; browser context menu is suppressed only on the game surface.
- Left click in scope: fire the single shot.
- `Esc`: leave scope or return to the previous non-destructive screen.
- `M`: mute or unmute.
- Every pointer action has a keyboard-reachable menu equivalent where relevant.

## Icon Inventory

Use simple line icons with consistent 1.5 px strokes:

- crosshair / mission
- volume on / volume off
- location marker / selected scene
- clock / elapsed time
- range marker / distance
- single cartridge / one shot

Prefer small inline SVG components or CSS primitives. Do not import a broad icon set for six symbols.

## Visual Reference Map

The campaign Creation stores four private implementation references outside the public repository:

1. wide observation state
2. scope state
3. start and scene selection
4. successful result

Generated reference images are art-direction guides, not runtime assets. The implemented UI should preserve their hierarchy, palette, negative space, and tension while using original code and locally configured media.

## Fidelity Checklist

- The scene owns the frame; HUD remains secondary.
- Amber appears only on selection, the target confirmation, and primary actions.
- Observation and scope share the same scene time and perceived location.
- Scope entry feels optical and quick, not like opening a modal.
- Target art is integrated by light, scale, and partial occlusion.
- Hidden danger is understandable with audio muted.
- Result screens preserve the mission mood instead of becoming a generic scoreboard.
