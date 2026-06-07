import os
from pathlib import Path

from app.core.logging_config import get_logger

logger = get_logger("services.settings")


class SettingsService:
    def __init__(self) -> None:
        self.env_path = Path(__file__).resolve().parents[2] / ".env"

    def has_deepseek_api_key(self) -> bool:
        return bool(os.getenv("DEEPSEEK_API_KEY", "").strip())

    def has_seedance_api_key(self) -> bool:
        return bool(os.getenv("SEEDANCE_API_KEY", "").strip())

    def save_deepseek_api_key(self, api_key: str) -> None:
        self.save_api_key("DEEPSEEK_API_KEY", api_key)

    def save_seedance_api_key(self, api_key: str) -> None:
        self.save_api_key("SEEDANCE_API_KEY", api_key)

    def save_api_key(self, key_name: str, api_key: str) -> None:
        cleaned_key = api_key.strip()
        self.env_path.parent.mkdir(parents=True, exist_ok=True)

        values = self._read_env_values()
        values[key_name] = cleaned_key
        self._write_env_values(values)
        os.environ[key_name] = cleaned_key
        logger.info("模型 API Key 已更新：配置项=%s，环境文件=%s，配置状态=%s", key_name, self.env_path, bool(cleaned_key))

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

    def _write_env_values(self, values: dict[str, str]) -> None:
        content = "\n".join(f"{key}={value}" for key, value in sorted(values.items()))
        self.env_path.write_text(f"{content}\n", encoding="utf-8")


settings_service = SettingsService()
