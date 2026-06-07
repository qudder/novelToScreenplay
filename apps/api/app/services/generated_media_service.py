import base64
import hashlib
import mimetypes
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import httpx

from app.core.logging_config import get_logger
from app.core.seedance_config import seedance_config

logger = get_logger("services.generated_media")

MediaKind = Literal["images", "videos"]


class StoredMedia:
    def __init__(self, local_url: str = "", local_path: str = "", original_url: str = "") -> None:
        self.local_url = local_url
        self.local_path = local_path
        self.original_url = original_url


async def store_remote_media(url: str, media_kind: MediaKind, fallback_name: str) -> StoredMedia:
    source_url = url.strip()
    if not source_url:
        logger.warning("生成媒体保存跳过：类型=%s，原因=来源地址为空", media_kind)
        return StoredMedia()

    try:
        async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(source_url)
            response.raise_for_status()
    except Exception as error:
        logger.warning("生成媒体下载失败：类型=%s，来源=%s，错误=%s", media_kind, _safe_url(source_url), error)
        return StoredMedia(original_url=source_url)

    if not response.content:
        logger.warning("生成媒体下载结果为空：类型=%s，来源=%s", media_kind, _safe_url(source_url))
        return StoredMedia(original_url=source_url)

    suffix = _suffix_from_response(source_url, response.headers.get("content-type", ""))
    return _write_media(response.content, media_kind, fallback_name, suffix, source_url)


def store_base64_image(b64_json: str, fallback_name: str) -> StoredMedia:
    content = b64_json.strip()
    if not content:
        logger.warning("生成图片 Base64 保存跳过：标题=%s，原因=内容为空", fallback_name)
        return StoredMedia()
    try:
        payload = base64.b64decode(content)
    except Exception as error:
        logger.warning("生成图片 Base64 解码失败：标题=%s，错误=%s", fallback_name, error)
        return StoredMedia()
    return _write_media(payload, "images", fallback_name, ".png", "")


def _write_media(content: bytes, media_kind: MediaKind, fallback_name: str, suffix: str, original_url: str) -> StoredMedia:
    media_dir = seedance_config.media_dir / media_kind
    media_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(content).hexdigest()[:16]
    safe_name = _safe_filename(fallback_name) or "未命名媒体"
    filename = f"{safe_name}-{digest}{suffix}"
    path = media_dir / filename
    path.write_bytes(content)
    relative_path = f"{media_kind}/{filename}"
    local_url = f"{seedance_config.public_media_prefix}/{relative_path}"
    logger.info("生成媒体已保存到本地：类型=%s，本地路径=%s，访问地址=%s，来源=%s", media_kind, path, local_url, _safe_url(original_url) if original_url else "Base64")
    return StoredMedia(local_url=local_url, local_path=str(path), original_url=original_url)


def _suffix_from_response(url: str, content_type: str) -> str:
    suffix = mimetypes.guess_extension(content_type.split(";")[0].strip()) if content_type else ""
    if suffix:
        return suffix
    parsed_suffix = Path(urlparse(url).path).suffix
    return parsed_suffix if parsed_suffix else ".bin"


def _safe_filename(value: str) -> str:
    allowed = []
    for char in value.strip()[:60]:
        if char.isalnum() or char in "-_":
            allowed.append(char)
        elif char.isspace() or char in "·：:，,。.":
            allowed.append("-")
    return "".join(allowed).strip("-_")


def _safe_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
