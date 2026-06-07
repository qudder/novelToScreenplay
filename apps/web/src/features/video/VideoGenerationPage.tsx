import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FileVideo, ImagePlus, KeyRound, Music, Play, Trash2, UploadCloud, Video } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { getActiveNovelId, switchCurrentNovelFromBackend, useCurrentNovel, useNovelLibrary } from "../../shared/currentNovel";
import { getScreenplayDraft, type SceneScreenplayDraft } from "../../shared/screenplayDraft";
import { type StoryboardImageTask, useStoryboardImageTasks } from "../../shared/storyboardImages";
import type { ShotPlan } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import { saveVideoTask, type VideoTaskTag } from "../../shared/videoTasks";

type MediaAsset = {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "screenplay";
  url?: string;
  size: number;
};

type VideoGranularityOption = {
  id: string;
  type: "scene" | "shot" | "frame";
  label: string;
  description: string;
  scene: SceneScreenplayDraft;
  sceneIndex: number;
  shot?: StoryboardShot;
  shotIndex?: number;
  frame?: ShotFrame;
};

type ShotFrame = {
  id: string;
  label: string;
  focus: string;
  value: string;
  instruction: string;
};

type StoryboardShot = ShotPlan & {
  screenplayText?: string;
  screenplayShotNumber?: number;
};

const ratioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const durationOptions = ["5", "10"];
const resolutionOptions = ["720p", "1080p"];
const videoModelOptions = [
  "doubao-seedance-1-0-lite-t2v-250428",
  "doubao-seedance-1-0-pro-250528",
  "doubao-seedance-1-0-lite-i2v-250428"
];

export function VideoGenerationPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const novelLibrary = useNovelLibrary();
  const activeNovelId = getActiveNovelId();
  const draft = useMemo(() => getScreenplayDraft(currentNovel?.documentId), [currentNovel?.documentId]);
  const storyboardImageTasks = useStoryboardImageTasks();
  const relatedStoryboardImages = storyboardImageTasks.filter((task) => !currentNovel?.documentId || task.novel?.id === currentNovel.documentId);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const screenplayInputRef = useRef<HTMLInputElement | null>(null);
  const assetsRef = useRef<MediaAsset[]>([]);

  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 Seedance 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [screenplayText, setScreenplayText] = useState(() => buildScreenplayText(draft));
  const [prompt, setPrompt] = useState("根据剧本生成电影感镜头，保持人物行动、场景氛围和视角转换一致。");
  const [negativePrompt, setNegativePrompt] = useState("低清晰度、字幕、水印、画面畸变、人物多手指、脸部崩坏");
  const [model, setModel] = useState(videoModelOptions[0]);
  const [availableModels, setAvailableModels] = useState(videoModelOptions);
  const [customModel, setCustomModel] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState("5");
  const [resolution, setResolution] = useState("1080p");
  const [seed, setSeed] = useState("");
  const [cameraFixed, setCameraFixed] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [statusMessage, setStatusMessage] = useState("配置素材和剧本后，可创建 Seedance 视频生成任务。");
  const [selectedSceneTag, setSelectedSceneTag] = useState<VideoTaskTag | undefined>(undefined);
  const [selectedChapterTag, setSelectedChapterTag] = useState<VideoTaskTag | undefined>(undefined);
  const [selectedShotTag, setSelectedShotTag] = useState<VideoTaskTag | undefined>(undefined);
  const [selectedStoryboardImageTasks, setSelectedStoryboardImageTasks] = useState<StoryboardImageTask[]>([]);
  const granularityOptions = useMemo(() => buildVideoGranularityOptions(draft?.scenes ?? []), [draft]);
  const selectedStoryboardImageTags = selectedStoryboardImageTasks.map(storyboardImageTaskToTag);

  useEffect(() => {
    setScreenplayText(buildScreenplayText(draft));
  }, [draft]);

  useEffect(() => {
    studioApi
      .getSeedanceSettings()
      .then((settings) => {
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? "Seedance API Key 已配置。" : "Seedance API Key 尚未配置。");
        if (settings.configured) {
          refreshModelOptions("video");
        }
      })
      .catch(() => {
        setKeyStatusMessage("无法读取 Seedance 配置状态。");
      });
  }, []);

  useEffect(() => {
    return () => {
      assetsRef.current.forEach((asset) => {
        if (asset.url) URL.revokeObjectURL(asset.url);
      });
    };
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
      await refreshModelOptions("video");
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSavingKey(false);
    }
  }

  async function refreshModelOptions(kind: "video" | "image") {
    try {
      const models = await studioApi.getSeedanceModels();
      const keyword = kind === "video" ? "seedance" : "seedream";
      const matchedModels = models.map((item) => item.id).filter((id) => id.toLowerCase().includes(keyword));
      const nextModels = matchedModels.length ? matchedModels : models.map((item) => item.id);
      if (!nextModels.length) return;
      setAvailableModels(nextModels);
      setModel((current) => (nextModels.includes(current) ? current : nextModels[0]));
      setKeyStatusMessage(`已读取可用模型：${nextModels.length} 个。`);
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "读取可用模型失败，可使用自定义模型。");
    }
  }

  function handleAssetChange(event: ChangeEvent<HTMLInputElement>, type: MediaAsset["type"]) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const nextAssets = files.map((file) => ({
      id: `${type}-${file.name}-${file.size}-${Date.now()}`,
      name: file.name,
      type,
      size: file.size,
      url: type === "image" || type === "video" || type === "audio" ? URL.createObjectURL(file) : undefined
    }));
    setAssets((current) => {
      const updatedAssets = [...nextAssets, ...current];
      assetsRef.current = updatedAssets;
      return updatedAssets;
    });

    if (type === "screenplay") {
      const file = files[0];
      file.text().then((text) => setScreenplayText(text));
    }
    event.target.value = "";
  }

  function handleRemoveAsset(assetId: string) {
    setAssets((current) => {
      const removedAsset = current.find((asset) => asset.id === assetId);
      if (removedAsset?.url) URL.revokeObjectURL(removedAsset.url);
      const updatedAssets = current.filter((asset) => asset.id !== assetId);
      assetsRef.current = updatedAssets;
      return updatedAssets;
    });
    setStatusMessage("已删除导入素材。");
  }

  function handleClearScreenplay() {
    setScreenplayText("");
    setAssets((current) => {
      const updatedAssets = current.filter((asset) => asset.type !== "screenplay");
      assetsRef.current = updatedAssets;
      return updatedAssets;
    });
    setStatusMessage("已清空当前导入的剧本内容。");
  }

  async function handleSwitchNovel(documentId: string) {
    const novel = await switchCurrentNovelFromBackend(documentId);
    if (novel) {
      setSelectedSceneTag(undefined);
      setSelectedChapterTag(undefined);
      setSelectedShotTag(undefined);
      clearSelectedStoryboardImages();
      setStatusMessage(`已切换到《${novel.filename}》，可导入该小说的章节剧本。`);
      return;
    }
    setStatusMessage("切换小说失败，本地缓存中没有找到该小说。");
  }

  function handleImportFullDraft() {
    const text = buildScreenplayText(draft);
    if (!text.trim()) {
      setStatusMessage("当前小说还没有可导入的剧本草稿，请先在剧本生成页生成或编辑剧本。");
      return;
    }
    setScreenplayText(text);
    setSelectedSceneTag(undefined);
    setSelectedChapterTag(undefined);
    setSelectedShotTag(undefined);
    clearSelectedStoryboardImages();
    setStatusMessage(`已导入《${draft?.filename ?? currentNovel?.filename ?? "当前小说"}》的完整剧本。`);
  }

  function handleImportGranularityOption(option: VideoGranularityOption) {
    setScreenplayText(buildGranularityScreenplayText(option));
    setSelectedChapterTag({ id: option.scene.blockId, label: option.scene.blockTitle || "未命名章节/总场景", route: "/scenes" });
    setSelectedSceneTag({ id: option.scene.sceneId, label: option.scene.title || `场景 ${option.sceneIndex + 1}`, route: "/screenplay" });
    setSelectedShotTag(option.shot ? { id: option.shot.id, label: buildShotLabel(option.shot, option.shotIndex ?? 0), route: "/storyboard-image-generation" } : undefined);
    setPrompt(buildGranularityPrompt(option));
    const matchedStoryboardImages = findRelatedStoryboardImages(option, relatedStoryboardImages);
    if (matchedStoryboardImages.length) {
      selectStoryboardImageTasks(matchedStoryboardImages);
      setStatusMessage(`已导入${formatGranularityType(option.type)}：${option.label}，并自动导入 ${matchedStoryboardImages.length} 张相关分镜图片。`);
      return;
    }
    if (option.shot) {
      clearSelectedStoryboardImages();
      setStatusMessage(`已导入${formatGranularityType(option.type)}：${option.label}，未找到可用的相关分镜图片。`);
      return;
    }
    clearSelectedStoryboardImages();
    setStatusMessage(`已导入${formatGranularityType(option.type)}：${option.label}`);
  }

  function selectStoryboardImageTasks(tasks: StoryboardImageTask[]) {
    setSelectedStoryboardImageTasks(uniqueStoryboardImageTasks(tasks));
  }

  function toggleStoryboardImageTask(task: StoryboardImageTask) {
    setSelectedStoryboardImageTasks((current) => {
      if (current.some((item) => item.id === task.id)) {
        return current.filter((item) => item.id !== task.id);
      }
      return uniqueStoryboardImageTasks([...current, task]);
    });
    setStatusMessage(task.imageUrl || task.originalImageUrl ? `已更新分镜图片参考：${task.title}` : `已选择分镜图片任务：${task.title}，但该任务暂无图片 URL。`);
  }

  function removeStoryboardImageTask(taskId: string) {
    setSelectedStoryboardImageTasks((current) => current.filter((item) => item.id !== taskId));
    setStatusMessage("已移除一张分镜图片参考。");
  }

  function clearSelectedStoryboardImages() {
    setSelectedStoryboardImageTasks([]);
  }

  async function handleCreateTask() {
    if (!isKeyConfigured) {
      setStatusMessage("请先配置 Seedance API Key。");
      return;
    }
    if (!screenplayText.trim()) {
      setStatusMessage("请先导入或填写剧本内容。");
      return;
    }
    const seedValue = seed.trim() ? Number(seed.trim()) : undefined;
    if (seedValue !== undefined && (!Number.isInteger(seedValue) || seedValue < 0)) {
      setStatusMessage("Seed 必须是非负整数，留空则由 Seedance 随机生成。");
      return;
    }
    const referenceImageUrls = getStoryboardImageUrls(selectedStoryboardImageTasks);
    if (selectedStoryboardImageTasks.length && !referenceImageUrls.length) {
      setStatusMessage("已选择分镜图片任务，但这些任务还没有可用图片 URL，暂不能作为参考图提交。");
      return;
    }
    const now = new Date().toISOString();
    const taskTitle = selectedShotTag?.label
      ? `${selectedSceneTag?.label || currentNovel?.filename || "未命名场景"} · ${selectedShotTag.label}`
      : selectedSceneTag?.label || currentNovel?.filename || "未命名视频任务";
    const selectedModel = customModel.trim() || model;
    setIsCreatingTask(true);
    setStatusMessage("正在提交 Seedance 视频生成任务...");
    try {
      const referenceImageUrl = referenceImageUrls[0];
      const result = await studioApi.createSeedanceVideoTask({
        title: taskTitle,
        model: selectedModel,
        prompt,
        negativePrompt,
        screenplayText,
        referenceImageUrl,
        referenceImageUrls,
        referenceImageRole: referenceImageUrl ? "first_frame" : undefined,
        ratio,
        duration: Number(duration),
        resolution,
        seed: seedValue,
        cameraFixed
      });
      saveVideoTask({
        id: `video-task-${Date.now()}`,
        providerTaskId: result.providerTaskId,
        title: taskTitle,
        status: result.status,
        model: result.model || selectedModel,
        ratio,
        duration,
        resolution,
        prompt,
        negativePrompt,
        screenplayPreview: screenplayText.slice(0, 180),
        screenplayLength: screenplayText.length,
        assetCounts: {
          images: imageAssets.length,
          videos: videoAssets.length,
          audios: audioAssets.length
        },
        novel: currentNovel?.documentId
          ? { id: currentNovel.documentId, label: currentNovel.filename, route: "/import" }
          : undefined,
        chapter: selectedChapterTag,
        scene: selectedSceneTag,
        shot: selectedShotTag,
        storyboardImage: selectedStoryboardImageTags[0],
        storyboardImages: selectedStoryboardImageTags,
        videoUrl: result.videoUrl,
        originalVideoUrl: result.originalVideoUrl,
        localVideoPath: result.localVideoPath,
        errorMessage: result.errorMessage,
        createdAt: now,
        updatedAt: new Date().toISOString()
      });
      setStatusMessage(`Seedance 视频任务已提交：任务ID=${result.providerTaskId}，当前状态=${formatSeedanceStatus(result.status)}。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "创建 Seedance 视频任务失败。");
    } finally {
      setIsCreatingTask(false);
    }
  }

  const imageAssets = assets.filter((asset) => asset.type === "image");
  const videoAssets = assets.filter((asset) => asset.type === "video");
  const audioAssets = assets.filter((asset) => asset.type === "audio");

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Video Generation"
        title="视频生成"
        description="基于剧本、参考图片、参考视频和音频素材创建 Seedance 视频生成任务。"
      />

      <div className="video-generation-layout">
        <section className="panel animate-in video-script-panel">
          <div className="section-title">
            <FileVideo size={18} />
            <h2>剧本与提示词</h2>
          </div>

          <div className="video-source-panel">
            <div className="section-title">
              <FileText size={18} />
              <h3>从项目导入剧本</h3>
            </div>
            {novelLibrary.length ? (
              <>
                <label className="field-label">
                  选择小说
                  <select className="text-input" value={activeNovelId} onChange={(event) => handleSwitchNovel(event.target.value)}>
                    {novelLibrary.map((novel) => (
                      <option key={novel.documentId} value={novel.documentId}>
                        {novel.filename} · {novel.sceneCount} 个场景
                      </option>
                    ))}
                  </select>
                </label>
                <div className="video-source-actions">
                  <button className="ghost-button" type="button" onClick={handleImportFullDraft}>
                    <FileVideo size={16} />
                    导入全剧本
                  </button>
                  <span>{granularityOptions.length ? `当前可选 ${granularityOptions.length} 个视频生成粒度` : "当前小说暂无剧本草稿"}</span>
                </div>
                {granularityOptions.length ? (
                  <div className="video-scene-import-list">
                    {granularityOptions.map((option) => (
                      <article className={`video-scene-import-item ${option.type}`} key={option.id}>
                        <div>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </div>
                        <button className="ghost-button" type="button" onClick={() => handleImportGranularityOption(option)}>
                          {option.type === "scene" ? "导入场景" : option.type === "shot" ? "导入镜头" : "导入分镜"}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="compact-card">
                    <strong>暂无章节剧本</strong>
                    <p>请先进入剧本生成页，为当前小说生成或编辑场景剧本。</p>
                  </article>
                )}
              </>
            ) : (
              <article className="compact-card">
                <strong>暂无本地小说</strong>
                <p>请先在小说导入页上传小说，并完成剧本生成流程。</p>
              </article>
            )}
          </div>

          <div className="toolbar">
            <input ref={screenplayInputRef} className="visually-hidden" type="file" accept=".txt,.md,.yaml,.yml" onChange={(event) => handleAssetChange(event, "screenplay")} />
            <button className="ghost-button" type="button" onClick={() => screenplayInputRef.current?.click()}>
              <UploadCloud size={16} />
              从文件导入剧本
            </button>
            <button className="ghost-button danger" type="button" disabled={!screenplayText.trim()} onClick={handleClearScreenplay}>
              <Trash2 size={16} />
              清空剧本
            </button>
          </div>
          <textarea className="video-script-editor" value={screenplayText} onChange={(event) => setScreenplayText(event.target.value)} />
          <label className="field-label">
            Seedance Prompt
            <textarea className="video-prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <label className="field-label">
            Negative Prompt
            <textarea className="video-prompt-input compact" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} />
          </label>
        </section>

        <section className="panel animate-in video-assets-panel">
          <div className="section-title">
            <ImagePlus size={18} />
            <h2>参考素材</h2>
          </div>
          <div className="asset-upload-grid">
            <AssetUploadButton label="参考图片" icon="image" onClick={() => imageInputRef.current?.click()} />
            <AssetUploadButton label="参考视频" icon="video" onClick={() => videoInputRef.current?.click()} />
            <AssetUploadButton label="音频素材" icon="audio" onClick={() => audioInputRef.current?.click()} />
          </div>
          <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => handleAssetChange(event, "image")} />
          <input ref={videoInputRef} className="visually-hidden" type="file" accept="video/*" multiple onChange={(event) => handleAssetChange(event, "video")} />
          <input ref={audioInputRef} className="visually-hidden" type="file" accept="audio/*" multiple onChange={(event) => handleAssetChange(event, "audio")} />

          <AssetSection title="图片参考" assets={imageAssets} onRemove={handleRemoveAsset} />
          <StoryboardImageSource
            tasks={relatedStoryboardImages}
            selectedTasks={selectedStoryboardImageTasks}
            onToggle={toggleStoryboardImageTask}
            onRemove={removeStoryboardImageTask}
            onClear={() => {
              clearSelectedStoryboardImages();
              setStatusMessage("已清空当前导入的分镜图片参考。");
            }}
          />
          <AssetSection title="视频参考" assets={videoAssets} onRemove={handleRemoveAsset} />
          <AssetSection title="音频参考" assets={audioAssets} onRemove={handleRemoveAsset} />
        </section>

        <aside className="panel animate-in video-settings-panel">
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

          <div className="video-setting-grid">
            <SelectField label="模型" value={model} options={availableModels} onChange={setModel} />
            <label className="field-label">
              自定义模型
              <input className="text-input" value={customModel} placeholder="留空则使用上方模型" onChange={(event) => setCustomModel(event.target.value)} />
            </label>
            <SelectField label="画幅" value={ratio} options={ratioOptions} onChange={setRatio} />
            <SelectField label="时长" value={duration} options={durationOptions} suffix="秒" onChange={setDuration} />
            <SelectField label="清晰度" value={resolution} options={resolutionOptions} onChange={setResolution} />
            <label className="field-label">
              Seed
              <input className="text-input" value={seed} placeholder="留空则随机" onChange={(event) => setSeed(event.target.value)} />
            </label>
          </div>

          <label className="toggle-row">
            <input type="checkbox" checked={cameraFixed} onChange={(event) => setCameraFixed(event.target.checked)} />
            <span>固定镜头运动</span>
          </label>

          <div className="video-task-card">
            <strong>任务草案</strong>
            <p>模型：{customModel.trim() || model}</p>
            <p>
              {resolution} · {ratio} · {duration} 秒
            </p>
            <p>
              素材：{imageAssets.length} 图 · {videoAssets.length} 视频 · {audioAssets.length} 音频
            </p>
            <p>分镜参考：{selectedStoryboardImageTasks.length} 张</p>
            <p>粒度：{selectedShotTag?.label || selectedSceneTag?.label || (screenplayText.trim() ? "完整剧本/手动文本" : "未选择")}</p>
            <button className="primary-button" type="button" disabled={isCreatingTask} onClick={handleCreateTask}>
              <Play size={16} />
              {isCreatingTask ? "提交中..." : "创建视频任务"}
            </button>
            <small>{statusMessage}</small>
          </div>
        </aside>
      </div>
    </section>
  );
}

function buildScreenplayText(draft: ReturnType<typeof getScreenplayDraft>) {
  if (!draft?.scenes.length) return "";
  return draft.scenes.map((scene, index) => buildSceneScreenplayText(scene, index)).join("\n\n");
}

function buildSceneScreenplayText(scene: SceneScreenplayDraft, index: number) {
  const meta = [
    `场景 ${index + 1}：${scene.title}`,
    scene.blockTitle ? `所属章节/总场景：${scene.blockTitle}` : "",
    scene.location ? `地点：${scene.location}` : "",
    scene.timeOfDay ? `时间：${scene.timeOfDay}` : "",
    scene.characters.length ? `人物：${scene.characters.join("、")}` : ""
  ].filter(Boolean);
  return `${meta.join("\n")}\n\n${scene.content}`;
}

function buildGranularityScreenplayText(option: VideoGranularityOption) {
  if (option.type === "scene") return buildSceneScreenplayText(option.scene, option.sceneIndex);
  if (option.type === "shot" && option.shot) {
    return `${buildSceneMetaText(option.scene, option.sceneIndex)}

${buildShotMetaText(option.shot, option.shotIndex ?? 0)}

${getShotScreenplayText(option.shot, option.scene)}`;
  }
  if (option.type === "frame" && option.shot && option.frame) {
    return `${buildSceneMetaText(option.scene, option.sceneIndex)}

${buildShotMetaText(option.shot, option.shotIndex ?? 0)}

分镜粒度：${option.frame.label}
分镜要点：${option.frame.focus}：${option.frame.value}
生成要求：${option.frame.instruction}

${getShotScreenplayText(option.shot, option.scene)}`;
  }
  return buildSceneScreenplayText(option.scene, option.sceneIndex);
}

function buildSceneMetaText(scene: SceneScreenplayDraft, index: number) {
  return [
    `场景 ${index + 1}：${scene.title}`,
    scene.blockTitle ? `所属章节/总场景：${scene.blockTitle}` : "",
    scene.location ? `地点：${scene.location}` : "",
    scene.timeOfDay ? `时间：${scene.timeOfDay}` : "",
    scene.characters.length ? `人物：${scene.characters.join("、")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildShotMetaText(shot: StoryboardShot, index: number) {
  return [
    `镜头 ${index + 1}`,
    shot.shotType ? `景别：${shot.shotType}` : "",
    shot.viewpoint ? `视角：${shot.viewpoint}` : "",
    shot.composition ? `构图：${shot.composition}` : "",
    shot.cameraMovement ? `运动：${shot.cameraMovement}` : "",
    shot.visualFocus ? `焦点：${shot.visualFocus}` : "",
    shot.emotionalPurpose ? `情绪：${shot.emotionalPurpose}` : "",
    shot.transition ? `转场：${shot.transition}` : "",
    shot.eventTitle ? `事件：${shot.eventTitle}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGranularityPrompt(option: VideoGranularityOption) {
  if (option.type === "scene") {
    return `根据当前场景剧本生成电影感视频，突出“${option.scene.title}”的场面调度、人物行动、环境氛围和视角转换。`;
  }
  if (option.type === "shot" && option.shot) {
    return `根据当前完整镜头生成 ${option.scene.title} 的电影感视频，严格保持镜头${(option.shotIndex ?? 0) + 1}的景别、视角、构图、运动、视觉焦点和情绪目的。`;
  }
  if (option.type === "frame" && option.shot && option.frame) {
    return `根据当前小分镜生成 ${option.scene.title} 的短视频片段，重点执行“${option.frame.label}（${option.frame.focus}）”：${option.frame.value}。请只围绕该分镜粒度扩展动作，不扩写到整个场景。`;
  }
  return "根据剧本生成电影感镜头，保持人物行动、场景氛围和视角转换一致。";
}

function buildVideoGranularityOptions(scenes: SceneScreenplayDraft[]): VideoGranularityOption[] {
  return scenes.flatMap((scene, sceneIndex) => {
    const shots = buildStoryBoardShotsFromScreenplay(scene);
    const sceneOption: VideoGranularityOption = {
      id: `scene:${scene.sceneId}`,
      type: "scene",
      label: scene.title || `场景 ${sceneIndex + 1}`,
      description: `整场景 · ${scene.blockTitle || "未分组总场景"} · ${scene.location || "地点待定"} · ${shots.length} 个镜头`,
      scene,
      sceneIndex
    };
    const shotOptions = shots.flatMap((shot, shotIndex) => {
      const shotOption: VideoGranularityOption = {
        id: `shot:${scene.sceneId}:${shot.id}`,
        type: "shot",
        label: buildShotLabel(shot, shotIndex),
        description: `完整镜头 · ${scene.title} · ${[shot.shotType, shot.viewpoint, shot.visualFocus].filter(Boolean).join(" / ") || "镜头信息待定"}`,
        scene,
        sceneIndex,
        shot,
        shotIndex
      };
      const frameOptions = getShotFrames(shot).map((frame) => ({
        id: `frame:${scene.sceneId}:${shot.id}:${frame.id}`,
        type: "frame" as const,
        label: `${buildShotLabel(shot, shotIndex)} · ${frame.label}`,
        description: `单个分镜 · ${frame.focus} · ${frame.value || "分镜要点待定"}`,
        scene,
        sceneIndex,
        shot,
        shotIndex,
        frame
      }));
      return [shotOption, ...frameOptions];
    });
    return [sceneOption, ...shotOptions];
  });
}

function findRelatedStoryboardImages(option: VideoGranularityOption, tasks: StoryboardImageTask[]) {
  if (!option.shot) return [];
  const shotMatchedTasks = tasks.filter((task) => task.shot?.id === option.shot?.id && (!task.scene?.id || task.scene.id === option.scene.sceneId));
  if (!shotMatchedTasks.length) return [];
  const availableTasks = shotMatchedTasks.filter((task) => task.imageUrl || task.originalImageUrl);
  const candidates = availableTasks.length ? availableTasks : shotMatchedTasks;
  if (!option.frame) return candidates;

  const frameKeyword = normalizeStoryboardFrameLabel(option.frame.label);
  const exactFrameTask = candidates.find((task) => normalizeStoryboardFrameLabel(`${task.title} ${task.shot?.label ?? ""}`).includes(frameKeyword));
  return exactFrameTask ? [exactFrameTask] : candidates;
}

function storyboardImageTaskToTag(task: StoryboardImageTask): VideoTaskTag {
  return { id: task.id, label: task.title, route: "/storyboard-images" };
}

function uniqueStoryboardImageTasks(tasks: StoryboardImageTask[]) {
  const uniqueTasks = new Map<string, StoryboardImageTask>();
  tasks.forEach((task) => uniqueTasks.set(task.id, task));
  return Array.from(uniqueTasks.values());
}

function getStoryboardImageUrls(tasks: StoryboardImageTask[]) {
  return tasks
    .map((task) => task.originalImageUrl || task.imageUrl || "")
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function normalizeStoryboardFrameLabel(value: string) {
  return value.replace(/分镜|定帧|完整镜头|当前镜头/g, "").replace(/\s+/g, "");
}

function buildShotLabel(shot: StoryboardShot, index: number) {
  return `镜头${index + 1}${shot.shotType ? `：${shot.shotType}` : ""}`;
}

function formatGranularityType(type: VideoGranularityOption["type"]) {
  const labels = {
    scene: "整场景",
    shot: "完整镜头",
    frame: "单个分镜"
  };
  return labels[type];
}

function getShotFrames(shot: StoryboardShot): ShotFrame[] {
  return [
    {
      id: "composition",
      label: "分镜1",
      focus: "构图",
      value: shot.composition || "构图待定",
      instruction: "只生成该镜头的构图段落，重点保持人物相对位置、画面分区、前后景关系和大概场景轮廓。"
    },
    {
      id: "focus",
      label: "分镜2",
      focus: "焦点",
      value: shot.visualFocus || "视觉焦点待定",
      instruction: "只生成该镜头的焦点段落，重点保持观众视线落点、人物或物件的大概位置。"
    },
    {
      id: "viewpoint",
      label: "分镜3",
      focus: "视角",
      value: shot.viewpoint || "视角待定",
      instruction: "只生成该镜头的视角段落，重点保持机位高度、观察方向、人物朝向和空间距离。"
    },
    {
      id: "emotion",
      label: "分镜4",
      focus: "情绪",
      value: shot.emotionalPurpose || "情绪目的待定",
      instruction: "只生成该镜头的情绪段落，重点用人物姿态、距离、压迫感和节奏表达情绪。"
    },
    {
      id: "transition",
      label: "分镜5",
      focus: "转场",
      value: shot.transition || "转场待定",
      instruction: "只生成该镜头的转场段落，重点表现离场、进入、遮挡或视线方向等空间变化。"
    }
  ];
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
      text: content.slice(headingStart, nextHeadingStart).trim() || match[2].trim()
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

function AssetUploadButton({ label, icon, onClick }: { label: string; icon: "image" | "video" | "audio"; onClick: () => void }) {
  const Icon = icon === "image" ? ImagePlus : icon === "video" ? Video : Music;
  return (
    <button className="asset-upload-button" type="button" onClick={onClick}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

function AssetSection({ title, assets, onRemove }: { title: string; assets: MediaAsset[]; onRemove: (assetId: string) => void }) {
  return (
    <div className="asset-section">
      <div className="section-title">
        <h3>{title}</h3>
        <small>{assets.length} 个</small>
      </div>
      {assets.length ? (
        <div className="asset-list">
          {assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              {asset.type === "image" && asset.url ? <img src={asset.url} alt={asset.name} /> : null}
              {asset.type === "video" && asset.url ? <video src={asset.url} controls /> : null}
              {asset.type === "audio" && asset.url ? <audio src={asset.url} controls /> : null}
              <div className="asset-card-footer">
                <div>
                  <strong>{asset.name}</strong>
                  <small>{formatFileSize(asset.size)}</small>
                </div>
                <button className="icon-button danger" type="button" aria-label={`删除${asset.name}`} title="删除素材" onClick={() => onRemove(asset.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <article className="compact-card">
          <strong>暂无素材</strong>
          <p>导入素材后会在这里展示预览。</p>
        </article>
      )}
    </div>
  );
}

function StoryboardImageSource({
  tasks,
  selectedTasks,
  onToggle,
  onRemove,
  onClear
}: {
  tasks: ReturnType<typeof useStoryboardImageTasks>;
  selectedTasks: StoryboardImageTask[];
  onToggle: (task: StoryboardImageTask) => void;
  onRemove: (taskId: string) => void;
  onClear: () => void;
}) {
  const selectedTaskIds = new Set(selectedTasks.map((task) => task.id));
  return (
    <div className="asset-section">
      <div className="section-title">
        <h3>分镜图片参考</h3>
        <small>{tasks.length} 个</small>
      </div>
      {selectedTasks.length ? (
        <div className="selected-storyboard-reference-list">
          <div className="section-title">
            <strong>已导入 {selectedTasks.length} 张分镜参考</strong>
            <button className="ghost-button danger" type="button" onClick={onClear}>
              <Trash2 size={15} />
              清空参考图
            </button>
          </div>
          {selectedTasks.map((task, index) => (
            <article className="selected-storyboard-reference" key={task.id}>
              {task.imageUrl ? <img src={task.imageUrl} alt={task.title} /> : <span>暂无图片 URL</span>}
              <div>
                <strong>{index === 0 ? "首帧" : "参考图"}：{task.title}</strong>
                <small>{task.shot?.label || "未关联分镜"}</small>
              </div>
              <button className="icon-button danger" type="button" aria-label={`移除${task.title}`} title="移除分镜图片" onClick={() => onRemove(task.id)}>
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {tasks.length ? (
        <div className="storyboard-reference-list">
          {tasks.map((task) => {
            const isSelected = selectedTaskIds.has(task.id);
            return (
              <button
                className={`storyboard-reference-card${isSelected ? " active" : ""}`}
                type="button"
                key={task.id}
                onClick={() => onToggle(task)}
              >
                {task.imageUrl ? <img src={task.imageUrl} alt={task.title} /> : <span>待生成</span>}
                <strong>{task.title}</strong>
                <small>{isSelected ? "已选参考图" : task.imageUrl ? "可作为参考图" : "暂无图片 URL"} · {task.shot?.label || "未关联分镜"}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <article className="compact-card">
          <strong>暂无分镜图片</strong>
          <p>可先进入分镜生图页，为当前小说生成参考图片任务。</p>
        </article>
      )}
    </div>
  );
}

function SelectField({ label, value, options, suffix, onChange }: { label: string; value: string; options: string[]; suffix?: string; onChange: (value: string) => void }) {
  return (
    <label className="field-label">
      {label}
      <select className="text-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {suffix ?? ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatSeedanceStatus(status: "draft" | "queued" | "running" | "completed" | "failed") {
  const statusMap = {
    draft: "草稿",
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  };
  return statusMap[status];
}
