# Equipment / awakening asset production

Mode: built-in `image_gen` (text → image), then Ark Seed3D image → GLB. No new runtime AI calls.

## Equipment concept sheet

Production brief / reproducible prompt: square transparent production-quality original xianxia RPG equipment concept sheet, five isolated complete equipment objects with generous clear gutters. Top row: silver/navy celestial breastplate with separate sharp layered shoulder plates; one full ornate armored boot; a symmetrical pair of elongated crystalline blue/violet feather wings. Bottom row: flowing midnight navy cloak with fine silver/gold filigree and cyan gemstone clasp; an extremely elegant long single-edged Chinese celestial dao, silver blue faceted blade, antique gold guard and dark wrapped handle. Premium hand-painted game item icons, realistic PBR materials, crisp silhouette, restrained blue crystal glow. Each item fully visible in a neutral front three-quarter view, clean unobstructed shapes suitable as individual image-to-3D references. No character, body, mannequin, background scenery, text, labels, grid lines or watermarks. Transparent background.

Native output: `assets/rpg-source/art/equipment/equipment-atlas-v1.png`, 1254 × 1254. The five reference crops are `{armor,boots,wings,cloak,weapon}-v1.png` in that directory. Runtime 256px WebP icons are `public/game/art/equipment/`. Sharp only crops and resizes the generated pixels; it does not redraw them.

## Frost atlas

Production brief / reproducible prompt: professional stylized anime ice magic VFX texture atlas on pure black, exactly four isolated grayscale/cyan-white effects in a 2×2 layout with clear black gutters. Top left an asymmetrical swirling frozen vortex with wispy directional streaks, top right branching vertical crystalline ice cracks, bottom left a sharp radial ice impact explosion with tapered shard streaks and an empty dark outer margin, bottom right delicate turbulent cold vapor wisps. Bright white core, gray midtones, precise sharp-to-soft falloff, high contrast alpha masks, no text, no frames, no characters, no scenery. High frequency painted details suitable for animated shader UV flow, independent effects never touching quadrant borders.

Native output is 1254 × 1254; runtime `public/game/art/awakening/frost-atlas-v1.webp`. GLSL uses luminance as opacity, handles tint, animated UVs and lifecycle. These are texture masks for 3D surfaces and contacts, rather than finished scene imagery.

## Generated geometry

All five jobs succeeded using `doubao-seed3d-2-0-260328`, `--subdivisionlevel high --fileformat glb`. Exact generation specs are committed in `asset-specs/equipment.json`. Input PNGs / large source GLBs stay in the ignored offline assets folder.

| Slot | Task ID | Runtime GLB |
| --- | --- | --- |
| armor | cgt-20261104184022-n6kcc | public/game/models/equipment/armor-v1.glb |
| boots | cgt-20261104184025-7c7zd | public/game/models/equipment/boots-v1.glb |
| wings | cgt-20261104184028-nlphw | public/game/models/equipment/wings-v1.glb |
| cloak | cgt-20261104184030-hkqtp | public/game/models/equipment/cloak-v1.glb |
| weapon | cgt-20261104184031-hvwmh | public/game/models/equipment/weapon-v1.glb |

Run `node scripts/generate-assets.mjs --equipment` for offline generation using an interactively supplied Ark key, then `node scripts/prepare-equipment.mjs`. Optimization uses attribute-aware permissive Meshoptimizer simplification with normal/UV error weights, approximately 10,000 triangles per item, shared material deduplication, pruning and 768px WebP PBR textures. `public/game/models/equipment/manifest.json` records triangle counts. No Draco or additional runtime decoders required.

H/J reuse the three original class portraits already described in [AWAKENING-ART-PROMPTS.md](AWAKENING-ART-PROMPTS.md); the giant dao is the actual newly generated weapon model with animated world transforms and an independent shader. The generated source PNG and raw GLBs remain on this workstation; the repository contains the complete optimized runtime assets.
