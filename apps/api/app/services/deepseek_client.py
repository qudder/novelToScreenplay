import json
import os
from pathlib import Path
from typing import Any

import httpx

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger

logger = get_logger("services.deepseek")


class DeepSeekConfigurationError(RuntimeError):
    pass


class DeepSeekResponseParseError(RuntimeError):
    pass


class DeepSeekClient:
    async def extract_json(self, user_prompt: str, debug_context: str | None = None) -> dict[str, Any]:
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise DeepSeekConfigurationError(
                "DEEPSEEK_API_KEY is not set. Create apps/api/.env locally or set the environment variable."
            )

        system_prompt = deepseek_config.prompt_path.read_text(encoding="utf-8")
        debug_dir = _prepare_debug_dir(debug_context)
        logger.info("准备 DeepSeek 请求：模型=%s，调试上下文=%s，调试目录=%s", deepseek_config.model, debug_context, debug_dir)
        payload = {
            "model": deepseek_config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": deepseek_config.temperature,
            "max_tokens": deepseek_config.max_tokens,
            "response_format": {"type": "json_object"},
            "stream": False,
        }
        _write_debug_json(debug_dir, "request.json", _redact_request(payload))
        _write_debug_text(debug_dir, "system_prompt.md", system_prompt)
        _write_debug_text(debug_dir, "user_prompt.md", user_prompt)

        try:
            async with httpx.AsyncClient(timeout=deepseek_config.timeout_seconds) as client:
                response = await client.post(
                    f"{deepseek_config.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                _write_debug_text(debug_dir, "raw_response.txt", response.text)
                response.raise_for_status()
        except Exception as error:
            _write_debug_text(debug_dir, "error.txt", repr(error))
            logger.exception("DeepSeek 请求失败：调试上下文=%s，错误=%s", debug_context, error)
            raise

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if not content:
            raise RuntimeError("DeepSeek 返回了空内容。")

        try:
            parsed = _parse_json_content(content)
        except DeepSeekResponseParseError as error:
            _write_debug_text(debug_dir, "parse_error.txt", repr(error))
            _write_debug_text(debug_dir, "content_for_parse.txt", content)
            logger.exception("DeepSeek JSON 解析失败：调试上下文=%s，错误=%s", debug_context, error)
            raise

        _write_debug_json(debug_dir, "parsed_response.json", parsed)
        logger.info("DeepSeek 响应解析完成：调试上下文=%s，字段=%s", debug_context, list(parsed.keys()))
        return parsed


def _parse_json_content(content: str) -> dict[str, Any]:
    cleaned = _strip_code_fence(content.strip())
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as first_error:
        extracted = _extract_json_object(cleaned)
        if not extracted or extracted == cleaned:
            raise DeepSeekResponseParseError(str(first_error)) from first_error

        try:
            parsed = json.loads(extracted)
        except json.JSONDecodeError as second_error:
            raise DeepSeekResponseParseError(str(second_error)) from second_error

    if not isinstance(parsed, dict):
        raise DeepSeekResponseParseError(f"期望 JSON object，实际得到 {type(parsed).__name__}。")
    return parsed


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


def _prepare_debug_dir(debug_context: str | None) -> Path:
    safe_context = "".join(char if char.isalnum() or char in "-_" else "-" for char in (debug_context or "request"))
    debug_dir = deepseek_config.debug_dir / safe_context
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def _write_debug_json(debug_dir: Path, filename: str, payload: Any) -> None:
    (debug_dir / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_debug_text(debug_dir: Path, filename: str, content: str) -> None:
    (debug_dir / filename).write_text(content, encoding="utf-8")


def _redact_request(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "debug_note": "Authorization header is intentionally not stored.",
    }


deepseek_client = DeepSeekClient()
