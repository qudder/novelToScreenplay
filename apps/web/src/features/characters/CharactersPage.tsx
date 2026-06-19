import { useEffect, useRef, useState } from "react";
import { GitBranch, ImagePlus, KeyRound, Merge, SortDesc, Sparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { characters as mockCharacters } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { SourceTrace } from "../../shared/SourceTrace";
import { studioApi } from "../../shared/api";
import type { Character } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

const imageModelOptions = [
  "doubao-seedream-5-0-260128",
  "doubao-seedream-4-0-250828",
  "doubao-seedream-3-0-t2i-250415"
];
const imageSizeOptions = ["1920x1920", "2560x1440", "1440x2560", "2048x2048", "2816x1600", "1600x2816"];
const minimumSeedreamPixels = 3686400;

export function CharactersPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const targetCardRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentNovel = useCurrentNovel();
  const visibleCharacters = currentNovel ? currentNovel.characters : mockCharacters;
  const sortedCharacters = [...visibleCharacters].sort((a, b) => b.importance - a.importance);
  const linkedCharacterId = searchParams.get("characterId") ?? "";
  const shouldShowRelationshipReturn = searchParams.get("from") === "relationships";
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  useEffect(() => {
    targetCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [linkedCharacterId, sortedCharacters.length]);

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Character Intelligence"
        title="角色管理"
        description="管理人物卡片、别名合并和重要性排序，并保留每个角色的原文定位。"
      />
      <div className="toolbar animate-in">
        {currentNovel ? (
          <div className="current-novel-banner inline-banner">
            当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"} ·{" "}
            {sortedCharacters.length} 个角色
          </div>
        ) : null}
        <button className="ghost-button" type="button">
          <Merge size={16} />
          合并别名
        </button>
        <button className="ghost-button" type="button">
          <SortDesc size={16} />
          按重要性排序
        </button>
      </div>
      {shouldShowRelationshipReturn ? (
        <button className="floating-return-button" type="button" onClick={() => navigate("/relationships")}>
          <GitBranch size={16} />
          返回人物关系图
        </button>
      ) : null}
      {sortedCharacters.length > 0 ? (
        <div className="card-grid">
          {sortedCharacters.map((character) => (
            <button
              className={`character-card clickable-card animate-in${character.id === linkedCharacterId ? " linked" : ""}`}
              key={character.id}
              ref={character.id === linkedCharacterId ? targetCardRef : undefined}
              type="button"
              onClick={() => setSelectedCharacter(character)}
            >
              <div className="card-topline">
                <strong>{character.name}</strong>
                <span>{character.importance}</span>
              </div>
              <p className="character-description">{truncateText(character.description, 96)}</p>
              <div className="tag-row">
                <span>{character.role}</span>
                {character.aliases.slice(0, 3).map((alias) => (
                  <span key={alias}>{alias}</span>
                ))}
                {character.aliases.length > 3 ? <span>等 {character.aliases.length} 个别名</span> : null}
              </div>
              <small className="appearance-line">
                出场章节：{character.appearances.length > 0 ? character.appearances.join("、") : "待分析"}
              </small>
              <span onClick={(event) => event.stopPropagation()}>
                <SourceTrace refs={character.sourceRefs} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel animate-in empty-section">
          <strong>等待叙事分析</strong>
          <p>当前小说已经导入，但还没有角色分析结果。请先在“小说导入”页启动叙事分析。</p>
        </div>
      )}
      {selectedCharacter ? (
        <CharacterImageModal
          character={selectedCharacter}
          filename={currentNovel?.filename ?? "示例小说"}
          documentId={currentNovel?.documentId ?? ""}
          onClose={() => setSelectedCharacter(null)}
        />
      ) : null}
    </section>
  );
}

function CharacterImageModal({
  character,
  documentId,
  filename,
  onClose
}: {
  character: Character;
  documentId: string;
  filename: string;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 Seedance 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [model, setModel] = useState(imageModelOptions[0]);
  const [availableModels, setAvailableModels] = useState(imageModelOptions);
  const [customModel, setCustomModel] = useState("");
  const [size, setSize] = useState(imageSizeOptions[0]);
  const [seed, setSeed] = useState("");
  const [prompt, setPrompt] = useState(buildCharacterImagePrompt(character));
  const [negativePrompt, setNegativePrompt] = useState("文字、字幕、水印、多人群像、低清晰度、畸形五官、重复肢体、过度卡通化");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("可复用分镜生图的 Seedream 模型和 Seedance API Key 生成角色形象。");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    setPrompt(buildCharacterImagePrompt(character));
    setImageUrl("");
    setStatusMessage("可复用分镜生图的 Seedream 模型和 Seedance API Key 生成角色形象。");
  }, [character.id]);

  useEffect(() => {
    studioApi
      .getSeedanceSettings()
      .then((settings) => {
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? "Seedance API Key 已配置。" : "Seedance API Key 尚未配置。");
        if (settings.configured) {
          void refreshModelOptions();
        }
      })
      .catch(() => {
        setKeyStatusMessage("无法读取 Seedance 配置状态。");
      });
  }, []);

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

  async function handleGenerateCharacterImage() {
    if (!isKeyConfigured) {
      setStatusMessage("请先配置 Seedance API Key。");
      return;
    }
    if (!prompt.trim()) {
      setStatusMessage("请先填写角色图片提示词。");
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

    setIsGenerating(true);
    setStatusMessage("正在调用 Seedream 生成角色图片...");
    try {
      const selectedModel = customModel.trim() || model;
      const result = await studioApi.createSeedreamImageGeneration({
        title: `${character.name} · 角色形象`,
        model: selectedModel,
        prompt,
        negativePrompt,
        size,
        seed: seedValue,
        documentId,
        filename,
        sceneId: "character-portrait",
        sceneTitle: "角色形象",
        shotId: character.id,
        shotLabel: character.name,
        frameId: "character-image",
        frameLabel: "角色图片"
      });
      const nextImageUrl = result.imageUrl || (result.b64Json ? `data:image/png;base64,${result.b64Json}` : "");
      setImageUrl(nextImageUrl);
      setStatusMessage(nextImageUrl ? "角色图片已生成。" : "角色图片任务已返回，但未取得图片 URL，请查看调试日志。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "生成角色图片失败。");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="source-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${character.name} 角色图片生成`}>
      <div className="source-modal character-image-modal">
        <header className="source-modal-header">
          <div>
            <span>角色图片生成</span>
            <h2>{character.name}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="关闭角色图片生成" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="character-image-modal-layout">
          <section className="character-image-preview">
            {imageUrl ? (
              <img src={imageUrl} alt={`${character.name} 角色图片`} />
            ) : (
              <div className="character-image-placeholder">
                <ImagePlus size={30} />
                <strong>等待生成角色图片</strong>
                <p>{truncateText(character.description, 140)}</p>
              </div>
            )}
          </section>
          <section className="character-image-controls">
            <div className="section-title">
              <Sparkles size={18} />
              <h3>生成设置</h3>
            </div>
            <label className="field-label">
              角色图片提示词
              <textarea className="video-script-editor character-image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <label className="field-label">
              Negative Prompt
              <textarea className="video-prompt-input compact" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} />
            </label>
            <div className="section-title">
              <KeyRound size={18} />
              <h3>Seedance 配置</h3>
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
            <div className="character-image-setting-grid">
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
            </div>
            <button className="primary-button" type="button" disabled={isGenerating} onClick={handleGenerateCharacterImage}>
              <Sparkles size={16} />
              {isGenerating ? "生成中..." : "生成角色图片"}
            </button>
            <small className="muted-line">{statusMessage}</small>
          </section>
        </div>
      </div>
    </div>
  );
}

function truncateText(text: string, maxLength: number) {
  const normalizedText = text.trim();
  return normalizedText.length > maxLength ? `${normalizedText.slice(0, maxLength)}...` : normalizedText;
}

function buildCharacterImagePrompt(character: Character) {
  return [
    `为小说角色“${character.name}”生成一张单人角色设定图。`,
    `角色定位：${character.role || "角色定位待定"}`,
    `人物描述：${character.description || "暂无角色描述"}`,
    character.aliases.length ? `别名参考：${character.aliases.join("、")}` : "",
    `画面要求：单人半身或七分身，面部清晰，服装和姿态符合角色气质，电影概念设定图，背景简洁，不出现文字。`
  ]
    .filter(Boolean)
    .join("\n");
}

function isValidSeedreamSize(size: string) {
  const [width, height] = size.split("x").map((value) => Number(value));
  return Number.isFinite(width) && Number.isFinite(height) && width * height >= minimumSeedreamPixels;
}
