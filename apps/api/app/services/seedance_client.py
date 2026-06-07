import json
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config
from app.services.generated_media_service import store_remote_media

logger = get_logger("services.seedance")


class SeedanceConfigurationError(RuntimeError):
    pass


class SeedanceCreateTaskRequest(BaseModel):
    title: str = ""
    model: str = ""
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    screenplay_text: str = ""
    reference_image_url: str = ""
    reference_image_role: Literal["reference", "first_frame"] = "first_frame"
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
    original_video_url: str = ""
    local_video_path: str = ""
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
            "准备提交 Seedance 视频任务：模型=%s，标题=%s，画幅=%s，时长=%s，清晰度=%s，参考图=%s",
            _request_model(request),
            request.title or "未命名任务",
            request.ratio,
            request.duration,
            request.resolution,
            "有" if request.reference_image_url.strip() else "无",
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
        await _store_video_if_ready(result, request.title or result.id or "视频任务")
        logger.info(
            "Seedance 视频任务已提交：任务ID=%s，状态=%s，模型=%s，视频URL=%s，本地路径=%s",
            result.id,
            result.status,
            result.model,
            "有" if result.video_url else "无",
            result.local_video_path or "无",
        )
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
        await _store_video_if_ready(result, task_id)
        logger.info(
            "Seedance 视频任务查询完成：任务ID=%s，状态=%s，视频URL=%s，本地路径=%s",
            result.id,
            result.status,
            "有" if result.video_url else "无",
            result.local_video_path or "无",
        )
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
        content: list[dict[str, Any]] = []
        if request.reference_image_url.strip():
            content.append(_build_image_content(request.reference_image_url.strip(), request.reference_image_role))
        content.append({"type": "text", "text": text})
        payload: dict[str, Any] = {
            "model": _request_model(request),
            "content": content,
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
    if request.reference_image_url.strip():
        role_text = "首帧" if request.reference_image_role == "first_frame" else "视觉参考"
        parts.append(f"图片约束：已提供一张分镜图片作为{role_text}，请保持主要构图、人物位置、光线氛围和视觉焦点一致。")
    if request.screenplay_text.strip():
        parts.append(f"剧本参考：\n{request.screenplay_text.strip()[:6000]}")
    if request.negative_prompt.strip():
        parts.append(f"请避免：{request.negative_prompt.strip()}")
    if request.camera_fixed:
        parts.append("镜头运动约束：尽量保持镜头稳定，避免大幅晃动。")
    return "\n\n".join(parts)


def _build_image_content(image_url: str, role: str) -> dict[str, Any]:
    return {
        "type": "image_url",
        "image_url": {"url": image_url},
        "role": role,
    }


def _map_task_response(data: dict[str, Any]) -> SeedanceTaskResult:
    video_url = _find_video_url(data)
    error_message = _extract_error_from_payload(data)
    status = _normalize_status(str(data.get("status") or _find_first_string(data, {"status"}) or "unknown"))
    if status not in {"queued", "running", "succeeded", "failed", "expired", "cancelled"}:
        status = "unknown"

    return SeedanceTaskResult(
        id=str(data.get("id") or data.get("task_id") or ""),
        model=str(data.get("model") or seedance_config.model),
        status=status,
        video_url=video_url,
        original_video_url=video_url,
        local_video_path="",
        error_message=error_message,
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        raw=data,
    )


async def _store_video_if_ready(result: SeedanceTaskResult, fallback_name: str) -> None:
    if not result.video_url:
        logger.info("Seedance 视频任务暂无可下载地址：任务ID=%s，状态=%s", result.id, result.status)
        return
    if result.status != "succeeded":
        logger.info("Seedance 视频结果已有地址但状态未完成，暂不下载：任务ID=%s，状态=%s", result.id, result.status)
        return
    stored_media = await store_remote_media(result.video_url, "videos", fallback_name)
    result.original_video_url = result.video_url
    result.local_video_path = stored_media.local_path
    result.video_url = stored_media.local_url or result.video_url


def _normalize_status(status: str) -> str:
    normalized = status.strip().lower()
    if normalized in {"succeeded", "success", "completed", "complete", "done"}:
        return "succeeded"
    if normalized in {"queued", "pending", "created"}:
        return "queued"
    if normalized in {"running", "processing", "in_progress"}:
        return "running"
    if normalized in {"failed", "error"}:
        return "failed"
    if normalized == "expired":
        return "expired"
    if normalized in {"cancelled", "canceled"}:
        return "cancelled"
    return normalized or "unknown"


def _find_video_url(data: dict[str, Any]) -> str:
    for key_set in (
        {"video_url", "videoUrl", "output_url", "outputUrl"},
        {"url", "download_url", "downloadUrl"},
    ):
        found = _find_first_string(data, key_set)
        if found and _looks_like_video_url(found):
            return found
    return ""


def _looks_like_video_url(value: str) -> bool:
    lowered = value.lower().split("?")[0]
    return lowered.endswith((".mp4", ".mov", ".webm", ".m4v")) or "/video" in lowered or "video" in lowered


def _find_first_string(value: Any, keys: set[str]) -> str:
    if isinstance(value, dict):
        for key in keys:
            found = value.get(key)
            if isinstance(found, str) and found.strip():
                return found.strip()
            if isinstance(found, list) and found and isinstance(found[0], str) and found[0].strip():
                return found[0].strip()
        for item in value.values():
            found = _find_first_string(item, keys)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_first_string(item, keys)
            if found:
                return found
    return ""


def _extract_error_from_payload(data: dict[str, Any]) -> str:
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "")
    if error:
        return str(error)
    return ""


def _request_model(request: SeedanceCreateTaskRequest) -> str:
    return request.model.strip() or seedance_config.model


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
    redacted_content: list[dict[str, Any]] = []
    for item in payload.get("content", []):
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text":
            redacted_content.append({"type": "text", "text": "已隐藏提交给 Seedance 的完整提示词，避免调试文件记录完整剧本正文。"})
        else:
            redacted_content.append(item)
    return {
        **payload,
        "content": redacted_content,
    }


seedance_client = SeedanceClient()
