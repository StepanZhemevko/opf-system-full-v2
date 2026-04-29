from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://opfuser:opfpassword@localhost:5432/opfdb"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 1440
    backend_cors_origins: str = "http://localhost:5173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
