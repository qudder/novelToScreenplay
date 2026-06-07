import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clapperboard, Film, ImagePlus, Layers, Tags } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { switchCurrentNovel } from "../../shared/currentNovel";
import { type StoryboardImageTask, useStoryboardImageTasks } from "../../shared/storyboardImages";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import type { VideoTaskTag } from "../../shared/videoTasks";

export function StoryboardImageManagementPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const navigate = useNavigate();
  const tasks = useStoryboardImageTasks();

  function handleOpenTag(task: StoryboardImageTask, tag: VideoTaskTag) {
    if (task.novel?.id) {
      switchCurrentNovel(task.novel.id);
    }
    navigate(tag.route);
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Storyboard Images"
        title="分镜图片管理"
        description="管理由分镜生成的参考图片任务，并把分镜图片接入视频生成。"
      />

      <div className="video-management-summary animate-in">
        <article className="metric-card">
          <span>图片任务</span>
          <strong>{tasks.length}</strong>
        </article>
        <article className="metric-card">
          <span>已完成</span>
          <strong>{tasks.filter((task) => task.status === "completed").length}</strong>
        </article>
        <article className="metric-card">
          <span>关联分镜</span>
          <strong>{tasks.filter((task) => task.shot).length}</strong>
        </article>
      </div>

      <div className="panel animate-in">
        <div className="section-title">
          <h2>分镜图片任务</h2>
          <Link className="ghost-button" to="/storyboard-image-generation">
            <ImagePlus size={16} />
            新建分镜图片
          </Link>
        </div>

        {tasks.length ? (
          <div className="storyboard-image-grid">
            {tasks.map((task) => (
              <article className="video-management-card storyboard-image-card" key={task.id}>
                <div className="storyboard-image-preview">
                  {task.imageUrl ? <img src={task.imageUrl} alt={task.title} /> : <span>待生成图片</span>}
                </div>
                <div className="video-management-header">
                  <div>
                    <span>{statusText(task.status)}</span>
                    <h3>{task.title}</h3>
                    <small>{task.model} · {formatDateTime(task.updatedAt)}</small>
                  </div>
                </div>
                <p>{task.prompt.slice(0, 180) || "暂无提示词"}</p>
                <div className="video-tag-row">
                  {task.novel ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.novel!)}>
                      <BookOpen size={14} />
                      小说：{task.novel.label}
                    </button>
                  ) : null}
                  {task.scene ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.scene!)}>
                      <Clapperboard size={14} />
                      场景：{task.scene.label}
                    </button>
                  ) : null}
                  {task.shot ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.shot!)}>
                      <Layers size={14} />
                      分镜：{task.shot.label}
                    </button>
                  ) : null}
                  {!task.novel && !task.scene && !task.shot ? (
                    <span className="video-static-tag">
                      <Tags size={14} />
                      未关联项目标签
                    </span>
                  ) : null}
                </div>
                <button className="ghost-button" type="button" onClick={() => navigate("/video-generation")}>
                  <Film size={16} />
                  用于视频生成
                </button>
              </article>
            ))}
          </div>
        ) : (
          <article className="compact-card">
            <strong>暂无分镜图片任务</strong>
            <p>请先进入分镜生图页，选择场景分镜并保存图片任务。</p>
          </article>
        )}
      </div>
    </section>
  );
}

function statusText(status: StoryboardImageTask["status"]) {
  const labels: Record<StoryboardImageTask["status"], string> = {
    draft: "草案",
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  };
  return labels[status];
}

function formatDateTime(value: string) {
  if (!value) return "时间未知";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
