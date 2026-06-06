import { useEffect, useMemo, useState } from "react";
import { Bot, Save, Sparkles } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { useCurrentNovel } from "../../shared/currentNovel";
import { SourceTrace } from "../../shared/SourceTrace";
import {
  buildDraftFromNovel,
  createAiCompletion,
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

  function handleAiComplete() {
    if (!draft || !selectedScene) return;
    const completion = createAiCompletion(selectedScene);
    const nextDraft = updateSceneDraft(draft, selectedScene.sceneId, completion, true);
    setDraft(nextDraft);
    saveScreenplayDraft(nextDraft);
    setEditorValue(completion);
    setStatusMessage("已使用规则版 AI 补全生成本场剧本。");
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
              {scenes.length > 0 ? (
                scenes.map((scene, index) => (
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
                      {selectedScene.location} · {selectedScene.timeOfDay} · {selectedScene.dramaticFunction}
                    </small>
                  </div>
                  <div className="toolbar">
                    <button className="ghost-button" type="button" onClick={handleAiComplete}>
                      <Bot size={16} />
                      AI 自动补全
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
