# 美术来源与再生产

游戏运行时只读取 `public/` 内的本地文件，不请求图像生成、3D 生成、Mixamo 或素材站。

## 原创图像

原始三张原画及本轮新增的四张图像均由内置 **ImageGen** 工具创建。原始 PNG 保存在 `assets/rpg-source/art/`；主视觉和道具图集的 WebP 运行版位于 `public/game/art/`。

| 图像 | 用途 | 本次原始生成文件标识 |
| --- | --- | --- |
| frostbound-keyart | 主菜单的山海、遗迹与巨型星环 | exec-2f5c1d59-abc7-488b-854d-e874ae5606cc.png |
| relic-atlas | 4 × 4 原创道具、技能与装备图标 | exec-c842e576-7c86-4805-9dc3-36dd756003c5.png |
| celestial-shrine-reference | 星环灯台的图生 3D 输入 | exec-53f63160-9759-4a0b-9e16-f65be1bf227d.png |

以下是保留的创作规格，可作为再生成提示词；以随项目保留的原始图像作为已集成版本的视觉依据。

**主视觉**：Original FROSTBOUND xianxia sanctuary on floating mountains. A small dark-robed cultivator in the lower right; a gigantic broken ivory and gold celestial gateway; turquoise waterfalls, ivory architecture, gold astrolabe rings, jade and white-leaved trees. Premium painted fantasy key art, cinematic dawn, atmospheric depth, controlled blue-green and warm gold palette. Quiet dark negative space on the central-left for a game title and menu. 16:9. No text, lettering, logos or UI.

**道具图集**：Exactly 4 by 4 equal cells, sixteen premium hand-painted fantasy loot icons, each centered with 15% safe margins on a uniform #08141c background. Rows: ice bow, ornate silver-blue sword, gold seal, ice heart; red potion, blue potion, gold coins, scroll; ornate chest, sapphire pendant, violet ring, armored gauntlets; wind feather, lightning crystal, celestial seal, meteor. Consistent three-quarter presentation and top-left lighting, crisp readable silhouettes, jewel-like material detail, no labels, borders or frames.

**灯台参考**：One isolated, fully connected freestanding celestial shrine, approximately two meters tall. A beveled hexagonal ivory marble base, wing-like gold support struts, eight-point astrolabe ring holding a luminous aquamarine crystal in four claws. Engraved star charts, sapphire insets, jade panels, refined PBR patina and visible material thickness. Three-quarter orthographic product view, transparent background. No environment, particles, text or disconnected floating components.

## 动态标题、引路纹理与音乐

| 图像 | 运行用途 | 原始生成文件标识 |
| --- | --- | --- |
| title-sanctuary-v2 | 月色山海与宫殿背景 | exec-3559d237-8fe4-406a-aade-0f821d486ae3.png |
| title-foreground-v2 | 透明松枝、铜铃与石栏前景 | exec-f7f5fc3c-d901-4601-8d84-0bca583e578d.png |
| title-mist-v2 | 透明流雾层 | exec-c19adca1-6b0e-41d8-981b-d74b63c871ad.png |
| route-silk-v1 | 地面引路光丝的透明纹理 | exec-ec69ec39-e4e7-451d-971c-880d8c493acb.png |

完整生成提示词见 [GENERATED-ART.md](GENERATED-ART.md)。标题由独立景深层、缓慢视差、流雾和少量光尘组成，遵循减少动态效果的系统偏好。引路光带沿实际寻路结果绘制，纹理 UV 向目标流动；小地图地形由真实区域、道路与障碍数据生成。

背景音乐为 **BiteMe Games — Lotus Pond（Loop）**，来自作者的 [Chinese Game Music](https://bitemegames.itch.io/chinese-game-music)。作者页面标注 CC0，允许用于商业项目；页面亦注明不可转售素材。保留来源说明于 `public/game/audio/LICENSE.txt`。游戏使用 60 秒循环版的本地 160 kbit/s MP3，进入交互后播放，可静音、调整音量，切出页面自动暂停。原始 WAV 与作者说明保留在 `assets/rpg-source/audio/`。此曲不是 AI 生成音乐。

## 图生 3D 与道具

星环灯台任务 `cgt-20261101130810-dvsm9` 使用 `doubao-seed3d-2-0-260328`，参数 `--subdivisionlevel high --fileformat glb`。生成任务已经成功，原始 64.3 MiB GLB 保留在 `assets/generated/celestial-shrine-v1-master.glb`。通过 Meshoptimizer 简化和 2048px WebP 贴图压缩，运行版为约 6.8 MiB、93,566 三角形；四座灯台共享几何与贴图。

苍雷剑、冰弓和冰箭沿用本项目已完成的原创图生 3D 资产，并制作独立轻量游戏版本。冰箭实际用于 Q 技能和弓手普攻；剑随手骨移动；冰弓由掌心定位、世界竖直轴与当前瞄准方向共同驱动，配合动态弓弦和拉弦手的 IK。宝箱为代码制作的可开合玉石铜饰模型，含真实空腔、绒布内衬、铰链、铆钉、箱盖内侧纹饰与收取后消失的金币和遗物。

运行 `node scripts/generate-assets.mjs --rpg-relic` 可继续已有灯台任务；API Key 只通过环境变量或隐藏终端输入读取，不写入前端、存档或资源清单。已有成功任务不会重新计费提交。

## Mixamo 动作

角色、攻击与受击使用用户提供的 FBX，保留原有贴图。行走、奔跑、待机取自 [Three.js 官方 Mixamo 示例](https://threejs.org/examples/webgl_animation_skinning_blending.html) 的 Soldier.glb，原件保存在 `assets/rpg-source/mixamo-soldier.glb`。

[Adobe 的 Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) 说明动画及角色可用于个人或商业游戏。游戏只使用该示例的动作，运行角色仍是用户提供的模型。`scripts/prepare-rpg-motion.mjs` 按双方绑定姿势做世界空间重定向，转换坐标轴，保留髋部竖直运动并锁定根节点水平位移，输出各角色独立动作。

## 免费场景素材

[Quaternius Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) 的免费 Standard 版提供 68 个模型，许可证为 CC0。下载来源为[作者官方 itch.io 页面](https://quaternius.itch.io/stylized-nature-megakit)。原始许可证保留在 `public/game/nature/LICENSE.txt`，原件位于 `assets/rpg-source/nature/`。

游戏选用 19 种树、蕨类、花草、岩石及石路模型，合并共享贴图为 `nature-library.glb`，运行时以 InstancedMesh 绘制。来源文件中稍大于 1 的顶点色已钳制至 glTF 的合法范围；检查无错误，仍有源素材的切线空间和非二次幂纹理提示，WebGL2 正常支持。

遗迹采用作者的 [Ultimate Modular Ruins Pack](https://quaternius.com/packs/ultimatemodularruins.html)，同为 **CC0**。从作者官网所链的 Google Drive 公共目录下载 FBX，选用 12 个雕刻石柱、破损拱门、矮墙、雕像、碎石和地砖模块。原件位于 `assets/rpg-source/ruins/FBX/`，脚本按材质合批、转换米制尺寸，输出约 680 KiB 的 `ruins-library.glb`。许可证记录位于 `public/game/ruins/LICENSE.txt`。运行模型通过 glTF Validator，无错误或警告。

地形、场景布局、桥、瀑布、风动、遮挡消隐与灯光由项目代码制作。模型库共享资源并实例化；前景植被和高处石构件可对人物视线消隐。

## 优化命令

```sh
node scripts/prepare-rpg-motion.mjs
node scripts/prepare-rpg-ruins.mjs
node scripts/optimize-rpg-assets.mjs
npm run build
```

生成模型原件、素材下载包、旧的中间优化结果和图像原画是制作资料；运行包只需 `dist/`。制作脚本不在浏览器中执行。

`RPG_ASSET_OUTPUT` / `RPG_ART_OUTPUT` 可指定独立输出目录，用于验证制作流程；`--nature-only` 仅重建自然场景库和 UI 图片。所有制作工具均作为明确的开发依赖记录在 package.json 中。

### 标题页 3D 预览（2026-11-01）

`public/game/models/title/sword.glb`、`ice.glb`、`cultivator.glb` 分别由游戏内的 storm-sword-v3、frost-bow-v2、celestial-shrine-v1 派生，来源和权利归属与原模型一致。运行 `node scripts/prepare-title-models.mjs` 可重建：使用现有模型、保守简化、512 px WebP 纹理及 Meshopt 压缩。文件约 223 / 563 / 1,216 KiB，共约 2 MiB。无需新生成 API。标题卡片实时解码 GLB，自转并叠加程序化光效；不是旋转的图片。

校验器无错误，弓模型存在运行时生成切线空间的既有提示；校验器不解析 EXT_meshopt_compression，但三个压缩模型已经通过实际浏览器解码与渲染检查。没有更改游戏内武器模型。
# 觉醒 G · 新增素材（2026-11-01）

- 三职业立绘：`public/game/art/awakening/{sword,ice,cultivator}-v1.webp`，均为 1024 × 1536，保留生成 alpha。原始 PNG 位于 `assets/rpg-source/art/awakening/`。
- 雷电四列图集：`public/game/art/awakening/lightning-v1.webp`，1254 × 1254，线性采样黑底亮度遮罩。由 GLSL 选择列、着色、控制出现与消散，底图本身不代替实时世界坐标与命中计算。
- 以上四图均用内置 image_gen 生成，提示词逐条保存在 [AWAKENING-ART-PROMPTS.md](AWAKENING-ART-PROMPTS.md)。WebP 仅用于运行时压缩，未人工重画生成图。
- 三职业语音：`public/game/audio/awakening/{sword,ice,cultivator}-v1.mp3`，豆包 seed-tts-2.0，24 kHz / 128 kbps。剑客「一剑，敕雷！」、弓手「霜落，雷鸣！」、修士「诸天，听令！」，时长约 1.58 / 1.82 / 1.58 秒。
- 语音的音色、原文、表演指令见 [awakening-voices.json](awakening-voices.json)。生成脚本 `scripts/generate-awakening-voices.py` 通过调用者环境变量或不回显输入读取密钥，只在制作时调用服务；网页仅加载成品音频，没有生成服务凭据。
- 接口依据：[豆包 HTTP V3 文档](https://docs.volcengine.com/docs/doubao-voice/http-chunked-sse-unidirectional-streaming-v3?lang=zh)、[官方音色表](https://docs.volcengine.com/docs/doubao-voice/tone-list-3?lang=zh)。三音色均从官方列表核对；没有使用声音复刻或指定真人仿声。


## 星炉装备与冰劫（2026-11-04）

本轮新增五件 ImageGen → Seed3D 装备、对应图标与冰暴纹理图集。模型已完成约 1 万三角形/件的优化，并在游戏穿戴与巨刃技能中实际使用。见 [完整提示词、任务与优化记录](EQUIPMENT-ART.md)。
