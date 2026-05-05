from sqlalchemy import (
    Boolean, Column, Integer, String, Text, Float, BigInteger,
    DateTime, ForeignKey, Table
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

model_tags = Table(
    "model_tags",
    Base.metadata,
    Column("model_id", Integer, ForeignKey("print_models.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(200), nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    settings = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    models = relationship("PrintModel", back_populates="owner", foreign_keys="PrintModel.owner_id")


class PrintModel(Base):
    __tablename__ = "print_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    source_url = Column(String(500))
    license = Column(String(100))
    thumbnail_path = Column(String(500))
    is_public = Column(Boolean, nullable=False, default=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    files = relationship("ModelFile", back_populates="model", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=model_tags, back_populates="models")
    owner = relationship("User", back_populates="models", foreign_keys=[owner_id])


class ModelFile(Base):
    __tablename__ = "model_files"

    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(Integer, ForeignKey("print_models.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_type = Column(String(20), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="SET NULL"), nullable=True)
    source_file_id = Column(Integer, ForeignKey("model_files.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    model = relationship("PrintModel", back_populates="files")
    printer = relationship("Printer", back_populates="gcode_files")


class Printer(Base):
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    brand = Column(String(100))
    model_name = Column(String(100))
    build_volume_x = Column(Float)
    build_volume_y = Column(Float)
    build_volume_z = Column(Float)
    notes = Column(Text)
    moonraker_url = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    gcode_files = relationship("ModelFile", back_populates="printer")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)

    models = relationship("PrintModel", secondary=model_tags, back_populates="tags")
