from fastapi import UploadFile

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.repositories.document_store import document_store
from app.repositories.memory_repository import memory_repository
from app.services.chapter_analysis_service import analyze_chapters
from app.services.document_parser import extract_text, split_into_chapters
from app.core.logging_config import get_logger

logger = get_logger("services.workspace")


class WorkspaceService:
    def get_workspace(self) -> Workspace:
        return memory_repository.get_workspace()

    async def import_document(self, file: UploadFile) -> ImportResult:
        content = await file.read()
        logger.info("读取上传文档：文件名=%s，字节数=%s", file.filename, len(content))
        source_text = extract_text(file.filename or "untitled", content)
        chapters = split_into_chapters(source_text)
        record = document_store.create(file.filename or "untitled", source_text, chapters)
        logger.info("文档解析完成：文档ID=%s，文件名=%s，章节数=%s，原文字符数=%s", record.id, record.filename, len(chapters), len(source_text))
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
            logger.info("叙事分析已处于运行或完成状态：文档ID=%s，状态=%s", document_id, record.analysis.status)
            return AnalysisStartResult(
                document_id=document_id,
                status=record.analysis.status,
                message=record.analysis.message,
            )

        record.analysis.status = "running"
        record.analysis.message = "Narrative analysis is running."
        logger.info("叙事分析状态已标记为运行中：文档ID=%s，章节数=%s", document_id, len(record.chapters))
        return AnalysisStartResult(
            document_id=document_id,
            status="running",
            message=record.analysis.message,
        )

    async def run_analysis(self, document_id: str) -> None:
        record = document_store.get(document_id)
        if not record:
            logger.warning("跳过叙事分析执行：文档不存在，文档ID=%s", document_id)
            return

        try:
            logger.info("叙事分析开始执行：文档ID=%s，章节数=%s", document_id, len(record.chapters))
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
            logger.info(
                "叙事分析完成：文档ID=%s，角色数=%s，事件数=%s，关系数=%s，场景数=%s",
                document_id,
                len(analysis.characters),
                len(analysis.events),
                len(analysis.relationships),
                len(analysis.scenes),
            )
        except Exception as error:
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="failed",
                message=str(error),
            )
            logger.exception("叙事分析失败：文档ID=%s，错误=%s", document_id, error)


workspace_service = WorkspaceService()
