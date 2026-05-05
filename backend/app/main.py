import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .database import Base, engine
from .routers import models, files, printers, tags, auth, users

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate(engine)
    _seed_admin()
    _check_upload_dir()
    yield


def _migrate(engine):
    """Apply additive schema changes that create_all won't handle."""
    with engine.connect() as conn:
        # v2: GCODE → source file linking
        try:
            conn.execute(text(
                "ALTER TABLE model_files ADD COLUMN source_file_id INTEGER "
                "REFERENCES model_files(id) ON DELETE SET NULL"
            ))
            conn.commit()
            logger.info("Migration: added model_files.source_file_id")
        except Exception:
            pass

        # v3: auth — owner_id and is_public on print_models
        try:
            conn.execute(text(
                "ALTER TABLE print_models ADD COLUMN owner_id INTEGER "
                "REFERENCES users(id) ON DELETE SET NULL"
            ))
            conn.commit()
            logger.info("Migration: added print_models.owner_id")
        except Exception:
            pass

        try:
            conn.execute(text(
                "ALTER TABLE print_models ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            conn.execute(text(
                "UPDATE print_models SET is_public = TRUE WHERE owner_id IS NULL"
            ))
            conn.commit()
            logger.info("Migration: added print_models.is_public")
        except Exception:
            pass


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
            db.flush()
            # Assign orphaned models to admin
            db.query(db_models.PrintModel).filter(
                db_models.PrintModel.owner_id == None  # noqa: E711
            ).update({"owner_id": admin.id})
            db.commit()
            logger.info("Created admin user: %s", settings.admin_username)
        else:
            # Assign any remaining orphaned models to first admin
            admin = db.query(db_models.User).filter(db_models.User.is_admin == True).first()  # noqa: E712
            if admin:
                count = db.query(db_models.PrintModel).filter(
                    db_models.PrintModel.owner_id == None  # noqa: E711
                ).update({"owner_id": admin.id})
                if count:
                    db.commit()
                    logger.info("Assigned %d orphaned models to admin %s", count, admin.username)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(printers.router, prefix="/api")
app.include_router(tags.router, prefix="/api")


@app.get("/api/health")
def health():
    upload_ok = os.path.exists(settings.upload_dir) and os.access(settings.upload_dir, os.W_OK)
    return {"status": "ok", "upload_dir": settings.upload_dir, "upload_writable": upload_ok}
