import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Clapperboard, ExternalLink, Film, ImagePlus, Layers, RotateCcw, Tags, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../shared/PageHeader";
import { switchCurrentNovelFromBackend } from "../../shared/currentNovel";
import {
  deleteStoryboardImageTaskPermanently,
  getPreferredStoryboardImageUrl,
  moveStoryboardImageTaskToTrash,
  restoreStoryboardImageTask,
  type StoryboardImageTask,
  useDeletedStoryboardImageTasks,
  useStoryboardImageTasks
} from "../../shared/storyboardImages";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import type { VideoTaskTag } from "../../shared/videoTasks";

export function StoryboardImageManagementPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tasks = useStoryboardImageTasks();
  const deletedTasks = useDeletedStoryboardImageTasks();
  const [viewMode, setViewMode] = useState<"active" | "completed" | "trash">("active");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const visibleTasks = viewMode === "completed" ? completedTasks : tasks;
  const returnTarget = getReturnTarget(searchParams.get("from"));

  function handleOpenTag(task: StoryboardImageTask, tag: VideoTaskTag) {
    if (task.novel?.id) {
      void switchCurrentNovelFromBackend(task.novel.id);
    }
    navigate(withReturnSource(tag.route, "storyboard-images"));
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Storyboard Images"
        title="分镜图片管理"
        description="管理由分镜生成的参考图片任务，并把分镜图片接入视频生成。"
      />
      {returnTarget ? (
        <button className="floating-return-button" type="button" onClick={() => navigate(returnTarget.path)}>
          <ArrowLeft size={16} />
          返回{returnTarget.label}
        </button>
      ) : null}

      <div className="video-management-summary animate-in">
        <button className={`metric-card metric-button${viewMode === "active" ? " active" : ""}`} type="button" onClick={() => setViewMode("active")}>
          <span>图片任务</span>
          <strong>{tasks.length}</strong>
        </button>
        <button className={`metric-card metric-button${viewMode === "completed" ? " active" : ""}`} type="button" onClick={() => setViewMode("completed")}>
          <span>已完成</span>
          <strong>{completedTasks.length}</strong>
        </button>
        <button className={`metric-card metric-button${viewMode === "trash" ? " active" : ""}`} type="button" onClick={() => setViewMode("trash")}>
          <span>回收箱</span>
          <strong>{deletedTasks.length}</strong>
        </button>
      </div>

      {viewMode !== "trash" ? (
        <div className="panel animate-in">
          <div className="section-title management-title">
            <h2>{viewMode === "completed" ? "已完成分镜图片" : "分镜图片任务"}</h2>
            <Link className="ghost-button" to="/storyboard-image-generation">
              <ImagePlus size={16} />
              新建分镜图片
            </Link>
          </div>

          {visibleTasks.length ? (
            <div className="storyboard-image-list">
              {visibleTasks.map((task) => {
                const imageUrl = getPreferredStoryboardImageUrl(task);
                const isLocalImage = isLocalGeneratedMediaTask(task);
                return (
                  <article className="video-management-card storyboard-image-card" key={task.id}>
                    <div className="storyboard-image-preview">
                      {imageUrl ? <img src={imageUrl} alt={task.title} loading="lazy" /> : <span>待生成图片</span>}
                    </div>
                    <div className="storyboard-image-card-body">
                      <div className="video-management-header">
                        <div>
                          <span>{statusText(task.status)}</span>
                          <h3>{task.title}</h3>
                          <small>{task.model} · {formatDateTime(task.updatedAt)}</small>
                        </div>
                      </div>
                      <p>{task.prompt.slice(0, 180) || "暂无提示词"}</p>
                      <div className="video-management-meta">
                        <span>{task.localImagePath ? "已保存到本地目录" : "暂无本地文件"}</span>
                        <span>{task.originalImageUrl ? "保留原始远端地址" : "无远端地址"}</span>
                      </div>
                      <div className="video-tag-row">
                        {task.novel ? <TagButton icon="novel" label={`小说：${task.novel.label}`} onClick={() => handleOpenTag(task, task.novel!)} /> : null}
                        {task.scene ? <TagButton icon="scene" label={`场景：${task.scene.label}`} onClick={() => handleOpenTag(task, task.scene!)} /> : null}
                        {task.shot ? <TagButton icon="shot" label={`分镜：${task.shot.label}`} onClick={() => handleOpenTag(task, task.shot!)} /> : null}
                        {!task.novel && !task.scene && !task.shot ? (
                          <span className="video-static-tag">
                            <Tags size={14} />
                            未关联项目标签
                          </span>
                        ) : null}
                      </div>
                      <div className="toolbar">
                        {imageUrl ? (
                          <a className="ghost-button" href={imageUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={16} />
                            {isLocalImage ? "打开本地图片" : "打开图片"}
                          </a>
                        ) : null}
                        <button className="ghost-button" type="button" onClick={() => navigate("/video-generation?from=storyboard-images")}>
                          <Film size={16} />
                          用于视频生成
                        </button>
                        <button className="ghost-button danger" type="button" onClick={() => moveStoryboardImageTaskToTrash(task.id)}>
                          <Trash2 size={16} />
                          删除到回收箱
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <article className="compact-card">
              <strong>{viewMode === "completed" ? "暂无已完成分镜图片" : "暂无分镜图片任务"}</strong>
              <p>{viewMode === "completed" ? "生成完成的分镜图片会显示在这里。" : "请先进入分镜生图页，选择场景分镜并保存图片任务。"}</p>
            </article>
          )}
        </div>
      ) : (
        <div className="panel animate-in">
          <div className="section-title">
            <h2>回收箱</h2>
            <small>逻辑删除后保留 7 天，到期自动清理</small>
          </div>
          {deletedTasks.length ? (
            <div className="video-task-list">
              {deletedTasks.map((task) => (
                <article className="video-management-card deleted-card" key={task.id}>
                  <div className="video-management-header">
                    <div>
                      <span>已删除</span>
                      <h3>{task.title}</h3>
                      <small>到期时间：{formatDateTime(task.expiresAt ?? "")}</small>
                    </div>
                  </div>
                  <div className="toolbar">
                    <button className="ghost-button" type="button" onClick={() => restoreStoryboardImageTask(task.id)}>
                      <RotateCcw size={16} />
                      恢复
                    </button>
                    <button className="ghost-button danger" type="button" onClick={() => deleteStoryboardImageTaskPermanently(task.id)}>
                      <XCircle size={16} />
                      彻底删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="compact-card">
              <strong>回收箱为空</strong>
              <p>删除的分镜图片任务会先放入这里，并在过期后自动清理。</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function TagButton({ icon, label, onClick }: { icon: "novel" | "scene" | "shot"; label: string; onClick: () => void }) {
  const Icon = icon === "novel" ? BookOpen : icon === "scene" ? Clapperboard : Layers;
  return (
    <button className="video-link-tag" type="button" onClick={onClick}>
      <Icon size={14} />
      {label}
    </button>
  );
}

function statusText(status: StoryboardImageTask["status"]) {
  const labels: Record<StoryboardImageTask["status"], string> = {
    draft: "草稿",
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  };
  return labels[status];
}

function isLocalGeneratedMediaTask(task: StoryboardImageTask) {
  return getPreferredStoryboardImageUrl(task).includes("/media/generated/");
}

function withReturnSource(route: string, source: string) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}from=${source}`;
}

function getReturnTarget(from: string | null) {
  const targets: Record<string, { path: string; label: string }> = {
    "video-management": { path: "/video-management", label: "视频管理" }
  };
  return from ? targets[from] : undefined;
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
