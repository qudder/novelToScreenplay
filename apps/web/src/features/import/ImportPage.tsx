import { ChangeEvent, useEffect, useRef, useState } from "react";
import { FileText, KeyRound, PlayCircle, UploadCloud } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { chapters as mockChapters } from "../../shared/mockData";
import { studioApi } from "../../shared/api";
import { getCurrentNovel, saveCurrentNovel, useCurrentNovel } from "../../shared/currentNovel";
import type { Chapter, CurrentNovel } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import { buildChapterSourceRef, SourceCompareModal, type ComparePayload } from "../../shared/SourceCompareModal";

const emptyAnalysis = {
  characters: [],
  locations: [],
  environments: [],
  timeMarkers: [],
  events: [],
  relationships: [],
  conflicts: [],
  dialogues: [],
  actions: [],
  motivations: [],
  causalLinks: [],
  scenes: [],
  narrativeBlocks: [],
  subScenes: []
};

export function ImportPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importedNovel = useCurrentNovel();
  const latestImportRef = useRef<Pick<CurrentNovel, "filename" | "sourceText" | "chapters" | "importedAt"> | null>(
    importedNovel
      ? {
          filename: importedNovel.filename,
          sourceText: importedNovel.sourceText,
          chapters: importedNovel.chapters,
          importedAt: importedNovel.importedAt
        }
      : null
  );

  const [chapters, setChapters] = useState<Chapter[]>(importedNovel?.chapters ?? mockChapters);
  const [selectedFilename, setSelectedFilename] = useState(importedNovel?.filename ?? "示例文本");
  const [statusMessage, setStatusMessage] = useState(importedNovel?.message ?? "当前展示示例分章结果。");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState(importedNovel?.documentId ?? "");
  const [analysisStatus, setAnalysisStatus] = useState(importedNovel?.analysisStatus ?? "idle");
  const [analysisCounts, setAnalysisCounts] = useState({
    characters: importedNovel?.characters.length ?? 0,
    events: importedNovel?.events.length ?? 0,
    relationships: importedNovel?.relationships.length ?? 0,
    scenes: importedNovel?.subScenes?.length || importedNovel?.scenes.length || 0
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [isKeyConfigured, setIsKeyConfigured] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState("正在读取 DeepSeek 配置...");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [comparePayload, setComparePayload] = useState<ComparePayload | null>(null);

  function openChapterCompare(chapter: Chapter) {
    const sourceText = latestImportRef.current?.sourceText ?? importedNovel?.sourceText ?? "";
    setComparePayload({
      type: "chapter",
      title: chapter.title,
      chapter,
      refs: [buildChapterSourceRef(chapter, chapters, sourceText)]
    });
  }

  useEffect(() => {
    if (!importedNovel) return;

    latestImportRef.current = {
      filename: importedNovel.filename,
      sourceText: importedNovel.sourceText,
      chapters: importedNovel.chapters,
      importedAt: importedNovel.importedAt
    };
    setDocumentId(importedNovel.documentId ?? "");
    setAnalysisStatus(importedNovel.analysisStatus ?? "idle");
    setChapters(importedNovel.chapters);
    setSelectedFilename(importedNovel.filename);
    setStatusMessage(importedNovel.message);
    setAnalysisCounts({
      characters: importedNovel.characters.length,
      events: importedNovel.events.length,
      relationships: importedNovel.relationships.length,
      scenes: importedNovel.subScenes?.length || importedNovel.scenes.length
    });
  }, [importedNovel]);

  useEffect(() => {
    studioApi
      .getDeepSeekSettings()
      .then((settings) => {
        setIsKeyConfigured(settings.configured);
        setKeyStatusMessage(settings.configured ? "DeepSeek API Key 已配置。" : "DeepSeek API Key 尚未配置。");
      })
      .catch(() => {
        setKeyStatusMessage("无法读取 DeepSeek 配置状态。");
      });
  }, []);

  async function handleSaveApiKey() {
    if (!apiKey.trim()) {
      setKeyStatusMessage("请输入 DeepSeek API Key。");
      return;
    }

    setIsSavingKey(true);
    setKeyStatusMessage("正在保存 DeepSeek API Key...");

    try {
      const result = await studioApi.saveDeepSeekApiKey(apiKey);
      setIsKeyConfigured(result.configured);
      setApiKey("");
      setKeyStatusMessage("DeepSeek API Key 已保存到本地后端。");
    } catch (error) {
      setKeyStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSavingKey(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSelectedFilename(file.name);
    setStatusMessage("正在上传并解析章节...");

    try {
      const result = await studioApi.importDocument(file);
      const importedAt = new Date().toISOString();
      const baseNovel: CurrentNovel = {
        documentId: result.documentId,
        analysisStatus: "idle",
        filename: result.filename,
        message: result.message,
        sourceText: result.sourceText,
        chapters: result.chapters,
        importedAt,
        ...emptyAnalysis
      };

      latestImportRef.current = {
        filename: result.filename,
        sourceText: result.sourceText,
        chapters: result.chapters,
        importedAt
      };
      setDocumentId(result.documentId);
      setAnalysisStatus("idle");
      setAnalysisCounts({ characters: 0, events: 0, relationships: 0, scenes: 0 });
      setChapters(result.chapters);
      setSelectedFilename(result.filename);
      setStatusMessage(result.message);
      saveCurrentNovel(baseNovel);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传失败。");
      setStatusMessage("解析未完成。");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleStartAnalysis() {
    if (!documentId) {
      setErrorMessage("请先上传并完成分章。");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStatus("running");
    setErrorMessage(null);
    setStatusMessage("叙事分析已启动，章节结果可继续查看。");

    try {
      if (analysisStatus === "completed" || analysisStatus === "failed") {
        await studioApi.retryDocumentAnalysis(documentId);
      } else {
        await studioApi.startDocumentAnalysis(documentId);
      }
      await pollAnalysis(documentId);
    } catch (error) {
      setAnalysisStatus("failed");
      setErrorMessage(error instanceof Error ? error.message : "叙事分析失败。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function pollAnalysis(targetDocumentId: string) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const result = await studioApi.getDocumentAnalysis(targetDocumentId);
      setAnalysisStatus(result.status);
      setStatusMessage(result.message);

      if (result.status === "completed") {
        const currentNovel = getCurrentNovel();
        const latestImport = latestImportRef.current;
        const completedNovel: CurrentNovel = {
          documentId: targetDocumentId,
          analysisStatus: "completed",
          filename: latestImport?.filename ?? currentNovel?.filename ?? selectedFilename,
          message: result.message,
          sourceText: latestImport?.sourceText ?? currentNovel?.sourceText ?? "",
          chapters: latestImport?.chapters ?? currentNovel?.chapters ?? chapters,
          characters: result.characters,
          locations: result.locations,
          environments: result.environments,
          timeMarkers: result.timeMarkers,
          events: result.events,
          relationships: result.relationships,
          conflicts: result.conflicts,
          dialogues: result.dialogues,
          actions: result.actions,
          motivations: result.motivations,
          causalLinks: result.causalLinks,
          scenes: result.scenes,
          narrativeBlocks: result.narrativeBlocks,
          subScenes: result.subScenes,
          emptyChapterIds: result.emptyChapterIds,
          importedAt: latestImport?.importedAt ?? currentNovel?.importedAt ?? new Date().toISOString()
        };
        setAnalysisCounts({
          characters: result.characters.length,
          events: result.events.length,
          relationships: result.relationships.length,
          scenes: result.subScenes.length || result.scenes.length
        });
        saveCurrentNovel(completedNovel);
        return;
      }

      if (result.status === "failed") {
        throw new Error(result.message || "叙事分析失败。");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }

    throw new Error("叙事分析仍在运行，请稍后刷新状态。");
  }

  const analysisButtonLabel =
    analysisStatus === "completed" || analysisStatus === "failed" ? "重新分析" : "开始叙事分析";

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Document Intake"
        title="小说导入"
        description="上传 TXT、Markdown 或 Docx 后，系统会先返回章节，再异步执行叙事分析。"
      />
      <div className="two-column">
        <div className="panel animate-in">
          <div className="settings-panel">
            <div className="section-title">
              <KeyRound size={18} />
              <h2>DeepSeek 配置</h2>
            </div>
            <div className="api-key-row">
              <input
                className="text-input"
                type="password"
                value={apiKey}
                placeholder={isKeyConfigured ? "已配置，可输入新 key 覆盖" : "输入 DeepSeek API Key"}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button className="ghost-button" type="button" disabled={isSavingKey} onClick={handleSaveApiKey}>
                {isSavingKey ? "保存中..." : "保存"}
              </button>
            </div>
            <small className={isKeyConfigured ? "status-ok" : "status-warn"}>{keyStatusMessage}</small>
          </div>

          <div className="upload-zone">
            <UploadCloud size={40} />
            <h2>拖拽或选择小说文件</h2>
            <p>支持 .txt、.md、.docx。上传后先展示章节，叙事分析可单独启动或重新执行。</p>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".txt,.md,.markdown,.docx"
              onChange={handleFileChange}
            />
            <button
              className="primary-button"
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? "解析中..." : "选择文件"}
            </button>
            <div className="upload-status" aria-live="polite">
              <strong>{selectedFilename}</strong>
              <span>{statusMessage}</span>
              {documentId ? <span>分析状态：{analysisStatus}</span> : null}
              {analysisStatus === "completed" ? (
                <span>
                  已导入看板：{analysisCounts.characters} 角色 · {analysisCounts.events} 事件 ·{" "}
                  {analysisCounts.relationships} 关系 · {analysisCounts.scenes} 场景
                </span>
              ) : null}
              {importedNovel?.emptyChapterIds?.length ? (
                <span>仍有 {importedNovel.emptyChapterIds.length} 个章节未补齐，可点击重新分析。</span>
              ) : null}
              {errorMessage ? <em>{errorMessage}</em> : null}
            </div>
            <button
              className="ghost-button analysis-button"
              type="button"
              disabled={!documentId || isAnalyzing}
              onClick={handleStartAnalysis}
            >
              <PlayCircle size={16} />
              {isAnalyzing ? "分析中..." : analysisButtonLabel}
            </button>
          </div>
        </div>

        <div className="panel animate-in">
          <div className="section-title">
            <FileText size={18} />
            <h2>自动分章预览</h2>
          </div>
          <div className="chapter-list">
            {chapters.length > 0 ? (
              chapters.map((chapter) => (
                <button key={chapter.id} className="compact-card clickable-card" type="button" onClick={() => openChapterCompare(chapter)}>
                  <strong>{chapter.title}</strong>
                  <p>{chapter.summary}</p>
                  <small>
                    {chapter.wordCount} 字 · {chapter.conflict}
                  </small>
                </button>
              ))
            ) : (
              <article className="compact-card">
                <strong>暂无章节</strong>
                <p>文件已读取，但没有解析到有效正文。</p>
              </article>
            )}
          </div>
        </div>
      </div>
      <SourceCompareModal
        payload={comparePayload}
        sourceText={latestImportRef.current?.sourceText ?? importedNovel?.sourceText ?? ""}
        chapters={chapters}
        onClose={() => setComparePayload(null)}
      />
    </section>
  );
}
