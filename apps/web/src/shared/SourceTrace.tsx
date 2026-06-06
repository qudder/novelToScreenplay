import type { SourceRef } from "./types";

type SourceTraceProps = {
  refs?: SourceRef[];
};

export function SourceTrace({ refs }: SourceTraceProps) {
  const ref = refs?.find((item) => item.evidence || item.chapterId);
  if (!ref) return null;

  const position =
    ref.startChar >= 0 && ref.endChar >= ref.startChar ? `${ref.startChar}-${ref.endChar}` : "待定位";

  return (
    <small className="source-trace">
      原文：{ref.chapterId || "未知章节"} · {position}
      {ref.evidence ? ` · ${ref.evidence}` : ""}
    </small>
  );
}
