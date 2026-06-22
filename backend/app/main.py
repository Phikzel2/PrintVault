import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import models, files, printers, tags, auth, users, imports, stats, collections

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


INSECURE_SECRET_KEYS = {"changeme", "changeme-in-production", "change-me-long-random-string", ""}


def _validate_secret_key() -> None:
    if settings.secret_key.strip() in INSECURE_SECRET_KEYS or len(settings.secret_key) < 32:
        raise RuntimeError(
            "SECRET_KEY is missing, default, or too short (<32 chars). "
            "Generate one with `openssl rand -hex 32` and set it in .env. "
            "Refusing to start with an insecure key."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_secret_key()
    Base.metadata.create_all(bind=engine)
    _seed_admin()
    _check_upload_dir()
    _warn_if_dormant_users()
    yield


def _seed_admin():
    from .database import SessionLocal
    from . import models as db_models
    from .auth import hash_password

    db = SessionLocal()
    try:
        if db.query(db_models.User).count() == 0:
            admin = db_models.User(
                username=settings.admin_username,
                hashed_password=hash_password(settings.admin_password),
                is_admin=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Created admin user: %s", settings.admin_username)
    finally:
        db.close()


def _warn_if_dormant_users():
    """Loudly warn when MULTI_USER_MODE=false but the DB still has more
    than one user account. Those accounts can still log in and call the
    API — hiding the UI does not deactivate them."""
    if settings.multi_user_mode:
        return
    from .database import SessionLocal
    from . import models as db_models

    db = SessionLocal()
    try:
        count = db.query(db_models.User).count()
        if count > 1:
            logger.warning(
                "================================================================\n"
                "  MULTI_USER_MODE=false but %d user accounts exist in the DB.\n"
                "  The multi-user UI is hidden, but those accounts can still log\n"
                "  in and call the API directly. To actually disable them,\n"
                "  temporarily set MULTI_USER_MODE=true and delete them from\n"
                "  Settings -> User Management, or remove the rows via SQL.\n"
                "================================================================",
                count,
            )
    finally:
        db.close()


def _check_upload_dir():
    path = settings.upload_dir
    if not os.path.exists(path):
        try:
            os.makedirs(path, exist_ok=True)
            logger.info("Created upload directory: %s", path)
        except OSError as e:
            raise RuntimeError(
                f"Cannot create upload directory {path}: {e.strerror}. "
                "Fix the volume mount or permissions before starting."
            ) from e
    if not os.access(path, os.W_OK):
        raise RuntimeError(
            f"Upload directory {path} exists but is not writable. "
            "Fix volume permissions before starting."
        )
    logger.info("Upload directory OK: %s", path)


app = FastAPI(title="PrintVault", version="1.0.1", lifespan=lifespan, redirect_slashes=False)

# Trust X-Forwarded-For / X-Forwarded-Proto from upstream reverse proxy
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(printers.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(collections.router, prefix="/api")


@app.get("/api/health")
def health():
    upload_ok = os.path.exists(settings.upload_dir) and os.access(settings.upload_dir, os.W_OK)
    return {"status": "ok", "upload_dir": settings.upload_dir, "upload_writable": upload_ok}
