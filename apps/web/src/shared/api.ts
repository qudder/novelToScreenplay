import { chapters, characters, events, relationships, scenes } from "./mockData";
import type { Chapter, ChapterDto, ImportDocumentResult } from "./types";

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
      chapters: result.chapters.map(mapChapter)
    };
  }
};
