from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.core.logging_config import get_logger
from app.services.document_parser import UnsupportedDocumentError
from app.services.ark_model_service import ArkModelConfigurationError, ArkModelListResult, ark_model_service
from app.services.deepseek_client import DeepSeekConfigurationError
from app.services.screenplay_generation_service import (
    ScreenplayCompletionRequest,
    ScreenplayCompletionResult,
    complete_scene_screenplay,
)
from app.services.seedance_client import (
    SeedanceConfigurationError,
    SeedanceCreateTaskRequest,
    SeedanceTaskResult,
    seedance_client,
)
from app.services.seedream_image_client import (
    SeedreamImageConfigurationError,
    SeedreamImageGenerationRequest,
    SeedreamImageGenerationResult,
    seedream_image_client,
)
from app.services.storyboard_prompt_service import (
    StoryboardBatchPromptRequest,
    StoryboardBatchPromptResult,
    StoryboardFramePromptRequest,
    StoryboardFramePromptResult,
    generate_storyboard_batch_prompts,
    generate_storyboard_frame_prompt,
)
from app.services.settings_service import settings_service
from app.services.workspace_service import workspace_service

router = APIRouter()
logger = get_logger("api.routes")


class DeepSeekApiKeyPayload(BaseModel):
    api_key: str = Field(min_length=1)


class SeedanceApiKeyPayload(BaseModel):
    api_key: str = Field(min_length=1)


class ScreenplayExportPayload(BaseModel):
    documentId: str = ""
    filename: str = ""
    title: str = "剧本草稿"
    scenes: list[dict[str, Any]] = []
    updatedAt: str = ""


class DocumentSummary(BaseModel):
    document_id: str
    filename: str
    message: str
    analysis_status: str
    chapter_count: int
    character_count: int
    event_count: int
    scene_count: int


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


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents() -> list[dict[str, Any]]:
    documents = workspace_service.list_documents()
    logger.info("查询本地文档列表：文档数=%s", len(documents))
    return documents


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


@router.get("/documents/{document_id}", response_model=ImportResult)
def get_document(document_id: str) -> ImportResult:
    result = workspace_service.get_import_result(document_id)
    if not result:
        logger.warning("查询文档失败：文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")
    return result


@router.put("/documents/{document_id}", response_model=ImportResult)
def restore_document(document_id: str, payload: ImportResult) -> ImportResult:
    if payload.document_id != document_id:
        raise HTTPException(status_code=400, detail="文档 ID 与请求内容不一致。")
    return workspace_service.restore_import_result(payload)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str) -> Response:
    deleted = workspace_service.delete_document(document_id)
    if not deleted:
        logger.warning("删除文档失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")
    return Response(status_code=204)


@router.get("/documents/{document_id}/analysis", response_model=AnalysisResult)
def get_document_analysis(document_id: str) -> AnalysisResult:
    analysis = workspace_service.get_analysis(document_id)
    if not analysis:
        logger.warning("查询叙事分析失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")
    logger.info("查询叙事分析：文档ID=%s，状态=%s", document_id, analysis.status)
    return analysis


@router.post("/documents/{document_id}/analysis", response_model=AnalysisStartResult)
def start_document_analysis(document_id: str, background_tasks: BackgroundTasks) -> AnalysisStartResult:
    result = workspace_service.start_analysis(document_id)
    if not result:
        logger.warning("启动叙事分析失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")

    if result.status == "running":
        logger.info("叙事分析后台任务已调度：文档ID=%s", document_id)
        background_tasks.add_task(workspace_service.run_analysis, document_id)
    else:
        logger.info("跳过启动叙事分析：文档ID=%s，当前状态=%s", document_id, result.status)

    return result


@router.post("/documents/{document_id}/analysis/retry", response_model=AnalysisStartResult)
def retry_document_analysis(document_id: str, background_tasks: BackgroundTasks) -> AnalysisStartResult:
    result = workspace_service.restart_analysis(document_id)
    if not result:
        logger.warning("重试叙事分析失败：文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")

    background_tasks.add_task(workspace_service.run_analysis, document_id, False, True)
    return result


@router.get("/settings/deepseek")
def get_deepseek_settings() -> dict[str, bool]:
    return {"configured": settings_service.has_deepseek_api_key()}


@router.post("/settings/deepseek")
def save_deepseek_settings(payload: DeepSeekApiKeyPayload) -> dict[str, bool]:
    settings_service.save_deepseek_api_key(payload.api_key)
    logger.info("DeepSeek API Key 已保存：配置状态=true")
    return {"configured": True}


@router.get("/settings/seedance")
def get_seedance_settings() -> dict[str, bool]:
    return {"configured": settings_service.has_seedance_api_key()}


@router.post("/settings/seedance")
def save_seedance_settings(payload: SeedanceApiKeyPayload) -> dict[str, bool]:
    settings_service.save_seedance_api_key(payload.api_key)
    logger.info("Seedance API Key 已保存：配置状态=true")
    return {"configured": True}


@router.get("/settings/seedance/models", response_model=ArkModelListResult)
async def list_seedance_models() -> ArkModelListResult:
    logger.info("收到 Seedance/Ark 可用模型查询请求")
    try:
        return await ark_model_service.list_models()
    except ArkModelConfigurationError as error:
        logger.warning("Seedance/Ark 可用模型查询失败：配置缺失")
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Seedance/Ark 可用模型查询失败：错误=%s", error)
        raise HTTPException(status_code=502, detail=f"查询可用模型失败：{error}") from error


@router.post("/videos/seedance/tasks", response_model=SeedanceTaskResult)
async def create_seedance_video_task(payload: SeedanceCreateTaskRequest) -> SeedanceTaskResult:
    logger.info("收到 Seedance 视频任务创建请求：标题=%s，画幅=%s，时长=%s，清晰度=%s", payload.title, payload.ratio, payload.duration, payload.resolution)
    try:
        return await seedance_client.create_task(payload)
    except SeedanceConfigurationError as error:
        logger.warning("Seedance 视频任务创建失败：配置缺失，标题=%s", payload.title)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Seedance 视频任务创建失败：标题=%s，错误=%s", payload.title, error)
        raise HTTPException(status_code=502, detail=f"Seedance 视频任务创建失败：{error}") from error


@router.get("/videos/seedance/tasks/{task_id}", response_model=SeedanceTaskResult)
async def get_seedance_video_task(task_id: str) -> SeedanceTaskResult:
    logger.info("收到 Seedance 视频任务查询请求：任务ID=%s", task_id)
    try:
        return await seedance_client.get_task(task_id)
    except SeedanceConfigurationError as error:
        logger.warning("Seedance 视频任务查询失败：配置缺失，任务ID=%s", task_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Seedance 视频任务查询失败：任务ID=%s，错误=%s", task_id, error)
        raise HTTPException(status_code=502, detail=f"Seedance 视频任务查询失败：{error}") from error


@router.post("/images/seedream/generations", response_model=SeedreamImageGenerationResult)
async def create_seedream_image_generation(payload: SeedreamImageGenerationRequest) -> SeedreamImageGenerationResult:
    logger.info("收到 Seedream 分镜图片生成请求：标题=%s，尺寸=%s", payload.title, payload.size)
    try:
        return await seedream_image_client.generate_image(payload)
    except SeedreamImageConfigurationError as error:
        logger.warning("Seedream 分镜图片生成失败：配置缺失，标题=%s", payload.title)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Seedream 分镜图片生成失败：标题=%s，错误=%s", payload.title, error)
        raise HTTPException(status_code=502, detail=f"Seedream 分镜图片生成失败：{error}") from error


@router.post("/storyboard-prompts/frame", response_model=StoryboardFramePromptResult)
async def create_storyboard_frame_prompt(payload: StoryboardFramePromptRequest) -> StoryboardFramePromptResult:
    logger.info("收到小分镜图片提示词生成请求：场景ID=%s，标题=%s", payload.scene_id, payload.scene_title)
    try:
        return await generate_storyboard_frame_prompt(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("小分镜图片提示词生成失败：DeepSeek 配置缺失，场景ID=%s", payload.scene_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("小分镜图片提示词生成失败：场景ID=%s，错误=%s", payload.scene_id, error)
        raise HTTPException(status_code=500, detail=f"小分镜图片提示词生成失败：{error}") from error


@router.post("/storyboard-prompts/batch", response_model=StoryboardBatchPromptResult)
async def create_storyboard_batch_prompts(payload: StoryboardBatchPromptRequest) -> StoryboardBatchPromptResult:
    logger.info("收到批量小分镜图片提示词生成请求：场景ID=%s，数量=%s", payload.scene_id, len(payload.frames))
    try:
        return await generate_storyboard_batch_prompts(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("批量小分镜图片提示词生成失败：DeepSeek 配置缺失，场景ID=%s", payload.scene_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("批量小分镜图片提示词生成失败：场景ID=%s，错误=%s", payload.scene_id, error)
        raise HTTPException(status_code=500, detail=f"批量小分镜图片提示词生成失败：{error}") from error


@router.post("/screenplays/export")
def export_screenplay(payload: ScreenplayExportPayload) -> Response:
    logger.info("收到剧本导出请求：文档ID=%s，场景数=%s", payload.documentId, len(payload.scenes))
    yaml_text = _to_yaml(
        {
            "screenplay": {
                "title": payload.title,
                "source": {
                    "document_id": payload.documentId,
                    "filename": payload.filename,
                },
                "updated_at": payload.updatedAt,
                "scenes": payload.scenes,
            }
        }
    )
    return Response(content=yaml_text, media_type="application/x-yaml; charset=utf-8")


@router.post("/screenplays/complete-scene", response_model=ScreenplayCompletionResult)
async def complete_screenplay_scene(payload: ScreenplayCompletionRequest) -> ScreenplayCompletionResult:
    logger.info("收到场景剧本补全请求：文档ID=%s，场景ID=%s，标题=%s", payload.document_id, payload.scene_id, payload.scene_title)
    try:
        return await complete_scene_screenplay(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("场景剧本补全失败：DeepSeek 配置缺失，场景ID=%s", payload.scene_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("场景剧本补全失败：场景ID=%s，错误=%s", payload.scene_id, error)
        raise HTTPException(status_code=500, detail=f"场景剧本补全失败：{error}") from error


def _to_yaml(value: Any, indent: int = 0) -> str:
    lines = _yaml_lines(value, indent)
    return "\n".join(lines) + "\n"


def _yaml_lines(value: Any, indent: int = 0) -> list[str]:
    prefix = " " * indent
    if isinstance(value, dict):
        lines: list[str] = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}{key}:")
                lines.extend(_yaml_lines(item, indent + 2))
            else:
                lines.append(f"{prefix}{key}: {_yaml_scalar(item)}")
        return lines

    if isinstance(value, list):
        if not value:
            return [f"{prefix}[]"]
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}-")
                lines.extend(_yaml_lines(item, indent + 2))
            else:
                lines.append(f"{prefix}- {_yaml_scalar(item)}")
        return lines

    return [f"{prefix}{_yaml_scalar(value)}"]


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return '""'
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if not text:
        return '""'
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'
