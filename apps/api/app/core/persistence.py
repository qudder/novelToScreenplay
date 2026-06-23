import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.logging_config import get_logger
from app.core.storage_config import storage_config
from app.core.storage_naming import context_dir_name, document_dir_name, safe_slug, short_hash
from app.domain.models import Chapter

logger = get_logger("core.persistence")

CHAPTER_ANALYSIS_CACHE_SCHEMA_VERSION = "chapter-analysis-v6-costumes-scene-info"


@dataclass(frozen=True)
class CacheEntryPaths:
    cache_path: Path
    legacy_cache_path: Path
    debug_dir: Path
    legacy_debug_dir: Path


class JsonFileStore:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def read(self, path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))

    def write(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


class PersistenceLayout:
    def __init__(self) -> None:
        self.root_dir = storage_config.root_dir
        self.documents_dir = storage_config.documents_dir
        self.settings_dir = storage_config.settings_dir
        self.generated_media_dir = storage_config.generated_media_dir
        self.deepseek_cache_dir = storage_config.cache_dir / "model-calls" / "deepseek"
        self.deepseek_debug_dir = storage_config.debug_dir / "model-calls" / "deepseek"
        self.model_gateway_debug_dir = storage_config.debug_dir / "model-gateway"
        self.seedance_debug_dir = storage_config.debug_dir / "media-generation" / "seedance"
        self.seedream_debug_dir = storage_config.debug_dir / "media-generation" / "seedream"

        self.legacy_documents_dir = storage_config.legacy_documents_dir
        self.legacy_settings_dir = storage_config.legacy_settings_dir
        self.legacy_deepseek_cache_dir = storage_config.legacy_cache_dir / "deepseek"
        self.legacy_deepseek_debug_dir = storage_config.legacy_debug_dir / "deepseek"
        self.app_legacy_documents_dir = storage_config.app_dir / ".data" / "documents"

        self._json_store = JsonFileStore(self.root_dir)

    def read_json(self, path: Path) -> dict[str, Any]:
        return self._json_store.read(path)

    def write_json(self, path: Path, payload: dict[str, Any]) -> None:
        self._json_store.write(path, payload)

    def document_snapshot_path(self, document_id: str, filename: str | None = None) -> Path:
        return self.document_snapshot_path_in(self.documents_dir, document_id, filename)

    def document_snapshot_path_in(self, base_dir: Path, document_id: str, filename: str | None = None) -> Path:
        if filename:
            return base_dir / document_dir_name(Path(filename).stem, document_id) / "snapshot.json"
        matched_paths = list(base_dir.glob(f"*-{safe_slug(document_id, '未知文档', 36)}/snapshot.json"))
        if matched_paths:
            return matched_paths[0]
        return base_dir / document_dir_name("未命名小说", document_id) / "snapshot.json"

    def legacy_document_snapshot_path(self, document_id: str) -> Path:
        safe_id = safe_slug(document_id, "未知文档", 80)
        return self.app_legacy_documents_dir / f"{safe_id}.json"

    def previous_document_snapshot_path(self, document_id: str, filename: str | None = None) -> Path:
        return self.document_snapshot_path_in(self.legacy_documents_dir, document_id, filename)

    def chapter_analysis_paths(self, chapter: Chapter, chapter_text: str, filename: str) -> CacheEntryPaths:
        name = self.chapter_analysis_name(chapter, chapter_text, filename)
        return CacheEntryPaths(
            cache_path=self.deepseek_cache_dir / "chapter-analysis" / f"{name}.json",
            legacy_cache_path=self.legacy_deepseek_cache_dir / f"{name}.json",
            debug_dir=self.deepseek_debug_dir / "chapter-analysis" / name,
            legacy_debug_dir=self.legacy_deepseek_debug_dir / name,
        )

    def character_extraction_cache_path(self, chapter: Chapter, chapter_text: str) -> Path:
        return self.deepseek_cache_dir / "character-extraction" / f"{short_hash(f'{chapter.id}\n{chapter.title}\n{chapter_text}')}.json"

    def legacy_character_extraction_cache_path(self, chapter: Chapter, chapter_text: str) -> Path:
        return self.legacy_deepseek_cache_dir / f"{short_hash(f'{chapter.id}\n{chapter.title}\n{chapter_text}')}.json"

    def chapter_analysis_name(self, chapter: Chapter, chapter_text: str, filename: str) -> str:
        return f"{safe_slug(Path(filename).stem, '未命名小说', 48)}-{safe_slug(chapter.id, '未知章节', 36)}-{self.chapter_analysis_key(chapter, chapter_text)[:12]}"

    def chapter_analysis_key(self, chapter: Chapter, chapter_text: str) -> str:
        return short_hash(
            f"{CHAPTER_ANALYSIS_CACHE_SCHEMA_VERSION}\n{chapter.id}\n{chapter.title}\n{chapter_text}",
            length=64,
        )

    def delete_document_runtime(self, chapters: list[Chapter], source_text: str, filename: str) -> int:
        from app.services import chapter_analysis_service
        from app.services import character_llm_extractor

        deleted_count = 0
        for chapter in chapters:
            chapter_text = chapter_analysis_service.chapter_text_for_cache(chapter, source_text)
            paths = self.chapter_analysis_paths(chapter, chapter_text, filename)
            deleted_count += _delete_file(paths.cache_path)
            deleted_count += _delete_file(paths.legacy_cache_path)
            deleted_count += _delete_dir(paths.debug_dir)
            deleted_count += _delete_dir(paths.legacy_debug_dir)

            character_chapter_text = character_llm_extractor.chapter_text_for_cache(chapter, source_text)
            deleted_count += _delete_file(self.character_extraction_cache_path(chapter, character_chapter_text))
            deleted_count += _delete_file(self.legacy_character_extraction_cache_path(chapter, character_chapter_text))
        return deleted_count

    def media_context_dir(self, media_kind: str, title: str, item_id: str = "") -> Path:
        if item_id:
            return self.generated_media_dir / media_kind / context_dir_name(title, item_id, "未命名媒体")
        return self.generated_media_dir / media_kind


def _delete_file(path: Path) -> int:
    if not path.exists() or not path.is_file():
        return 0
    path.unlink(missing_ok=True)
    logger.info("本地持久化文件已删除：路径=%s", path)
    return 1


def _delete_dir(path: Path) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    shutil.rmtree(path, ignore_errors=True)
    logger.info("本地持久化目录已删除：路径=%s", path)
    return 1


persistence_layout = PersistenceLayout()
