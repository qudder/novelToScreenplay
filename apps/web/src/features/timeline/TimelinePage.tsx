import { PageHeader } from "../../shared/PageHeader";
import { chapters, characters, events } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

function getNames(ids: string[]) {
  return ids
    .map((id) => characters.find((character) => character.id === id)?.name)
    .filter(Boolean)
    .join("、");
}

export function TimelinePage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const visibleChapters = currentNovel?.chapters ?? chapters;

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Narrative Timeline"
        title="章节/事件时间线"
        description="按章节排列事件，标出人物出场、冲突点和改编价值。"
      />
      <div className="timeline">
        {currentNovel ? (
          <div className="current-novel-banner animate-in">
            当前小说：{currentNovel.filename} · {currentNovel.message}
          </div>
        ) : null}
        {visibleChapters.map((chapter) => (
          <article key={chapter.id} className="timeline-item animate-in">
            <div className="timeline-marker" />
            <div className="panel">
              <h2>{chapter.title}</h2>
              <p>{chapter.summary}</p>
              <small>
                {chapter.characterIds.length > 0
                  ? `出场人物：${getNames(chapter.characterIds)}`
                  : "出场人物：等待角色抽取"}
              </small>
              <div className="event-stack">
                {currentNovel ? (
                  <div className="compact-card">
                    <strong>章节冲突</strong>
                    <p>{chapter.conflict}</p>
                    <small>事件抽取模块接入后，会在这里展示事件、人物出场和冲突点。</small>
                  </div>
                ) : (
                  events
                    .filter((event) => event.chapterId === chapter.id)
                    .map((event) => (
                    <div className="compact-card" key={event.id}>
                      <strong>{event.title}</strong>
                      <p>{event.summary}</p>
                      <small>冲突：{event.conflict}</small>
                    </div>
                    ))
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
