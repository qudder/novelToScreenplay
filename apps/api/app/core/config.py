import os
from pathlib import Path

from pydantic import BaseModel


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        item = line.strip()
        if not item or item.startswith("#") or "=" not in item:
            continue
        key, value = item.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class Settings(BaseModel):
    app_name: str = "Novel to Screenplay API"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    logging_enabled: bool = os.getenv("APP_LOGGING_ENABLED", "true").lower() == "true"
    log_level: str = os.getenv("APP_LOG_LEVEL", "INFO").upper()


load_local_env()
settings = Settings()
