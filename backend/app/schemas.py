from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class UserSettings(BaseModel):
    date_format: str = "DD/MM/YYYY"


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: int
    is_admin: bool
    settings: UserSettings
    created_at: datetime
    # Server-config flag piggybacking on the user payload so the frontend
    # has it as soon as it knows the current user.
    multi_user_mode: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


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
    moonraker_url: Optional[str] = None


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
    source_file_id: Optional[int] = None


class ModelFile(ModelFileBase):
    id: int
    model_id: int
    filename: str
    created_at: datetime
    printer: Optional[Printer] = None

    class Config:
        from_attributes = True


class PrintModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()


class PrintModelCreate(PrintModelBase):
    tags: list[str] = []


class PrintModelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None
    tags: Optional[list[str]] = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("name must not be blank")
        return v.strip() if v is not None else v


class PrintModel(PrintModelBase):
    id: int
    thumbnail_path: Optional[str] = None
    is_public: bool = False
    owner_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    files: list[ModelFile] = []
    tags: list[Tag] = []

    class Config:
        from_attributes = True


class PrintModelSummary(PrintModelBase):
    id: int
    thumbnail_path: Optional[str] = None
    is_public: bool = False
    owner_id: Optional[int] = None
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
