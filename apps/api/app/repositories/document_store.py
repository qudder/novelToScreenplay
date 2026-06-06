import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.domain.models import AnalysisResult, Chapter

DATA_DIR = Path(__file__).resolve().parents[1] / ".data" / "documents"


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
    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self._records: dict[str, DocumentRecord] = {}
        self._data_dir = data_dir
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
            return None

        record = DocumentRecord.from_dict(json.loads(record_path.read_text(encoding="utf-8")))
        self._records[record.id] = record
        self.save(record)
        return record

    def save(self, record: DocumentRecord) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._record_path(record.id).write_text(
            json.dumps(record.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _record_path(self, document_id: str) -> Path:
        safe_id = "".join(char if char.isalnum() or char in "-_" else "-" for char in document_id)
        return self._data_dir / f"{safe_id}.json"


def _model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


document_store = DocumentStore()
