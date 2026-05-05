from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import verify_password, create_access_token, get_current_user, user_to_schema
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return schemas.Token(
        access_token=create_access_token(user.id),
        user=user_to_schema(user),
    )


@router.get("/me", response_model=schemas.User)
def me(current_user: models.User = Depends(get_current_user)):
    return user_to_schema(current_user)
