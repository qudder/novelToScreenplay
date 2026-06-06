from typing import Literal

from pydantic import BaseModel


class Chapter(BaseModel):
    id: str
    title: str
    summary: str
    word_count: int
    conflict: str
    character_ids: list[str]


class SourceRef(BaseModel):
    chapter_id: str = ""
    start_char: int = -1
    end_char: int = -1
    evidence: str = ""


class Character(BaseModel):
    id: str
    name: str
    aliases: list[str]
    importance: int
    role: str
    description: str
    appearances: list[str]
    source_refs: list[SourceRef] = []


class Relationship(BaseModel):
    id: str = ""
    source: str
    target: str
    type: str
    strength: int
    evidence: str = ""


class Event(BaseModel):
    id: str = ""
    chapter_id: str
    title: str
    summary: str
    conflict: str
    character_ids: list[str]
    characters: list[str] = []
    location: str = ""
    time_text: str = ""
    consequence: str = ""
    dialogue_ids: list[str] = []
    environment_ids: list[str] = []
    source_refs: list[SourceRef] = []


class Scene(BaseModel):
    id: str = ""
    title: str
    location: str
    time_of_day: str
    event_ids: list[str]
    character_ids: list[str]
    dramatic_function: str
    event_titles: list[str] = []
    characters: list[str] = []
    adaptation_note: str = ""
    source_refs: list[SourceRef] = []


class NarrativeBlock(BaseModel):
    id: str = ""
    title: str
    chapter_ids: list[str] = []
    summary: str = ""
    dramatic_goal: str = ""
    main_conflict: str = ""
    story_time: str = ""
    location_scope: str = ""
    character_ids: list[str] = []
    characters: list[str] = []
    sub_scene_ids: list[str] = []
    source_refs: list[SourceRef] = []


class SubScene(BaseModel):
    id: str = ""
    block_id: str = ""
    chapter_id: str = ""
    title: str
    location: str = ""
    time_text: str = ""
    time_of_day: str = ""
    dramatic_function: str = ""
    event_titles: list[str] = []
    event_ids: list[str] = []
    dialogue_ids: list[str] = []
    environment_ids: list[str] = []
    shot_ids: list[str] = []
    action_ids: list[str] = []
    conflict_ids: list[str] = []
    characters: list[str] = []
    character_ids: list[str] = []
    source_refs: list[SourceRef] = []


class ShotPlan(BaseModel):
    id: str = ""
    chapter_id: str = ""
    scene_title: str = ""
    event_title: str = ""
    sequence_order: int = 0
    shot_type: str = ""
    viewpoint: str = ""
    composition: str = ""
    camera_movement: str = ""
    visual_focus: str = ""
    emotional_purpose: str = ""
    transition: str = ""
    source_refs: list[SourceRef] = []


class Location(BaseModel):
    id: str = ""
    name: str
    type: str = ""
    description: str = ""
    evidence: str = ""
    chapter_id: str = ""


class EnvironmentInfo(BaseModel):
    id: str = ""
    chapter_id: str = ""
    scene_title: str = ""
    event_titles: list[str] = []
    location: str = ""
    time_text: str = ""
    weather: str = ""
    light: str = ""
    sound: str = ""
    atmosphere: str = ""
    props: list[str] = []
    visual_details: list[str] = []
    source_refs: list[SourceRef] = []


class TimeMarker(BaseModel):
    id: str = ""
    chapter_id: str = ""
    time_text: str
    normalized_time: str = ""
    time_of_day: str = ""
    sequence_order: int = 0


class Conflict(BaseModel):
    id: str = ""
    chapter_id: str = ""
    conflict_type: str = ""
    participants: list[str] = []
    desire: str = ""
    obstacle: str = ""
    outcome: str = ""
    evidence: str = ""


class Dialogue(BaseModel):
    id: str = ""
    chapter_id: str = ""
    event_title: str = ""
    event_id: str = ""
    speaker: str = ""
    listener: str = ""
    content: str = ""
    emotion: str = ""
    source_text: str = ""
    dramatic_purpose: str = ""
    source_refs: list[SourceRef] = []


class Action(BaseModel):
    id: str = ""
    chapter_id: str = ""
    character: str = ""
    action: str = ""
    object: str = ""
    location: str = ""
    visuality_score: int = 0


class Motivation(BaseModel):
    id: str = ""
    chapter_id: str = ""
    character: str = ""
    goal: str = ""
    fear: str = ""
    secret: str = ""
    motivation: str = ""


class CausalLink(BaseModel):
    id: str = ""
    chapter_id: str = ""
    cause_event: str = ""
    effect_event: str = ""
    relation_type: str = ""
    evidence: str = ""


class EmotionArc(BaseModel):
    emotion: str = ""
    intensity: int = 0
    tension: int = 0


class ChapterAnalysis(BaseModel):
    chapter_id: str
    characters: list[Character] = []
    locations: list[Location] = []
    environments: list[EnvironmentInfo] = []
    shot_plans: list[ShotPlan] = []
    time_markers: list[TimeMarker] = []
    events: list[Event] = []
    relationships: list[Relationship] = []
    conflicts: list[Conflict] = []
    dialogues: list[Dialogue] = []
    actions: list[Action] = []
    motivations: list[Motivation] = []
    causal_links: list[CausalLink] = []
    scene_candidates: list[Scene] = []
    narrative_blocks: list[NarrativeBlock] = []
    sub_scenes: list[SubScene] = []
    emotion_arc: EmotionArc = EmotionArc()


class Workspace(BaseModel):
    chapters: list[Chapter]
    characters: list[Character]
    relationships: list[Relationship]
    events: list[Event]
    scenes: list[Scene]


class ImportResult(BaseModel):
    document_id: str = ""
    filename: str
    status: Literal["queued", "parsed"]
    message: str
    chapters: list[Chapter] = []
    characters: list[Character] = []
    locations: list[Location] = []
    environments: list[EnvironmentInfo] = []
    shot_plans: list[ShotPlan] = []
    time_markers: list[TimeMarker] = []
    events: list[Event] = []
    relationships: list[Relationship] = []
    conflicts: list[Conflict] = []
    dialogues: list[Dialogue] = []
    actions: list[Action] = []
    motivations: list[Motivation] = []
    causal_links: list[CausalLink] = []
    scenes: list[Scene] = []
    narrative_blocks: list[NarrativeBlock] = []
    sub_scenes: list[SubScene] = []
    chapter_analyses: list[ChapterAnalysis] = []
    source_text: str = ""


class AnalysisResult(BaseModel):
    document_id: str
    status: Literal["idle", "running", "completed", "failed"]
    message: str = ""
    characters: list[Character] = []
    locations: list[Location] = []
    environments: list[EnvironmentInfo] = []
    shot_plans: list[ShotPlan] = []
    time_markers: list[TimeMarker] = []
    events: list[Event] = []
    relationships: list[Relationship] = []
    conflicts: list[Conflict] = []
    dialogues: list[Dialogue] = []
    actions: list[Action] = []
    motivations: list[Motivation] = []
    causal_links: list[CausalLink] = []
    scenes: list[Scene] = []
    narrative_blocks: list[NarrativeBlock] = []
    sub_scenes: list[SubScene] = []
    chapter_analyses: list[ChapterAnalysis] = []
    empty_chapter_ids: list[str] = []


class AnalysisStartResult(BaseModel):
    document_id: str
    status: Literal["idle", "running", "completed", "failed"]
    message: str
