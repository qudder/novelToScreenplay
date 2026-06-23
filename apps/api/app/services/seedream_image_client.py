import os
import asyncio
import json
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
    provider: Literal["seedream", "rightcode"] = "seedream"
    title: str = ""
    model: str = ""
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    reference_image_urls: list[str] = Field(default_factory=list)
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
        api_key = self._get_api_key(request.provider)
        payload = self._build_payload(request)
        debug_dir = _prepare_debug_dir(request)
        _write_debug_json(debug_dir, "request.json", _redact_payload(payload))
        _write_debug_text(debug_dir, "prompt_summary.txt", _prompt_summary(request.prompt))
        logger.info(
            "准备提交图片生成：提供方=%s，模型=%s，标题=%s，尺寸=%s，参考图数量=%s，调试目录=%s",
            _provider_label(request.provider),
            _request_model(request),
            request.title or "未命名分镜图片",
            request.size,
            len(_reference_image_urls(request)),
            debug_dir,
        )

        try:
            async with httpx.AsyncClient(timeout=_timeout_seconds(request.provider)) as client:
                response = await self._post_with_retry(client, request, payload, debug_dir)
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            _write_debug_text(debug_dir, "error.txt", error.response.text)
            _write_debug_json(debug_dir, "response.json", _response_summary(_safe_response_json(error.response)))
            logger.exception("%s 图片生成失败：状态码=%s，标题=%s", _provider_label(request.provider), error.response.status_code, request.title or "未命名分镜图片")
            raise RuntimeError(_extract_error_message(error.response, request.provider)) from error
        except httpx.TimeoutException as error:
            message = f"{_provider_label(request.provider)} 图片生成请求超时：标题={request.title or '未命名分镜图片'}，超时时间={_timeout_seconds(request.provider)}秒，调试目录={debug_dir}"
            _write_debug_text(debug_dir, "error.txt", message)
            logger.exception("%s", message)
            raise RuntimeError(f"{_provider_label(request.provider)} 图片生成请求超时，请稍后重试或适当简化提示词。") from error
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("%s 图片生成异常：标题=%s，错误=%s", _provider_label(request.provider), request.title or "未命名分镜图片", error)
            raise

        response_payload = response.json()
        _write_debug_json(debug_dir, "response.json", _response_summary(response_payload))
        result = _map_image_response(response_payload)
        stored_media = await _store_image_if_ready(result, _media_fallback_name(request, result))
        result.media = stored_media.to_dict()
        _write_debug_json(debug_dir, "media.json", result.media)
        logger.info(
            "%s 图片生成完成：状态=%s，图片URL=%s，本地路径=%s，Base64=%s，媒体有效=%s",
            _provider_label(request.provider),
            result.status,
            "有" if result.image_url else "无",
            result.local_image_path or "无",
            "有" if result.b64_json else "无",
            "是" if stored_media.valid else "否",
        )
        return result

    async def _post_with_retry(
        self,
        client: httpx.AsyncClient,
        request: SeedreamImageGenerationRequest,
        payload: dict[str, Any],
        debug_dir: Path,
    ) -> httpx.Response:
        max_attempts = _max_attempts(request.provider)
        request_url = _image_generation_url(request.provider)
        for attempt in range(1, max_attempts + 1):
            response = await client.post(
                request_url,
                headers=self._headers(self._get_api_key(request.provider)),
                json=payload,
            )
            if not _should_retry_response(response, request.provider) or attempt >= max_attempts:
                if attempt > 1:
                    _write_debug_text(debug_dir, "retry.txt", f"图片生成重试结束：提供方={_provider_label(request.provider)}，尝试次数={attempt}，状态码={response.status_code}")
                return response

            wait_seconds = _retry_wait_seconds(attempt)
            logger.warning(
                "%s 图片生成遇到上游负载过高，准备重试：标题=%s，尝试次数=%s/%s，等待秒数=%s",
                _provider_label(request.provider),
                request.title or "未命名分镜图片",
                attempt,
                max_attempts,
                wait_seconds,
            )
            await asyncio.sleep(wait_seconds)

        raise RuntimeError(f"{_provider_label(request.provider)} 图片生成重试失败。")

    def _get_api_key(self, provider: Literal["seedream", "rightcode"]) -> str:
        key_name = "RIGHTCODE_API_KEY" if provider == "rightcode" else "SEEDANCE_API_KEY"
        api_key = os.getenv(key_name, "").strip()
        if not api_key:
            provider_name = "第三方服务" if provider == "rightcode" else "Seedance"
            raise SeedreamImageConfigurationError(f"未配置 {provider_name} API Key。请先在系统设置中保存 API Key。")
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
        if _uses_chat_completions(request.provider):
            return {
                "model": _request_model(request),
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            }
        payload: dict[str, Any] = {
            "model": _request_model(request),
            "prompt": prompt,
            "size": request.size,
            "response_format": _response_format(request),
        }
        reference_image_urls = _reference_image_urls(request)
        if reference_image_urls and request.provider != "rightcode":
            payload["image"] = reference_image_urls if len(reference_image_urls) > 1 else reference_image_urls[0]
            payload["reference_image_urls"] = reference_image_urls
        if request.seed is not None and request.provider != "rightcode":
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
    content = _find_chat_message_content(data)
    image_url = _find_image_url(data) or _find_image_url(content)
    b64_json = _find_base64_image(data) or _find_base64_image(content)
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


def _find_image_url(data: Any) -> str:
    return _find_first_string(data, {"url", "image_url", "imageUrl"}, _looks_like_image_url)


def _find_base64_image(data: Any) -> str:
    return _find_first_string(data, {"b64_json", "b64Json", "base64", "image"}, _looks_like_base64_image)


def _find_first_string(value: Any, keys: set[str], predicate: Any | None = None) -> str:
    if isinstance(value, str):
        extracted = _extract_first_url(value) if predicate is _looks_like_image_url else value.strip()
        if extracted and (predicate is None or predicate(extracted)):
            return extracted
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


def _find_chat_message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list):
        return ""
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        message = choice.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return ""


def _extract_first_url(value: str) -> str:
    for token in value.replace("\n", " ").split():
        cleaned = token.strip("`'\"，。,.()[]{}<>")
        if cleaned.startswith(("http://", "https://")):
            return cleaned
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
    if request.model.strip():
        return request.model.strip()
    return seedance_config.rightcode_image_model if request.provider == "rightcode" else seedance_config.image_model


def _reference_image_urls(request: SeedreamImageGenerationRequest) -> list[str]:
    valid_urls: list[str] = []
    ignored_count = 0
    for url in request.reference_image_urls:
        normalized_url = url.strip()
        if not normalized_url:
            continue
        if _is_remote_image_reference_url(normalized_url):
            valid_urls.append(normalized_url)
        else:
            ignored_count += 1
    if ignored_count:
        logger.warning("Seedream 参考图已跳过无效地址：标题=%s，跳过数量=%s", request.title or "未命名分镜图片", ignored_count)
    return valid_urls


def _is_remote_image_reference_url(url: str) -> bool:
    return url.startswith(("http://", "https://"))


def _response_format(request: SeedreamImageGenerationRequest) -> Literal["url", "b64_json"]:
    if _uses_chat_completions(request.provider):
        return "url"
    return "url" if request.provider == "rightcode" else request.response_format


def _uses_chat_completions(provider: Literal["seedream", "rightcode"]) -> bool:
    if provider != "rightcode":
        return False
    return seedance_config.rightcode_image_generation_url.strip().rstrip("/").endswith("/chat/completions")


def _image_generation_url(provider: Literal["seedream", "rightcode"]) -> str:
    label = "第三方服务 OPENAI_BASE_URL" if provider == "rightcode" else "Seedream 图片生成完整地址"
    url = seedance_config.rightcode_image_generation_url if provider == "rightcode" else seedance_config.seedream_image_generation_url
    cleaned = url.strip()
    if not cleaned:
        raise SeedreamImageConfigurationError(f"未配置 {label}。请先在系统设置中填写完整接口地址。")
    return cleaned


def _timeout_seconds(provider: Literal["seedream", "rightcode"]) -> float:
    if provider == "rightcode":
        return seedance_config.rightcode_timeout_seconds
    return seedance_config.timeout_seconds


def _max_attempts(provider: Literal["seedream", "rightcode"]) -> int:
    if provider == "rightcode":
        return max(1, int(os.getenv("RIGHTCODE_MAX_ATTEMPTS", "3")))
    return 1


def _retry_wait_seconds(attempt: int) -> float:
    return min(8.0, 2.0 * attempt)


def _should_retry_response(response: httpx.Response, provider: Literal["seedream", "rightcode"]) -> bool:
    if provider != "rightcode":
        return False
    if response.status_code in {429, 503, 504}:
        return True
    error_message = _response_error_message(response).lower()
    return "excessive system load" in error_message


def _response_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:1000]
    if not isinstance(data, dict):
        return ""
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "")
    return str(error or "")


def _provider_label(provider: Literal["seedream", "rightcode"]) -> str:
    return "第三方服务" if provider == "rightcode" else "Seedream"


def _extract_error_message(response: httpx.Response, provider: Literal["seedream", "rightcode"] = "seedream") -> str:
    provider_name = _provider_label(provider)
    if response.status_code == 405:
        return f"{provider_name} 请求失败：当前接口地址不支持 POST，请检查 OPENAI_BASE_URL 是否为真实的 /images/generations 或 /chat/completions 完整地址。"
    try:
        data = response.json()
    except ValueError:
        return f"{provider_name} 请求失败：HTTP {response.status_code}"

    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            if provider == "rightcode" and "excessive system load" in str(message).lower():
                return "第三方服务请求失败：上游服务负载过高，请稍后重试。"
            return f"{provider_name} 请求失败：{message}"
    return f"{provider_name} 请求失败：HTTP {response.status_code}"


def _prepare_debug_dir(request: SeedreamImageGenerationRequest) -> Path:
    document_dir = document_dir_name(Path(request.filename).stem or "未命名小说", request.document_id or "未知文档")
    chapter_dir = context_dir_name(request.chapter_title, request.chapter_id, "未知章节")
    scene_dir = context_dir_name(request.scene_title, request.scene_id, "未知场景")
    shot_dir = context_dir_name(request.shot_label or request.title, request.shot_id, "未知镜头")
    frame_dir = f"{context_dir_name(request.frame_label, request.frame_id, '未知小分镜')}-{timestamp_slug()}"
    provider_dir = "rightcode" if request.provider == "rightcode" else "seedream"
    debug_dir = seedance_config.seedream_debug_dir / provider_dir / document_dir / chapter_dir / scene_dir / shot_dir / frame_dir
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
    content = _find_chat_message_content(data)
    return {
        "id": data.get("id") or data.get("task_id") or "",
        "model": data.get("model") or "",
        "status": data.get("status") or "",
        "has_image_url": bool(_find_image_url(data) or _find_image_url(content)),
        "has_b64_json": bool(_find_base64_image(data) or _find_base64_image(content)),
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
    reference_urls = payload.get("reference_image_urls")
    reference_count = len(reference_urls) if isinstance(reference_urls, list) else int(bool(payload.get("image")))
    return {
        **payload,
        "prompt": "已隐藏提交给图片模型的完整提示词。",
        "image": "已隐藏参考图片内容。" if payload.get("image") else "",
        "reference_image_urls": f"已隐藏 {reference_count} 张参考图片。",
    }


seedream_image_client = SeedreamImageClient()
