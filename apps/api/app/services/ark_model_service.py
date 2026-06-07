import os
from typing import Any

import httpx
from pydantic import BaseModel

from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config

logger = get_logger("services.ark_models")


class ArkModelItem(BaseModel):
    id: str
    name: str = ""
    owned_by: str = ""


class ArkModelListResult(BaseModel):
    models: list[ArkModelItem]


class ArkModelConfigurationError(RuntimeError):
    pass


class ArkModelService:
    async def list_models(self) -> ArkModelListResult:
        api_key = os.getenv("SEEDANCE_API_KEY", "").strip()
        if not api_key:
            raise ArkModelConfigurationError("未配置 Seedance API Key。请先保存 API Key 后再查询可用模型。")

        logger.info("准备查询 Ark 可用模型列表：基础地址=%s", seedance_config.base_url)
        try:
            async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds) as client:
                response = await client.get(
                    f"{seedance_config.base_url}/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            logger.exception("Ark 可用模型查询失败：状态码=%s", error.response.status_code)
            raise RuntimeError(_extract_error_message(error.response)) from error
        except Exception as error:
            logger.exception("Ark 可用模型查询异常：错误=%s", error)
            raise

        models = _parse_models(response.json())
        logger.info("Ark 可用模型查询完成：模型数=%s", len(models))
        return ArkModelListResult(models=models)


def _parse_models(data: dict[str, Any]) -> list[ArkModelItem]:
    items = data.get("data")
    if not isinstance(items, list):
        return []

    models: list[ArkModelItem] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or "").strip()
        if not model_id:
            continue
        models.append(
            ArkModelItem(
                id=model_id,
                name=str(item.get("name") or model_id),
                owned_by=str(item.get("owned_by") or item.get("owner") or ""),
            )
        )
    return models


def _extract_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f"Ark 模型查询失败：HTTP {response.status_code}"

    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return f"Ark 模型查询失败：{message}"
    return f"Ark 模型查询失败：HTTP {response.status_code}"


ark_model_service = ArkModelService()
