import { useEffect, useMemo, useState } from "react";
import { Bot, Save, Sparkles } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { useCurrentNovel } from "../../shared/currentNovel";
import { SourceTrace } from "../../shared/SourceTrace";
import {
  buildDraftFromNovel,
  getScreenplayDraft,
  saveScreenplayDraft,
  type ScreenplayDraft,
  updateSceneDraft
} from "../../shared/screenplayDraft";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ScreenplayPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const [draft, setDraft] = useState<ScreenplayDraft | null>(() => getScreenplayDraft());
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [editorValue, setEditorValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("请选择一个场景开始编写。");
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (!currentNovel) return;

    const nextDraft = buildDraftFromNovel(currentNovel);
    setDraft(nextDraft);
    saveScreenplayDraft(nextDraft);
    if (!selectedSceneId && nextDraft.scenes[0]) {
      setSelectedSceneId(nextDraft.scenes[0].sceneId);
    }
  }, [currentNovel, selectedSceneId]);

  const selectedScene = useMemo(
    () => draft?.scenes.find((scene) => scene.sceneId === selectedSceneId) ?? draft?.scenes[0],
    [draft, selectedSceneId]
  );
  const groupedScenes = useMemo(() => groupScenesByBlock(draft?.scenes ?? []), [draft?.scenes]);

  useEffect(() => {
    if (!selectedScene) return;
    setSelectedSceneId(selectedScene.sceneId);
    setEditorValue(selectedScene.content);
  }, [selectedScene?.sceneId]);

  function handleSelectScene(sceneId: string) {
    saveCurrentEditorValue();
    setSelectedSceneId(sceneId);
  }

  function saveCurrentEditorValue() {
    if (!draft || !selectedScene) return;
    const nextDraft = updateSceneDraft(draft, selectedScene.sceneId, editorValue);
    setDraft(nextDraft);
    saveScreenplayDraft(nextDraft);
    setStatusMessage("场景剧本已保存到本地。");
  }

  async function handleAiComplete() {
    if (!draft || !selectedScene || !currentNovel) return;
    setIsCompleting(true);
    setStatusMessage("正在调用 DeepSeek 生成本场剧本...");
    try {
      const completion = await studioApi.completeSceneScreenplay({
        documentId: currentNovel.documentId ?? draft.documentId,
        filename: currentNovel.filename,
        scene: selectedScene,
        sourceText: currentNovel.sourceText,
        events: currentNovel.events,
        currentContent: editorValue
      });
      const nextDraft = updateSceneDraft(draft, selectedScene.sceneId, completion, true);
      setDraft(nextDraft);
      saveScreenplayDraft(nextDraft);
      setEditorValue(completion);
      setStatusMessage("AI 剧本补全已生成，并保存到本地草稿。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "AI 剧本补全失败。");
    } finally {
      setIsCompleting(false);
    }
  }

  const scenes = draft?.scenes ?? [];

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Screenplay Draft"
        title="剧本生成"
        description="左侧选择场景，右侧编辑对应场景剧本。支持人工修改和自动补全，保存后可在剧本总览中导出。"
      />

      {!currentNovel ? (
        <div className="panel animate-in">
          <h2>暂无当前小说</h2>
          <p className="muted-line">请先导入小说并完成场景分析，再进入剧本生成。</p>
        </div>
      ) : (
        <div className="screenplay-workbench">
          <aside className="panel animate-in screenplay-scene-panel">
            <div className="section-title">
              <h2>场景列表</h2>
              <small>{scenes.length} 场</small>
            </div>
            <div className="screenplay-scene-list">
              {groupedScenes.length > 0 ? (
                groupedScenes.map((group) => (
                  <div className="screenplay-block-group" key={group.blockKey}>
                    <div className="screenplay-block-title">{group.blockTitle}</div>
                    {group.scenes.map((scene, index) => (
                      <button
                        className={`screenplay-scene-item${scene.sceneId === selectedScene?.sceneId ? " active" : ""}`}
                        type="button"
                        key={scene.sceneId}
                        onClick={() => handleSelectScene(scene.sceneId)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{scene.title}</strong>
                        <small>
                          {scene.location} · {scene.timeOfDay}
                        </small>
                        <em>{scene.aiCompleted ? "已补全" : "待编写"}</em>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                <div className="compact-card">
                  <strong>暂无场景</strong>
                  <p>请先在场景拆分板完成场景候选生成。</p>
                </div>
              )}
            </div>
          </aside>

          <section className="panel animate-in screenplay-editor-panel">
            {selectedScene ? (
              <>
                <div className="screenplay-editor-header">
                  <div>
                    <span>当前场景</span>
                    <h2>{selectedScene.title}</h2>
                    <small>
                      {selectedScene.blockTitle} · {selectedScene.location} · {selectedScene.timeOfDay} · {selectedScene.dramaticFunction}
                    </small>
                  </div>
                  <div className="toolbar">
                    <button className="ghost-button" type="button" disabled={isCompleting} onClick={handleAiComplete}>
                      <Bot size={16} />
                      {isCompleting ? "生成中..." : "AI 自动补全"}
                    </button>
                    <button className="primary-button" type="button" onClick={saveCurrentEditorValue}>
                      <Save size={16} />
                      保存本场
                    </button>
                  </div>
                </div>

                <div className="screenplay-scene-meta">
                  <div>
                    <strong>关联事件</strong>
                    <p>{(selectedScene.eventTitles.length ? selectedScene.eventTitles : selectedScene.eventIds).join("、") || "暂无关联事件"}</p>
                  </div>
                  <div>
                    <strong>出场人物</strong>
                    <p>{selectedScene.characters.join("、") || "暂无人物"}</p>
                  </div>
                  <div>
                    <strong>环境参考</strong>
                    <p>
                      {selectedScene.environments.length
                        ? selectedScene.environments
                            .map((environment) => [environment.atmosphere, environment.light, environment.sound].filter(Boolean).join(" / "))
                            .filter(Boolean)
                            .join("；") || "暂无环境细节"
                        : "暂无环境细节"}
                    </p>
                  </div>
                  <div>
                    <strong>分镜参考</strong>
                    <p className="dialogue-reference-list">
                      {selectedScene.shotPlans.length
                        ? selectedScene.shotPlans
                            .slice(0, 4)
                            .map((shot) =>
                              [
                                shot.sequenceOrder ? `镜头${shot.sequenceOrder}` : "镜头",
                                shot.shotType,
                                shot.viewpoint,
                                shot.composition,
                                shot.cameraMovement
                              ]
                                .filter(Boolean)
                                .join("｜")
                            )
                            .join("\n")
                        : "暂无分镜参考"}
                    </p>
                  </div>
                  <div>
                    <strong>对话参考</strong>
                    <p className="dialogue-reference-list">
                      {selectedScene.dialogues.length
                        ? selectedScene.dialogues
                            .slice(0, 3)
                            .map((dialogue) => `${dialogue.speaker}：${dialogue.content}`)
                            .join("\n")
                        : "暂无关联对话"}
                    </p>
                  </div>
                  <SourceTrace refs={selectedScene.sourceRefs} />
                </div>

                <textarea
                  className="screenplay-scene-editor"
                  value={editorValue}
                  onChange={(event) => setEditorValue(event.target.value)}
                />

                <div className="screenplay-status">
                  <Sparkles size={16} />
                  <span>{statusMessage}</span>
                </div>
              </>
            ) : (
              <div className="empty-graph-state">
                <strong>没有可编辑场景</strong>
                <p>完成叙事分析后，场景会出现在这里。</p>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function groupScenesByBlock(scenes: ScreenplayDraft["scenes"]) {
  const groups = new Map<string, ScreenplayDraft["scenes"]>();
  for (const scene of scenes) {
    const key = scene.blockId || scene.blockTitle || "未分组总场景";
    const items = groups.get(key) ?? [];
    items.push(scene);
    groups.set(key, items);
  }

  return Array.from(groups.entries()).map(([blockKey, groupScenes]) => ({
    blockKey,
    blockTitle: groupScenes[0]?.blockTitle || "未分组总场景",
    scenes: groupScenes
  }));
}
