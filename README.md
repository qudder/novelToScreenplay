# 小说转剧本原型

一个面向“小说转剧本”的人机协作工作台原型。当前仓库包含规划文档、React 前端骨架、FastAPI 后端骨架和共享类型契约。

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

### 后端

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 文档

规划说明见 [docs/architecture-plan.md](docs/architecture-plan.md)。

PR 提交与合并约束见 [docs/pr-guidelines.md](docs/pr-guidelines.md)。
