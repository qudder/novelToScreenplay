import os
from pathlib import Path


class SeedanceConfig:
    def __init__(self) -> None:
        self.debug_dir = Path(__file__).resolve().parents[1] / ".debug" / "seedance"
        self.media_dir = Path(__file__).resolve().parents[1] / ".data" / "generated_media"

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
    def execution_expires_after(self) -> int:
        return int(os.getenv("SEEDANCE_EXECUTION_EXPIRES_AFTER", "172800"))

    @property
    def public_media_prefix(self) -> str:
        return os.getenv("GENERATED_MEDIA_PUBLIC_PREFIX", "/media/generated").rstrip("/")


seedance_config = SeedanceConfig()
