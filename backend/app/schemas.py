from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TagBase(BaseModel):
    name: str


class TagCreate(TagBase):
    pass


class Tag(TagBase):
    id: int

    class Config:
        from_attributes = True


class PrinterBase(BaseModel):
    name: str
    brand: Optional[str] = None
    model_name: Optional[str] = None
    build_volume_x: Optional[float] = None
    build_volume_y: Optional[float] = None
    build_volume_z: Optional[float] = None
    notes: Optional[str] = None


class PrinterCreate(PrinterBase):
    pass


class Printer(PrinterBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ModelFileBase(BaseModel):
    original_filename: str
    file_type: str
    file_size: Optional[int] = None
    printer_id: Optional[int] = None


class ModelFile(ModelFileBase):
    id: int
    model_id: int
    filename: str
    file_path: str
    created_at: datetime
    printer: Optional[Printer] = None

    class Config:
        from_attributes = True


class PrintModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None


class PrintModelCreate(PrintModelBase):
    tags: list[str] = []


class PrintModelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None
    tags: Optional[list[str]] = None


class PrintModel(PrintModelBase):
    id: int
    thumbnail_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    files: list[ModelFile] = []
    tags: list[Tag] = []

    class Config:
        from_attributes = True


class PrintModelSummary(PrintModelBase):
    id: int
    thumbnail_path: Optional[str] = None
    created_at: datetime
    tags: list[Tag] = []
    file_count: int = 0
    stl_count: int = 0
    threemf_count: int = 0
    gcode_count: int = 0

    class Config:
        from_attributes = True


class PaginatedModels(BaseModel):
    items: list[PrintModelSummary]
    total: int
    page: int
    page_size: int
    pages: int
