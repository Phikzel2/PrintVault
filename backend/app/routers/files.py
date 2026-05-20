import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_download_token, get_current_user, get_user_for_download
from ..config import settings
from ..constants import detect_file_type
from ..database import get_db
from ..thumbnail import generate_thumbnail


def _can_view_model(model: "models.PrintModel", user: "models.User") -> bool:
    return model.is_public or model.owner_id == user.id or user.is_admin


def _can_edit_model(model: "models.PrintModel", user: "models.User") -> bool:
    return model.owner_id == user.id or user.is_admin


def _get_file_for_view(db: Session, file_id: int, user: "models.User") -> "models.ModelFile":
    f = db.query(models.ModelFile).filter(models.ModelFile.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    parent = db.query(models.PrintModel).filter(models.PrintModel.id == f.model_id).first()
    if not parent or not _can_view_model(parent, user):
        # Mask existence — same 404 whether the file doesn't exist or you can't see it.
        raise HTTPException(status_code=404, detail="File not found")
    return f


def _get_file_for_edit(db: Session, file_id: int, user: "models.User") -> "models.ModelFile":
    f = _get_file_for_view(db, file_id, user)
    parent = db.query(models.PrintModel).filter(models.PrintModel.id == f.model_id).first()
    if not _can_edit_model(parent, user):
        raise HTTPException(status_code=403, detail="Access denied")
    return f

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])


def _parse_gcode_comment(line: str, result: dict) -> None:
    line = line.strip()
    if not line.startswith(";"):
        return
    # PrusaSlicer / OrcaSlicer / Bambu Studio
    if m := re.search(r"; estimated printing time.*?=\s*(.+)", line, re.IGNORECASE):
        result.setdefault("print_time", m.group(1).strip())
    if m := re.search(r"; (?:total )?filament(?: used| weight)? \[g\]\s*=\s*([\d.]+)", line, re.IGNORECASE):
        result.setdefault("filament_g", round(float(m.group(1)), 1))
    # Cura: ;TIME:5025  or  ;TIME_ELAPSED:5025.00
    if m := re.match(r";TIME:(\d+)", line):
        secs = int(m.group(1))
        h, rem = divmod(secs, 3600)
        mn, s = divmod(rem, 60)
        result.setdefault("print_time", f"{h}h {mn}m" if h else f"{mn}m {s}s")
    # Cura: ;Filament used: 1.23m  (convert mm → g is unreliable; skip weight for Cura)
    # Simplify3D
    if m := re.search(r"; Build time:\s*(.+)", line, re.IGNORECASE):
        result.setdefault("print_time", m.group(1).strip())
    if m := re.search(r"; Plastic weight:\s*([\d.]+)\s*grams?", line, re.IGNORECASE):
        result.setdefault("filament_g", round(float(m.group(1)), 1))


def _parse_gcode_metadata(file_path: str) -> dict:
    result: dict = {}
    try:
        with open(file_path, encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        # Scan first 200 lines (PrusaSlicer / Cura write metadata at the top)
        for line in lines[:200]:
            _parse_gcode_comment(line, result)
            if len(result) == 2:
                return result
        # Scan last 800 lines — OrcaSlicer / Bambu Studio embed their summary
        # just before CONFIG_BLOCK_START which can be ~600 lines from EOF
        for line in lines[-800:]:
            _parse_gcode_comment(line, result)
            if len(result) == 2:
                return result
    except Exception:
        pass
    return result


@router.post("/models/{model_id}/files", response_model=schemas.ModelFile, status_code=201)
async def upload_file(
    model_id: int,
    file: UploadFile = File(...),
    printer_id: Optional[int] = Form(None),
    source_file_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not _can_edit_model(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate printer_id and source_file_id refer to objects the user is allowed to use
    if printer_id is not None:
        if not db.query(models.Printer).filter(models.Printer.id == printer_id).first():
            raise HTTPException(status_code=400, detail="Printer not found")
    if source_file_id is not None:
        source = (
            db.query(models.ModelFile)
            .filter(models.ModelFile.id == source_file_id, models.ModelFile.model_id == model_id)
            .first()
        )
        if not source:
            raise HTTPException(status_code=400, detail="Source file must belong to the same model")

    max_bytes = settings.max_file_size_mb * 1024 * 1024
    file_type = detect_file_type(file.filename)
    ext = Path(file.filename).suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"

    model_dir = Path(settings.upload_dir) / "models" / str(model_id) / "files"

    try:
        model_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.error("Cannot create upload directory %s: %s", model_dir, e)
        raise HTTPException(
            status_code=500,
            detail=f"Cannot create upload directory: {e.strerror}. Check that the uploads volume is mounted and writable.",
        )

    file_path = model_dir / unique_name

    try:
        content = await file.read()
    except Exception as e:
        logger.error("Failed to read uploaded file: %s", e)
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    file_size = len(content)
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if file_size > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size / 1024 / 1024:.1f} MB exceeds the {settings.max_file_size_mb} MB limit",
        )

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except OSError as e:
        logger.error("Failed to write file %s: %s", file_path, e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file to disk: {e.strerror}. Check available disk space and volume permissions.",
        )

    try:
        db_file = models.ModelFile(
            model_id=model_id,
            filename=unique_name,
            original_filename=file.filename,
            file_type=file_type,
            file_path=str(file_path),
            file_size=file_size,
            printer_id=printer_id if file_type == "GCODE" else None,
            source_file_id=source_file_id if file_type == "GCODE" else None,
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
    except SQLAlchemyError as e:
        db.rollback()
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        logger.error("Database error saving file record: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    # Generate thumbnail — non-fatal if it fails
    if not model.thumbnail_path and file_type in ("STL", "3MF", "OBJ"):
        thumb_dir = Path(settings.upload_dir) / "models" / str(model_id)
        thumb_path = str(thumb_dir / "thumbnail.jpg")
        if generate_thumbnail(str(file_path), thumb_path):
            model.thumbnail_path = f"/api/models/{model_id}/thumbnail?v={int(time.time())}"
            db.commit()

    return db_file


@router.post("/files/{file_id}/download-token")
def issue_download_token(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Issue a short-lived token bound to this file_id for the calling user.
    The token is intended for browser-native loaders (Three.js, slicer
    deep-links, <a download>) that cannot send an Authorization header."""
    _get_file_for_view(db, file_id, current_user)  # 404 if no access
    return {"token": create_download_token(current_user.id, file_id)}


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_user_for_download),
):
    db_file = _get_file_for_view(db, file_id, current_user)
    if not os.path.exists(db_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=db_file.file_path,
        filename=db_file.original_filename,
        media_type="application/octet-stream",
    )


@router.delete("/files/{file_id}", status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_file = _get_file_for_edit(db, file_id, current_user)

    if os.path.exists(db_file.file_path):
        os.remove(db_file.file_path)

    db.delete(db_file)
    db.commit()


@router.get("/files/{file_id}/metadata")
def get_file_metadata(file_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_file = _get_file_for_view(db, file_id, current_user)
    if db_file.file_type != "GCODE":
        raise HTTPException(status_code=400, detail="Only GCODE files have slicer metadata")
    if not os.path.exists(db_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return _parse_gcode_metadata(db_file.file_path)


@router.patch("/files/{file_id}/printer", response_model=schemas.ModelFile)
def assign_printer(file_id: int, printer_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_file = _get_file_for_edit(db, file_id, current_user)
    if printer_id is not None:
        if not db.query(models.Printer).filter(models.Printer.id == printer_id).first():
            raise HTTPException(status_code=404, detail="Printer not found")
    db_file.printer_id = printer_id
    db.commit()
    db.refresh(db_file)
    return db_file


@router.post("/files/{file_id}/send", status_code=200)
async def send_to_printer(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import httpx

    db_file = _get_file_for_edit(db, file_id, current_user)
    if db_file.file_type != "GCODE":
        raise HTTPException(status_code=400, detail="Only GCODE files can be sent to a printer")
    if not db_file.printer_id:
        raise HTTPException(status_code=400, detail="No printer assigned to this file")

    printer = db.query(models.Printer).filter(models.Printer.id == db_file.printer_id).first()
    if not printer or not printer.moonraker_url:
        raise HTTPException(status_code=400, detail="Printer has no Moonraker URL configured")

    if not os.path.exists(db_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    moonraker_url = printer.moonraker_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            with open(db_file.file_path, "rb") as f:
                response = await client.post(
                    f"{moonraker_url}/server/files/upload",
                    files={"file": (db_file.original_filename, f, "application/octet-stream")},
                    data={"root": "gcodes"},
                )
        response.raise_for_status()
        return {"status": "uploaded", "filename": db_file.original_filename}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout connecting to printer — check the Moonraker URL and network")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot connect to printer — check the Moonraker URL and network")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker returned {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Send failed: {e}")


@router.patch("/files/{file_id}/source", response_model=schemas.ModelFile)
def assign_source_file(file_id: int, source_file_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_file = _get_file_for_edit(db, file_id, current_user)
    if source_file_id is not None:
        source = db.query(models.ModelFile).filter(models.ModelFile.id == source_file_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source file not found")
        if source.model_id != db_file.model_id:
            raise HTTPException(status_code=400, detail="Source file must belong to the same model")
    db_file.source_file_id = source_file_id
    db.commit()
    db.refresh(db_file)
    return db_file
