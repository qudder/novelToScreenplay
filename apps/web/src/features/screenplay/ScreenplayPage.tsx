import { PageHeader } from "../../shared/PageHeader";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

const sourceText = `林舟坐在茶馆靠窗的位置，看见沈青进门时，手指不自觉地停在茶盏边缘。她没有看他，只向罗掌柜点了点头。雨声从檐外落下，把两人的沉默衬得格外清楚。`;

const screenplayDraft = `内景 茶馆 - 夜

雨声压在檐外。

林舟坐在靠窗的位置，手指轻敲茶盏。沈青推门而入，没有看他。

林舟
你昨夜去了哪里？

沈青停下，目光落在罗掌柜身上。

沈青
你不该问这个。`;

export function ScreenplayPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Screenplay Draft"
        title="剧本生成"
        description="左侧保留来源原文，右侧生成剧本格式，并允许人工继续修改。"
      />
      <div className="editor-layout">
        <div className="panel animate-in">
          <h2>来源原文</h2>
          <p className="source-text">{sourceText}</p>
        </div>
        <div className="panel animate-in">
          <h2>剧本初稿</h2>
          <textarea className="screenplay-editor" defaultValue={screenplayDraft} />
        </div>
      </div>
    </section>
  );
}

