# H3 2.5D 狙击挑战

一个由 MiniMax Code 构建、把 H3 动态场景变成可玩空间的桌面浏览器狙击挑战。

玩家先在完整动态场景中移动准星，右键开镜后自动进入准星所在的局部视野。在 22 秒的隐藏时限内找到目标并完成唯一的一枪，否则会被对方先一步锁定。

可选的热带雨林前哨是无限时的多目标练习场，绑 H2.3 视频，三个人物分属哨塔/平台/机舱三个不同景深，可多次射击，逐个清除。

## 已实现

- 开始页、场景选择、宽景观察、开镜、单发射击、成功、超时失败与重玩；
- 自由练习场：不限时、多目标、多次射击、miss 留在 scoped，hit 清除当前目标并自动回宽景，三个全清后成功；
- 宽景和 2.6 倍瞄准镜共享同一个 `HTMLVideoElement`、同一 `currentTime` 和同一 16:9 源裁切；
- `4 × 3` 逻辑定位网格与归一化坐标，不为每格创建一条容易失去连续性的视频；
- 原创透明目标（每个人物独立 PNG）、同坐标 hitbox、保持原图比例的命中椭圆，无数字倒计时的两级危险提示；
- MiniMax Speech 2.8 任务语音、MiniMax Music 3.0 循环配乐、H3 视频环境音与 Web Audio 交互反馈；人声播放时配乐自动降低到基线的 30%；
- 进入瞄准镜后激活的 Web Audio 原创呼吸 + 心跳：calm / warning / final 三档不同节奏，`prefers-reduced-motion` 之外的暂停/退出/失活/缺失媒体/卸载全部停止，按任意键恢复 round 时若仍 scoped 才重新激活；
- 写实化瞄准镜：scope-body-realistic 透明镜筒贴图 + 独立精确分划 SVG（中心琥珀点、十字、mil 刻度、距离点）+ 镜外压暗模糊 + 镜内同一帧 2.6× 放大 + 轻量镜片反射 / 微尘；分划固定在真实光轴中心，移动鼠标时镜内局部画面平移，中心点与实际弹着点一致；
- 镜筒+镜内画面+分划作为同一视觉组做低幅呼吸（约 3.2s 一周期，对称缩放，**不漂逻辑中心**，命中几何不变），开/退镜时 focus-pull 过渡；
- 缺失媒体阻断、视频自动播放恢复、窗口比例与高 DPR 画布对齐；
- 录音级场景选择页：hero 战术背景 + 4 张真实图片卡（主卡 + 三联次卡）、琥珀/海蓝绿描边 + 能量条 + 焦点态，场景卡位置在选择时保持稳定，独立 Web Audio 短 cue（scene-select）与确认 cue（scene-confirm），按 M 静音按 Enter 进入；
- 版本化场景协议（timed-mission 与 untimed-practice 两种 ruleMode 判别）、目标原始比例、镜心首击、渐进提示、标签隐藏暂停与音频生命周期；
- 12 个测试文件、212 项测试，以及 TypeScript + Vite 生产构建。

本仓库只保存代码、Prompt、参数与复现说明。H3 / H2.3 视频、语音、截图、录屏、账户信息和 API Key 不进入公开 Git 历史。

## 规则模式

| 模式 | 触发 | 时限 | 射击 | 命中 | 失败 | 成功 |
| --- | --- | --- | --- | --- | --- | --- |
| `timed-mission` | 默认主任务（北境中继站） | 22s 隐藏时限 | 仅一发 | 成功/失败 | 22s 超时或单发 miss | 单发命中 |
| `untimed-practice` | 热带雨林前哨（无时可选练习） | 无限 | 多次 | 当前目标回宽景 | miss 留在 scope | 三个全清 |

两种模式在 `SceneConfig` 里有判别字段 `ruleMode`；状态机 FIRE reducer 走不同分支；reducer、hitTest、SceneStage、ResultScreen 一致。

## 操作

- 移动鼠标：宽景中移动观察准星；开镜后控制镜内局部画面平移，精确分划固定在光轴中心；
- 鼠标右键：开镜 / 退出瞄准镜；
- 鼠标左键：镜内射击；
  - 主任务：仅有一发；
  - 练习场：可多次发射；
- `M`：开启 / 关闭所有声音（覆盖 Web Audio cue、Speech、Music 3.0、H3 视频音、呼吸与心跳）；
- `Esc`：退出瞄准或返回；
- `Enter`：开始或重玩；练习场返回选场再重进不消耗弹药、不存档。
- 练习场被标签页隐藏后，再次回到页面需点击 / 按键（覆盖层捕获）才继续；隐藏期间 22s 预算不被消耗。

## 本地运行

需要 Node.js 20+。

```bash
git clone https://github.com/cellinlab/h3-2-5d-sniper-challenge.git
cd h3-2-5d-sniper-challenge
npm install
npm test
npm run dev
```

打开终端显示的本地地址。生成媒体不随仓库分发，因此第一次进入任务会看到“任务素材未就绪”；按下一节准备两个本地文件即可试玩。

## 准备本地媒体

创建 `public/generated/`，放入：

```text
public/generated/north-relay-h3-4s-1080p-runtime.mp4
public/generated/rainforest-practice-h23-6s-768p.mp4
public/generated/target-operative.png
public/generated/target-rainforest-binoculars.png
public/generated/target-rainforest-radio.png
public/generated/target-rainforest-guard.png
public/generated/scope-body-realistic.png
public/generated/menu-hero-tactical-v2.png
public/generated/menu-scene-north.jpg
public/generated/menu-scene-rainforest.jpg
public/generated/menu-scene-black-rain.png
public/generated/menu-scene-observatory.png
public/generated/audio/music-blue-hour-relay.mp3
```

- 视频：任意可在浏览器解码的 16:9 H.264 MP4；建议固定机位。当前场景会循环播放，宽景和瞄准镜自动共享时间轴。项目实战版把原始 `1344×768` H3 文件居中裁为 16:9，用 ffmpeg 对首尾画面与音轨做 0.5 秒交叉淡化，再以 Lanczos 重采样至 1080P 并轻微锐化；这是浏览器运行衍生版，不宣称为原生 2K。
- 目标：带透明通道的虚构人物或机器人 PNG。默认标定点为 `(u=0.625, v=0.7)`，可在 [`src/scenes/sceneConfig.ts`](src/scenes/sceneConfig.ts) 修改位置、尺寸和命中范围。
- 音乐：可循环的器乐 MP3。实战版使用 MiniMax Audio Music 3.0 网页生成的 `Blue Hour Relay`，约 2:16、44.1 kHz stereo；音乐基线音量为 0.16，Speech 播放时平滑降低到 0.048。缺少音乐不会阻塞游戏，但完整录制需要准备该文件。

最终 H3 文件可替换上述 MP4，或把 `masterMedia.src` 改为新的本地路径。不要提交生成媒体、供应商响应或账户 ID。

## 生成 MiniMax Speech / Music

复制本地环境文件并只在自己的机器上填入 Key：

```bash
cp .env.example .env.local
# 编辑 .env.local：MINIMAX_API_KEY=你的本地 Key
npm run media:minimax:speech
```

Speech 脚本使用 `/v1/t2a_v2`、`speech-2.8-hd`、系统音色 `Chinese (Mandarin)_Reliable_Executive`，生成七条短任务语音到 `public/generated/audio/`。`.env.local` 和音频目录均已被 Git 忽略。

`npm run media:minimax:music` 保留官方 Music API 的可复现实验入口，默认模型为 `music-2.6-free`。当前账号实际调用返回“Music API 不再向新用户开放”，所以实战版改在已登录的 MiniMax Audio Music 3.0 网页生成两条候选，再把选中的 MP3 放到上述路径。不要把网页生成描述成 API 调用成功；完整 Prompt、选择理由与文件参数见 [`prompts/music.md`](prompts/music.md)。

## H3 提示词与真实尝试

完整 Prompt 和参数记录见 [`prompts/h3-scene.md`](prompts/h3-scene.md)。实际尝试保留了两个结果：

1. `MiniMax-H3 / 15s / 2K / 16:9` 在生成前被 1950 credits 的计费校验拦截，没有输出资产；
2. 保持参考图与固定机位 Prompt 不变，仅降为 `4s / 768P` 后，在现有 400 credits 内成功生成 H3 成片：`1344×768`、24 FPS、H.264 + 32 kHz AAC 立体声、约 4.46 秒。

下载后又完成了逐帧接触表、首尾对比、音轨探测和真实游戏验收。建筑构图保持稳定，蒸汽、云与警示灯有轻微变化；原始 768P 在 2.6 倍镜内略软，因此游戏使用前述 1080P 循环衍生版，原始 H3 文件仍完整保留在本地证据中。

## 架构

```text
SceneConfig / validation
        ↓
one master HTMLVideoElement
        ├── wide Canvas: full 16:9 source
        └── scope Canvas: same frame + normalized crop + 2.6×
                         ↓
transparent target + shared hitbox
                         ↓
round state machine: observe → scope → success / failure
```

- [`src/components/SceneStage.tsx`](src/components/SceneStage.tsx)：媒体、宽景与镜内 Canvas、目标合成和指针映射；
- [`src/state/roundStateMachine.ts`](src/state/roundStateMachine.ts)：一次射击、危险升级、超时与重置；
- [`src/state/validation.ts`](src/state/validation.ts)：扩展协议校验并拒绝未知字段；
- [`src/scene/videoSource.ts`](src/scene/videoSource.ts)：视频源裁切和媒体就绪判断；
- [`src/audio/audio.ts`](src/audio/audio.ts)：Music 生命周期、Speech duck、Web Audio 音效与四层统一静音；
- [`specs/`](specs/VISION.md)：愿景、设计与验收标准；
- [`prompts/`](prompts/README.md)：H3、Speech 与 Music 的提示词和真实参数记录。

## 验证

```bash
npm test
npm run build
```

除单元测试外，项目还在 1280×720 的真实浏览器中完成了完整回归：场景卡选择与进入、宽景移动、准星位置右键开镜、单一固定光轴分划、镜内画面平移、误射留在镜内、回到目标中心后命中、统一静音与恢复、右键退镜、Esc 返回、22 秒超时、两级危险提示和重玩。H3 主任务实测 2.2 秒一枪命中；H2.3 自由练习实测 3 / 3 清除、4 发命中 3、准确率 75%；最终浏览器控制台无 error / warning。Music 文件由本地服务器返回 HTTP 200，时长、大小与 SHA-256 和选中版本一致。

## 联系我

👋 Hi，我是 Cell 细胞。可以扫码加我微信，备注 **Github** 就行。

我正在做订阅制真人秀 **造物矩阵·BIP**：👉 [zaowujuzhen.com](https://zaowujuzhen.com/about)，欢迎订阅。

更多信息：👉 [Cell 的个人说明书](https://chaojizhizao.feishu.cn/wiki/Gbm8wMdS1itpk7kIVRlcN2WCnw)

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat.webp" alt="Cell 细胞微信二维码" width="200"><br>
      <p align="center">扫码加微信</p>
    </td>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat-channels.webp" alt="Cell 细胞微信视频号二维码" width="200"><br>
      <p align="center">视频号</p>
    </td>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat-official.webp" alt="Cell 细胞微信公众号二维码" width="200"><br>
      <p align="center">公众号</p>
    </td>
  </tr>
</table>

## 赞助

<table align="center">
  <tr>
    <td align="center" width="50%">
      <img src="./public/sponsor/zfb.webp" alt="支付宝二维码" width="200"><br>
      <p align="center">支付宝</p>
    </td>
    <td align="center" width="50%">
      <img src="./public/sponsor/wx.webp" alt="微信赞赏二维码" width="200"><br>
      <p align="center">微信赞赏</p>
    </td>
  </tr>
</table>

## License

MIT
