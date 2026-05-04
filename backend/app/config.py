from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://stlibrary:stlibrary@db:5432/stlibrary"
    upload_dir: str = "/data/uploads"
    secret_key: str = "changeme"
    max_file_size_mb: int = 500

    class Config:
        env_file = ".env"


settings = Settings()
