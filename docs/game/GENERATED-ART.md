# 新标题与引路纹理的生成记录

生成方式：内置 ImageGen 工具。四张图片的原始 PNG 保存在 `assets/rpg-source/art/`，运行时使用 `public/game/art/` 中的 WebP；透明图保留 alpha。材质、法阵、技能与实时场景仍由 Three.js 渲染。

## title-sanctuary-v2

透明背景：false

Use case: stylized-concept. Asset type: exceptionally refined 16:9 panoramic background artwork for a premium Chinese xianxia action RPG title menu, no UI. Scene: an immense mist-filled mountain sanctuary above a sea of clouds at luminous blue hour. On the RIGHT two thirds, layered ancient Chinese palaces with delicate jade-tiled upturned roofs, weathered ivory terraces, narrow bridges, restrained aged gold carvings, huge distant broken celestial astrolabe gateway behind the main mountain. A pale moon, waterfalls disappearing into mist, tiny warm amber lanterns provide scale. Far mountains dissolve through several atmospheric depth planes. LEFT third is beautiful quiet deep teal mist and soft distant mountain silhouettes, intentionally readable negative space for menu typography. Style: masterful cinematic fantasy matte painting, sophisticated Chinese landscape sensibility, precise architectural craft and painterly atmospheric depth. Palette: deep peacock teal, moonlit jade, silver mist, very restrained warm gold. The scene must be luminous and detailed, not crushed dark or oversaturated neon. No foreground branches, no people, no lettering, no UI, no logos, no watermark. Compose the central visual focus at x=72%, y=45%, with empty air between landscape depth planes for animated fog overlays.

## title-foreground-v2

透明背景：true

Use case: stylized-concept. Asset type: transparent foreground parallax layer, wide 16:9 canvas, for a premium Chinese xianxia game title menu. Precisely painted gnarled ancient pine branch reaching a short distance into the frame from the TOP RIGHT edge, with fine blue-jade needles tipped with restrained silver moonlight, a tiny antique brass wind chime with one long muted ochre silk tassel. At the BOTTOM RIGHT corner, a narrow silhouette of weathered carved dark stone balustrade with very small pale blossoms, its diagonal leads out of frame. The CENTER and LEFT 75% must be completely empty transparent alpha. Nothing spans the canvas. Delicate, natural, extremely detailed material work, moonlit teal and aged bronze palette, refined Chinese fantasy concept art. No background, no sky, no mist, no text, no white rectangle, no checkerboard baked into the image. True transparent background.

## title-mist-v2

透明背景：true

Use case: stylized-concept. Asset type: transparent wide panoramic mist overlay for a cinematic Chinese fantasy landscape, 16:9. Two extremely delicate pale silver-blue cloud ribbons flowing horizontally across the LOWER THIRD of an otherwise empty transparent canvas. Wispy layered curls, long elegant brush-like vapor strands, subtle blue-hour rim light, very soft translucent feathered edges. Medium density at lower left and lower right, sparse wisps between; mist should not look like smoke from fire or storm clouds. High-end atmospheric matte painting element. Pure transparent alpha behind and between every wisp; most of the upper two thirds completely transparent. No objects, no ground, no typography, no checkerboard or solid background.

## route-silk-v1

透明背景：true

Production-ready premium Chinese xianxia game VFX texture, a SINGLE horizontal flowing spiritual silk ribbon on genuine transparent background. Landscape 16:9 texture canvas, one uninterrupted slender liquid-gold and pale ivory filament centered vertically, extending completely through both left and right edges for horizontal tiling, subtle warm pale jade secondary wisps around it. At least 75% of canvas is empty transparency. Extremely fine elegant calligraphic energy flow, two or three wispy parallel hairline filaments merging into the single central ribbon, subtle irregular gauze-like transparency and sparse tiny gold glints. Central core razor thin and readable, soft outer wisps maximum 12% of image height. No fat white bar, no big sparks, no text, no symbols, no arrows, no ring, no scene, no gradients filling the background. Graceful refined AAA fantasy guiding-light texture intended for a ground ribbon shader, hand-painted luminous brushwork with crisp center and translucent edges. Keep center at exact vertical midpoint and strength balanced at both horizontal ends. Straight overall axis but internal tiny organic eddies. True alpha; no black backing, no checkerboard.

运行时使用中部 UV、双层流动、距离渐隐及固定间隔的细小符印；引路曲线由实际导航路径生成，纹理本身不代替导航逻辑。

