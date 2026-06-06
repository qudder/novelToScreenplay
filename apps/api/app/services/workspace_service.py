from fastapi import UploadFile

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.repositories.document_store import DocumentRecord, document_store
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
            message=f"已解析 {len(chapters)} 个章节，可以启动叙事分析。",
            chapters=chapters,
            source_text=source_text,
        )

    def get_analysis(self, document_id: str) -> AnalysisResult | None:
        record = document_store.get(document_id)
        return record.analysis if record else None

    def get_import_result(self, document_id: str) -> ImportResult | None:
        record = document_store.get(document_id)
        if not record:
            return None

        return ImportResult(
            document_id=record.id,
            filename=record.filename,
            status="parsed",
            message=record.analysis.message,
            chapters=record.chapters,
            characters=record.analysis.characters,
            locations=record.analysis.locations,
            environments=record.analysis.environments,
            time_markers=record.analysis.time_markers,
            events=record.analysis.events,
            relationships=record.analysis.relationships,
            conflicts=record.analysis.conflicts,
            dialogues=record.analysis.dialogues,
            actions=record.analysis.actions,
            motivations=record.analysis.motivations,
            causal_links=record.analysis.causal_links,
            scenes=record.analysis.scenes,
            narrative_blocks=record.analysis.narrative_blocks,
            sub_scenes=record.analysis.sub_scenes,
            chapter_analyses=record.analysis.chapter_analyses,
            source_text=record.source_text,
        )

    def restore_import_result(self, payload: ImportResult) -> ImportResult:
        record = DocumentRecord(
            id=payload.document_id,
            filename=payload.filename,
            source_text=payload.source_text,
            chapters=payload.chapters,
        )
        status = "completed" if _has_analysis_payload(payload) else "idle"
        if payload.status == "queued":
            status = "idle"
        record.analysis = AnalysisResult(
            document_id=payload.document_id,
            status=status,
            message=payload.message or "已从浏览器快照恢复。",
            characters=payload.characters,
            locations=payload.locations,
            environments=payload.environments,
            time_markers=payload.time_markers,
            events=payload.events,
            relationships=payload.relationships,
            conflicts=payload.conflicts,
            dialogues=payload.dialogues,
            actions=payload.actions,
            motivations=payload.motivations,
            causal_links=payload.causal_links,
            scenes=payload.scenes,
            narrative_blocks=payload.narrative_blocks,
            sub_scenes=payload.sub_scenes,
            chapter_analyses=payload.chapter_analyses,
        )
        document_store.upsert(record)
        logger.info("已从浏览器快照恢复文档：文档ID=%s，章节数=%s", record.id, len(record.chapters))
        return self.get_import_result(record.id) or payload

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
        record.analysis.message = "叙事分析正在运行。"
        document_store.save(record)
        logger.info("叙事分析状态已标记为运行中：文档ID=%s，章节数=%s", document_id, len(record.chapters))
        return AnalysisStartResult(
            document_id=document_id,
            status="running",
            message=record.analysis.message,
        )

    def restart_analysis(self, document_id: str) -> AnalysisStartResult | None:
        record = document_store.get(document_id)
        if not record:
            return None

        record.analysis.status = "running"
        record.analysis.message = "叙事分析正在运行。"
        document_store.save(record)
        logger.info("已请求重新执行叙事分析：文档ID=%s，章节数=%s", document_id, len(record.chapters))
        return AnalysisStartResult(
            document_id=document_id,
            status="running",
            message=record.analysis.message,
        )

    async def run_analysis(self, document_id: str, force_refresh: bool = False) -> None:
        record = document_store.get(document_id)
        if not record:
            logger.warning("跳过叙事分析执行：文档不存在，文档ID=%s", document_id)
            return

        try:
            logger.info("叙事分析开始执行：文档ID=%s，章节数=%s", document_id, len(record.chapters))
            analysis = await analyze_chapters(record.chapters, record.source_text, force_refresh=force_refresh)
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="completed",
                message="叙事分析已完成。",
                characters=analysis.characters,
                locations=analysis.locations,
                environments=analysis.environments,
                time_markers=analysis.time_markers,
                events=analysis.events,
                relationships=analysis.relationships,
                conflicts=analysis.conflicts,
                dialogues=analysis.dialogues,
                actions=analysis.actions,
                motivations=analysis.motivations,
                causal_links=analysis.causal_links,
                scenes=analysis.scenes,
                narrative_blocks=analysis.narrative_blocks,
                sub_scenes=analysis.sub_scenes,
                chapter_analyses=analysis.chapter_analyses,
                empty_chapter_ids=_empty_chapter_ids(analysis.chapter_analyses),
            )
            document_store.save(record)
            logger.info(
                "叙事分析完成：文档ID=%s，角色数=%s，事件数=%s，关系数=%s，总场景数=%s，子场景数=%s",
                document_id,
                len(analysis.characters),
                len(analysis.events),
                len(analysis.relationships),
                len(analysis.narrative_blocks),
                len(analysis.sub_scenes),
            )
        except Exception as error:
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="failed",
                message=str(error),
            )
            document_store.save(record)
            logger.exception("叙事分析失败：文档ID=%s，错误=%s", document_id, error)


workspace_service = WorkspaceService()


def _has_analysis_payload(payload: ImportResult) -> bool:
    return any(
        [
            payload.characters,
            payload.locations,
            payload.environments,
            payload.time_markers,
            payload.events,
            payload.relationships,
            payload.conflicts,
            payload.dialogues,
            payload.actions,
            payload.motivations,
            payload.causal_links,
            payload.scenes,
            payload.narrative_blocks,
            payload.sub_scenes,
            payload.chapter_analyses,
        ]
    )


def _empty_chapter_ids(chapter_analyses) -> list[str]:
    empty_ids: list[str] = []
    for analysis in chapter_analyses:
        has_content = any(
            [
                analysis.characters,
                analysis.locations,
                analysis.environments,
                analysis.time_markers,
                analysis.events,
                analysis.relationships,
                analysis.conflicts,
                analysis.dialogues,
                analysis.actions,
                analysis.motivations,
                analysis.causal_links,
                analysis.scene_candidates,
                analysis.narrative_blocks,
                analysis.sub_scenes,
            ]
        )
        if not has_content:
            empty_ids.append(analysis.chapter_id)
    return empty_ids
