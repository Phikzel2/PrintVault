import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import models, schemas
from .config import settings
from .database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# JWT token "type" claim values
TOKEN_TYPE_SESSION = "session"
TOKEN_TYPE_DOWNLOAD = "download"
DOWNLOAD_TOKEN_TTL_MINUTES = 10


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": TOKEN_TYPE_SESSION},
        settings.secret_key,
        algorithm="HS256",
    )


def create_download_token(user_id: int, file_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=DOWNLOAD_TOKEN_TTL_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "fid": file_id, "exp": expire, "type": TOKEN_TYPE_DOWNLOAD},
        settings.secret_key,
        algorithm="HS256",
    )


def user_to_schema(user: models.User) -> schemas.User:
    try:
        settings_dict = json.loads(user.settings) if user.settings else {}
    except (json.JSONDecodeError, TypeError):
        settings_dict = {}
    return schemas.User(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        settings=schemas.UserSettings(**settings_dict),
        created_at=user.created_at,
    )


def _user_from_session_token(token: str, db: Session) -> Optional[models.User]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        return None
    if payload.get("type") not in (None, TOKEN_TYPE_SESSION):
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.query(models.User).filter(models.User.id == int(user_id)).first()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = _user_from_session_token(token, db)
    if user is None:
        raise exc
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user


def get_user_for_download(
    file_id: int,
    header_token: Optional[str] = Depends(oauth2_scheme_optional),
    query_token: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Auth for the file-download endpoint. Accepts either:
      - A normal Bearer session token via `Authorization` header, or
      - A short-lived download token via `?token=` query (bound to this file_id).
    The query-token form lets <a download>, Three.js loaders, and slicer
    deep-links work without exposing the long-lived session token in URLs.
    """
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if header_token:
        user = _user_from_session_token(header_token, db)
        if user is not None:
            return user
    if query_token:
        try:
            payload = jwt.decode(query_token, settings.secret_key, algorithms=["HS256"])
        except JWTError:
            raise exc
        if payload.get("type") != TOKEN_TYPE_DOWNLOAD or payload.get("fid") != file_id:
            raise exc
        user_id = payload.get("sub")
        if user_id is None:
            raise exc
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        if user is not None:
            return user
    raise exc
