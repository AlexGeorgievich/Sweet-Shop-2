from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sweet Shop API"
    app_environment: str = "local"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://sweet_shop:sweet_shop@db:5432/sweet_shop"
    session_cookie_name: str = "sweet_shop_session"
    session_hours: int = 12
    login_max_attempts: int = 5
    login_window_seconds: int = 300

    @property
    def psycopg_database_url(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
