import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.storage_config import storage_config
from app.core.storage_naming import document_dir_name, safe_slug
from app.domain.models import AnalysisResult, Chapter

DATA_DIR = storage_config.documents_dir
LEGACY_DATA_DIR = Path(__file__).resolve().parents[1] / ".data" / "documents"


@dataclass
class DocumentRecord:
    id: str
    filename: str
    source_text: str
    chapters: list[Chapter]
    analysis: AnalysisResult = field(init=False)

    def __post_init__(self) -> None:
        self.analysis = AnalysisResult(
            document_id=self.id,
            status="idle",
            message="叙事分析尚未开始。",
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "source_text": self.source_text,
            "chapters": [_model_to_dict(chapter) for chapter in self.chapters],
            "analysis": _model_to_dict(self.analysis),
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "DocumentRecord":
        record = cls(
            id=payload["id"],
            filename=payload["filename"],
            source_text=payload["source_text"],
            chapters=[Chapter(**chapter) for chapter in payload.get("chapters", [])],
        )
        analysis_payload = payload.get("analysis")
        if analysis_payload:
            record.analysis = AnalysisResult(**analysis_payload)
            if record.analysis.status == "running":
                record.analysis.status = "failed"
                record.analysis.message = "叙事分析已中断，请重新启动。"
        return record


class DocumentStore:
    def __init__(self, data_dir: Path = DATA_DIR, legacy_data_dir: Path = LEGACY_DATA_DIR) -> None:
        self._records: dict[str, DocumentRecord] = {}
        self._data_dir = data_dir
        self._legacy_data_dir = legacy_data_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def create(self, filename: str, source_text: str, chapters: list[Chapter]) -> DocumentRecord:
        record = DocumentRecord(
            id=str(uuid4()),
            filename=filename,
            source_text=source_text,
            chapters=chapters,
        )
        self._records[record.id] = record
        self.save(record)
        return record

    def upsert(self, record: DocumentRecord) -> DocumentRecord:
        self._records[record.id] = record
        self.save(record)
        return record

    def get(self, document_id: str) -> DocumentRecord | None:
        record = self._records.get(document_id)
        if record:
            return record

        record_path = self._record_path(document_id)
        if not record_path.exists():
            record_path = self._legacy_record_path(document_id)
        if not record_path.exists():
            return None

        record = DocumentRecord.from_dict(json.loads(record_path.read_text(encoding="utf-8")))
        self._records[record.id] = record
        self.save(record)
        return record

    def list(self) -> list[DocumentRecord]:
        records: list[tuple[float, DocumentRecord]] = []
        for record_path in self._data_dir.glob("*/snapshot.json"):
            try:
                record = DocumentRecord.from_dict(json.loads(record_path.read_text(encoding="utf-8")))
                updated_at = record_path.stat().st_mtime
            except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
            self._records[record.id] = record
            records.append((updated_at, record))
        return [record for _, record in sorted(records, key=lambda item: item[0], reverse=True)]

    def save(self, record: DocumentRecord) -> None:
        record_path = self._record_path(record.id, record.filename)
        record_path.parent.mkdir(parents=True, exist_ok=True)
        record_path.write_text(
            json.dumps(record.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def delete(self, document_id: str) -> DocumentRecord | None:
        record = self.get(document_id)
        if not record:
            return None

        self._records.pop(document_id, None)
        record_paths = [self._record_path(document_id, record.filename), self._legacy_record_path(document_id)]
        for record_path in record_paths:
            if record_path.exists():
                if record_path.parent == self._data_dir or record_path.parent == self._legacy_data_dir:
                    record_path.unlink(missing_ok=True)
                else:
                    shutil.rmtree(record_path.parent, ignore_errors=True)
        return record

    def _record_path(self, document_id: str, filename: str | None = None) -> Path:
        if filename:
            return self._data_dir / document_dir_name(Path(filename).stem, document_id) / "snapshot.json"
        matched_paths = list(self._data_dir.glob(f"*-{safe_slug(document_id, '未知文档', 36)}/snapshot.json"))
        if matched_paths:
            return matched_paths[0]
        return self._data_dir / document_dir_name("未命名小说", document_id) / "snapshot.json"

    def _legacy_record_path(self, document_id: str) -> Path:
        safe_id = safe_slug(document_id, "未知文档", 80)
        return self._legacy_data_dir / f"{safe_id}.json"


def _model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


document_store = DocumentStore()
