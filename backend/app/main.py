import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import models, files, printers, tags

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _check_upload_dir()
    yield


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


app = FastAPI(title="PrintVault", version="1.0.0", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(printers.router, prefix="/api")
app.include_router(tags.router, prefix="/api")


@app.get("/api/health")
def health():
    upload_ok = os.path.exists(settings.upload_dir) and os.access(settings.upload_dir, os.W_OK)
    return {"status": "ok", "upload_dir": settings.upload_dir, "upload_writable": upload_ok}
