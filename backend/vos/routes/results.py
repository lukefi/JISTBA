"""Endpoints: results, golden video, source video and downloads."""
import os
import tempfile
import zipfile
from pathlib import Path
from fastapi import HTTPException, BackgroundTasks, APIRouter
from fastapi.responses import FileResponse

from vos.behavior import (
    BEHAVIOR_DIMENSIONS,
    behavior_file_path,
    sync_activity_visibility_from_masks,
)
from vos.config import RUNS_ROOT, VIDEO_NAME, config_dir, log
from vos.overlay import label_png_to_palette_bytes
from vos.storage import get_annotation_mode, parse_meta_file


router = APIRouter()


@router.get("/result/{run_id}")
def result(run_id: str):
    path = RUNS_ROOT / run_id / "tracked.mp4"
    if not path.exists():
        raise HTTPException(404, "No result yet. Run /track first.")
    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Cache-Control": "no-store, max-age=0", "Accept-Ranges": "bytes"},
    )


@router.get("/golden_video/{run_id}")
def golden_video(run_id: str):
    path = RUNS_ROOT / run_id / "golden" / "golden_preview.mp4"
    if not path.exists():
        raise HTTPException(404, "No golden preview yet.")

    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/source/{run_id}")
def source(run_id: str):
    meta_path = RUNS_ROOT / run_id / "meta.txt"
    if not meta_path.exists():
        raise HTTPException(404, "run_id not found")

    meta = parse_meta_file(meta_path)
    video_path = meta["video_path"]

    if not os.path.exists(video_path):
        raise HTTPException(404, f"Source video not found: {video_path}")

    return FileResponse(video_path, media_type="video/mp4")

@router.get("/paths/{run_id}")
def paths(run_id: str):
    run_dir = RUNS_ROOT / run_id
    meta_path = run_dir / "meta.txt"
    if not meta_path.exists():
        raise HTTPException(404, "run_id not found")

    golden_root = run_dir / "golden"
    golden_ann = golden_root / "Annotations" / VIDEO_NAME
    golden_video = golden_root / "golden_preview.mp4"
    golden_jpeg = golden_root / "JPEGImages" / VIDEO_NAME

    return {
        "run_id": run_id,
        "run_dir": str(run_dir.resolve()),
        "golden_root": str(golden_root.resolve()),
        "golden_annotations": str(golden_ann.resolve()),
        "golden_preview_video": str(golden_video.resolve()) if golden_video.exists() else None,
        "golden_jpeg_images": str(golden_jpeg.resolve()) if golden_jpeg.exists() else None,
    }


@router.get("/download_golden/{run_id}")
def download_golden(run_id: str, background_tasks: BackgroundTasks):
    """
    Download the golden folder as a zip file.
    """
    log.info(f"/download_golden run_id={run_id}")
    
    run_dir = RUNS_ROOT / run_id
    if get_annotation_mode(run_dir) == "behavior":
        if sync_activity_visibility_from_masks(run_dir):
            log.info(f"[DOWNLOAD_GOLDEN] Applied not_visible segments from golden masks run_id={run_id}")
    golden_root = run_dir / "golden"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=str(config_dir("tmp_dir"))) as tmp_zip:
        zip_path = Path(tmp_zip.name)
    
    # Create zip file with golden folder contents
    log.info(f"[DOWNLOAD_GOLDEN] Creating zip file: {zip_path}")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in golden_root.rglob('*'):
            if not file_path.is_file():
                continue
            arcname = file_path.relative_to(golden_root)
            if arcname.parts[0] == "Annotations_before":
                continue
            if arcname.parts[0] == "Annotations" and file_path.suffix.lower() == ".png":
                colored = label_png_to_palette_bytes(file_path)
                if colored is not None:
                    zipf.writestr(str(arcname), colored)
                    continue
            zipf.write(file_path, arcname)
        for dim in BEHAVIOR_DIMENSIONS:
            bpath = behavior_file_path(run_dir, dim)
            if bpath.is_file():
                zipf.write(bpath, bpath.name)
                log.info(f"[DOWNLOAD_GOLDEN] Included {bpath.name} in zip")
    
    log.info(f"[DOWNLOAD_GOLDEN] Zip file created: {zip_path} ({zip_path.stat().st_size} bytes)")
    
    # Clean up temp file after download
    def cleanup_zip():
        zip_path.unlink()
        log.info(f"[DOWNLOAD_GOLDEN] Cleaned up temp zip file: {zip_path}")
    
    background_tasks.add_task(cleanup_zip)
    
    return FileResponse(
        path=str(zip_path),
        filename=f"{run_id}_golden.zip",
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={run_id}_golden.zip"},
        background=background_tasks
    )
