import json
import os
from typing import Any

import httpx

from app.core.deepseek_config import deepseek_config


class DeepSeekConfigurationError(RuntimeError):
    pass


class DeepSeekClient:
    async def extract_json(self, user_prompt: str) -> dict[str, Any]:
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise DeepSeekConfigurationError(
                "DEEPSEEK_API_KEY is not set. Create apps/api/.env locally or set the environment variable."
            )

        system_prompt = deepseek_config.prompt_path.read_text(encoding="utf-8")
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

        async with httpx.AsyncClient(timeout=deepseek_config.timeout_seconds) as client:
            response = await client.post(
                f"{deepseek_config.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if not content:
            raise RuntimeError("DeepSeek returned empty content.")

        return json.loads(content)


deepseek_client = DeepSeekClient()

