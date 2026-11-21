from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .worker import run_reconstruction

DATA_DIR = Path(os.getenv("VISOR_DATA_DIR", "/data/jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 250 * 1024 * 1024
MIN_SECONDS = 30.0
MAX_SECONDS = 120.0
ALLOWED_EXTENSIONS = {".mp4", ".mov"}
executor = ThreadPoolExecutor(max_workers=int(os.getenv("VISOR_WORKERS", "1")))

app = FastAPI(title="VISOR Reconstruction API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("VISOR_CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class JobCreateResponse(BaseModel):
    job_id: str
    status: str
    message: str


def read_job(job_id: str) -> dict[str, Any]:
    folder = DATA_DIR / job_id
    metadata = folder / "job.json"
    if not metadata.exists():
        raise HTTPException(status_code=404, detail="Reconstruction job not found.")
    return json.loads(metadata.read_text())


def write_job(job_id: str, data: dict[str, Any]) -> None:
    folder = DATA_DIR / job_id
    temp = folder / "job.json.tmp"
    temp.write_text(json.dumps(data, indent=2))
    temp.replace(folder / "job.json")


def probe_video(path: Path) -> dict[str, Any]:
    command = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate:format=duration",
        "-of", "json", str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise ValueError("The uploaded file is not a readable video.")
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise ValueError("No video stream was found.")
    stream = data["streams"][0]
    duration = float(data.get("format", {}).get("duration", 0))
    width, height = int(stream.get("width", 0)), int(stream.get("height", 0))
    rate = stream.get("avg_frame_rate", "0/1").split("/")
    fps = float(rate[0]) / max(float(rate[1]), 1.0)
    return {"duration_seconds": round(duration, 2), "width": width, "height": height, "fps": round(fps, 2)}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "COLMAP + OpenCV + Open3D",
        "colmap_available": shutil.which("colmap") is not None,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }


@app.post("/api/jobs", response_model=JobCreateResponse)
async def create_job(video: UploadFile = File(...)) -> JobCreateResponse:
    filename = Path(video.filename or "upload.mp4")
    if filename.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload an MP4 or MOV video.")
    job_id = uuid.uuid4().hex
    folder = DATA_DIR / job_id
    folder.mkdir(parents=True)
    input_path = folder / f"source{filename.suffix.lower()}"
    size = 0
    try:
        with input_path.open("wb") as output:
            while chunk := await video.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Video exceeds the 250 MB limit.")
                output.write(chunk)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    finally:
        await video.close()

    if size == 0:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        metadata = probe_video(input_path)
    except (ValueError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    duration = metadata["duration_seconds"]
    if duration < MIN_SECONDS or duration > MAX_SECONDS:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Video duration must be between 30 and 120 seconds. Detected {duration:.1f}s.")
    if min(metadata["width"], metadata["height"]) < 720:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=422, detail="Video resolution must be at least 720p.")
    if metadata["fps"] < 15 or metadata["fps"] > 60:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=422, detail="Video frame rate must be between 15 and 60 FPS.")

    job = {
        "job_id": job_id, "status": "queued", "progress": 2,
        "stage": "Queued for reconstruction", "message": "Video validated. Waiting for a reconstruction worker.",
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "filename": filename.name, "file_size_bytes": size, "video": metadata,
        "frames": [], "artifacts": {}, "error": None,
    }
    write_job(job_id, job)
    executor.submit(run_reconstruction, job_id, input_path, folder, write_job)
    return JobCreateResponse(job_id=job_id, status="queued", message="Video accepted and reconstruction queued.")


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    return read_job(job_id)


@app.get("/api/jobs/{job_id}/frames/{frame_name}")
def get_frame(job_id: str, frame_name: str) -> FileResponse:
    if Path(frame_name).name != frame_name or not frame_name.endswith(".jpg"):
        raise HTTPException(status_code=400, detail="Invalid frame name.")
    path = DATA_DIR / job_id / "frames" / frame_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Frame not found.")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/jobs/{job_id}/model")
def get_model(job_id: str) -> FileResponse:
    job = read_job(job_id)
    model_path = job.get("artifacts", {}).get("model")
    if job.get("status") != "completed" or not model_path:
        raise HTTPException(status_code=409, detail="The 3D model is not ready yet.")
    path = DATA_DIR / job_id / model_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Model artifact is missing.")
    return FileResponse(path, media_type="model/gltf-binary", filename="visor-reconstruction.glb")
