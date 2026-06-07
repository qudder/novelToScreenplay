import hashlib
from datetime import datetime
from typing import Any


def safe_slug(value: Any, fallback: str = "未命名", max_length: int = 48) -> str:
    text = str(value or "").strip()
    parts: list[str] = []
    previous_dash = False
    for char in text[: max_length * 2]:
        if char.isalnum() or "\u4e00" <= char <= "\u9fff":
            parts.append(char)
            previous_dash = False
        elif char in "-_":
            parts.append(char)
            previous_dash = char == "-"
        elif not previous_dash:
            parts.append("-")
            previous_dash = True
    slug = "".join(parts).strip("-_")
    return (slug or fallback)[:max_length]


def short_hash(value: str | bytes, length: int = 12) -> str:
    payload = value if isinstance(value, bytes) else value.encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:length]


def timestamp_slug() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def document_dir_name(filename: str, document_id: str) -> str:
    return f"{safe_slug(filename, '未命名小说', 40)}-{safe_slug(document_id, '未知文档', 36)}"


def context_dir_name(title: str, item_id: str, fallback: str, max_length: int = 40) -> str:
    title_slug = safe_slug(title, fallback, max_length)
    id_slug = safe_slug(item_id, "", 36)
    return f"{title_slug}-{id_slug}" if id_slug else title_slug
