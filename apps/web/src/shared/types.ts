export type Chapter = {
  id: string;
  title: string;
  summary: string;
  wordCount: number;
  conflict: string;
  characterIds: string[];
  sourceStart?: number;
  sourceEnd?: number;
};

export type ChapterDto = {
  id: string;
  title: string;
  summary: string;
  word_count: number;
  conflict: string;
  character_ids: string[];
  source_start?: number;
  source_end?: number;
};

export type SourceRef = {
  chapterId: string;
  startChar: number;
  endChar: number;
  evidence: string;
};

export type SourceRefDto = {
  chapter_id: string;
  start_char: number;
  end_char: number;
  evidence: string;
};

export type CharacterCostume = {
  chapterId: string;
  sceneTitle: string;
  clothing: string;
  accessories: string[];
  makeup: string;
  colorPalette: string;
  condition: string;
  sourceRefs?: SourceRef[];
};

export type CharacterCostumeDto = {
  chapter_id: string;
  scene_title: string;
  clothing: string;
  accessories: string[];
  makeup: string;
  color_palette: string;
  condition: string;
  source_refs?: SourceRefDto[];
};

export type SceneInfo = {
  locationDetails: string;
  timeText: string;
  weather: string;
  light: string;
  sound: string;
  atmosphere: string;
  props: string[];
  visualDetails: string[];
  sourceRefs?: SourceRef[];
};

export type SceneInfoDto = {
  location_details: string;
  time_text: string;
  weather: string;
  light: string;
  sound: string;
  atmosphere: string;
  props: string[];
  visual_details: string[];
  source_refs?: SourceRefDto[];
};

export type ImportDocumentResult = {
  document_id: string;
  filename: string;
  status: "queued" | "parsed";
  message: string;
  chapters: ChapterDto[];
  characters: CharacterDto[];
  locations: LocationDto[];
  environments: EnvironmentInfoDto[];
  shot_plans: ShotPlanDto[];
  time_markers: TimeMarkerDto[];
  events: EventDto[];
  relationships: RelationshipDto[];
  conflicts: ConflictDto[];
  dialogues: DialogueDto[];
  actions: ActionDto[];
  motivations: MotivationDto[];
  causal_links: CausalLinkDto[];
  scenes: SceneDto[];
  narrative_blocks: NarrativeBlockDto[];
  sub_scenes: SubSceneDto[];
  empty_chapter_ids?: string[];
  source_text: string;
};

export type CurrentNovel = {
  documentId?: string;
  analysisStatus?: "idle" | "running" | "completed" | "failed";
  filename: string;
  message: string;
  sourceText: string;
  chapters: Chapter[];
  characters: Character[];
  locations: LocationDto[];
  environments: EnvironmentInfo[];
  shotPlans: ShotPlan[];
  timeMarkers: TimeMarkerDto[];
  events: Event[];
  relationships: Relationship[];
  conflicts: ConflictDto[];
  dialogues: DialogueDto[];
  actions: ActionDto[];
  motivations: MotivationDto[];
  causalLinks: CausalLinkDto[];
  scenes: Scene[];
  narrativeBlocks: NarrativeBlock[];
  subScenes: SubScene[];
  emptyChapterIds?: string[];
  importedAt: string;
};

export type AnalysisResultDto = {
  document_id: string;
  status: "idle" | "running" | "completed" | "failed";
  message: string;
  characters: CharacterDto[];
  locations: LocationDto[];
  environments: EnvironmentInfoDto[];
  shot_plans: ShotPlanDto[];
  time_markers: TimeMarkerDto[];
  events: EventDto[];
  relationships: RelationshipDto[];
  conflicts: ConflictDto[];
  dialogues: DialogueDto[];
  actions: ActionDto[];
  motivations: MotivationDto[];
  causal_links: CausalLinkDto[];
  scenes: SceneDto[];
  narrative_blocks: NarrativeBlockDto[];
  sub_scenes: SubSceneDto[];
  empty_chapter_ids?: string[];
};

export type Character = {
  id: string;
  name: string;
  aliases: string[];
  importance: number;
  role: string;
  description: string;
  appearances: string[];
  costumes?: CharacterCostume[];
  sourceRefs?: SourceRef[];
};

export type CharacterDto = {
  id: string;
  name: string;
  aliases: string[];
  importance: number;
  role: string;
  description: string;
  appearances: string[];
  costumes?: CharacterCostumeDto[];
  source_refs?: SourceRefDto[];
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
  dialogueIds?: string[];
  environmentIds?: string[];
  sourceRefs?: SourceRef[];
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
  sceneInfo?: SceneInfo;
  sourceRefs?: SourceRef[];
};

export type NarrativeBlock = {
  id: string;
  title: string;
  chapterIds: string[];
  summary: string;
  dramaticGoal: string;
  mainConflict: string;
  storyTime: string;
  locationScope: string;
  characterIds: string[];
  characters: string[];
  subSceneIds: string[];
  sourceRefs?: SourceRef[];
};

export type NarrativeBlockDto = {
  id: string;
  title: string;
  chapter_ids: string[];
  summary: string;
  dramatic_goal: string;
  main_conflict: string;
  story_time: string;
  location_scope: string;
  character_ids: string[];
  characters: string[];
  sub_scene_ids: string[];
  source_refs?: SourceRefDto[];
};

export type SubScene = {
  id: string;
  blockId: string;
  chapterId: string;
  title: string;
  location: string;
  timeText: string;
  timeOfDay: string;
  dramaticFunction: string;
  eventTitles: string[];
  eventIds: string[];
  dialogueIds: string[];
  environmentIds: string[];
  shotIds: string[];
  actionIds: string[];
  conflictIds: string[];
  characters: string[];
  characterIds: string[];
  sceneInfo?: SceneInfo;
  sourceRefs?: SourceRef[];
};

export type SubSceneDto = {
  id: string;
  block_id: string;
  chapter_id: string;
  title: string;
  location: string;
  time_text: string;
  time_of_day: string;
  dramatic_function: string;
  event_titles: string[];
  event_ids: string[];
  dialogue_ids: string[];
  environment_ids: string[];
  shot_ids: string[];
  action_ids: string[];
  conflict_ids: string[];
  characters: string[];
  character_ids: string[];
  scene_info?: SceneInfoDto;
  source_refs?: SourceRefDto[];
};

export type LocationDto = {
  id: string;
  name: string;
  type: string;
  description: string;
  evidence: string;
  chapter_id: string;
};

export type EnvironmentInfo = {
  id: string;
  chapterId: string;
  sceneTitle: string;
  eventTitles: string[];
  location: string;
  timeText: string;
  weather: string;
  light: string;
  sound: string;
  atmosphere: string;
  props: string[];
  visualDetails: string[];
  sourceRefs?: SourceRef[];
};

export type EnvironmentInfoDto = {
  id: string;
  chapter_id: string;
  scene_title: string;
  event_titles: string[];
  location: string;
  time_text: string;
  weather: string;
  light: string;
  sound: string;
  atmosphere: string;
  props: string[];
  visual_details: string[];
  source_refs?: SourceRefDto[];
};

export type ShotPlan = {
  id: string;
  chapterId: string;
  sceneTitle: string;
  eventTitle: string;
  sequenceOrder: number;
  shotType: string;
  viewpoint: string;
  composition: string;
  cameraMovement: string;
  visualFocus: string;
  emotionalPurpose: string;
  transition: string;
  sourceRefs?: SourceRef[];
};

export type ShotPlanDto = {
  id: string;
  chapter_id: string;
  scene_title: string;
  event_title: string;
  sequence_order: number;
  shot_type: string;
  viewpoint: string;
  composition: string;
  camera_movement: string;
  visual_focus: string;
  emotional_purpose: string;
  transition: string;
  source_refs?: SourceRefDto[];
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
  dialogue_ids?: string[];
  environment_ids?: string[];
  source_refs?: SourceRefDto[];
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
  scene_info?: SceneInfoDto;
  source_refs?: SourceRefDto[];
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
  event_title: string;
  event_id: string;
  speaker: string;
  listener: string;
  content: string;
  emotion: string;
  source_text: string;
  dramatic_purpose: string;
  source_refs?: SourceRefDto[];
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
