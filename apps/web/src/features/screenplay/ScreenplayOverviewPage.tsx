import { Download, FileText } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { getScreenplayDraft } from "../../shared/screenplayDraft";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";
import { useMemo, useState } from "react";

export function ScreenplayOverviewPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const [statusMessage, setStatusMessage] = useState("剧本总览会读取本地已保存的场景剧本。");
  const draft = useMemo(() => getScreenplayDraft(), []);
  const completedScenes = draft?.scenes.filter((scene) => scene.content.trim().length > 0).length ?? 0;

  async function handleExport() {
    if (!draft) {
      setStatusMessage("暂无可导出的剧本草稿。");
      return;
    }

    try {
      const yaml = await studioApi.exportScreenplay(draft);
      const blob = new Blob([yaml], { type: "application/x-yaml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.title || "screenplay"}.yaml`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage("剧本 YAML 已导出。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "剧本导出失败。");
    }
  }

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Screenplay Overview"
        title="剧本总览"
        description="查看已保存的场景剧本，统一导出为 YAML，后续可扩展为完整剧本审阅与版本管理。"
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
                导出 YAML
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
                <article className="compact-card" key={scene.sceneId}>
                  <strong>
                    {index + 1}. {scene.title}
                  </strong>
                  <p>
                    {scene.location} · {scene.timeOfDay} · {scene.dramaticFunction}
                  </p>
                  <small>{scene.content.trim() ? `${scene.content.trim().length} 字` : "尚未编写"}</small>
                </article>
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
