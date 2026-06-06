import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Chapter, Event, Scene, SourceRef } from "./types";

export type ComparePayload =
  | {
      type: "chapter";
      title: string;
      chapter: Chapter;
      refs: SourceRef[];
    }
  | {
      type: "event";
      title: string;
      event: Event;
      refs: SourceRef[];
    }
  | {
      type: "scene";
      title: string;
      scene: Scene;
      refs: SourceRef[];
    };

type SourceCompareModalProps = {
  payload: ComparePayload | null;
  sourceText: string;
  chapters: Chapter[];
  onClose: () => void;
};

export function buildChapterSourceRef(chapter: Chapter, chapters: Chapter[], sourceText: string): SourceRef {
  const fallbackStart = 0;
  const titleStart = sourceText.indexOf(chapter.title);
  const startChar = titleStart >= 0 ? titleStart : fallbackStart;
  const currentIndex = chapters.findIndex((item) => item.id === chapter.id);
  const nextChapter = currentIndex >= 0 ? chapters[currentIndex + 1] : undefined;
  const nextStart = nextChapter ? sourceText.indexOf(nextChapter.title, startChar + chapter.title.length) : -1;
  const endChar = nextStart > startChar ? nextStart : sourceText.length;

  return {
    chapterId: chapter.id,
    startChar,
    endChar,
    evidence: chapter.title
  };
}

export function SourceCompareModal({ payload, sourceText, chapters, onClose }: SourceCompareModalProps) {
  if (!payload) return null;

  return <SourceCompareContent payload={payload} sourceText={sourceText} chapters={chapters} onClose={onClose} />;
}

type SourceCompareContentProps = {
  payload: ComparePayload;
  sourceText: string;
  chapters: Chapter[];
  onClose: () => void;
};

function SourceCompareContent({ payload, sourceText, chapters, onClose }: SourceCompareContentProps) {
  const [selectedRefIndex, setSelectedRefIndex] = useState(0);
  const normalizedRefs = useMemo(
    () => payload.refs.map((ref) => normalizeRefToSourceText(ref, chapters, sourceText) ?? ref),
    [chapters, payload.refs, sourceText]
  );
  const selectedRef = normalizedRefs[selectedRefIndex];
  const primaryRef = selectedRef ?? normalizeRefToSourceText(choosePrimaryRef(payload.refs), chapters, sourceText);
  const resolvedRef =
    payload.type === "chapter" && (!primaryRef || primaryRef.startChar < 0)
      ? buildChapterSourceRef(payload.chapter, chapters, sourceText)
      : primaryRef;
  const sourceRange = buildSourceRange(sourceText, resolvedRef);

  return (
    <div className="source-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="source-modal" role="dialog" aria-modal="true" aria-label="原文比对" onClick={(event) => event.stopPropagation()}>
        <header className="source-modal-header">
          <div>
            <span>{getPayloadTypeName(payload.type)}</span>
            <h2>{payload.title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="关闭原文比对" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="source-modal-layout">
          <article className="source-original-panel">
            <div className="source-panel-title">
              <strong>原文定位</strong>
              <small>
                {resolvedRef?.chapterId || "未知章节"} · {formatPosition(resolvedRef)}
              </small>
            </div>
            <div className="source-text-view">
              <span>{sourceRange.before}</span>
              {sourceRange.highlight ? <mark>{sourceRange.highlight}</mark> : null}
              <span>{sourceRange.after}</span>
            </div>
          </article>

          <aside className="source-data-panel">
            <div className="source-panel-title">
              <strong>卡片数据</strong>
              <small>{payload.title}</small>
            </div>
            {renderPayloadData(payload)}
            <div className="source-ref-list">
              <strong>原文证据</strong>
              {payload.refs.length > 0 ? (
                payload.refs.map((ref, index) => {
                  const normalizedRef = normalizedRefs[index];
                  return (
                    <button
                      className={`source-ref-chip${index === selectedRefIndex ? " active" : ""}`}
                      type="button"
                      key={`${ref.chapterId}-${ref.startChar}-${index}`}
                      onClick={() => setSelectedRefIndex(index)}
                    >
                      {ref.chapterId || "未知章节"} · {formatPosition(normalizedRef)}
                      {ref.evidence ? <span>{ref.evidence}</span> : null}
                    </button>
                  );
                })
              ) : (
                <small>该卡片暂无模型返回的原文证据。</small>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function choosePrimaryRef(refs: SourceRef[]) {
  return refs.find((ref) => ref.startChar >= 0 && ref.endChar > ref.startChar) ?? refs[0];
}

function normalizeRefToSourceText(ref: SourceRef | undefined, chapters: Chapter[], sourceText: string): SourceRef | undefined {
  if (!ref || ref.startChar < 0 || ref.endChar <= ref.startChar) return ref;
  const chapter = chapters.find((item) => item.id === ref.chapterId);
  if (!chapter) return ref;

  const chapterStart = sourceText.indexOf(chapter.title);
  if (chapterStart < 0) return ref;
  const chapterBodyStart = sourceText.indexOf("\n", chapterStart);
  const offset = chapterBodyStart >= 0 ? chapterBodyStart + 1 : chapterStart + chapter.title.length;

  return {
    ...ref,
    startChar: offset + ref.startChar,
    endChar: offset + ref.endChar
  };
}

function buildSourceRange(sourceText: string, ref?: SourceRef) {
  if (!sourceText) {
    return {
      before: "当前没有可用原文。",
      highlight: "",
      after: ""
    };
  }

  if (!ref || ref.startChar < 0 || ref.endChar <= ref.startChar) {
    const preview = sourceText.slice(0, 1600);
    return {
      before: preview,
      highlight: "",
      after: sourceText.length > preview.length ? "\n\n……" : ""
    };
  }

  const start = Math.max(0, Math.min(ref.startChar, sourceText.length));
  const end = Math.max(start, Math.min(ref.endChar, sourceText.length));
  const contextStart = Math.max(0, start - 420);
  const contextEnd = Math.min(sourceText.length, end + 720);

  return {
    before: `${contextStart > 0 ? "……\n" : ""}${sourceText.slice(contextStart, start)}`,
    highlight: sourceText.slice(start, end),
    after: `${sourceText.slice(end, contextEnd)}${contextEnd < sourceText.length ? "\n……" : ""}`
  };
}

function formatPosition(ref?: SourceRef) {
  if (!ref || ref.startChar < 0 || ref.endChar <= ref.startChar) return "位置待定";
  return `${ref.startChar}-${ref.endChar}`;
}

function getPayloadTypeName(type: ComparePayload["type"]) {
  if (type === "chapter") return "章节预览";
  if (type === "event") return "事件卡片";
  return "场景卡片";
}

function renderPayloadData(payload: ComparePayload) {
  if (payload.type === "chapter") {
    return (
      <dl className="source-data-list">
        <dt>章节</dt>
        <dd>{payload.chapter.title}</dd>
        <dt>摘要</dt>
        <dd>{payload.chapter.summary || "暂无摘要"}</dd>
        <dt>冲突</dt>
        <dd>{payload.chapter.conflict || "暂无冲突说明"}</dd>
        <dt>字数</dt>
        <dd>{payload.chapter.wordCount}</dd>
      </dl>
    );
  }

  if (payload.type === "event") {
    return (
      <dl className="source-data-list">
        <dt>事件</dt>
        <dd>{payload.event.title}</dd>
        <dt>摘要</dt>
        <dd>{payload.event.summary || "暂无摘要"}</dd>
        <dt>地点</dt>
        <dd>{payload.event.location || "地点待定"}</dd>
        <dt>时间</dt>
        <dd>{payload.event.timeText || "时间待定"}</dd>
        <dt>冲突</dt>
        <dd>{payload.event.conflict || "暂无冲突说明"}</dd>
        <dt>结果</dt>
        <dd>{payload.event.consequence || "暂无结果说明"}</dd>
      </dl>
    );
  }

  return (
    <dl className="source-data-list">
      <dt>场景</dt>
      <dd>{payload.scene.title}</dd>
      <dt>地点</dt>
      <dd>{payload.scene.location || "地点待定"}</dd>
      <dt>时间</dt>
      <dd>{payload.scene.timeOfDay || "时间待定"}</dd>
      <dt>戏剧功能</dt>
      <dd>{payload.scene.dramaticFunction || "功能待定"}</dd>
      <dt>改编说明</dt>
      <dd>{payload.scene.adaptationNote || "暂无说明"}</dd>
      <dt>关联事件</dt>
      <dd>{(payload.scene.eventTitles?.length ? payload.scene.eventTitles : payload.scene.eventIds).join("、") || "暂无关联事件"}</dd>
    </dl>
  );
}
