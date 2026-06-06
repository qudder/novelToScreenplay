import { Merge, SortDesc } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { characters as mockCharacters } from "../../shared/mockData";
import { useCurrentNovel } from "../../shared/currentNovel";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function CharactersPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const currentNovel = useCurrentNovel();
  const visibleCharacters = currentNovel ? currentNovel.characters : mockCharacters;
  const sortedCharacters = [...visibleCharacters].sort((a, b) => b.importance - a.importance);

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Character Intelligence"
        title="角色管理"
        description="管理人物卡片、别名合并和重要性排序，为人物关系图和剧本改写提供基础。"
      />
      <div className="toolbar animate-in">
        {currentNovel ? (
          <div className="current-novel-banner inline-banner">
            当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"} ·{" "}
            {sortedCharacters.length} 个角色候选
          </div>
        ) : null}
        <button className="ghost-button" type="button">
          <Merge size={16} />
          合并别名
        </button>
        <button className="ghost-button" type="button">
          <SortDesc size={16} />
          按重要性排序
        </button>
      </div>
      {sortedCharacters.length > 0 ? (
        <div className="card-grid">
          {sortedCharacters.map((character) => (
            <article className="character-card animate-in" key={character.id}>
              <div className="card-topline">
                <strong>{character.name}</strong>
                <span>{character.importance}</span>
              </div>
              <p>{character.description}</p>
              <div className="tag-row">
                <span>{character.role}</span>
                {character.aliases.map((alias) => (
                  <span key={alias}>{alias}</span>
                ))}
              </div>
              <small className="appearance-line">
                出场章节：{character.appearances.length > 0 ? character.appearances.join("、") : "待分析"}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel animate-in empty-section">
          <strong>等待叙事分析</strong>
          <p>当前小说已经导入，但还没有角色分析结果。请在“小说导入”页启动叙事分析。</p>
        </div>
      )}
    </section>
  );
}

