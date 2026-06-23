import base64
import json
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.core.storage_config import storage_config
from app.services.model_provider_service import ModelProviderProfile, model_provider_service

logger = get_logger("services.model_gateway")

MessageRole = Literal["system", "user", "assistant"]
ContentType = Literal["text", "image_url", "image_base64"]
ResponseFormat = Literal["text", "json_object"]


class ModelContentPart(BaseModel):
    type: ContentType
    text: str = ""
    image_url: str = ""
    mime_type: str = ""
    data: str = ""


class ModelMessage(BaseModel):
    role: MessageRole
    content: list[ModelContentPart]


class ModelGatewayRequest(BaseModel):
    purpose: str = "narrative_analysis"
    model_profile_id: str = ""
    messages: list[ModelMessage]
    response_format: ResponseFormat = "text"
    temperature: float = 0.1
    max_tokens: int = 16000
    stream: bool = False
    debug_context: str = "request"


class ModelGatewayResponse(BaseModel):
    provider: str
    model: str
    text: str
    finish_reason: str = ""
    usage: dict[str, Any] = {}
    raw_response_path: str = ""


class ModelGatewayConfigurationError(RuntimeError):
    pass


class ModelGatewayResponseParseError(RuntimeError):
    pass


class ModelGateway:
    async def generate(self, request: ModelGatewayRequest) -> ModelGatewayResponse:
        profile = model_provider_service.get_profile(
            profile_id=request.model_profile_id or None,
            purpose=request.purpose,  # type: ignore[arg-type]
        )
        api_key = model_provider_service.get_api_key(profile)
        if not api_key:
            raise ModelGatewayConfigurationError("未配置文本模型 API Key。请先在系统设置中保存 API Key。")
        if not profile.chat_completions_url:
            raise ModelGatewayConfigurationError("未配置文本模型 Chat Completions 完整地址。请先在系统设置中填写接口地址。")
        if not profile.enabled:
            raise ModelGatewayConfigurationError("当前文本模型供应商档案已停用，请在系统设置中启用后再使用。")

        debug_dir = _prepare_debug_dir(profile.id, request.debug_context)
        payload = _build_openai_payload(profile, request)
        _write_debug_json(debug_dir, "request.json", _redact_request(payload))

        logger.info(
            "准备文本模型请求：档案ID=%s，模型=%s，接口地址=%s，调试上下文=%s，调试目录=%s",
            profile.id,
            profile.model,
            profile.chat_completions_url,
            request.debug_context,
            debug_dir,
        )
        try:
            async with httpx.AsyncClient(timeout=profile.timeout_seconds) as client:
                response = await client.post(
                    profile.chat_completions_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            message = _extract_http_error_message(error.response)
            _write_debug_text(debug_dir, "error.txt", message)
            logger.exception("文本模型请求失败：档案ID=%s，模型=%s，状态码=%s，错误=%s", profile.id, profile.model, error.response.status_code, message)
            raise RuntimeError(message) from error
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("文本模型请求异常：档案ID=%s，模型=%s，错误=%s", profile.id, profile.model, error)
            raise

        data = response.json()
        choice = data["choices"][0]
        finish_reason = str(choice.get("finish_reason") or "")
        content = _extract_choice_content(choice)
        if not content:
            raise RuntimeError("文本模型返回了空内容。")
        if finish_reason == "length":
            _write_debug_text(debug_dir, "truncated.txt", f"文本模型响应可能被截断：max_tokens={request.max_tokens}。")
        _write_debug_text(debug_dir, "content.txt", content)
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        logger.info("文本模型请求完成：档案ID=%s，模型=%s，输出字符数=%s", profile.id, profile.model, len(content))
        return ModelGatewayResponse(
            provider=profile.id,
            model=profile.model,
            text=content,
            finish_reason=finish_reason,
            usage=usage,
            raw_response_path=str(debug_dir / "raw_response.txt"),
        )


def text_message(role: MessageRole, text: str) -> ModelMessage:
    return ModelMessage(role=role, content=[ModelContentPart(type="text", text=text)])


def image_url_part(url: str) -> ModelContentPart:
    return ModelContentPart(type="image_url", image_url=url)


def image_file_part(content: bytes, mime_type: str) -> ModelContentPart:
    return ModelContentPart(type="image_base64", data=base64.b64encode(content).decode("ascii"), mime_type=mime_type)


def parse_json_content(content: str) -> dict[str, Any]:
    cleaned = _strip_code_fence(content.strip())
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as first_error:
        extracted = _extract_json_object(cleaned)
        if not extracted or extracted == cleaned:
            raise ModelGatewayResponseParseError(str(first_error)) from first_error
        try:
            parsed = json.loads(extracted)
        except json.JSONDecodeError as second_error:
            raise ModelGatewayResponseParseError(str(second_error)) from second_error
    if not isinstance(parsed, dict):
        raise ModelGatewayResponseParseError(f"期望 JSON object，实际得到 {type(parsed).__name__}。")
    return parsed


def _build_openai_payload(profile: ModelProviderProfile, request: ModelGatewayRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": profile.model,
        "messages": [_build_openai_message(message) for message in request.messages],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": request.stream,
    }
    if request.response_format == "json_object":
        payload["response_format"] = {"type": "json_object"}
    return payload


def _build_openai_message(message: ModelMessage) -> dict[str, Any]:
    if len(message.content) == 1 and message.content[0].type == "text":
        return {"role": message.role, "content": message.content[0].text}
    return {"role": message.role, "content": [_build_openai_part(part) for part in message.content]}


def _build_openai_part(part: ModelContentPart) -> dict[str, Any]:
    if part.type == "text":
        return {"type": "text", "text": part.text}
    if part.type == "image_base64":
        mime_type = part.mime_type or "image/png"
        return {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{part.data}"}}
    return {"type": "image_url", "image_url": {"url": part.image_url}}


def _extract_choice_content(choice: dict[str, Any]) -> str:
    message = choice.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        texts = [str(item.get("text") or "") for item in content if isinstance(item, dict)]
        return "\n".join(text for text in texts if text).strip()
    return str(content or "").strip()


def _extract_http_error_message(response: httpx.Response) -> str:
    if response.status_code == 401:
        return "文本模型鉴权失败：请检查系统设置中的 API Key 是否正确，且该 Key 是否属于当前接口地址。"
    if response.status_code == 403:
        return "文本模型请求被拒绝：请检查账号权限、模型权限或服务额度。"
    if response.status_code == 404:
        return "文本模型接口地址不存在：请检查系统设置中的 Chat Completions 完整地址。"
    detail = _extract_response_error_detail(response)
    if detail:
        return f"文本模型请求失败：HTTP {response.status_code}，错误={detail}"
    return f"文本模型请求失败：HTTP {response.status_code}。"


def _extract_response_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text.strip()[:300]
    if not isinstance(data, dict):
        return ""
    error = data.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        return str(message or "").strip()[:300]
    detail = data.get("detail") or data.get("message")
    return str(detail or "").strip()[:300]


def _strip_code_fence(text: str) -> str:
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_json_object(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return ""
    return text[start : end + 1].strip()


def _prepare_debug_dir(profile_id: str, debug_context: str | None) -> Path:
    safe_profile = "".join(char if char.isalnum() or char in "-_" else "-" for char in (profile_id or "provider"))
    safe_context = "".join(char if char.isalnum() or char in "-_" else "-" for char in (debug_context or "request"))
    debug_dir = storage_config.debug_dir / "model-gateway" / safe_profile / safe_context
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def _write_debug_json(debug_dir: Path, filename: str, payload: Any) -> None:
    (debug_dir / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_debug_text(debug_dir: Path, filename: str, content: str) -> None:
    (debug_dir / filename).write_text(content, encoding="utf-8")


def _redact_request(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "debug_note": "请求头中的 Authorization 不会写入调试文件。",
    }


model_gateway = ModelGateway()
