from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import models, files, printers, tags

Base.metadata.create_all(bind=engine)

app = FastAPI(title="STL Library", version="1.0.0")

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
    return {"status": "ok"}
