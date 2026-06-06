import { chapters, characters, events, relationships, scenes } from "./mockData";
import type {
  Chapter,
  ChapterDto,
  Character,
  CharacterDto,
  Event,
  EventDto,
  AnalysisResultDto,
  ImportDocumentResult,
  Relationship,
  RelationshipDto,
  Scene,
  SceneDto,
  SourceRef,
  SourceRefDto
} from "./types";
import type { ScreenplayDraft } from "./screenplayDraft";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function mapSourceRef(dto: SourceRefDto): SourceRef {
  return {
    chapterId: dto.chapter_id,
    startChar: dto.start_char,
    endChar: dto.end_char,
    evidence: dto.evidence
  };
}

function toSourceRefDto(ref: SourceRef): SourceRefDto {
  return {
    chapter_id: ref.chapterId,
    start_char: ref.startChar,
    end_char: ref.endChar,
    evidence: ref.evidence
  };
}

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
    appearances: dto.appearances,
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
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
    consequence: dto.consequence,
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
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
    adaptationNote: dto.adaptation_note,
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
  };
}

function toChapterDto(chapter: Chapter): ChapterDto {
  return {
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary,
    word_count: chapter.wordCount,
    conflict: chapter.conflict,
    character_ids: chapter.characterIds
  };
}

function toCharacterDto(character: Character): CharacterDto {
  return {
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    importance: character.importance,
    role: character.role,
    description: character.description,
    appearances: character.appearances,
    source_refs: (character.sourceRefs ?? []).map(toSourceRefDto)
  };
}

function toEventDto(event: Event): EventDto {
  return {
    id: event.id,
    chapter_id: event.chapterId,
    title: event.title,
    summary: event.summary,
    conflict: event.conflict,
    character_ids: event.characterIds,
    characters: event.characters ?? [],
    location: event.location ?? "",
    time_text: event.timeText ?? "",
    consequence: event.consequence ?? "",
    source_refs: (event.sourceRefs ?? []).map(toSourceRefDto)
  };
}

function toRelationshipDto(relationship: Relationship): RelationshipDto {
  return {
    id: relationship.id,
    source: relationship.source,
    target: relationship.target,
    type: relationship.type,
    strength: relationship.strength,
    evidence: relationship.evidence ?? ""
  };
}

function toSceneDto(scene: Scene): SceneDto {
  return {
    id: scene.id,
    title: scene.title,
    location: scene.location,
    time_of_day: scene.timeOfDay,
    event_ids: scene.eventIds,
    character_ids: scene.characterIds,
    dramatic_function: scene.dramaticFunction,
    event_titles: scene.eventTitles ?? [],
    characters: scene.characters ?? [],
    adaptation_note: scene.adaptationNote ?? "",
    source_refs: (scene.sourceRefs ?? []).map(toSourceRefDto)
  };
}

function mapImportResult(result: ImportDocumentResult) {
  return {
    documentId: result.document_id,
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
    scenes: result.scenes.map(mapScene),
    emptyChapterIds: result.empty_chapter_ids ?? []
  };
}

function mapAnalysisResult(result: AnalysisResultDto) {
  return {
    documentId: result.document_id,
    status: result.status,
    message: result.message,
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
    scenes: result.scenes.map(mapScene),
    emptyChapterIds: result.empty_chapter_ids ?? []
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
    documentId: string;
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

    return mapImportResult((await response.json()) as ImportDocumentResult);
  },

  async getDocument(documentId: string): Promise<ReturnType<typeof mapImportResult>> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "读取文档失败。");
    }

    return mapImportResult((await response.json()) as ImportDocumentResult);
  },

  async restoreDocument(snapshot: {
    documentId?: string;
    analysisStatus?: "idle" | "running" | "completed" | "failed";
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
  }): Promise<ReturnType<typeof mapImportResult>> {
    if (!snapshot.documentId) {
      throw new Error("缺少文档 ID。");
    }

    const payload: ImportDocumentResult = {
      document_id: snapshot.documentId,
      filename: snapshot.filename,
      status: snapshot.analysisStatus === "running" ? "queued" : "parsed",
      message: snapshot.message,
      source_text: snapshot.sourceText,
      chapters: snapshot.chapters.map(toChapterDto),
      characters: snapshot.characters.map(toCharacterDto),
      locations: snapshot.locations,
      time_markers: snapshot.timeMarkers,
      events: snapshot.events.map(toEventDto),
      relationships: snapshot.relationships.map(toRelationshipDto),
      conflicts: snapshot.conflicts,
      dialogues: snapshot.dialogues,
      actions: snapshot.actions,
      motivations: snapshot.motivations,
      causal_links: snapshot.causalLinks,
      scenes: snapshot.scenes.map(toSceneDto)
    };

    const response = await fetch(`${API_BASE_URL}/api/documents/${snapshot.documentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "恢复文档失败。");
    }

    return mapImportResult((await response.json()) as ImportDocumentResult);
  },

  async startDocumentAnalysis(documentId: string): Promise<{
    documentId: string;
    status: "idle" | "running" | "completed" | "failed";
    message: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/analysis`, {
      method: "POST"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "启动叙事分析失败。");
    }

    const result = await response.json();
    return {
      documentId: result.document_id,
      status: result.status,
      message: result.message
    };
  },

  async retryDocumentAnalysis(documentId: string): Promise<{
    documentId: string;
    status: "idle" | "running" | "completed" | "failed";
    message: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/analysis/retry`, {
      method: "POST"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "重试叙事分析失败。");
    }

    const result = await response.json();
    return {
      documentId: result.document_id,
      status: result.status,
      message: result.message
    };
  },

  async getDocumentAnalysis(documentId: string): Promise<ReturnType<typeof mapAnalysisResult>> {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/analysis`);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "读取叙事分析失败。");
    }

    return mapAnalysisResult((await response.json()) as AnalysisResultDto);
  },

  async getDeepSeekSettings(): Promise<{ configured: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/settings/deepseek`);
    if (!response.ok) {
      throw new Error("读取 DeepSeek 配置失败。");
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
  },

  async exportScreenplay(draft: ScreenplayDraft): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/screenplays/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(draft)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "剧本导出失败。");
    }

    return response.text();
  }
};
