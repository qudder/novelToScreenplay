import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, KeyRound, Sparkles } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { useCurrentNovel } from "../../shared/currentNovel";
import { getScreenplayDraft, type SceneScreenplayDraft } from "../../shared/screenplayDraft";
import { saveStoryboardImageTask } from "../../shared/storyboardImages";
import type { ShotPlan } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

const imageModelOptions = [
  "doubao-seedream-5-0-260128",
  "doubao-seedream-4-0-250828",
  "doubao-seedream-3-0-t2i-250415"
];
const minimumSeedreamPixels = 3686400;
const imageSizeOptions = ["1920x1920", "2560x1440", "1440x2560", "2048x2048", "2816x1600", "1600x2816"];

export function StoryboardImageGenerationPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const draft = useMemo(() => getScreenplayDraft(currentNovel?.documentId), [currentNovel?.documentId]);
  const scenes = draft?.scenes ?? [];
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.sceneId ?? "");
  const selectedScene = scenes.find((scene) => scene.sceneId === selectedSceneId) ?? scenes[0];
  const storyboardShots = useMemo(() => buildStoryBoardShotsFromScreenplay(selectedScene), [selectedScene]);
  const [selectedShotId, setSelectedShotId] = useState("");
  const selectedShot = storyboardShots.find((shot) => shot.id === selectedShotId) ?? storyboardShots[0];
  const selectedShotIndex = storyboardShots.findIndex((shot) => shot.id === selectedShot?.id);
  const selectedShotNumber = selectedShotIndex >= 0 ? selectedShotIndex + 1 : 1;
  const hasScreenplayShotMismatch = Boolean(
    selectedScene && storyboardShots.some((shot) => shot.screenplayText) && selectedScene.shotPlans.length !== storyboardShots.length
  );
  const [selectedFrameId, setSelectedFrameId] = useState("composition");
  const selectedFrame = selectedShot ? getShotFrames(selectedShot).find((frame) => frame.id === selectedFrameId) ?? getShotFrames(selectedShot)[0] : undefined;
  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 Seedance 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("彩色、精致插画、电影剧照、复杂材质、细腻表情、写实皮肤、强光影、文字、字幕、对白、旁白、水印、画面畸变");
  const [model, setModel] = useState(imageModelOptions[0]);
  const [availableModels, setAvailableModels] = useState(imageModelOptions);
  const [customModel, setCustomModel] = useState("");
  const [size, setSize] = useState(imageSizeOptions[0]);
  const [seed, setSeed] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [framePrompts, setFramePrompts] = useState<Record<string, string>>({});
  const [shotPrompts, setShotPrompts] = useState<Record<string, string>>({});
  const [promptTarget, setPromptTarget] = useState<PromptTarget>({ type: "frame" });
  const [expandedShotId, setExpandedShotId] = useState("");
  const [statusMessage, setStatusMessage] = useState("选择场景和分镜后，可调用 Seedream 生成分镜图片。");

  useEffect(() => {
    if (!selectedSceneId && scenes[0]) {
      setSelectedSceneId(scenes[0].sceneId);
    }
  }, [scenes, selectedSceneId]);

  useEffect(() => {
    if (!selectedScene) return;
    const nextShot = storyboardShots[0];
    setSelectedShotId(nextShot?.id ?? "");
    setSelectedFrameId("composition");
  }, [selectedScene?.sceneId, storyboardShots]);

  useEffect(() => {
    if (promptTarget.type === "shot") {
      const promptKey = shotPromptKeyFor(selectedShot);
      setPrompt(shotPrompts[promptKey] || buildShotStoryboardPrompt(selectedScene, selectedShot));
      return;
    }
    const promptKey = framePromptKeyFor(selectedShot, selectedFrame);
    setPrompt(framePrompts[promptKey] || buildFrameStoryboardPrompt(selectedScene, selectedShot, selectedFrame));
  }, [selectedScene?.sceneId, selectedShot?.id, selectedFrame?.id, framePrompts, shotPrompts, promptTarget.type]);

  useEffect(() => {
    studioApi
      .getSeedanceSettings()
      .then((settings) => {
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? "Seedance API Key 已配置。" : "Seedance API Key 尚未配置。");
        if (settings.configured) {
          refreshModelOptions();
        }
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
      await refreshModelOptions();
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSavingKey(false);
    }
  }

  async function refreshModelOptions() {
    try {
      const models = await studioApi.getSeedanceModels();
      const matchedModels = models.map((item) => item.id).filter((id) => id.toLowerCase().includes("seedream"));
      const nextModels = matchedModels.length ? matchedModels : models.map((item) => item.id);
      if (!nextModels.length) return;
      setAvailableModels(nextModels);
      setModel((current) => (nextModels.includes(current) ? current : nextModels[0]));
      setKeyStatusMessage(`已读取可用图片模型：${nextModels.length} 个。`);
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "读取可用模型失败，可使用自定义模型。");
    }
  }

  async function handleCreateStoryboardImageTask() {
    if (!isKeyConfigured) {
      setStatusMessage("请先配置 Seedance API Key。");
      return;
    }
    if (!currentNovel || !selectedScene || !selectedShot || (promptTarget.type === "frame" && !selectedFrame)) {
      setStatusMessage("请先选择小说、场景和分镜。");
      return;
    }
    if (!prompt.trim()) {
      setStatusMessage("请先填写分镜图片提示词。");
      return;
    }
    if (!isValidSeedreamSize(size)) {
      setStatusMessage("图片尺寸过小。当前 Seedream 模型要求总像素至少 3,686,400，请选择更大的尺寸。");
      return;
    }
    const seedValue = seed.trim() ? Number(seed.trim()) : undefined;
    if (seedValue !== undefined && (!Number.isInteger(seedValue) || seedValue < 0)) {
      setStatusMessage("Seed 必须是非负整数，留空则由 Seedream 随机生成。");
      return;
    }

    const now = new Date().toISOString();
    const promptTargetLabel = promptTarget.type === "shot" ? "完整镜头" : selectedFrame?.label || "定帧";
    const selectedChapter = currentNovel.chapters.find((chapter) => chapter.id === selectedShot.chapterId);
    const title = `${selectedScene.title} · 镜头${selectedShotNumber} · ${promptTargetLabel}`;
    const selectedModel = customModel.trim() || model;
    const baseTask = {
      id: `storyboard-image-${Date.now()}`,
      title,
      prompt,
      negativePrompt,
      screenplayPreview: getShotScreenplayText(selectedShot, selectedScene).slice(0, 180),
      novel: currentNovel.documentId ? { id: currentNovel.documentId, label: currentNovel.filename, route: "/import" } : undefined,
      scene: { id: selectedScene.sceneId, label: selectedScene.title, route: "/screenplay" },
      shot: {
        id: selectedShot.id,
        label: `镜头${selectedShotNumber}：${promptTargetLabel}`,
        route: "/storyboard-images"
      },
      createdAt: now
    };

    setIsGenerating(true);
    setStatusMessage("正在调用 Seedream 生成分镜图片...");
    try {
      const result = await studioApi.createSeedreamImageGeneration({
        title,
        model: selectedModel,
        prompt,
        negativePrompt,
        size,
        seed: seedValue,
        documentId: currentNovel.documentId ?? "",
        filename: currentNovel.filename,
        chapterId: selectedShot.chapterId,
        chapterTitle: selectedChapter?.title ?? selectedShot.chapterId,
        sceneId: selectedScene.sceneId,
        sceneTitle: selectedScene.title,
        shotId: selectedShot.id,
        shotLabel: `镜头${selectedShotNumber}`,
        frameId: promptTarget.type === "shot" ? "whole-shot" : selectedFrame?.id ?? "",
        frameLabel: promptTargetLabel
      });
      const imageUrl = result.imageUrl || (result.b64Json ? `data:image/png;base64,${result.b64Json}` : "");
      saveStoryboardImageTask({
        ...baseTask,
        providerTaskId: result.providerTaskId,
        status: result.status,
        model: result.model || selectedModel,
        imageUrl,
        originalImageUrl: result.originalImageUrl,
        localImagePath: result.localImagePath,
        media: result.media,
        errorMessage: result.errorMessage,
        updatedAt: new Date().toISOString()
      });
      setStatusMessage(imageUrl ? "分镜图片已生成并保存，可在视频生成页作为首帧使用。" : "分镜图片任务已返回，但未取得图片 URL，请查看调试日志。");
    } catch (error) {
      saveStoryboardImageTask({
        ...baseTask,
        status: "failed",
        model: selectedModel,
        errorMessage: error instanceof Error ? error.message : "生成分镜图片失败。",
        updatedAt: new Date().toISOString()
      });
      setStatusMessage(error instanceof Error ? error.message : "生成分镜图片失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateCurrentPrompt() {
    if (!currentNovel || !selectedScene || !selectedShot) {
      setStatusMessage("请先选择小说、场景和镜头。");
      return;
    }
    const targetFrame = promptTarget.type === "frame" ? selectedFrame : buildWholeShotFrame(selectedShot);
    if (!targetFrame) {
      setStatusMessage("请先选择要生成提示词的定帧。");
      return;
    }
    setIsGeneratingPrompt(true);
    setStatusMessage(promptTarget.type === "shot" ? "正在调用 DeepSeek 生成当前镜头提示词..." : "正在调用 DeepSeek 生成当前定帧提示词...");
    try {
      const nextPrompt = await studioApi.generateStoryboardFramePrompt({
        documentId: currentNovel.documentId ?? "",
        filename: currentNovel.filename,
        scene: selectedScene,
        shot: selectedShot,
        frame: targetFrame
      });
      if (promptTarget.type === "shot") {
        setShotPrompts((current) => ({ ...current, [shotPromptKeyFor(selectedShot)]: nextPrompt }));
      } else {
        setFramePrompts((current) => ({ ...current, [framePromptKeyFor(selectedShot, targetFrame)]: nextPrompt }));
      }
      setPrompt(nextPrompt);
      setStatusMessage(promptTarget.type === "shot" ? "当前镜头提示词已生成。" : "当前定帧提示词已生成。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "生成当前提示词失败。");
    } finally {
      setIsGeneratingPrompt(false);
    }
  }

  function handleSwitchShot(direction: -1 | 1) {
    if (!storyboardShots.length) return;
    const currentIndex = selectedShotIndex >= 0 ? selectedShotIndex : 0;
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), storyboardShots.length - 1);
    const nextShot = storyboardShots[nextIndex];
    if (!nextShot || nextShot.id === selectedShot?.id) return;
    setSelectedShotId(nextShot.id);
    setSelectedFrameId("composition");
    setPromptTarget({ type: "shot" });
    setExpandedShotId("");
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
              {hasScreenplayShotMismatch ? (
                <div className="compact-card">
                  <strong>镜头已按剧本正文重新对齐</strong>
                  <p>剧本正文中识别到 {storyboardShots.length} 个分镜，原始分析分镜为 {selectedScene?.shotPlans.length ?? 0} 个；分镜生图将优先使用剧本正文的镜头分割。</p>
                </div>
              ) : null}
              {storyboardShots.length && selectedShot ? (
                <>
                  <div className="storyboard-shot-switcher">
                    <button className="ghost-button" type="button" disabled={selectedShotNumber <= 1} onClick={() => handleSwitchShot(-1)}>
                      <ChevronLeft size={16} />
                      上一镜头
                    </button>
                    <span className="storyboard-shot-counter">
                      镜头 {selectedShotNumber} / {storyboardShots.length}
                    </span>
                    <button className="ghost-button" type="button" disabled={selectedShotNumber >= storyboardShots.length} onClick={() => handleSwitchShot(1)}>
                      下一镜头
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <article
                    className={`storyboard-shot-card${promptTarget.type === "shot" ? " active" : ""}`}
                    key={selectedShot.id}
                  >
                    <button
                      className="storyboard-shot-info-card"
                      type="button"
                      onClick={() => {
                        setSelectedShotId(selectedShot.id);
                        setPromptTarget({ type: "shot" });
                        setExpandedShotId((current) => (current === selectedShot.id ? "" : selectedShot.id));
                      }}
                    >
                      <div className="storyboard-shot-card-header">
                        <strong>镜头{selectedShotNumber}</strong>
                        <span>{selectedShot.shotType || "景别待定"}</span>
                      </div>
                      <dl className="storyboard-shot-breakdown">
                        <div>
                          <dt>景别</dt>
                          <dd>{selectedShot.shotType || "景别待定"}</dd>
                        </div>
                        <div>
                          <dt>视角</dt>
                          <dd>{selectedShot.viewpoint || "视角待定"}</dd>
                        </div>
                        <div>
                          <dt>构图</dt>
                          <dd>{selectedShot.composition || "构图待定"}</dd>
                        </div>
                        <div>
                          <dt>运动</dt>
                          <dd>{selectedShot.cameraMovement || "镜头运动待定"}</dd>
                        </div>
                        <div>
                          <dt>焦点</dt>
                          <dd>{selectedShot.visualFocus || "视觉焦点待定"}</dd>
                        </div>
                        <div>
                          <dt>情绪</dt>
                          <dd>{selectedShot.emotionalPurpose || "情绪目的待定"}</dd>
                        </div>
                        <div>
                          <dt>转场</dt>
                          <dd>{selectedShot.transition || "转场待定"}</dd>
                        </div>
                        <div>
                          <dt>场景</dt>
                          <dd>{selectedShot.sceneTitle || selectedScene?.title || "场景待定"}</dd>
                        </div>
                        <div>
                          <dt>事件</dt>
                          <dd>{selectedShot.eventTitle || "事件待定"}</dd>
                        </div>
                        <div>
                          <dt>章节</dt>
                          <dd>{selectedShot.chapterId || "章节待定"}</dd>
                        </div>
                      </dl>
                      <small>{expandedShotId === selectedShot.id ? "收起上下文" : "展开对话与上下文"}</small>
                    </button>
                    {expandedShotId === selectedShot.id ? <ShotContextPanel scene={selectedScene} shot={selectedShot} /> : null}
                    <div className="storyboard-frame-list">
                      {getShotFrames(selectedShot).map((frame) => (
                        <button
                          className={`storyboard-frame-chip${frame.id === selectedFrame?.id && promptTarget.type === "frame" ? " active" : ""}`}
                          type="button"
                          key={frame.id}
                          onClick={() => {
                            setSelectedShotId(selectedShot.id);
                            setSelectedFrameId(frame.id);
                            setPromptTarget({ type: "frame" });
                          }}
                        >
                          <strong>{frame.label}</strong>
                          <span>{frame.value}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                </>
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
            <div className="toolbar">
              <button className="ghost-button" type="button" disabled={isGeneratingPrompt} onClick={handleGenerateCurrentPrompt}>
                <Sparkles size={16} />
                {isGeneratingPrompt ? "生成中..." : promptTarget.type === "shot" ? "AI 生成当前镜头" : "AI 生成当前定帧"}
              </button>
            </div>
            <textarea
              className="video-script-editor storyboard-prompt-editor"
              value={prompt}
              onChange={(event) => {
                const nextPrompt = event.target.value;
                setPrompt(nextPrompt);
                if (promptTarget.type === "shot" && selectedShot) {
                  setShotPrompts((current) => ({ ...current, [shotPromptKeyFor(selectedShot)]: nextPrompt }));
                } else if (selectedShot && selectedFrame) {
                  setFramePrompts((current) => ({ ...current, [framePromptKeyFor(selectedShot, selectedFrame)]: nextPrompt }));
                }
              }}
            />
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
              <p>模型：{customModel.trim() || model}</p>
              <p>小说：{currentNovel.filename}</p>
              <p>场景：{selectedScene?.title || "未选择"}</p>
              <p>分镜：{selectedShot ? `镜头${selectedShotNumber}` : "未选择"}</p>
              <p>提示词目标：{promptTarget.type === "shot" ? "完整镜头" : selectedFrame?.label || "未选择"}</p>
              <label className="field-label">
                图片模型
                <select className="text-input" value={model} onChange={(event) => setModel(event.target.value)}>
                  {availableModels.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                自定义模型
                <input className="text-input" value={customModel} placeholder="留空则使用上方模型" onChange={(event) => setCustomModel(event.target.value)} />
              </label>
              <label className="field-label">
                图片尺寸
                <select className="text-input" value={size} onChange={(event) => setSize(event.target.value)}>
                  {imageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Seed
                <input className="text-input" value={seed} placeholder="留空则随机" onChange={(event) => setSeed(event.target.value)} />
              </label>
              <button className="primary-button" type="button" disabled={isGenerating} onClick={handleCreateStoryboardImageTask}>
                <Sparkles size={16} />
                {isGenerating ? "生成中..." : "生成分镜图片"}
              </button>
              <small>{statusMessage}</small>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

type ShotFrame = {
  id: string;
  label: string;
  value: string;
  instruction: string;
};

type PromptTarget = {
  type: "shot" | "frame";
};

type StoryboardShot = ShotPlan & {
  screenplayText?: string;
  screenplayShotNumber?: number;
};

function ShotContextPanel({ scene, shot }: { scene?: SceneScreenplayDraft; shot: StoryboardShot }) {
  const relatedDialogues = scene?.dialogues.filter((dialogue) => !shot.eventTitle || dialogue.event_title === shot.eventTitle) ?? [];
  const relatedEnvironments =
    scene?.environments.filter((environment) => !shot.eventTitle || environment.eventTitles.includes(shot.eventTitle) || environment.sceneTitle === shot.sceneTitle) ?? [];
  const eventTitles = scene?.eventTitles.length ? scene.eventTitles : scene?.eventIds ?? [];

  return (
    <div className="storyboard-shot-context">
      <div>
        <strong>人物</strong>
        <p>{scene?.characters.join("、") || "暂无人物信息"}</p>
      </div>
      <div>
        <strong>关联事件</strong>
        <p>{shot.eventTitle || eventTitles.join("、") || "暂无事件信息"}</p>
      </div>
      <div>
        <strong>环境</strong>
        <p>
          {relatedEnvironments.length
            ? relatedEnvironments
                .map((environment) =>
                  [environment.location, environment.timeText, environment.light, environment.atmosphere, environment.sound].filter(Boolean).join(" / ")
                )
                .join("；")
            : "暂无环境信息"}
        </p>
      </div>
      <div>
        <strong>对话参考</strong>
        <p className="dialogue-reference-list">
          {relatedDialogues.length
            ? relatedDialogues
                .slice(0, 4)
                .map((dialogue) => `${dialogue.speaker || "角色"}：${dialogue.content || dialogue.source_text}`)
                .join("\n")
            : "暂无关联对话"}
        </p>
      </div>
      <div>
        <strong>剧本片段</strong>
        <p>{getShotScreenplayText(shot, scene).slice(0, 260) || "暂无剧本片段"}</p>
      </div>
    </div>
  );
}

function getShotFrames(shot: StoryboardShot): ShotFrame[] {
  return [
    {
      id: "composition",
      label: "构图定帧",
      value: shot.composition || "构图待定",
      instruction: "只生成该镜头的黑白构图草图，重点表现人物相对位置、画面分区、前后景关系和大概场景轮廓。"
    },
    {
      id: "focus",
      label: "焦点定帧",
      value: shot.visualFocus || "视觉焦点待定",
      instruction: "只生成该镜头的黑白焦点草图，重点表现观众视线落点、人物或物件的大概位置，不刻画细节。"
    },
    {
      id: "viewpoint",
      label: "视角定帧",
      value: shot.viewpoint || "视角待定",
      instruction: "只生成该镜头的黑白视角草图，重点表现机位高度、观察方向、人物朝向和空间距离。"
    },
    {
      id: "emotion",
      label: "情绪定帧",
      value: shot.emotionalPurpose || "情绪目的待定",
      instruction: "只生成该镜头的黑白情绪草图，重点用人物姿态、相互距离、站位压迫和场景空旷程度表达情绪。"
    },
    {
      id: "transition",
      label: "转场定帧",
      value: shot.transition || "转场待定",
      instruction: "只生成该镜头的黑白转场草图，重点表现离场、进入、遮挡或视线方向等大概空间变化。"
    }
  ];
}

function framePromptKeyFor(shot?: StoryboardShot, frame?: ShotFrame) {
  return shot && frame ? `${shot.id}:${frame.id}` : "";
}

function shotPromptKeyFor(shot?: StoryboardShot) {
  return shot ? `${shot.id}:shot` : "";
}

function isValidSeedreamSize(size: string) {
  const [width, height] = size.split("x").map((value) => Number(value));
  return Number.isFinite(width) && Number.isFinite(height) && width * height >= minimumSeedreamPixels;
}

function buildWholeShotFrame(shot: StoryboardShot): ShotFrame {
  const shotDetails = [
    `景别：${shot.shotType || "景别待定"}`,
    `视角：${shot.viewpoint || "视角待定"}`,
    `构图：${shot.composition || "构图待定"}`,
    `镜头运动：${shot.cameraMovement || "镜头运动待定"}`,
    `视觉焦点：${shot.visualFocus || "视觉焦点待定"}`,
    `情绪目的：${shot.emotionalPurpose || "情绪目的待定"}`,
    `转场：${shot.transition || "转场待定"}`,
    `场景：${shot.sceneTitle || "场景待定"}`,
    `事件：${shot.eventTitle || "事件待定"}`,
    `章节：${shot.chapterId || "章节待定"}`
  ];
  return {
    id: "whole-shot",
    label: "完整镜头",
    value: shotDetails.join("\n"),
    instruction: "生成该镜头的整体黑白分镜草图，综合人物相对位置、场景空间、景别、视角、构图、视觉焦点和转场信息。"
  };
}

function buildShotStoryboardPrompt(scene?: SceneScreenplayDraft, shot?: StoryboardShot) {
  if (!shot) return "";
  return buildFrameStoryboardPrompt(scene, shot, buildWholeShotFrame(shot));
}

function buildFrameStoryboardPrompt(scene?: SceneScreenplayDraft, shot?: StoryboardShot, frame?: ShotFrame) {
  if (!scene || !shot || !frame) return "";
  const storyboardShots = buildStoryBoardShotsFromScreenplay(scene);
  const shotIndex = storyboardShots.findIndex((item) => item.id === shot.id);
  const shotNumber = shotIndex >= 0 ? shotIndex + 1 : 1;
  return [
    `为影视分镜生成一张黑白粗略框架图。`,
    `画面风格：黑白线稿、分镜草图、低细节、只看布局，不要精致插画或电影剧照。`,
    `当前生成目标：${frame.label}`,
    `生成范围：${frame.instruction}`,
    `分镜点内容：${frame.value}`,
    `场景：${scene.title}`,
    `地点与时间：${scene.location || "地点待定"}，${scene.timeOfDay || "时间待定"}`,
    `人物：${scene.characters.join("、") || "相关人物"}`,
    `镜头编号：镜头${shotNumber}`,
    `基础景别：${shot.shotType || "景别待定"}`,
    `必须介绍人物的相对位置、朝向、前后景关系和大概场景结构；人物可用简化轮廓或剪影表示。`,
    frame.id === "whole-shot" ? `需要把该镜头的完整数据整合为单张草图，不要遗漏关键站位、焦点和场景空间。` : `不要扩展到其他分镜点，不要同时表现完整镜头运动或完整转场过程。`,
    `不要绘制细腻五官、复杂服装纹理、彩色光影或成片级质感。`,
    `画面中不要出现对话、对白字幕、旁白文字、屏幕文字或任何可读文本。`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStoryBoardShotsFromScreenplay(scene?: SceneScreenplayDraft): StoryboardShot[] {
  if (!scene) return [];
  const screenplayShots = parseScreenplayShots(scene.content);
  if (!screenplayShots.length) return scene.shotPlans;

  return screenplayShots.map((screenplayShot, index) => {
    const referenceShot = scene.shotPlans[index];
    return {
      ...(referenceShot ?? createEmptyShot(scene, index)),
      id: referenceShot?.id ?? `screenplay-shot-${scene.sceneId}-${screenplayShot.number}`,
      sequenceOrder: screenplayShot.number,
      shotType: screenplayShot.shotType || referenceShot?.shotType || "",
      viewpoint: screenplayShot.viewpoint || referenceShot?.viewpoint || "",
      composition: screenplayShot.composition || referenceShot?.composition || "",
      cameraMovement: screenplayShot.cameraMovement || referenceShot?.cameraMovement || "",
      sceneTitle: referenceShot?.sceneTitle || scene.title,
      screenplayText: screenplayShot.text,
      screenplayShotNumber: screenplayShot.number
    };
  });
}

function parseScreenplayShots(content: string) {
  const shotHeadingPattern = /(^|\n)(分镜\s*([0-9一二三四五六七八九十]+)\s*[｜|:：-]?\s*([^\n]*))/g;
  const matches = Array.from(content.matchAll(shotHeadingPattern));
  return matches.map((match, index) => {
    const headingStart = (match.index ?? 0) + match[1].length;
    const nextHeadingStart = index + 1 < matches.length ? matches[index + 1].index ?? content.length : content.length;
    const heading = match[2].trim();
    const fields = match[4]
      .split(/[｜|]/)
      .map((field) => field.trim())
      .filter(Boolean);
    return {
      number: parseShotNumber(match[3]) || index + 1,
      shotType: fields[0] ?? "",
      viewpoint: fields[1] ?? "",
      composition: fields[2] ?? "",
      cameraMovement: fields[3] ?? "",
      text: content.slice(headingStart, nextHeadingStart).trim() || heading
    };
  });
}

function parseShotNumber(value: string) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;
  const chineseNumbers: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (chineseNumbers[value.slice(1)] ?? 0);
  if (value.endsWith("十")) return (chineseNumbers[value.slice(0, -1)] ?? 1) * 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (chineseNumbers[tens] ?? 1) * 10 + (chineseNumbers[ones] ?? 0);
  }
  return chineseNumbers[value] ?? 0;
}

function createEmptyShot(scene: SceneScreenplayDraft, index: number): StoryboardShot {
  return {
    id: `screenplay-shot-${scene.sceneId}-${index + 1}`,
    chapterId: "",
    sceneTitle: scene.title,
    eventTitle: scene.eventTitles[index] ?? "",
    sequenceOrder: index + 1,
    shotType: "",
    viewpoint: "",
    composition: "",
    cameraMovement: "",
    visualFocus: "",
    emotionalPurpose: "",
    transition: "",
    sourceRefs: []
  };
}

function getShotScreenplayText(shot?: StoryboardShot, scene?: SceneScreenplayDraft) {
  return shot?.screenplayText || scene?.content || "";
}
