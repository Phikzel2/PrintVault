# STL Library

A self-hosted 3D print file library — your personal alternative to Printables, MakerWorld, and Thingiverse. Organize STL, 3MF, GCODE, OBJ, STEP, and AMF files with a searchable web UI, in-browser 3D viewer, and per-printer GCODE management.

## Features

- **3D viewer** — Rotate, zoom, and inspect STL and 3MF files directly in the browser
- **Auto thumbnails** — Generated server-side from STL/3MF/OBJ on upload (no GPU required)
- **File support** — STL, 3MF, GCODE, OBJ, STEP, AMF
- **Printer profiles** — Define your printers and link GCODE files to them
- **Tags & search** — Tag models and filter by tag, file type, or keyword
- **Source tracking** — Store the original URL and license for each model

## Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · SQLAlchemy |
| Database | PostgreSQL 16 |
| Frontend | React 18 · Vite · Tailwind CSS |
| 3D Viewer | Three.js · @react-three/fiber |
| Thumbnails | trimesh · matplotlib (CPU-only) |
| Container | Docker Compose |

## Quick Start

**Prerequisites:** Docker + Docker Compose

```bash
git clone <your-repo-url>
cd STLLibrary

cp .env.example .env
# Edit .env — at minimum set a strong POSTGRES_PASSWORD and SECRET_KEY

docker compose up --build
```

| Service | URL |
|---|---|
| Library UI | http://localhost:3000 |
| API (+ Swagger docs) | http://localhost:8000/docs |

## Configuration

Copy `.env.example` to `.env` and edit:

```env
POSTGRES_DB=stlibrary
POSTGRES_USER=stlibrary
POSTGRES_PASSWORD=changeme        # change this
SECRET_KEY=changeme-use-a-long-random-string  # change this
```

All settings have safe defaults for local use. Change passwords before exposing to a network.

## Architecture

```
STLLibrary/
├── backend/                  # FastAPI app
│   └── app/
│       ├── main.py           # App entry + CORS
│       ├── models.py         # SQLAlchemy models
│       ├── schemas.py        # Pydantic schemas
│       ├── thumbnail.py      # trimesh thumbnail generator
│       └── routers/
│           ├── models.py     # Model CRUD + pagination + search
│           ├── files.py      # File upload / download / delete
│           ├── printers.py   # Printer profile CRUD
│           └── tags.py       # Tag listing
├── frontend/                 # React SPA
│   └── src/
│       ├── pages/            # Home · ModelDetail · Printers
│       ├── components/       # Header · ModelCard · ModelViewer · UploadModal · AddFilesModal
│       ├── api/client.ts     # Axios API client
│       └── types/index.ts    # Shared TypeScript types
└── docker-compose.yml
```

### File storage

Files are stored on a Docker volume mounted at `/data/uploads`:

```
/data/uploads/models/{model_id}/
  thumbnail.jpg
  files/{uuid}.stl
  files/{uuid}.3mf
  files/{uuid}.gcode
  ...
```

### Database schema

- **print_models** — name, description, source URL, license, thumbnail path, timestamps
- **model_files** — file metadata, type, storage path, optional `printer_id` for GCODE
- **printers** — name, brand, build volume (X/Y/Z mm), notes
- **tags** + **model_tags** — many-to-many tag relationship

## API

Full OpenAPI documentation available at `/docs` when the backend is running.

Key endpoints:

```
GET    /api/models              List models (search, tag, file_type, pagination)
POST   /api/models              Create model
GET    /api/models/{id}         Get model with files and tags
PUT    /api/models/{id}         Update model
DELETE /api/models/{id}         Delete model + files from disk

POST   /api/models/{id}/files   Upload file (multipart)
GET    /api/models/{id}/thumbnail  Serve thumbnail image
GET    /api/files/{id}/download Download file
DELETE /api/files/{id}          Delete file
PATCH  /api/files/{id}/printer  Assign/unassign printer to GCODE file

GET    /api/printers            List printers
POST   /api/printers            Create printer
PUT    /api/printers/{id}       Update printer
DELETE /api/printers/{id}       Delete printer

GET    /api/tags                List all tags
```

## Supported File Types

| Extension | Type | 3D Preview |
|---|---|---|
| `.stl` | STL | ✅ |
| `.3mf` | 3MF | ✅ |
| `.gcode` `.gc` `.gco` | GCODE | — |
| `.obj` | OBJ | — (stored, thumbnail generated) |
| `.step` `.stp` | STEP | — |
| `.amf` | AMF | — |

## Development

To run the backend locally (outside Docker):

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://stlibrary:stlibrary@localhost:5432/stlibrary \
UPLOAD_DIR=./uploads \
uvicorn app.main:app --reload
```

To run the frontend locally:

```bash
cd frontend
npm install
# Edit vite.config.ts proxy target to http://localhost:8000
npm run dev
```

## Data Persistence

Both PostgreSQL data and uploaded files are stored in named Docker volumes (`postgres_data`, `uploads_data`). They survive `docker compose down` and are only removed with `docker compose down -v`.

## License

MIT
