import base64
import binascii
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
    def __init__(
        self,
        local_url: str = "",
        local_path: str = "",
        original_url: str = "",
        byte_size: int = 0,
        media_hash: str = "",
        media_format: str = "",
        width: int = 0,
        height: int = 0,
        valid: bool = False,
        reason: str = "",
    ) -> None:
        self.local_url = local_url
        self.local_path = local_path
        self.original_url = original_url
        self.byte_size = byte_size
        self.media_hash = media_hash
        self.media_format = media_format
        self.width = width
        self.height = height
        self.valid = valid
        self.reason = reason

    def to_dict(self) -> dict[str, str | int | bool]:
        return {
            "local_url": self.local_url,
            "local_path": self.local_path,
            "original_url": self.original_url,
            "byte_size": self.byte_size,
            "hash": self.media_hash,
            "format": self.media_format,
            "width": self.width,
            "height": self.height,
            "valid": self.valid,
            "reason": self.reason,
        }


async def store_remote_media(url: str, media_kind: MediaKind, fallback_name: str) -> StoredMedia:
    source_url = url.strip()
    if not source_url:
        logger.warning("生成媒体保存跳过：类型=%s，原因=来源地址为空", media_kind)
        return StoredMedia(reason="来源地址为空")

    try:
        async with httpx.AsyncClient(timeout=seedance_config.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(source_url)
            response.raise_for_status()
    except Exception as error:
        logger.warning("生成媒体下载失败：类型=%s，来源=%s，错误=%s", media_kind, _safe_url(source_url), error)
        return StoredMedia(original_url=source_url, reason="远端媒体下载失败")

    if not response.content:
        logger.warning("生成媒体下载结果为空：类型=%s，来源=%s", media_kind, _safe_url(source_url))
        return StoredMedia(original_url=source_url, reason="远端媒体内容为空")

    suffix = _suffix_from_response(source_url, response.headers.get("content-type", ""))
    return _write_media(response.content, media_kind, fallback_name, suffix, source_url)


def store_base64_image(b64_json: str, fallback_name: str) -> StoredMedia:
    content = _strip_base64_data_url(b64_json.strip())
    if not content:
        logger.warning("生成图片 Base64 保存跳过：标题=%s，原因=内容为空", fallback_name)
        return StoredMedia(reason="Base64 内容为空")
    try:
        payload = base64.b64decode(content, validate=True)
    except binascii.Error:
        try:
            payload = base64.b64decode(content)
        except Exception as error:
            logger.warning("生成图片 Base64 解码失败：标题=%s，错误=%s", fallback_name, error)
            return StoredMedia(reason="Base64 解码失败")
    except Exception as error:
        logger.warning("生成图片 Base64 解码失败：标题=%s，错误=%s", fallback_name, error)
        return StoredMedia(reason="Base64 解码失败")
    media_format, _, _ = _media_signature(payload)
    return _write_media(payload, "images", fallback_name, _suffix_from_format(media_format), "")


def _write_media(content: bytes, media_kind: MediaKind, fallback_name: str, suffix: str, original_url: str) -> StoredMedia:
    media_format, width, height = _media_signature(content)
    if media_kind == "images":
        if not media_format:
            logger.warning("生成图片保存跳过：标题=%s，原因=内容不是可识别图片，来源=%s", fallback_name, _safe_url(original_url) if original_url else "Base64")
            return StoredMedia(original_url=original_url, byte_size=len(content), reason="内容不是可识别图片")
        if len(content) < 10240 or (width and height and (width <= 1 or height <= 1)):
            logger.warning(
                "生成图片保存跳过：标题=%s，原因=图片过小或疑似占位图，字节数=%s，宽=%s，高=%s",
                fallback_name,
                len(content),
                width,
                height,
            )
            return StoredMedia(
                original_url=original_url,
                byte_size=len(content),
                media_format=media_format,
                width=width,
                height=height,
                reason="图片过小或疑似占位图",
            )

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
    return StoredMedia(
        local_url=local_url,
        local_path=str(path),
        original_url=original_url,
        byte_size=len(content),
        media_hash=digest,
        media_format=media_format or suffix.strip(".").upper(),
        width=width,
        height=height,
        valid=True,
        reason="已保存",
    )


def _strip_base64_data_url(value: str) -> str:
    if value.startswith("data:") and "," in value:
        return value.split(",", 1)[1].strip()
    return value


def _media_signature(content: bytes) -> tuple[str, int, int]:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        dimensions = _png_dimensions(content) or (0, 0)
        return ("PNG", dimensions[0], dimensions[1])
    if content.startswith(b"\xff\xd8\xff"):
        dimensions = _jpeg_dimensions(content) or (0, 0)
        return ("JPEG", dimensions[0], dimensions[1])
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        if len(content) >= 10:
            return ("GIF", int.from_bytes(content[6:8], "little"), int.from_bytes(content[8:10], "little"))
        return ("GIF", 0, 0)
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ("WEBP", 0, 0)
    return ("", 0, 0)


def _png_dimensions(content: bytes) -> tuple[int, int] | None:
    if len(content) < 24 or not content.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    return (int.from_bytes(content[16:20], "big"), int.from_bytes(content[20:24], "big"))


def _jpeg_dimensions(content: bytes) -> tuple[int, int] | None:
    index = 2
    while index + 9 < len(content):
        if content[index] != 0xFF:
            index += 1
            continue
        marker = content[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(content):
            return None
        segment_length = int.from_bytes(content[index : index + 2], "big")
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF} and index + 7 <= len(content):
            height = int.from_bytes(content[index + 3 : index + 5], "big")
            width = int.from_bytes(content[index + 5 : index + 7], "big")
            return (width, height)
        index += max(segment_length, 2)
    return None


def _suffix_from_response(url: str, content_type: str) -> str:
    suffix = mimetypes.guess_extension(content_type.split(";")[0].strip()) if content_type else ""
    if suffix:
        return suffix
    parsed_suffix = Path(urlparse(url).path).suffix
    return parsed_suffix if parsed_suffix else ".bin"


def _suffix_from_format(media_format: str) -> str:
    return {
        "PNG": ".png",
        "JPEG": ".jpg",
        "GIF": ".gif",
        "WEBP": ".webp",
    }.get(media_format, ".bin")


def _safe_filename(value: str) -> str:
    allowed = []
    for char in value.strip()[:80]:
        if char.isalnum() or "\u4e00" <= char <= "\u9fff" or char in "-_":
            allowed.append(char)
        elif char.isspace() or char in "·：:，,。.":
            allowed.append("-")
    return "".join(allowed).strip("-_")


def _safe_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
