import { PageHeader } from "../../shared/PageHeader";
import { chapters, characters, events } from "../../shared/mockData";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

function getNames(ids: string[]) {
  return ids
    .map((id) => characters.find((character) => character.id === id)?.name)
    .filter(Boolean)
    .join("、");
}

export function TimelinePage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Narrative Timeline"
        title="章节/事件时间线"
        description="按章节排列事件，标出人物出场、冲突点和改编价值。"
      />
      <div className="timeline">
        {chapters.map((chapter) => (
          <article key={chapter.id} className="timeline-item animate-in">
            <div className="timeline-marker" />
            <div className="panel">
              <h2>{chapter.title}</h2>
              <p>{chapter.summary}</p>
              <small>出场人物：{getNames(chapter.characterIds)}</small>
              <div className="event-stack">
                {events
                  .filter((event) => event.chapterId === chapter.id)
                  .map((event) => (
                    <div className="compact-card" key={event.id}>
                      <strong>{event.title}</strong>
                      <p>{event.summary}</p>
                      <small>冲突：{event.conflict}</small>
                    </div>
                  ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

