from __future__ import annotations

import json
import shutil
import subprocess
import traceback
from pathlib import Path
from typing import Callable, Any

import cv2
import numpy as np


def update(job_id: str, folder: Path, writer: Callable, **changes: Any) -> None:
    metadata = json.loads((folder / "job.json").read_text())
    metadata.update(changes)
    writer(job_id, metadata)


def run(command: list[str], cwd: Path | None = None, timeout: int | None = None) -> None:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        tail = (result.stderr or result.stdout)[-5000:]
        raise RuntimeError(f"Command failed: {' '.join(command[:3])}\n{tail}")


def extract_frames(video: Path, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    # Two frames per second is a conservative starting point for handheld walkthrough footage.
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
         "-vf", "fps=2,scale='min(1920,iw)':-2", "-q:v", "3",
         str(frames_dir / "frame_%05d.jpg")], timeout=600)
    candidates = sorted(frames_dir.glob("frame_*.jpg"))
    if len(candidates) < 20:
        raise RuntimeError("Not enough frames could be extracted. Record a longer video with more viewpoint changes.")

    kept: list[Path] = []
    previous = None
    for path in candidates:
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            path.unlink(missing_ok=True)
            continue
        # Reject very blurred frames; keep a frame if it is sufficiently sharp.
        sharpness = cv2.Laplacian(image, cv2.CV_64F).var()
        if sharpness < 12:
            path.unlink(missing_ok=True)
            continue
        # Remove near-identical consecutive frames while preserving camera coverage.
        thumb = cv2.resize(image, (64, 36))
        if previous is not None and np.mean(cv2.absdiff(thumb, previous)) < 1.5:
            path.unlink(missing_ok=True)
            continue
        previous = thumb
        kept.append(path)
    if len(kept) < 20:
        raise RuntimeError("Too few usable frames remain after blur/duplicate filtering. Record steadier footage with more scene coverage.")
    # Keep COLMAP runtime predictable for the first release.
    if len(kept) > 180:
        indices = np.linspace(0, len(kept) - 1, 180).astype(int)
        selected = {kept[i] for i in indices}
        for path in kept:
            if path not in selected:
                path.unlink(missing_ok=True)
        kept = sorted(selected)
    return kept


def build_glb(point_cloud_path: Path, mesh_path: Path, glb_path: Path) -> dict[str, int]:
    import open3d as o3d

    cloud = o3d.io.read_point_cloud(str(point_cloud_path))
    mesh = o3d.io.read_triangle_mesh(str(mesh_path))
    if mesh.is_empty() or len(mesh.triangles) < 100:
        raise RuntimeError("COLMAP produced an incomplete surface. Try a slower, more overlapping camera walkthrough.")
    if not cloud.is_empty() and cloud.has_colors():
        tree = o3d.geometry.KDTreeFlann(cloud)
        colors = np.asarray(cloud.colors)
        vertices = np.asarray(mesh.vertices)
        vertex_colors = []
        for vertex in vertices:
            _, indices, _ = tree.search_knn_vector_3d(vertex, 1)
            vertex_colors.append(colors[indices[0]] if len(indices) else [0.55, 0.62, 0.75])
        mesh.vertex_colors = o3d.utility.Vector3dVector(np.asarray(vertex_colors))
    mesh.compute_vertex_normals()
    if len(mesh.triangles) > 180_000:
        mesh = mesh.simplify_quadric_decimation(180_000)
        mesh.compute_vertex_normals()
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    if not o3d.io.write_triangle_mesh(str(glb_path), mesh, write_vertex_colors=True, compressed=True):
        raise RuntimeError("Could not export the reconstructed scene to GLB.")
    return {"vertices": len(mesh.vertices), "triangles": len(mesh.triangles), "points": len(cloud.points)}


def run_reconstruction(job_id: str, video: Path, folder: Path, writer: Callable) -> None:
    try:
        update(job_id, folder, writer, status="processing", progress=5, stage="Preparing workspace",
               message="Preparing video and reconstruction workspace.")
        frames_dir = folder / "frames"
        frames = extract_frames(video, frames_dir)
        frame_names = [p.name for p in frames]
        update(job_id, folder, writer, progress=20, stage="Frames extracted",
               message=f"Extracted {len(frames)} usable frames.", frames=frame_names)

        if shutil.which("colmap") is None:
            raise RuntimeError("COLMAP is not installed in this worker. Run VISOR with Docker Compose.")
        database = folder / "database.db"
        sparse_dir = folder / "sparse"
        dense_dir = folder / "dense"
        sparse_dir.mkdir(exist_ok=True)
        update(job_id, folder, writer, progress=28, stage="Detecting visual features",
               message="Finding and describing visual features in each frame.")
        run(["colmap", "feature_extractor", "--database_path", str(database), "--image_path", str(frames_dir),
             "--ImageReader.single_camera", "1", "--SiftExtraction.use_gpu", "0", "--SiftExtraction.max_num_features", "8192"], timeout=1800)

        update(job_id, folder, writer, progress=38, stage="Matching overlapping frames",
               message="Matching visual features across nearby video frames.")
        run(["colmap", "sequential_matcher", "--database_path", str(database),
             "--SequentialMatching.overlap", "10", "--SiftMatching.use_gpu", "0"], timeout=1800)

        update(job_id, folder, writer, progress=50, stage="Estimating camera poses (SfM)",
               message="Estimating camera positions and building the sparse point cloud.")
        run(["colmap", "mapper", "--database_path", str(database), "--image_path", str(frames_dir),
             "--output_path", str(sparse_dir)], timeout=3600)
        sparse_models = sorted(p for p in sparse_dir.iterdir() if p.is_dir())
        if not sparse_models:
            raise RuntimeError("COLMAP could not estimate camera poses. Capture overlapping views with slower movement and good lighting.")
        sparse_model = sparse_models[0]

        update(job_id, folder, writer, progress=62, stage="Undistorting images",
               message="Preparing calibrated images for dense reconstruction.")
        run(["colmap", "image_undistorter", "--image_path", str(frames_dir), "--input_path", str(sparse_model),
             "--output_path", str(dense_dir), "--output_type", "COLMAP", "--max_image_size", "1600"], timeout=1800)

        update(job_id, folder, writer, progress=70, stage="Computing depth maps",
               message="Estimating depth from overlapping camera views. This is the most compute-intensive stage.")
        run(["colmap", "patch_match_stereo", "--workspace_path", str(dense_dir), "--workspace_format", "COLMAP",
             "--PatchMatchStereo.geom_consistency", "true"], timeout=7200)

        update(job_id, folder, writer, progress=82, stage="Fusing dense geometry",
               message="Combining depth maps into a dense point cloud.")
        fused = dense_dir / "fused.ply"
        run(["colmap", "stereo_fusion", "--workspace_path", str(dense_dir), "--workspace_format", "COLMAP",
             "--input_type", "geometric", "--output_path", str(fused)], timeout=3600)

        update(job_id, folder, writer, progress=89, stage="Generating surface mesh",
               message="Reconstructing a continuous surface from the dense point cloud.")
        mesh = dense_dir / "meshed-poisson.ply"
        run(["colmap", "poisson_mesher", "--input_path", str(fused), "--output_path", str(mesh)], timeout=3600)

        update(job_id, folder, writer, progress=95, stage="Exporting interactive model",
               message="Optimizing geometry and exporting the browser-ready GLB model.")
        stats = build_glb(fused, mesh, folder / "artifacts" / "reconstruction.glb")
        update(job_id, folder, writer, status="completed", progress=100, stage="Reconstruction complete",
               message="Your 3D reconstruction is ready to explore.",
               artifacts={"model": "artifacts/reconstruction.glb", "stats": stats,
                          "sparse_model": "sparse", "dense_point_cloud": "dense/fused.ply"})
    except Exception as exc:
        update(job_id, folder, writer, status="failed", progress=0, stage="Reconstruction failed",
               message="The reconstruction could not be completed.",
               error=str(exc), debug=traceback.format_exc()[-8000:])
