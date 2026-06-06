# 面向剧本生成的信息抽取数据集

## 目标

本数据集服务于“小说转剧本”的后续生成流程。它不只是抽取人物和事件，而是抽取能被改编成剧本场景、动作、对白和角色弧光的结构化信息。

同时，每个关键对象必须能定位回小说原文：

- 角色 `Character`
- 事件 `Event`
- 场景候选 `Scene`

## 核心设计

### SourceRef

所有需要原文定位的对象都使用统一结构：

```json
{
  "chapter_id": "chapter-1",
  "start_char": 120,
  "end_char": 168,
  "evidence": "原文中的连续短句"
}
```

字段说明：

- `chapter_id`：来源章节。
- `start_char`：证据在章节正文中的起始字符位置。
- `end_char`：证据在章节正文中的结束字符位置。
- `evidence`：原文短句或连续片段。

LLM 只需要稳定提供 `evidence`。后端会用 evidence 在章节正文中查找，自动补齐 `start_char/end_char`。如果暂时无法定位，则保留 `-1`，前端仍可显示章节和证据文本。

## 需要抽取的数据

### 1. Character

角色用于人物卡片、关系图、剧本角色小传和对白生成。

新增要求：

- 必须提供 `source_refs`
- `evidence` 应指向角色在本章中有代表性的出场、行为或对白

用途：

- 角色管理页定位角色来源
- 剧本生成时构建角色功能、角色声音和人物弧光

### 2. Event

事件是从小说到剧本场景的核心桥梁。

新增要求：

- 必须提供 `source_refs`
- 优先抽取有目标、阻力、结果变化的事件

用途：

- 时间线展示
- 场景拆分板拖拽编排
- 剧本 scene 的 source event

### 3. Scene Candidate

场景候选是后续剧本结构的基础。

新增要求：

- 必须提供 `chapter_id`
- 必须提供 `source_refs`
- 按同一地点、同一时间段、同一戏剧冲突聚合事件

用途：

- 场景拆分板
- 剧本 YAML Schema 中的 `screenplay.scenes`
- 后续 scene -> beat 生成

## 其他辅助数据

| 数据 | 剧本用途 |
| --- | --- |
| Location | 生成 scene heading |
| TimeMarker | 生成 time_of_day 和时间线 |
| Relationship | 生成关系图和角色冲突 |
| Conflict | 判断场景戏剧功能 |
| Dialogue | 生成对白 beat |
| Action | 生成动作 beat |
| Motivation | 生成角色 want/need/arc |
| CausalLink | 维持事件顺序和因果 |
| EmotionArc | 控制场景情绪曲线 |

## 前端定位策略

前端统一使用 `SourceTrace` 展示来源：

```text
原文：chapter-5 · 120-168 · 朕要召回李相公
```

已接入页面：

- 角色管理页：角色卡片展示来源
- 章节/事件时间线：事件卡片展示来源
- 场景拆分板：事件和场景候选展示来源

后续可扩展为点击跳转：

1. 根据 `chapter_id` 找到章节。
2. 根据 `start_char/end_char` 高亮原文。
3. 如果位置为 `-1`，用 `evidence` 在原文中二次搜索。

## 实现位置

后端模型：

```text
apps/api/app/domain/models.py
```

新增：

```python
class SourceRef(BaseModel):
    chapter_id: str = ""
    start_char: int = -1
    end_char: int = -1
    evidence: str = ""
```

已接入：

- `Character.source_refs`
- `Event.source_refs`
- `Scene.source_refs`

后端解析与定位：

```text
apps/api/app/services/chapter_analysis_service.py
```

Prompt：

```text
apps/api/app/config/chapter_analysis_prompt.md
```

前端类型与映射：

```text
apps/web/src/shared/types.ts
apps/web/src/shared/api.ts
```

前端展示：

```text
apps/web/src/shared/SourceTrace.tsx
apps/web/src/features/characters/CharactersPage.tsx
apps/web/src/features/timeline/TimelinePage.tsx
apps/web/src/features/scenes/ScenesPage.tsx
```

## 注意事项

旧缓存中的分析结果没有 `source_refs`。需要点击“重新分析”或清理对应章节缓存后，新的 prompt 才会产出带原文定位的数据。
