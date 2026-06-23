import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config
from app.core.storage_config import storage_config

logger = get_logger("services.model_provider")

ProviderType = Literal["openai_compatible"]
ModelPurpose = Literal["narrative_analysis", "screenplay_completion", "storyboard_prompt", "vision_understanding"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


@dataclass(frozen=True)
class FixedProviderDefinition:
    id: str
    name: str
    capabilities: list[str]
    api_key_ref: str
    default_base_url: str
    default_model: str
    supports_models_api: bool
    requires_base_url: bool
    timeout_seconds: int = 60
    max_retries: int = 2


class ModelProviderProfile(BaseModel):
    id: str
    name: str
    provider_type: ProviderType = "openai_compatible"
    capabilities: list[str] = ["text", "json"]
    api_key_ref: str = ""
    base_url: str = ""
    chat_completions_url: str = ""
    models_url: str = ""
    model: str
    timeout_seconds: int = 60
    max_retries: int = 2
    enabled: bool = True
    created_at: str = ""
    updated_at: str = ""


class ModelProviderPublicProfile(BaseModel):
    id: str
    name: str
    provider_type: ProviderType
    capabilities: list[str]
    base_url: str
    chat_completions_url: str
    models_url: str
    model: str
    timeout_seconds: int
    max_retries: int
    enabled: bool
    configured: bool
    key_hint: str = ""
    created_at: str
    updated_at: str


class ModelProviderSettings(BaseModel):
    version: int = 2
    providers: dict[str, dict[str, Any]] = {}
    defaults: dict[str, str] = {
        "narrative_analysis": "deepseek",
        "screenplay_completion": "deepseek",
        "storyboard_prompt": "deepseek",
        "vision_understanding": "generic-relay",
    }


class ModelProviderProfilePayload(BaseModel):
    name: str = ""
    api_key: str = ""
    base_url: str = ""
    chat_completions_url: str = ""
    models_url: str = ""
    model: str = ""
    capabilities: list[str] = ["text", "json"]
    timeout_seconds: int = 60
    max_retries: int = 2
    enabled: bool = True


class ModelProviderDefaultsPayload(BaseModel):
    defaults: dict[ModelPurpose, str]


class ModelProviderModelItem(BaseModel):
    id: str
    name: str = ""
    owned_by: str = ""


class ModelProviderModelListResult(BaseModel):
    models: list[ModelProviderModelItem]
    source: str = "fallback"


FIXED_PROVIDERS: dict[str, FixedProviderDefinition] = {
    "deepseek": FixedProviderDefinition(
        id="deepseek",
        name="DeepSeek",
        capabilities=["text", "json", "model_list"],
        api_key_ref="DEEPSEEK_API_KEY",
        default_base_url=deepseek_config.base_url,
        default_model=deepseek_config.model,
        supports_models_api=True,
        requires_base_url=False,
        timeout_seconds=deepseek_config.timeout_seconds,
    ),
    "rightcode": FixedProviderDefinition(
        id="rightcode",
        name="RightCode",
        capabilities=["image"],
        api_key_ref="RIGHTCODE_API_KEY",
        default_base_url=seedance_config.rightcode_base_url,
        default_model=seedance_config.rightcode_image_model,
        supports_models_api=False,
        requires_base_url=False,
        timeout_seconds=int(seedance_config.rightcode_timeout_seconds),
    ),
    "generic-relay": FixedProviderDefinition(
        id="generic-relay",
        name="其他服务商",
        capabilities=["text", "json", "vision", "image", "model_list"],
        api_key_ref="MODEL_PROVIDER_GENERIC_RELAY_API_KEY",
        default_base_url="",
        default_model="",
        supports_models_api=True,
        requires_base_url=True,
        timeout_seconds=120,
    ),
    "seedance": FixedProviderDefinition(
        id="seedance",
        name="Seedance",
        capabilities=["image", "video", "model_list"],
        api_key_ref="SEEDANCE_API_KEY",
        default_base_url=seedance_config.base_url,
        default_model=seedance_config.model,
        supports_models_api=True,
        requires_base_url=False,
        timeout_seconds=int(seedance_config.timeout_seconds),
    ),
}


class ModelProviderService:
    def __init__(self) -> None:
        self.settings_dir = storage_config.root_dir / "settings"
        self.settings_path = self.settings_dir / "model-providers.json"
        self.secrets_path = self.settings_dir / "secrets.env"
        self.legacy_env_path = Path(__file__).resolve().parents[2] / ".env"

    def list_profiles(self) -> list[ModelProviderPublicProfile]:
        settings = self._read_settings()
        return [self._to_public_profile(self._build_fixed_profile(provider_id, settings)) for provider_id in FIXED_PROVIDERS]

    def get_profile(self, profile_id: str | None = None, purpose: ModelPurpose | None = None) -> ModelProviderProfile:
        settings = self._read_settings()
        target_id = profile_id or (settings.defaults.get(purpose) if purpose else "") or "deepseek"
        if target_id not in FIXED_PROVIDERS:
            raise ValueError("模型供应商卡片不存在。")
        profile = self._build_fixed_profile(target_id, settings)
        if purpose and purpose != "vision_understanding" and "text" not in profile.capabilities:
            raise ValueError("当前用途需要文本模型，请在系统设置中选择 DeepSeek 或其他服务商。")
        if purpose == "vision_understanding" and "vision" not in profile.capabilities and "text" not in profile.capabilities:
            raise ValueError("当前用途需要支持文本或视觉理解的模型。")
        return profile

    def get_public_profile(self, profile_id: str) -> ModelProviderPublicProfile:
        return self._to_public_profile(self.get_profile(profile_id=profile_id))

    def get_defaults(self) -> dict[str, str]:
        return self._read_settings().defaults

    def save_defaults(self, defaults: dict[str, str]) -> dict[str, str]:
        settings = self._read_settings()
        for purpose, profile_id in defaults.items():
            if profile_id and profile_id not in FIXED_PROVIDERS:
                raise ValueError(f"默认模型卡片不存在：用途={purpose}。")
        settings.defaults.update({key: value for key, value in defaults.items() if key in settings.defaults})
        self._write_settings(settings)
        logger.info("模型默认用途配置已更新：用途数=%s", len(defaults))
        return settings.defaults

    def create_profile(self, payload: ModelProviderProfilePayload) -> ModelProviderPublicProfile:
        raise ValueError("当前版本只支持固定的四个模型接入卡片。")

    def update_profile(self, profile_id: str, payload: ModelProviderProfilePayload) -> ModelProviderPublicProfile:
        settings = self._read_settings()
        if profile_id not in FIXED_PROVIDERS:
            raise ValueError("模型供应商卡片不存在。")
        definition = FIXED_PROVIDERS[profile_id]
        current = settings.providers.get(profile_id, {})
        base_url = _clean_base_url(payload.base_url or payload.chat_completions_url or str(current.get("base_url") or ""))
        model = (payload.model or str(current.get("model") or "") or definition.default_model).strip()

        if definition.requires_base_url and not base_url:
            raise ValueError(f"请填写{definition.name}接口地址。")
        settings.providers[profile_id] = {
            "base_url": base_url,
            "models_url": (payload.models_url or str(current.get("models_url") or "")).strip(),
            "model": model,
            "enabled": payload.enabled,
            "updated_at": _now_iso(),
        }
        self._write_settings(settings)
        self._save_provider_key(profile_id, payload.api_key)
        logger.info("模型接入卡片已更新：卡片ID=%s，名称=%s，模型=%s", profile_id, definition.name, model or definition.default_model)
        return self._to_public_profile(self._build_fixed_profile(profile_id, settings))

    def delete_profile(self, profile_id: str) -> None:
        raise ValueError("固定模型接入卡片不能删除。")

    def get_api_key(self, profile: ModelProviderProfile) -> str:
        values = self._read_env_values(self.secrets_path)
        legacy_values = self._read_env_values(self.legacy_env_path)
        return (
            values.get(profile.api_key_ref, "").strip()
            or legacy_values.get(profile.api_key_ref, "").strip()
            or os.getenv(profile.api_key_ref, "").strip()
        )

    def get_deepseek_compatible_settings(self) -> dict[str, str | bool]:
        try:
            profile = self.get_profile("deepseek")
        except ValueError:
            return {"configured": False, "openai_base_url": "", "model": ""}
        return {
            "configured": bool(self.get_api_key(profile)) and bool(profile.chat_completions_url) and bool(profile.model),
            "openai_base_url": profile.chat_completions_url,
            "model": profile.model,
        }

    def save_deepseek_compatible_settings(self, api_key: str, openai_base_url: str = "", model: str = "") -> None:
        self.update_profile(
            "deepseek",
            ModelProviderProfilePayload(
                api_key=api_key,
                base_url=openai_base_url,
                model=model or deepseek_config.model,
                capabilities=FIXED_PROVIDERS["deepseek"].capabilities,
            ),
        )

    async def list_models(self, profile_id: str) -> ModelProviderModelListResult:
        profile = self.get_profile(profile_id=profile_id)
        definition = FIXED_PROVIDERS[profile.id]
        if not definition.supports_models_api:
            return ModelProviderModelListResult(models=[], source="unsupported")
        api_key = self.get_api_key(profile)
        if not api_key:
            raise ValueError(f"请先保存{profile.name} API Key 后再查询模型。")
        if profile.id == "seedance":
            request_url = seedance_config.models_url
        else:
            request_url = profile.models_url or _models_url_from_base(profile.base_url or definition.default_base_url)
        if not request_url:
            raise ValueError(f"请先填写{profile.name}接口地址后再查询模型。")

        logger.info("准备查询模型列表：卡片ID=%s，接口地址=%s", profile.id, request_url)
        try:
            async with httpx.AsyncClient(timeout=profile.timeout_seconds) as client:
                response = await client.get(request_url, headers={"Authorization": f"Bearer {api_key}"})
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            logger.warning("模型列表查询失败：卡片ID=%s，状态码=%s", profile.id, error.response.status_code)
            raise RuntimeError(_extract_model_list_error(error.response)) from error
        except Exception as error:
            logger.exception("模型列表查询异常：卡片ID=%s，错误=%s", profile.id, error)
            raise
        models = _parse_model_items(response.json())
        logger.info("模型列表查询完成：卡片ID=%s，模型数=%s", profile.id, len(models))
        return ModelProviderModelListResult(models=models, source="api")

    def _read_settings(self) -> ModelProviderSettings:
        self.settings_dir.mkdir(parents=True, exist_ok=True)
        if self.settings_path.exists():
            raw = json.loads(self.settings_path.read_text(encoding="utf-8"))
            settings = ModelProviderSettings.model_validate(raw if isinstance(raw.get("providers"), dict) else {})
        else:
            settings = ModelProviderSettings()
        self._load_secrets_to_env()
        return self._normalize_settings(settings)

    def _write_settings(self, settings: ModelProviderSettings) -> None:
        self.settings_dir.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(settings.model_dump_json(indent=2), encoding="utf-8")

    def _normalize_settings(self, settings: ModelProviderSettings) -> ModelProviderSettings:
        changed = False
        settings.providers = {provider_id: value for provider_id, value in settings.providers.items() if provider_id in FIXED_PROVIDERS}
        for provider_id in FIXED_PROVIDERS:
            if provider_id not in settings.providers:
                settings.providers[provider_id] = {}
                changed = True
        for purpose, fallback in ModelProviderSettings().defaults.items():
            if not settings.defaults.get(purpose) or settings.defaults[purpose] not in FIXED_PROVIDERS:
                settings.defaults[purpose] = fallback
                changed = True
        if changed:
            self._write_settings(settings)
        return settings

    def _build_fixed_profile(self, provider_id: str, settings: ModelProviderSettings) -> ModelProviderProfile:
        definition = FIXED_PROVIDERS[provider_id]
        override = settings.providers.get(provider_id, {})
        base_url = _clean_base_url(str(override.get("base_url") or "") or definition.default_base_url)
        model = str(override.get("model") or "") or definition.default_model
        now = str(override.get("updated_at") or "") or _now_iso()
        return ModelProviderProfile(
            id=definition.id,
            name=definition.name,
            capabilities=definition.capabilities,
            api_key_ref=definition.api_key_ref,
            base_url=base_url,
            chat_completions_url=_chat_url_from_base(base_url) if ("text" in definition.capabilities or "vision" in definition.capabilities) else "",
            models_url=str(override.get("models_url") or "") or _models_url_from_base(base_url),
            model=model,
            timeout_seconds=definition.timeout_seconds,
            max_retries=definition.max_retries,
            enabled=bool(override.get("enabled", True)),
            created_at=now,
            updated_at=now,
        )

    def _to_public_profile(self, profile: ModelProviderProfile) -> ModelProviderPublicProfile:
        key = self.get_api_key(profile)
        definition = FIXED_PROVIDERS[profile.id]
        configured = bool(key) and (bool(profile.base_url) or not definition.requires_base_url)
        if "text" in profile.capabilities or "vision" in profile.capabilities:
            configured = configured and bool(profile.chat_completions_url) and bool(profile.model)
        return ModelProviderPublicProfile(
            **profile.model_dump(),
            configured=configured,
            key_hint=_key_hint(key),
        )

    def _save_provider_key(self, profile_id: str, api_key: str) -> None:
        cleaned = api_key.strip()
        if not cleaned:
            return
        self._save_secret(FIXED_PROVIDERS[profile_id].api_key_ref, cleaned)

    def _save_secret(self, key_name: str, value: str) -> None:
        values = self._read_env_values(self.secrets_path)
        values[key_name] = value
        self._write_env_values(self.secrets_path, values)
        os.environ[key_name] = value

    def _load_secrets_to_env(self) -> None:
        for key, value in self._read_env_values(self.secrets_path).items():
            os.environ.setdefault(key, value)

    def _read_env_values(self, path: Path) -> dict[str, str]:
        if not path.exists():
            return {}
        values: dict[str, str] = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            item = line.strip()
            if not item or item.startswith("#") or "=" not in item:
                continue
            key, value = item.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
        return values

    def _write_env_values(self, path: Path, values: dict[str, str]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        content = "\n".join(f"{key}={value}" for key, value in sorted(values.items()))
        path.write_text(f"{content}\n" if content else "", encoding="utf-8")


def _clean_base_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    if cleaned.endswith("/chat/completions"):
        return cleaned.removesuffix("/chat/completions")
    if cleaned.endswith("/images/generations"):
        return cleaned.removesuffix("/images/generations")
    if cleaned.endswith("/models"):
        return cleaned.removesuffix("/models")
    return cleaned


def _chat_url_from_base(url: str) -> str:
    cleaned = _clean_base_url(url)
    return f"{cleaned}/chat/completions" if cleaned else ""


def _models_url_from_base(url: str) -> str:
    cleaned = _clean_base_url(url)
    return f"{cleaned}/models" if cleaned else ""


def _parse_model_items(data: dict[str, Any]) -> list[ModelProviderModelItem]:
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    models: list[ModelProviderModelItem] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or "").strip()
        if not model_id:
            continue
        models.append(
            ModelProviderModelItem(
                id=model_id,
                name=str(item.get("name") or model_id),
                owned_by=str(item.get("owned_by") or item.get("owner") or ""),
            )
        )
    return models


def _extract_model_list_error(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f"模型列表查询失败：HTTP {response.status_code}"
    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return f"模型列表查询失败：{message}"
    return f"模型列表查询失败：HTTP {response.status_code}"


def _key_hint(api_key: str) -> str:
    return f"****{api_key[-4:]}" if len(api_key) >= 4 else ""


model_provider_service = ModelProviderService()
