# 蓝白法相灵焰生成记录

工具：内置 `image_gen.imagegen`（ImageGen 技能）。两轮均指定 `transparent_background: true`。第二轮曾用于灵焰，现已按用户要求停用周围飘带；本文件仅作素材存档。原始输出保留在本机生成目录。两张图均为 1536 × 1024 RGBA PNG；不包含角色或场景，运行时由 GLSL 着色。

## 第一轮：细丝流动探索

保存为 `public/textures/spirit-flame-v1.png`。实际笔触偏丝绸状，作为第二轮编辑输入；最终运行时不载入此版本。

```text
Use case: stylized-concept. Production texture asset for a real-time Chinese fantasy cultivation game VFX, not a scene or illustration. One long horizontal ethereal spirit-fire ribbon, isolated on a genuinely transparent background, landscape 1536x1024. Grayscale ivory-white and silver only so the game shader can tint it. An elegant sweeping S-curved band of translucent spiritual flame, made of large confident hand-painted calligraphic flowing shapes, sharp feathered tongues, dark negative-space slits and a few fine embedded filaments. Broad centre with layered semi-transparent wisps, both ends taper to very fine long hooked points. Inspired by the flowing flame aura around a colossal divine spirit in high-end Chinese anime. Powerful graceful brushwork and clear graphic silhouette, fluid not smoky photographic blur. White hot thin interior strokes amid medium gray translucent body. The ribbon fills most of the image width with generous transparent margin, no cropping. This is a single COLOR + ALPHA game VFX texture to map onto curved three-dimensional ribbons. No character, face, humanoid, weapon, ring, circle, mandala, background, ground, text, watermark, border, checkerboard, black rectangle, detached particles, montage or extra separate ribbons.
```

## 第二轮：宽笔触灵焰（历史版本，现已停用）

以第一轮图片为编辑参考，输出保存为 `public/textures/spirit-flame-v2.png`。减去细丝结构，强化宽面、尖锐火舌和负空间。Shader 同时读取灰度与 Alpha，避免把所有不透明灰色区域误判为白色发光核心。

```text
Repaint this VFX ribbon into BOLD CEL-PAINTED CHINESE ANIME SPIRIT FIRE. Keep one horizontal S-shaped flowing ribbon on true transparency, entire shape within canvas. Replace the hair-like silky filaments and thin white strings with large thick graphic brushstroke shapes and broad solid medium-gray flame tongues. Big clean confident white cutting ridges, substantial mid-gray inner volume, dark negative-space gaps. About 80 percent large simple confident brushwork and only 20 percent detail. Chunky tapering pointed tips, sweeping ink-like angular curls, dramatic graphic silhouette, clear broad volumes, no photographic smoke. Keep grayscale only. No fine hairs, fine threads, glossy silk, smooth tubular rings, soft glow haze, background, black rectangle, checkerboard, character or text. Production COLOR + ALPHA game texture, not a presentation scene.
```
