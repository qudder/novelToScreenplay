import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clapperboard, Film, ImagePlus, Layers, Tags } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { switchCurrentNovel } from "../../shared/currentNovel";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import { type VideoTask, type VideoTaskTag, useVideoTasks } from "../../shared/videoTasks";

export function VideoManagementPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const navigate = useNavigate();
  const tasks = useVideoTasks();

  function handleOpenTag(task: VideoTask, tag: VideoTaskTag) {
    if (task.novel?.id) {
      switchCurrentNovel(task.novel.id);
    }
    navigate(tag.route);
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Video Tasks"
        title="视频管理"
        description="管理从小说、章节和场景剧本生成的视频任务草案，点击标签可回到对应流程页面。"
      />

      <div className="video-management-summary animate-in">
        <article className="metric-card">
          <span>任务总数</span>
          <strong>{tasks.length}</strong>
        </article>
        <article className="metric-card">
          <span>草案</span>
          <strong>{tasks.filter((task) => task.status === "draft").length}</strong>
        </article>
        <article className="metric-card">
          <span>分镜图片</span>
          <strong>{tasks.filter((task) => task.storyboardImage).length}</strong>
        </article>
      </div>

      <div className="panel animate-in">
        <div className="section-title">
          <h2>视频任务</h2>
          <Link className="ghost-button" to="/video-generation">
            <Film size={16} />
            新建视频
          </Link>
        </div>

        {tasks.length ? (
          <div className="video-task-list">
            {tasks.map((task) => (
              <article className="video-management-card" key={task.id}>
                <div className="video-management-header">
                  <div>
                    <span>{statusText(task.status)}</span>
                    <h3>{task.title}</h3>
                    <small>
                      {task.model} · {task.resolution} · {task.ratio} · {task.duration} 秒
                    </small>
                  </div>
                  <small>{formatDateTime(task.updatedAt)}</small>
                </div>

                <p>{task.screenplayPreview || "暂无剧本预览"}</p>

                <div className="video-tag-row">
                  {task.novel ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.novel!)}>
                      <BookOpen size={14} />
                      小说：{task.novel.label}
                    </button>
                  ) : null}
                  {task.chapter ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.chapter!)}>
                      <Layers size={14} />
                      章节：{task.chapter.label}
                    </button>
                  ) : null}
                  {task.scene ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.scene!)}>
                      <Clapperboard size={14} />
                      场景：{task.scene.label}
                    </button>
                  ) : null}
                  {task.storyboardImage ? (
                    <button className="video-link-tag" type="button" onClick={() => handleOpenTag(task, task.storyboardImage!)}>
                      <ImagePlus size={14} />
                      分镜图片：{task.storyboardImage.label}
                    </button>
                  ) : null}
                  {!task.novel && !task.chapter && !task.scene && !task.storyboardImage ? (
                    <span className="video-static-tag">
                      <Tags size={14} />
                      未关联项目标签
                    </span>
                  ) : null}
                </div>

                <div className="video-management-meta">
                  <span>剧本 {task.screenplayLength} 字</span>
                  <span>
                    素材 {task.assetCounts.images} 图 / {task.assetCounts.videos} 视频 / {task.assetCounts.audios} 音频
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <article className="compact-card">
            <strong>暂无视频任务</strong>
            <p>请先在视频生成页导入剧本和素材，并创建一个视频任务草案。</p>
          </article>
        )}
      </div>
    </section>
  );
}

function statusText(status: VideoTask["status"]) {
  const labels: Record<VideoTask["status"], string> = {
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
