from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .models import build_summary, can_view

router = APIRouter(prefix="/collections", tags=["collections"])


def _cover_thumbnail(collection: models.Collection) -> str | None:
    # Newest model with a thumbnail is the cover.
    for m in sorted(collection.models, key=lambda m: m.id, reverse=True):
        if m.thumbnail_path:
            return m.thumbnail_path
    return None


def _to_summary(collection: models.Collection) -> schemas.Collection:
    return schemas.Collection(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        owner_id=collection.owner_id,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        model_count=len(collection.models),
        cover_thumbnail=_cover_thumbnail(collection),
    )


def _get_owned_collection(db: Session, collection_id: int, user: models.User) -> models.Collection:
    c = (
        db.query(models.Collection)
        .options(selectinload(models.Collection.models).selectinload(models.PrintModel.files))
        .filter(models.Collection.id == collection_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    if c.owner_id != user.id and not user.is_admin:
        # Mask existence — collections are private to their owner.
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


@router.get("", response_model=list[schemas.Collection])
def list_collections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    collections = (
        db.query(models.Collection)
        .options(selectinload(models.Collection.models))
        .filter(models.Collection.owner_id == current_user.id)
        .order_by(models.Collection.name)
        .all()
    )
    return [_to_summary(c) for c in collections]


@router.post("", response_model=schemas.Collection, status_code=201)
def create_collection(
    data: schemas.CollectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    collection = models.Collection(
        name=data.name,
        description=data.description or None,
        owner_id=current_user.id,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _to_summary(collection)


@router.get("/{collection_id}", response_model=schemas.CollectionDetail)
def get_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_collection(db, collection_id, current_user)
    # Newest-added first; only models the user can still see.
    visible = [m for m in sorted(c.models, key=lambda m: m.id, reverse=True) if can_view(m, current_user)]
    summary = _to_summary(c)
    return schemas.CollectionDetail(
        **summary.model_dump(),
        models=[build_summary(m) for m in visible],
    )


@router.put("/{collection_id}", response_model=schemas.Collection)
def update_collection(
    collection_id: int,
    data: schemas.CollectionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_collection(db, collection_id, current_user)
    if data.name is not None:
        c.name = data.name
    if data.description is not None:
        c.description = data.description or None
    db.commit()
    db.refresh(c)
    return _to_summary(c)


@router.delete("/{collection_id}", status_code=204)
def delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_collection(db, collection_id, current_user)
    db.delete(c)  # association rows cascade; the models themselves are untouched
    db.commit()


@router.post("/{collection_id}/models/{model_id}", response_model=schemas.Collection)
def add_model(
    collection_id: int,
    model_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_collection(db, collection_id, current_user)
    model = db.query(models.PrintModel).filter(models.PrintModel.id == model_id).first()
    if not model or not can_view(model, current_user):
        raise HTTPException(status_code=404, detail="Model not found")
    if model not in c.models:
        c.models.append(model)
        db.commit()
        db.refresh(c)
    return _to_summary(c)


@router.delete("/{collection_id}/models/{model_id}", response_model=schemas.Collection)
def remove_model(
    collection_id: int,
    model_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_collection(db, collection_id, current_user)
    model = next((m for m in c.models if m.id == model_id), None)
    if model is not None:
        c.models.remove(model)
        db.commit()
        db.refresh(c)
    return _to_summary(c)
