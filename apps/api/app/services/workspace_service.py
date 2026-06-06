from fastapi import UploadFile

from app.domain.models import ImportResult, Workspace
from app.repositories.memory_repository import memory_repository


class WorkspaceService:
    def get_workspace(self) -> Workspace:
        return memory_repository.get_workspace()

    async def import_document(self, file: UploadFile) -> ImportResult:
        return ImportResult(
            filename=file.filename or "untitled",
            status="queued",
            message="文件已进入解析队列。原型阶段暂未执行真实分章。",
        )


workspace_service = WorkspaceService()

