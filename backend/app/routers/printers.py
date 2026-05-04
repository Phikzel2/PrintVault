from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/printers", tags=["printers"])


@router.get("", response_model=list[schemas.Printer])
def list_printers(db: Session = Depends(get_db)):
    return db.query(models.Printer).order_by(models.Printer.name).all()


@router.post("", response_model=schemas.Printer, status_code=201)
def create_printer(data: schemas.PrinterCreate, db: Session = Depends(get_db)):
    printer = models.Printer(**data.model_dump())
    db.add(printer)
    db.commit()
    db.refresh(printer)
    return printer


@router.put("/{printer_id}", response_model=schemas.Printer)
def update_printer(printer_id: int, data: schemas.PrinterCreate, db: Session = Depends(get_db)):
    printer = db.query(models.Printer).filter(models.Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(printer, field, value)
    db.commit()
    db.refresh(printer)
    return printer


@router.delete("/{printer_id}", status_code=204)
def delete_printer(printer_id: int, db: Session = Depends(get_db)):
    printer = db.query(models.Printer).filter(models.Printer.id == printer_id).first()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    db.delete(printer)
    db.commit()
