# VISOR

**Turning ordinary video into interactive 3D environments.**

VISOR is an early-stage computer vision project exploring visual intelligence and spatial reconstruction.

## Current website prototype

The landing page includes an interactive reconstruction-stage slider:

1. **Video** — original architectural footage.
2. **Points** — feature points appear over the source.
3. **Wireframe** — spatial lines reveal an estimated structure.
4. **3D model** — the source fades and an architectural reconstruction illustration appears.

The current scene is a front-end visual prototype. It does not yet process uploaded videos or generate a real reconstruction.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Planned computer vision pipeline

- Video ingestion and frame sampling
- Feature detection and camera pose estimation
- Sparse/dense reconstruction
- 3D scene representation
- Browser-based interactive scene viewer

## Stack

- Vite
- Vanilla JavaScript
- CSS / SVG

The architecture reference image is loaded from Unsplash; an internet connection is required to display it.
