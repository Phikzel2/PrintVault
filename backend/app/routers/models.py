import math
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/models", tags=["models"])


def get_or_create_tags(db: Session, tag_names: list[str]) -> list[models.Tag]:
    tags = []
    for name in tag_names:
        name = name.strip().lower()
        if not name:
            continue
        tag = db.query(models.Tag).filter(models.Tag.name == name).first()
        if not tag:
            tag = models.Tag(name=name)
            db.add(tag)
            db.flush()
        tags.append(tag)
    return tags


def build_summary(model: models.PrintModel) -> schemas.PrintModelSummary:
    counts = {"STL": 0, "3MF": 0, "GCODE": 0}
    for f in model.files:
        if f.file_type in counts:
            counts[f.file_type] += 1
    return schemas.PrintModelSummary(
        id=model.id,
        name=model.name,
        description=model.description,
        source_url=model.source_url,
        license=model.license,
        thumbnail_path=model.thumbnail_path,
        created_at=model.created_at,
        tags=model.tags,
        file_count=len(model.files),
        stl_count=counts["STL"],
        threemf_count=counts["3MF"],
        gcode_count=counts["GCODE"],
    )


@router.get("", response_model=schemas.PaginatedModels)
def list_models(
    search: str = Query(None),
    tag: list[str] = Query(None),
    file_type: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.PrintModel)
        .options(selectinload(models.PrintModel.files), selectinload(models.PrintModel.tags))
    )

    if search:
        q = q.filter(
            or_(
                models.PrintModel.name.ilike(f"%{search}%"),
                models.PrintModel.description.ilike(f"%{search}%"),
            )
        )

    if tag:
        for t in tag:
            q = q.filter(models.PrintModel.tags.any(models.Tag.name == t.lower()))

    if file_type:
        q = q.filter(models.PrintModel.files.any(models.ModelFile.file_type == file_type.upper()))

    total = q.count()
    items = (
        q.order_by(models.PrintModel.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return schemas.PaginatedModels(
        items=[build_summary(m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("", response_model=schemas.PrintModel, status_code=201)
def create_model(data: schemas.PrintModelCreate, db: Session = Depends(get_db)):
    tag_objs = get_or_create_tags(db, data.tags)
    model = models.PrintModel(
        name=data.name,
        description=data.description,
        source_url=data.source_url,
        license=data.license,
        tags=tag_objs,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.get("/{model_id}", response_model=schemas.PrintModel)
def get_model(model_id: int, db: Session = Depends(get_db)):
    model = (
        db.query(models.PrintModel)
        .options(
            selectinload(models.PrintModel.files).selectinload(models.ModelFile.printer),
            selectinload(models.PrintModel.tags),
        )
        .filter(models.PrintModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.put("/{model_id}", response_model=schemas.PrintModel)
def update_model(model_id: int, data: schemas.PrintModelUpdate, db: Session = Depends(get_db)):
    model = (
        db.query(models.PrintModel)
        .options(selectinload(models.PrintModel.tags))
        .filter(models.PrintModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    if data.name is not None:
        model.name = data.name
    if data.description is not None:
        model.description = data.description
    if data.source_url is not None:
        model.source_url = data.source_url
    if data.license is not None:
        model.license = data.license
    if data.tags is not None:
        model.tags = get_or_create_tags(db, data.tags)

    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: int, db: Session = Depends(get_db)):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Remove files from disk
    model_dir = Path(settings.upload_dir) / "models" / str(model_id)
    if model_dir.exists():
        import shutil
        shutil.rmtree(model_dir)

    db.delete(model)
    db.commit()


@router.get("/{model_id}/thumbnail")
def get_thumbnail(model_id: int, db: Session = Depends(get_db)):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    thumb_path = Path(settings.upload_dir) / "models" / str(model_id) / "thumbnail.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="No thumbnail")
    return FileResponse(str(thumb_path), media_type="image/jpeg")
