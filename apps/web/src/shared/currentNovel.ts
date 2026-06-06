import { useCallback, useEffect, useState } from "react";
import type { CurrentNovel } from "./types";

const STORAGE_KEY = "novel-to-screenplay.currentNovel";
const LIBRARY_STORAGE_KEY = "novel-to-screenplay.novelLibrary";
const ACTIVE_ID_STORAGE_KEY = "novel-to-screenplay.activeNovelId";

export type NovelLibraryItem = {
  documentId: string;
  filename: string;
  message: string;
  analysisStatus: CurrentNovel["analysisStatus"];
  chapterCount: number;
  characterCount: number;
  eventCount: number;
  sceneCount: number;
  importedAt: string;
  updatedAt: string;
};

export function getCurrentNovel(): CurrentNovel | null {
  migrateLegacyCurrentNovel();
  const activeId = getActiveNovelId();
  const raw = activeId ? window.localStorage.getItem(novelStorageKey(activeId)) : window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeCurrentNovel(JSON.parse(raw) as CurrentNovel);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveCurrentNovel(novel: CurrentNovel) {
  if (!novel.documentId) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(novel));
    emitCurrentNovelUpdated();
    return;
  }

  const normalizedNovel = normalizeCurrentNovel(novel);
  window.localStorage.setItem(novelStorageKey(novel.documentId), JSON.stringify(normalizedNovel));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedNovel));
  window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, novel.documentId);
  upsertLibraryItem(normalizedNovel);
  emitCurrentNovelUpdated();
}

export function getNovelLibrary(): NovelLibraryItem[] {
  migrateLegacyCurrentNovel();
  const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const items = JSON.parse(raw) as NovelLibraryItem[];
    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    window.localStorage.removeItem(LIBRARY_STORAGE_KEY);
    return [];
  }
}

export function getActiveNovelId() {
  return window.localStorage.getItem(ACTIVE_ID_STORAGE_KEY) || "";
}

export function switchCurrentNovel(documentId: string): CurrentNovel | null {
  const raw = window.localStorage.getItem(novelStorageKey(documentId));
  if (!raw) return null;

  try {
    const novel = normalizeCurrentNovel(JSON.parse(raw) as CurrentNovel);
    window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, documentId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(novel));
    emitCurrentNovelUpdated();
    return novel;
  } catch {
    window.localStorage.removeItem(novelStorageKey(documentId));
    removeLibraryItem(documentId);
    return null;
  }
}

export function removeNovelFromLibrary(documentId: string) {
  window.localStorage.removeItem(novelStorageKey(documentId));
  removeLibraryItem(documentId);
  if (getActiveNovelId() === documentId) {
    const nextNovel = getNovelLibrary()[0];
    if (nextNovel) {
      switchCurrentNovel(nextNovel.documentId);
      return;
    }
    window.localStorage.removeItem(ACTIVE_ID_STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    emitCurrentNovelUpdated();
  }
}

export function useNovelLibrary() {
  const [items, setItems] = useState<NovelLibraryItem[]>(() => getNovelLibrary());

  const refresh = useCallback(() => {
    setItems(getNovelLibrary());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
    };
  }, [refresh]);

  return items;
}

function emitCurrentNovelUpdated() {
  window.dispatchEvent(new CustomEvent("current-novel-updated"));
}

export function useCurrentNovel() {
  const [novel, setNovel] = useState<CurrentNovel | null>(() => getCurrentNovel());

  const refresh = useCallback(() => {
    setNovel(getCurrentNovel());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
    };
  }, [refresh]);

  return novel;
}

function normalizeCurrentNovel(novel: CurrentNovel): CurrentNovel {
  return {
    ...novel,
    environments: novel.environments ?? [],
    shotPlans: novel.shotPlans ?? [],
    narrativeBlocks: novel.narrativeBlocks ?? [],
    subScenes: (novel.subScenes ?? []).map((subScene) => ({
      ...subScene,
      shotIds: subScene.shotIds ?? []
    }))
  };
}

function novelStorageKey(documentId: string) {
  return `novel-to-screenplay.novel.${documentId}`;
}

function upsertLibraryItem(novel: CurrentNovel) {
  if (!novel.documentId) return;
  const items = getNovelLibrary().filter((item) => item.documentId !== novel.documentId);
  const now = new Date().toISOString();
  const importedAt = novel.importedAt || now;
  const item: NovelLibraryItem = {
    documentId: novel.documentId,
    filename: novel.filename,
    message: novel.message,
    analysisStatus: novel.analysisStatus ?? "idle",
    chapterCount: novel.chapters.length,
    characterCount: novel.characters.length,
    eventCount: novel.events.length,
    sceneCount: novel.subScenes?.length || novel.scenes.length,
    importedAt,
    updatedAt: now
  };
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify([item, ...items]));
}

function removeLibraryItem(documentId: string) {
  const items = getNovelLibrary().filter((item) => item.documentId !== documentId);
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
}

function migrateLegacyCurrentNovel() {
  const activeId = window.localStorage.getItem(ACTIVE_ID_STORAGE_KEY);
  if (activeId) return;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const novel = normalizeCurrentNovel(JSON.parse(raw) as CurrentNovel);
    if (!novel.documentId) return;
    window.localStorage.setItem(novelStorageKey(novel.documentId), JSON.stringify(novel));
    window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, novel.documentId);
    upsertLibraryItem(novel);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
