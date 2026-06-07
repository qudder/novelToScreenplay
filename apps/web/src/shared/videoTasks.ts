import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "novel-to-screenplay.videoTasks";

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
  storyboardImage?: VideoTaskTag;
  videoUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export function getVideoTasks(): VideoTask[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const tasks = JSON.parse(raw) as VideoTask[];
    return tasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function saveVideoTask(task: VideoTask) {
  const tasks = getVideoTasks().filter((item) => item.id !== task.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([task, ...tasks]));
  window.dispatchEvent(new CustomEvent("video-tasks-updated"));
}

export function useVideoTasks() {
  const [tasks, setTasks] = useState<VideoTask[]>(() => getVideoTasks());

  const refresh = useCallback(() => {
    setTasks(getVideoTasks());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("video-tasks-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("video-tasks-updated", refresh);
    };
  }, [refresh]);

  return tasks;
}
