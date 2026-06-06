from typing import Literal

from pydantic import BaseModel


class Chapter(BaseModel):
    id: str
    title: str
    summary: str
    word_count: int
    conflict: str
    character_ids: list[str]


class Character(BaseModel):
    id: str
    name: str
    aliases: list[str]
    importance: int
    role: str
    description: str
    appearances: list[str]


class Relationship(BaseModel):
    id: str
    source: str
    target: str
    type: Literal["同盟", "敌对", "亲属", "暧昧", "师徒"]
    strength: int


class Event(BaseModel):
    id: str
    chapter_id: str
    title: str
    summary: str
    conflict: str
    character_ids: list[str]


class Scene(BaseModel):
    id: str
    title: str
    location: str
    time_of_day: str
    event_ids: list[str]
    character_ids: list[str]
    dramatic_function: str


class Workspace(BaseModel):
    chapters: list[Chapter]
    characters: list[Character]
    relationships: list[Relationship]
    events: list[Event]
    scenes: list[Scene]


class ImportResult(BaseModel):
    filename: str
    status: Literal["queued", "parsed"]
    message: str
    chapters: list[Chapter] = []
    source_text: str = ""
