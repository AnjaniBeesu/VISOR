# VISOR

**From ordinary video to an explorable 3D environment.**

VISOR V1 contains the landing page, a real video-ingestion API, a COLMAP/OpenCV/Open3D reconstruction worker, and a Three.js GLB viewer.

## V1 capabilities

1. **Upload and validation** — MP4/MOV, 30–120 seconds, maximum 250 MB, minimum 720p, 15–60 FPS.
2. **Frame extraction** — FFmpeg samples at 2 FPS; OpenCV removes very blurred and near-identical frames; maximum 180 selected frames.
3. **Feature matching and SfM** — COLMAP SIFT extraction, sequential matching and mapper camera-pose estimation.
4. **Dense reconstruction** — COLMAP image undistortion, PatchMatch stereo and stereo fusion.
5. **Mesh + browser viewer** — COLMAP Poisson meshing, Open3D vertex-colour transfer/mesh simplification, GLB export and Three.js OrbitControls viewer.

The backend runs asynchronously. The browser polls the job API for real stage updates, previews extracted frames, and loads the generated GLB when complete. A failed reconstruction returns the worker error rather than showing a fake model.

## Run the complete V1 locally

Requirements: Docker Desktop with Docker Compose, and enough RAM/disk for COLMAP. Dense reconstruction is compute-intensive; 16 GB RAM is a practical starting point, not a hard minimum.

```bash
git clone https://github.com/AnjaniBeesu/VISOR.git
cd VISOR
npm install
docker compose up --build
```

In a second terminal:

```bash
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The API runs at http://localhost:8000. Check http://localhost:8000/api/health.

To build the static website:

```bash
npm run build
```

## Production deployment

The Vercel deployment hosts the static frontend. COLMAP cannot run as a Vercel function: the reconstruction API must run on a Docker-capable service with persistent disk and sufficient CPU/RAM. A Render blueprint is included in `render.yaml`.

After deploying the API, set the Vercel environment variable:

```
VITE_API_BASE_URL=https://YOUR-API-HOST
```

Then redeploy the frontend. Configure API CORS to allow the Vercel domain. The included Render disk is persistent job storage; for multiple workers or production-scale usage, move uploads/artifacts to object storage and add a durable queue.

## Capture guidance

- Record a continuous, slow walkthrough with overlapping viewpoints.
- Keep the architecture in focus; avoid fast pans, motion blur and changing exposure.
- Capture all sides and areas with sufficient parallax; do not just rotate in place.
- Prefer textured, well-lit surfaces. Glass, mirrors, blank walls and moving people can reduce reconstruction quality.
- The 30-second minimum is a product validation rule, not a guarantee of sufficient coverage. A successful reconstruction depends on scene geometry and capture quality.

## API

- `GET /api/health`
- `POST /api/jobs` — multipart field `video`
- `GET /api/jobs/{job_id}` — status, progress, extracted frame names and artifact metadata
- `GET /api/jobs/{job_id}/frames/{frame_name}` — extracted frame preview
- `GET /api/jobs/{job_id}/model` — generated GLB when completed

## Known V1 limitations

- The pipeline uses COLMAP sequential matching, so rapid cuts or non-continuous footage are not supported.
- Monocular video reconstruction has scale ambiguity; dimensions are not guaranteed to be metrically accurate.
- Dynamic objects, reflective/transparent surfaces and low-texture walls can create holes or noisy geometry.
- Poisson meshing creates a surface, but does not guarantee a complete, watertight architectural model.
- V1 exports vertex-coloured GLB geometry; it does not yet produce photorealistic texture atlases or Gaussian splats.
- The worker is single-process/single-job by default. Treat this as a test build, not a public multi-tenant service.

## Stack

Vite, Three.js, FastAPI, FFmpeg, OpenCV, COLMAP, Open3D, Docker Compose.
