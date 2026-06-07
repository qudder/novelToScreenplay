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


deepseek_config = DeepSeekConfig()
