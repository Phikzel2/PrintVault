from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/storage")
def storage_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    total_bytes, total_files = db.query(
        func.coalesce(func.sum(models.ModelFile.file_size), 0),
        func.count(models.ModelFile.id),
    ).first()

    total_models = db.query(func.count(models.PrintModel.id)).scalar()

    by_type_rows = (
        db.query(
            models.ModelFile.file_type,
            func.count(models.ModelFile.id),
            func.coalesce(func.sum(models.ModelFile.file_size), 0),
        )
        .group_by(models.ModelFile.file_type)
        .all()
    )

    top_model_rows = (
        db.query(
            models.PrintModel.id,
            models.PrintModel.name,
            func.count(models.ModelFile.id).label("file_count"),
            func.coalesce(func.sum(models.ModelFile.file_size), 0).label("bytes"),
        )
        .join(models.ModelFile, models.ModelFile.model_id == models.PrintModel.id)
        .group_by(models.PrintModel.id, models.PrintModel.name)
        .order_by(func.sum(models.ModelFile.file_size).desc())
        .limit(20)
        .all()
    )

    result: dict = {
        "total_bytes": total_bytes,
        "total_files": total_files,
        "total_models": total_models,
        "by_file_type": [
            {"file_type": r[0], "count": r[1], "bytes": r[2]}
            for r in sorted(by_type_rows, key=lambda r: r[2], reverse=True)
        ],
        "top_models": [
            {"model_id": r[0], "name": r[1], "file_count": r[2], "bytes": r[3]}
            for r in top_model_rows
        ],
    }

    if current_user.is_admin:
        by_user_rows = (
            db.query(
                models.User.id,
                models.User.username,
                func.count(models.ModelFile.id).label("file_count"),
                func.coalesce(func.sum(models.ModelFile.file_size), 0).label("bytes"),
            )
            .join(models.PrintModel, models.PrintModel.owner_id == models.User.id)
            .join(models.ModelFile, models.ModelFile.model_id == models.PrintModel.id)
            .group_by(models.User.id, models.User.username)
            .order_by(func.sum(models.ModelFile.file_size).desc())
            .all()
        )
        result["by_user"] = [
            {"user_id": r[0], "username": r[1], "file_count": r[2], "bytes": r[3]}
            for r in by_user_rows
        ]

    return result
