from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.domain.models import AnalysisResult, AnalysisStartResult, ImportResult, Workspace
from app.services.document_parser import UnsupportedDocumentError
from app.services.deepseek_client import DeepSeekConfigurationError
from app.services.settings_service import settings_service
from app.services.workspace_service import workspace_service

router = APIRouter()


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
    try:
        return await workspace_service.import_document(file)
    except UnsupportedDocumentError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except DeepSeekConfigurationError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/documents/{document_id}/analysis", response_model=AnalysisResult)
def get_document_analysis(document_id: str) -> AnalysisResult:
    analysis = workspace_service.get_analysis(document_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Document not found.")
    return analysis


@router.post("/documents/{document_id}/analysis", response_model=AnalysisStartResult)
def start_document_analysis(document_id: str, background_tasks: BackgroundTasks) -> AnalysisStartResult:
    result = workspace_service.start_analysis(document_id)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found.")

    if result.status == "running":
        background_tasks.add_task(workspace_service.run_analysis, document_id)

    return result


@router.get("/settings/deepseek")
def get_deepseek_settings() -> dict[str, bool]:
    return {"configured": settings_service.has_deepseek_api_key()}


@router.post("/settings/deepseek")
def save_deepseek_settings(payload: DeepSeekApiKeyPayload) -> dict[str, bool]:
    settings_service.save_deepseek_api_key(payload.api_key)
    return {"configured": True}
