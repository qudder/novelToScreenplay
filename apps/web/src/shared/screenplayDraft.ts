import type { CurrentNovel, DialogueDto, EnvironmentInfo, Scene, SourceRef, SubScene } from "./types";

const STORAGE_KEY = "novel-to-screenplay.screenplayDraft";

export type SceneScreenplayDraft = {
  sceneId: string;
  blockId: string;
  blockTitle: string;
  title: string;
  location: string;
  timeOfDay: string;
  dramaticFunction: string;
  eventIds: string[];
  eventTitles: string[];
  characters: string[];
  environments: EnvironmentInfo[];
  dialogues: DialogueDto[];
  sourceRefs: SourceRef[];
  content: string;
  updatedAt: string;
  aiCompleted: boolean;
};

export type ScreenplayDraft = {
  documentId: string;
  filename: string;
  title: string;
  scenes: SceneScreenplayDraft[];
  updatedAt: string;
};

export function buildDraftFromNovel(novel: CurrentNovel): ScreenplayDraft {
  const existingDraft = getScreenplayDraft();
  const existingScenes = new Map(existingDraft?.scenes.map((scene) => [scene.sceneId, scene]));
  const sceneMaterials = buildSceneMaterials(novel);
  const scenes = sceneMaterials.map((scene, index) => {
    const existingScene = existingScenes.get(scene.id);
    const eventTitleSet = new Set(scene.eventTitles);
    const eventIdSet = new Set(scene.eventIds);
    const relatedEvents = novel.events.filter((event) => eventIdSet.has(event.id) || eventTitleSet.has(event.title));
    const relatedDialogues = collectSceneDialogues(novel.dialogues, relatedEvents, eventTitleSet);
    const relatedEnvironments = collectSceneEnvironments(novel.environments, scene, eventTitleSet);

    return {
      sceneId: scene.id,
      blockId: scene.blockId,
      blockTitle: scene.blockTitle,
      title: scene.title || `场景 ${index + 1}`,
      location: scene.location || "地点待定",
      timeOfDay: scene.timeOfDay || "时间待定",
      dramaticFunction: scene.dramaticFunction || "功能待定",
      eventIds: scene.eventIds,
      eventTitles: scene.eventTitles,
      characters: scene.characters ?? [],
      environments: relatedEnvironments,
      dialogues: relatedDialogues,
      sourceRefs: scene.sourceRefs ?? [],
      content: existingScene?.content || createInitialSceneContent(scene, relatedEnvironments, relatedDialogues),
      updatedAt: existingScene?.updatedAt || new Date().toISOString(),
      aiCompleted: existingScene?.aiCompleted ?? false
    };
  });

  return {
    documentId: novel.documentId ?? "",
    filename: novel.filename,
    title: `${novel.filename.replace(/\.[^.]+$/, "")} 剧本草稿`,
    scenes,
    updatedAt: new Date().toISOString()
  };
}

export function getScreenplayDraft(): ScreenplayDraft | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ScreenplayDraft;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveScreenplayDraft(draft: ScreenplayDraft) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent("screenplay-draft-updated"));
}

export function updateSceneDraft(draft: ScreenplayDraft, sceneId: string, content: string, aiCompleted?: boolean): ScreenplayDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    scenes: draft.scenes.map((scene) =>
      scene.sceneId === sceneId
        ? {
            ...scene,
            content,
            aiCompleted: aiCompleted ?? scene.aiCompleted,
            updatedAt: new Date().toISOString()
          }
        : scene
    )
  };
}

export function createAiCompletion(scene: SceneScreenplayDraft) {
  const heading = `内景 ${scene.location} - ${normalizeTimeOfDay(scene.timeOfDay)}`;
  const characters = scene.characters.length ? scene.characters.join("、") : "相关人物";
  const environmentLine = formatEnvironmentLine(scene.environments);
  const dialogueLines = scene.dialogues.length
    ? scene.dialogues
        .slice(0, 4)
        .map((dialogue) => `${dialogue.speaker || "角色"}\n${dialogue.content || dialogue.source_text}`)
        .join("\n\n")
    : `${scene.characters[0] ?? "角色"}\n我们不能再停在原地。\n\n${scene.characters[1] ?? scene.characters[0] ?? "对方"}\n那就拿出能改变局面的证据。`;

  return `${heading}

${environmentLine}

${scene.location}中，${characters}进入同一场冲突。本场功能是${scene.dramaticFunction}。

${dialogueLines}

场面短暂停住，新的选择摆在众人面前。`;
}

function createInitialSceneContent(scene: SceneMaterial, environments: EnvironmentInfo[], dialogues: DialogueDto[]) {
  const heading = `内景 ${scene.location || "地点待定"} - ${normalizeTimeOfDay(scene.timeOfDay)}`;
  const environmentNote = environments.length ? `\n\n环境参考：${formatEnvironmentLine(environments)}` : "";
  const dialogueNote = dialogues.length
    ? `\n\n对话参考：${dialogues
        .slice(0, 3)
        .map((dialogue) => `${dialogue.speaker}：${dialogue.content}`)
        .join("\n")}`
    : "";
  const adaptationNote = scene.adaptationNote ? `\n\n改编提示：${scene.adaptationNote}` : "";
  return `${heading}

请在这里围绕环境、人物行动和关键对话编写本场剧本。${environmentNote}${dialogueNote}${adaptationNote}`;
}

type SceneMaterial = {
  id: string;
  blockId: string;
  blockTitle: string;
  title: string;
  location: string;
  timeOfDay: string;
  dramaticFunction: string;
  eventIds: string[];
  eventTitles: string[];
  environmentIds: string[];
  characters: string[];
  sourceRefs: SourceRef[];
  adaptationNote?: string;
};

function buildSceneMaterials(novel: CurrentNovel): SceneMaterial[] {
  const subScenes = novel.subScenes ?? [];
  const narrativeBlocks = novel.narrativeBlocks ?? [];
  if (subScenes.length > 0) {
    const blockById = new Map(narrativeBlocks.map((block) => [block.id, block]));
    return subScenes.map((subScene) => {
      const block = blockById.get(subScene.blockId);
      return {
        id: subScene.id,
        blockId: subScene.blockId,
        blockTitle: block?.title ?? "未分组总场景",
        title: subScene.title,
        location: subScene.location,
        timeOfDay: subScene.timeText || subScene.timeOfDay,
        dramaticFunction: subScene.dramaticFunction,
        eventIds: subScene.eventIds,
        eventTitles: subScene.eventTitles,
        environmentIds: subScene.environmentIds,
        characters: subScene.characters,
        sourceRefs: subScene.sourceRefs ?? []
      };
    });
  }

  return novel.scenes.map((scene) => ({
    id: scene.id,
    blockId: "",
    blockTitle: "旧版场景候选",
    title: scene.title,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    dramaticFunction: scene.dramaticFunction,
    eventIds: scene.eventIds,
    eventTitles: scene.eventTitles ?? [],
    environmentIds: [],
    characters: scene.characters ?? [],
    sourceRefs: scene.sourceRefs ?? [],
    adaptationNote: scene.adaptationNote
  }));
}

function collectSceneDialogues(dialogues: DialogueDto[], relatedEvents: CurrentNovel["events"], eventTitleSet: Set<string>) {
  const eventIdSet = new Set(relatedEvents.map((event) => event.id));
  return dialogues.filter((dialogue) => {
    if (dialogue.event_id && eventIdSet.has(dialogue.event_id)) return true;
    if (dialogue.event_title && eventTitleSet.has(dialogue.event_title)) return true;
    return relatedEvents.some((event) => event.dialogueIds?.includes(dialogue.id));
  });
}

function collectSceneEnvironments(environments: EnvironmentInfo[], scene: SceneMaterial | SubScene, eventTitleSet: Set<string>) {
  const environmentIdSet = new Set("environmentIds" in scene ? scene.environmentIds : []);
  return environments.filter((environment) => {
    if (environmentIdSet.has(environment.id)) return true;
    if (environment.sceneTitle && environment.sceneTitle === scene.title) return true;
    if (environment.location && environment.location === scene.location) return true;
    return environment.eventTitles.some((eventTitle) => eventTitleSet.has(eventTitle));
  });
}

function formatEnvironmentLine(environments: EnvironmentInfo[]) {
  if (!environments.length) return "环境尚未明确，先用人物动作和场面调度建立空间。";
  const environment = environments[0];
  const details = [
    environment.weather ? `天气：${environment.weather}` : "",
    environment.light ? `光线：${environment.light}` : "",
    environment.sound ? `声音：${environment.sound}` : "",
    environment.atmosphere ? `氛围：${environment.atmosphere}` : "",
    environment.props.length ? `道具：${environment.props.join("、")}` : "",
    environment.visualDetails.length ? `视觉：${environment.visualDetails.join("、")}` : ""
  ].filter(Boolean);
  return details.join("；") || "环境尚未明确，先用人物动作和场面调度建立空间。";
}

function normalizeTimeOfDay(timeOfDay: string) {
  const value = timeOfDay.toUpperCase();
  if (value.includes("NIGHT") || timeOfDay.includes("夜")) return "夜";
  if (value.includes("DAWN") || timeOfDay.includes("晨")) return "晨";
  if (value.includes("DUSK") || timeOfDay.includes("昏")) return "昏";
  if (value.includes("DAY") || timeOfDay.includes("昼") || timeOfDay.includes("日")) return "日";
  return timeOfDay || "时间待定";
}
