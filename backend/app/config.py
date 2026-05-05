from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://printvault:printvault@db:5432/printvault"
    upload_dir: str = "/data/uploads"
    secret_key: str = "changeme"
    max_file_size_mb: int = 500
    admin_username: str = "admin"
    admin_password: str = "changeme"
    jwt_expire_hours: int = 168  # 7 days

    class Config:
        env_file = ".env"


settings = Settings()
