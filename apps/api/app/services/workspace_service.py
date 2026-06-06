from fastapi import UploadFile

from app.domain.models import ImportResult, Workspace
from app.repositories.memory_repository import memory_repository
from app.services.document_parser import extract_text, split_into_chapters


class WorkspaceService:
    def get_workspace(self) -> Workspace:
        return memory_repository.get_workspace()

    async def import_document(self, file: UploadFile) -> ImportResult:
        content = await file.read()
        source_text = extract_text(file.filename or "untitled", content)
        chapters = split_into_chapters(source_text)
        return ImportResult(
            filename=file.filename or "untitled",
            status="parsed",
            message=f"已解析 {len(chapters)} 个章节。",
            chapters=chapters,
            source_text=source_text,
        )


workspace_service = WorkspaceService()
