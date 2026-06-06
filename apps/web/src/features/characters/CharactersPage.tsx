import { Merge, SortDesc } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { characters } from "../../shared/mockData";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function CharactersPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const sortedCharacters = [...characters].sort((a, b) => b.importance - a.importance);

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Character Intelligence"
        title="角色管理"
        description="管理人物卡片、别名合并和重要性排序，为人物关系图和剧本改写提供基础。"
      />
      <div className="toolbar animate-in">
        <button className="ghost-button" type="button">
          <Merge size={16} />
          合并别名
        </button>
        <button className="ghost-button" type="button">
          <SortDesc size={16} />
          按重要性排序
        </button>
      </div>
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
          </article>
        ))}
      </div>
    </section>
  );
}

