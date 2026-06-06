import json
import os
from pathlib import Path
from typing import Any

import httpx

from app.core.deepseek_config import deepseek_config


class DeepSeekConfigurationError(RuntimeError):
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
            raise

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if not content:
            raise RuntimeError("DeepSeek returned empty content.")

        parsed = json.loads(content)
        _write_debug_json(debug_dir, "parsed_response.json", parsed)
        return parsed


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
