import { useEffect, useMemo, useState } from "react";
import { ImagePlus, KeyRound, Save, Sparkles } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { useCurrentNovel } from "../../shared/currentNovel";
import { getScreenplayDraft, type SceneScreenplayDraft } from "../../shared/screenplayDraft";
import { saveStoryboardImageTask } from "../../shared/storyboardImages";
import type { ShotPlan } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function StoryboardImageGenerationPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const draft = useMemo(() => getScreenplayDraft(currentNovel?.documentId), [currentNovel?.documentId]);
  const scenes = draft?.scenes ?? [];
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.sceneId ?? "");
  const selectedScene = scenes.find((scene) => scene.sceneId === selectedSceneId) ?? scenes[0];
  const [selectedShotId, setSelectedShotId] = useState("");
  const selectedShot = selectedScene?.shotPlans.find((shot) => shot.id === selectedShotId) ?? selectedScene?.shotPlans[0];
  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 Seedance 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("低清晰度、文字、水印、画面畸变、人物脸部崩坏、错误肢体");
  const [statusMessage, setStatusMessage] = useState("选择场景和分镜后，可生成分镜图片任务草案。");

  useEffect(() => {
    if (!selectedSceneId && scenes[0]) {
      setSelectedSceneId(scenes[0].sceneId);
    }
  }, [scenes, selectedSceneId]);

  useEffect(() => {
    if (!selectedScene) return;
    const nextShot = selectedScene.shotPlans[0];
    setSelectedShotId(nextShot?.id ?? "");
  }, [selectedScene?.sceneId]);

  useEffect(() => {
    setPrompt(buildStoryboardPrompt(selectedScene, selectedShot));
  }, [selectedScene?.sceneId, selectedShot?.id]);

  useEffect(() => {
    studioApi
      .getSeedanceSettings()
      .then((settings) => {
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? "Seedance API Key 已配置。" : "Seedance API Key 尚未配置。");
      })
      .catch(() => {
        setKeyStatusMessage("无法读取 Seedance 配置状态。");
      });
  }, []);

  async function handleSaveApiKey() {
    if (!apiKey.trim()) {
      setKeyStatusMessage("请输入 Seedance API Key。");
      return;
    }

    setIsSavingKey(true);
    setKeyStatusMessage("正在保存 Seedance API Key...");
    try {
      const result = await studioApi.saveSeedanceApiKey(apiKey);
      setIsKeyConfigured(result.configured);
      setApiKey("");
      setKeyStatusMessage("Seedance API Key 已保存到本地后端。");
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSavingKey(false);
    }
  }

  function handleCreateStoryboardImageTask() {
    if (!isKeyConfigured) {
      setStatusMessage("请先配置 Seedance API Key。");
      return;
    }
    if (!currentNovel || !selectedScene || !selectedShot) {
      setStatusMessage("请先选择小说、场景和分镜。");
      return;
    }
    if (!prompt.trim()) {
      setStatusMessage("请先填写分镜图片提示词。");
      return;
    }

    const now = new Date().toISOString();
    saveStoryboardImageTask({
      id: `storyboard-image-${Date.now()}`,
      title: `${selectedScene.title} · 镜头${selectedShot.sequenceOrder || 1}`,
      status: "draft",
      model: "Seedance Image",
      prompt,
      negativePrompt,
      screenplayPreview: selectedScene.content.slice(0, 180),
      novel: currentNovel.documentId ? { id: currentNovel.documentId, label: currentNovel.filename, route: "/import" } : undefined,
      scene: { id: selectedScene.sceneId, label: selectedScene.title, route: "/screenplay" },
      shot: {
        id: selectedShot.id,
        label: `镜头${selectedShot.sequenceOrder || 1}：${selectedShot.shotType || selectedShot.visualFocus || "分镜"}`,
        route: "/storyboard-images"
      },
      createdAt: now,
      updatedAt: now
    });
    setStatusMessage("分镜图片任务草案已保存，可在分镜图片管理页查看，并作为视频生成参考图。");
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Storyboard Image"
        title="分镜生图"
        description="先根据场景分镜生成参考图片，再把分镜图片和剧本一起送入视频生成流程。"
      />

      {!currentNovel ? (
        <div className="panel animate-in">
          <h2>暂无当前小说</h2>
          <p className="muted-line">请先导入小说并完成剧本生成。</p>
        </div>
      ) : (
        <div className="storyboard-image-layout">
          <section className="panel animate-in">
            <div className="section-title">
              <ImagePlus size={18} />
              <h2>分镜选择</h2>
            </div>
            <label className="field-label">
              场景
              <select className="text-input" value={selectedScene?.sceneId ?? ""} onChange={(event) => setSelectedSceneId(event.target.value)}>
                {scenes.map((scene) => (
                  <option key={scene.sceneId} value={scene.sceneId}>
                    {scene.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="storyboard-shot-list">
              {selectedScene?.shotPlans.length ? (
                selectedScene.shotPlans.map((shot) => (
                  <button
                    className={`storyboard-shot-card${shot.id === selectedShot?.id ? " active" : ""}`}
                    type="button"
                    key={shot.id}
                    onClick={() => setSelectedShotId(shot.id)}
                  >
                    <strong>镜头{shot.sequenceOrder || 1}</strong>
                    <span>{shot.shotType || "景别待定"} · {shot.viewpoint || "视角待定"}</span>
                    <small>{shot.composition || shot.visualFocus || "构图信息待补充"}</small>
                  </button>
                ))
              ) : (
                <article className="compact-card">
                  <strong>暂无分镜</strong>
                  <p>当前场景还没有分镜数据，请先重新完成叙事分析或剧本生成。</p>
                </article>
              )}
            </div>
          </section>

          <section className="panel animate-in">
            <div className="section-title">
              <Sparkles size={18} />
              <h2>图片提示词</h2>
            </div>
            <textarea className="video-script-editor storyboard-prompt-editor" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <label className="field-label">
              Negative Prompt
              <textarea className="video-prompt-input compact" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} />
            </label>
          </section>

          <aside className="panel animate-in">
            <div className="section-title">
              <KeyRound size={18} />
              <h2>Seedance 配置</h2>
            </div>
            <div className="api-key-row">
              <input
                className="text-input"
                type="password"
                value={apiKey}
                placeholder={isKeyConfigured ? "已配置，可输入新 key 覆盖" : "输入 Seedance API Key"}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button className="ghost-button" type="button" disabled={isSavingKey} onClick={handleSaveApiKey}>
                {isSavingKey ? "保存中..." : "保存"}
              </button>
            </div>
            <small className={isKeyConfigured ? "status-ok" : "status-warn"}>{keyStatusMessage}</small>
            <div className="video-task-card">
              <strong>分镜图片任务</strong>
              <p>小说：{currentNovel.filename}</p>
              <p>场景：{selectedScene?.title || "未选择"}</p>
              <p>分镜：{selectedShot ? `镜头${selectedShot.sequenceOrder || 1}` : "未选择"}</p>
              <button className="primary-button" type="button" onClick={handleCreateStoryboardImageTask}>
                <Save size={16} />
                保存生图任务
              </button>
              <small>{statusMessage}</small>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function buildStoryboardPrompt(scene?: SceneScreenplayDraft, shot?: ShotPlan) {
  if (!scene || !shot) return "";
  return [
    `为影视分镜生成一张高质量参考图。`,
    `场景：${scene.title}`,
    `地点与时间：${scene.location || "地点待定"}，${scene.timeOfDay || "时间待定"}`,
    `人物：${scene.characters.join("、") || "相关人物"}`,
    `镜头：${shot.shotType || "景别待定"}，${shot.viewpoint || "视角待定"}，${shot.composition || "构图待定"}`,
    `镜头运动/视觉焦点：${shot.cameraMovement || "镜头运动待定"}，${shot.visualFocus || "视觉焦点待定"}`,
    `情绪目的：${shot.emotionalPurpose || scene.dramaticFunction || "推动剧情"}`,
    `剧本参考：${scene.content.slice(0, 900)}`
  ].join("\n");
}
