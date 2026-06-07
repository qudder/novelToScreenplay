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
    EnvironmentInfo,
    Event,
    Location,
    Motivation,
    NarrativeBlock,
    Relationship,
    Scene,
    ShotPlan,
    SourceRef,
    SubScene,
    TimeMarker,
)
from app.services.deepseek_client import deepseek_client

logger = get_logger("services.chapter_analysis")
CACHE_SCHEMA_VERSION = "chapter-analysis-v5-shot-plans"


class _RefreshChapterCache(RuntimeError):
    pass


class AggregatedAnalysis:
    def __init__(self, chapter_analyses: list[ChapterAnalysis]) -> None:
        self.chapter_analyses = chapter_analyses
        self.characters = self._merge_characters()
        self.locations = self._collect("locations")
        self.environments = self._collect("environments")
        self.shot_plans = self._collect("shot_plans")
        self.time_markers = self._collect("time_markers")
        self.events = self._collect("events")
        self.relationships = self._collect("relationships")
        self.conflicts = self._collect("conflicts")
        self.dialogues = self._collect("dialogues")
        self.actions = self._collect("actions")
        self.motivations = self._collect("motivations")
        self.causal_links = self._collect("causal_links")
        self.scenes = self._collect("scene_candidates")
        self.narrative_blocks = self._collect("narrative_blocks")
        self.sub_scenes = self._collect("sub_scenes")

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
                    existing.source_refs = _merge_source_refs(existing.source_refs + character.source_refs)
                    existing.importance = max(existing.importance, character.importance)
                    if character.description and character.description not in existing.description:
                        existing.description = f"{existing.description}; {character.description}"
                else:
                    character.id = f"char-{len(merged) + 1}"
                    merged[character.name] = character
        return sorted(merged.values(), key=lambda item: item.importance, reverse=True)


async def analyze_chapters(chapters: list[Chapter], source_text: str, filename: str = "untitled", force_refresh: bool = False) -> AggregatedAnalysis:
    deepseek_config.cache_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(deepseek_config.max_concurrent_chapter_requests)
    logger.info(
        "开始分发章节叙事分析：文件名=%s，章节数=%s，最大并发=%s",
        filename,
        len(chapters),
        deepseek_config.max_concurrent_chapter_requests,
    )
    analyses = await asyncio.gather(
        *[_analyze_single_chapter(chapter, source_text, semaphore, filename=filename, force_refresh=force_refresh) for chapter in chapters]
    )

    aggregated = AggregatedAnalysis(list(analyses))
    _attach_character_ids(chapters, aggregated.characters)
    _attach_event_and_scene_ids(aggregated)
    _ensure_hierarchical_scene_data(chapters, aggregated)
    return aggregated


async def _analyze_single_chapter(
    chapter: Chapter,
    source_text: str,
    semaphore: asyncio.Semaphore,
    filename: str = "untitled",
    force_refresh: bool = False,
) -> ChapterAnalysis:
    chapter_text = _chapter_text(chapter, source_text)
    cache_path = _chapter_cache_path(chapter, chapter_text, filename)
    legacy_cache_path = _legacy_chapter_cache_path(chapter, chapter_text, filename)

    if force_refresh and cache_path.exists():
        logger.info("已请求强制刷新，章节叙事分析缓存将被忽略：章节ID=%s，缓存路径=%s", chapter.id, cache_path)
        cache_path.unlink(missing_ok=True)
    if force_refresh and legacy_cache_path.exists():
        logger.info("已请求强制刷新，旧章节叙事分析缓存将被忽略：章节ID=%s，缓存路径=%s", chapter.id, legacy_cache_path)

    read_cache_path = cache_path if cache_path.exists() else legacy_cache_path
    if read_cache_path.exists() and not force_refresh:
        logger.info("发现章节叙事分析缓存候选：章节ID=%s，缓存路径=%s", chapter.id, read_cache_path)
        try:
            payload = _unwrap_cache_payload(json.loads(read_cache_path.read_text(encoding="utf-8")))
            if not _has_required_source_refs(payload):
                logger.warning("章节叙事分析缓存缺少来源引用，将刷新：章节ID=%s，缓存路径=%s", chapter.id, read_cache_path)
                if read_cache_path == cache_path:
                    read_cache_path.unlink(missing_ok=True)
                raise _RefreshChapterCache()
            analysis = _parse_analysis(chapter.id, payload)
            _attach_source_positions(analysis, chapter_text)
            if read_cache_path != cache_path:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(json.dumps(_cache_payload(payload), ensure_ascii=False, indent=2), encoding="utf-8")
                logger.info("旧章节叙事分析缓存已迁移到统一目录：章节ID=%s，新缓存路径=%s", chapter.id, cache_path)
            logger.info("章节叙事分析命中缓存：章节ID=%s，缓存路径=%s", chapter.id, read_cache_path)
            return analysis
        except _RefreshChapterCache:
            pass
        except json.JSONDecodeError as error:
            logger.warning("章节叙事分析缓存无效，已忽略：章节ID=%s，缓存路径=%s，错误=%s", chapter.id, read_cache_path, error)
            if read_cache_path == cache_path:
                read_cache_path.unlink(missing_ok=True)

    async with semaphore:
        user_prompt = _build_user_prompt(chapter, chapter_text)
        debug_dir = _chapter_debug_dir(chapter, chapter_text, filename)
        debug_dir.mkdir(parents=True, exist_ok=True)
        logger.info(
            "请求章节叙事分析：文件名=%s，章节ID=%s，标题=%s，正文字符数=%s，调试目录=%s",
            filename,
            chapter.id,
            chapter.title,
            len(chapter_text),
            debug_dir,
        )
        (debug_dir / "user_prompt.md").write_text(user_prompt, encoding="utf-8")
        (debug_dir / "chapter_text.txt").write_text(chapter_text, encoding="utf-8")
        try:
            payload = await deepseek_client.extract_json(
                user_prompt,
                debug_context=_chapter_debug_name(chapter, chapter_text, filename),
            )
        except Exception as error:
            (debug_dir / "chapter_error.txt").write_text(repr(error), encoding="utf-8")
            logger.exception("章节叙事分析失败，已跳过本章：章节ID=%s，标题=%s，错误=%s", chapter.id, chapter.title, error)
            return _empty_analysis(chapter.id)
        (debug_dir / "model_output.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(_cache_payload(payload), ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("章节叙事分析已写入缓存：章节ID=%s，缓存路径=%s", chapter.id, cache_path)
        analysis = _parse_analysis(chapter.id, payload)
        _attach_source_positions(analysis, chapter_text)
        return analysis


def _chapter_cache_key(chapter: Chapter, chapter_text: str) -> str:
    digest = hashlib.sha256(f"{CACHE_SCHEMA_VERSION}\n{chapter.id}\n{chapter.title}\n{chapter_text}".encode("utf-8")).hexdigest()
    return digest


def _chapter_cache_path(chapter: Chapter, chapter_text: str, filename: str) -> Path:
    return deepseek_config.cache_dir / f"{_chapter_debug_name(chapter, chapter_text, filename)}.json"


def _legacy_chapter_cache_path(chapter: Chapter, chapter_text: str, filename: str) -> Path:
    return deepseek_config.legacy_cache_dir / f"{_chapter_debug_name(chapter, chapter_text, filename)}.json"


def _chapter_debug_dir(chapter: Chapter, chapter_text: str, filename: str) -> Path:
    return deepseek_config.debug_dir / _chapter_debug_name(chapter, chapter_text, filename)


def _chapter_debug_name(chapter: Chapter, chapter_text: str, filename: str) -> str:
    return f"{_safe_path_part(Path(filename).stem)}-{chapter.id}-{_chapter_cache_key(chapter, chapter_text)[:12]}"


def _safe_path_part(value: str, max_length: int = 48) -> str:
    safe_value = "".join(char if char.isalnum() or char in "-_" else "-" for char in value.strip())
    safe_value = "-".join(part for part in safe_value.split("-") if part)
    return (safe_value or "untitled")[:max_length]


def _build_user_prompt(chapter: Chapter, chapter_text: str) -> str:
    return (
        "Extract structured narrative information from this chapter and return JSON only.\n\n"
        f"chapter_id: {chapter.id}\n"
        f"chapter_title: {chapter.title}\n"
        "chapter_text:\n"
        f"{chapter_text}"
    )


def _empty_analysis(chapter_id: str) -> ChapterAnalysis:
    return ChapterAnalysis(chapter_id=chapter_id, emotion_arc=EmotionArc())


def _parse_analysis(chapter_id: str, payload: dict[str, Any]) -> ChapterAnalysis:
    return ChapterAnalysis(
        chapter_id=chapter_id,
        characters=[_parse_character(item, chapter_id) for item in payload.get("characters", []) if _has_name(item)],
        locations=[_parse_location(item, chapter_id) for item in payload.get("locations", []) if _has_name(item)],
        environments=[_parse_environment(item, chapter_id) for item in payload.get("environments", [])],
        shot_plans=[_parse_shot_plan(item, chapter_id) for item in payload.get("shot_plans", [])],
        time_markers=[_parse_time_marker(item, chapter_id) for item in payload.get("time_markers", [])],
        events=[_parse_event(item, chapter_id) for item in payload.get("events", []) if item.get("title")],
        relationships=[_parse_relationship(item) for item in payload.get("relationships", []) if item.get("source") and item.get("target")],
        conflicts=[_parse_conflict(item, chapter_id) for item in payload.get("conflicts", [])],
        dialogues=[_parse_dialogue(item, chapter_id) for item in payload.get("dialogues", [])],
        actions=[_parse_action(item, chapter_id) for item in payload.get("actions", [])],
        motivations=[_parse_motivation(item, chapter_id) for item in payload.get("motivations", [])],
        causal_links=[_parse_causal_link(item, chapter_id) for item in payload.get("causal_links", [])],
        scene_candidates=[_parse_scene(item) for item in payload.get("scene_candidates", []) if item.get("title")],
        narrative_blocks=[_parse_narrative_block(item, chapter_id) for item in payload.get("narrative_blocks", []) if item.get("title")],
        sub_scenes=[_parse_sub_scene(item, chapter_id) for item in payload.get("sub_scenes", []) if item.get("title")],
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
        source_refs=_source_refs(chapter_id, item),
    )


def _parse_location(item: dict[str, Any], chapter_id: str) -> Location:
    return Location(
        name=_text(item.get("name")),
        type=_text(item.get("type")),
        description=_text(item.get("description")),
        evidence=_text(item.get("evidence")),
        chapter_id=chapter_id,
    )


def _parse_environment(item: dict[str, Any], chapter_id: str) -> EnvironmentInfo:
    return EnvironmentInfo(
        chapter_id=chapter_id,
        scene_title=_text(item.get("scene_title")),
        event_titles=[_text(value) for value in item.get("event_titles", []) if _text(value)],
        location=_text(item.get("location")),
        time_text=_text(item.get("time_text")),
        weather=_text(item.get("weather")),
        light=_text(item.get("light")),
        sound=_text(item.get("sound")),
        atmosphere=_text(item.get("atmosphere")),
        props=[_text(value) for value in item.get("props", []) if _text(value)],
        visual_details=[_text(value) for value in item.get("visual_details", []) if _text(value)],
        source_refs=_source_refs(chapter_id, item),
    )


def _parse_shot_plan(item: dict[str, Any], chapter_id: str) -> ShotPlan:
    return ShotPlan(
        chapter_id=chapter_id,
        scene_title=_text(item.get("scene_title")),
        event_title=_text(item.get("event_title")),
        sequence_order=_int(item.get("sequence_order")),
        shot_type=_text(item.get("shot_type")),
        viewpoint=_text(item.get("viewpoint")),
        composition=_text(item.get("composition")),
        camera_movement=_text(item.get("camera_movement")),
        visual_focus=_text(item.get("visual_focus")),
        emotional_purpose=_text(item.get("emotional_purpose")),
        transition=_text(item.get("transition")),
        source_refs=_source_refs(chapter_id, item),
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
        source_refs=_source_refs(chapter_id, item),
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
        event_title=_text(item.get("event_title")),
        speaker=_text(item.get("speaker")),
        listener=_text(item.get("listener")),
        content=_text(item.get("content")),
        emotion=_text(item.get("emotion")),
        source_text=_text(item.get("source_text")),
        dramatic_purpose=_text(item.get("dramatic_purpose")),
        source_refs=_source_refs(chapter_id, item),
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
    chapter_id = _text(item.get("chapter_id"))
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
        source_refs=_source_refs(chapter_id, item),
    )


def _parse_narrative_block(item: dict[str, Any], chapter_id: str) -> NarrativeBlock:
    chapter_ids = [_text(value) for value in item.get("chapter_ids", []) if _text(value)]
    return NarrativeBlock(
        title=_text(item.get("title")),
        chapter_ids=chapter_ids or [chapter_id],
        summary=_text(item.get("summary")),
        dramatic_goal=_text(item.get("dramatic_goal")),
        main_conflict=_text(item.get("main_conflict")),
        story_time=_text(item.get("story_time")),
        location_scope=_text(item.get("location_scope")),
        characters=[_text(value) for value in item.get("characters", []) if _text(value)],
        sub_scene_ids=[],
        source_refs=_source_refs(chapter_id, item),
    )


def _parse_sub_scene(item: dict[str, Any], chapter_id: str) -> SubScene:
    return SubScene(
        block_id=_text(item.get("block_id")),
        chapter_id=_text(item.get("chapter_id")) or chapter_id,
        title=_text(item.get("title")),
        location=_text(item.get("location")),
        time_text=_text(item.get("time_text")),
        time_of_day=_text(item.get("time_of_day")),
        dramatic_function=_text(item.get("dramatic_function")),
        event_titles=[_text(value) for value in item.get("event_titles", []) if _text(value)],
        event_ids=[],
        dialogue_ids=[_text(value) for value in item.get("dialogue_ids", []) if _text(value)],
        environment_ids=[_text(value) for value in item.get("environment_ids", []) if _text(value)],
        action_ids=[_text(value) for value in item.get("action_ids", []) if _text(value)],
        conflict_ids=[_text(value) for value in item.get("conflict_ids", []) if _text(value)],
        characters=[_text(value) for value in item.get("characters", []) if _text(value)],
        source_refs=_source_refs(chapter_id, item),
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
        event.dialogue_ids = [dialogue.id for dialogue in analysis.dialogues if dialogue.event_title == event.title]
        event.environment_ids = [
            environment.id
            for environment in analysis.environments
            if event.title in environment.event_titles or environment.scene_title == event.title
        ]
    title_to_environment_id = {environment.scene_title: environment.id for environment in analysis.environments}

    for scene in analysis.scenes:
        scene.character_ids = [name_to_character_id[name] for name in scene.characters if name in name_to_character_id]
        scene.event_ids = [title_to_event_id[title] for title in scene.event_titles if title in title_to_event_id]
        for event_title in scene.event_titles:
            environment_id = title_to_environment_id.get(event_title)
            if environment_id:
                for event in analysis.events:
                    if event.title == event_title and environment_id not in event.environment_ids:
                        event.environment_ids.append(environment_id)

    for block in analysis.narrative_blocks:
        block.character_ids = [name_to_character_id[name] for name in block.characters if name in name_to_character_id]

    for sub_scene in analysis.sub_scenes:
        sub_scene.character_ids = [name_to_character_id[name] for name in sub_scene.characters if name in name_to_character_id]
        sub_scene.event_ids = [title_to_event_id[title] for title in sub_scene.event_titles if title in title_to_event_id]
        related_events = [event for event in analysis.events if event.id in sub_scene.event_ids]
        sub_scene.dialogue_ids = _unique(sub_scene.dialogue_ids + [dialogue_id for event in related_events for dialogue_id in event.dialogue_ids])
        sub_scene.environment_ids = _unique(
            sub_scene.environment_ids + [environment_id for event in related_events for environment_id in event.environment_ids]
        )
        sub_scene.shot_ids = _unique(
            sub_scene.shot_ids
            + [
                shot.id
                for shot in analysis.shot_plans
                if shot.scene_title == sub_scene.title or shot.event_title in sub_scene.event_titles
            ]
        )


def _ensure_hierarchical_scene_data(chapters: list[Chapter], analysis: AggregatedAnalysis) -> None:
    if not analysis.narrative_blocks:
        analysis.narrative_blocks = [_fallback_block_from_chapter(chapter, analysis) for chapter in chapters]

    if not analysis.sub_scenes:
        analysis.sub_scenes = [_fallback_sub_scene_from_scene(scene) for scene in analysis.scenes]

    for index, block in enumerate(analysis.narrative_blocks, start=1):
        if not block.id:
            block.id = f"narrative_blocks-{index}"
    for index, sub_scene in enumerate(analysis.sub_scenes, start=1):
        if not sub_scene.id:
            sub_scene.id = f"sub_scenes-{index}"

    block_by_chapter_id = {
        chapter_id: block
        for block in analysis.narrative_blocks
        for chapter_id in block.chapter_ids
    }
    if not block_by_chapter_id and analysis.narrative_blocks:
        block_by_chapter_id = {chapter.id: analysis.narrative_blocks[0] for chapter in chapters}

    for sub_scene in analysis.sub_scenes:
        block = block_by_chapter_id.get(sub_scene.chapter_id)
        if not block and analysis.narrative_blocks:
            block = analysis.narrative_blocks[0]
        if block:
            sub_scene.block_id = block.id
            if sub_scene.id not in block.sub_scene_ids:
                block.sub_scene_ids.append(sub_scene.id)

    _attach_event_and_scene_ids(analysis)


def _fallback_block_from_chapter(chapter: Chapter, analysis: AggregatedAnalysis) -> NarrativeBlock:
    chapter_events = [event for event in analysis.events if event.chapter_id == chapter.id]
    chapter_scenes = [
        scene
        for scene in analysis.scenes
        if any(event.id in scene.event_ids for event in chapter_events) or any(event.title in scene.event_titles for event in chapter_events)
    ]
    characters = sorted({name for event in chapter_events for name in event.characters})
    locations = sorted({event.location for event in chapter_events if event.location})
    refs = _merge_source_refs([ref for event in chapter_events for ref in event.source_refs] + [ref for scene in chapter_scenes for ref in scene.source_refs])
    return NarrativeBlock(
        title=chapter.title,
        chapter_ids=[chapter.id],
        summary=chapter.summary,
        dramatic_goal=chapter.conflict,
        main_conflict=chapter.conflict,
        story_time="、".join(_unique([event.time_text for event in chapter_events if event.time_text])),
        location_scope="、".join(locations),
        characters=characters,
        source_refs=refs[:3],
    )


def _fallback_sub_scene_from_scene(scene: Scene) -> SubScene:
    return SubScene(
        chapter_id=scene.source_refs[0].chapter_id if scene.source_refs else "",
        title=scene.title,
        location=scene.location,
        time_of_day=scene.time_of_day,
        dramatic_function=scene.dramatic_function,
        event_titles=scene.event_titles,
        event_ids=scene.event_ids,
        characters=scene.characters,
        source_refs=scene.source_refs,
    )


def _attach_source_positions(analysis: ChapterAnalysis, chapter_text: str) -> None:
    for character in analysis.characters:
        _locate_refs(character.source_refs, chapter_text)
    for event in analysis.events:
        _locate_refs(event.source_refs, chapter_text)
    for environment in analysis.environments:
        _locate_refs(environment.source_refs, chapter_text)
    for shot_plan in analysis.shot_plans:
        _locate_refs(shot_plan.source_refs, chapter_text)
    for dialogue in analysis.dialogues:
        _locate_refs(dialogue.source_refs, chapter_text)
    for scene in analysis.scene_candidates:
        _locate_refs(scene.source_refs, chapter_text)
    for block in analysis.narrative_blocks:
        _locate_refs(block.source_refs, chapter_text)
    for sub_scene in analysis.sub_scenes:
        _locate_refs(sub_scene.source_refs, chapter_text)


def _locate_refs(refs: list[SourceRef], chapter_text: str) -> None:
    for ref in refs:
        if ref.start_char >= 0 and ref.end_char >= ref.start_char:
            continue
        evidence = ref.evidence.strip()
        if not evidence:
            continue
        index = chapter_text.find(evidence)
        if index < 0 and len(evidence) > 20:
            index = chapter_text.find(evidence[:20])
            if index >= 0:
                evidence = evidence[:20]
        if index >= 0:
            ref.start_char = index
            ref.end_char = index + len(evidence)


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


def _has_required_source_refs(payload: dict[str, Any]) -> bool:
    required_groups = ["characters", "events", "scene_candidates"]
    has_any_required_item = False

    for group in required_groups:
        items = payload.get(group, [])
        if not isinstance(items, list):
            return False
        for item in items:
            if not isinstance(item, dict):
                return False
            has_any_required_item = True
            refs = item.get("source_refs")
            if not isinstance(refs, list) or not refs:
                return False
            if not any(isinstance(ref, dict) and _text(ref.get("evidence")) for ref in refs):
                return False

    return has_any_required_item


def _cache_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "_cache_schema_version": CACHE_SCHEMA_VERSION,
        "payload": payload,
    }


def _unwrap_cache_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("_cache_schema_version") == CACHE_SCHEMA_VERSION and isinstance(payload.get("payload"), dict):
        return payload["payload"]
    return payload


def _source_refs(chapter_id: str, item: dict[str, Any]) -> list[SourceRef]:
    refs = item.get("source_refs")
    if isinstance(refs, list):
        parsed_refs = [
            _source_ref(
                _text(ref.get("chapter_id")) or chapter_id,
                _text(ref.get("evidence")),
                ref.get("start_char"),
                ref.get("end_char"),
            )
            for ref in refs
            if isinstance(ref, dict)
        ]
        return [ref for ref in parsed_refs if ref.evidence or ref.chapter_id]

    evidence = _text(item.get("evidence")) or _text(item.get("source_text")) or _text(item.get("source_evidence"))
    if not evidence and chapter_id:
        return [SourceRef(chapter_id=chapter_id)]
    if not evidence:
        return []
    return [_source_ref(chapter_id, evidence, item.get("start_char"), item.get("end_char"))]


def _source_ref(chapter_id: str, evidence: str, start_char: Any = None, end_char: Any = None) -> SourceRef:
    return SourceRef(
        chapter_id=chapter_id,
        start_char=_int(start_char) if start_char is not None else -1,
        end_char=_int(end_char) if end_char is not None else -1,
        evidence=evidence,
    )


def _merge_source_refs(refs: list[SourceRef]) -> list[SourceRef]:
    merged: dict[tuple[str, str], SourceRef] = {}
    for ref in refs:
        key = (ref.chapter_id, ref.evidence)
        if key not in merged:
            merged[key] = ref
    return list(merged.values())


def _unique(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result
