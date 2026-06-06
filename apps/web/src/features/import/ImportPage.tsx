import { ChangeEvent, useRef, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { chapters as mockChapters } from "../../shared/mockData";
import { studioApi } from "../../shared/api";
import { getCurrentNovel, saveCurrentNovel } from "../../shared/currentNovel";
import type { Chapter } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ImportPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importedNovel = getCurrentNovel();
  const [chapters, setChapters] = useState<Chapter[]>(importedNovel?.chapters ?? mockChapters);
  const [selectedFilename, setSelectedFilename] = useState<string>(importedNovel?.filename ?? "示例文本");
  const [statusMessage, setStatusMessage] = useState<string>(
    importedNovel?.message ?? "当前展示示例分章结果。"
  );
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSelectedFilename(file.name);
    setStatusMessage("正在上传并解析章节...");

    try {
      const result = await studioApi.importDocument(file);
      setChapters(result.chapters);
      setSelectedFilename(result.filename);
      setStatusMessage(result.message);
      saveCurrentNovel({
        filename: result.filename,
        message: result.message,
        sourceText: result.sourceText,
        chapters: result.chapters,
        importedAt: new Date().toISOString()
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传失败。");
      setStatusMessage("解析未完成。");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Document Intake"
        title="小说导入"
        description="上传 TXT、Markdown 或 Docx 后，系统会生成章节结构、摘要和后续抽取任务。"
      />
      <div className="two-column">
        <div className="panel animate-in">
          <div className="upload-zone">
            <UploadCloud size={40} />
            <h2>拖拽或选择小说文件</h2>
            <p>支持 .txt、.md、.docx。当前原型使用示例文本展示分章结果。</p>
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
              {errorMessage ? <em>{errorMessage}</em> : null}
            </div>
          </div>
        </div>
        <div className="panel animate-in">
          <div className="section-title">
            <FileText size={18} />
            <h2>自动分章预览</h2>
          </div>
          <div className="chapter-list">
            {chapters.length > 0 ? chapters.map((chapter) => (
              <article key={chapter.id} className="compact-card">
                <strong>{chapter.title}</strong>
                <p>{chapter.summary}</p>
                <small>{chapter.wordCount} 字 · {chapter.conflict}</small>
              </article>
            )) : (
              <article className="compact-card">
                <strong>暂无章节</strong>
                <p>文件已读取，但没有解析到有效正文。</p>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
