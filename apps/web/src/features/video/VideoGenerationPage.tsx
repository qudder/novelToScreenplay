import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FileVideo, ImagePlus, KeyRound, Music, Play, UploadCloud, Video } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { getActiveNovelId, switchCurrentNovel, useCurrentNovel, useNovelLibrary } from "../../shared/currentNovel";
import { getScreenplayDraft, type SceneScreenplayDraft } from "../../shared/screenplayDraft";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

type MediaAsset = {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "screenplay";
  url?: string;
  size: number;
};

const ratioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const durationOptions = ["5", "10"];
const resolutionOptions = ["720p", "1080p"];

export function VideoGenerationPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const novelLibrary = useNovelLibrary();
  const activeNovelId = getActiveNovelId();
  const draft = useMemo(() => getScreenplayDraft(currentNovel?.documentId), [currentNovel?.documentId]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const screenplayInputRef = useRef<HTMLInputElement | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 Seedance 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [screenplayText, setScreenplayText] = useState(() => buildScreenplayText(draft));
  const [prompt, setPrompt] = useState("根据剧本生成电影感镜头，保持人物行动、场景氛围和视角转换一致。");
  const [negativePrompt, setNegativePrompt] = useState("低清晰度、字幕、水印、画面畸变、人物多手指、脸部崩坏");
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState("5");
  const [resolution, setResolution] = useState("1080p");
  const [seed, setSeed] = useState("");
  const [cameraFixed, setCameraFixed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("配置素材和剧本后，可创建 Seedance 视频生成任务。");

  useEffect(() => {
    setScreenplayText(buildScreenplayText(draft));
  }, [draft]);

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
    setAssets((current) => [...nextAssets, ...current]);

    if (type === "screenplay") {
      const file = files[0];
      file.text().then((text) => setScreenplayText(text));
    }
    event.target.value = "";
  }

  function handleSwitchNovel(documentId: string) {
    const novel = switchCurrentNovel(documentId);
    if (novel) {
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
    setStatusMessage(`已导入《${draft?.filename ?? currentNovel?.filename ?? "当前小说"}》的完整剧本。`);
  }

  function handleImportSceneDraft(scene: SceneScreenplayDraft, index: number) {
    setScreenplayText(buildSceneScreenplayText(scene, index));
    setPrompt(`根据当前章节/场景剧本生成电影感镜头，突出“${scene.title}”的场面调度、人物行动、环境氛围和视角转换。`);
    setStatusMessage(`已导入章节剧本：${scene.title}`);
  }

  function handleCreateTask() {
    if (!isKeyConfigured) {
      setStatusMessage("请先配置 Seedance API Key。");
      return;
    }
    if (!screenplayText.trim()) {
      setStatusMessage("请先导入或填写剧本内容。");
      return;
    }
    setStatusMessage("已生成任务草案：接口接入时将提交 Seedance 视频生成任务并轮询状态。");
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
                  <span>{draft?.scenes.length ? `当前可导入 ${draft.scenes.length} 段章节/场景剧本` : "当前小说暂无剧本草稿"}</span>
                </div>
                {draft?.scenes.length ? (
                  <div className="video-scene-import-list">
                    {draft.scenes.map((scene, index) => (
                      <article className="video-scene-import-item" key={scene.sceneId}>
                        <div>
                          <strong>{scene.title || `章节剧本 ${index + 1}`}</strong>
                          <small>
                            {scene.blockTitle} · {scene.location || "地点待定"} · {scene.timeOfDay || "时间待定"}
                          </small>
                        </div>
                        <button className="ghost-button" type="button" onClick={() => handleImportSceneDraft(scene, index)}>
                          导入本段
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

          <AssetSection title="图片参考" assets={imageAssets} />
          <AssetSection title="视频参考" assets={videoAssets} />
          <AssetSection title="音频参考" assets={audioAssets} />
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
            <p>模型：Seedance</p>
            <p>
              {resolution} · {ratio} · {duration} 秒
            </p>
            <p>
              素材：{imageAssets.length} 图 · {videoAssets.length} 视频 · {audioAssets.length} 音频
            </p>
            <button className="primary-button" type="button" onClick={handleCreateTask}>
              <Play size={16} />
              创建视频任务
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

function AssetUploadButton({ label, icon, onClick }: { label: string; icon: "image" | "video" | "audio"; onClick: () => void }) {
  const Icon = icon === "image" ? ImagePlus : icon === "video" ? Video : Music;
  return (
    <button className="asset-upload-button" type="button" onClick={onClick}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

function AssetSection({ title, assets }: { title: string; assets: MediaAsset[] }) {
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
              <strong>{asset.name}</strong>
              <small>{formatFileSize(asset.size)}</small>
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
