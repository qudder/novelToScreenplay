import { useCallback, useEffect, useState } from "react";
import { studioApi, type DocumentSummary, type MappedImportResult } from "./api";
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

let backendSyncPromise: Promise<void> | null = null;

type CurrentNovelUpdateSource = "user" | "background-sync";

type SaveCurrentNovelOptions = {
  source?: CurrentNovelUpdateSource;
  preserveLibraryUpdatedAt?: boolean;
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

export function saveCurrentNovel(novel: CurrentNovel, options: SaveCurrentNovelOptions = {}) {
  if (!novel.documentId) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(novel));
    emitCurrentNovelUpdated(options.source);
    return;
  }

  const normalizedNovel = normalizeCurrentNovel(novel);
  window.localStorage.setItem(novelStorageKey(novel.documentId), JSON.stringify(normalizedNovel));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedNovel));
  window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, novel.documentId);
  upsertLibraryItem(normalizedNovel, options);
  emitCurrentNovelUpdated(options.source);
}

export async function syncCurrentNovelFromBackend(options: { force?: boolean } = {}) {
  if (backendSyncPromise && !options.force) return backendSyncPromise;
  backendSyncPromise = syncCurrentNovelFromBackendOnce(options.force ?? false).finally(() => {
    backendSyncPromise = null;
  });
  return backendSyncPromise;
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

export async function switchCurrentNovelFromBackend(documentId: string): Promise<CurrentNovel | null> {
  const localNovel = switchCurrentNovel(documentId);
  if (localNovel && !isNovelIncomplete(localNovel)) {
    return localNovel;
  }

  try {
    const restored = await studioApi.getDocument(documentId);
    const novel = mapBackendDocumentToCurrentNovel(restored);
    saveCurrentNovel(novel);
    return novel;
  } catch {
    return localNovel;
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
    syncCurrentNovelFromBackend().then(refresh).catch(() => undefined);
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
    };
  }, [refresh]);

  return items;
}

function emitCurrentNovelUpdated(source: CurrentNovelUpdateSource = "user") {
  window.dispatchEvent(new CustomEvent("current-novel-updated", { detail: { source } }));
}

export function useCurrentNovel() {
  const [novel, setNovel] = useState<CurrentNovel | null>(() => getCurrentNovel());

  const refresh = useCallback(() => {
    setNovel(getCurrentNovel());
  }, []);

  useEffect(() => {
    syncCurrentNovelFromBackend().then(refresh).catch(() => undefined);
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
    characters: (novel.characters ?? []).map((character) => ({
      ...character,
      costumes: character.costumes ?? []
    })),
    environments: novel.environments ?? [],
    shotPlans: novel.shotPlans ?? [],
    narrativeBlocks: novel.narrativeBlocks ?? [],
    subScenes: (novel.subScenes ?? []).map((subScene) => ({
      ...subScene,
      shotIds: subScene.shotIds ?? [],
      sceneInfo: subScene.sceneInfo
    }))
  };
}

async function syncCurrentNovelFromBackendOnce(force: boolean) {
  const localNovel = getCurrentNovel();
  const localLibrary = getNovelLibrary();
  const shouldLoadLibrary = force || localLibrary.length === 0;
  const shouldRepairCurrent = force || !localNovel || isNovelIncomplete(localNovel);

  if (!shouldLoadLibrary && !shouldRepairCurrent) return;

  const summaries = await studioApi.listDocuments();
  if (!summaries.length) return;

  if (shouldLoadLibrary) {
    writeBackendLibraryItems(summaries);
  }

  const targetDocumentId = localNovel?.documentId || getActiveNovelId() || summaries[0].documentId;
  if (!shouldRepairCurrent && window.localStorage.getItem(novelStorageKey(targetDocumentId))) return;

  const restored = await studioApi.getDocument(targetDocumentId);
  saveCurrentNovel(mapBackendDocumentToCurrentNovel(restored));
}

function isNovelIncomplete(novel: CurrentNovel) {
  if (!novel.documentId || !novel.sourceText || !novel.chapters?.length) return true;
  const analysisCompleted = novel.analysisStatus === "completed";
  if (!analysisCompleted) return false;
  return !novel.characters?.length && !novel.events?.length && !novel.scenes?.length && !novel.subScenes?.length;
}

function writeBackendLibraryItems(summaries: DocumentSummary[]) {
  const existingItems = getNovelLibrary();
  const existingMap = new Map(existingItems.map((item) => [item.documentId, item]));
  const now = new Date().toISOString();
  const backendItems = summaries.map((summary) => {
    const existing = existingMap.get(summary.documentId);
    return {
      documentId: summary.documentId,
      filename: summary.filename,
      message: summary.message,
      analysisStatus: summary.analysisStatus,
      chapterCount: summary.chapterCount,
      characterCount: summary.characterCount,
      eventCount: summary.eventCount,
      sceneCount: summary.sceneCount,
      importedAt: existing?.importedAt ?? now,
      updatedAt: existing?.updatedAt ?? now
    };
  });
  const backendIds = new Set(backendItems.map((item) => item.documentId));
  const mergedItems = [...backendItems, ...existingItems.filter((item) => !backendIds.has(item.documentId))];
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(mergedItems));
  if (!getActiveNovelId() && backendItems[0]) {
    window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, backendItems[0].documentId);
  }
  emitCurrentNovelUpdated();
}

function mapBackendDocumentToCurrentNovel(result: MappedImportResult): CurrentNovel {
  return {
    documentId: result.documentId,
    analysisStatus: hasAnalysisPayload(result) ? "completed" : "idle",
    filename: result.filename,
    message: result.message,
    sourceText: result.sourceText,
    chapters: result.chapters,
    characters: result.characters,
    locations: result.locations,
    environments: result.environments,
    shotPlans: result.shotPlans,
    timeMarkers: result.timeMarkers,
    events: result.events,
    relationships: result.relationships,
    conflicts: result.conflicts,
    dialogues: result.dialogues,
    actions: result.actions,
    motivations: result.motivations,
    causalLinks: result.causalLinks,
    scenes: result.scenes,
    narrativeBlocks: result.narrativeBlocks,
    subScenes: result.subScenes,
    emptyChapterIds: result.emptyChapterIds,
    importedAt: new Date().toISOString()
  };
}

function hasAnalysisPayload(result: MappedImportResult) {
  return Boolean(
    result.characters.length ||
      result.locations.length ||
      result.environments.length ||
      result.shotPlans.length ||
      result.timeMarkers.length ||
      result.events.length ||
      result.relationships.length ||
      result.conflicts.length ||
      result.dialogues.length ||
      result.actions.length ||
      result.motivations.length ||
      result.causalLinks.length ||
      result.scenes.length ||
      result.narrativeBlocks.length ||
      result.subScenes.length
  );
}

function novelStorageKey(documentId: string) {
  return `novel-to-screenplay.novel.${documentId}`;
}

function upsertLibraryItem(novel: CurrentNovel, options: SaveCurrentNovelOptions = {}) {
  if (!novel.documentId) return;
  const items = getNovelLibrary().filter((item) => item.documentId !== novel.documentId);
  const existing = getNovelLibrary().find((item) => item.documentId === novel.documentId);
  const now = new Date().toISOString();
  const importedAt = novel.importedAt || existing?.importedAt || now;
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
    updatedAt: options.preserveLibraryUpdatedAt ? existing?.updatedAt ?? now : now
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
