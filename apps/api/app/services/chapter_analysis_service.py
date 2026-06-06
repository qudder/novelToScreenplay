import asyncio
import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.domain.models import (
    Action,
    CausalLink,
    Chapter,
    ChapterAnalysis,
    Character,
    Conflict,
    Dialogue,
    EmotionArc,
    Event,
    Location,
    Motivation,
    Relationship,
    Scene,
    TimeMarker,
)
from app.services.deepseek_client import deepseek_client

logger = get_logger("services.chapter_analysis")


class AggregatedAnalysis:
    def __init__(self, chapter_analyses: list[ChapterAnalysis]) -> None:
        self.chapter_analyses = chapter_analyses
        self.characters = self._merge_characters()
        self.locations = self._collect("locations")
        self.time_markers = self._collect("time_markers")
        self.events = self._collect("events")
        self.relationships = self._collect("relationships")
        self.conflicts = self._collect("conflicts")
        self.dialogues = self._collect("dialogues")
        self.actions = self._collect("actions")
        self.motivations = self._collect("motivations")
        self.causal_links = self._collect("causal_links")
        self.scenes = self._collect("scene_candidates")

    def _collect(self, field_name: str) -> list:
        items: list = []
        index = 1
        for analysis in self.chapter_analyses:
            for item in getattr(analysis, field_name):
                if hasattr(item, "id"):
                    item.id = f"{field_name}-{index}"
                items.append(item)
                index += 1
        return items

    def _merge_characters(self) -> list[Character]:
        merged: dict[str, Character] = {}
        for analysis in self.chapter_analyses:
            for character in analysis.characters:
                existing = merged.get(character.name)
                if existing:
                    existing.aliases = sorted(set(existing.aliases + character.aliases))
                    existing.appearances = sorted(set(existing.appearances + character.appearances))
                    existing.importance = max(existing.importance, character.importance)
                    if character.description and character.description not in existing.description:
                        existing.description = f"{existing.description}; {character.description}"
                else:
                    character.id = f"char-{len(merged) + 1}"
                    merged[character.name] = character
        return sorted(merged.values(), key=lambda item: item.importance, reverse=True)


async def analyze_chapters(chapters: list[Chapter], source_text: str) -> AggregatedAnalysis:
    deepseek_config.cache_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(deepseek_config.max_concurrent_chapter_requests)
    logger.info("开始分发章节叙事分析：章节数=%s，最大并发=%s", len(chapters), deepseek_config.max_concurrent_chapter_requests)
    analyses = await asyncio.gather(
        *[_analyze_single_chapter(chapter, source_text, semaphore) for chapter in chapters]
    )

    aggregated = AggregatedAnalysis(list(analyses))
    _attach_character_ids(chapters, aggregated.characters)
    _attach_event_and_scene_ids(aggregated)
    return aggregated


async def _analyze_single_chapter(
    chapter: Chapter,
    source_text: str,
    semaphore: asyncio.Semaphore,
) -> ChapterAnalysis:
    chapter_text = _chapter_text(chapter, source_text)
    cache_path = _chapter_cache_path(chapter, chapter_text)

    if cache_path.exists():
        logger.info("章节叙事分析命中缓存：章节ID=%s，缓存路径=%s", chapter.id, cache_path)
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        return _parse_analysis(chapter.id, payload)

    async with semaphore:
        user_prompt = _build_user_prompt(chapter, chapter_text)
        debug_dir = _chapter_debug_dir(chapter, chapter_text)
        debug_dir.mkdir(parents=True, exist_ok=True)
        logger.info("请求章节叙事分析：章节ID=%s，标题=%s，正文字符数=%s，调试目录=%s", chapter.id, chapter.title, len(chapter_text), debug_dir)
        (debug_dir / "user_prompt.md").write_text(user_prompt, encoding="utf-8")
        (debug_dir / "chapter_text.txt").write_text(chapter_text, encoding="utf-8")
        payload = await deepseek_client.extract_json(
            user_prompt,
            debug_context=f"{chapter.id}-{_chapter_cache_key(chapter, chapter_text)[:12]}",
        )
        (debug_dir / "model_output.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("章节叙事分析已写入缓存：章节ID=%s，缓存路径=%s", chapter.id, cache_path)
        return _parse_analysis(chapter.id, payload)


def _chapter_cache_key(chapter: Chapter, chapter_text: str) -> str:
    digest = hashlib.sha256(f"chapter-analysis-v1\n{chapter.id}\n{chapter.title}\n{chapter_text}".encode("utf-8")).hexdigest()
    return digest


def _chapter_cache_path(chapter: Chapter, chapter_text: str) -> Path:
    return deepseek_config.cache_dir / f"{_chapter_cache_key(chapter, chapter_text)}.json"


def _chapter_debug_dir(chapter: Chapter, chapter_text: str) -> Path:
    return deepseek_config.debug_dir / f"{chapter.id}-{_chapter_cache_key(chapter, chapter_text)[:12]}"


def _build_user_prompt(chapter: Chapter, chapter_text: str) -> str:
    return (
        "Extract structured narrative information from this chapter and return JSON only.\n\n"
        f"chapter_id: {chapter.id}\n"
        f"chapter_title: {chapter.title}\n"
        "chapter_text:\n"
        f"{chapter_text}"
    )


def _parse_analysis(chapter_id: str, payload: dict[str, Any]) -> ChapterAnalysis:
    return ChapterAnalysis(
        chapter_id=chapter_id,
        characters=[_parse_character(item, chapter_id) for item in payload.get("characters", []) if _has_name(item)],
        locations=[_parse_location(item, chapter_id) for item in payload.get("locations", []) if _has_name(item)],
        time_markers=[_parse_time_marker(item, chapter_id) for item in payload.get("time_markers", [])],
        events=[_parse_event(item, chapter_id) for item in payload.get("events", []) if item.get("title")],
        relationships=[_parse_relationship(item) for item in payload.get("relationships", []) if item.get("source") and item.get("target")],
        conflicts=[_parse_conflict(item, chapter_id) for item in payload.get("conflicts", [])],
        dialogues=[_parse_dialogue(item, chapter_id) for item in payload.get("dialogues", [])],
        actions=[_parse_action(item, chapter_id) for item in payload.get("actions", [])],
        motivations=[_parse_motivation(item, chapter_id) for item in payload.get("motivations", [])],
        causal_links=[_parse_causal_link(item, chapter_id) for item in payload.get("causal_links", [])],
        scene_candidates=[_parse_scene(item) for item in payload.get("scene_candidates", []) if item.get("title")],
        emotion_arc=_parse_emotion_arc(payload.get("emotion_arc", {})),
    )


def _parse_character(item: dict[str, Any], chapter_id: str) -> Character:
    appearances = item.get("appearances") or [chapter_id]
    return Character(
        id="",
        name=_text(item.get("name")),
        aliases=[_text(alias) for alias in item.get("aliases", []) if _text(alias)],
        importance=_score(item.get("importance"), default=50),
        role=_text(item.get("role")) or "candidate",
        description=_text(item.get("description")),
        appearances=sorted(set(_text(value) for value in appearances if _text(value))),
    )


def _parse_location(item: dict[str, Any], chapter_id: str) -> Location:
    return Location(
        name=_text(item.get("name")),
        type=_text(item.get("type")),
        description=_text(item.get("description")),
        evidence=_text(item.get("evidence")),
        chapter_id=chapter_id,
    )


def _parse_time_marker(item: dict[str, Any], chapter_id: str) -> TimeMarker:
    return TimeMarker(
        chapter_id=chapter_id,
        time_text=_text(item.get("time_text")),
        normalized_time=_text(item.get("normalized_time")),
        time_of_day=_text(item.get("time_of_day")),
        sequence_order=_int(item.get("sequence_order")),
    )


def _parse_event(item: dict[str, Any], chapter_id: str) -> Event:
    return Event(
        chapter_id=chapter_id,
        title=_text(item.get("title")),
        summary=_text(item.get("summary")),
        conflict=_text(item.get("conflict")),
        character_ids=[],
        characters=[_text(value) for value in item.get("characters", []) if _text(value)],
        location=_text(item.get("location")),
        time_text=_text(item.get("time_text")),
        consequence=_text(item.get("consequence")),
    )


def _parse_relationship(item: dict[str, Any]) -> Relationship:
    return Relationship(
        source=_text(item.get("source")),
        target=_text(item.get("target")),
        type=_text(item.get("type")) or "unknown",
        strength=_score(item.get("strength"), default=50),
        evidence=_text(item.get("evidence")),
    )


def _parse_conflict(item: dict[str, Any], chapter_id: str) -> Conflict:
    return Conflict(
        chapter_id=chapter_id,
        conflict_type=_text(item.get("conflict_type")),
        participants=[_text(value) for value in item.get("participants", []) if _text(value)],
        desire=_text(item.get("desire")),
        obstacle=_text(item.get("obstacle")),
        outcome=_text(item.get("outcome")),
        evidence=_text(item.get("evidence")),
    )


def _parse_dialogue(item: dict[str, Any], chapter_id: str) -> Dialogue:
    return Dialogue(
        chapter_id=chapter_id,
        speaker=_text(item.get("speaker")),
        listener=_text(item.get("listener")),
        content=_text(item.get("content")),
        emotion=_text(item.get("emotion")),
        source_text=_text(item.get("source_text")),
    )


def _parse_action(item: dict[str, Any], chapter_id: str) -> Action:
    return Action(
        chapter_id=chapter_id,
        character=_text(item.get("character")),
        action=_text(item.get("action")),
        object=_text(item.get("object")),
        location=_text(item.get("location")),
        visuality_score=_score(item.get("visuality_score"), default=0),
    )


def _parse_motivation(item: dict[str, Any], chapter_id: str) -> Motivation:
    return Motivation(
        chapter_id=chapter_id,
        character=_text(item.get("character")),
        goal=_text(item.get("goal")),
        fear=_text(item.get("fear")),
        secret=_text(item.get("secret")),
        motivation=_text(item.get("motivation")),
    )


def _parse_causal_link(item: dict[str, Any], chapter_id: str) -> CausalLink:
    return CausalLink(
        chapter_id=chapter_id,
        cause_event=_text(item.get("cause_event")),
        effect_event=_text(item.get("effect_event")),
        relation_type=_text(item.get("relation_type")),
        evidence=_text(item.get("evidence")),
    )


def _parse_scene(item: dict[str, Any]) -> Scene:
    return Scene(
        title=_text(item.get("title")),
        location=_text(item.get("location")),
        time_of_day=_text(item.get("time_of_day")),
        event_ids=[],
        character_ids=[],
        dramatic_function=_text(item.get("dramatic_function")),
        event_titles=[_text(value) for value in item.get("event_titles", []) if _text(value)],
        characters=[_text(value) for value in item.get("characters", []) if _text(value)],
        adaptation_note=_text(item.get("adaptation_note")),
    )


def _parse_emotion_arc(item: dict[str, Any]) -> EmotionArc:
    return EmotionArc(
        emotion=_text(item.get("emotion")),
        intensity=_score(item.get("intensity"), default=0),
        tension=_score(item.get("tension"), default=0),
    )


def _chapter_text(chapter: Chapter, source_text: str) -> str:
    start = source_text.find(chapter.title)
    if start < 0:
        return f"{chapter.title}\n{chapter.summary}"

    next_index = len(source_text)
    for line in source_text[start + len(chapter.title) :].splitlines():
        stripped = line.strip()
        if stripped.startswith("第") and "章" in stripped:
            marker = source_text.find(line, start + len(chapter.title))
            if marker > start:
                next_index = marker
                break
    return source_text[start:next_index].strip()


def _attach_character_ids(chapters: list[Chapter], characters: list[Character]) -> None:
    for chapter in chapters:
        chapter.character_ids = [character.id for character in characters if chapter.id in character.appearances]


def _attach_event_and_scene_ids(analysis: AggregatedAnalysis) -> None:
    name_to_character_id = {character.name: character.id for character in analysis.characters}
    title_to_event_id = {event.title: event.id for event in analysis.events}

    for event in analysis.events:
        event.character_ids = [name_to_character_id[name] for name in event.characters if name in name_to_character_id]

    for scene in analysis.scenes:
        scene.character_ids = [name_to_character_id[name] for name in scene.characters if name in name_to_character_id]
        scene.event_ids = [title_to_event_id[title] for title in scene.event_titles if title in title_to_event_id]


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _score(value: Any, default: int) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def _has_name(item: dict[str, Any]) -> bool:
    return bool(_text(item.get("name")))
