# 角色管理调研与实现方案

## 调研结论

角色管理建议分两阶段实现。

第一阶段使用章节级 LLM 抽取：

- 每次上传小说后，系统将章节标题、章节 id 和章节正文发送给 DeepSeek API。
- Prompt 在配置文件中维护，要求模型返回项目需要的 JSON 数据类型。
- 每个章节只识别一次：系统使用章节 id、标题和正文内容生成 hash，并缓存模型返回结果。
- 前端展示合并后的角色卡片、别名、重要性和出场章节。

第二阶段再替换为更强的 NLP/LLM 管线：

- HanLP/LTP 做中文 NER、人名识别和句法分析。
- 共指消解或 LLM 辅助识别“他/她/官家/相公”等指代。
- Neo4j 存储人物、事件、章节、关系。
- 根据人物共现、对话归属、事件参与计算关系图和重要性。

## 文献与资料依据

《Extraction and Analysis of Fictional Character Networks: A Survey》指出，虚构文本人物网络抽取通常会拆成若干步骤：识别角色、处理不同指称、确定交互关系，再进行网络分析。该思路适合本项目的模块化实现。

《Network Extraction and Analysis of Character Relationships in Chinese Literary Works》针对中文文学作品，使用文本分析、共词/共现网络、网络分析和可视化来研究人物关系。这与本项目“角色管理 -> 人物关系图 -> 场景拆分”的流程一致。

HanLP 官方文档和演示提供中文命名实体识别能力，可作为后续替换规则抽取器的候选工具。

## 当前原型算法

当前实现依赖 DeepSeek API，使用 OpenAI-compatible Chat Completions 接口，并要求模型输出 JSON。

### Prompt 配置

Prompt 文件：

```text
apps/api/app/config/character_extraction_prompt.md
```

Prompt 要求模型返回：

```json
{
  "characters": [
    {
      "name": "角色主名",
      "aliases": ["别名1"],
      "importance": 80,
      "role": "重要角色",
      "description": "一句话说明角色作用。",
      "appearances": ["chapter-1"]
    }
  ]
}
```

### 密钥管理

API key 只从环境变量读取：

```text
DEEPSEEK_API_KEY=...
```

本地可创建：

```text
apps/api/.env
```

`.env` 已加入 `.gitignore`，不要提交到 GitHub。

### 缓存策略

缓存目录：

```text
apps/api/app/.cache/deepseek
```

缓存 key：

```text
sha256(chapter.id + chapter.title + chapter_text)
```

同一章节内容不变时，系统直接读取缓存，避免重复调用 DeepSeek API。

## 后续迭代

1. 增加角色编辑和别名合并保存接口。
2. 增加 HanLP/LTP 抽取器实现，作为离线 fallback。
3. 根据章节共现生成初版人物关系。
4. 在剧本生成阶段将角色卡片作为 prompt 上下文。
