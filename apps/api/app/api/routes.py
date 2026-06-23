from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.core.logging_config import get_logger
from app.services.document_parser import UnsupportedDocumentError
from app.services.ark_model_service import ArkModelConfigurationError, ArkModelListResult, ark_model_service
from app.services.deepseek_client import DeepSeekConfigurationError
from app.services.model_provider_service import (
    ModelProviderDefaultsPayload,
    ModelProviderModelListResult,
    ModelProviderProfilePayload,
    ModelProviderPublicProfile,
    model_provider_service,
)
from app.services.model_gateway import ModelContentPart, ModelGatewayRequest, ModelMessage, image_file_part, image_url_part, model_gateway, text_message
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
    CharacterImagePromptRequest,
    CharacterImagePromptResult,
    StoryboardBatchPromptRequest,
    StoryboardBatchPromptResult,
    StoryboardFramePromptRequest,
    StoryboardFramePromptResult,
    generate_character_image_prompt,
    generate_storyboard_batch_prompts,
    generate_storyboard_frame_prompt,
)
from app.services.settings_service import settings_service
from app.services.workspace_service import workspace_service

router = APIRouter()
logger = get_logger("api.routes")


class DeepSeekApiKeyPayload(BaseModel):
    api_key: str = ""
    openai_base_url: str = ""
    model: str = ""


class AnalysisStartPayload(BaseModel):
    model_profile_id: str = ""


class ModelProviderTestPayload(BaseModel):
    prompt: str = "请回复：连接成功"
    image_url: str = ""


class SeedanceApiKeyPayload(BaseModel):
    api_key: str = ""
    model: str = ""


class RightCodeApiKeyPayload(BaseModel):
    api_key: str = ""
    openai_base_url: str = ""
    model: str = ""


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
        logger.error("文档导入失败：文本模型配置异常，文件名=%s，错误=%s", file.filename, error)
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
def start_document_analysis(document_id: str, background_tasks: BackgroundTasks, payload: AnalysisStartPayload | None = None) -> AnalysisStartResult:
    model_profile_id = payload.model_profile_id if payload else ""
    result = workspace_service.start_analysis(document_id)
    if not result:
        logger.warning("启动叙事分析失败：文档不存在，文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")

    if result.status == "running":
        logger.info("叙事分析后台任务已调度：文档ID=%s，临时模型档案=%s", document_id, model_profile_id or "默认")
        background_tasks.add_task(workspace_service.run_analysis, document_id, False, False, model_profile_id)
    else:
        logger.info("跳过启动叙事分析：文档ID=%s，当前状态=%s", document_id, result.status)

    return result


@router.post("/documents/{document_id}/analysis/retry", response_model=AnalysisStartResult)
def retry_document_analysis(document_id: str, background_tasks: BackgroundTasks, payload: AnalysisStartPayload | None = None) -> AnalysisStartResult:
    model_profile_id = payload.model_profile_id if payload else ""
    restart_result = workspace_service.restart_analysis(document_id)
    if not restart_result:
        logger.warning("重试叙事分析失败：文档ID=%s", document_id)
        raise HTTPException(status_code=404, detail="文档不存在。")

    result, resume_incomplete = restart_result
    background_tasks.add_task(workspace_service.run_analysis, document_id, not resume_incomplete, resume_incomplete, model_profile_id)
    return result


@router.get("/model-providers", response_model=list[ModelProviderPublicProfile])
def list_model_providers() -> list[ModelProviderPublicProfile]:
    return model_provider_service.list_profiles()


@router.post("/model-providers", response_model=ModelProviderPublicProfile)
def create_model_provider(payload: ModelProviderProfilePayload) -> ModelProviderPublicProfile:
    try:
        return model_provider_service.create_profile(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/model-providers/defaults")
def get_model_provider_defaults() -> dict[str, str]:
    return model_provider_service.get_defaults()


@router.put("/model-providers/defaults")
def save_model_provider_defaults(payload: ModelProviderDefaultsPayload) -> dict[str, str]:
    try:
        return model_provider_service.save_defaults(payload.defaults)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/model-providers/{profile_id}", response_model=ModelProviderPublicProfile)
def get_model_provider(profile_id: str) -> ModelProviderPublicProfile:
    try:
        return model_provider_service.get_public_profile(profile_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.put("/model-providers/{profile_id}", response_model=ModelProviderPublicProfile)
def update_model_provider(profile_id: str, payload: ModelProviderProfilePayload) -> ModelProviderPublicProfile:
    try:
        return model_provider_service.update_profile(profile_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/model-providers/{profile_id}", status_code=204)
def delete_model_provider(profile_id: str) -> Response:
    try:
        model_provider_service.delete_profile(profile_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return Response(status_code=204)


@router.get("/model-providers/{profile_id}/models", response_model=ModelProviderModelListResult)
async def list_model_provider_models(profile_id: str) -> ModelProviderModelListResult:
    try:
        return await model_provider_service.list_models(profile_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("模型供应商可用模型查询失败：卡片ID=%s，错误=%s", profile_id, error)
        raise HTTPException(status_code=502, detail=f"查询可用模型失败：{error}") from error


@router.post("/model-providers/{profile_id}/test")
async def test_model_provider(profile_id: str, payload: ModelProviderTestPayload) -> dict[str, Any]:
    content = [ModelContentPart(type="text", text=payload.prompt)]
    if payload.image_url.strip():
        content.append(image_url_part(payload.image_url.strip()))
    purpose = "vision_understanding" if payload.image_url.strip() else "screenplay_completion"
    try:
        result = await model_gateway.generate(
            ModelGatewayRequest(
                purpose=purpose,
                model_profile_id=profile_id,
                messages=[
                    text_message("system", "你是模型连接测试助手，请用中文简短回复。"),
                    ModelMessage(role="user", content=content),
                ],
            )
        )
    except Exception as error:
        logger.exception("模型供应商连接测试失败：档案ID=%s，错误=%s", profile_id, error)
        raise HTTPException(status_code=502, detail=f"模型连接测试失败：{error}") from error
    return {"ok": True, "message": "模型连接测试成功。", "provider": result.provider, "model": result.model, "text": result.text[:200]}


@router.post("/model-providers/{profile_id}/test-image")
async def test_model_provider_with_image(
    profile_id: str,
    prompt: str = Form("请用一句中文描述这张图片。"),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    content = await file.read()
    mime_type = file.content_type or "image/png"
    try:
        result = await model_gateway.generate(
            ModelGatewayRequest(
                purpose="vision_understanding",
                model_profile_id=profile_id,
                messages=[
                    text_message("system", "你是模型连接测试助手，请用中文简短回复。"),
                    ModelMessage(role="user", content=[ModelContentPart(type="text", text=prompt), image_file_part(content, mime_type)]),
                ],
            )
        )
    except Exception as error:
        logger.exception("模型供应商本地图片测试失败：档案ID=%s，文件名=%s，错误=%s", profile_id, file.filename, error)
        raise HTTPException(status_code=502, detail=f"模型图片测试失败：{error}") from error
    return {"ok": True, "message": "模型图片测试成功。", "provider": result.provider, "model": result.model, "text": result.text[:200]}


@router.get("/settings/deepseek")
def get_deepseek_settings() -> dict[str, str | bool]:
    return settings_service.get_deepseek_settings()


@router.post("/settings/deepseek")
def save_deepseek_settings(payload: DeepSeekApiKeyPayload) -> dict[str, bool]:
    try:
        settings_service.save_deepseek_settings(payload.api_key, "", "")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    logger.info("DeepSeek 配置已保存：配置状态=true")
    return {"configured": settings_service.has_deepseek_settings()}


@router.get("/settings/seedance")
def get_seedance_settings() -> dict[str, str | bool]:
    return settings_service.get_seedance_settings()


@router.post("/settings/seedance")
def save_seedance_settings(payload: SeedanceApiKeyPayload) -> dict[str, bool]:
    try:
        settings_service.save_seedance_settings(payload.api_key, payload.model)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    logger.info("Seedance API Key 已保存：配置状态=%s", settings_service.has_seedance_api_key())
    return {"configured": settings_service.has_seedance_api_key()}


@router.get("/settings/rightcode")
def get_rightcode_settings() -> dict[str, str | bool]:
    return settings_service.get_rightcode_settings()


@router.post("/settings/rightcode")
def save_rightcode_settings(payload: RightCodeApiKeyPayload) -> dict[str, bool]:
    try:
        settings_service.save_rightcode_settings(payload.api_key, model=payload.model)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    logger.info("RightCode 配置已保存：配置状态=%s", settings_service.has_rightcode_settings())
    return {"configured": settings_service.has_rightcode_settings()}


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
    provider_name = "RightCode" if payload.provider == "rightcode" else "Seedream"
    logger.info("收到图片生成请求：提供方=%s，标题=%s，尺寸=%s", provider_name, payload.title, payload.size)
    try:
        return await seedream_image_client.generate_image(payload)
    except SeedreamImageConfigurationError as error:
        logger.warning("%s 图片生成失败：配置缺失，标题=%s", provider_name, payload.title)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("%s 图片生成失败：标题=%s，错误=%s", provider_name, payload.title, error)
        raise HTTPException(status_code=502, detail=f"{provider_name} 图片生成失败：{error}") from error


@router.post("/storyboard-prompts/frame", response_model=StoryboardFramePromptResult)
async def create_storyboard_frame_prompt(payload: StoryboardFramePromptRequest) -> StoryboardFramePromptResult:
    logger.info("收到小分镜图片提示词生成请求：场景ID=%s，标题=%s", payload.scene_id, payload.scene_title)
    try:
        return await generate_storyboard_frame_prompt(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("小分镜图片提示词生成失败：文本模型配置缺失，场景ID=%s", payload.scene_id)
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
        logger.warning("批量小分镜图片提示词生成失败：文本模型配置缺失，场景ID=%s", payload.scene_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("批量小分镜图片提示词生成失败：场景ID=%s，错误=%s", payload.scene_id, error)
        raise HTTPException(status_code=500, detail=f"批量小分镜图片提示词生成失败：{error}") from error


@router.post("/character-prompts/image", response_model=CharacterImagePromptResult)
async def create_character_image_prompt(payload: CharacterImagePromptRequest) -> CharacterImagePromptResult:
    logger.info("收到角色图片提示词生成请求：角色ID=%s，姓名=%s", payload.character_id, payload.name)
    try:
        return await generate_character_image_prompt(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("角色图片提示词生成失败：文本模型配置缺失，角色ID=%s", payload.character_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("角色图片提示词生成失败：角色ID=%s，错误=%s", payload.character_id, error)
        raise HTTPException(status_code=500, detail=f"角色图片提示词生成失败：{error}") from error


@router.post("/screenplays/export")
def export_screenplay(payload: ScreenplayExportPayload) -> Response:
    logger.info("收到完整剧本导出请求：文档ID=%s，场景数=%s", payload.documentId, len(payload.scenes))
    screenplay_text = _build_full_screenplay_text(payload)
    return Response(content=screenplay_text, media_type="text/plain; charset=utf-8")


@router.post("/screenplays/complete-scene", response_model=ScreenplayCompletionResult)
async def complete_screenplay_scene(payload: ScreenplayCompletionRequest) -> ScreenplayCompletionResult:
    logger.info("收到场景剧本补全请求：文档ID=%s，场景ID=%s，标题=%s", payload.document_id, payload.scene_id, payload.scene_title)
    try:
        return await complete_scene_screenplay(payload)
    except DeepSeekConfigurationError as error:
        logger.warning("场景剧本补全失败：文本模型配置缺失，场景ID=%s", payload.scene_id)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("场景剧本补全失败：场景ID=%s，错误=%s", payload.scene_id, error)
        raise HTTPException(status_code=500, detail=f"场景剧本补全失败：{error}") from error


def _build_full_screenplay_text(payload: ScreenplayExportPayload) -> str:
    lines = [payload.title.strip() or "剧本"]
    exported_scene_count = 0

    for index, scene in enumerate(payload.scenes, start=1):
        content = str(scene.get("content") or "").strip()
        if not content:
            continue

        title = str(scene.get("title") or f"场景 {index}").strip()
        lines.extend(["", f"第 {index} 场 {title}", "", content])
        exported_scene_count += 1

    if exported_scene_count == 0:
        lines.extend(["", "暂无已生成的剧本正文。"])

    return "\n".join(lines).strip() + "\n"
