# VISOR

**From ordinary video to an explorable 3D environment.**

VISOR is an experimental video-to-3D reconstruction project. The browser interface is hosted on Vercel; reconstruction is handled separately because dense multi-view stereo requires more compute than a typical student laptop can provide.

## Zero-cost development policy

VISOR's development workflow is designed to use free tools only. It does not require Runpod, paid GPU instances, paid APIs, or a subscription.

- **Frontend:** Vercel Hobby.
- **Source control:** GitHub.
- **Local development:** Python, FastAPI, FFmpeg, OpenCV, COLMAP and Open3D.
- **Optional dense reconstruction:** a manually started Google Colab GPU runtime, only when free GPU access is available.
- **Viewer:** Three.js.

Google Colab's free GPU access is not guaranteed. Availability, usage limits and session duration vary. A Colab session can disconnect, so it is a manual, best-effort compute step—not a permanent API server. Do not select a paid Colab plan or purchase compute units for this project.

## Current reconstruction pipeline

1. **Upload and validation** — MP4/MOV, 30–120 seconds, maximum 250 MB, minimum 720p, 15–60 FPS.
2. **Frame extraction** — FFmpeg samples video; OpenCV filters blurry and near-identical frames.
3. **Feature matching and SfM** — COLMAP estimates camera poses and sparse 3D structure.
4. **Dense reconstruction** — COLMAP image undistortion, CUDA PatchMatch stereo and stereo fusion.
5. **Mesh + browser viewer** — Poisson meshing, Open3D processing, GLB export and Three.js viewer.

Important: the current API worker still runs the complete dense pipeline in one job. It is not yet split into a local preparation stage and a separate Colab hand-off. The current live frontend therefore does not imply that a working reconstruction backend is deployed.

## Hardware compatibility

The development laptop currently targeted for this project has an Intel Core i5, Intel Iris Xe integrated graphics and 8 GB RAM.

That machine can run the frontend and lightweight video preparation. It does not have an NVIDIA CUDA GPU, so it cannot run COLMAP's CUDA PatchMatch dense stereo stage. COLMAP's official documentation notes that dense PatchMatch requires a CUDA-enabled build; the default Linux distribution packages may not include CUDA support.

For now:
- Use the laptop for frontend development, API integration, video validation and small CPU-side experiments.
- Keep local experiments small to avoid exhausting 8 GB RAM.
- Use a free Colab GPU session for dense reconstruction experiments when one is available.
- If Colab does not provide a GPU, stop at the preparation/SfM experiment. Do not silently label a sparse point cloud as a dense 3D reconstruction.

## Local development

Frontend:

```bash
git clone https://github.com/AnjaniBeesu/VISOR.git
cd VISOR
npm install
npm run dev
```

To run the API locally for endpoint and UI integration:

```bash
docker compose up --build
```

The API runs at `http://localhost:8000`; health check: `http://localhost:8000/api/health`.

Create `.env.local` in the project root to point the frontend at a local or separately hosted API:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The local CPU container is useful for integration testing, but the current worker's dense stage will fail without a CUDA-enabled COLMAP build and compatible NVIDIA GPU.

## Free Colab workflow (manual, experimental)

The intended zero-cost dense-compute workflow is:

1. Prepare a short, steady walkthrough video and a reduced set of overlapping frames.
2. Open Google Colab and select a GPU runtime only if a free GPU is offered.
3. Run a VISOR reconstruction notebook to perform the CUDA-enabled COLMAP dense stages.
4. Export the resulting model as a GLB.
5. Load that GLB into the VISOR viewer.

The Colab notebook and automated hand-off are not implemented yet. Until they are added and tested, this is the target workflow—not a currently working one-click feature. Free GPU availability and runtime lifetime are controlled by Colab.

## Capture guidance

- Record a continuous, slow walkthrough with overlapping viewpoints.
- Keep the architecture in focus; avoid fast pans, motion blur and changing exposure.
- Capture all sides and areas with sufficient parallax; do not just rotate in place.
- Prefer textured, well-lit surfaces. Glass, mirrors, blank walls and moving people reduce reconstruction quality.
- The 30-second minimum is a product validation rule, not a guarantee of sufficient coverage.

## API

- `GET /api/health`
- `POST /api/jobs` — multipart field `video`
- `GET /api/jobs/{job_id}` — status, progress, extracted frame names and artifact metadata
- `GET /api/jobs/{job_id}/frames/{frame_name}` — extracted frame preview
- `GET /api/jobs/{job_id}/model` — generated GLB when completed

## Known limitations

- The backend is not currently deployed as a persistent public API.
- The current worker expects a CUDA-capable COLMAP build for dense stereo.
- The free Colab hand-off is not yet implemented; Colab cannot be treated as an always-on backend.
- Sequential matching assumes continuous footage; rapid cuts are not supported.
- Monocular video reconstruction has scale ambiguity; dimensions are not guaranteed to be metrically accurate.
- Dynamic objects, reflective/transparent surfaces and low-texture walls can create holes or noisy geometry.
- Poisson meshing does not guarantee a complete, watertight architectural model.
- V1 exports vertex-coloured GLB geometry; it does not yet produce photorealistic texture atlases or Gaussian splats.
- The current API stores job metadata and artifacts on local disk and is not ready for public multi-user use.

## Stack

Vite, Three.js, FastAPI, FFmpeg, OpenCV, COLMAP, Open3D, Docker, GitHub and Vercel.
