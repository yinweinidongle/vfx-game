# 生成武器资产与复现

实体武器采用“概念图 → 图生 3D 高精母版 → 实时优化 GLB → Three.js 技能集成”的素材流程；飞行月刃则采用“生成式 RGBA 手绘素材 → 透明轮廓提取 → 带厚度网格与原图 UV”。生成阶段提供静态素材，显形、飞行、拖尾、命中和角色冻结均在运行时计算。寒冰射手的六镜头与新增剑客的五镜头演出、棚式灯光也由 Three.js 实时驱动，PBR 贴图和原始角色材质继续参与光照。实体武器网格与运行时构造的飞行月刃相互独立。

## 文件与规格

下表的字节数、三角形数量和纹理规格来自本地 GLB 直接检查；三件运行武器均已在浏览器中确认。MB 按 1,000,000 字节计算。

| 资产 | 路径 | 三角形 | 文件大小 |
| --- | --- | ---: | ---: |
| 冰箭高精母版 | `assets/generated/frost-arrow-v2-master.glb` | 1,000,000 | 64,775,356 B / 64.78 MB |
| 反曲弓高精母版 | `assets/generated/frost-bow-v2-master.glb` | 1,000,000 | 66,539,024 B / 66.54 MB |
| 冰箭运行版 | `public/models/frost-arrow-v2.glb` | 140,000 | 6,818,372 B / 6.82 MB |
| 反曲弓运行版 | `public/models/frost-bow-v2.glb` | 140,000 | 7,275,860 B / 7.28 MB |
| 苍雷剑高精母版 | `assets/generated/storm-sword-v3-master.glb` | 336,519 | 19,885,768 B / 19.89 MB |
| 苍雷剑运行版 | `public/models/storm-sword-v3.glb` | 67,302 | 3,258,632 B / 3.26 MB |

上表两件冰霜武器各包含三张 4096×4096 纹理：基础色、切线空间法线、合并的金属度/粗糙度。母版使用 PNG，运行版保留原尺寸并转换为 WebP。苍雷剑单独保留两张 **4096×4096** 纹理：基础色与合并金属度/粗糙度；它**没有法线贴图**，使用网格法线。剑母版为 PNG、运行版为 WebP。三件运行 GLB 使用 `EXT_texture_webp`，没有 Draco 或 Meshopt 网格压缩，因此不需要额外运行时网格解码器下载。

| 概念素材 | 尺寸 | 用途 |
| --- | --- | --- |
| `public/concepts/frost-arrow-v2.png` | 2172×724 | 冰箭完整横向概念图 |
| `public/concepts/frost-arrow-v2-input.png` | 1254×1254 | 送入 3D 生成任务的方形参考输入 |
| `public/concepts/frost-bow-v2.png` | 1024×1536 | 配套反曲弓概念图及 3D 参考输入 |
| `public/concepts/storm-sword-v1.png` | 1024×1536，RGBA | 有效的透明苍雷剑概念图 |
| `public/concepts/storm-sword-v2.png` | 1024×1536，RGB | 白底完整剑参考图，用于第二轮及成功的第三轮 3D 任务 |
| `public/textures/storm-energy-flow.png` | 1254×1254，RGB | 月刃 Shader 的能量流动纹理 |
| `public/textures/anime-crescent-v1.png` | 1254×1254，RGBA，936,405 B | 手绘月刃的色彩、透明轮廓与原图 UV 来源 |

概念图由内置图像生成工具制作。设计要点是长而纤细的箭杆、层叠深蓝冰晶箭头、后掠倒钩、银色雕饰和清晰冰裂纹；配套弓延续相同冰晶与银饰语言，保留可握持中段和完整反曲弓轮廓。这是设计 brief 摘要，不是逐字原始图像生成提示词。下方的 **3D 任务提示词** 则与脚本完全一致。

源码 ZIP 包含经验证的运行 GLB、概念图、能量纹理、三份角色 FBX、应用代码和再生成脚本。高精母版体积较大，保留在本地 `assets/generated/` 并从源码 ZIP 排除。`.generation/` 任务状态、环境文件、凭据、`node_modules/` 和构建缓存不应打入源码交付包；发布版 `dist/` 也不会复制本地母版目录。

## 新增苍雷剑：概念、纹理与生成状态

剑概念的设计描述为：完整细长银钢单刃剑，略带曲率，深钴蓝剑脊内嵌青紫雷电纹路，银色雕饰与蓝紫晶体护手，细长靛蓝缠绕握柄和宝石剑首。流动纹理用于提供有方向的能量细纹、明暗断续与流动结构，实际青蓝/紫色仍由 Shader 参数控制。这两段是设计描述摘要；完整原始图像提示词和实际输出规格见 [图像生成记录](sword-generation-prompts.md)。

最终使用 **`storm-sword-v3`**：完整纤细银钢/钴蓝长剑，与白底参考轮廓一致。浏览器已确认模型内容、PBR 材质与右手握持位置。母版来自同一 Ark 任务端点的 `doubao-seed3d-2-0-260328`；输入为 `public/concepts/storm-sword-v2.png`，**未提交描述性提示词，也未提交 seed**，文本内容只包含以下参数：

```text
--subdivisionlevel high --fileformat glb
```

成功路径的离线复现命令：

```bash
node scripts/generate-assets.mjs --sword-seed3d
```

本次服务返回 ZIP 容器。脚本先保存原始结果至本地 `assets/generated/storm-sword-v3-result.bin`，识别 ZIP 文件头，再提取其中 GLB 并验证文件头，得到 `storm-sword-v3-master.glb`。容器、母版与任务状态不进入源码 ZIP。

前两轮 `storm-sword-v1`、`storm-sword-v2` 均使用 Hyper3D，结果都错误地生成了紫色怪物，已拒绝。两份运行尝试保存为本地 `assets/generated/storm-sword-v1-rejected-runtime.glb` 和 `storm-sword-v2-rejected-runtime.glb`，不在 `public/` 中，也不进入预览或交付包。透明 v1 概念和白底 v2 参考仍是有效图像素材；图像版本号与最终模型版本号不相同。

为记录失败尝试，脚本仍保留 `--sword` 分支：它选择 v2、`hyper3d-gen2-260112`、seed `39571`，把图像内容放在文本之前，使用 `--use_original_alpha false`。这不是最终采用的生成路径。该分支的完整描述性提示词为：

```text
SINGLE SWORD WEAPON ONLY. Reconstruct the pictured sword, point up, pommel down. Long narrow silver steel blade, dark cobalt fuller with cyan-violet engraved inlays, swept silver and blue crystal guard, indigo wrapped handle, gemstone pommel. All parts connected. No character, creature, armor, hands, scene or effects. Preserve the complete sword silhouette.
```

对应失败分支参数保留为：

```text
--mesh_mode Raw --hd_texture true --material PBR --addons HighPack --quality_override 1000000 --use_original_alpha false --TAPose false --fileformat glb
```

最终剑的手部校准与 `main.js` 一致：

```js
await swordsman.loadSwordAsset('/models/storm-sword-v3.glb', {
  height: 1.5,
  rotationXYZ: [0, 0, 0],
  gripFraction: 0.17,
});
```

源剑沿本地 +Y，运行时总长归一化为 1.5 m，以底部向上 17% 的位置作为握点，再跟随右手掌。PBR 材质及两张贴图保留；加载失败时显示实体倒角剑回退。飞行月刃由 `PaintedCrescentBlade` 从 RGBA 源图构造，不复制武器 GLB。

能量纹理由继承的 `loadFlowTexture()` 加载，作为无颜色空间的数据纹理设置 RepeatWrapping。新月刃保留源图的青蓝/紫色分区，叠加三层 FBM，并以 18% 权重混入流动纹理灰度；该纹理只提供细微能量变化，加载失败时继续使用程序化噪声。

### 手绘月刃转实时 3D

`public/textures/anime-crescent-v1.png` 是内置图像工具生成的透明手绘 VFX 素材，设计采用宽白青能量芯、明确青蓝色带、后掠分叉与不对称长尖。它没有经过图生 3D API。完整图像提示词由 [图像生成记录](sword-generation-prompts.md) 保存；此处是设计摘要。

`PaintedCrescentBlade.loadTexture()` 在加载时读取 RGBA，以 alpha 阈值 **24/255** 选取最大连通主体，排除孤立飞点，再按扫描行提取凹后缘和凸前缘。当前设置构造 **9,856 三角形**的闭合浅透镜网格，保留图像比例，局部包围尺寸约 **3.567 × 3.6 × 0.08 m**，最前沿为本地 `X = 0.75`。前后表面与边界具有真实厚度；UV 直接映射原图，Shader 保留绘制的色块与透明缺口，实时控制显形、流动高光、Fresnel 和命中侵蚀。纹理或轮廓提取失败时保留 `CrescentBlade` 程序化回退。

入口加载后调用 `getTrailProfile()`，把 25 个真实后缘点传给 `SwordTrail.setProfile()`；闪电通过同一月刃的表面采样接口定位。主体、闪电与唯一的整体历史拖尾共享真实姿态，拖尾还存储每个历史采样的 quaternion。

`SwordFighter` 将源 FBX **1.075 秒**前向出剑姿势对齐技能 **0.65 秒**释放。月刃形成时跟随当前剑尖，释放位置取该时刻真实剑尖；实体剑方向与剑尖速度决定近水平的挥剑平面，释放后朝目标平滑对正。内部轮廓的 25° 坐标预旋转由父级 quaternion 补偿，世界斩面不是固定 25° 竖直摆放。演出相机根据实际平面调整观察高度。

剑客动作、220 ms 月刃侵蚀、340 ms 尾流收束、七类粒子、六层雷爆与五镜头见 [苍雷·断空斩说明](sword-skill.md)。

## 冰箭与弓的图生 3D 任务

实际生成脚本为 [`scripts/generate-assets.mjs`](../scripts/generate-assets.mjs)。其创建和查询端点为：

```text
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
GET  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}
```

模型为 `hyper3d-gen2-260112`。任务内容包含文本提示词及 PNG 的 base64 data URL；冰箭使用 seed `28417`，弓使用 seed `28418`。服务端模型版本与执行环境可能变化，保留 seed 不等于逐字节复现模型。

两项任务共用的参数字符串：

```text
--mesh_mode Raw --hd_texture true --material PBR --addons HighPack --quality_override 1000000 --use_original_alpha true --TAPose false --fileformat glb
```

冰箭原始提示词：

```text
Single complete premium frost magic arrow matching the reference, long slim shaft, sharp layered sapphire crystal spearhead with swept ice barbs, silver filigree collar, four short crystal tail fins, deep blue ice, white internal fractures. Preserve exact silhouette and details. All parts connected with real thickness. No glow clouds, particles, floor, bow or scene.
```

反曲弓原始提示词：

```text
One complete elegant recurve bow matching the reference. Tall curved sapphire crystal limbs with sharp ice barbs and silver filigree structural inlays, usable narrow central grip, single thin taut string. Deep blue ice and white internal fractures, real thickness, refined PBR details. No arrow, particles, glow clouds, pedestal, character or background.
```

实际请求将对应提示词与上述参数字符串连接成一个文本内容项。官方字段说明见 [创建 3D 生成任务](https://docs.volcengine.com/docs/ark/shadoweye-create-3d-generation-task-api?lang=zh) 与 [查询 3D 生成任务](https://docs.volcengine.com/docs/ark/shadoweye-get-3d-generation-task-api?lang=en)。

## 重新生成母版

运行预览不需要凭据。只有重新请求素材生成时才运行下面的离线 Node 脚本：

```bash
node scripts/generate-assets.mjs
```

脚本优先读取进程环境中的 `ARK_API_KEY`；未提供时，在交互终端中以隐藏输入方式读取。脚本不导入浏览器，也不把凭据写进源码、任务状态或客户端资源。不要将其改成 `VITE_` 前缀的环境变量；Vite 会将这类变量暴露给客户端。

默认命令处理冰箭与弓；`--sword-seed3d` 是成功的剑 v3 路径，`--sword` 仅保留失败的 Hyper3D v2 尝试。脚本会执行以下工作：

1. 读取所选 PNG 参考图，提交对应的生成任务。
2. 将任务 ID、模型、提示词、状态等保存到 `.generation/*.json`，供中断后恢复；该目录已被 Git 忽略，也不应进入归档。
3. 每 15 秒查询未完成任务，完成后下载结果；直接 GLB 校验后保存，ZIP 容器则提取内部 GLB 并再次校验，输出到 `assets/generated/`。
4. 已存在任务 ID 时复用该任务，避免重复提交；状态为 `downloaded` 的任务跳过。

如要明确创建新一轮任务，应先备份现有母版和对应状态，再调整脚本中的名称、参考图或提示词。仅重跑脚本不会自动覆盖已完成状态所代表的任务。API 生成是素材制作步骤，不属于应用启动流程。

## 生成运行版

安装项目依赖后，在项目根目录运行：

```bash
npx gltf-transform optimize assets/generated/frost-arrow-v2-master.glb public/models/frost-arrow-v2.glb \
  --compress false --texture-compress webp --texture-size 4096 \
  --simplify-ratio 0.14 --simplify-error 0.0008 \
  --join false --flatten false --palette false

npx gltf-transform optimize assets/generated/frost-bow-v2-master.glb public/models/frost-bow-v2.glb \
  --compress false --texture-compress webp --texture-size 4096 \
  --simplify-ratio 0.14 --simplify-error 0.0008 \
  --join false --flatten false --palette false

npx gltf-transform optimize assets/generated/storm-sword-v3-master.glb public/models/storm-sword-v3.glb \
  --compress false --texture-compress webp --texture-size 4096 \
  --simplify-ratio 0.20 --simplify-error 0.0008 \
  --join false --flatten false --palette false
```

项目开发依赖提供 `@gltf-transform/cli`；具体安装版本由依赖锁文件决定。冰箭/弓使用 `0.14`，将各 100 万三角形降低到 14 万；剑使用 `0.20`，将 336,519 三角形降低到 67,302；`--simplify-error 0.0008` 约束几何误差。没有自动合并、展开节点或调色板化，便于保留模型层级及贴图关系。

纹理转换保留 4K 分辨率，但 WebP 编码与网格简化都改变资产数据，并非无损母版备份。需要更高精度编辑时使用本地母版；需要更低运行负载时，在另一个输出文件上调整简化比例或纹理尺寸，并实际检查轮廓、冰裂纹和法线效果。

## 集成与校准

应用入口用 `Promise.allSettled` 等待角色与可选生成武器完成加载或进入回退状态，再显示第一次完整释放。以下为已验证的冰箭与弓校准。

冰箭通过 `IceArrowSkill.loadArrowAsset` 替换箭体，保留既有的时间轴、发射闪光、蓄力符文、粒子与拖尾：

```js
await skill.loadArrowAsset('/models/frost-arrow-v2.glb', {
  forwardAxis: '+Y',
  rotationXYZ: [Math.PI / 2, 0, 0],
  preserveAspect: true,
  detailStrength: 1.15,
  envMapIntensity: 0.85,
  core: false,
});
```

`forwardAxis` 是源模型箭尖的方向，`rotationXYZ` 是其后的额外弧度旋转。归一化后的本地 X 范围为 `[-2.0, +1.42]`，全局大小再由 `arrowSize` 控制。当前默认 `arrowSize = 0.52`，实际箭长 `3.42 × 0.52 = 1.7784 m`，约为早期 1.15× 版本的 45.2%。`preserveAspect: true` 保留原比例。原 PBR 材质通过 `onBeforeCompile` 增加轴向显形、少量流动能量、Fresnel 冰光和末段蓄力增亮；不以整件透明化或白色强辉光覆盖生成细节。

配套弓通过 `Actors.loadGeneratedBow` 载入：

```js
await actors.loadGeneratedBow('/models/frost-bow-v2.glb', {
  rotationXYZ: [0, Math.PI / 2, 0],
  height: 1.9,
  gripPoint: [0, 0, 0.08],
  stringAnchors: [[-0.25631, -0.56569, 0], [-0.25631, 0.59072, 0]],
  embeddedStringCut: {
    min: [-0.014, -0.565, -0.192],
    max: [0.014, 0.59, -0.155],
    axis: 'y',
    maxRemovalFraction: 0.08,
  },
});
```

这里的弓配置对应当前资产的最终校准，后续修改以 `src/main.js` 为准。`gripPoint` 使用源模型坐标，`gripOffset` 可进一步调整归一化后的手部局部偏移，`stringAnchors` 使用最终手部局部坐标。更换模型或角色时需要重新检查手掌握点、弓尖和弓弦对齐；模型包围盒中心不一定是有效握点。

运行时动态弓弦独立于生成网格。`ArcherPose` 用左手掌确定握点，右手指尖确定搭箭点；动态弓弦的中点与主箭尾部使用同一搭箭点，释放后回弹。该生成弓的静态弦已合并进网格，因此当前配置通过经过校准的 `embeddedStringCut` 源模型坐标范围，在几何的内存副本中移除 1,206 个静态弦三角形，再用可拉动的实时弓弦替代。弓体实际渲染 138,794 个三角形；磁盘上的 140,000 三角形 GLB、PBR 贴图和高精母版保持不变。`maxRemovalFraction` 为移除比例设置上限；更换资产时不得直接沿用这个裁切范围。

未指定裁切范围时保留合并弦；有独立弦节点时可以按已知节点名称隐藏。生成弓加载失败时使用程序化弓，生成箭加载失败时保留程序化冰箭；两份角色 FBX 的材质不因武器替换而改变。

## 拉弓、发射与命中过渡

`ArcherPose` 将源 FBX 动作的 **0.015–0.155 秒**映射到技能蓄力阶段，避免提前采样到已经松开的手指。小幅手臂关节校正让实际勾弦手指、箭尾和弓弦接触；释放后在 **90 ms** 内平滑退出校正，再继续播放原始后坐动作。角色原材质和皮肤贴图保持不变。

加载角色后调用 `skill.bindActors(actors)`。主箭蓄力姿势来自实际骨骼，飞行起点则固定采样 **0.75 秒释放姿势**，以避免进入后坐后的手部位置造成发射跳变。当前默认角色、`arrowSize = 0.52` 和 18 m/s 飞速下，浏览器观察到主命中的技能时间约 **1.535493 秒**、总时长约 **2.635493 秒**。这些数值来自实际释放位置和距离；改变尺寸、速度或角色姿势后会重算。时间轴显示技能时间，演出模式的附加慢镜与全局播放倍率只改变实际观看时长。

主命中时通过 `arrow.setImpact(progress)` 在 **180 ms** 内从箭尖到箭尾碎裂消解，PBR 主体细节在尚未消解的区域继续保留。箭中心沿飞行方向同步推进 `3.42 × arrowSize × progress`，使消解前沿停留在接触面附近；这不是将整件模型缩小或一帧隐藏。

`FrostTrail.impact(target, impactTime)` 将最后的箭尾采样连续连接到实际命中点。之后 **340 ms** 内，原轨迹向该点收束，纹理向前流动、带宽降低、透明度衰减，避免留下悬在目标后方的断开光带。进度以技能时间计算，暂停、拖动定位和重复释放保持一致。

## 伴随追踪小箭

`HomingArrows` 为独立的实时几何模块，不重新请求 AI 生成，也不复制六份高面数主箭。默认六支小箭长约 **0.36 m**，有倒钩箭头、细箭杆、尾羽和各自的短拖尾；数量通过面板“追踪小冰箭”在 **0–6** 之间调整。

小箭在主箭 **0.75 秒释放之后**才出现：六支箭于技能时间 **0.80–0.925 秒**从箭尾逐支凝聚，随显形逐渐向伴飞轨道展开，随后旋绕并沿各自连续曲线分流。蓄力阶段以及 0.80 秒之前没有小箭。每支箭的目标位置从目标受击动画的 `Spine2` 胸口骨骼采样，因此目标弯腰或下沉时，命中仍落在对应时刻的胸口。六次命中安排在主箭命中后的 **0.06、0.13、0.20、0.27、0.34、0.41 秒**。未来目标采样按每轮缓存，重置或重定时后刷新。

每支小箭命中后在 **120 ms** 内从箭尖到箭尾消解，箭体同步送入接触面，避免突然消失。短拖尾头部随正在消解的箭尾接到移动胸口，其余轨迹在 **240 ms** 内收束淡出。

`HomingImpactBurst` 为每次命中提供独立的短促接触闪光、扩张冰环、**9 片有厚度的冰晶碎片**、低透明寒雾与冰霜颗粒。碎片沿不同方向喷出，带独立旋转、重力下坠、缩小和透明度衰减；所有冰爆层在该次命中后的 **0.58 秒**内消散。该模块复用预分配的实例和缓冲，六次错峰命中可同时保留各自生命周期。

小箭的箭尖、窄内核和拖尾中心输出 HDR 亮度，由已有 `UnrealBloomPass` 产生辉光；外围蓝色晶面保持较低亮度，避免整组变成一团白光。面板“辉光强度”统一控制这层效果，不需要第二条后处理链。

## 实时演出与材质呈现

默认相机模式为 **演出**。寒冰射手使用 `src/scene/CinematicDirector.js` 的六个确定性镜头；剑客使用独立的 `SwordCinematicDirector`，详情见 [剑技能说明](sword-skill.md)。冰箭镜头为：

1. **`draw` / 蓄弓 · 凝聚**：缓慢推进，展示手掌握点、指尖搭箭点、整张弓与冰晶箭体。
2. **`flight` / 离弦 · 破空**：飞行进度前 18% 使用较宽构图，交代箭体离弦与飞行方向。
3. **`rear` / 后跟 · 箭尾追摄**：飞行进度 18%–56%，从箭后侧斜角追拍，让整支冰箭与近端拖尾占据视觉焦点。
4. **`front` / 反打 · 箭尖迎拍**：飞行进度 56% 后，镜头从箭前侧后退跟拍，清楚展示冰晶箭尖和穿透方向。
5. **`impact` / 命中 · 霜晶迸裂**：切至目标并保持镜头，覆盖主命中与六支追踪箭的连续冰爆。
6. **`resolve` / 余霜 · 消散**：六次追击结束后缓慢拉远并轻微环绕，展示碎冰、霜层与地面残留的消散。

飞行进度是从 0.75 秒释放到主命中之间的归一化时间。后侧与前侧机位均保留在动作轴线的 +Z 同侧，切镜时匹配箭体中心。特写构图包含完整主箭，以及后侧最多 **1 m**、前侧最多 **0.75 m** 的近端拖尾，长度受当前已生成轨迹限制；完整历史拖尾仍被模拟与渲染，但不要求全部进入特写画面，完整航迹可在全景模式中检查。

镜头位置直接由技能时间、参数和视口比例计算，暂停、逐帧和往返定位可复现同一构图。自动取景依据各镜头的主体包围范围适配窄屏，保留蓄力时的弓身和特写中的完整箭体。五种相机模式均可随时选择，切换特效预设不会覆盖用户已选的模式。**C** 切换演出 / 全景，**P** 暂停，**← / →** 每次移动 1/60 技能秒；也可直接拖动时间轴回看。

演出模式将编排的分段节奏乘在全局 `playbackSpeed` 上：蓄力约 0.72×，后侧跟拍特写约 0.48×，前侧反打特写约 0.42×，命中和连续追击约 0.46×，消散时恢复至 1×；具体过渡以 `CinematicDirector.getTimeScale()` 为准。其他相机模式继续使用原有全局倍率。该节奏不改变武器网格、动作采样的技能时间或预定命中时刻。

`src/scene/StudioLighting.js` 以暖中性主光塑造角色与银饰体积，冷色轮廓光分离蓝色冰晶，低强度补光和环境反射保留暗部纹理。主光使用 **2048×2048 PCF 阴影**，地面叠加程序化柔和接触阴影。深灰蓝舞台、较淡网格和降低后的环境亮度让武器与特效保持清晰对比；冰蓝反射补光放在主体上方及前侧，随蓄力、飞行和命中变化。角色和武器的基础色、法线及 PBR 参数均继续保留。 命中光由单个偏离身体的短促光源负责，取消原有两盏点光叠加；冻结时的自发光染色也已降低，保留角色纹理与明暗。

入口在相机切换后调用 `skill.refreshView()`，以零时间步更新面向相机的带状拖尾和追击表现。该步骤仅修正当前视角下的显示，不增加模拟时间，确保暂停定位或切镜时拖尾即时对齐。

## 角色状态与验证

`CharacterStatusFX` 在发射者附近加入蓄力符文、少量雪花与寒气；命中后给目标附加独立蒙皮霜层，以及随骨骼移动的实体小冰晶。霜层保留人物原始贴图，降低头颈区域覆盖，随后按技能时间融化。倒放、定位和重新释放都从同一时间函数计算状态。

项目测试覆盖时间轴、姿势采样、重定时、接触面消解、追踪箭错峰命中、分层冰爆、目标缓存、资源复用、角色霜层，以及镜头方向、取景和灯光阴影。剑气专项覆盖真实 RGBA 轮廓提取、闭合月刃厚度与原图 UV、表面闪电、整体尾流的接缝与单一连通性、历史姿态插值、真实挥剑轨迹、收束清理、五镜头确定性与震屏限制。完整验证入口为 `npm test`、`npm run build`。剑 v3 已在浏览器中确认模型与握持；三件 GLB 的面数、大小和纹理规格已有直接检查。离线测试不替代 GPU 编译或视觉检查，也不代表跨显卡性能基准。

生成武器和角色效果已在本机浏览器运行。剑气预览见 [剑客蓄势](sword-charge.jpg)、[月刃飞行](sword-flight.jpg)、[雷爆](sword-impact.jpg) 和 [生成长剑](sword-model.jpg)。原寒冰演出预览见 [蓄力推进](cinematic-draw.png)、[后侧跟拍特写](cinematic-rear.png)、[前侧反打特写](cinematic-front.png) 和 [命中冰爆](cinematic-impact.png)。没有承诺固定 FPS、固定 GPU 资源数量或跨 GPU 兼容性；实际表现取决于当前构建、硬件、视口分辨率和浏览器。
