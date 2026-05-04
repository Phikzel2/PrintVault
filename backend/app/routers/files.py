import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..thumbnail import generate_thumbnail

logger = logging.getLogger(__name__)

router = APIRouter(tags=["files"])

FILE_TYPE_MAP = {
    ".stl": "STL",
    ".3mf": "3MF",
    ".gcode": "GCODE",
    ".gc": "GCODE",
    ".gco": "GCODE",
    ".obj": "OBJ",
    ".step": "STEP",
    ".stp": "STEP",
    ".amf": "AMF",
}


def detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return FILE_TYPE_MAP.get(ext, "OTHER")


@router.post("/models/{model_id}/files", response_model=schemas.ModelFile, status_code=201)
async def upload_file(
    model_id: int,
    file: UploadFile = File(...),
    printer_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

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
            model.thumbnail_path = f"/api/models/{model_id}/thumbnail"
            db.commit()

    return db_file


@router.get("/files/{file_id}/download")
def download_file(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(models.ModelFile).filter(models.ModelFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(db_file.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=db_file.file_path,
        filename=db_file.original_filename,
        media_type="application/octet-stream",
    )


@router.delete("/files/{file_id}", status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(models.ModelFile).filter(models.ModelFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    if os.path.exists(db_file.file_path):
        os.remove(db_file.file_path)

    db.delete(db_file)
    db.commit()


@router.patch("/files/{file_id}/printer", response_model=schemas.ModelFile)
def assign_printer(file_id: int, printer_id: Optional[int], db: Session = Depends(get_db)):
    db_file = db.query(models.ModelFile).filter(models.ModelFile.id == file_id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    db_file.printer_id = printer_id
    db.commit()
    db.refresh(db_file)
    return db_file
