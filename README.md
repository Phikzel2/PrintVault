# PrintVault

![PrintVault](docs/screenshots/pv_dashboard_dark.png)

A self-hosted 3D print file library — your personal alternative to Printables, MakerWorld, and Thingiverse. Organize STL, 3MF, GCODE, OBJ, STEP, and AMF files with a searchable web UI, in-browser 3D viewer, per-printer GCODE management, direct push to Klipper/Moonraker printers, and one-click import from Printables, Thingiverse, and MakerWorld.

> Vibecoded with [Claude Code](https://claude.ai/code).

## Features

- **Multi-user** — JWT-based login, admin and regular users, per-user private libraries
- **Public / Private models** — models are private by default; toggle visibility per model
- **3D viewer** — rotate, zoom, and inspect STL, 3MF, and OBJ files in the browser
- **Auto thumbnails** — generated server-side on upload (CPU-only, no GPU required)
- **File support** — STL, 3MF, GCODE, OBJ, STEP, AMF
- **Moonraker integration** — push GCODE files directly to a Klipper printer via Moonraker
- **Printer profiles** — define printers (brand, build volume, Moonraker URL) and link GCODE files
- **Tags & search** — tag models and filter by tag, file type, or visibility; search bar supports keyword and `#tag` syntax with live autocomplete
- **Open in slicer** — one-click open of STL/3MF files in OrcaSlicer, Bambu Studio, PrusaSlicer, SuperSlicer, or Ultimaker Cura
- **Light / dark mode** — toggle in the header, preference persisted in localStorage
- **Mobile-friendly** — responsive layout with a collapsible search bar on small screens
- **PWA** — installable as a home-screen app via Safari (iOS) or Chrome (Android/desktop); opens fullscreen with no browser chrome
- **Source tracking** — store the original URL and license for each model
- **Import from URL** — paste a Printables, Thingiverse, or MakerWorld model URL to preview and import files directly into your library
- **GCODE metadata** — print time and filament weight from slicer headers displayed inline (PrusaSlicer, OrcaSlicer/Bambu Studio, Cura, Simplify3D)
- **Storage stats** — disk usage broken down by file type, largest models, and per-user (admin only); accessible from Settings
- **Settings** — per-user date format preference; admins manage users from the UI

## Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · SQLAlchemy |
| Database | PostgreSQL 16 |
| Frontend | React 18 · Vite · Tailwind CSS |
| 3D Viewer | Three.js · @react-three/fiber |
| Thumbnails | trimesh · matplotlib (CPU-only) |
| Container | Docker Compose |

---

## Quick Start

**Prerequisites:** Docker + Docker Compose

```bash
git clone git@github.com:Phikzel2/PrintVault.git
cd PrintVault

cp .env.example .env
# Edit .env — set strong passwords and a SECRET_KEY at minimum

docker compose up --build
```

| Service | URL |
|---|---|
| Library UI | http://localhost:3120 |
| API (Swagger docs) | http://localhost:8000/docs |

Log in with the admin credentials you set in `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

---

## Configuration

Copy `.env.example` to `.env`:

```env
# PostgreSQL
POSTGRES_DB=printvault
POSTGRES_USER=printvault
POSTGRES_PASSWORD=change-me-strong-password

# Backend
SECRET_KEY=change-me-long-random-string   # openssl rand -hex 32
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-strong-password

# CORS — set to your actual frontend URL in production
ALLOWED_ORIGINS=["https://your-domain.com"]

# Import integrations (optional)
# THINGIVERSE_TOKEN=your_app_token_here  # from https://www.thingiverse.com/developers
# MAKERWORLD_TOKEN=your_bambu_token_here  # JWT from your Bambu Lab account session
# Printables import works without a token

# Optional tuning
# MAX_FILE_SIZE_MB=500
# JWT_EXPIRE_HOURS=168
```

Generate a strong secret key:

```bash
openssl rand -hex 32
```

> All settings default to safe local-only values. **Change passwords and `SECRET_KEY` before exposing PrintVault to a network.**

---

## Usage

### Logging In

Open the UI and log in with your admin credentials. Sessions last 7 days by default (configurable via `JWT_EXPIRE_HOURS`).

![Login](docs/screenshots/pv_login.png)

### Library

![Library (light)](docs/screenshots/pv_dashboard_light.png)
![Library (dark)](docs/screenshots/pv_dashboard_dark.png)

### Importing from Printables, Thingiverse, or MakerWorld

Click **Import URL** in the header and paste any public model URL:

- `https://www.printables.com/model/12345-model-name`
- `https://www.thingiverse.com/thing:12345`
- `https://makerworld.com/en/models/12345`

PrintVault fetches the model metadata and shows a preview with name, description, license, tags, and a selectable file list. Choose which files to download and click **Import** — the model is created and files are downloaded server-side. Thumbnails are generated automatically.

**Printables** works out of the box — no token needed.

**Thingiverse** requires a free API token — register an app at [thingiverse.com/developers](https://www.thingiverse.com/developers) and add `THINGIVERSE_TOKEN=your_token` to `.env`.

**MakerWorld** requires a Bambu Lab account JWT — log in to makerworld.com, copy the Bearer token from any authenticated API request, and add `MAKERWORLD_TOKEN=your_token` to `.env`.

![Import from URL](docs/screenshots/pv_import.png)

### Adding a Model

1. Click **+ New Model** (or drag files onto the library view).
2. Upload one or more files — thumbnails are generated automatically for STL/3MF/OBJ.
3. Enter a name; optionally add a description, source URL, license, and tags.

![Add Model — Files](docs/screenshots/pv_newmodel_files.png)
![Add Model — Details](docs/screenshots/pv_newmodel_details.png)

### Model Detail

![Model detail with 3D viewer](docs/screenshots/pv_modeldetails.png)

### Managing Files

Inside a model, the **Files** tab lists all attached files. For each file you can:

- **Download** the file
- **Delete** the file
- **Assign a printer** — link a GCODE file to a printer profile
- **Send to printer** — push a GCODE file directly to a Moonraker-enabled printer (button appears when the assigned printer has a Moonraker URL configured)
- **Set as thumbnail** — use any file's auto-generated preview as the model thumbnail

### Public / Private Visibility

Models are **private by default** — only you can see them. Toggle visibility on the model detail page:

- **Private** — visible only to the owner
- **Public** — visible to all logged-in users (shown with a globe badge)

The sidebar filter lets you quickly switch between **All**, **Public**, and **Private** views.

### Printer Profiles

Go to **Settings → Manage Printers** to manage printer profiles.

Each printer can have:

| Field | Description |
|---|---|
| Name | Display name (required) |
| Brand / Model | e.g. Bambu Lab / X1 Carbon |
| Build volume | X × Y × Z in mm |
| Moonraker URL | e.g. `http://192.168.1.100:7125` — enables direct GCODE push |
| Notes | Free-text notes |

Once a printer has a **Moonraker URL**, a send button appears next to any GCODE file assigned to that printer. PrintVault proxies the upload to Moonraker's `/server/files/upload` endpoint — no direct browser-to-printer connection needed.

### Tags & Search

- **Keyword search** — type any text and press Enter to search model names
- **Tag search** — type `#` in the search bar to get a live autocomplete dropdown of your tags; select one to filter immediately. Example: `mounting plate #functional` searches titles for "mounting plate" and filters by the "functional" tag
- **Multiple tags** — combine tags in one query: `#functional #enclosureparts`
- **Sidebar filters** — click any tag, file type, or visibility filter; the search bar stays in sync with the active filters
- Combine all filters freely for precise results

![Search with tags](docs/screenshots/pv_search.png)

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `n` | Open the **Add New Model** dialog |
| `i` | Open the **Import URL** dialog |
| `/` or `Ctrl+K` | Focus the search bar |
| `Esc` | Close the active modal or dialog |

Shortcuts are ignored when focus is inside an input, textarea, or select.

### Settings

Click your username in the top-right corner and select **Settings** from the dropdown. The page is organized into cards:

**Printers** — opens the printer profile manager (see [Printer Profiles](#printer-profiles)).

**Storage** — opens the storage stats page showing total disk usage, breakdown by file type, largest models, and per-user usage (admins only).

**Preferences**
- **Date format** — choose DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD; applied to all dates in the UI

**Change Password**
- Enter your current password and a new password (minimum 6 characters) to update your credentials.

**User Management** *(admin only)*
- **List users** — click "Load users" to see all accounts with their admin status
- **Create users** — provide a username and password to add a new account
- **Delete users** — removes the user; their private models and files are deleted from disk; their public models are kept (owner set to null)

---

## Architecture

```
PrintVault/
├── backend/                  # FastAPI app
│   └── app/
│       ├── main.py           # App entry, CORS, startup hooks
│       ├── models.py         # SQLAlchemy ORM models
│       ├── schemas.py        # Pydantic request/response schemas
│       ├── auth.py           # JWT auth, password hashing
│       ├── config.py         # Pydantic settings (env vars)
│       ├── database.py       # SQLAlchemy engine + session
│       ├── thumbnail.py      # CPU thumbnail generator (trimesh)
│       └── routers/
│           ├── auth.py       # Login, /me
│           ├── users.py      # User CRUD, settings, password
│           ├── models.py     # Model CRUD, pagination, search, visibility
│           ├── files.py      # Upload, download, delete, Moonraker proxy, GCODE metadata
│           ├── imports.py    # URL import from Printables, Thingiverse, MakerWorld
│           ├── stats.py      # Storage stats aggregation
│           ├── printers.py   # Printer profile CRUD
│           └── tags.py       # Tag listing
├── frontend/                 # React SPA (Vite + Tailwind)
│   └── src/
│       ├── pages/            # Home · ModelDetail · Printers · Settings · Storage
│       ├── components/       # Header · ModelCard · FilesSection · ModelViewer · Modals
│       ├── context/          # AuthContext (JWT + user state) · ThemeContext (light/dark)
│       ├── api/client.ts     # Axios client with Bearer interceptor
│       └── types/index.ts    # Shared TypeScript interfaces
├── .env.example              # Environment variable reference
└── docker-compose.yml
```

### File storage

```
/data/uploads/models/{model_id}/
  thumbnail.jpg
  files/{uuid}.stl
  files/{uuid}.gcode
  ...
```

### Database schema

| Table | Key columns |
|---|---|
| **users** | id, username, hashed_password, is_admin, settings (JSON), created_at |
| **print_models** | id, name, description, source_url, license, thumbnail_path, is_public, owner_id → users, timestamps |
| **model_files** | id, model_id → print_models, filename, file_type, file_size, printer_id → printers, source_file_id (self-ref) |
| **printers** | id, name, brand, model_name, build_volume_x/y/z, moonraker_url, notes |
| **tags** + **model_tags** | many-to-many tag relationship |

---

## API

Full interactive docs at `/api/docs` when the backend is running.

```
# Auth
POST   /api/auth/login              Login (OAuth2 form) → JWT token
GET    /api/auth/me                 Current user

# Users (admin only for list/create/delete)
GET    /api/users                   List users
POST   /api/users                   Create user
DELETE /api/users/{id}              Delete user
PUT    /api/users/me/settings       Update own settings
PUT    /api/users/me/password       Change own password

# Models
GET    /api/models                  List (search, tag, file_type, visibility, pagination)
POST   /api/models                  Create model
GET    /api/models/{id}             Get model with files and tags
PUT    /api/models/{id}             Update model
DELETE /api/models/{id}             Delete model + files from disk
POST   /api/models/{id}/visibility  Toggle public/private
GET    /api/models/{id}/thumbnail   Thumbnail image (public)

# Files
POST   /api/models/{id}/files       Upload file (multipart)
GET    /api/files/{id}/download     Download file (public)
DELETE /api/files/{id}              Delete file
PATCH  /api/files/{id}/printer      Assign/unassign printer
PATCH  /api/files/{id}/source       Assign source file (slicer input)
POST   /api/files/{id}/send         Push GCODE to Moonraker
GET    /api/files/{id}/metadata     GCODE slicer metadata (print time, filament weight)

# Stats
GET    /api/stats/storage           Disk usage (by type, top models, by user for admins)

# Printers
GET    /api/printers                List printers
POST   /api/printers                Create printer
PUT    /api/printers/{id}           Update printer
DELETE /api/printers/{id}           Delete printer

# Tags
GET    /api/tags                    List all tags

# Import
POST   /api/import/preview          Fetch model metadata from a URL (no DB changes)
POST   /api/import/confirm          Create model and download selected files

# Health
GET    /api/health                  Liveness + upload dir status
```

---

## Supported File Types

| Extension | Type | 3D Preview | Auto Thumbnail |
|---|---|---|---|
| `.stl` | STL | ✅ | ✅ |
| `.3mf` | 3MF | ✅ | ✅ |
| `.obj` | OBJ | ✅ | ✅ |
| `.gcode` `.gc` `.gco` | GCODE | — | — |
| `.step` `.stp` | STEP | — | — |
| `.amf` | AMF | — | — |

---

## Development

**Backend** (outside Docker):

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://printvault:printvault@localhost:5432/printvault \
UPLOAD_DIR=./uploads \
SECRET_KEY=dev-secret \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=admin \
uvicorn app.main:app --reload
```

**Frontend** (outside Docker):

```bash
cd frontend
npm install
npm run dev
# Vite proxies /api → http://localhost:8000
```

---

## Data Persistence

PostgreSQL data and uploaded files live in Docker bind mounts under `./data/`:

```
./data/postgres/    — database files
./data/uploads/     — model files and thumbnails
```

Both survive `docker compose down` and are only removed if you delete the `./data/` directory manually.

---

## License

MIT
