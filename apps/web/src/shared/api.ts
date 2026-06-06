import { chapters, characters, events, relationships, scenes } from "./mockData";
import type {
  Chapter,
  ChapterDto,
  Character,
  CharacterDto,
  Event,
  EventDto,
  ImportDocumentResult,
  Relationship,
  RelationshipDto,
  Scene,
  SceneDto
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function mapChapter(dto: ChapterDto): Chapter {
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    wordCount: dto.word_count,
    conflict: dto.conflict,
    characterIds: dto.character_ids
  };
}

function mapCharacter(dto: CharacterDto): Character {
  return {
    id: dto.id,
    name: dto.name,
    aliases: dto.aliases,
    importance: dto.importance,
    role: dto.role,
    description: dto.description,
    appearances: dto.appearances
  };
}

function mapEvent(dto: EventDto): Event {
  return {
    id: dto.id,
    chapterId: dto.chapter_id,
    title: dto.title,
    summary: dto.summary,
    conflict: dto.conflict,
    characterIds: dto.character_ids,
    characters: dto.characters,
    location: dto.location,
    timeText: dto.time_text,
    consequence: dto.consequence
  };
}

function mapRelationship(dto: RelationshipDto): Relationship {
  return {
    id: dto.id,
    source: dto.source,
    target: dto.target,
    type: dto.type,
    strength: dto.strength,
    evidence: dto.evidence
  };
}

function mapScene(dto: SceneDto): Scene {
  return {
    id: dto.id,
    title: dto.title,
    location: dto.location,
    timeOfDay: dto.time_of_day,
    eventIds: dto.event_ids,
    characterIds: dto.character_ids,
    dramaticFunction: dto.dramatic_function,
    eventTitles: dto.event_titles,
    characters: dto.characters,
    adaptationNote: dto.adaptation_note
  };
}

export const studioApi = {
  async getWorkspace() {
    return {
      chapters,
      characters,
      events,
      relationships,
      scenes
    };
  },

  async importDocument(file: File): Promise<{
    filename: string;
    message: string;
    sourceText: string;
    chapters: Chapter[];
    characters: Character[];
    locations: ImportDocumentResult["locations"];
    timeMarkers: ImportDocumentResult["time_markers"];
    events: Event[];
    relationships: Relationship[];
    conflicts: ImportDocumentResult["conflicts"];
    dialogues: ImportDocumentResult["dialogues"];
    actions: ImportDocumentResult["actions"];
    motivations: ImportDocumentResult["motivations"];
    causalLinks: ImportDocumentResult["causal_links"];
    scenes: Scene[];
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/api/documents/import`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.detail ?? "上传失败，请检查后端服务是否已启动。";
      throw new Error(detail);
    }

    const result = (await response.json()) as ImportDocumentResult;
    return {
      filename: result.filename,
      message: result.message,
      sourceText: result.source_text,
      chapters: result.chapters.map(mapChapter),
      characters: result.characters.map(mapCharacter),
      locations: result.locations,
      timeMarkers: result.time_markers,
      events: result.events.map(mapEvent),
      relationships: result.relationships.map(mapRelationship),
      conflicts: result.conflicts,
      dialogues: result.dialogues,
      actions: result.actions,
      motivations: result.motivations,
      causalLinks: result.causal_links,
      scenes: result.scenes.map(mapScene)
    };
  },

  async getDeepSeekSettings(): Promise<{ configured: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/settings/deepseek`);
    if (!response.ok) {
      throw new Error("无法读取 DeepSeek 配置状态。");
    }

    return (await response.json()) as { configured: boolean };
  },

  async saveDeepSeekApiKey(apiKey: string): Promise<{ configured: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/settings/deepseek`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ api_key: apiKey })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "保存 DeepSeek API Key 失败。");
    }

    return (await response.json()) as { configured: boolean };
  }
};
