from pathlib import Path

from pydantic import BaseModel


class DeepSeekConfig(BaseModel):
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"
    temperature: float = 0.1
    max_tokens: int = 16000
    timeout_seconds: int = 60
    max_concurrent_chapter_requests: int = 3
    prompt_path: Path = Path(__file__).resolve().parents[1] / "config" / "chapter_analysis_prompt.md"
    screenplay_prompt_path: Path = Path(__file__).resolve().parents[1] / "config" / "screenplay_completion_prompt.md"
    cache_dir: Path = Path(__file__).resolve().parents[1] / ".cache" / "deepseek"
    debug_dir: Path = Path(__file__).resolve().parents[1] / ".debug" / "deepseek"


deepseek_config = DeepSeekConfig()
