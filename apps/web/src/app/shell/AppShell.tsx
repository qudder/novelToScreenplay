import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, Clapperboard, FileText, GitBranch, Layers, Upload, Users } from "lucide-react";
import { studioApi } from "../../shared/api";
import { getCurrentNovel, saveCurrentNovel } from "../../shared/currentNovel";
import type { CurrentNovel } from "../../shared/types";

const navItems = [
  { to: "/import", label: "小说导入", icon: Upload },
  { to: "/characters", label: "角色管理", icon: Users },
  { to: "/relationships", label: "人物关系图", icon: GitBranch },
  { to: "/timeline", label: "事件时间线", icon: BookOpen },
  { to: "/scenes", label: "场景拆分板", icon: Layers },
  { to: "/screenplay", label: "剧本生成", icon: Clapperboard },
  { to: "/screenplay-overview", label: "剧本总览", icon: FileText }
];

export function AppShell() {
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let lastRefreshKey = "";

    async function refreshStoredAnalysis() {
      const currentNovel = getCurrentNovel();
      if (!currentNovel?.documentId) {
        return;
      }
      const refreshKey = `${currentNovel.documentId}:${currentNovel.analysisStatus ?? "idle"}`;
      if (refreshKey === lastRefreshKey && currentNovel.analysisStatus !== "running") {
        return;
      }
      lastRefreshKey = refreshKey;

      try {
        const documentResult = await getOrRestoreDocument(currentNovel);
        if (cancelled) {
          return;
        }

        const persistedNovel = mergeDocumentResult(currentNovel, documentResult);
        saveCurrentNovel(persistedNovel);

        const result = await studioApi.getDocumentAnalysis(currentNovel.documentId);
        if (cancelled) {
          return;
        }

        const updatedNovel = mergeAnalysisResult(persistedNovel, result);
        saveCurrentNovel(updatedNovel);

        if (result.status === "running") {
          timer = window.setTimeout(refreshStoredAnalysis, 2000);
        }
      } catch {
        // 后端不可用或内存文档过期时，继续保留浏览器本地快照。
      }
    }

    refreshStoredAnalysis();
    window.addEventListener("current-novel-updated", refreshStoredAnalysis);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
      window.removeEventListener("current-novel-updated", refreshStoredAnalysis);
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">剧</span>
          <div>
            <strong>小说转剧本</strong>
            <small>Adaptation Studio</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-link">
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}

async function getOrRestoreDocument(currentNovel: CurrentNovel) {
  try {
    return await studioApi.getDocument(currentNovel.documentId ?? "");
  } catch (error) {
    if (!canRestoreDocument(currentNovel)) {
      throw error;
    }
    return studioApi.restoreDocument(currentNovel);
  }
}

function canRestoreDocument(currentNovel: CurrentNovel): boolean {
  return Boolean(currentNovel.documentId && currentNovel.filename && currentNovel.sourceText && currentNovel.chapters.length > 0);
}

function mergeAnalysisResult(
  currentNovel: CurrentNovel,
  result: Awaited<ReturnType<typeof studioApi.getDocumentAnalysis>>
): CurrentNovel {
  const updatedNovel: CurrentNovel = {
    ...currentNovel,
    documentId: result.documentId,
    analysisStatus: result.status,
    message: result.message || currentNovel.message
  };

  if (result.status !== "completed") {
    return updatedNovel;
  }

  return {
    ...updatedNovel,
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
    emptyChapterIds: result.emptyChapterIds
  };
}

function mergeDocumentResult(
  currentNovel: CurrentNovel,
  result: Awaited<ReturnType<typeof studioApi.getDocument>>
): CurrentNovel {
  return {
    ...currentNovel,
    documentId: result.documentId,
    filename: result.filename,
    message: result.message || currentNovel.message,
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
    subScenes: result.subScenes
  };
}
