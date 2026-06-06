from dataclasses import dataclass, field
from uuid import uuid4

from app.domain.models import AnalysisResult, Chapter


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
            message="Narrative analysis has not started.",
        )


class DocumentStore:
    def __init__(self) -> None:
        self._records: dict[str, DocumentRecord] = {}

    def create(self, filename: str, source_text: str, chapters: list[Chapter]) -> DocumentRecord:
        record = DocumentRecord(
            id=str(uuid4()),
            filename=filename,
            source_text=source_text,
            chapters=chapters,
        )
        self._records[record.id] = record
        return record

    def get(self, document_id: str) -> DocumentRecord | None:
        return self._records.get(document_id)


document_store = DocumentStore()

