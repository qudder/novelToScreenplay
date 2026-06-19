import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Chapter, Event, NarrativeBlock, Scene, SourceRef, SubScene } from "./types";

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
      scene: Scene | NarrativeBlock | SubScene;
      refs: SourceRef[];
    };

type SourceCompareModalProps = {
  payload: ComparePayload | null;
  sourceText: string;
  chapters: Chapter[];
  onClose: () => void;
};

export function buildChapterSourceRef(chapter: Chapter, chapters: Chapter[], sourceText: string): SourceRef {
  if (
    typeof chapter.sourceStart === "number" &&
    typeof chapter.sourceEnd === "number" &&
    chapter.sourceStart >= 0 &&
    chapter.sourceEnd > chapter.sourceStart
  ) {
    return {
      chapterId: chapter.id,
      startChar: chapter.sourceStart,
      endChar: chapter.sourceEnd,
      evidence: chapter.title
    };
  }

  const chapterRanges = buildChapterRanges(chapters, sourceText);
  const range = chapterRanges.get(chapter.id);
  const startChar = range?.startChar ?? 0;
  const endChar = range?.endChar ?? sourceText.length;

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
  const compareRefs = useMemo(
    () => (payload.type === "chapter" ? [buildChapterSourceRef(payload.chapter, chapters, sourceText)] : payload.refs),
    [chapters, payload, sourceText]
  );
  const normalizedRefs = useMemo(
    () => (payload.type === "chapter" ? compareRefs : compareRefs.map((ref) => normalizeRefToSourceText(ref, chapters, sourceText) ?? ref)),
    [chapters, compareRefs, payload.type, sourceText]
  );
  const selectedRef = normalizedRefs[selectedRefIndex];
  const primaryRef = selectedRef ?? normalizeRefToSourceText(choosePrimaryRef(compareRefs), chapters, sourceText);
  const resolvedRef = payload.type === "chapter" ? compareRefs[0] : primaryRef;
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
              {compareRefs.length > 0 ? (
                compareRefs.map((ref, index) => {
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
  if (refMatchesEvidence(sourceText, ref)) return ref;

  const chapter = chapters.find((item) => item.id === ref.chapterId);
  if (!chapter) return ref;

  const range = buildChapterRanges(chapters, sourceText).get(chapter.id);
  if (!range) return ref;
  const chapterBodyStart = sourceText.indexOf("\n", range.startChar);
  const offset = chapterBodyStart >= 0 && chapterBodyStart < range.endChar ? chapterBodyStart + 1 : range.startChar + chapter.title.length;

  const normalizedRef = {
    ...ref,
    startChar: offset + ref.startChar,
    endChar: offset + ref.endChar
  };
  if (refMatchesEvidence(sourceText, normalizedRef)) return normalizedRef;

  const evidenceIndex = findEvidenceInRange(sourceText, ref.evidence, range.startChar, range.endChar);
  if (evidenceIndex >= 0) {
    return {
      ...ref,
      startChar: evidenceIndex,
      endChar: evidenceIndex + ref.evidence.trim().length
    };
  }

  return ref;
}

function refMatchesEvidence(sourceText: string, ref: SourceRef) {
  const evidence = ref.evidence.trim();
  if (!evidence) return false;
  if (ref.startChar < 0 || ref.endChar < ref.startChar || ref.endChar > sourceText.length) return false;
  return sourceText.slice(ref.startChar, ref.endChar) === evidence;
}

function findEvidenceInRange(sourceText: string, evidence: string, startChar: number, endChar: number) {
  const normalizedEvidence = evidence.trim();
  if (!normalizedEvidence) return -1;
  const index = sourceText.indexOf(normalizedEvidence, startChar);
  return index >= 0 && index < endChar ? index : -1;
}

function buildChapterRanges(chapters: Chapter[], sourceText: string) {
  const starts: Array<{ chapter: Chapter; startChar: number }> = [];
  let searchFrom = 0;

  for (const chapter of chapters) {
    const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
    const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] : undefined;
    const startChar = findChapterTitleStart(sourceText, chapter, nextChapter, searchFrom);
    if (startChar < 0) {
      continue;
    }
    starts.push({ chapter, startChar });
    searchFrom = startChar + chapter.title.length;
  }

  const ranges = new Map<string, { startChar: number; endChar: number }>();
  starts.forEach((item, index) => {
    ranges.set(item.chapter.id, {
      startChar: item.startChar,
      endChar: starts[index + 1]?.startChar ?? sourceText.length
    });
  });
  return ranges;
}

function findChapterTitleStart(sourceText: string, chapter: Chapter, nextChapter: Chapter | undefined, searchFrom: number) {
  let index = sourceText.indexOf(chapter.title, searchFrom);
  while (index >= 0) {
    if (isStandaloneTitle(sourceText, index, chapter.title) && hasChapterLikeDistance(sourceText, chapter, nextChapter, index)) {
      return index;
    }
    index = sourceText.indexOf(chapter.title, index + chapter.title.length);
  }
  return -1;
}

function isStandaloneTitle(sourceText: string, index: number, title: string) {
  const previousLineBreak = Math.max(sourceText.lastIndexOf("\n", index - 1), sourceText.lastIndexOf("\r", index - 1));
  const beforeTitle = sourceText.slice(previousLineBreak + 1, index);
  if (beforeTitle.trim()) return false;

  const lineEndIndex = sourceText.indexOf("\n", index);
  const line = sourceText.slice(index, lineEndIndex >= 0 ? lineEndIndex : sourceText.length).trim();
  return line === title.trim();
}

function hasChapterLikeDistance(sourceText: string, chapter: Chapter, nextChapter: Chapter | undefined, titleStart: number) {
  if (!nextChapter) return true;
  const nextStart = sourceText.indexOf(nextChapter.title, titleStart + chapter.title.length);
  if (nextStart < 0) return true;

  const distance = nextStart - titleStart;
  const minBodyDistance = Math.min(180, Math.max(40, Math.floor(chapter.wordCount * 0.08)));
  return distance >= minBodyDistance;
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
      <dd>{getSceneLocation(payload.scene) || "地点待定"}</dd>
      <dt>时间</dt>
      <dd>{getSceneTime(payload.scene) || "时间待定"}</dd>
      <dt>戏剧功能</dt>
      <dd>{getSceneFunction(payload.scene) || "功能待定"}</dd>
      <dt>冲突或说明</dt>
      <dd>{getSceneNote(payload.scene) || "暂无说明"}</dd>
      <dt>关联事件</dt>
      <dd>{getSceneEventTitles(payload.scene).join("、") || "暂无关联事件"}</dd>
    </dl>
  );
}

function getSceneLocation(scene: Scene | NarrativeBlock | SubScene) {
  if ("locationScope" in scene) return scene.locationScope;
  return scene.location;
}

function getSceneTime(scene: Scene | NarrativeBlock | SubScene) {
  if ("storyTime" in scene) return scene.storyTime;
  if ("timeText" in scene) return scene.timeText || scene.timeOfDay;
  return scene.timeOfDay;
}

function getSceneFunction(scene: Scene | NarrativeBlock | SubScene) {
  if ("dramaticGoal" in scene) return scene.dramaticGoal;
  return scene.dramaticFunction;
}

function getSceneNote(scene: Scene | NarrativeBlock | SubScene) {
  if ("mainConflict" in scene) return scene.mainConflict || scene.summary;
  if ("adaptationNote" in scene) return scene.adaptationNote;
  return scene.dramaticFunction;
}

function getSceneEventTitles(scene: Scene | NarrativeBlock | SubScene) {
  if ("subSceneIds" in scene) return scene.subSceneIds;
  return (scene.eventTitles?.length ? scene.eventTitles : scene.eventIds) ?? [];
}
