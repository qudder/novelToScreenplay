import os
from pathlib import Path

from pydantic import BaseModel

from app.core.storage_config import storage_config


class DeepSeekConfig(BaseModel):
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"
    temperature: float = 0.1
    max_tokens: int = 16000
    timeout_seconds: int = 60
    max_concurrent_chapter_requests: int = 3
    prompt_path: Path = Path(__file__).resolve().parents[1] / "config" / "chapter_analysis_prompt.md"
    screenplay_prompt_path: Path = Path(__file__).resolve().parents[1] / "config" / "screenplay_completion_prompt.md"
    storyboard_image_prompt_path: Path = Path(__file__).resolve().parents[1] / "config" / "storyboard_image_prompt.md"
    cache_dir: Path = storage_config.cache_dir / "deepseek"
    debug_dir: Path = storage_config.debug_dir / "deepseek"
    legacy_cache_dir: Path = Path(__file__).resolve().parents[1] / ".cache" / "deepseek"
    legacy_debug_dir: Path = Path(__file__).resolve().parents[1] / ".debug" / "deepseek"

    @property
    def current_base_url(self) -> str:
        return os.getenv("DEEPSEEK_BASE_URL", self.base_url).strip().rstrip("/")

    @property
    def chat_completions_url(self) -> str:
        configured_url = os.getenv("DEEPSEEK_CHAT_COMPLETIONS_URL", "").strip()
        if configured_url:
            return _normalize_chat_completions_url(configured_url)
        legacy_base_url = os.getenv("DEEPSEEK_BASE_URL", "").strip().rstrip("/")
        if legacy_base_url:
            return f"{legacy_base_url}/chat/completions"
        return ""

    @property
    def models_url(self) -> str:
        configured_url = os.getenv("DEEPSEEK_MODELS_URL", "").strip()
        if configured_url:
            return configured_url
        legacy_base_url = os.getenv("DEEPSEEK_BASE_URL", "").strip().rstrip("/")
        if legacy_base_url:
            return f"{legacy_base_url}/models"
        chat_url = self.chat_completions_url.strip().rstrip("/")
        if chat_url.endswith("/chat/completions"):
            return f"{chat_url.removesuffix('/chat/completions')}/models"
        return ""

    @property
    def current_model(self) -> str:
        return os.getenv("DEEPSEEK_MODEL", self.model).strip() or self.model


deepseek_config = DeepSeekConfig()


def _normalize_chat_completions_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    if not cleaned:
        return ""
    if cleaned.endswith("/chat/completions"):
        return cleaned
    return f"{cleaned}/chat/completions"
