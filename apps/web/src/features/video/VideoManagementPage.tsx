import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Clapperboard, ExternalLink, Film, ImagePlus, Layers, RefreshCw, RotateCcw, Tags, Trash2, XCircle } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { switchCurrentNovelFromBackend } from "../../shared/currentNovel";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import {
  deleteVideoTaskPermanently,
  moveVideoTaskToTrash,
  restoreVideoTask,
  type VideoTask,
  type VideoTaskTag,
  updateVideoTask,
  useDeletedVideoTasks,
  useVideoTasks
} from "../../shared/videoTasks";

export function VideoManagementPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const navigate = useNavigate();
  const tasks = useVideoTasks();
  const deletedTasks = useDeletedVideoTasks();
  const [viewMode, setViewMode] = useState<"active" | "completed" | "trash">("active");
  const [syncMessage, setSyncMessage] = useState("打开页面后会自动同步未完成或缺少本地文件的视频任务。");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const visibleTasks = viewMode === "completed" ? completedTasks : tasks;

  useEffect(() => {
    const pendingTasks = tasks.filter((task) => task.providerTaskId && task.status !== "failed" && (task.status !== "completed" || !task.localVideoPath));
    if (!pendingTasks.length) return;

    let cancelled = false;
    async function syncPendingTasks() {
      setSyncMessage(`正在同步 ${pendingTasks.length} 个视频任务...`);
      let updatedCount = 0;
      for (const task of pendingTasks) {
        if (!task.providerTaskId || cancelled) continue;
        try {
          const result = await studioApi.getSeedanceVideoTask(task.providerTaskId);
          if (cancelled) return;
          updateVideoTask(task.id, {
            status: result.status,
            model: result.model || task.model,
            videoUrl: result.videoUrl || task.videoUrl,
            originalVideoUrl: result.originalVideoUrl || task.originalVideoUrl,
            localVideoPath: result.localVideoPath || task.localVideoPath,
            errorMessage: result.errorMessage || task.errorMessage
          });
          updatedCount += 1;
        } catch (error) {
          updateVideoTask(task.id, {
            errorMessage: error instanceof Error ? error.message : "同步视频任务状态失败。"
          });
        }
      }
      if (!cancelled) {
        setSyncMessage(updatedCount ? `已同步 ${updatedCount} 个视频任务状态。` : "暂无可同步的视频任务结果。");
      }
    }

    void syncPendingTasks();
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  function handleOpenTag(task: VideoTask, tag: VideoTaskTag) {
    if (task.novel?.id) {
      void switchCurrentNovelFromBackend(task.novel.id);
    }
    navigate(withReturnSource(tag.route, "video-management"));
  }

  async function handleRefreshTask(task: VideoTask) {
    if (!task.providerTaskId) {
      setSyncMessage("该任务没有远端任务 ID，无法同步。");
      return;
    }
    setSyncMessage(`正在同步视频任务：${task.title}`);
    try {
      const result = await studioApi.getSeedanceVideoTask(task.providerTaskId);
      updateVideoTask(task.id, {
        status: result.status,
        model: result.model || task.model,
        videoUrl: result.videoUrl || task.videoUrl,
        originalVideoUrl: result.originalVideoUrl || task.originalVideoUrl,
        localVideoPath: result.localVideoPath || task.localVideoPath,
        errorMessage: result.errorMessage || task.errorMessage
      });
      setSyncMessage(`视频任务已同步：${task.title}`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同步视频任务状态失败。");
    }
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Video Tasks"
        title="视频管理"
        description="管理从小说、章节和场景剧本生成的视频任务，点击标签可回到对应流程页面。"
      />

      <div className="video-management-summary animate-in">
        <button className={`metric-card metric-button${viewMode === "active" ? " active" : ""}`} type="button" onClick={() => setViewMode("active")}>
          <span>任务总数</span>
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

      <p className="status-copy">{syncMessage}</p>

      {viewMode !== "trash" ? (
        <div className="panel animate-in">
          <div className="section-title management-title">
            <h2>{viewMode === "completed" ? "已完成视频" : "视频任务"}</h2>
            <Link className="ghost-button" to="/video-generation">
              <Film size={16} />
              新建视频
            </Link>
          </div>

          {visibleTasks.length ? (
            <div className="video-task-list">
              {visibleTasks.map((task) => (
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

                  {task.videoUrl ? (
                    <video className="video-result-preview" src={task.videoUrl} controls preload="metadata" />
                  ) : (
                    <p>{task.screenplayPreview || "暂无剧本预览"}</p>
                  )}

                  {task.errorMessage ? <p className="error-copy">{task.errorMessage}</p> : null}

                  <div className="video-tag-row">
                    {task.novel ? <TagButton icon="novel" label={`小说：${task.novel.label}`} onClick={() => handleOpenTag(task, task.novel!)} /> : null}
                    {task.chapter ? <TagButton icon="chapter" label={`章节：${task.chapter.label}`} onClick={() => handleOpenTag(task, task.chapter!)} /> : null}
                    {task.scene ? <TagButton icon="scene" label={`场景：${task.scene.label}`} onClick={() => handleOpenTag(task, task.scene!)} /> : null}
                    {task.shot ? <TagButton icon="shot" label={`镜头：${task.shot.label}`} onClick={() => handleOpenTag(task, task.shot!)} /> : null}
                    {(task.storyboardImages?.length ? task.storyboardImages : task.storyboardImage ? [task.storyboardImage] : []).map((storyboardImage) => (
                      <TagButton key={storyboardImage.id} icon="image" label={`分镜图片：${storyboardImage.label}`} onClick={() => handleOpenTag(task, storyboardImage)} />
                    ))}
                    {!task.novel && !task.chapter && !task.scene && !task.shot && !task.storyboardImage && !task.storyboardImages?.length ? (
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
                    <span>{task.localVideoPath ? "已保存到本地目录" : "暂无本地视频文件"}</span>
                  </div>
                  <div className="toolbar">
                    {task.videoUrl ? (
                      <a className="ghost-button" href={task.videoUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} />
                        打开视频
                      </a>
                    ) : null}
                    {task.providerTaskId ? (
                      <button className="ghost-button" type="button" onClick={() => handleRefreshTask(task)}>
                        <RefreshCw size={16} />
                        同步状态
                      </button>
                    ) : null}
                    <button className="ghost-button danger" type="button" onClick={() => moveVideoTaskToTrash(task.id)}>
                      <Trash2 size={16} />
                      删除到回收箱
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="compact-card">
              <strong>{viewMode === "completed" ? "暂无已完成视频" : "暂无视频任务"}</strong>
              <p>{viewMode === "completed" ? "完成的视频任务会显示在这里。" : "请先在视频生成页导入剧本和素材，并创建一个视频任务。"}</p>
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
                    <button className="ghost-button" type="button" onClick={() => restoreVideoTask(task.id)}>
                      <RotateCcw size={16} />
                      恢复
                    </button>
                    <button className="ghost-button danger" type="button" onClick={() => deleteVideoTaskPermanently(task.id)}>
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
              <p>删除的视频任务会先放入这里，并在过期后自动清理。</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function TagButton({ icon, label, onClick }: { icon: "novel" | "chapter" | "scene" | "shot" | "image"; label: string; onClick: () => void }) {
  const Icon = icon === "novel" ? BookOpen : icon === "chapter" ? Layers : icon === "scene" ? Clapperboard : icon === "shot" ? Film : ImagePlus;
  return (
    <button className="video-link-tag" type="button" onClick={onClick}>
      <Icon size={14} />
      {label}
    </button>
  );
}

function statusText(status: VideoTask["status"]) {
  const labels: Record<VideoTask["status"], string> = {
    draft: "草稿",
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  };
  return labels[status];
}

function withReturnSource(route: string, source: string) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}from=${source}`;
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
