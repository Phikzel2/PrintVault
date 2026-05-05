import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, hash_password, user_to_schema, verify_password
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user


@router.get("", response_model=list[schemas.User])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    return [user_to_schema(u) for u in db.query(models.User).order_by(models.User.created_at).all()]


@router.post("", response_model=schemas.User, status_code=201)
def create_user(
    data: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = models.User(
        username=data.username,
        hashed_password=hash_password(data.password),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_schema(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


@router.put("/me/settings", response_model=schemas.User)
def update_settings(
    data: schemas.UserSettings,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_user.settings = json.dumps(data.model_dump())
    db.commit()
    db.refresh(current_user)
    return user_to_schema(current_user)


@router.put("/me/password", status_code=204)
def update_password(
    data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
