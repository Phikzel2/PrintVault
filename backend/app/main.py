import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import models, files, printers, tags, auth, users, imports, stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _seed_admin()
    _check_upload_dir()
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


def _check_upload_dir():
    path = settings.upload_dir
    if not os.path.exists(path):
        try:
            os.makedirs(path, exist_ok=True)
            logger.info("Created upload directory: %s", path)
        except OSError as e:
            logger.error("UPLOAD DIR ERROR: Cannot create %s — %s", path, e)
            return
    if os.access(path, os.W_OK):
        logger.info("Upload directory OK: %s", path)
    else:
        logger.error("UPLOAD DIR ERROR: %s exists but is NOT writable. Fix volume permissions.", path)


app = FastAPI(title="PrintVault", version="2.0.0", lifespan=lifespan, redirect_slashes=False)

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


@app.get("/api/health")
def health():
    upload_ok = os.path.exists(settings.upload_dir) and os.access(settings.upload_dir, os.W_OK)
    return {"status": "ok", "upload_dir": settings.upload_dir, "upload_writable": upload_ok}
