from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.core.logging_config import get_logger
from app.services.document_parser import UnsupportedDocumentError
from app.services.deepseek_client import DeepSeekConfigurationError
from app.services.settings_service import settings_service
from app.services.workspace_service import workspace_service

router = APIRouter()
logger = get_logger("api.routes")


class DeepSeekApiKeyPayload(BaseModel):
    api_key: str = Field(min_length=1)


@router.get("/workspace", response_model=Workspace)
def get_workspace() -> Workspace:
    return workspace_service.get_workspace()


@router.get("/chapters")
def get_chapters():
    return workspace_service.get_workspace().chapters


@router.get("/characters")
def get_characters():
    return workspace_service.get_workspace().characters


@router.get("/relationships")
def get_relationships():
    return workspace_service.get_workspace().relationships


@router.get("/events")
def get_events():
    return workspace_service.get_workspace().events


@router.get("/scenes")
def get_scenes():
    return workspace_service.get_workspace().scenes


@router.post("/documents/import", response_model=ImportResult)
async def import_document(file: UploadFile = File(...)) -> ImportResult:
    logger.info("收到文档导入请求：文件名=%s，内容类型=%s", file.filename, file.content_type)
    try:
        result = await workspace_service.import_document(file)
        logger.info(
            "文档导入完成：文档ID=%s，文件名=%s，章节数=%s",
            result.document_id,
            result.filename,
            len(result.chapters),
        )
        return result
    except UnsupportedDocumentError as error:
        logger.warning("文档导入失败：不支持的文件，文件名=%s，错误=%s", file.filename, error)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except DeepSeekConfigurationError as error:
        logger.error("文档导入失败：DeepSeek 配置异常，文件名=%s，错误=%s", file.filename, error)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/documents/{document_id}/analysis", response_model=AnalysisResult)
def get_document_analysis(document_id: str) -> AnalysisResult:
    analysis = workspace_service.get_analysis(document_id)
    if not analysis:
        logger.warning("查询叙事分析失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="Document not found.")
    logger.info("查询叙事分析：文档ID=%s，状态=%s", document_id, analysis.status)
    return analysis


@router.post("/documents/{document_id}/analysis", response_model=AnalysisStartResult)
def start_document_analysis(document_id: str, background_tasks: BackgroundTasks) -> AnalysisStartResult:
    result = workspace_service.start_analysis(document_id)
    if not result:
        logger.warning("启动叙事分析失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="Document not found.")

    if result.status == "running":
        logger.info("叙事分析后台任务已调度：文档ID=%s", document_id)
        background_tasks.add_task(workspace_service.run_analysis, document_id)
    else:
        logger.info("跳过启动叙事分析：文档ID=%s，当前状态=%s", document_id, result.status)

    return result


@router.get("/settings/deepseek")
def get_deepseek_settings() -> dict[str, bool]:
    return {"configured": settings_service.has_deepseek_api_key()}


@router.post("/settings/deepseek")
def save_deepseek_settings(payload: DeepSeekApiKeyPayload) -> dict[str, bool]:
    settings_service.save_deepseek_api_key(payload.api_key)
    logger.info("DeepSeek API Key 已保存：配置状态=true")
    return {"configured": True}
