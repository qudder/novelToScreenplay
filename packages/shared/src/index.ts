export type ChapterDto = {
  id: string;
  title: string;
  summary: string;
  word_count: number;
  conflict: string;
  character_ids: string[];
};

export type CharacterDto = {
  id: string;
  name: string;
  aliases: string[];
  importance: number;
  role: string;
  description: string;
  appearances: string[];
};

export type RelationshipDto = {
  id: string;
  source: string;
  target: string;
  type: "同盟" | "敌对" | "亲属" | "暧昧" | "师徒";
  strength: number;
};

export type EventDto = {
  id: string;
  chapter_id: string;
  title: string;
  summary: string;
  conflict: string;
  character_ids: string[];
};

export type SceneDto = {
  id: string;
  title: string;
  location: string;
  time_of_day: string;
  event_ids: string[];
  character_ids: string[];
  dramatic_function: string;
};

export type WorkspaceDto = {
  chapters: ChapterDto[];
  characters: CharacterDto[];
  relationships: RelationshipDto[];
  events: EventDto[];
  scenes: SceneDto[];
};

