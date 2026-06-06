import { chapters, characters, events, relationships, scenes } from "./mockData";
import type { Chapter, ChapterDto, Character, CharacterDto, ImportDocumentResult } from "./types";

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
      characters: result.characters.map(mapCharacter)
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
