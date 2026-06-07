import { useCallback, useEffect, useState } from "react";
import type { VideoTaskTag } from "./videoTasks";

const STORAGE_KEY = "novel-to-screenplay.storyboardImages";
const TRASH_RETENTION_DAYS = 7;

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
  const tasks = getAllStoryboardImageTasks().filter((item) => item.id !== task.id);
  writeTasks([task, ...tasks]);
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
  const [tasks, setTasks] = useState<StoryboardImageTask[]>(() => getStoryboardImageTasks());

  const refresh = useCallback(() => {
    setTasks(getStoryboardImageTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("storyboard-images-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("storyboard-images-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

export function useDeletedStoryboardImageTasks() {
  const [tasks, setTasks] = useState<StoryboardImageTask[]>(() => getDeletedStoryboardImageTasks());

  const refresh = useCallback(() => {
    setTasks(getDeletedStoryboardImageTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("storyboard-images-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("storyboard-images-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}

function purgeExpiredTasks(tasks: StoryboardImageTask[]) {
  const now = Date.now();
  return tasks.filter((task) => !task.expiresAt || new Date(task.expiresAt).getTime() > now);
}

function writeTasks(tasks: StoryboardImageTask[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent("storyboard-images-updated"));
}
