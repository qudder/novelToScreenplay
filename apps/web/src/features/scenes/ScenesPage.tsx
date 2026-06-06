import { DndContext } from "@dnd-kit/core";
import { PageHeader } from "../../shared/PageHeader";
import { events, scenes } from "../../shared/mockData";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function ScenesPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Scene Board"
        title="场景拆分板"
        description="把小说事件拖拽、合并、排序成剧本场景，保留来源事件和戏剧功能。"
      />
      <DndContext>
        <div className="board-layout">
          <div className="panel animate-in">
            <h2>事件池</h2>
            <div className="event-stack">
              {events.map((event) => (
                <div className="compact-card draggable-card" key={event.id}>
                  <strong>{event.title}</strong>
                  <p>{event.summary}</p>
                  <small>{event.conflict}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="panel animate-in">
            <h2>剧本场景</h2>
            <div className="scene-columns">
              {scenes.map((scene) => (
                <article className="scene-card" key={scene.id}>
                  <strong>{scene.title}</strong>
                  <p>{scene.location} · {scene.timeOfDay}</p>
                  <small>{scene.dramaticFunction}</small>
                  <div className="tag-row">
                    {scene.eventIds.map((eventId) => (
                      <span key={eventId}>{eventId}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </DndContext>
    </section>
  );
}

