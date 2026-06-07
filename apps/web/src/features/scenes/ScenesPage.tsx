import { useEffect, useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { events as mockEvents, scenes as mockScenes, chapters as mockChapters } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { SourceTrace } from "../../shared/SourceTrace";
import { SourceCompareModal, type ComparePayload } from "../../shared/SourceCompareModal";
import type { Event, NarrativeBlock, Scene, SubScene } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ScenesPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const location = useLocation();
  const sceneBoardTarget = getSceneBoardTarget(location);
  const visibleEvents = currentNovel ? currentNovel.events : mockEvents;
  const visibleScenes = currentNovel ? currentNovel.scenes : mockScenes;
  const visibleBlocks = currentNovel?.narrativeBlocks ?? [];
  const visibleSubScenes = currentNovel?.subScenes ?? [];
  const visibleChapters = currentNovel ? currentNovel.chapters : mockChapters;
  const hasAnalysis = Boolean(currentNovel?.analysisStatus === "completed");
  const sourceText = currentNovel?.sourceText ?? "";
  const [comparePayload, setComparePayload] = useState<ComparePayload | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState(visibleBlocks[0]?.id ?? "");
  const selectedBlock = visibleBlocks.find((block) => block.id === selectedBlockId) ?? visibleBlocks[0];
  const blockSubScenes = selectedBlock
    ? visibleSubScenes.filter((subScene) => subScene.blockId === selectedBlock.id || selectedBlock.subSceneIds.includes(subScene.id))
    : visibleSubScenes;

  useEffect(() => {
    if (!selectedBlockId && visibleBlocks[0]) {
      setSelectedBlockId(visibleBlocks[0].id);
    }
  }, [selectedBlockId, visibleBlocks]);

  useEffect(() => {
    const targetBlockId = resolveTargetBlockId(sceneBoardTarget, visibleBlocks, visibleSubScenes);
    if (targetBlockId) {
      setSelectedBlockId(targetBlockId);
    }
  }, [sceneBoardTarget.blockId, sceneBoardTarget.sceneId, visibleBlocks, visibleSubScenes]);

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

  function openBlockCompare(block: NarrativeBlock) {
    setSelectedBlockId(block.id);
    setComparePayload({
      type: "scene",
      title: block.title,
      scene: block,
      refs: block.sourceRefs ?? []
    });
  }

  function openSubSceneCompare(subScene: SubScene) {
    setComparePayload({
      type: "scene",
      title: subScene.title,
      scene: subScene,
      refs: subScene.sourceRefs ?? []
    });
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Scene Board"
        title="场景拆分板"
        description="先按章节或连续章节形成总场景，再向下拆分子场景、事件、环境、时间和对话。点击卡片可打开原文比对。"
      />
      {currentNovel ? (
        <div className="current-novel-banner animate-in">
          当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"}
        </div>
      ) : null}
      <DndContext>
        <div className="board-layout">
          <div className="panel animate-in">
            <h2>总场景</h2>
            <div className="event-stack">
              {visibleBlocks.length > 0 ? (
                visibleBlocks.map((block) => (
                  <button
                    className={`compact-card clickable-card${block.id === selectedBlock?.id ? " active" : ""}`}
                    type="button"
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    onDoubleClick={() => openBlockCompare(block)}
                  >
                    <strong>{block.title}</strong>
                    <p>{block.summary || block.dramaticGoal || "暂无总场景摘要"}</p>
                    <small>
                      {block.locationScope || "地点范围待定"} · {block.storyTime || "小说时间待定"}
                    </small>
                    <SourceTrace refs={block.sourceRefs} />
                    {block.mainConflict ? <p className="muted-line">冲突：{block.mainConflict}</p> : null}
                  </button>
                ))
              ) : (
                <div className="compact-card">
                  <strong>{hasAnalysis ? "暂无总场景" : "等待叙事分析"}</strong>
                  <p>完成叙事分析后，总场景会出现在这里。</p>
                </div>
              )}
            </div>
          </div>
          <div className="panel animate-in">
            <h2>{selectedBlock ? `${selectedBlock.title} · 子场景` : "子场景"}</h2>
            <div className="scene-columns">
              {blockSubScenes.length > 0 ? (
                blockSubScenes.map((subScene) => (
                  <button
                    className={`scene-card clickable-card${subScene.id === sceneBoardTarget.sceneId ? " active" : ""}`}
                    type="button"
                    key={subScene.id}
                    onClick={() => openSubSceneCompare(subScene)}
                  >
                    <strong>{subScene.title}</strong>
                    <p>
                      {subScene.location || "地点待定"} · {subScene.timeText || subScene.timeOfDay || "时间待定"}
                    </p>
                    <small>{subScene.dramaticFunction || "戏剧功能待确认"}</small>
                    {subScene.shotIds.length ? <p className="muted-line">分镜：{subScene.shotIds.length} 个镜头规划</p> : null}
                    <SourceTrace refs={subScene.sourceRefs} />
                    <div className="tag-row">
                      {(subScene.eventTitles.length ? subScene.eventTitles : subScene.eventIds).map((eventId) => (
                        <span key={eventId}>{eventId}</span>
                      ))}
                    </div>
                  </button>
                ))
              ) : visibleScenes.length > 0 ? (
                visibleScenes.map((scene) => (
                  <button className="scene-card clickable-card" type="button" key={scene.id} onClick={() => openSceneCompare(scene)}>
                    <strong>{scene.title}</strong>
                    <p>
                      {scene.location || "地点待定"} · {scene.timeOfDay || "时间待定"}
                    </p>
                    <small>{scene.dramaticFunction || "戏剧功能待确认"}</small>
                    <SourceTrace refs={scene.sourceRefs} />
                  </button>
                ))
              ) : (
                <article className="scene-card">
                  <strong>{hasAnalysis ? "暂无子场景" : "等待叙事分析"}</strong>
                  <p>完成叙事分析后，模型生成的子场景会出现在这里。</p>
                </article>
              )}
            </div>
          </div>
        </div>
        <div className="panel animate-in">
          <div className="section-title">
            <h2>事件参考池</h2>
            <small>{visibleEvents.length} 个事件</small>
          </div>
          <div className="event-stack event-reference-grid">
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
                </button>
              ))
            ) : (
              <div className="compact-card">
                <strong>{hasAnalysis ? "暂无事件" : "等待叙事分析"}</strong>
                <p>事件会作为子场景拆分和剧本生成的参考材料。</p>
              </div>
            )}
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

type SceneBoardLocationState = {
  blockId?: string;
  sceneId?: string;
};

function getSceneBoardTarget(location: ReturnType<typeof useLocation>) {
  const state = (location.state ?? {}) as SceneBoardLocationState;
  const params = new URLSearchParams(location.search);
  return {
    blockId: state.blockId || params.get("blockId") || "",
    sceneId: state.sceneId || params.get("sceneId") || ""
  };
}

function resolveTargetBlockId(
  target: SceneBoardLocationState,
  blocks: NarrativeBlock[],
  subScenes: SubScene[]
) {
  if (target.blockId && blocks.some((block) => block.id === target.blockId)) {
    return target.blockId;
  }

  if (!target.sceneId) return "";
  const matchedSubScene = subScenes.find((subScene) => subScene.id === target.sceneId);
  return matchedSubScene?.blockId && blocks.some((block) => block.id === matchedSubScene.blockId) ? matchedSubScene.blockId : "";
}
