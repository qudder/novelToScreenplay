# 小说转剧本原型规划

## 目标

本原型面向“小说转剧本”的人机协作工作台，核心目标不是一次性自动生成完整剧本，而是把小说拆解为可审阅、可编辑、可追踪的中间结构，再辅助用户完成剧本改写。

第一阶段覆盖以下能力：

- 小说导入页：上传 TXT、Markdown、Docx，并自动分章。
- 角色管理页：展示人物卡片、合并别名、按重要性排序。
- 人物关系图：使用 React Flow 展示角色网络。
- 章节/事件时间线：展示每章事件、人物出场、冲突点。
- 场景拆分板：把小说事件拖拽组合成剧本场景。
- 剧本生成页：左侧原文，右侧剧本格式，支持人工修改。

## 设计原则

1. **结构化优先**
   小说文本先转成章节、人物、事件、关系、场景等结构化数据，再进入剧本生成环节。

2. **人机协作**
   NLP/LLM 负责初稿和候选结果，用户负责确认、合并、删改和校正。

3. **模块解耦**
   导入、抽取、图谱、场景拆分、剧本生成分别作为独立服务边界，便于替换模型或算法。

4. **来源可追踪**
   每个事件、场景和剧本段落都保留 `source_span` 或 `source_chapter_id`，便于从剧本回溯到小说原文。

5. **渐进式智能**
   原型期可使用规则和 mock 数据；后续替换为 HanLP/LTP、Neo4j、LangGraph 和 LLM agent。

## 技术栈

### 前端

- React
- TypeScript
- Vite
- React Router
- React Flow
- dnd-kit
- ECharts
- GSAP

前端按 feature 分层，每个功能模块包含自己的页面、组件和状态适配逻辑。跨模块共享的数据结构放在 `packages/shared`。

### 后端

- Python
- FastAPI
- Pydantic
- Uvicorn

后端按领域服务拆分：

- `documents`：上传、解析、分章。
- `characters`：人物抽取、别名合并、重要性计算。
- `relationships`：人物关系抽取和图谱数据。
- `events`：章节事件、冲突点、人物出场。
- `scenes`：事件到剧本场景的编排。
- `screenplay`：剧本格式生成和人工编辑保存。

### 后续可接入

- HanLP/LTP：中文分词、NER、依存句法、语义角色标注。
- Neo4j：人物、事件、地点、关系图谱。
- PostgreSQL：项目、文档、章节、编辑结果。
- Qdrant/pgvector：长文本检索、原文片段召回。
- LangGraph：多 agent 编排，例如抽取 agent、场景 agent、剧本 agent、审稿 agent。

## Monorepo 结构

```text
apps/
  web/                 # React 前端工作台
  api/                 # FastAPI 后端
packages/
  shared/              # 共享 TypeScript 类型与接口契约
docs/
  architecture-plan.md # 当前规划文档
```

## 核心数据模型

```text
Novel
Chapter
Paragraph
Character
Alias
Relationship
Event
Scene
ScreenplayDraft
AdaptationNote
```

建议关系：

```text
Character -> appears_in -> Chapter
Character -> participates_in -> Event
Character -> relates_to -> Character
Event -> adapted_into -> Scene
Scene -> generated_as -> ScreenplayDraft
ScreenplayDraft -> traces_to -> SourceSpan
```

## 功能模块规划

### 1. 小说导入

输入：

- TXT
- Markdown
- Docx

处理：

- 读取文本。
- 自动按标题、章节号、空行密度进行分章。
- 生成章节摘要候选。

输出：

- `Novel`
- `Chapter[]`

### 2. 角色管理

能力：

- 自动识别人名。
- 合并别名，例如“林舟”“林公子”“他”。
- 展示人物重要性。
- 展示人物出场章节和参与事件。

重要性可先用以下指标：

- 出场次数。
- 跨章节覆盖率。
- 对话数量。
- 关系边数量。
- 参与关键事件数量。

### 3. 人物关系图

视图：

- 节点：人物。
- 边：关系。
- 边权：互动强度。
- 颜色：关系类型。
- 时间过滤：按章节或场景查看关系变化。

第一版使用 React Flow，后续复杂布局可接入 D3 force layout。

### 4. 章节/事件时间线

每个章节展示：

- 主要事件。
- 出场人物。
- 冲突点。
- 地点。
- 情绪变化。
- 改编提示。

### 5. 场景拆分板

能力：

- 从事件池拖拽事件到场景。
- 合并多个事件为一个场景。
- 拆分过长场景。
- 标注场景功能：铺垫、冲突、反转、高潮、收束。

场景字段：

```json
{
  "id": "scene-1",
  "title": "茶馆试探",
  "location": "茶馆",
  "timeOfDay": "夜",
  "characters": ["林舟", "沈青"],
  "eventIds": ["event-1", "event-2"],
  "dramaticFunction": "揭示关系裂痕"
}
```

### 6. 剧本生成

布局：

- 左侧：小说原文和来源片段。
- 右侧：剧本格式编辑器。

剧本格式：

```text
内景 茶馆 - 夜

林舟坐在靠窗的位置，手指轻敲茶盏。

林舟
你昨夜去了哪里？

沈青没有立刻回答。
```

## 前端分层

```text
src/
  app/          # 路由、全局布局、应用入口
  entities/     # 领域实体视图组件
  features/     # 功能模块
  shared/       # 通用 UI、mock API、工具函数
```

### 模块边界

- `features/import` 不直接修改角色和场景，只负责创建文档与章节。
- `features/characters` 只管理角色、别名和重要性。
- `features/relationships` 只负责图谱展示与关系编辑。
- `features/timeline` 只展示章节和事件，不负责编剧本。
- `features/scenes` 负责事件到场景的编排。
- `features/screenplay` 负责剧本文本生成、编辑和来源追踪。

## 后端分层

```text
app/
  api/          # FastAPI 路由层
  core/         # 配置、日志、错误处理
  domain/       # Pydantic 领域模型
  services/     # 业务服务
  repositories/ # 数据访问抽象
```

路由层不直接写抽取逻辑，只调用 service。service 不依赖具体数据库实现，后续可将 memory repository 替换为 PostgreSQL/Neo4j。

## 原型迭代路线

### V0.1 当前骨架

- 静态 mock 数据。
- 页面和模块边界完整。
- FastAPI 提供统一数据接口。
- 前端可展示六个核心功能页。

### V0.2 可上传文本

- 支持 TXT/Markdown 上传。
- 后端规则分章。
- 前端展示真实章节。

### V0.3 NLP 抽取

- 接入 HanLP 或 LTP。
- 抽取人物、地点、事件候选。
- 支持别名合并。

### V0.4 图谱与场景编排

- 接入 Neo4j。
- 人物关系可按章节变化。
- 场景拆分板支持保存。

### V0.5 LLM 剧本生成

- 接入 LangGraph。
- 分 agent 生成人物小传、场景大纲、剧本初稿、审稿意见。
- 保留来源追踪。

