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
  characters: CharacterDto[];
  locations: LocationDto[];
  time_markers: TimeMarkerDto[];
  events: EventDto[];
  relationships: RelationshipDto[];
  conflicts: ConflictDto[];
  dialogues: DialogueDto[];
  actions: ActionDto[];
  motivations: MotivationDto[];
  causal_links: CausalLinkDto[];
  scenes: SceneDto[];
  source_text: string;
};

export type CurrentNovel = {
  filename: string;
  message: string;
  sourceText: string;
  chapters: Chapter[];
  characters: Character[];
  locations: LocationDto[];
  timeMarkers: TimeMarkerDto[];
  events: Event[];
  relationships: Relationship[];
  conflicts: ConflictDto[];
  dialogues: DialogueDto[];
  actions: ActionDto[];
  motivations: MotivationDto[];
  causalLinks: CausalLinkDto[];
  scenes: Scene[];
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

export type CharacterDto = {
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
  type: string;
  strength: number;
  evidence?: string;
};

export type Event = {
  id: string;
  chapterId: string;
  title: string;
  summary: string;
  conflict: string;
  characterIds: string[];
  characters?: string[];
  location?: string;
  timeText?: string;
  consequence?: string;
};

export type Scene = {
  id: string;
  title: string;
  location: string;
  timeOfDay: string;
  eventIds: string[];
  characterIds: string[];
  dramaticFunction: string;
  eventTitles?: string[];
  characters?: string[];
  adaptationNote?: string;
};

export type LocationDto = {
  id: string;
  name: string;
  type: string;
  description: string;
  evidence: string;
  chapter_id: string;
};

export type TimeMarkerDto = {
  id: string;
  chapter_id: string;
  time_text: string;
  normalized_time: string;
  time_of_day: string;
  sequence_order: number;
};

export type EventDto = {
  id: string;
  chapter_id: string;
  title: string;
  summary: string;
  conflict: string;
  character_ids: string[];
  characters: string[];
  location: string;
  time_text: string;
  consequence: string;
};

export type RelationshipDto = {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  evidence: string;
};

export type SceneDto = {
  id: string;
  title: string;
  location: string;
  time_of_day: string;
  event_ids: string[];
  character_ids: string[];
  dramatic_function: string;
  event_titles: string[];
  characters: string[];
  adaptation_note: string;
};

export type ConflictDto = {
  id: string;
  chapter_id: string;
  conflict_type: string;
  participants: string[];
  desire: string;
  obstacle: string;
  outcome: string;
  evidence: string;
};

export type DialogueDto = {
  id: string;
  chapter_id: string;
  speaker: string;
  listener: string;
  content: string;
  emotion: string;
  source_text: string;
};

export type ActionDto = {
  id: string;
  chapter_id: string;
  character: string;
  action: string;
  object: string;
  location: string;
  visuality_score: number;
};

export type MotivationDto = {
  id: string;
  chapter_id: string;
  character: string;
  goal: string;
  fear: string;
  secret: string;
  motivation: string;
};

export type CausalLinkDto = {
  id: string;
  chapter_id: string;
  cause_event: string;
  effect_event: string;
  relation_type: string;
  evidence: string;
};
