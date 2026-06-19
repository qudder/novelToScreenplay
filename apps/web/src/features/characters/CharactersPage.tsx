import { useEffect, useRef, useState } from "react";
import { GitBranch, ImagePlus, KeyRound, Merge, SortDesc, Sparkles, Upload, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { characters as mockCharacters } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { imageProviderOptions, imageProviders, isValidImageSize, type ImageProviderId } from "../../shared/imageProviders";
import { SourceTrace } from "../../shared/SourceTrace";
import { studioApi } from "../../shared/api";
import type { Character, CharacterCostume, Scene, SubScene } from "../../shared/types";
import type { VideoTaskTag } from "../../shared/videoTasks";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import {
  buildCharacterImageRecord,
  getPreferredCharacterImageUrl,
  saveCharacterImage,
  useCharacterImages
} from "../../shared/characterImages";

type CharacterPromptTemplateId = "single" | "identity-board";

const characterPromptTemplates: Array<{
  id: CharacterPromptTemplateId;
  label: string;
  description: string;
  preferredSize: string;
}> = [
  {
    id: "single",
    label: "单角色设定图",
    description: "适合生成单人肖像、半身或七分身角色形象。",
    preferredSize: "1920x1920"
  },
  {
    id: "identity-board",
    label: "角色身份板",
    description: "适合生成 16:9 多视角角色研究、细节与身份文字板。",
    preferredSize: "1920x1080"
  }
];

export function CharactersPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const targetCardRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentNovel = useCurrentNovel();
  const characterImages = useCharacterImages();
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
        eyebrow="角色智能"
        title="角色管理"
        description="管理人物卡片、别名合并和重要性排序，并保留每个角色的原文定位。"
      />
      <div className="toolbar animate-in">
        {currentNovel ? (
          <div className="current-novel-banner inline-banner">
            当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"} · {sortedCharacters.length} 个角色
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
          {sortedCharacters.map((character) => {
            const images = characterImages.filter((image) => image.character.id === character.id).slice(0, 4);
            return (
              <article
                className={`character-card clickable-card animate-in${character.id === linkedCharacterId ? " linked" : ""}`}
                key={character.id}
                ref={character.id === linkedCharacterId ? targetCardRef : undefined}
                onClick={() => setSelectedCharacter(character)}
              >
                <button
                  className="character-card-image-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/character-images?characterId=${encodeURIComponent(character.id)}`);
                  }}
                >
                  <CharacterImageStack images={images} characterName={character.name} />
                </button>
                <button
                  className="character-card-main"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedCharacter(character);
                  }}
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
                  {character.costumes?.length ? (
                    <small className="character-costume-line">服饰：{summarizeCharacterCostumes(character)}</small>
                  ) : null}
                  <small className="character-image-count">{images.length ? `${images.length} 张形象图` : "暂无形象图"}</small>
                </button>
                <div className="character-card-actions">
                  <span onClick={(event) => event.stopPropagation()}>
                    <SourceTrace refs={character.sourceRefs} />
                  </span>
                </div>
              </article>
            );
          })}
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
          scenes={[...(currentNovel?.subScenes ?? []), ...(currentNovel?.scenes ?? [])]}
          onClose={() => setSelectedCharacter(null)}
        />
      ) : null}
    </section>
  );
}

function CharacterImageStack({ images, characterName }: { images: ReturnType<typeof useCharacterImages>; characterName: string }) {
  const previewImages = images.slice(0, 3);
  return (
    <div className="character-image-stack" aria-label={`${characterName} 的角色图片`}>
      {previewImages.length ? (
        previewImages.map((image) => <img key={image.id} src={getPreferredCharacterImageUrl(image)} alt={image.title} />)
      ) : (
        <div className="character-image-empty">
          <ImagePlus size={24} />
          <span>角色图片</span>
        </div>
      )}
    </div>
  );
}

function CharacterImageModal({
  character,
  filename,
  documentId,
  scenes,
  onClose
}: {
  character: Character;
  filename: string;
  documentId: string;
  scenes: Array<Scene | SubScene>;
  onClose: () => void;
}) {
  const [imageProvider, setImageProvider] = useState<ImageProviderId>("seedream");
  const providerConfig = imageProviders[imageProvider];
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState(`正在读取 ${providerConfig.keyName} 配置...`);
  const [model, setModel] = useState(providerConfig.defaultModel);
  const [availableModels, setAvailableModels] = useState(providerConfig.defaultModels);
  const [customModel, setCustomModel] = useState("");
  const [size, setSize] = useState(providerConfig.imageSizeOptions[0]);
  const [seed, setSeed] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId);
  const [promptTemplateId, setPromptTemplateId] = useState<CharacterPromptTemplateId>("single");
  const selectedPromptTemplate = characterPromptTemplates.find((template) => template.id === promptTemplateId) ?? characterPromptTemplates[0];
  const [prompt, setPrompt] = useState(buildCharacterImagePrompt(character, selectedScene, promptTemplateId));
  const [negativePrompt, setNegativePrompt] = useState("文字、字幕、水印、多人群像、低清晰度、畸形五官、重复肢体、过度卡通化");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [statusMessage, setStatusMessage] = useState("可使用已配置的图片模型生成角色图片。");
  const [imageUrl, setImageUrl] = useState("");
  const characterImages = useCharacterImages();
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [referenceImages, setReferenceImages] = useState<CharacterReferenceImage[]>([]);
  const reusableCharacterImages = characterImages.filter((image) => image.character.id === character.id);

  useEffect(() => {
    setPrompt(buildCharacterImagePrompt(character, selectedScene, promptTemplateId));
    setImageUrl("");
    setReferenceImages([]);
    setStatusMessage("可使用已配置的图片模型生成角色图片。");
  }, [character.id, selectedSceneId, promptTemplateId]);

  useEffect(() => {
    let isCancelled = false;
    setAvailableModels(providerConfig.defaultModels);
    setModel(providerConfig.defaultModel);
    setSize(selectPreferredImageSize(providerConfig.imageSizeOptions, selectedPromptTemplate.preferredSize));
    setCustomModel("");
    setKeyStatusMessage(`正在读取 ${providerConfig.keyName} 配置...`);
    providerConfig
      .getSettings()
      .then((settings) => {
        if (isCancelled) return;
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? `${providerConfig.keyName} 已配置。` : `${providerConfig.keyName} 尚未配置。`);
        if (settings.configured && providerConfig.supportsModelList) {
          void refreshModelOptions(imageProvider, () => isCancelled);
        }
      })
      .catch(() => {
        if (isCancelled) return;
        setIsKeyConfigured(false);
        setKeyStatusMessage(`无法读取 ${providerConfig.keyName} 配置状态。`);
      });
    return () => {
      isCancelled = true;
    };
  }, [imageProvider, selectedPromptTemplate.preferredSize]);

  async function refreshModelOptions(providerId: ImageProviderId = imageProvider, isCancelled: () => boolean = () => false) {
    try {
      if (!imageProviders[providerId].supportsModelList) return;
      const models = await studioApi.getSeedanceModels();
      const matchedModels = models.map((item) => item.id).filter((id) => id.toLowerCase().includes("seedream"));
      const nextModels = matchedModels.length ? matchedModels : models.map((item) => item.id);
      if (isCancelled()) return;
      if (!nextModels.length) return;
      setAvailableModels(nextModels);
      setModel((current) => (nextModels.includes(current) ? current : nextModels[0]));
      setKeyStatusMessage(`已读取可用图片模型：${nextModels.length} 个。`);
    } catch (error) {
      if (isCancelled()) return;
      const message = error instanceof Error ? error.message : "未知错误";
      setKeyStatusMessage(`读取可用模型失败，可使用自定义模型。错误：${message}`);
    }
  }

  async function handleGenerateCharacterImage() {
    if (!isKeyConfigured) {
      setStatusMessage(`请先配置 ${providerConfig.keyName}。`);
      return;
    }
    if (!prompt.trim()) {
      setStatusMessage("请先填写角色图片提示词。");
      return;
    }
    if (!isValidImageSize(size, providerConfig.minimumPixels)) {
      setStatusMessage(`${providerConfig.label} 图片尺寸过小，请选择更大的尺寸。`);
      return;
    }
    const seedValue = seed.trim() ? Number(seed.trim()) : undefined;
    if (seedValue !== undefined && (!Number.isInteger(seedValue) || seedValue < 0)) {
      setStatusMessage(`Seed 必须是非负整数，留空则由 ${providerConfig.label} 随机生成。`);
      return;
    }

    setIsGenerating(true);
    setStatusMessage(`正在准备 ${providerConfig.label} 角色图片生成请求...`);
    try {
      const selectedModel = customModel.trim() || model;
      const referenceImageUrls = referenceImages.map((image) => image.imageUrl).filter(isRemoteImageReferenceUrl);
      const ignoredReferenceCount = referenceImages.length - referenceImageUrls.length;
      const generationPrompt = buildPromptWithSceneAndCostume(prompt, character, selectedScene, referenceImageUrls.length);
      const sceneTag = buildSceneTag(selectedScene);
      setStatusMessage(
        referenceImageUrls.length
          ? `正在调用 ${providerConfig.label} 参考 ${referenceImageUrls.length} 张图片生成角色图片...`
          : `正在调用 ${providerConfig.label} 生成角色图片${ignoredReferenceCount > 0 ? "，本地参考图已转为文字约束" : ""}...`
      );
      const result = await studioApi.createSeedreamImageGeneration({
        provider: imageProvider,
        title: `${character.name} · ${selectedScene?.title ?? "角色形象"}`,
        model: selectedModel,
        prompt: generationPrompt,
        negativePrompt,
        referenceImageUrls,
        size,
        seed: seedValue,
        documentId,
        filename,
        sceneId: selectedScene?.id ?? "character-portrait",
        sceneTitle: selectedScene?.title ?? "角色形象",
        shotId: character.id,
        shotLabel: character.name,
        frameId: "character-image",
        frameLabel: "角色图片"
      });
      const nextImageUrl = result.imageUrl || (result.b64Json ? `data:image/png;base64,${result.b64Json}` : "");
      setImageUrl(nextImageUrl);
      if (nextImageUrl) {
        const record = buildCharacterImageRecord({
          character,
          source: "generated",
          imageUrl: nextImageUrl,
          title: `${character.name} · ${selectedScene?.title ?? "角色形象"}`,
          model: result.model || selectedModel,
          prompt: generationPrompt,
          negativePrompt,
          originalImageUrl: result.originalImageUrl,
          localImagePath: result.localImagePath,
          media: result.media,
          scene: sceneTag
        });
        if (record) {
          saveCharacterImage(record);
        }
      }
      setStatusMessage(
        nextImageUrl
          ? `角色图片已生成并写入本地缓存。${ignoredReferenceCount > 0 ? "部分本地参考图未作为图片 URL 发送，已保留文字一致性约束。" : ""}`
          : "角色图片任务已返回，但未取得图片 URL，请查看调试日志。"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatusMessage(`生成角色图片失败：${message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleImportReferenceImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatusMessage("参考图片必须是图片文件。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const nextImageUrl = typeof reader.result === "string" ? reader.result : "";
      if (!nextImageUrl) return;
      setReferenceImages((current) => [
        {
          id: `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: file.name || "外部参考图片",
          source: "外部导入",
          imageUrl: nextImageUrl
        },
        ...current
      ]);
      setStatusMessage("已导入参考图片，可继续生成角色图片。");
    };
    reader.readAsDataURL(file);
  }

  function handleToggleCharacterReference(image: ReturnType<typeof useCharacterImages>[number]) {
    const imageUrl = getPreferredCharacterImageUrl(image);
    if (!imageUrl) {
      setStatusMessage("这张角色图片没有可用的图片地址。");
      return;
    }
    setReferenceImages((current) => {
      const exists = current.some((item) => item.id === image.id);
      if (exists) return current.filter((item) => item.id !== image.id);
      return [
        ...current,
        {
          id: image.id,
          title: image.title,
          source: image.source === "generated" ? "角色生成图" : "角色导入图",
          imageUrl
        }
      ];
    });
  }

  function handleRemoveReferenceImage(referenceId: string) {
    setReferenceImages((current) => current.filter((item) => item.id !== referenceId));
  }

  async function handlePolishPrompt() {
    if (!documentId) {
      setStatusMessage("请先导入小说并选择有效角色。");
      return;
    }

    setIsPolishingPrompt(true);
    setStatusMessage("正在调用 DeepSeek 润色角色图片提示词...");
    try {
      const nextPrompt = await studioApi.generateCharacterImagePrompt({
        documentId,
        filename,
        character,
        template: promptTemplateId,
        draftPrompt: buildPromptWithSceneAndCostume(prompt, character, selectedScene)
      });
      setPrompt(nextPrompt);
      setStatusMessage("角色图片提示词已润色。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatusMessage(`润色角色图片提示词失败：${message}`);
    } finally {
      setIsPolishingPrompt(false);
    }
  }

  return (
    <div className="source-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${character.name} 角色图片生成`}>
      <div className="source-modal character-image-modal">
        <input
          ref={referenceInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => {
            handleImportReferenceImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
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
            <div className="toolbar">
              <button className="ghost-button" type="button" disabled={isPolishingPrompt} onClick={handlePolishPrompt}>
                <Sparkles size={16} />
                {isPolishingPrompt ? "润色中..." : "AI 润色提示词"}
              </button>
            </div>
            <div className="character-prompt-template-list" role="radiogroup" aria-label="角色图片提示词模板">
              {characterPromptTemplates.map((template) => (
                <button
                  className={`character-prompt-template${promptTemplateId === template.id ? " active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={promptTemplateId === template.id}
                  key={template.id}
                  onClick={() => setPromptTemplateId(template.id)}
                >
                  <strong>{template.label}</strong>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
            <label className="field-label">
              角色图片提示词 · {selectedPromptTemplate.label}
              <textarea className="video-script-editor character-image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <label className="field-label">
              关联场景
              <select className="text-input" value={selectedSceneId} onChange={(event) => setSelectedSceneId(event.target.value)}>
                <option value="">不关联场景</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="character-reference-panel">
              <div className="section-title">
                <ImagePlus size={18} />
                <h3>参考图片</h3>
                <button className="ghost-button" type="button" onClick={() => referenceInputRef.current?.click()}>
                  <Upload size={16} />
                  导入参考图
                </button>
              </div>
              {referenceImages.length ? (
                <div className="selected-character-reference-list">
                  {referenceImages.map((reference) => (
                    <article className="selected-storyboard-reference character-reference-item" key={reference.id}>
                      <img src={reference.imageUrl} alt={reference.title} loading="lazy" />
                      <div>
                        <strong>{reference.title}</strong>
                        <small>{reference.source}</small>
                      </div>
                      <button className="ghost-button" type="button" onClick={() => handleRemoveReferenceImage(reference.id)}>
                        移除
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <small className="muted-line">可以导入外部图片，也可以从当前角色已有图片中选择参考图。</small>
              )}
              {reusableCharacterImages.length ? (
                <div className="character-reference-list">
                  {reusableCharacterImages.map((image) => {
                    const referenceUrl = getPreferredCharacterImageUrl(image);
                    const isSelected = referenceImages.some((reference) => reference.id === image.id);
                    return (
                      <button
                        className={`storyboard-reference-card character-reference-card${isSelected ? " active" : ""}`}
                        type="button"
                        key={image.id}
                        onClick={() => handleToggleCharacterReference(image)}
                      >
                        {referenceUrl ? <img src={referenceUrl} alt={image.title} loading="lazy" /> : <span>暂无图片</span>}
                        <strong>{image.title}</strong>
                        <small>{image.source === "generated" ? "生成图片" : "导入图片"}</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <label className="field-label">
              反向提示词
              <textarea className="video-prompt-input compact" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} />
            </label>
            <div className="section-title">
              <KeyRound size={18} />
              <h3>图片模型配置</h3>
            </div>
            <small className={isKeyConfigured ? "status-ok" : "status-warn"}>{keyStatusMessage}</small>
            <div className="character-image-setting-grid">
              <label className="field-label">
                图片提供方
                <select className="text-input" value={imageProvider} onChange={(event) => setImageProvider(event.target.value as ImageProviderId)}>
                  {imageProviderOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
                  {providerConfig.imageSizeOptions.map((option) => (
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

function summarizeCharacterCostumes(character: Character, scene?: Scene | SubScene) {
  if (!scene) return "";
  const costumes = selectSceneCostumes(character, scene);
  const descriptions = costumes.map(formatCostumePrompt).filter(Boolean);
  return truncateText(descriptions.join("；"), 120);
}

function selectSceneCostumes(character: Character, scene?: Scene | SubScene): CharacterCostume[] {
  const costumes = character.costumes ?? [];
  if (!scene) return costumes;

  const eventTitles = "eventTitles" in scene ? scene.eventTitles ?? [] : [];
  const sceneKeys = new Set([scene.id, scene.title, scene.location, ...eventTitles].filter(Boolean));
  return costumes.filter((costume) => {
    const costumeSceneTitle = costume.sceneTitle.trim();
    const chapterMatched = "chapterId" in scene && costume.chapterId && costume.chapterId === scene.chapterId;
    return Boolean(
      (costumeSceneTitle && sceneKeys.has(costumeSceneTitle)) ||
        (costumeSceneTitle && scene.title.includes(costumeSceneTitle)) ||
        (costumeSceneTitle && costumeSceneTitle.includes(scene.title)) ||
        chapterMatched
    );
  });
}

function formatCostumePrompt(costume: CharacterCostume) {
  return [
    costume.sceneTitle,
    costume.clothing,
    costume.accessories.length ? `配饰：${costume.accessories.join("、")}` : "",
    costume.makeup ? `妆发：${costume.makeup}` : "",
    costume.colorPalette ? `色彩：${costume.colorPalette}` : "",
    costume.condition ? `状态：${costume.condition}` : ""
  ]
    .filter(Boolean)
    .join("，");
}

function buildCharacterImagePrompt(character: Character, scene: Scene | SubScene | undefined, templateId: CharacterPromptTemplateId) {
  if (templateId === "identity-board") return buildCharacterIdentityBoardPrompt(character, scene);

  const costumePrompt = summarizeCharacterCostumes(character, scene);
  return [
    `为小说角色“${character.name}”生成一张单人角色设定图。`,
    `角色定位：${character.role || "角色定位待定"}`,
    `人物描述：${character.description || "暂无角色描述"}`,
    costumePrompt ? `本场服饰参考：${costumePrompt}` : "",
    character.aliases.length ? `别名参考：${character.aliases.join("、")}` : "",
    "画面要求：单人半身或七分身，面部清晰；如果提供了本场服饰参考，服装、妆容和姿态必须严格贴合该服饰；电影概念设定图，背景简洁，不出现文字。"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCharacterIdentityBoardPrompt(character: Character, scene?: Scene | SubScene) {
  const costumePrompt = summarizeCharacterCostumes(character, scene);
  const aliases = character.aliases.length ? character.aliases.join("、") : "无";
  return [
    "创建一个艺术感的 16:9 角色身份板。",
    "",
    `[主体角色]: ${character.name}，${character.role || "角色定位待定"}。${character.description || "暂无角色描述"}${costumePrompt ? `本场服饰参考：${costumePrompt}。` : ""}别名参考：${aliases}。`,
    "",
    "视觉风格：电影感奇幻概念艺术 / 高级动画角色设定画册质感，可根据小说气质调整为写实、国风、动漫油画或历史影视概念风。",
    "",
    "纯白色或柔和米白色背景，无环境、无 logo、无水印。",
    "",
    "设计方向：创建像高端动画工作室角色研究 + 艺术画册布局的电影感身份板。不对称、优雅、有视觉记忆点。避免网格和目录式布局。",
    "",
    "重要布局规则：不要让任何角色图像重叠，每个视角都要有清晰分离和呼吸空间。",
    "",
    "主要构图：一个稍偏中心的大型英雄全身视图作为视觉锚点。周围安排较小的辅助研究图：中性全身、背面、侧面、坐姿、倚靠姿、蹲姿、俯视角度、仰视角度、表情特写。",
    "",
    "身份锁定：所有视角保持严格一致性——相同的脸、发型、服装、身体比例、姿态语言。",
    "",
    "艺术部分：包含小型剪影研究区（2-3 个黑色简化剪影）、表情研究区、细节研究区（脸、头发、服装关键特征）。",
    "",
    "文字设计：",
    `角色名：${character.name}`,
    `角色定位：${character.role || "角色定位待定"}`,
    `核心气质：${extractCharacterTemperament(character.description)}`,
    `视觉签名：${buildVisualSignature(character, costumePrompt)}`,
    "",
    "整体风格：简洁、电影感、高级、画册质感、干净、富有表现力。"
  ].join("\n");
}

type CharacterReferenceImage = {
  id: string;
  title: string;
  source: string;
  imageUrl: string;
};

function buildPromptWithSceneAndCostume(prompt: string, character: Character, scene?: Scene | SubScene, referenceImageCount = 0) {
  const costumePrompt = summarizeCharacterCostumes(character, scene);
  const promptParts = [prompt.trim()];
  if (costumePrompt && !prompt.includes("本场服饰参考：")) {
    promptParts.push(`本场服饰参考：${costumePrompt}`);
  }
  if (referenceImageCount > 0) {
    promptParts.push(`参考图片要求：已提供 ${referenceImageCount} 张参考图片，请优先保持角色面部特征、服饰轮廓、发型和整体气质一致。`);
  }
  return promptParts.filter(Boolean).join("\n");
}

function isRemoteImageReferenceUrl(url: string) {
  const normalizedUrl = url.trim();
  return normalizedUrl.startsWith("https://") || normalizedUrl.startsWith("http://");
}

function selectPreferredImageSize(options: string[], preferredSize: string) {
  if (options.includes(preferredSize)) return preferredSize;
  const preferredRatio = parseImageRatio(preferredSize);
  const matchedRatio = options.find((option) => Math.abs(parseImageRatio(option) - preferredRatio) < 0.02);
  return matchedRatio ?? options[0];
}

function parseImageRatio(size: string) {
  const [width, height] = size.split("x").map((value) => Number(value));
  if (!width || !height) return 1;
  return width / height;
}

function extractCharacterTemperament(description: string) {
  const normalizedDescription = description.trim();
  if (!normalizedDescription) return "从角色资料中提炼出的稳定气质";
  return truncateText(normalizedDescription.replace(/[。！？；]/g, "，"), 48);
}

function buildVisualSignature(character: Character, costumePrompt: string) {
  const parts = [costumePrompt, character.description, character.role].filter(Boolean).join("，");
  return parts ? truncateText(parts.replace(/[。！？；]/g, "，"), 64) : "可被反复识别的发型、服饰轮廓、道具和色彩组合";
}

function buildSceneTag(scene?: Scene | SubScene): VideoTaskTag | undefined {
  if (!scene) return undefined;
  return {
    id: scene.id,
    label: scene.title,
    route: `/scenes?sceneId=${encodeURIComponent(scene.id)}`
  };
}
