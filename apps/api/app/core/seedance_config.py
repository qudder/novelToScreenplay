import os
from pathlib import Path

from app.core.storage_config import storage_config


class SeedanceConfig:
    def __init__(self) -> None:
        self.debug_dir = Path(os.getenv("SEEDANCE_DEBUG_DIR", storage_config.debug_dir / "seedance"))
        self.seedream_debug_dir = Path(os.getenv("SEEDREAM_DEBUG_DIR", storage_config.debug_dir / "seedream"))
        self.media_dir = storage_config.generated_media_dir

    @property
    def base_url(self) -> str:
        return os.getenv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")

    @property
    def model(self) -> str:
        return os.getenv("SEEDANCE_MODEL", "doubao-seedance-1-0-lite-t2v-250428")

    @property
    def image_model(self) -> str:
        return os.getenv("SEEDREAM_IMAGE_MODEL", "doubao-seedream-5-0-260128")

    @property
    def timeout_seconds(self) -> float:
        return float(os.getenv("SEEDANCE_TIMEOUT_SECONDS", "60"))

    @property
    def rightcode_timeout_seconds(self) -> float:
        return float(os.getenv("RIGHTCODE_TIMEOUT_SECONDS", "180"))

    @property
    def execution_expires_after(self) -> int:
        return int(os.getenv("SEEDANCE_EXECUTION_EXPIRES_AFTER", "172800"))

    @property
    def public_media_prefix(self) -> str:
        return storage_config.public_media_prefix


seedance_config = SeedanceConfig()
