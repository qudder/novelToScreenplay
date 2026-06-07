import json
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config
from app.core.storage_naming import context_dir_name, document_dir_name, safe_slug, short_hash, timestamp_slug
from app.services.generated_media_service import StoredMedia, store_base64_image, store_remote_media

logger = get_logger("services.seedream_image")


class SeedreamImageConfigurationError(RuntimeError):
    pass


class SeedreamImageGenerationRequest(BaseModel):
    title: str = ""
    model: str = ""
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    size: str = "1920x1920"
    response_format: Literal["url", "b64_json"] = "url"
    seed: int | None = None
    document_id: str = ""
    filename: str = ""
    chapter_id: str = ""
    chapter_title: str = ""
    scene_id: str = ""
    scene_title: str = ""
    shot_id: str = ""
    shot_label: str = ""
    frame_id: str = ""
    frame_label: str = ""


class SeedreamImageGenerationResult(BaseModel):
    id: str = ""
    model: str = ""
    status: Literal["succeeded", "failed", "unknown"] = "unknown"
    image_url: str = ""
    original_image_url: str = ""
    local_image_path: str = ""
    b64_json: str = ""
    error_message: str = ""
    media: dict[str, Any] = {}
    raw: dict[str, Any] = {}


class SeedreamImageClient:
    async def generate_image(self, request: SeedreamImageGenerationRequest) -> SeedreamImageGenerationResult:
        api_key = self._get_api_key()
        payload = self._build_payload(request)
        debug_dir = _prepare_debug_dir(request)
        _write_debug_json(debug_dir, "request.json", _redact_payload(payload))
        _write_debug_text(debug_dir, "prompt_summary.txt", _prompt_summary(request.prompt))
        logger.info(
            "准备提交 Seedream 分镜图片生成：模型=%s，标题=%s，尺寸=%s，调试目录=%s",
            _request_model(request),
            request.title or "未命名分镜图片",
            request.size,
            debug_dir,
        )

        try:
            async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds) as client:
                response = await client.post(
                    f"{seedance_config.base_url}/images/generations",
                    headers=self._headers(api_key),
                    json=payload,
                )
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            _write_debug_text(debug_dir, "error.txt", error.response.text)
            _write_debug_json(debug_dir, "response.json", _response_summary(_safe_response_json(error.response)))
            logger.exception("Seedream 分镜图片生成失败：状态码=%s，标题=%s", error.response.status_code, request.title or "未命名分镜图片")
            raise RuntimeError(_extract_error_message(error.response)) from error
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("Seedream 分镜图片生成异常：标题=%s，错误=%s", request.title or "未命名分镜图片", error)
            raise

        response_payload = response.json()
        _write_debug_json(debug_dir, "response.json", _response_summary(response_payload))
        result = _map_image_response(response_payload)
        stored_media = await _store_image_if_ready(result, _media_fallback_name(request, result))
        result.media = stored_media.to_dict()
        _write_debug_json(debug_dir, "media.json", result.media)
        logger.info(
            "Seedream 分镜图片生成完成：状态=%s，图片URL=%s，本地路径=%s，Base64=%s，媒体有效=%s",
            result.status,
            "有" if result.image_url else "无",
            result.local_image_path or "无",
            "有" if result.b64_json else "无",
            "是" if stored_media.valid else "否",
        )
        return result

    def _get_api_key(self) -> str:
        api_key = os.getenv("SEEDANCE_API_KEY", "").strip()
        if not api_key:
            raise SeedreamImageConfigurationError("未配置 Seedance API Key。请先在分镜生图页保存 API Key。")
        return api_key

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, request: SeedreamImageGenerationRequest) -> dict[str, Any]:
        prompt = request.prompt.strip()
        if request.negative_prompt.strip():
            prompt = f"{prompt}\n\n请避免：{request.negative_prompt.strip()}"
        payload: dict[str, Any] = {
            "model": _request_model(request),
            "prompt": prompt,
            "size": request.size,
            "response_format": request.response_format,
        }
        if request.seed is not None:
            payload["seed"] = request.seed
        return payload


async def _store_image_if_ready(result: SeedreamImageGenerationResult, fallback_name: str) -> StoredMedia:
    if result.image_url:
        stored_media = await store_remote_media(result.image_url, "images", fallback_name)
        result.original_image_url = result.image_url
        result.local_image_path = stored_media.local_path
        result.image_url = stored_media.local_url or result.image_url
        if not stored_media.local_path:
            logger.warning("Seedream 图片未能保存到本地：标题=%s，原因=%s", fallback_name, stored_media.reason or "远端图片下载失败或为空")
        return stored_media

    if result.b64_json:
        stored_media = store_base64_image(result.b64_json, fallback_name)
        result.local_image_path = stored_media.local_path
        result.image_url = stored_media.local_url
        if not stored_media.local_path:
            logger.warning("Seedream 图片未能保存到本地：标题=%s，原因=%s", fallback_name, stored_media.reason or "Base64 写入失败")
        return stored_media

    logger.warning("Seedream 图片未能保存到本地：标题=%s，原因=响应缺少图片 URL 和 Base64", fallback_name)
    return StoredMedia(reason="响应缺少图片 URL 和 Base64")


def _map_image_response(data: dict[str, Any]) -> SeedreamImageGenerationResult:
    image_url = _find_image_url(data)
    b64_json = _find_base64_image(data)
    error_message = _extract_error_from_payload(data)

    status: Literal["succeeded", "failed", "unknown"] = "succeeded" if image_url or b64_json else "unknown"
    if error_message:
        status = "failed"

    return SeedreamImageGenerationResult(
        id=str(data.get("id") or data.get("task_id") or ""),
        model=str(data.get("model") or seedance_config.image_model),
        status=status,
        image_url=image_url,
        original_image_url=image_url,
        local_image_path="",
        b64_json=b64_json,
        error_message=error_message,
        raw=data,
    )


def _find_image_url(data: dict[str, Any]) -> str:
    return _find_first_string(data, {"url", "image_url", "imageUrl"}, _looks_like_image_url)


def _find_base64_image(data: dict[str, Any]) -> str:
    return _find_first_string(data, {"b64_json", "b64Json", "base64", "image"}, _looks_like_base64_image)


def _find_first_string(value: Any, keys: set[str], predicate: Any | None = None) -> str:
    if isinstance(value, dict):
        for key in keys:
            found = value.get(key)
            if isinstance(found, str) and found.strip() and (predicate is None or predicate(found.strip())):
                return found.strip()
            if isinstance(found, list):
                for item in found:
                    if isinstance(item, str) and item.strip() and (predicate is None or predicate(item.strip())):
                        return item.strip()
        for item in value.values():
            found = _find_first_string(item, keys, predicate)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_first_string(item, keys, predicate)
            if found:
                return found
    return ""


def _looks_like_image_url(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith(("http://", "https://")) or lowered.startswith("/")


def _looks_like_base64_image(value: str) -> bool:
    if value.startswith("data:image/"):
        return True
    if value.startswith(("http://", "https://")):
        return False
    compact = value.strip()
    if compact.startswith(("/9j/", "iVBOR", "R0lG", "UklGR")):
        return True
    return len(compact) > 128 and all(char.isalnum() or char in "+/=\r\n" for char in compact[:256])


def _extract_error_from_payload(data: dict[str, Any]) -> str:
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "")
    if error:
        return str(error)
    return ""


def _request_model(request: SeedreamImageGenerationRequest) -> str:
    return request.model.strip() or seedance_config.image_model


def _extract_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f"Seedream 请求失败：HTTP {response.status_code}"

    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return f"Seedream 请求失败：{message}"
    return f"Seedream 请求失败：HTTP {response.status_code}"


def _prepare_debug_dir(request: SeedreamImageGenerationRequest) -> Path:
    document_dir = document_dir_name(Path(request.filename).stem or "未命名小说", request.document_id or "未知文档")
    chapter_dir = context_dir_name(request.chapter_title, request.chapter_id, "未知章节")
    scene_dir = context_dir_name(request.scene_title, request.scene_id, "未知场景")
    shot_dir = context_dir_name(request.shot_label or request.title, request.shot_id, "未知镜头")
    frame_dir = f"{context_dir_name(request.frame_label, request.frame_id, '未知小分镜')}-{timestamp_slug()}"
    debug_dir = seedance_config.seedream_debug_dir / document_dir / chapter_dir / scene_dir / shot_dir / frame_dir
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def _media_fallback_name(request: SeedreamImageGenerationRequest, result: SeedreamImageGenerationResult) -> str:
    parts = [
        safe_slug(Path(request.filename).stem, "未命名小说", 32),
        safe_slug(request.chapter_title or request.chapter_id, "未知章节", 24),
        safe_slug(request.scene_title, "未知场景", 32),
        safe_slug(request.shot_label or request.title or result.id, "未知镜头", 32),
        safe_slug(request.frame_label, "未知小分镜", 24),
    ]
    return "-".join(part for part in parts if part)


def _prompt_summary(prompt: str) -> str:
    safe_excerpt = prompt.strip().replace("\r", " ").replace("\n", " ")[:300]
    return f"提示词字符数：{len(prompt)}\n提示词哈希：{short_hash(prompt)}\n安全摘要：{safe_excerpt}"


def _response_summary(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data.get("id") or data.get("task_id") or "",
        "model": data.get("model") or "",
        "status": data.get("status") or "",
        "has_image_url": bool(_find_image_url(data)),
        "has_b64_json": bool(_find_base64_image(data)),
        "usage": data.get("usage") or {},
        "error": data.get("error") or "",
    }


def _safe_response_json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {"error": {"message": response.text[:1000]}}
    return data if isinstance(data, dict) else {"payload": data}


def _write_debug_json(debug_dir: Path, filename: str, payload: Any) -> None:
    (debug_dir / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_debug_text(debug_dir: Path, filename: str, content: str) -> None:
    (debug_dir / filename).write_text(content, encoding="utf-8")


def _redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "prompt": "已隐藏提交给 Seedream 的完整分镜图片提示词。",
    }


seedream_image_client = SeedreamImageClient()
