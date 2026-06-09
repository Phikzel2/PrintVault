import io
import math
import os
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import get_current_user
from ..config import settings
from ..database import get_db

router = APIRouter(prefix="/models", tags=["models"])


def prune_orphan_tags(db: Session) -> None:
    db.flush()
    orphans = db.query(models.Tag).filter(~models.Tag.models.any()).all()
    for tag in orphans:
        db.delete(tag)


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
        is_public=model.is_public,
        owner_id=model.owner_id,
        created_at=model.created_at,
        tags=model.tags,
        file_count=len(model.files),
        stl_count=counts["STL"],
        threemf_count=counts["3MF"],
        gcode_count=counts["GCODE"],
    )


def can_view(model: models.PrintModel, user: models.User) -> bool:
    return model.is_public or model.owner_id == user.id or user.is_admin


def can_edit(model: models.PrintModel, user: models.User) -> bool:
    return model.owner_id == user.id or user.is_admin


@router.get("", response_model=schemas.PaginatedModels)
def list_models(
    search: str = Query(None),
    tag: list[str] = Query(None),
    file_type: str = Query(None),
    visibility: str = Query(None),  # "public" | "private"
    collection: int = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    sort: str = Query("newest"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (
        db.query(models.PrintModel)
        .options(selectinload(models.PrintModel.files), selectinload(models.PrintModel.tags))
    )

    if not current_user.is_admin:
        q = q.filter(
            or_(models.PrintModel.is_public == True, models.PrintModel.owner_id == current_user.id)
        )

    if visibility == "public":
        q = q.filter(models.PrintModel.is_public == True)
    elif visibility == "private":
        q = q.filter(models.PrintModel.is_public == False)

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

    if collection is not None:
        # Scope to a collection the user owns (or any, if admin) so collection
        # ids can't be used to probe other users' membership.
        coll = db.query(models.Collection).filter(models.Collection.id == collection).first()
        if not coll or (coll.owner_id != current_user.id and not current_user.is_admin):
            raise HTTPException(status_code=404, detail="Collection not found")
        q = q.filter(models.PrintModel.collections.any(models.Collection.id == collection))

    order = {
        "oldest": models.PrintModel.created_at.asc(),
        "name_asc": models.PrintModel.name.asc(),
        "name_desc": models.PrintModel.name.desc(),
    }.get(sort, models.PrintModel.created_at.desc())

    total = q.count()
    items = (
        q.order_by(order)
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
def create_model(
    data: schemas.PrintModelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tag_objs = get_or_create_tags(db, data.tags)
    model = models.PrintModel(
        name=data.name,
        description=data.description,
        source_url=data.source_url,
        license=data.license,
        is_public=False,
        owner_id=current_user.id,
        tags=tag_objs,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.get("/{model_id}", response_model=schemas.PrintModel)
def get_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    model = (
        db.query(models.PrintModel)
        .options(
            selectinload(models.PrintModel.files).selectinload(models.ModelFile.printer),
            selectinload(models.PrintModel.tags),
            selectinload(models.PrintModel.collections),
        )
        .filter(models.PrintModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_view(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    return model


@router.put("/{model_id}", response_model=schemas.PrintModel)
def update_model(
    model_id: int,
    data: schemas.PrintModelUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    model = (
        db.query(models.PrintModel)
        .options(selectinload(models.PrintModel.tags))
        .filter(models.PrintModel.id == model_id)
        .first()
    )
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_edit(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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
        prune_orphan_tags(db)

    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}", status_code=204)
def delete_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_edit(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    model_dir = Path(settings.upload_dir) / "models" / str(model_id)
    if model_dir.exists():
        shutil.rmtree(model_dir)

    db.delete(model)
    prune_orphan_tags(db)
    db.commit()


@router.post("/{model_id}/visibility", status_code=200)
def set_visibility(
    model_id: int,
    is_public: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_edit(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    model.is_public = is_public
    db.commit()
    return {"is_public": model.is_public}


@router.get("/{model_id}/thumbnail")
def get_thumbnail(model_id: int, theme: str = Query("dark"), db: Session = Depends(get_db)):
    # No auth required — thumbnails are served to <img> tags that can't send Bearer tokens
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    model_dir = Path(settings.upload_dir) / "models" / str(model_id)
    themed = model_dir / f"thumbnail_{theme}.jpg"
    generic = model_dir / "thumbnail.jpg"
    if themed.exists():
        thumb_path = themed
    elif generic.exists():
        thumb_path = generic
    else:
        raise HTTPException(status_code=404, detail="No thumbnail")
    return FileResponse(
        str(thumb_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "max-age=31536000, immutable"},
    )


@router.post("/{model_id}/thumbnail", status_code=200)
def set_thumbnail(
    model_id: int,
    file_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from ..thumbnail import generate_thumbnail

    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_edit(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db_file = (
        db.query(models.ModelFile)
        .filter(models.ModelFile.id == file_id, models.ModelFile.model_id == model_id)
        .first()
    )
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    if db_file.file_type not in ("STL", "3MF", "OBJ"):
        raise HTTPException(status_code=400, detail="File type does not support thumbnail generation")

    model_dir = Path(settings.upload_dir) / "models" / str(model_id)
    ok_dark = generate_thumbnail(db_file.file_path, str(model_dir / "thumbnail_dark.jpg"), style="dark")
    ok_light = generate_thumbnail(db_file.file_path, str(model_dir / "thumbnail_light.jpg"), style="light")
    if not ok_dark and not ok_light:
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")

    model.thumbnail_path = f"/api/models/{model_id}/thumbnail?v={int(time.time())}"
    db.commit()
    return {"thumbnail_path": model.thumbnail_path}


MAX_THUMBNAIL_BYTES = 25 * 1024 * 1024  # 25 MB — generous for phone photos, tight enough to block bombs


@router.post("/{model_id}/thumbnail/upload", status_code=200)
async def upload_thumbnail_image(
    model_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from PIL import Image

    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not can_edit(model, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_THUMBNAIL_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large: {len(content) / 1024 / 1024:.1f} MB exceeds the {MAX_THUMBNAIL_BYTES // 1024 // 1024} MB thumbnail limit",
        )

    try:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        img.thumbnail((1200, 900))
        thumb_path = Path(settings.upload_dir) / "models" / str(model_id) / "thumbnail.jpg"
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
        thumb_path.write_bytes(buf.getvalue())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    model.thumbnail_path = f"/api/models/{model_id}/thumbnail?v={int(time.time())}"
    db.commit()
    return {"thumbnail_path": model.thumbnail_path}
