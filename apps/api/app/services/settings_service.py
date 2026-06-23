import os
from pathlib import Path
from urllib.parse import urlparse

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config
from app.services.model_provider_service import model_provider_service

logger = get_logger("services.settings")


class SettingsService:
    def __init__(self) -> None:
        self.env_path = Path(__file__).resolve().parents[2] / ".env"

    def has_deepseek_api_key(self) -> bool:
        return bool(model_provider_service.get_deepseek_compatible_settings()["configured"])

    def has_seedance_api_key(self) -> bool:
        return bool(self._current_value("SEEDANCE_API_KEY"))

    def has_rightcode_api_key(self) -> bool:
        return bool(self._current_value("RIGHTCODE_API_KEY"))

    def has_deepseek_settings(self) -> bool:
        return bool(model_provider_service.get_deepseek_compatible_settings()["configured"])

    def has_rightcode_settings(self) -> bool:
        return self.has_rightcode_api_key() and bool(seedance_config.rightcode_image_generation_url) and bool(seedance_config.rightcode_image_model)

    def get_deepseek_settings(self) -> dict[str, str | bool]:
        return model_provider_service.get_deepseek_compatible_settings()

    def get_seedance_settings(self) -> dict[str, str | bool]:
        return {
            "configured": self.has_seedance_api_key(),
            "model": seedance_config.model,
        }

    def get_rightcode_settings(self) -> dict[str, str | bool]:
        return {
            "configured": self.has_rightcode_settings(),
            "openai_base_url": seedance_config.rightcode_image_generation_url,
            "model": seedance_config.rightcode_image_model,
        }

    def save_deepseek_api_key(self, api_key: str) -> None:
        self.save_api_key("DEEPSEEK_API_KEY", api_key)

    def save_deepseek_settings(self, api_key: str, openai_base_url: str, model: str) -> None:
        model_provider_service.save_deepseek_compatible_settings(api_key, openai_base_url, model)
        logger.info(
            "DeepSeek 配置已更新：使用内置接口地址=%s，配置状态=%s",
            deepseek_config.base_url,
            True,
        )

    def save_seedance_api_key(self, api_key: str) -> None:
        self.save_api_key("SEEDANCE_API_KEY", api_key)

    def save_seedance_settings(self, api_key: str, model: str = "") -> None:
        existing_key = self._current_value("SEEDANCE_API_KEY")
        cleaned_key = api_key.strip() or existing_key
        if not cleaned_key:
            raise ValueError("请先填写 Seedance API Key。")

        values = {
            "SEEDANCE_API_KEY": cleaned_key,
            "SEEDANCE_MODEL": model.strip() or seedance_config.model,
        }
        self.save_env_values(values)
        logger.info("Seedance 配置已更新：模型=%s，配置状态=%s", values["SEEDANCE_MODEL"], bool(values["SEEDANCE_API_KEY"]))

    def save_rightcode_api_key(self, api_key: str) -> None:
        self.save_api_key("RIGHTCODE_API_KEY", api_key)

    def save_rightcode_settings(self, api_key: str, openai_base_url: str = "", model: str = "") -> None:
        existing_key = self._current_value("RIGHTCODE_API_KEY")
        cleaned_key = api_key.strip() or existing_key
        if not cleaned_key:
            raise ValueError("请先填写 RightCode API Key。")

        values = {
            "RIGHTCODE_API_KEY": cleaned_key,
            "RIGHTCODE_IMAGE_GENERATION_URL": _require_image_generation_url(
                openai_base_url or seedance_config.rightcode_image_generation_url,
                "RightCode 图片生成接口地址",
            ),
            "RIGHTCODE_IMAGE_MODEL": (model.strip() or seedance_config.rightcode_image_model),
        }
        self.save_env_values(values)
        logger.info(
            "RightCode 配置已更新：接口地址=%s，配置状态=%s",
            values["RIGHTCODE_IMAGE_GENERATION_URL"],
            bool(values["RIGHTCODE_API_KEY"]),
        )

    def save_api_key(self, key_name: str, api_key: str) -> None:
        cleaned_key = api_key.strip()
        self.save_env_values({key_name: cleaned_key})
        logger.info("模型 API Key 已更新：配置项=%s，环境文件=%s，配置状态=%s", key_name, self.env_path, bool(cleaned_key))

    def save_env_values(self, next_values: dict[str, str]) -> None:
        self.env_path.parent.mkdir(parents=True, exist_ok=True)

        values = self._read_env_values()
        values.update(next_values)
        self._write_env_values(values)
        for key, value in next_values.items():
            os.environ[key] = value

    def _read_env_values(self) -> dict[str, str]:
        if not self.env_path.exists():
            return {}

        values: dict[str, str] = {}
        for line in self.env_path.read_text(encoding="utf-8").splitlines():
            item = line.strip()
            if not item or item.startswith("#") or "=" not in item:
                continue
            key, value = item.split("=", 1)
            values[key.strip()] = value.strip()
        return values

    def _current_value(self, key_name: str) -> str:
        values = self._read_env_values()
        if key_name in values:
            return values[key_name].strip()
        return os.getenv(key_name, "").strip()

    def _write_env_values(self, values: dict[str, str]) -> None:
        content = "\n".join(f"{key}={value}" for key, value in sorted(values.items()))
        self.env_path.write_text(f"{content}\n", encoding="utf-8")


settings_service = SettingsService()


def _clean_url(url: str, fallback: str) -> str:
    cleaned = url.strip()
    return cleaned or fallback


def _require_url(url: str, label: str) -> str:
    cleaned = url.strip()
    if not cleaned:
        raise ValueError(f"请填写{label}。")
    return cleaned


def _require_value(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"请填写{label}。")
    return cleaned


def _require_image_generation_url(url: str, label: str) -> str:
    cleaned = _require_url(url, label).rstrip("/")
    parsed_url = urlparse(cleaned)
    if parsed_url.hostname == "example.com":
        raise ValueError(f"{label} 不能使用示例地址，请填写第三方服务提供的真实接口地址。")
    if not (cleaned.endswith("/images/generations") or cleaned.endswith("/chat/completions")):
        raise ValueError(f"{label} 需要填写完整接口地址，例如 https://example.com/v1/images/generations 或 https://example.com/v1/chat/completions。")
    return cleaned
