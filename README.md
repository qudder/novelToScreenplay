# 小说转剧本创作工作台

小说转剧本创作工作台是一个面向影视改编前期开发的人机协作系统。项目以小说文本为输入，通过章节解析、叙事信息抽取、场景拆分、剧本生成、分镜生图和视频任务管理，将长篇小说逐步整理为可编辑、可追溯、可导出的剧本与视听素材草案。

当前版本包含 React 前端、FastAPI 后端、共享类型契约、剧本 YAML Schema 以及多份实现规划文档，适合作为小说影视化改编流程的功能原型和后续产品迭代基础。

## 核心功能

### 小说导入与叙事分析

- 支持上传 TXT、Markdown、Docx 小说文件，并自动解析章节。
- 提供本地小说库，可在多个导入项目之间切换和删除本地缓存。
- 支持在页面内配置 DeepSeek API Key，并由后端保存到本地 `.env`。
- 叙事分析以异步方式执行，可启动、轮询、重试，并持续同步分析状态。
- 分析结果会抽取角色、事件、关系、时间、地点、冲突、动机、行为、对话、环境、分镜规划、总场景和子场景等结构化信息。
- 章节、事件、角色和场景保留原文定位，便于回到小说正文校验依据。

### 角色、关系与时间线

- 角色管理页展示角色卡片、别名、角色定位、重要性、出场章节和原文证据。
- 人物关系图基于 G6 展示角色网络，节点表示人物，边表示关系类型和强度。
- 章节/事件时间线按章节组织事件、人物出场、地点、时间和冲突点。
- 多个页面支持点击卡片打开原文比对，减少模型抽取结果与原文脱节的问题。

### 场景拆分与剧本生成

- 场景拆分板先展示按章节或连续章节聚合的总场景，再向下拆分为子场景。
- 子场景关联事件、人物、环境、对话、动作、冲突和分镜规划，可作为剧本生成素材。
- 剧本生成页提供场景级编辑工作台，左侧选择场景，右侧编辑本场剧本。
- 支持调用 DeepSeek 对单场剧本进行 AI 自动补全，并将草稿保存到浏览器本地。
- 剧本总览页统计已保存场景，支持将完整剧本导出为 YAML。
- YAML 结构契约见 `schemas/screenplay.schema.yaml`。

### 分镜图片与视频任务

- 分镜生图页可从剧本场景和镜头规划中选择完整镜头或单个定帧。
- 支持通过 DeepSeek 生成分镜图片提示词，再调用 Seedream 模型生成分镜参考图。
- 分镜图片管理页展示任务状态、预览图、本地保存路径和项目关联标签，并提供回收箱。
- 视频生成页可导入全剧本、单场景、单镜头或单个分镜粒度的剧本文本。
- 视频任务支持选择分镜图片作为首帧或参考图，并配置 Seedance 模型、画幅、时长、清晰度、Seed 和固定镜头运动。
- 视频管理页同步 Seedance 任务状态，展示生成结果、本地视频文件和小说、章节、场景、镜头、分镜图片等回链标签。

### 本地存储与调试

- 小说项目、剧本草稿、分镜图片任务和视频任务主要通过本地快照支撑前端工作流。
- DeepSeek 章节分析结果按章节内容 hash 缓存，章节内容不变时避免重复请求模型。
- 模型调试文件会保存请求、响应、解析结果和错误信息，便于排查提示词与模型输出问题。
- Seedream 图片和 Seedance 视频产物默认保存到 `.data/generated_media/`，该目录不会提交到仓库。

## 技术栈

- 前端：React、TypeScript、Vite、React Router、Lucide Icons、AntV G6、dnd-kit。
- 后端：FastAPI、Pydantic、Uvicorn。
- 模型服务：DeepSeek 用于叙事分析、剧本补全和分镜提示词生成；Seedream 用于分镜生图；Seedance 用于视频生成。
- 数据契约：共享 TypeScript 类型、Pydantic 模型和 YAML Schema。

## 目录结构

```text
apps/web      React + TypeScript 前端应用
apps/api      FastAPI 后端服务
packages      共享类型和接口契约
schemas       剧本 YAML Schema
docs          架构、实现计划、PR 规范和说明文档
```

## 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 启动后端

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

后端默认提供 `/api` 接口，并将生成媒体文件挂载到 `/media/generated`。

### 3. 启动前端

```bash
npm run web:dev
```

开发环境下，前端通过 Vite 代理请求后端，默认后端地址为 `http://127.0.0.1:8000`。

## 本地环境配置

请在本地创建 `apps/api/.env`，不要提交真实 `.env` 文件。

### DeepSeek

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

也可以在前端“小说导入”页保存 DeepSeek API Key。

### Seedance 与 Seedream

```text
SEEDANCE_API_KEY=你的 Seedance API Key
SEEDANCE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDANCE_MODEL=doubao-seedance-1-0-lite-t2v-250428
```

Seedream 图片模型与 Seedance 视频模型均通过同一组火山方舟兼容配置读取可用模型。实际模型名可在前端配置页选择或输入自定义模型。

### 生成媒体目录

```text
GENERATED_MEDIA_DIR=C:\你的本地素材目录\generated_media
GENERATED_MEDIA_PUBLIC_PREFIX=/media/generated
```

未配置时，生成图片和视频默认保存到工作区根目录下的 `.data/generated_media/`。

## 缓存与调试目录

```text
apps/api/app/.cache/deepseek/
apps/api/app/.debug/deepseek/
.data/generated_media/
```

这些目录包含模型缓存、调试证据和生成媒体产物，已被 `.gitignore` 忽略。调试文件可能包含模型原始输入输出，排查问题时可以查看，但不得提交到仓库。

## 常用命令

```bash
npm run web:build
python -m compileall apps/api/app
```

## 关键文档

- 架构规划：`docs/architecture-plan.md`
- 剧本生成实现规划：`docs/screenplay-generation-implementation-plan.md`
- 分层场景抽取规划：`docs/hierarchical-scene-extraction-plan.md`
- 分镜与视频生成页面规划：`docs/seedance-video-generation-page-plan.md`
- PR 提交规范：`docs/pr-guidelines.md`
- 中文日志与注释规范：`docs/chinese-logging-comments-guidelines.md`

## 协作约束

- 提交、推送或创建 PR 前，必须先读取 `docs/pr-guidelines.md`。
- 修改代码、运行服务、排查问题或提交 PR 前，必须先读取 `docs/chinese-logging-comments-guidelines.md`。
- 提交信息、推送说明、提交总结、PR 描述、后端应用日志和关键运行日志使用中文。
- 不得提交真实 `.env`、缓存、日志、构建产物、依赖目录和本地测试文本。
- 不得在日志中打印完整 API Key 或完整小说正文。
