import json
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config

logger = get_logger("services.seedance")


class SeedanceConfigurationError(RuntimeError):
    pass


class SeedanceCreateTaskRequest(BaseModel):
    title: str = ""
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    screenplay_text: str = ""
    ratio: str = "16:9"
    duration: int = 5
    resolution: str = "720p"
    seed: int | None = None
    camera_fixed: bool = False
    generate_audio: bool = True


class SeedanceTaskResult(BaseModel):
    id: str
    model: str = ""
    status: Literal["queued", "running", "succeeded", "failed", "expired", "cancelled", "unknown"] = "unknown"
    video_url: str = ""
    error_message: str = ""
    created_at: int | None = None
    updated_at: int | None = None
    raw: dict[str, Any] = {}


class SeedanceClient:
    async def create_task(self, request: SeedanceCreateTaskRequest) -> SeedanceTaskResult:
        api_key = self._get_api_key()
        payload = self._build_create_payload(request)
        debug_dir = _prepare_debug_dir("create-task")
        _write_debug_json(debug_dir, "request.json", _redact_payload(payload))
        logger.info(
            "准备提交 Seedance 视频任务：模型=%s，标题=%s，画幅=%s，时长=%s，清晰度=%s",
            seedance_config.model,
            request.title or "未命名任务",
            request.ratio,
            request.duration,
            request.resolution,
        )

        try:
            async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds) as client:
                response = await client.post(
                    f"{seedance_config.base_url}/contents/generations/tasks",
                    headers=self._headers(api_key),
                    json=payload,
                )
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            _write_debug_text(debug_dir, "error.txt", error.response.text)
            logger.exception("Seedance 视频任务提交失败：状态码=%s，标题=%s", error.response.status_code, request.title or "未命名任务")
            raise RuntimeError(_extract_error_message(error.response)) from error
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("Seedance 视频任务提交异常：标题=%s，错误=%s", request.title or "未命名任务", error)
            raise

        result = _map_task_response(response.json())
        logger.info("Seedance 视频任务已提交：任务ID=%s，状态=%s，模型=%s", result.id, result.status, result.model)
        return result

    async def get_task(self, task_id: str) -> SeedanceTaskResult:
        api_key = self._get_api_key()
        debug_dir = _prepare_debug_dir(f"get-task-{task_id}")
        logger.info("准备查询 Seedance 视频任务：任务ID=%s", task_id)

        try:
            async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds) as client:
                response = await client.get(
                    f"{seedance_config.base_url}/contents/generations/tasks/{task_id}",
                    headers=self._headers(api_key),
                )
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            _write_debug_text(debug_dir, "error.txt", error.response.text)
            logger.exception("Seedance 视频任务查询失败：任务ID=%s，状态码=%s", task_id, error.response.status_code)
            raise RuntimeError(_extract_error_message(error.response)) from error
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("Seedance 视频任务查询异常：任务ID=%s，错误=%s", task_id, error)
            raise

        result = _map_task_response(response.json())
        logger.info("Seedance 视频任务查询完成：任务ID=%s，状态=%s", result.id, result.status)
        return result

    def _get_api_key(self) -> str:
        api_key = os.getenv("SEEDANCE_API_KEY", "").strip()
        if not api_key:
            raise SeedanceConfigurationError("未配置 Seedance API Key。请先在视频生成页保存 API Key。")
        return api_key

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _build_create_payload(self, request: SeedanceCreateTaskRequest) -> dict[str, Any]:
        text = _build_generation_text(request)
        payload: dict[str, Any] = {
            "model": seedance_config.model,
            "content": [{"type": "text", "text": text}],
            "ratio": request.ratio,
            "duration": request.duration,
            "resolution": request.resolution,
            "generate_audio": request.generate_audio,
            "execution_expires_after": seedance_config.execution_expires_after,
        }
        if request.seed is not None:
            payload["seed"] = request.seed
        return payload


def _build_generation_text(request: SeedanceCreateTaskRequest) -> str:
    parts = [request.prompt.strip()]
    if request.screenplay_text.strip():
        parts.append(f"剧本参考：\n{request.screenplay_text.strip()[:6000]}")
    if request.negative_prompt.strip():
        parts.append(f"请避免：{request.negative_prompt.strip()}")
    if request.camera_fixed:
        parts.append("镜头运动约束：尽量保持镜头稳定，避免大幅晃动。")
    return "\n\n".join(parts)


def _map_task_response(data: dict[str, Any]) -> SeedanceTaskResult:
    content = data.get("content")
    video_url = ""
    if isinstance(content, dict):
        video_url = str(content.get("video_url") or "")

    error = data.get("error")
    error_message = ""
    if isinstance(error, dict):
        error_message = str(error.get("message") or error.get("code") or "")
    elif error:
        error_message = str(error)

    status = str(data.get("status") or "unknown")
    if status not in {"queued", "running", "succeeded", "failed", "expired", "cancelled"}:
        status = "unknown"

    return SeedanceTaskResult(
        id=str(data.get("id") or ""),
        model=str(data.get("model") or seedance_config.model),
        status=status,
        video_url=video_url,
        error_message=error_message,
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        raw=data,
    )


def _extract_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f"Seedance 请求失败：HTTP {response.status_code}"

    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return f"Seedance 请求失败：{message}"
    return f"Seedance 请求失败：HTTP {response.status_code}"


def _prepare_debug_dir(debug_context: str) -> Path:
    safe_context = "".join(char if char.isalnum() or char in "-_" else "-" for char in debug_context)
    debug_dir = seedance_config.debug_dir / safe_context
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def _write_debug_json(debug_dir: Path, filename: str, payload: Any) -> None:
    (debug_dir / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_debug_text(debug_dir: Path, filename: str, content: str) -> None:
    (debug_dir / filename).write_text(content, encoding="utf-8")


def _redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "content": [{"type": "text", "text": "已隐藏提交给 Seedance 的完整提示词，避免调试文件记录完整剧本正文。"}],
    }


seedance_client = SeedanceClient()
