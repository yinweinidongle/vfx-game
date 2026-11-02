# 长剑与剑气纹理的图像生成记录

以下图像由内置 imagegen 工具生成；用于素材制作，运行时不调用生成接口。3D 任务与模型规格见 [生成资产记录](generated-assets.md)。

## 长剑初始设计

输出：`public/concepts/storm-sword-v1.png`（1024 × 1536 RGBA）。参数：`transparent_background: true`。

```text
Game asset concept for image-to-3D reconstruction. ONE single complete premium anime action-RPG storm longsword, isolated on a truly transparent background. Portrait layout, the entire weapon visible from pommel at bottom to point at top with generous clear margin, blade upright along image Y axis. Almost straight long single-edged sword with a very slight elegant sabre curvature, extremely sharp narrow blade with actual beveled silver cutting edge and broad polished midnight cobalt spine, restrained luminous cyan inlaid channel down blade, subtle violet lightning cracks ENGRAVED into the steel, layered crystalline small dragon-wing quillons in blue violet at guard, dark indigo leather grip long enough for two hands, refined silver filigree and violet gemstone pommel. A readable practical slim grip, all connected parts, realistic physical thickness, no detached pieces. Original high-end stylized fantasy weapon for '苍雷·断空斩', clear surgical silhouette, exquisite PBR brushed metal and faceted crystal detail, elegant not bulky. Orthographic near-front product view with only slight three-quarter angle to show blade bevel; broad face of blade clearly shown. Sharp studio neutral lighting, accurate silver/cyan/deepblue/purple color separation. No hands, person, text, logo, pedestal, rings, background, electric arc effects, floating particles, glow fog, scabbard, extra weapons, montage or multiple views. This is a physical sword design, not a glowing energy-only blade.
```

## 最终 3D 输入图

输入：上述 v1 设计图。输出：`public/concepts/storm-sword-v2.png`（1024 × 1536 RGB）。参数：`transparent_background: false`。实际采用此图生成 v3 长剑模型。

```text
Prepare this same single fantasy SWORD for image-to-3D reconstruction. Preserve its complete long narrow silver blade, dark blue engraved fuller, cyan and violet inlays, swept ornate guard, blue wrapped handle and gem pommel. One physical SWORD ONLY, standing upright point up and pommel down. Place the complete sword on a perfectly flat opaque pure WHITE background with zero shadows, zero halo, zero fog, zero vignette, zero gradients and zero effects. Clean crisp object silhouette, evenly lit PBR steel, slightly increase the blade width so its geometry is readable. The whole sword must fit in the image with margin. No character, monster, creature, hands, pedestal, armor, text, watermark, floating components or other objects. This is a single weapon inventory asset, not an equipped character.
```

## 流动能量纹理

输出：`public/textures/storm-energy-flow.png`（1254 × 1254 RGB）。作为线性灰度数据使用，重复采样并配合 GLSL FBM、UV Flow、颜色分层与侵蚀遮罩。

```text
Technical game VFX texture asset, seamless square grayscale flowing energy noise map. Flat 2D orthographic texture only, no object or scene. Very dark black background with many organic silver-gray and small white turbulent flowing wisps pulled horizontally from left to right, layered anisotropic curl-noise filaments, thin and thick wisps interleaved with large dark negative spaces. High frequency fine breakup over low frequency rippling waves, stylized hand-painted sharp streaks and feathered tails useful for UV scrolling and edge erosion on a crescent sword-energy shader. Seamless tileable horizontally and vertically, no dominant central feature, consistent detail throughout, fully grayscale RGB, no color, no words, no borders, no lens flare, no icons, no glow bloom, no gradients to edges. Crisp 1024 square texture, suitable as a shader mask rather than a finished explosion image.
```

提示词中的目标尺寸与工具实际输出尺寸可能不同；上面的输出规格按实际文件记录。用户提供的剑气参考图用于轮廓、色带和节奏判断，没有被当作贴片替代三维特效。

## 手绘月牙主体纹理

输出：`public/textures/anime-crescent-v1.png`（1254 × 1254 RGBA，936,405 字节）。参数：`transparent_background: true`。透明轮廓用于生成闭合的浅厚度月牙网格；原图颜色和透明缺口通过原始 UV 映射到前后表面，运行时叠加流光、侵蚀及 Fresnel。

```text
A single premium hand-painted ANIME SWORD SLASH VFX texture for a high-end action RPG. Flat orthographic 2D game effect asset, isolated on true transparent background, square 1024x1024. ONE large asymmetric crescent energy blade, convex cutting edge facing RIGHT, concave open side facing LEFT. The entire crescent visible with 8 percent empty margin; top and bottom sharp points curl toward the left. Shape is an elegant decisive C-shaped curved saber stroke, lower end longer and swept backward, upper end shorter and split into two very sharp flame tips. Broad white-hot pale cyan central cutting mass, clean cyan secondary band, rich electric blue trailing ink, restrained dark indigo and violet accents. Masterful confident hand-painted brushwork with calligraphic tapered edges, large deliberate negative-space slits, irregular sharp backward-raked tears, varied blade width, fine directional streaks embedded WITHIN the blade. White core is a substantial designed silhouette, not a thin line along an arc. The central body is thickest and powerful; the two ends taper to hair-fine pointed hooks. Layered high-contrast cel-painted regions with subtle painterly detail, sharp elegant silhouette and exquisite action-game VFX art. Restrained local light only, no soft glow cloud. Readable thumbnail silhouette. Physically one connected crescent. No rings, full circles, regular repeating waves, rainbow stripes, symmetrical saw teeth, photorealistic ice, metallic sword, character, scene, floor, grid, shadow, text, label, border, checkerboard, scattered particles, external lightning bolts, detached shards or extra crescents. This image is the production COLOR + ALPHA texture itself, not a scene or presentation mockup.
```
