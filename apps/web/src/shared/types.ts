export type Chapter = {
  id: string;
  title: string;
  summary: string;
  wordCount: number;
  conflict: string;
  characterIds: string[];
};

export type ChapterDto = {
  id: string;
  title: string;
  summary: string;
  word_count: number;
  conflict: string;
  character_ids: string[];
};

export type ImportDocumentResult = {
  filename: string;
  status: "queued" | "parsed";
  message: string;
  chapters: ChapterDto[];
  source_text: string;
};

export type CurrentNovel = {
  filename: string;
  message: string;
  sourceText: string;
  chapters: Chapter[];
  importedAt: string;
};

export type Character = {
  id: string;
  name: string;
  aliases: string[];
  importance: number;
  role: string;
  description: string;
  appearances: string[];
};

export type Relationship = {
  id: string;
  source: string;
  target: string;
  type: "同盟" | "敌对" | "亲属" | "暧昧" | "师徒";
  strength: number;
};

export type Event = {
  id: string;
  chapterId: string;
  title: string;
  summary: string;
  conflict: string;
  characterIds: string[];
};

export type Scene = {
  id: string;
  title: string;
  location: string;
  timeOfDay: string;
  eventIds: string[];
  characterIds: string[];
  dramaticFunction: string;
};
