> See [source and execution notes](../PROVENANCE.md).

# Image-to-3D Input Rules (Provider-Agnostic Preflight)

Apply whenever submitting reference images to a live Image-to-3D capability or preparing external 3D generation inputs (Hunyuan 3D, Tripo, Meshy, etc.). Good geometry starts with clean orthographic inputs; always check live provider schemas (`openmotion_capability_discover` / `openmotion_media_use action="reference"`) for exact parameter names.

## 1. Reference Image Preflight

- **One subject per single-view image:** Image-to-3D models reconstruct everything in frame as one fused mesh. Never pass an uncropped multi-view character sheet to a single-image endpoint — either crop the best single view or split identical-pose orthographic views (front/side/back) into separate files for a multi-view endpoint.
- **Neutral rig-ready pose:** For characters that will be rigged or skinned, use a clean **A-pose or T-pose** with arms and legs visually separated from the torso (touching limbs fuse into unriggable geometry).
- **Clean framing:** Full subject in frame with nothing cropped; plain uniform background with no ground shadows, props, text, or watermarks.

## 2. Polygon & Texture Budget Guidance

| Asset Class | Typical Target Triangles | Notes |
|---|---|---|
| Focal hero / hero vehicle | 15,000 – 50,000 | Preserve silhouette fidelity; embedded 4K PNGs are the main byte cost and auto-transcode to WebP on publish/export |
| Secondary NPC / interactive prop | 3,000 – 15,000 | Keep draw calls instanced when repeated |
| Background / small filler | 300 – 3,000 | Prefer shared materials and merged static geometry |

- Export **`.glb`** directly rather than unused FBX/OBJ/USDZ archives.
- Prefer PBR (`baseColor`, `normal`, `roughness/metalness`) for hero focal assets and vehicles; omit unnecessary PBR maps for tiny distant props.
- After obtaining any `.glb`, import via `openmotion_asset_manage` / `openmotion_assets_use` (`action:"import"`) or run `node scripts/game-glb-inspect.mjs <file.glb>` to inspect bounds, `minY`, `alphaMode: BLEND` flags, and texture byte ratio before wiring it into the scene.
