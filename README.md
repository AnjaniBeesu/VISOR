# VISOR

**From ordinary video to an explorable 3D environment.**

VISOR separates the browser experience from the reconstruction compute. The Vercel app handles the interface and Three.js viewer; a GPU-backed API runs COLMAP's dense multi-view stereo pipeline.

## V1 pipeline

1. **Upload and validation** — MP4/MOV, 30–120 seconds, maximum 250 MB, minimum 720p, 15–60 FPS.
2. **Frame extraction** — FFmpeg samples at 2 FPS; OpenCV filters blurred and near-identical frames; maximum 180 selected frames.
3. **Feature matching and SfM** — COLMAP SIFT extraction, sequential matching and camera-pose estimation.
4. **Dense reconstruction** — COLMAP image undistortion, CUDA PatchMatch stereo and stereo fusion.
5. **Mesh + browser viewer** — COLMAP Poisson meshing, Open3D colour transfer/mesh simplification, GLB export and Three.js OrbitControls viewer.

The API returns real job stages and errors. It does not return a fabricated model when reconstruction fails.

## Architecture

- **Frontend:** Vercel static deployment.
- **Reconstruction API:** Docker container on a GPU Pod.
- **Compute:** NVIDIA CUDA GPU for COLMAP dense stereo.
- **Job storage:** Persistent volume mounted at `/data` on the GPU Pod.
- **API contract:** FastAPI upload, job polling, keyframe preview and GLB download endpoints.

The selected initial cloud target is a Runpod Pod rather than Serverless. VISOR needs a long-running reconstruction process, persistent job files and a stable HTTP API while the browser polls job status. A Pod is the simpler V1 deployment model; we can move to a queue + autoscaled workers after validating the pipeline.

## Cloud deployment (recommended)

### 1. Publish the backend image

A GitHub Actions workflow builds the backend Docker image and publishes it to GitHub Container Registry whenever backend files change on `main`.

Image name:

```
ghcr.io/anjanibeesu/visor-api:latest
```

After the first successful workflow, open the package in GitHub and set its visibility to **Public** so Runpod can pull it without registry credentials. If you prefer a private package, configure a registry credential in Runpod instead.

### 2. Create a Runpod GPU Pod

Use the Runpod Pods dashboard:

- Choose an **RTX 4090 (24 GB VRAM)** for the first test deployment. It is ample for a small 180-frame V1 workload; larger scenes may need more VRAM/RAM or lower image limits.
- Select a template that allows a custom container image.
- Container image: `ghcr.io/anjanibeesu/visor-api:latest`
- Expose HTTP port: `8000`
- Attach a persistent volume and mount it at: `/data`
- Set environment variables:

```
VISOR_DATA_DIR=/data/jobs
VISOR_WORKERS=1
VISOR_CORS_ORIGINS=https://visor-dun-two.vercel.app
OMP_NUM_THREADS=4
```

- Start the Pod and confirm `https://YOUR-POD-PROXY/api/health` returns JSON with `status: ok`, `colmap_available: true` and `ffmpeg_available: true`.

Runpod GPU pricing changes by GPU, cloud tier and availability. Its pricing page currently lists RTX 4090 Pods from approximately **$0.34/hour on Community Cloud** and **$0.89/hour on Secure Cloud**; persistent storage is billed separately. Stop or terminate the Pod when it is not needed, and check the live checkout price before launching. A continuously running Pod incurs compute charges even when no reconstruction is active.

### 3. Connect the Vercel frontend

In the Vercel project settings, add this environment variable to Production (and Preview if needed):

```
VITE_API_BASE_URL=https://YOUR-POD-PROXY
```

Redeploy the frontend after saving it. Replace the example URL with the HTTPS proxy URL shown by Runpod. The backend CORS allowlist must contain the exact Vercel origin.

### 4. Test end to end

1. Open the deployed VISOR site.
2. Upload a 30–120 second MP4/MOV walkthrough.
3. Confirm the API creates a job and the UI receives progress updates.
4. Wait for dense stereo, fusion, meshing and GLB export to finish.
5. Inspect the model in the Three.js viewer and download the GLB.

Do not expose the API publicly to untrusted users yet. V1 currently has no user authentication, upload quotas, durable queue, or object-storage isolation. Use it for controlled testing until those protections are implemented.

## Local development

Your Intel Iris Xe laptop does not have a CUDA-capable NVIDIA GPU. It can run the frontend and lightweight video preparation, but it cannot run VISOR's current COLMAP dense reconstruction stage. Do not use the GPU Compose override on that machine.

Frontend:

```bash
git clone https://github.com/AnjaniBeesu/VISOR.git
cd VISOR
npm install
npm run dev
```

To run the API locally for endpoint/UI integration only, Docker Compose can start the CPU container, but a complete reconstruction will fail at CUDA PatchMatch stereo:

```bash
docker compose up --build
```

The API runs at `http://localhost:8000`; health check: `http://localhost:8000/api/health`. To point the frontend at a different API during local development, create a `.env.local` file:

```
VITE_API_BASE_URL=https://YOUR-POD-PROXY
```

## Capture guidance

- Record a continuous, slow walkthrough with overlapping viewpoints.
- Keep the architecture in focus; avoid fast pans, motion blur and changing exposure.
- Capture all sides and areas with sufficient parallax; do not just rotate in place.
- Prefer textured, well-lit surfaces. Glass, mirrors, blank walls and moving people reduce reconstruction quality.
- The 30-second minimum is a product validation rule, not a guarantee of sufficient coverage. Reconstruction quality depends on scene geometry and capture quality.

## API

- `GET /api/health`
- `POST /api/jobs` — multipart field `video`
- `GET /api/jobs/{job_id}` — status, progress, extracted frame names and artifact metadata
- `GET /api/jobs/{job_id}/frames/{frame_name}` — extracted frame preview
- `GET /api/jobs/{job_id}/model` — generated GLB when completed

## Known V1 limitations

- Sequential matching assumes continuous footage; rapid cuts are not supported.
- Monocular video reconstruction has scale ambiguity; dimensions are not guaranteed to be metrically accurate.
- Dynamic objects, reflective/transparent surfaces and low-texture walls can create holes or noisy geometry.
- Poisson meshing creates a surface but does not guarantee a complete, watertight architectural model.
- V1 exports vertex-coloured GLB geometry; it does not yet produce photorealistic texture atlases or Gaussian splats.
- The worker is single-process/single-job by default. The current job metadata and artifacts live on the Pod's persistent volume; do not run multiple API replicas against local disk.
- Treat this as a controlled test build, not a public multi-tenant service.

## Stack

Vite, Three.js, FastAPI, FFmpeg, OpenCV, COLMAP, Open3D, Docker, Runpod GPU Pods, Vercel.
