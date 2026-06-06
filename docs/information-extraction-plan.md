# 全量叙事信息抽取规划

## 目标

下一阶段将所有“小说转剧本”所需信息统一纳入章节级综合抽取流程。每个章节只调用一次 DeepSeek API，返回一份结构化 JSON，再由后端拆分为项目需要的数据类型。

## 抽取策略

不为每类信息单独调用模型，而是按章节使用一个综合 prompt：

```text
prompt + chapter_id + chapter_title + chapter_text -> ChapterAnalysis JSON
```

这样可以减少 API 调用次数，也能让模型在同一上下文中同时判断人物、地点、时间、事件、冲突、对白、动作、关系和场景候选。

## 每章抽取内容

### characters

角色信息：

- name
- aliases
- importance
- role
- description
- appearances

### locations

地点信息：

- name
- type
- description
- evidence

### time_markers

时间信息：

- time_text
- normalized_time
- time_of_day
- sequence_order

### events

事件信息：

- title
- summary
- characters
- location
- time_text
- conflict
- consequence

### relationships

人物关系：

- source
- target
- type
- strength
- evidence

### conflicts

冲突信息：

- conflict_type
- participants
- desire
- obstacle
- outcome
- evidence

### dialogues

对白信息：

- speaker
- listener
- content
- emotion
- source_text

### actions

动作信息：

- character
- action
- object
- location
- visuality_score

### motivations

人物动机：

- character
- goal
- fear
- secret
- motivation

### causal_links

因果关系：

- cause_event
- effect_event
- relation_type
- evidence

### scene_candidates

剧本场景候选：

- title
- location
- time_of_day
- event_titles
- characters
- dramatic_function
- adaptation_note

### emotion_arc

情绪与张力：

- emotion
- intensity
- tension

## 缓存策略

缓存 key：

```text
sha256(chapter_id + chapter_title + chapter_text)
```

缓存路径：

```text
apps/api/app/.cache/deepseek
```

同一章节内容不变时，系统直接读取缓存，不重复调用 DeepSeek。

## PR 拆分建议

1. 新增综合 prompt 和后端数据模型。
2. 将角色抽取服务升级为章节综合分析服务。
3. 将综合分析结果映射到前端角色、时间线、场景拆分板。
4. 增加人工编辑和保存接口。
5. 增加关系图、事件时间线和场景候选可视化。

