# 小说转剧本原型

一个面向“小说转剧本”的人机协作工作台原型。当前仓库包含规划文档、React 前端骨架、FastAPI 后端骨架和共享类型契约。

## 目标

将 3 个章节以上的小说文本自动转换为结构化剧本（YAML 格式），让作者可以快速获得可编辑、可进一步打磨的剧本初稿。项目会定义剧本的 YAML Schema，并在文档中说明该 Schema 的设计原因。

## 目录

```text
apps/web     React + TypeScript 前端
apps/api     FastAPI 后端
packages     共享类型和接口契约
docs          规划文档
```

## 快速开始

### 前端

```bash
cd apps/web
npm install
npm run dev
```

开发环境下，前端默认通过 Vite 代理请求 `/api`，后端需运行在 `http://127.0.0.1:8010`。

### 后端

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

章节叙事信息抽取使用 DeepSeek API。请在本地创建 `apps/api/.env`，不要提交该文件：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
```

也可以在前端“小说导入”页的 DeepSeek 配置面板中输入 API Key，后端会保存到本地 `apps/api/.env`。

综合抽取 Prompt 配置在 `apps/api/app/config/chapter_analysis_prompt.md`。每个章节会按章节内容 hash 写入 `apps/api/app/.cache/deepseek`，同一章节内容不变时不会重复请求模型。

模型调试文件会写入：

```text
apps/api/app/.debug/deepseek/
```

每章会保存 `system_prompt.md`、`user_prompt.md`、`request.json`、`raw_response.txt`、`parsed_response.json`，如果请求失败会额外保存 `error.txt`。该目录已被 `.gitignore` 忽略。

章节分析会并发调用 DeepSeek，默认最多同时处理 3 个章节。配置见：

```text
apps/api/app/core/deepseek_config.py
```

## 文档

规划说明见 [docs/architecture-plan.md](docs/architecture-plan.md)。

PR 提交与合并约束见 [docs/pr-guidelines.md](docs/pr-guidelines.md)。

角色管理调研与实现说明见 [docs/character-management-research.md](docs/character-management-research.md)。

全量叙事信息抽取规划见 [docs/information-extraction-plan.md](docs/information-extraction-plan.md)。
