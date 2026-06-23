import { useCallback, useEffect, useState } from "react";
import { getCurrentNovel } from "./currentNovel";
import type { VideoTaskTag } from "./videoTasks";

const STORAGE_KEY = "novel-to-screenplay.storyboardImages";
const TRASH_RETENTION_DAYS = 7;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type StoryboardImageTask = {
  id: string;
  providerTaskId?: string;
  title: string;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  model: string;
  prompt: string;
  negativePrompt: string;
  screenplayPreview: string;
  imageUrl?: string;
  originalImageUrl?: string;
  localImagePath?: string;
  media?: Record<string, unknown>;
  errorMessage?: string;
  novel?: VideoTaskTag;
  scene?: VideoTaskTag;
  shot?: VideoTaskTag;
  deletedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function getStoryboardImageTasks(): StoryboardImageTask[] {
  return getAllStoryboardImageTasks().filter((task) => !task.deletedAt);
}

export function getDeletedStoryboardImageTasks(): StoryboardImageTask[] {
  return getAllStoryboardImageTasks().filter((task) => task.deletedAt);
}

function getAllStoryboardImageTasks(): StoryboardImageTask[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const tasks = JSON.parse(raw) as StoryboardImageTask[];
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

export function saveStoryboardImageTask(task: StoryboardImageTask) {
  const taggedTask = ensureStoryboardImageNovelTag(task);
  const tasks = getAllStoryboardImageTasks().filter((item) => item.id !== taggedTask.id);
  writeTasks([taggedTask, ...tasks]);
}

export function moveStoryboardImageTaskToTrash(taskId: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tasks = getAllStoryboardImageTasks().map((task) =>
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

export function restoreStoryboardImageTask(taskId: string) {
  const now = new Date().toISOString();
  const tasks = getAllStoryboardImageTasks().map((task) =>
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

export function deleteStoryboardImageTaskPermanently(taskId: string) {
  writeTasks(getAllStoryboardImageTasks().filter((task) => task.id !== taskId));
}

export function useStoryboardImageTasks() {
  const [tasks, setTasks] = useState<StoryboardImageTask[]>(() => getCurrentNovelStoryboardImageTasks());

  const refresh = useCallback(() => {
    setTasks(getCurrentNovelStoryboardImageTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);
    window.addEventListener("storyboard-images-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
      window.removeEventListener("storyboard-images-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

export function useDeletedStoryboardImageTasks() {
  const [tasks, setTasks] = useState<StoryboardImageTask[]>(() => getCurrentNovelDeletedStoryboardImageTasks());

  const refresh = useCallback(() => {
    setTasks(getCurrentNovelDeletedStoryboardImageTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);
    window.addEventListener("storyboard-images-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
      window.removeEventListener("storyboard-images-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

export function getPreferredStoryboardImageUrl(task: StoryboardImageTask) {
  return getLocalGeneratedMediaUrl(task.localImagePath) || getMediaLocalUrl(task.media) || resolveApiAssetUrl(task.imageUrl ?? "");
}

export function getStoryboardImageReferenceUrl(task: StoryboardImageTask) {
  return getPreferredStoryboardImageUrl(task) || resolveApiAssetUrl(task.originalImageUrl ?? "");
}

export function hasStoryboardImageUrl(task: StoryboardImageTask) {
  return Boolean(getStoryboardImageReferenceUrl(task));
}

function purgeExpiredTasks(tasks: StoryboardImageTask[]) {
  const now = Date.now();
  return tasks.filter((task) => !task.expiresAt || new Date(task.expiresAt).getTime() > now);
}

function getCurrentNovelStoryboardImageTasks() {
  return filterTasksForCurrentNovel(getStoryboardImageTasks());
}

function getCurrentNovelDeletedStoryboardImageTasks() {
  return filterTasksForCurrentNovel(getDeletedStoryboardImageTasks());
}

function filterTasksForCurrentNovel(tasks: StoryboardImageTask[]) {
  const currentNovel = getCurrentNovel();
  if (!currentNovel?.documentId) return [];
  return tasks.filter((task) => task.novel?.id === currentNovel.documentId);
}

function ensureStoryboardImageNovelTag(task: StoryboardImageTask): StoryboardImageTask {
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

function getLocalGeneratedMediaUrl(localImagePath?: string) {
  if (!localImagePath) return "";
  const normalizedPath = localImagePath.replace(/\\/g, "/");
  const marker = "/generated_media/";
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex < 0) return "";
  const relativePath = normalizedPath.slice(markerIndex + marker.length);
  return resolveApiAssetUrl(`/media/generated/${relativePath}`);
}

function getMediaLocalUrl(media?: Record<string, unknown>) {
  const localUrl = typeof media?.local_url === "string" ? media.local_url : "";
  if (localUrl) return resolveApiAssetUrl(localUrl);
  const localPath = typeof media?.local_path === "string" ? media.local_path : "";
  return getLocalGeneratedMediaUrl(localPath);
}

function resolveApiAssetUrl(url: string) {
  if (!url || !url.startsWith("/")) return url;
  return `${API_BASE_URL}${url}`;
}

function writeTasks(tasks: StoryboardImageTask[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent("storyboard-images-updated"));
}
