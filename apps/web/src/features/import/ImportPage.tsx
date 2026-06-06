import { FileText, UploadCloud } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { chapters } from "../../shared/mockData";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ImportPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

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
            <button className="primary-button" type="button">
              选择文件
            </button>
          </div>
        </div>
        <div className="panel animate-in">
          <div className="section-title">
            <FileText size={18} />
            <h2>自动分章预览</h2>
          </div>
          <div className="chapter-list">
            {chapters.map((chapter) => (
              <article key={chapter.id} className="compact-card">
                <strong>{chapter.title}</strong>
                <p>{chapter.summary}</p>
                <small>{chapter.wordCount} 字 · {chapter.conflict}</small>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

