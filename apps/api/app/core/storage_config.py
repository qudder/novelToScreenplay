import os
from pathlib import Path


class StorageConfig:
    def __init__(self) -> None:
        self.app_dir = Path(__file__).resolve().parents[1]
        self.workspace_dir = Path(__file__).resolve().parents[4]
        self.root_dir = Path(os.getenv("APP_DATA_DIR", self.workspace_dir / ".data"))
        self.documents_dir = self.root_dir / "documents"
        self.cache_dir = self.root_dir / "cache"
        self.debug_dir = self.root_dir / "debug"
        self.generated_media_dir = Path(os.getenv("GENERATED_MEDIA_DIR", self.root_dir / "generated_media"))

    @property
    def public_media_prefix(self) -> str:
        return os.getenv("GENERATED_MEDIA_PUBLIC_PREFIX", "/media/generated").rstrip("/")


storage_config = StorageConfig()
