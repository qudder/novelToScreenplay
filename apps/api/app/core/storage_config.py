import os
from pathlib import Path


class StorageConfig:
    def __init__(self) -> None:
        self.app_dir = Path(__file__).resolve().parents[1]
        self.workspace_dir = Path(__file__).resolve().parents[4]
        self.root_dir = Path(os.getenv("APP_DATA_DIR", self.workspace_dir / ".data"))
        self.content_dir = self.root_dir / "content"
        self.runtime_dir = self.root_dir / "runtime"
        self.documents_dir = self.content_dir / "documents"
        self.settings_dir = self.content_dir / "settings"
        self.cache_dir = self.runtime_dir / "cache"
        self.debug_dir = self.runtime_dir / "debug"
        self.generated_media_dir = Path(os.getenv("GENERATED_MEDIA_DIR", self.content_dir / "generated-media"))

        self.legacy_documents_dir = self.root_dir / "documents"
        self.legacy_settings_dir = self.root_dir / "settings"
        self.legacy_cache_dir = self.root_dir / "cache"
        self.legacy_debug_dir = self.root_dir / "debug"
        self.legacy_generated_media_dir = self.root_dir / "generated_media"

    @property
    def public_media_prefix(self) -> str:
        return os.getenv("GENERATED_MEDIA_PUBLIC_PREFIX", "/media/generated").rstrip("/")


storage_config = StorageConfig()
