import os
from pathlib import Path


class SeedanceConfig:
    def __init__(self) -> None:
        self.debug_dir = Path(__file__).resolve().parents[2] / ".debug" / "seedance"

    @property
    def base_url(self) -> str:
        return os.getenv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")

    @property
    def model(self) -> str:
        return os.getenv("SEEDANCE_MODEL", "doubao-seedance-1-0-lite-t2v-250428")

    @property
    def timeout_seconds(self) -> float:
        return float(os.getenv("SEEDANCE_TIMEOUT_SECONDS", "60"))

    @property
    def execution_expires_after(self) -> int:
        return int(os.getenv("SEEDANCE_EXECUTION_EXPIRES_AFTER", "172800"))


seedance_config = SeedanceConfig()
