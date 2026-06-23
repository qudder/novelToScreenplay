from pathlib import Path

from pydantic import ValidationError

from app.core.persistence import persistence_layout
from app.domain.models import Chapter, Character
from app.services.deepseek_client import deepseek_client


def _chapter_cache_key(chapter: Chapter, chapter_text: str) -> str:
    return persistence_layout.character_extraction_cache_path(chapter, chapter_text).stem


def _chapter_cache_path(chapter: Chapter, chapter_text: str) -> Path:
    return persistence_layout.character_extraction_cache_path(chapter, chapter_text)


async def extract_characters_for_chapters(chapters: list[Chapter], source_text: str) -> list[Character]:
    all_characters: dict[str, Character] = {}
    persistence_layout.deepseek_cache_dir.mkdir(parents=True, exist_ok=True)

    for chapter in chapters:
        chapter_text = _chapter_text(chapter, source_text)
        cache_path = _chapter_cache_path(chapter, chapter_text)

        if cache_path.exists():
            payload = persistence_layout.read_json(cache_path)
        else:
            legacy_cache_path = persistence_layout.legacy_character_extraction_cache_path(chapter, chapter_text)
            if legacy_cache_path.exists():
                payload = persistence_layout.read_json(legacy_cache_path)
                persistence_layout.write_json(cache_path, payload)
            else:
                payload = await deepseek_client.extract_json(_build_user_prompt(chapter, chapter_text))
                persistence_layout.write_json(cache_path, payload)

        for character in _parse_characters(payload, chapter.id):
            existing = all_characters.get(character.name)
            if existing:
                existing.aliases = sorted(set(existing.aliases + character.aliases))
                existing.appearances = sorted(set(existing.appearances + character.appearances))
                existing.importance = max(existing.importance, character.importance)
                if character.description and character.description not in existing.description:
                    existing.description = f"{existing.description}；{character.description}"
            else:
                character.id = f"char-{len(all_characters) + 1}"
                all_characters[character.name] = character

    characters = sorted(all_characters.values(), key=lambda item: item.importance, reverse=True)
    _attach_character_ids(chapters, characters)
    return characters


def _build_user_prompt(chapter: Chapter, chapter_text: str) -> str:
    return (
        "请抽取下面章节中的角色信息，并输出 json。\n\n"
        f"章节 id: {chapter.id}\n"
        f"章节标题: {chapter.title}\n"
        "章节正文:\n"
        f"{chapter_text}"
    )


def _parse_characters(payload: dict, chapter_id: str) -> list[Character]:
    characters: list[Character] = []
    for index, item in enumerate(payload.get("characters", []), start=1):
        try:
            appearances = item.get("appearances") or [chapter_id]
            character = Character(
                id=f"pending-{index}",
                name=str(item.get("name", "")).strip(),
                aliases=[str(alias).strip() for alias in item.get("aliases", []) if str(alias).strip()],
                importance=max(1, min(100, int(item.get("importance", 50)))),
                role=str(item.get("role", "候选角色")).strip() or "候选角色",
                description=str(item.get("description", "等待人工确认。")).strip() or "等待人工确认。",
                appearances=sorted(set(str(value).strip() for value in appearances if str(value).strip())),
            )
        except (TypeError, ValueError, ValidationError):
            continue

        if character.name:
            characters.append(character)

    return characters


def _chapter_text(chapter: Chapter, source_text: str) -> str:
    start = source_text.find(chapter.title)
    if start < 0:
        return f"{chapter.title}\n{chapter.summary}"

    next_index = len(source_text)
    for other_title_match in source_text[start + len(chapter.title) :].splitlines():
        if other_title_match.strip().startswith("第") and "章" in other_title_match:
            marker = source_text.find(other_title_match, start + len(chapter.title))
            if marker > start:
                next_index = marker
                break

    return source_text[start:next_index].strip()


def chapter_text_for_cache(chapter: Chapter, source_text: str) -> str:
    return _chapter_text(chapter, source_text)


def _attach_character_ids(chapters: list[Chapter], characters: list[Character]) -> None:
    for chapter in chapters:
        chapter.character_ids = [character.id for character in characters if chapter.id in character.appearances]
