import io
import logging
import re
import time
import uuid
import zipfile
from pathlib import Path

import html2text
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..config import settings
from ..constants import detect_file_type
from ..database import get_db
from ..thumbnail import generate_thumbnails

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/import", tags=["import"])


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
    thumbnail_url: str | None = None


class PreviewRequest(BaseModel):
    url: str


class ImportRequest(BaseModel):
    name: str
    description: str | None = None
    source_url: str
    license: str | None = None
    tags: list[str] = []
    files: list[ImportFile]
    thumbnail_url: str | None = None


def _html_to_markdown(html: str | None) -> str | None:
    if not html:
        return html
    # Pure plain-text / Markdown — no HTML tags at all, return as-is.
    if not re.search(r"<[a-zA-Z][^>]*>", html):
        return html.strip() or None
    # Mixed content (e.g. Thingiverse): plain-text newlines + occasional HTML tags.
    # Convert bare \n to <br> first so html2text doesn't collapse them as whitespace.
    processed = html.replace("\n", "<br>")
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.body_width = 0
    result = h.handle(processed).strip()
    # html2text escapes dashes at line starts (e.g. \- M3) to prevent them from
    # being treated as Markdown list items — but they ARE list items, so unescape.
    result = result.replace("\\-", "-")
    # Collapse any excessive blank lines that <br> sequences can produce
    return re.sub(r"\n{3,}", "\n\n", result) or None


def _detect_platform(url: str) -> tuple[str, str]:
    if m := re.search(r"thingiverse\.com/thing:(\d+)", url):
        return "thingiverse", m.group(1)
    if m := re.search(r"printables\.com/model/(\d+)", url):
        return "printables", m.group(1)
    if m := re.search(r"makerworld\.com(?:/[a-z-]+)?/models/(\d+)", url):
        return "makerworld", m.group(1)
    raise HTTPException(400, "Unsupported URL. Paste a Thingiverse, Printables, or MakerWorld model URL.")


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
            file_type=detect_file_type(f["name"]),
        )
        for f in files_raw
        if f.get("download_url")
    ]
    thumb_url = thing.get("thumbnail") or (thing.get("default_image") or {}).get("url")
    return ImportPreview(
        platform="Thingiverse",
        name=thing.get("name", f"Thing {thing_id}"),
        description=_html_to_markdown(thing.get("description")),
        source_url=f"https://www.thingiverse.com/thing:{thing_id}",
        license=thing.get("license"),
        tags=[t["name"] for t in thing.get("tags", [])],
        files=files,
        thumbnail_url=thumb_url or None,
    )


_DOWNLOAD_MUTATION = """
mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, $source: DownloadSourceEnum!) {
  getDownloadLink(id: $id, printId: $modelId, fileType: $fileType, source: $source) {
    ok
    output { link }
  }
}
"""

_DETAIL_QUERY = """
query PrintDetail($id: ID!) {
  print(id: $id) {
    id name description summary
    license { name }
    tags { name }
    image { filePath }
    stls { id name fileSize }
    gcodes { id name fileSize }
    slas { id name fileSize }
  }
}
"""

_GQL = "https://api.printables.com/graphql/"
_GQL_HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}


async def _printables_download_url(client: httpx.AsyncClient, file_id: str, model_id: str, file_type: str) -> str | None:
    r = await client.post(_GQL, json={
        "query": _DOWNLOAD_MUTATION,
        "variables": {"id": file_id, "modelId": model_id, "fileType": file_type, "source": "model_detail"},
    }, headers=_GQL_HEADERS)
    if not r.is_success:
        return None
    result = (r.json().get("data") or {}).get("getDownloadLink") or {}
    return (result.get("output") or {}).get("link")


# Sentinel URL scheme for files that live inside a MakerWorld all.zip bundle.
# `confirm_import` recognises it and re-fetches a fresh zip URL (the upstream
# signed URLs are valid for ~5 minutes), then extracts the requested entry.
MAKERWORLD_ZIP_PREFIX = "makerworld-zip://"


def _makerworld_headers() -> dict[str, str]:
    # Bearer header works on api endpoints; do NOT also send the cookie or
    # MakerWorld returns 403 "Please log in to download models" — sending both
    # forms of auth confuses their validator.
    return {
        "Authorization": f"Bearer {settings.makerworld_token}",
        "Accept": "*/*",
        "x-bbl-app-source": "makerworld",
        "x-bbl-client-name": "MakerWorld",
        "x-bbl-client-type": "web",
        "x-bbl-client-version": "00.00.00.01",
    }


async def _makerworld_zip_url(client: httpx.AsyncClient, design_id: str) -> str:
    r = await client.get(
        f"https://makerworld.com/api/v1/design-service/design/{design_id}/model"
        "?modelType=all&type=download",
        headers=_makerworld_headers(),
    )
    if r.status_code == 401:
        raise HTTPException(401, "Invalid MAKERWORLD_TOKEN — update it in .env")
    if r.status_code == 403:
        raise HTTPException(403, "MakerWorld refused the download — token may be expired")
    r.raise_for_status()
    data = r.json()
    url = data.get("url")
    if not url:
        raise HTTPException(502, "MakerWorld did not return a download URL")
    return url


async def _fetch_makerworld(design_id: str) -> ImportPreview:
    if not settings.makerworld_token:
        raise HTTPException(400, "MakerWorld import requires MAKERWORLD_TOKEN to be set in .env")

    headers = _makerworld_headers()
    files: list[ImportFile] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(
            f"https://makerworld.com/api/v1/design-service/design/{design_id}",
            headers=headers,
        )
        if r.status_code == 401:
            raise HTTPException(401, "Invalid MAKERWORLD_TOKEN — update it in .env")
        if r.status_code == 404:
            raise HTTPException(404, "MakerWorld model not found")
        r.raise_for_status()
        design = r.json()

        # Best-effort file listing. MakerWorld's `/model?modelType=all` endpoint
        # frequently returns HTTP 418 with a captcha challenge for server-side
        # callers — the Cloudflare `cf_clearance` cookie that a browser obtains
        # is IP-bound and can't be reused here. If it fails, return the
        # metadata anyway so the user can create the model with title /
        # description / tags / cover and add the files manually.
        try:
            zip_url = await _makerworld_zip_url(client, design_id)
            zr = await client.get(zip_url)
            zr.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(zr.content)) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    files.append(ImportFile(
                        name=info.filename,
                        # Sentinel — confirm_import re-fetches the zip and extracts this entry.
                        download_url=f"{MAKERWORLD_ZIP_PREFIX}{design_id}/{info.filename}",
                        size=info.file_size,
                        file_type=detect_file_type(info.filename),
                    ))
        except Exception as e:
            logger.warning(
                "MakerWorld file list unavailable for design %s (likely bot-detection): %s",
                design_id, e,
            )

    name = design.get("title") or design.get("name") or f"Model {design_id}"
    description = _html_to_markdown(design.get("description") or design.get("summary"))
    cover_url = design.get("cover") or design.get("coverUrl") or design.get("cover_url")
    raw_tags = design.get("tags") or []
    tags = [t["name"] if isinstance(t, dict) else str(t) for t in raw_tags]
    raw_license = design.get("license")
    license_name = raw_license.get("name") if isinstance(raw_license, dict) else raw_license

    return ImportPreview(
        platform="MakerWorld",
        name=name,
        description=description,
        source_url=f"https://makerworld.com/en/models/{design_id}",
        license=license_name,
        tags=tags,
        files=files,
        thumbnail_url=cover_url or None,
    )


async def _fetch_printables(model_id: str) -> ImportPreview:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            _GQL,
            json={"query": _DETAIL_QUERY, "variables": {"id": model_id}},
            headers=_GQL_HEADERS,
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

        files: list[ImportFile] = []
        for f in (p.get("stls") or []):
            url = await _printables_download_url(client, f["id"], model_id, "stl")
            if url:
                files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="STL"))
            else:
                logger.warning("No download link for STL %s", f["name"])
        for f in (p.get("gcodes") or []):
            url = await _printables_download_url(client, f["id"], model_id, "gcode")
            if url:
                files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="GCODE"))
        for f in (p.get("slas") or []):
            url = await _printables_download_url(client, f["id"], model_id, "sla")
            if url:
                files.append(ImportFile(name=f["name"], download_url=url, size=f.get("fileSize"), file_type="STL"))

    license_name = (p.get("license") or {}).get("name")
    description = _html_to_markdown(p.get("description") or p.get("summary"))
    image_path = (p.get("image") or {}).get("filePath")
    thumb_url = f"https://media.printables.com/{image_path}" if image_path else None

    return ImportPreview(
        platform="Printables",
        name=p.get("name", f"Model {model_id}"),
        description=description,
        source_url=f"https://www.printables.com/model/{model_id}",
        license=license_name,
        tags=[t["name"] for t in (p.get("tags") or [])],
        files=files,
        thumbnail_url=thumb_url,
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
        if platform == "makerworld":
            return await _fetch_makerworld(model_id)
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
    # Empty files is allowed — metadata-only imports happen when MakerWorld
    # bot-detection blocks the file list. User can add files manually after.

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
        if data.thumbnail_url:
            try:
                from PIL import Image
                r = await client.get(data.thumbnail_url)
                if r.is_success and "image" in r.headers.get("content-type", ""):
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                    img.thumbnail((1200, 900))
                    thumb_path = Path(settings.upload_dir) / "models" / str(db_model.id) / "thumbnail.jpg"
                    thumb_path.parent.mkdir(parents=True, exist_ok=True)
                    buf = io.BytesIO()
                    img.save(buf, "JPEG", quality=85)
                    thumb_path.write_bytes(buf.getvalue())
                    db_model.thumbnail_path = f"/api/models/{db_model.id}/thumbnail?v={int(time.time())}"
                    db.commit()
                    thumbnail_set = True
            except Exception as e:
                logger.warning("Could not download platform thumbnail: %s", e)

        # MakerWorld imports share a single zip — fetch it once, lazily, and
        # extract each requested entry. Keyed by design_id so a single import
        # batch only downloads once.
        makerworld_zips: dict[str, bytes] = {}

        async def _resolve_makerworld_entry(sentinel: str) -> bytes:
            # Format: makerworld-zip://{design_id}/{filename...}
            rest = sentinel[len(MAKERWORLD_ZIP_PREFIX):]
            design_id, _, entry_name = rest.partition("/")
            if design_id not in makerworld_zips:
                zip_url = await _makerworld_zip_url(client, design_id)
                zr = await client.get(zip_url)
                zr.raise_for_status()
                makerworld_zips[design_id] = zr.content
            with zipfile.ZipFile(io.BytesIO(makerworld_zips[design_id])) as zf:
                return zf.read(entry_name)

        for f in data.files:
            ext = Path(f.name).suffix.lower() or ".bin"
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = model_dir / unique_name

            logger.info("Downloading %s from %s", f.name, f.download_url)
            try:
                if f.download_url.startswith(MAKERWORLD_ZIP_PREFIX):
                    content = await _resolve_makerworld_entry(f.download_url)
                else:
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
                thumb_dir = str(Path(settings.upload_dir) / "models" / str(db_model.id))
                if generate_thumbnails(str(file_path), thumb_dir):
                    db_model.thumbnail_path = f"/api/models/{db_model.id}/thumbnail?v={int(time.time())}"
                    db.commit()
                    thumbnail_set = True

    db.refresh(db_model)
    return db_model
