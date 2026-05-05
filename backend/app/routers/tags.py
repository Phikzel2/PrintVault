from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[schemas.Tag])
def list_tags(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return db.query(models.Tag).order_by(models.Tag.name).all()
