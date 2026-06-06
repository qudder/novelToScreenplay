import type { CurrentNovel, Scene } from "./types";

const STORAGE_KEY = "novel-to-screenplay.screenplayDraft";

export type SceneScreenplayDraft = {
  sceneId: string;
  title: string;
  location: string;
  timeOfDay: string;
  dramaticFunction: string;
  eventIds: string[];
  eventTitles: string[];
  characters: string[];
  sourceRefs: Scene["sourceRefs"];
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
  const scenes = novel.scenes.map((scene, index) => {
    const existingScene = existingScenes.get(scene.id);
    return {
      sceneId: scene.id,
      title: scene.title || `场景 ${index + 1}`,
      location: scene.location || "地点待定",
      timeOfDay: scene.timeOfDay || "时间待定",
      dramaticFunction: scene.dramaticFunction || "功能待定",
      eventIds: scene.eventIds,
      eventTitles: scene.eventTitles ?? [],
      characters: scene.characters ?? [],
      sourceRefs: scene.sourceRefs ?? [],
      content: existingScene?.content || createInitialSceneContent(scene),
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
  const events = scene.eventTitles.length ? scene.eventTitles.join("；") : scene.eventIds.join("；");
  const functionLine = scene.dramaticFunction ? `本场功能是${scene.dramaticFunction}。` : "本场承担推进剧情的功能。";

  return `${heading}

${scene.location}中，${characters}进入同一场冲突。${functionLine}

${events ? `画面围绕「${events}」展开。` : "人物在沉默和试探中推动局面变化。"}

${scene.characters[0] ?? "角色"}
我们不能再停在原地。

${scene.characters[1] ?? scene.characters[0] ?? "对方"}
那就拿出能改变局面的证据。

场面短暂停住，新的选择摆在众人面前。`;
}

function createInitialSceneContent(scene: Scene) {
  const heading = `内景 ${scene.location || "地点待定"} - ${normalizeTimeOfDay(scene.timeOfDay)}`;
  const note = scene.adaptationNote ? `\n\n改编提示：${scene.adaptationNote}` : "";
  return `${heading}

请在这里编写本场动作、对白和转场。${note}`;
}

function normalizeTimeOfDay(timeOfDay: string) {
  const value = timeOfDay.toUpperCase();
  if (value.includes("NIGHT") || timeOfDay.includes("夜")) return "夜";
  if (value.includes("DAWN") || timeOfDay.includes("晨")) return "晨";
  if (value.includes("DUSK") || timeOfDay.includes("昏")) return "昏";
  if (value.includes("DAY") || timeOfDay.includes("昼") || timeOfDay.includes("日")) return "日";
  return timeOfDay || "时间待定";
}
