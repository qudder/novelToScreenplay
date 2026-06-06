import { PageHeader } from "../../shared/PageHeader";
import { chapters as mockChapters, characters as mockCharacters, events as mockEvents } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import type { Chapter, Character, Event } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

function getCharacterNames(ids: string[], characters: Character[]) {
  return ids
    .map((id) => characters.find((character) => character.id === id)?.name)
    .filter(Boolean)
    .join("、");
}

function getChapterEvents(chapter: Chapter, events: Event[]) {
  return events.filter((event) => event.chapterId === chapter.id);
}

export function TimelinePage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const visibleChapters = currentNovel ? currentNovel.chapters : mockChapters;
  const visibleCharacters = currentNovel ? currentNovel.characters : mockCharacters;
  const visibleEvents = currentNovel ? currentNovel.events : mockEvents;
  const hasAnalysis = Boolean(currentNovel?.analysisStatus === "completed");

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Narrative Timeline"
        title="章节/事件时间线"
        description="按章节展示事件、人物出场、地点、时间和冲突点。"
      />
      <div className="timeline">
        {currentNovel ? (
          <div className="current-novel-banner animate-in">
            当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"}
          </div>
        ) : null}
        {visibleChapters.map((chapter) => {
          const chapterEvents = getChapterEvents(chapter, visibleEvents);
          const names = getCharacterNames(chapter.characterIds, visibleCharacters);

          return (
            <article key={chapter.id} className="timeline-item animate-in">
              <div className="timeline-marker" />
              <div className="panel">
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
                <small>{names ? `出场人物：${names}` : "出场人物：等待分析结果"}</small>
                <div className="event-stack">
                  {chapterEvents.length > 0 ? (
                    chapterEvents.map((event) => (
                      <div className="compact-card" key={event.id}>
                        <strong>{event.title}</strong>
                        <p>{event.summary}</p>
                        <small>
                          {event.location ? `${event.location} · ` : ""}
                          {event.timeText ? `${event.timeText} · ` : ""}
                          冲突：{event.conflict || "无明确冲突"}
                        </small>
                        {event.consequence ? <p className="muted-line">结果：{event.consequence}</p> : null}
                      </div>
                    ))
                  ) : (
                    <div className="compact-card">
                      <strong>{hasAnalysis ? "暂无事件" : "等待叙事分析"}</strong>
                      <p>{chapter.conflict}</p>
                      <small>完成叙事分析后，这里会展示本章事件、地点、时间和冲突。</small>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

