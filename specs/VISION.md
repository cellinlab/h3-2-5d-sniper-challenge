# Vision

## Goal

完成一个能在电脑端本地运行、可试玩、可录制的 H3 2.5D 狙击挑战，同时用真实过程展示 MiniMax Code、H3 视频、MiniMax Speech、MiniMax Music 与前端代码如何协作。

## Features

1. 开始页与场景选择。
2. 完整 16:9 动态场景作为观察视野。
3. 准星位置映射为归一化坐标 `(u, v)`。
4. 开镜后以原准星位置为中心显示同步局部视野。
5. `4 × 3` 逻辑网格与可选局部增强视频协议。
6. 原创透明目标、确定性 hitbox 与遮挡融合。
7. 隐藏时限，不显示数字倒计时，但提供逐渐增强的公平提示。
8. 单发射击、命中、被击中与重玩。
9. H3 原生环境声、MiniMax 任务语音、背景音乐和交互音效。
10. 清晰的无声视觉反馈与减少动态效果选项。

## Tech Stack

- React + Vite + TypeScript
- Canvas 2D：同步视频裁切、瞄准镜与可选后期效果
- DOM / CSS：菜单、HUD、状态和可访问交互
- Web Audio：混音、动态范围和必要的确定性交互音效
- Vitest：坐标、状态机与配置校验
- MiniMax Code：规划、实现、迭代与验证

## Architecture

```text
SceneConfig
  ├── masterVideo
  ├── 4×3 logical grid
  ├── optional detailTiles
  ├── target placements
  └── voice / music / sfx assets

master video frame + crosshair (u,v)
  → scope crop / optional detail tile
  → target compositor
  → hit test
  → round state machine
  → audio + visual feedback
```

场景、网格、目标与音频通过类型化配置扩展。未知字段、越界坐标或缺失资产不得静默进入回合。

## Development

先用本地占位素材完成灰盒，再接入一条真实 H3 主视频。只有主视频在目标倍率下确实不清晰时，才为少数格子增加独立局部视频。

实现顺序：配置校验 → 回合状态机 → 宽景准星 → 开镜裁切 → 目标 / hitbox → 音频 → 视觉打磨 → 浏览器 QA。

## Deployment

本次不部署；最终验收是在本机电脑端完整运行。公开仓库允许其他人自行克隆并配置自己的素材与 Key。

## Monitoring

不接入用户分析、账号或排行榜。开发期只保留本地控制台与测试结果，发布前清理调试信息。
