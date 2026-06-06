import re
import zipfile
from html import unescape
from io import BytesIO
from xml.etree import ElementTree

from app.domain.models import Chapter

SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".docx"}


class UnsupportedDocumentError(ValueError):
    pass


def extract_text(filename: str, content: bytes) -> str:
    suffix = _get_suffix(filename)
    if suffix not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise UnsupportedDocumentError(f"不支持的文件类型：{suffix or '未知'}。支持：{supported}")

    raw_text = _extract_docx_text(content) if suffix == ".docx" else _decode_text(content)
    return _normalize_text(raw_text)


def parse_document(filename: str, content: bytes) -> list[Chapter]:
    text = extract_text(filename, content)
    return split_into_chapters(text)


def split_into_chapters(text: str) -> list[Chapter]:
    normalized = _normalize_text(text)
    if not normalized:
        return []

    matches = list(_chapter_heading_pattern().finditer(normalized))
    if not matches:
        return [_build_chapter("chapter-1", "全文", normalized, 0, len(normalized))]

    chapters: list[Chapter] = []
    preface = normalized[: matches[0].start()].strip()
    if preface:
        preface_start = normalized.find(preface)
        chapters.append(_build_chapter("chapter-1", "序章", preface, preface_start, preface_start + len(preface)))

    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        raw_block = normalized[match.start() : next_start]
        block = raw_block.strip()
        leading_trim = len(raw_block) - len(raw_block.lstrip())
        trailing_trim = len(raw_block.rstrip())
        source_start = match.start() + leading_trim
        source_end = match.start() + trailing_trim
        lines = block.splitlines()
        title = lines[0].strip()
        body = "\n".join(lines[1:]).strip() or title
        chapters.append(_build_chapter(f"chapter-{len(chapters) + 1}", title, body, source_start, source_end))

    return chapters


def _build_chapter(chapter_id: str, title: str, body: str, source_start: int, source_end: int) -> Chapter:
    summary = _make_summary(body)
    return Chapter(
        id=chapter_id,
        title=title,
        summary=summary,
        word_count=len(re.sub(r"\s+", "", body)),
        conflict=_infer_conflict(body),
        character_ids=[],
        source_start=source_start,
        source_end=source_end,
    )


def _chapter_heading_pattern() -> re.Pattern[str]:
    chinese_number = "零一二三四五六七八九十百千万两〇0-9"
    return re.compile(
        rf"(?m)^\s*(第[{chinese_number}]+[章节卷回幕集].*|Chapter\s+\d+.*|#{1,3}\s+.+)\s*$",
        re.IGNORECASE,
    )


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_docx_text(content: bytes) -> str:
    paragraphs: list[str] = []
    with zipfile.ZipFile(BytesIO(content)) as archive:
        document_xml = archive.read("word/document.xml")

    root = ElementTree.fromstring(document_xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    for paragraph in root.findall(".//w:p", namespace):
        text_parts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        paragraph_text = unescape("".join(text_parts)).strip()
        if paragraph_text:
            paragraphs.append(paragraph_text)

    return "\n".join(paragraphs)


def _get_suffix(filename: str) -> str:
    if "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


def _normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def _make_summary(body: str) -> str:
    compact = re.sub(r"\s+", " ", body).strip()
    if len(compact) <= 120:
        return compact
    return f"{compact[:120]}..."


def _infer_conflict(body: str) -> str:
    conflict_keywords = ("冲突", "争吵", "质问", "威胁", "隐瞒", "背叛", "追问", "阻止", "危机")
    compact = re.sub(r"\s+", " ", body).strip()
    if any(keyword in compact for keyword in conflict_keywords):
        return "检测到潜在冲突，请人工确认。"
    return "未检测到明确冲突，可在事件抽取阶段补充。"
