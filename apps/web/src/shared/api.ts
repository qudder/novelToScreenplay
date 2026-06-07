import { chapters, characters, events, relationships, scenes } from "./mockData";
import type {
  Chapter,
  ChapterDto,
  Character,
  CharacterDto,
  EnvironmentInfo,
  EnvironmentInfoDto,
  Event,
  EventDto,
  AnalysisResultDto,
  ImportDocumentResult,
  NarrativeBlock,
  NarrativeBlockDto,
  Relationship,
  RelationshipDto,
  Scene,
  SceneDto,
  ShotPlan,
  ShotPlanDto,
  SourceRef,
  SourceRefDto,
  SubScene,
  SubSceneDto
} from "./types";
import type { SceneScreenplayDraft, ScreenplayDraft } from "./screenplayDraft";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function resolveApiAssetUrl(url: string) {
  if (!url || !url.startsWith("/")) return url;
  return `${API_BASE_URL}${url}`;
}

type SeedanceTaskDto = {
  id: string;
  model: string;
  status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled" | "unknown";
  video_url: string;
  original_video_url?: string;
  local_video_path?: string;
  error_message: string;
  created_at?: number | null;
  updated_at?: number | null;
  raw: Record<string, unknown>;
};

type SeedreamImageGenerationDto = {
  id: string;
  model: string;
  status: "succeeded" | "failed" | "unknown";
  image_url: string;
  original_image_url?: string;
  local_image_path?: string;
  b64_json: string;
  error_message: string;
  media?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

type ArkModelListDto = {
  models: Array<{
    id: string;
    name: string;
    owned_by: string;
  }>;
};

export type DocumentSummary = {
  documentId: string;
  filename: string;
  message: string;
  analysisStatus: "idle" | "running" | "completed" | "failed";
  chapterCount: number;
  characterCount: number;
  eventCount: number;
  sceneCount: number;
};

type DocumentSummaryDto = {
  document_id: string;
  filename: string;
  message: string;
  analysis_status: "idle" | "running" | "completed" | "failed";
  chapter_count: number;
  character_count: number;
  event_count: number;
  scene_count: number;
};

function mapSeedanceStatus(status: SeedanceTaskDto["status"]): "queued" | "running" | "completed" | "failed" {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "expired" || status === "cancelled") return "failed";
  if (status === "queued") return "queued";
  return "running";
}

function mapSeedanceTask(task: SeedanceTaskDto) {
  return {
    providerTaskId: task.id,
    model: task.model,
    status: mapSeedanceStatus(task.status),
    videoUrl: resolveApiAssetUrl(task.video_url),
    originalVideoUrl: task.original_video_url ?? task.video_url,
    localVideoPath: task.local_video_path ?? "",
    errorMessage: task.error_message,
    rawStatus: task.status
  };
}

function mapSourceRef(dto: SourceRefDto): SourceRef {
  return {
    chapterId: dto.chapter_id,
    startChar: dto.start_char,
    endChar: dto.end_char,
    evidence: dto.evidence
  };
}

function mapSeedreamImageGeneration(result: SeedreamImageGenerationDto) {
  return {
    providerTaskId: result.id,
    model: result.model,
    status: result.status === "succeeded" ? "completed" : result.status === "failed" ? "failed" : "running",
    imageUrl: resolveApiAssetUrl(result.image_url),
    originalImageUrl: result.original_image_url ?? result.image_url,
    localImagePath: result.local_image_path ?? "",
    media: result.media ?? {},
    b64Json: result.b64_json,
    errorMessage: result.error_message
  } as const;
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
    characterIds: dto.character_ids,
    sourceStart: dto.source_start ?? -1,
    sourceEnd: dto.source_end ?? -1
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
    dialogueIds: dto.dialogue_ids ?? [],
    environmentIds: dto.environment_ids ?? [],
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
  };
}

function mapEnvironment(dto: EnvironmentInfoDto): EnvironmentInfo {
  return {
    id: dto.id,
    chapterId: dto.chapter_id,
    sceneTitle: dto.scene_title,
    eventTitles: dto.event_titles,
    location: dto.location,
    timeText: dto.time_text,
    weather: dto.weather,
    light: dto.light,
    sound: dto.sound,
    atmosphere: dto.atmosphere,
    props: dto.props,
    visualDetails: dto.visual_details,
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
  };
}

function mapShotPlan(dto: ShotPlanDto): ShotPlan {
  return {
    id: dto.id,
    chapterId: dto.chapter_id,
    sceneTitle: dto.scene_title,
    eventTitle: dto.event_title,
    sequenceOrder: dto.sequence_order,
    shotType: dto.shot_type,
    viewpoint: dto.viewpoint,
    composition: dto.composition,
    cameraMovement: dto.camera_movement,
    visualFocus: dto.visual_focus,
    emotionalPurpose: dto.emotional_purpose,
    transition: dto.transition,
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

function mapNarrativeBlock(dto: NarrativeBlockDto): NarrativeBlock {
  return {
    id: dto.id,
    title: dto.title,
    chapterIds: dto.chapter_ids,
    summary: dto.summary,
    dramaticGoal: dto.dramatic_goal,
    mainConflict: dto.main_conflict,
    storyTime: dto.story_time,
    locationScope: dto.location_scope,
    characterIds: dto.character_ids,
    characters: dto.characters,
    subSceneIds: dto.sub_scene_ids,
    sourceRefs: (dto.source_refs ?? []).map(mapSourceRef)
  };
}

function mapSubScene(dto: SubSceneDto): SubScene {
  return {
    id: dto.id,
    blockId: dto.block_id,
    chapterId: dto.chapter_id,
    title: dto.title,
    location: dto.location,
    timeText: dto.time_text,
    timeOfDay: dto.time_of_day,
    dramaticFunction: dto.dramatic_function,
    eventTitles: dto.event_titles,
    eventIds: dto.event_ids,
    dialogueIds: dto.dialogue_ids,
    environmentIds: dto.environment_ids,
    shotIds: dto.shot_ids ?? [],
    actionIds: dto.action_ids,
    conflictIds: dto.conflict_ids,
    characters: dto.characters,
    characterIds: dto.character_ids,
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
    character_ids: chapter.characterIds,
    source_start: chapter.sourceStart ?? -1,
    source_end: chapter.sourceEnd ?? -1
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
    dialogue_ids: event.dialogueIds ?? [],
    environment_ids: event.environmentIds ?? [],
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

function toEnvironmentDto(environment: EnvironmentInfo): EnvironmentInfoDto {
  return {
    id: environment.id,
    chapter_id: environment.chapterId,
    scene_title: environment.sceneTitle,
    event_titles: environment.eventTitles,
    location: environment.location,
    time_text: environment.timeText,
    weather: environment.weather,
    light: environment.light,
    sound: environment.sound,
    atmosphere: environment.atmosphere,
    props: environment.props,
    visual_details: environment.visualDetails,
    source_refs: (environment.sourceRefs ?? []).map(toSourceRefDto)
  };
}

function toShotPlanDto(shotPlan: ShotPlan): ShotPlanDto {
  return {
    id: shotPlan.id,
    chapter_id: shotPlan.chapterId,
    scene_title: shotPlan.sceneTitle,
    event_title: shotPlan.eventTitle,
    sequence_order: shotPlan.sequenceOrder,
    shot_type: shotPlan.shotType,
    viewpoint: shotPlan.viewpoint,
    composition: shotPlan.composition,
    camera_movement: shotPlan.cameraMovement,
    visual_focus: shotPlan.visualFocus,
    emotional_purpose: shotPlan.emotionalPurpose,
    transition: shotPlan.transition,
    source_refs: (shotPlan.sourceRefs ?? []).map(toSourceRefDto)
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

function toNarrativeBlockDto(block: NarrativeBlock): NarrativeBlockDto {
  return {
    id: block.id,
    title: block.title,
    chapter_ids: block.chapterIds,
    summary: block.summary,
    dramatic_goal: block.dramaticGoal,
    main_conflict: block.mainConflict,
    story_time: block.storyTime,
    location_scope: block.locationScope,
    character_ids: block.characterIds,
    characters: block.characters,
    sub_scene_ids: block.subSceneIds,
    source_refs: (block.sourceRefs ?? []).map(toSourceRefDto)
  };
}

function toSubSceneDto(subScene: SubScene): SubSceneDto {
  return {
    id: subScene.id,
    block_id: subScene.blockId,
    chapter_id: subScene.chapterId,
    title: subScene.title,
    location: subScene.location,
    time_text: subScene.timeText,
    time_of_day: subScene.timeOfDay,
    dramatic_function: subScene.dramaticFunction,
    event_titles: subScene.eventTitles,
    event_ids: subScene.eventIds,
    dialogue_ids: subScene.dialogueIds,
    environment_ids: subScene.environmentIds,
    shot_ids: subScene.shotIds ?? [],
    action_ids: subScene.actionIds,
    conflict_ids: subScene.conflictIds,
    characters: subScene.characters,
    character_ids: subScene.characterIds,
    source_refs: (subScene.sourceRefs ?? []).map(toSourceRefDto)
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
    environments: (result.environments ?? []).map(mapEnvironment),
    shotPlans: (result.shot_plans ?? []).map(mapShotPlan),
    timeMarkers: result.time_markers,
    events: result.events.map(mapEvent),
    relationships: result.relationships.map(mapRelationship),
    conflicts: result.conflicts,
    dialogues: result.dialogues,
    actions: result.actions,
    motivations: result.motivations,
    causalLinks: result.causal_links,
    scenes: result.scenes.map(mapScene),
    narrativeBlocks: (result.narrative_blocks ?? []).map(mapNarrativeBlock),
    subScenes: (result.sub_scenes ?? []).map(mapSubScene),
    emptyChapterIds: result.empty_chapter_ids ?? []
  };
}

export type MappedImportResult = ReturnType<typeof mapImportResult>;

function mapDocumentSummary(result: DocumentSummaryDto): DocumentSummary {
  return {
    documentId: result.document_id,
    filename: result.filename,
    message: result.message,
    analysisStatus: result.analysis_status,
    chapterCount: result.chapter_count,
    characterCount: result.character_count,
    eventCount: result.event_count,
    sceneCount: result.scene_count
  };
}

function mapAnalysisResult(result: AnalysisResultDto) {
  return {
    documentId: result.document_id,
    status: result.status,
    message: result.message,
    characters: result.characters.map(mapCharacter),
    locations: result.locations,
    environments: (result.environments ?? []).map(mapEnvironment),
    shotPlans: (result.shot_plans ?? []).map(mapShotPlan),
    timeMarkers: result.time_markers,
    events: result.events.map(mapEvent),
    relationships: result.relationships.map(mapRelationship),
    conflicts: result.conflicts,
    dialogues: result.dialogues,
    actions: result.actions,
    motivations: result.motivations,
    causalLinks: result.causal_links,
    scenes: result.scenes.map(mapScene),
    narrativeBlocks: (result.narrative_blocks ?? []).map(mapNarrativeBlock),
    subScenes: (result.sub_scenes ?? []).map(mapSubScene),
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
    environments: EnvironmentInfo[];
    shotPlans: ShotPlan[];
    timeMarkers: ImportDocumentResult["time_markers"];
    events: Event[];
    relationships: Relationship[];
    conflicts: ImportDocumentResult["conflicts"];
    dialogues: ImportDocumentResult["dialogues"];
    actions: ImportDocumentResult["actions"];
    motivations: ImportDocumentResult["motivations"];
    causalLinks: ImportDocumentResult["causal_links"];
    scenes: Scene[];
    narrativeBlocks: NarrativeBlock[];
    subScenes: SubScene[];
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

  async listDocuments(): Promise<DocumentSummary[]> {
    const response = await fetch(`${API_BASE_URL}/api/documents`);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "读取本地文档列表失败。");
    }

    return ((await response.json()) as DocumentSummaryDto[]).map(mapDocumentSummary);
  },

  async getDocument(documentId: string): Promise<MappedImportResult> {
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
    environments: EnvironmentInfo[];
    shotPlans: ShotPlan[];
    timeMarkers: ImportDocumentResult["time_markers"];
    events: Event[];
    relationships: Relationship[];
    conflicts: ImportDocumentResult["conflicts"];
    dialogues: ImportDocumentResult["dialogues"];
    actions: ImportDocumentResult["actions"];
    motivations: ImportDocumentResult["motivations"];
    causalLinks: ImportDocumentResult["causal_links"];
    scenes: Scene[];
    narrativeBlocks: NarrativeBlock[];
    subScenes: SubScene[];
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
      environments: snapshot.environments.map(toEnvironmentDto),
      shot_plans: (snapshot.shotPlans ?? []).map(toShotPlanDto),
      time_markers: snapshot.timeMarkers,
      events: snapshot.events.map(toEventDto),
      relationships: snapshot.relationships.map(toRelationshipDto),
      conflicts: snapshot.conflicts,
      dialogues: snapshot.dialogues,
      actions: snapshot.actions,
      motivations: snapshot.motivations,
      causal_links: snapshot.causalLinks,
      scenes: snapshot.scenes.map(toSceneDto),
      narrative_blocks: (snapshot.narrativeBlocks ?? []).map(toNarrativeBlockDto),
      sub_scenes: (snapshot.subScenes ?? []).map(toSubSceneDto)
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

  async getSeedanceSettings(): Promise<{ configured: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/settings/seedance`);
    if (!response.ok) {
      throw new Error("读取 Seedance 配置失败。");
    }

    return (await response.json()) as { configured: boolean };
  },

  async saveSeedanceApiKey(apiKey: string): Promise<{ configured: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/settings/seedance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ api_key: apiKey })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "保存 Seedance API Key 失败。");
    }

    return (await response.json()) as { configured: boolean };
  },

  async getSeedanceModels(): Promise<ArkModelListDto["models"]> {
    const response = await fetch(`${API_BASE_URL}/api/settings/seedance/models`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail ?? "读取可用模型失败。");
    }

    const result = (await response.json()) as ArkModelListDto;
    return result.models;
  },

  async createSeedanceVideoTask(payload: {
    title: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    screenplayText: string;
    referenceImageUrl?: string;
    referenceImageUrls?: string[];
    referenceImageRole?: "reference" | "first_frame";
    ratio: string;
    duration: number;
    resolution: string;
    seed?: number;
    cameraFixed: boolean;
  }): Promise<ReturnType<typeof mapSeedanceTask>> {
    const response = await fetch(`${API_BASE_URL}/api/videos/seedance/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: payload.title,
        model: payload.model,
        prompt: payload.prompt,
        negative_prompt: payload.negativePrompt,
        screenplay_text: payload.screenplayText,
        reference_image_url: payload.referenceImageUrl ?? "",
        reference_image_urls: payload.referenceImageUrls ?? [],
        reference_image_role: payload.referenceImageRole ?? "first_frame",
        ratio: payload.ratio,
        duration: payload.duration,
        resolution: payload.resolution,
        seed: payload.seed,
        camera_fixed: payload.cameraFixed
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "创建 Seedance 视频任务失败。");
    }

    return mapSeedanceTask((await response.json()) as SeedanceTaskDto);
  },

  async getSeedanceVideoTask(taskId: string): Promise<ReturnType<typeof mapSeedanceTask>> {
    const response = await fetch(`${API_BASE_URL}/api/videos/seedance/tasks/${taskId}`);

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "查询 Seedance 视频任务失败。");
    }

    return mapSeedanceTask((await response.json()) as SeedanceTaskDto);
  },

  async createSeedreamImageGeneration(payload: {
    title: string;
    model: string;
    prompt: string;
    negativePrompt: string;
    size: string;
    seed?: number;
    documentId?: string;
    filename?: string;
    chapterId?: string;
    chapterTitle?: string;
    sceneId?: string;
    sceneTitle?: string;
    shotId?: string;
    shotLabel?: string;
    frameId?: string;
    frameLabel?: string;
  }): Promise<ReturnType<typeof mapSeedreamImageGeneration>> {
    const response = await fetch(`${API_BASE_URL}/api/images/seedream/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: payload.title,
        model: payload.model,
        prompt: payload.prompt,
        negative_prompt: payload.negativePrompt,
        size: payload.size,
        seed: payload.seed,
        response_format: "b64_json",
        document_id: payload.documentId ?? "",
        filename: payload.filename ?? "",
        chapter_id: payload.chapterId ?? "",
        chapter_title: payload.chapterTitle ?? "",
        scene_id: payload.sceneId ?? "",
        scene_title: payload.sceneTitle ?? "",
        shot_id: payload.shotId ?? "",
        shot_label: payload.shotLabel ?? "",
        frame_id: payload.frameId ?? "",
        frame_label: payload.frameLabel ?? ""
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "生成分镜图片失败。");
    }

    return mapSeedreamImageGeneration((await response.json()) as SeedreamImageGenerationDto);
  },

  async generateStoryboardFramePrompt(payload: {
    documentId: string;
    filename: string;
    scene: SceneScreenplayDraft;
    shot: unknown;
    frame: unknown;
  }): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/storyboard-prompts/frame`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        document_id: payload.documentId,
        filename: payload.filename,
        scene_id: payload.scene.sceneId,
        scene_title: payload.scene.title,
        location: payload.scene.location,
        time_of_day: payload.scene.timeOfDay,
        characters: payload.scene.characters,
        shot: payload.shot,
        frame: payload.frame
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "生成小分镜提示词失败。");
    }

    const result = (await response.json()) as { prompt: string };
    return result.prompt;
  },

  async generateStoryboardBatchPrompts(payload: {
    documentId: string;
    filename: string;
    scene: SceneScreenplayDraft;
    shot: unknown;
    frames: unknown[];
  }): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE_URL}/api/storyboard-prompts/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        document_id: payload.documentId,
        filename: payload.filename,
        scene_id: payload.scene.sceneId,
        scene_title: payload.scene.title,
        location: payload.scene.location,
        time_of_day: payload.scene.timeOfDay,
        characters: payload.scene.characters,
        shot: payload.shot,
        frames: payload.frames
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "批量生成小分镜提示词失败。");
    }

    const result = (await response.json()) as { prompts: Record<string, string> };
    return result.prompts;
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
  },

  async completeSceneScreenplay(payload: {
    documentId: string;
    filename: string;
    scene: SceneScreenplayDraft;
    sourceText: string;
    events: Event[];
    currentContent: string;
  }): Promise<string> {
    const sceneEventIdSet = new Set(payload.scene.eventIds);
    const sceneEventTitleSet = new Set(payload.scene.eventTitles);
    const relatedEvents = payload.events.filter((event) => sceneEventIdSet.has(event.id) || sceneEventTitleSet.has(event.title));
    const response = await fetch(`${API_BASE_URL}/api/screenplays/complete-scene`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        document_id: payload.documentId,
        filename: payload.filename,
        scene_id: payload.scene.sceneId,
        block_title: payload.scene.blockTitle,
        scene_title: payload.scene.title,
        location: payload.scene.location,
        time_of_day: payload.scene.timeOfDay,
        dramatic_function: payload.scene.dramaticFunction,
        event_titles: payload.scene.eventTitles,
        characters: payload.scene.characters,
        environments: payload.scene.environments,
        shot_plans: payload.scene.shotPlans,
        dialogues: payload.scene.dialogues,
        events: relatedEvents,
        source_refs: payload.scene.sourceRefs.map(toSourceRefDto),
        source_text: payload.sourceText,
        current_content: payload.currentContent
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.detail ?? "AI 剧本补全失败。");
    }

    const result = (await response.json()) as { content: string };
    return result.content;
  }
};
