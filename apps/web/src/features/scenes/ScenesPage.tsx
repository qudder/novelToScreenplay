import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { PageHeader } from "../../shared/PageHeader";
import { events as mockEvents, scenes as mockScenes, chapters as mockChapters } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { SourceTrace } from "../../shared/SourceTrace";
import { SourceCompareModal, type ComparePayload } from "../../shared/SourceCompareModal";
import type { Event, Scene } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ScenesPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const visibleEvents = currentNovel ? currentNovel.events : mockEvents;
  const visibleScenes = currentNovel ? currentNovel.scenes : mockScenes;
  const visibleChapters = currentNovel ? currentNovel.chapters : mockChapters;
  const hasAnalysis = Boolean(currentNovel?.analysisStatus === "completed");
  const sourceText = currentNovel?.sourceText ?? "";
  const [comparePayload, setComparePayload] = useState<ComparePayload | null>(null);

  function openEventCompare(event: Event) {
    setComparePayload({
      type: "event",
      title: event.title,
      event,
      refs: event.sourceRefs ?? []
    });
  }

  function openSceneCompare(scene: Scene) {
    setComparePayload({
      type: "scene",
      title: scene.title,
      scene,
      refs: scene.sourceRefs ?? []
    });
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Scene Board"
        title="场景拆分板"
        description="把小说事件整理为剧本场景候选，保留来源事件、地点、时间、戏剧功能和原文定位。点击事件或场景卡片可打开原文比对。"
      />
      {currentNovel ? (
        <div className="current-novel-banner animate-in">
          当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"}
        </div>
      ) : null}
      <DndContext>
        <div className="board-layout">
          <div className="panel animate-in">
            <h2>事件池</h2>
            <div className="event-stack">
              {visibleEvents.length > 0 ? (
                visibleEvents.map((event) => (
                  <button className="compact-card draggable-card clickable-card" type="button" key={event.id} onClick={() => openEventCompare(event)}>
                    <strong>{event.title}</strong>
                    <p>{event.summary}</p>
                    <small>
                      {event.location ? `${event.location} · ` : ""}
                      {event.timeText ? `${event.timeText} · ` : ""}
                      {event.conflict || "无明确冲突"}
                    </small>
                    <SourceTrace refs={event.sourceRefs} />
                    {event.consequence ? <p className="muted-line">结果：{event.consequence}</p> : null}
                  </button>
                ))
              ) : (
                <div className="compact-card">
                  <strong>{hasAnalysis ? "暂无事件" : "等待叙事分析"}</strong>
                  <p>完成叙事分析后，事件会出现在这里。</p>
                </div>
              )}
            </div>
          </div>
          <div className="panel animate-in">
            <h2>剧本场景候选</h2>
            <div className="scene-columns">
              {visibleScenes.length > 0 ? (
                visibleScenes.map((scene) => (
                  <button className="scene-card clickable-card" type="button" key={scene.id} onClick={() => openSceneCompare(scene)}>
                    <strong>{scene.title}</strong>
                    <p>
                      {scene.location || "地点待定"} · {scene.timeOfDay || "时间待定"}
                    </p>
                    <small>{scene.dramaticFunction || "戏剧功能待确认"}</small>
                    <SourceTrace refs={scene.sourceRefs} />
                    {scene.adaptationNote ? <p className="muted-line">改编：{scene.adaptationNote}</p> : null}
                    <div className="tag-row">
                      {(scene.eventTitles?.length ? scene.eventTitles : scene.eventIds).map((eventId) => (
                        <span key={eventId}>{eventId}</span>
                      ))}
                    </div>
                  </button>
                ))
              ) : (
                <article className="scene-card">
                  <strong>{hasAnalysis ? "暂无场景候选" : "等待叙事分析"}</strong>
                  <p>完成叙事分析后，模型生成的场景候选会出现在这里。</p>
                </article>
              )}
            </div>
          </div>
        </div>
      </DndContext>
      <SourceCompareModal
        payload={comparePayload}
        sourceText={sourceText}
        chapters={visibleChapters}
        onClose={() => setComparePayload(null)}
      />
    </section>
  );
}
