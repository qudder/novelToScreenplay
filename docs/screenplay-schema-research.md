# 剧本构建调研与 YAML Schema 设计

## 目标

本文档用于说明“小说转剧本”系统中剧本数据应该如何组织，并定义项目后续生成、编辑、校验剧本草稿时使用的 YAML Schema。

Schema 文件位置：

```text
schemas/screenplay.schema.yaml
```

## 资料调研结论

### 1. 行业剧本格式以场景为基本单位

传统剧本格式通常由以下元素组成：

- Scene Heading / Slugline：场景标题，如 `INT. COURTROOM - DAY`。
- Action：可拍摄的动作、环境、行为。
- Character Cue：对白角色名。
- Dialogue：角色台词。
- Parenthetical：简短表演提示。
- Transition：转场，如 `CUT TO:`。

这说明剧本生成不应该直接按小说段落输出，而应该先组织成“场景”，再在场景内生成动作和对白。

参考资料：

- [Final Draft: Screenplay Format Guide](https://www.finaldraft.com/learn/how-to-format-a-screenplay/)
- [Screenplay.com: Screenplay Format](https://www.screenplay.com/screenplay-format)
- [Academy Nicholl Fellowship resources](https://www.oscars.org/nicholl/about)

### 2. 编剧理论强调戏剧功能与结构位置

三幕式、序列法和常见编剧教材都强调：场景不只是发生地点，而是承担叙事功能。一个场景通常需要回答：

- 谁在场？
- 角色想要什么？
- 阻力是什么？
- 场景结束时局面是否改变？
- 它在全片结构中承担铺垫、揭示、反转、高潮还是收束？

因此 Schema 中不能只记录格式文本，还要记录 `dramatic.purpose`、`conflict`、`turning_point`、`stakes` 等字段。

参考资料：

- Syd Field 的三幕式理论：setup、confrontation、resolution。
- Robert McKee《Story》关于 scene value change 的观点。
- John Truby《The Anatomy of Story》关于角色欲望、需要与冲突网络的设计。

### 3. 计算叙事研究强调事件、角色、时间与话语结构

计算叙事领域通常区分：

- Fabula：故事世界中真实发生的事件链。
- Sjuzhet / Discourse：叙述如何组织这些事件。
- Character / Location / Time / Event：可计算叙事表示的基础实体。

这与本项目当前抽取的数据一致：章节、人物、地点、时间标记、事件、冲突、关系、对白、动作、动机、因果链、场景候选。

因此剧本 Schema 应该保留从小说中抽取出来的来源引用，例如：

- `source.chapter_ids`
- `source.event_ids`
- `source.source_spans`
- `beat.source_event_ids`

这样才能支持“剧本段落回溯到小说原文”，也方便人工改编时判断模型是否编造。

参考资料：

- Mani, I. The Imagined Moment: Time, Narrative, and Computation.
- Elson, D. K. Modeling Narrative Discourse.
- Finlayson, M. A. The Story Workbench and computational narrative annotation.
- Chambers & Jurafsky 关于 narrative event chains 的研究。

## Schema 总体设计

顶层结构：

```yaml
screenplay:
  id:
  title:
  draft:
  source:
  logline:
  synopsis:
  themes:
  acts:
  characters:
  scenes:
  continuity:
  validation:
```

设计原则：

1. **场景优先**
   剧本的主要可编辑对象是 `scene`，不是章节或段落。

2. **格式与语义分离**
   `scene_heading`、`beats` 负责剧本格式；`dramatic` 负责戏剧功能。

3. **可追溯**
   每个场景和 beat 可以回溯到章节、事件和原文 span。

4. **可编辑**
   Schema 不是只给模型输出用，也要支持前端编辑器保存人工修改。

5. **可校验**
   `validation` 记录必填字段和允许的 beat 类型，后续可转成 Pydantic 或 JSON Schema。

## 核心字段设计原因

### screenplay.source

```yaml
source:
  document_id:
  filename:
  chapter_ids:
```

原因：

- 当前项目已经以文档 ID 管理小说。
- 剧本草稿必须知道自己来自哪本文档。
- 章节 ID 便于从剧本回到章节分析结果。

### acts

```yaml
acts:
  - id:
    function:
    scene_ids:
```

原因：

- 剧本通常有宏观结构。
- 即使早期不强制三幕式，也需要给后续“结构诊断”和“节奏可视化”留接口。
- `scene_ids` 让 act 和 scenes 解耦，方便拖拽重排。

### characters

```yaml
characters:
  - id:
    screenplay_role:
    want:
    need:
    arc:
    voice_note:
```

原因：

- 小说角色信息不等于剧本角色信息。
- 剧本更关心角色在戏剧中的功能、欲望、弧光和说话方式。
- `source_character_ids` 允许多个小说别名/候选人物合并成一个剧本角色。

### scenes

```yaml
scenes:
  - scene_heading:
    dramatic:
    source:
    cast:
    beats:
    adaptation:
```

原因：

- `scene_heading` 对应行业剧本格式。
- `dramatic` 支撑编剧判断。
- `source` 支撑可追溯。
- `cast` 支撑人物出场统计和关系图。
- `beats` 是剧本文本的最小生成/编辑单元。
- `adaptation` 记录为什么合并、删减或新增内容。

### beats

```yaml
beats:
  - type:
    character_id:
    character_name:
    parenthetical:
    text:
    transition:
```

原因：

- 剧本文本不是单一字符串，而是由动作、对白、转场等格式元素组成。
- 前端编辑器可以按 beat 渲染不同样式。
- 后端生成时可以逐 beat 校验，不必整段字符串解析。

### adaptation

```yaml
adaptation:
  compression:
  added_for_screen:
  rationale:
  risks:
```

原因：

- 小说转剧本一定涉及删减、合并、改写和视觉化。
- 这些改编决策需要被记录，否则用户难以理解模型为什么这样写。
- `risks` 可标记“可能偏离原文”“人物动机不足”“场景过长”等问题。

## 与当前项目数据的映射

| 当前抽取数据 | 剧本 Schema 目标字段 |
| --- | --- |
| Chapter | `screenplay.source.chapter_ids`, `scene.source.chapter_ids` |
| Character | `screenplay.characters`, `scene.cast` |
| Event | `scene.source.event_ids`, `beat.source_event_ids` |
| Relationship | `characters.voice_note`, `dramatic.conflict`, 后续关系约束 |
| Location | `scene_heading.location` |
| TimeMarker | `scene_heading.time_of_day`, `continuity.timeline` |
| Conflict | `scene.dramatic.conflict`, `stakes` |
| Dialogue | `beat.type=dialogue` |
| Action | `beat.type=action` |
| Motivation | `characters.want`, `characters.need`, `dramatic.stakes` |
| CausalLink | `acts`, `scene.sequence_order`, `continuity.timeline` |
| SceneCandidate | `scenes` 初稿 |

## 生成流程建议

1. 从章节分析结果读取 `scene_candidates`。
2. 将多个小说事件合并为剧本 scene。
3. 为每个 scene 生成 `scene_heading`。
4. 生成 `dramatic` 信息，明确场景目的和冲突。
5. 根据 actions/dialogues 生成 beats。
6. 给每个 beat 绑定 `source_event_ids` 或 `source_span`。
7. 保存 YAML。
8. 前端按 scenes/beats 渲染剧本编辑器。

## 示例

```yaml
screenplay:
  id: sp-001
  title: 绍宋试改编
  language: zh-CN
  format: feature_screenplay
  draft:
    version: 1
    status: draft
    created_at: "2026-06-06T18:00:00+08:00"
    updated_at: "2026-06-06T18:00:00+08:00"
  source:
    document_id: 2c8cd7a7-d94a-4130-bb4b-faa11bad7546
    filename: 绍宋.txt
    chapter_ids: [chapter-1, chapter-2]
  logline: 穿越成宋高宗的赵玖试图在崩坏局势中扭转南逃路线。
  synopsis: 赵玖在近臣、武将与朝臣的重重牵制下，寻找抗金的真正支点。
  themes: [权力, 生存, 忠诚, 历史转向]
  acts:
    - id: act-1
      title: 开局困境
      function: setup
      summary: 赵玖发现自己名义上掌权，实则处处受制。
      sequence_order: 1
      scene_ids: [scene-1]
  characters:
    - id: char-1
      name: 赵玖
      aliases: [赵官家]
      screenplay_role: protagonist
      want: 留在中原抗金
      need: 找到可执行的政治与军事支点
      arc: 从被动试探到主动夺回决策权
      voice_note: 表面克制，压力下会冷笑反问
      source_character_ids: [char-1]
  scenes:
    - id: scene-1
      act_id: act-1
      sequence_order: 1
      scene_heading:
        prefix: INT
        location: 明道宫后殿
        time_of_day: DAY
        raw: INT. 明道宫后殿 - DAY
      dramatic:
        purpose: conflict
        conflict: 赵玖要求召回抗金派，近臣集体反对。
        turning_point: 赵玖放弃召回李纲，转而提出召回宗泽。
        emotional_value_start: 压抑
        emotional_value_end: 对峙升级
        stakes: 南逃路线是否被动延续
      source:
        chapter_ids: [chapter-5]
        event_ids: [events-1, events-2]
        source_spans:
          - chapter_id: chapter-5
            start_char: 0
            end_char: 500
            evidence: 赵玖提出召回李相公。
      cast:
        present_character_ids: [char-1, char-2, char-3]
        speaking_character_ids: [char-1, char-2]
      beats:
        - id: beat-1
          type: action
          sequence_order: 1
          character_id: ""
          character_name: ""
          parenthetical: ""
          text: 明道宫后殿内，几名重臣分列而坐，气氛压得人喘不过气。
          transition: ""
          source_event_ids: [events-1]
          source_span:
            chapter_id: chapter-5
            start_char: 0
            end_char: 80
          revision_note: ""
        - id: beat-2
          type: dialogue
          sequence_order: 2
          character_id: char-1
          character_name: 赵玖
          parenthetical: 强硬
          text: 朕要召回李相公。
          transition: ""
          source_event_ids: [events-1]
          source_span:
            chapter_id: chapter-5
            start_char: 81
            end_char: 120
          revision_note: ""
      adaptation:
        compression: summarized
        added_for_screen: false
        rationale: 将长篇朝堂辩论压缩为一个明确冲突场景。
        risks: [对白可能过密, 需要补充动作调度]
  continuity:
    timeline:
      - scene_id: scene-1
        story_time: 这日中午
        order: 1
    locations:
      - name: 明道宫后殿
        scene_ids: [scene-1]
    props: []
  validation:
    required_scene_fields:
      - scene_heading.prefix
      - scene_heading.location
      - scene_heading.time_of_day
      - beats
    allowed_beat_types:
      - action
      - dialogue
      - parenthetical
      - shot
      - transition
      - note
```

## 后续实现建议

1. 在后端新增 `screenplay_service.py`，将 `AnalysisResult` 转为上述 YAML。
2. 使用 Pydantic 定义同构模型，保证 API 与 YAML 一致。
3. 前端剧本页不要直接编辑纯文本，而是编辑 `scene -> beat`。
4. 保存时同时输出：
   - YAML 结构化版本
   - 标准剧本文本预览
5. 每次人工编辑保留 `revision_note`，便于版本管理。
