from fastapi import UploadFile

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.repositories.document_store import document_store
from app.repositories.memory_repository import memory_repository
from app.services.chapter_analysis_service import analyze_chapters
from app.services.document_parser import extract_text, split_into_chapters


class WorkspaceService:
    def get_workspace(self) -> Workspace:
        return memory_repository.get_workspace()

    async def import_document(self, file: UploadFile) -> ImportResult:
        content = await file.read()
        source_text = extract_text(file.filename or "untitled", content)
        chapters = split_into_chapters(source_text)
        record = document_store.create(file.filename or "untitled", source_text, chapters)
        return ImportResult(
            document_id=record.id,
            filename=file.filename or "untitled",
            status="parsed",
            message=f"Parsed {len(chapters)} chapters. Narrative analysis is ready to start.",
            chapters=chapters,
            source_text=source_text,
        )

    def get_analysis(self, document_id: str) -> AnalysisResult | None:
        record = document_store.get(document_id)
        return record.analysis if record else None

    def start_analysis(self, document_id: str) -> AnalysisStartResult | None:
        record = document_store.get(document_id)
        if not record:
            return None

        if record.analysis.status in {"running", "completed"}:
            return AnalysisStartResult(
                document_id=document_id,
                status=record.analysis.status,
                message=record.analysis.message,
            )

        record.analysis.status = "running"
        record.analysis.message = "Narrative analysis is running."
        return AnalysisStartResult(
            document_id=document_id,
            status="running",
            message=record.analysis.message,
        )

    async def run_analysis(self, document_id: str) -> None:
        record = document_store.get(document_id)
        if not record:
            return

        try:
            analysis = await analyze_chapters(record.chapters, record.source_text)
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="completed",
                message="Narrative analysis completed.",
                characters=analysis.characters,
                locations=analysis.locations,
                time_markers=analysis.time_markers,
                events=analysis.events,
                relationships=analysis.relationships,
                conflicts=analysis.conflicts,
                dialogues=analysis.dialogues,
                actions=analysis.actions,
                motivations=analysis.motivations,
                causal_links=analysis.causal_links,
                scenes=analysis.scenes,
                chapter_analyses=analysis.chapter_analyses,
            )
        except Exception as error:
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="failed",
                message=str(error),
            )


workspace_service = WorkspaceService()
