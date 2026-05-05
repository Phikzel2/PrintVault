import logging
import re
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..thumbnail import generate_thumbnail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])

FILE_TYPE_MAP = {
    ".stl": "STL",
    ".3mf": "3MF",
    ".gcode": "GCODE",
    ".gc": "GCODE",
    ".gco": "GCODE",
    ".obj": "OBJ",
    ".step": "STEP",
    ".stp": "STEP",
    ".amf": "AMF",
}


class ImportFile(BaseModel):
    name: str
    download_url: str
    size: int | None = None
    file_type: str


class ImportPreview(BaseModel):
    platform: str
    name: str
    description: str | None = None
    source_url: str
    license: str | None = None
    tags: list[str] = []
    files: list[ImportFile] = []


class PreviewRequest(BaseModel):
    url: str


class ImportRequest(BaseModel):
    name: str
    description: str | None = None
    source_url: str
    license: str | None = None
    tags: list[str] = []
    files: list[ImportFile]


def _file_type(filename: str) -> str:
    return FILE_TYPE_MAP.get(Path(filename).suffix.lower(), "OTHER")


def _detect_platform(url: str) -> tuple[str, str]:
    if m := re.search(r"thingiverse\.com/thing:(\d+)", url):
        return "thingiverse", m.group(1)
    if m := re.search(r"printables\.com/model/(\d+)", url):
        return "printables", m.group(1)
    raise HTTPException(400, "Unsupported URL. Paste a Thingiverse or Printables model URL.")


async def _fetch_thingiverse(thing_id: str) -> ImportPreview:
    if not settings.thingiverse_token:
        raise HTTPException(400, "Thingiverse import requires THINGIVERSE_TOKEN to be set")
    headers = {"Authorization": f"Bearer {settings.thingiverse_token}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"https://api.thingiverse.com/things/{thing_id}", headers=headers)
        if r.status_code == 404:
            raise HTTPException(404, "Thingiverse model not found")
        r.raise_for_status()
        thing = r.json()

        r2 = await client.get(f"https://api.thingiverse.com/things/{thing_id}/files", headers=headers)
        r2.raise_for_status()
        files_raw = r2.json()

    files = [
        ImportFile(
            name=f["name"],
            download_url=f["download_url"],
            size=f.get("size"),
            file_type=_file_type(f["name"]),
        )
        for f in files_raw
        if f.get("download_url")
    ]
    return ImportPreview(
        platform="Thingiverse",
        name=thing.get("name", f"Thing {thing_id}"),
        description=thing.get("description"),
        source_url=f"https://www.thingiverse.com/thing:{thing_id}",
        license=thing.get("license"),
        tags=[t["name"] for t in thing.get("tags", [])],
        files=files,
    )


_PRINTABLES_CDN = "https://media.printables.com"
_UUID_RE = re.compile(r"media/prints/([0-9a-f-]{36})/", re.IGNORECASE)


async def _fetch_printables(model_id: str) -> ImportPreview:
    query = """
    query PrintDetail($id: ID!) {
      print(id: $id) {
        id
        name
        description
        summary
        license { name }
        tags { name }
        stls { id name fileSize filePreviewPath folder }
        gcodes { id name fileSize folder }
        slas { id name fileSize filePreviewPath folder }
      }
    }
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.printables.com/graphql/",
            json={"query": query, "variables": {"id": model_id}},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        if not r.is_success:
            logger.error("Printables API %s: %s", r.status_code, r.text[:500])
            raise HTTPException(502, f"Printables API error ({r.status_code}): {r.text[:200]}")

    body = r.json()
    if errors := body.get("errors"):
        raise HTTPException(400, errors[0].get("message", "Printables API error"))

    p = (body.get("data") or {}).get("print")
    if not p:
        raise HTTPException(404, "Printables model not found or is private")

    # Log raw file data so we can inspect the actual CDN structure
    for f in (p.get("stls") or [])[:2]:
        logger.info("STL raw: %s", f)
    for f in (p.get("gcodes") or [])[:2]:
        logger.info("GCODE raw: %s", f)

    # Printables CDN path structure:
    #   previews/{file_uuid}.png   ← what filePreviewPath contains
    #   stls/{file_uuid}.{ext}     ← actual source file (same UUID, different ext)
    # Extract model UUID and per-file UUID from each file's filePreviewPath.
    _FILE_UUID_RE = re.compile(r"media/prints/([0-9a-f-]{36})/previews/([0-9a-f-]{36})", re.IGNORECASE)

    def _stl_url(preview_path: str, filename: str) -> str | None:
        m = _FILE_UUID_RE.search(preview_path or "")
        if not m:
            return None
        model_uuid, file_uuid = m.group(1), m.group(2)
        ext = Path(filename).suffix.lower()
        return f"{_PRINTABLES_CDN}/media/prints/{model_uuid}/stls/{file_uuid}{ext}"

    # Extract model UUID for GCODE files (no preview path available)
    model_uuid: str | None = None
    for f in (p.get("stls") or []) + (p.get("slas") or []):
        if m := _UUID_RE.search(f.get("filePreviewPath") or ""):
            model_uuid = m.group(1)
            break

    files: list[ImportFile] = []
    for f in (p.get("stls") or []):
        url = _stl_url(f.get("filePreviewPath"), f["name"])
        if url:
            files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="STL"))
        else:
            logger.warning("No filePreviewPath for STL %s — skipping", f["name"])
    for f in (p.get("gcodes") or []):
        if model_uuid:
            # GCODEs have no preview; use model UUID + integer ID as best guess
            url = f"{_PRINTABLES_CDN}/media/prints/{model_uuid}/gcodes/{f['id']}/{f['name']}"
            files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="GCODE"))
    for f in (p.get("slas") or []):
        url = _stl_url(f.get("filePreviewPath"), f["name"])
        if url:
            files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="STL"))
        else:
            logger.warning("No filePreviewPath for SLA %s — skipping", f["name"])

    license_name = (p.get("license") or {}).get("name")
    description = p.get("description") or p.get("summary")

    return ImportPreview(
        platform="Printables",
        name=p.get("name", f"Model {model_id}"),
        description=description,
        source_url=f"https://www.printables.com/model/{model_id}",
        license=license_name,
        tags=[t["name"] for t in (p.get("tags") or [])],
        files=files,
    )


@router.post("/preview", response_model=ImportPreview)
async def preview_import(
    body: PreviewRequest,
    current_user: models.User = Depends(get_current_user),
):
    platform, model_id = _detect_platform(body.url.strip())
    try:
        if platform == "thingiverse":
            return await _fetch_thingiverse(model_id)
        return await _fetch_printables(model_id)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(504, "Timeout fetching model info — try again")
    except httpx.ConnectError:
        raise HTTPException(502, "Cannot connect to external platform")
    except Exception as e:
        logger.error("Import preview error: %s", e)
        raise HTTPException(502, f"Failed to fetch model info: {e}")


@router.post("/confirm", response_model=schemas.PrintModel, status_code=201)
async def confirm_import(
    data: ImportRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not data.files:
        raise HTTPException(400, "Select at least one file to import")

    db_model = models.PrintModel(
        name=data.name,
        description=data.description or None,
        source_url=data.source_url or None,
        license=data.license or None,
        owner_id=current_user.id,
        is_public=False,
    )
    db.add(db_model)
    db.flush()

    for tag_name in data.tags:
        tag_name = tag_name.strip().lower()
        if not tag_name:
            continue
        tag = db.query(models.Tag).filter(models.Tag.name == tag_name).first()
        if not tag:
            tag = models.Tag(name=tag_name)
            db.add(tag)
            db.flush()
        if tag not in db_model.tags:
            db_model.tags.append(tag)

    db.commit()
    db.refresh(db_model)

    model_dir = Path(settings.upload_dir) / "models" / str(db_model.id) / "files"
    model_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = settings.max_file_size_mb * 1024 * 1024
    thumbnail_set = False

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        for f in data.files:
            ext = Path(f.name).suffix.lower() or ".bin"
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = model_dir / unique_name

            logger.info("Downloading %s from %s", f.name, f.download_url)
            try:
                r = await client.get(f.download_url)
                r.raise_for_status()
                content = r.content
            except Exception as e:
                logger.warning("Skipping %s — download failed: %s | url: %s", f.name, e, f.download_url)
                continue

            if not content or len(content) > max_bytes:
                logger.warning("Skipping %s — empty or too large (%d bytes)", f.name, len(content))
                continue

            file_path.write_bytes(content)

            db_file = models.ModelFile(
                model_id=db_model.id,
                filename=unique_name,
                original_filename=f.name,
                file_type=f.file_type,
                file_path=str(file_path),
                file_size=len(content),
            )
            db.add(db_file)
            db.commit()

            if not thumbnail_set and f.file_type in ("STL", "3MF", "OBJ"):
                import time
                thumb_path = str(Path(settings.upload_dir) / "models" / str(db_model.id) / "thumbnail.jpg")
                if generate_thumbnail(str(file_path), thumb_path):
                    db_model.thumbnail_path = f"/api/models/{db_model.id}/thumbnail?v={int(time.time())}"
                    db.commit()
                    thumbnail_set = True

    db.refresh(db_model)
    return db_model
