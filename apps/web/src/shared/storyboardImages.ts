import { useCallback, useEffect, useState } from "react";
import type { VideoTaskTag } from "./videoTasks";

const STORAGE_KEY = "novel-to-screenplay.storyboardImages";

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
  errorMessage?: string;
  novel?: VideoTaskTag;
  scene?: VideoTaskTag;
  shot?: VideoTaskTag;
  createdAt: string;
  updatedAt: string;
};

export function getStoryboardImageTasks(): StoryboardImageTask[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const tasks = JSON.parse(raw) as StoryboardImageTask[];
    return tasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function saveStoryboardImageTask(task: StoryboardImageTask) {
  const tasks = getStoryboardImageTasks().filter((item) => item.id !== task.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([task, ...tasks]));
  window.dispatchEvent(new CustomEvent("storyboard-images-updated"));
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
