from pathlib import Path
import shutil

from fastapi import UploadFile

from app.core.deepseek_config import deepseek_config
from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.repositories.document_store import DocumentRecord, document_store
from app.repositories.memory_repository import memory_repository
from app.services import character_llm_extractor
from app.services import chapter_analysis_service
from app.services.chapter_analysis_service import aggregate_chapter_analyses, analyze_chapters, has_chapter_analysis_content
from app.services.document_parser import extract_text, split_into_chapters
from app.core.logging_config import get_logger

logger = get_logger("services.workspace")


class WorkspaceService:
    def get_workspace(self) -> Workspace:
        return memory_repository.get_workspace()

    def list_documents(self) -> list[dict[str, object]]:
        records = document_store.list()
        return [
            {
                "document_id": record.id,
                "filename": record.filename,
                "message": record.analysis.message,
                "analysis_status": record.analysis.status,
                "chapter_count": len(record.chapters),
                "character_count": len(record.analysis.characters),
                "event_count": len(record.analysis.events),
                "scene_count": len(record.analysis.sub_scenes) or len(record.analysis.scenes),
            }
            for record in records
        ]

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
            shot_plans=record.analysis.shot_plans,
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
            shot_plans=payload.shot_plans,
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

    def delete_document(self, document_id: str) -> bool:
        record = document_store.delete(document_id)
        if not record:
            return False

        deleted_cache_count = _delete_document_cache(record)
        logger.info(
            "本地文档及缓存已删除：文档ID=%s，文件名=%s，章节数=%s，缓存项数=%s",
            document_id,
            record.filename,
            len(record.chapters),
            deleted_cache_count,
        )
        return True

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

    def restart_analysis(self, document_id: str) -> tuple[AnalysisStartResult, bool] | None:
        record = document_store.get(document_id)
        if not record:
            return None

        pending_chapter_ids = _pending_chapter_ids(record)
        resume_incomplete = bool(pending_chapter_ids)
        record.analysis.status = "running"
        if resume_incomplete:
            record.analysis.message = f"正在继续分析未完成章节：{len(pending_chapter_ids)} / {len(record.chapters)}。"
        else:
            record.analysis.message = "正在重新执行叙事分析。"
        document_store.save(record)
        logger.info(
            "已请求重新执行叙事分析：文档ID=%s，章节数=%s，待补章节数=%s，执行模式=%s",
            document_id,
            len(record.chapters),
            len(pending_chapter_ids),
            "续跑待补章节" if resume_incomplete else "全量重新分析",
        )
        return (
            AnalysisStartResult(
                document_id=document_id,
                status="running",
                message=record.analysis.message,
            ),
            resume_incomplete,
        )

    async def run_analysis(self, document_id: str, force_refresh: bool = False, resume_incomplete: bool = False, model_profile_id: str = "") -> None:
        record = document_store.get(document_id)
        if not record:
            logger.warning("跳过叙事分析执行：文档不存在，文档ID=%s", document_id)
            return

        try:
            if resume_incomplete:
                analysis = await _resume_incomplete_analysis(record, model_profile_id)
            else:
                logger.info("叙事分析开始执行：文档ID=%s，文件名=%s，章节数=%s，临时模型档案=%s", document_id, record.filename, len(record.chapters), model_profile_id or "默认")
                analysis = await analyze_chapters(record.chapters, record.source_text, filename=record.filename, force_refresh=force_refresh, model_profile_id=model_profile_id)
            record.analysis = AnalysisResult(
                document_id=document_id,
                status="completed",
                message="叙事分析已完成。",
                characters=analysis.characters,
                locations=analysis.locations,
                environments=analysis.environments,
                shot_plans=analysis.shot_plans,
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
                "叙事分析完成：文档ID=%s，角色数=%s，事件数=%s，关系数=%s，总场景数=%s，子场景数=%s，分镜数=%s",
                document_id,
                len(analysis.characters),
                len(analysis.events),
                len(analysis.relationships),
                len(analysis.narrative_blocks),
                len(analysis.sub_scenes),
                len(analysis.shot_plans),
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
            payload.shot_plans,
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


async def _resume_incomplete_analysis(record: DocumentRecord, model_profile_id: str = ""):
    pending_chapter_ids = _pending_chapter_ids(record)
    if not pending_chapter_ids:
        logger.info("未发现待续跑章节，将复用已有叙事分析结果：文档ID=%s，章节数=%s", record.id, len(record.chapters))
        return aggregate_chapter_analyses(record.chapters, record.analysis.chapter_analyses)

    pending_id_set = set(pending_chapter_ids)
    pending_chapters = [chapter for chapter in record.chapters if chapter.id in pending_id_set]
    logger.info(
        "叙事分析继续执行：文档ID=%s，文件名=%s，待分析章节数=%s，已完成章节数=%s",
        record.id,
        record.filename,
        len(pending_chapters),
        len(record.chapters) - len(pending_chapters),
    )
    resumed_analysis = await analyze_chapters(pending_chapters, record.source_text, filename=record.filename, force_refresh=True, model_profile_id=model_profile_id)
    existing_by_chapter_id = {
        analysis.chapter_id: analysis
        for analysis in record.analysis.chapter_analyses
        if has_chapter_analysis_content(analysis) and analysis.chapter_id not in pending_id_set
    }
    resumed_by_chapter_id = {analysis.chapter_id: analysis for analysis in resumed_analysis.chapter_analyses}
    merged_chapter_analyses = [
        resumed_by_chapter_id.get(chapter.id) or existing_by_chapter_id[chapter.id]
        for chapter in record.chapters
        if chapter.id in resumed_by_chapter_id or chapter.id in existing_by_chapter_id
    ]
    logger.info(
        "叙事分析续跑结果已合并：文档ID=%s，章节结果数=%s，续跑章节数=%s",
        record.id,
        len(merged_chapter_analyses),
        len(resumed_by_chapter_id),
    )
    return aggregate_chapter_analyses(record.chapters, merged_chapter_analyses)


def _pending_chapter_ids(record: DocumentRecord) -> list[str]:
    completed_chapter_ids = {
        analysis.chapter_id
        for analysis in record.analysis.chapter_analyses
        if has_chapter_analysis_content(analysis)
    }
    return [chapter.id for chapter in record.chapters if chapter.id not in completed_chapter_ids]


def _empty_chapter_ids(chapter_analyses) -> list[str]:
    empty_ids: list[str] = []
    for analysis in chapter_analyses:
        if not has_chapter_analysis_content(analysis):
            empty_ids.append(analysis.chapter_id)
    return empty_ids


def _delete_document_cache(record: DocumentRecord) -> int:
    deleted_count = 0
    for chapter in record.chapters:
        chapter_text = chapter_analysis_service._chapter_text(chapter, record.source_text)
        deleted_count += _delete_file(chapter_analysis_service._chapter_cache_path(chapter, chapter_text, record.filename))
        deleted_count += _delete_file(chapter_analysis_service._legacy_chapter_cache_path(chapter, chapter_text, record.filename))
        deleted_count += _delete_dir(chapter_analysis_service._chapter_debug_dir(chapter, chapter_text, record.filename))
        deleted_count += _delete_dir(deepseek_config.legacy_debug_dir / chapter_analysis_service._chapter_debug_name(chapter, chapter_text, record.filename))

        character_chapter_text = character_llm_extractor._chapter_text(chapter, record.source_text)
        deleted_count += _delete_file(character_llm_extractor._chapter_cache_path(chapter, character_chapter_text))

    return deleted_count


def _delete_file(path: Path) -> int:
    if not path.exists() or not path.is_file():
        return 0
    path.unlink(missing_ok=True)
    return 1


def _delete_dir(path: Path) -> int:
    if not path.exists() or not path.is_dir():
        return 0
    shutil.rmtree(path, ignore_errors=True)
    return 1
