import { Download, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { useCurrentNovel } from "../../shared/currentNovel";
import { getScreenplayDraft } from "../../shared/screenplayDraft";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import { useEffect, useState } from "react";

export function ScreenplayOverviewPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const navigate = useNavigate();
  const [statusMessage, setStatusMessage] = useState("剧本总览会读取本地已保存的场景剧本。");
  const [draft, setDraft] = useState(() => getScreenplayDraft(currentNovel?.documentId));
  const completedScenes = draft?.scenes.filter((scene) => scene.content.trim().length > 0).length ?? 0;

  useEffect(() => {
    setDraft(getScreenplayDraft(currentNovel?.documentId));
  }, [currentNovel?.documentId]);

  async function handleExport() {
    if (!draft) {
      setStatusMessage("暂无可导出的剧本草稿。");
      return;
    }

    try {
      const screenplayText = await studioApi.exportScreenplay(draft);
      const blob = new Blob([screenplayText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.title || "screenplay"}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("完整剧本已导出。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "剧本导出失败。");
    }
  }

  function handleOpenSceneBoard(sceneId: string, blockId: string) {
    navigate(`/scenes?blockId=${encodeURIComponent(blockId)}&sceneId=${encodeURIComponent(sceneId)}`, {
      state: { blockId, sceneId }
    });
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Screenplay Overview"
        title="剧本总览"
        description="查看已保存的场景剧本，并导出生成的完整剧本。"
      />

      <div className="overview-layout">
        <div className="panel animate-in">
          <div className="section-title">
            <FileText size={18} />
            <h2>草稿信息</h2>
          </div>
          {draft ? (
            <div className="overview-summary">
              <strong>{draft.title}</strong>
              <p>来源文件：{draft.filename}</p>
              <p>
                已保存场景：{completedScenes} / {draft.scenes.length}
              </p>
              <p>更新时间：{new Date(draft.updatedAt).toLocaleString()}</p>
              <button className="primary-button" type="button" onClick={handleExport}>
                <Download size={16} />
                导出完整剧本
              </button>
              <small>{statusMessage}</small>
            </div>
          ) : (
            <div className="compact-card">
              <strong>暂无剧本草稿</strong>
              <p>请先在剧本生成页选择场景并保存剧本内容。</p>
            </div>
          )}
        </div>

        <div className="panel animate-in">
          <h2>场景总览</h2>
          <div className="overview-scene-list">
            {draft?.scenes.length ? (
              draft.scenes.map((scene, index) => (
                <button
                  className="compact-card clickable-card"
                  type="button"
                  key={scene.sceneId}
                  onClick={() => handleOpenSceneBoard(scene.sceneId, scene.blockId)}
                >
                  <strong>
                    {index + 1}. {scene.title}
                  </strong>
                  <p>
                    {scene.location} · {scene.timeOfDay} · {scene.dramaticFunction}
                  </p>
                  <small>{scene.content.trim() ? `${scene.content.trim().length} 字` : "尚未编写"}</small>
                </button>
              ))
            ) : (
              <article className="compact-card">
                <strong>暂无场景</strong>
                <p>剧本草稿创建后，场景会出现在这里。</p>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
