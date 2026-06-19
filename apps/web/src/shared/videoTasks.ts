import { useCallback, useEffect, useState } from "react";
import { getCurrentNovel } from "./currentNovel";

const STORAGE_KEY = "novel-to-screenplay.videoTasks";
const TRASH_RETENTION_DAYS = 7;

export type VideoTaskTag = {
  id: string;
  label: string;
  route: string;
};

export type VideoTask = {
  id: string;
  providerTaskId?: string;
  title: string;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  model: string;
  ratio: string;
  duration: string;
  resolution: string;
  prompt: string;
  negativePrompt: string;
  screenplayPreview: string;
  screenplayLength: number;
  assetCounts: {
    images: number;
    videos: number;
    audios: number;
  };
  novel?: VideoTaskTag;
  chapter?: VideoTaskTag;
  scene?: VideoTaskTag;
  shot?: VideoTaskTag;
  storyboardImage?: VideoTaskTag;
  storyboardImages?: VideoTaskTag[];
  videoUrl?: string;
  originalVideoUrl?: string;
  localVideoPath?: string;
  errorMessage?: string;
  deletedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function getVideoTasks(): VideoTask[] {
  return getAllVideoTasks().filter((task) => !task.deletedAt);
}

export function getDeletedVideoTasks(): VideoTask[] {
  return getAllVideoTasks().filter((task) => task.deletedAt);
}

function getAllVideoTasks(): VideoTask[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const tasks = JSON.parse(raw) as VideoTask[];
    const activeTasks = purgeExpiredTasks(tasks);
    if (activeTasks.length !== tasks.length) {
      writeTasks(activeTasks);
    }
    return activeTasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function saveVideoTask(task: VideoTask) {
  const taggedTask = ensureVideoTaskNovelTag(task);
  const tasks = getAllVideoTasks().filter((item) => item.id !== taggedTask.id);
  writeTasks([taggedTask, ...tasks]);
}

export function updateVideoTask(taskId: string, patch: Partial<VideoTask>) {
  const now = new Date().toISOString();
  const tasks = getAllVideoTasks().map((task) =>
    task.id === taskId
      ? {
          ...task,
          ...patch,
          updatedAt: now
        }
      : task
  );
  writeTasks(tasks);
}

export function moveVideoTaskToTrash(taskId: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tasks = getAllVideoTasks().map((task) =>
    task.id === taskId
      ? {
          ...task,
          deletedAt: now.toISOString(),
          expiresAt,
          updatedAt: now.toISOString()
        }
      : task
  );
  writeTasks(tasks);
}

export function restoreVideoTask(taskId: string) {
  const now = new Date().toISOString();
  const tasks = getAllVideoTasks().map((task) =>
    task.id === taskId
      ? {
          ...task,
          deletedAt: undefined,
          expiresAt: undefined,
          updatedAt: now
        }
      : task
  );
  writeTasks(tasks);
}

export function deleteVideoTaskPermanently(taskId: string) {
  writeTasks(getAllVideoTasks().filter((task) => task.id !== taskId));
}

export function useVideoTasks() {
  const [tasks, setTasks] = useState<VideoTask[]>(() => getCurrentNovelVideoTasks());

  const refresh = useCallback(() => {
    setTasks(getCurrentNovelVideoTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);
    window.addEventListener("video-tasks-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
      window.removeEventListener("video-tasks-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

export function useDeletedVideoTasks() {
  const [tasks, setTasks] = useState<VideoTask[]>(() => getCurrentNovelDeletedVideoTasks());

  const refresh = useCallback(() => {
    setTasks(getCurrentNovelDeletedVideoTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);
    window.addEventListener("video-tasks-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
      window.removeEventListener("video-tasks-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

function purgeExpiredTasks(tasks: VideoTask[]) {
  const now = Date.now();
  return tasks.filter((task) => !task.expiresAt || new Date(task.expiresAt).getTime() > now);
}

function getCurrentNovelVideoTasks() {
  return filterTasksForCurrentNovel(getVideoTasks());
}

function getCurrentNovelDeletedVideoTasks() {
  return filterTasksForCurrentNovel(getDeletedVideoTasks());
}

function filterTasksForCurrentNovel(tasks: VideoTask[]) {
  const currentNovel = getCurrentNovel();
  if (!currentNovel?.documentId) return [];
  return tasks.filter((task) => task.novel?.id === currentNovel.documentId);
}

function ensureVideoTaskNovelTag(task: VideoTask): VideoTask {
  if (task.novel) return task;
  const currentNovel = getCurrentNovel();
  if (!currentNovel?.documentId) return task;
  return {
    ...task,
    novel: {
      id: currentNovel.documentId,
      label: currentNovel.filename,
      route: "/import"
    }
  };
}

function writeTasks(tasks: VideoTask[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent("video-tasks-updated"));
}
