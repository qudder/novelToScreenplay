# 多供应商模型 API Key 设置功能设计

## 背景

当前项目已经支持在系统设置中保存文本模型 API Key、OpenAI 兼容接口地址和模型名，也支持为图片、视频能力保存部分独立配置。随着用户希望接入不同网站提供的 API Key，现有“一个用途绑定一组环境变量”的方式会遇到几个问题：

- 用户可能同时拥有 DeepSeek、OpenAI、通义千问、豆包、Claude、Gemini、Azure OpenAI、第三方中转站等多个 Key。
- 同一供应商可能同时提供文本模型、多模态模型、图片模型或视频模型。
- 大部分中转站采用 OpenAI 兼容接口，但少数主流厂商使用不同的消息结构、鉴权头和模型列表接口。
- 项目后续需要按任务选择模型，例如叙事分析用便宜长上下文模型，剧本补全用高质量文本模型，分镜提示词可用同一文本模型，多模态校对或图片理解可用视觉模型。

本设计目标是让用户可以在一个系统设置页维护多个模型服务配置，并让业务功能按“用途”选择默认模型服务。

## 调研结论

### 主流 API 调用格式

| 类型 | 代表服务 | 鉴权方式 | 请求路径 | 消息结构 | 兼容性判断 |
| --- | --- | --- | --- | --- | --- |
| OpenAI Chat Completions 兼容 | OpenAI、DeepSeek、通义千问兼容模式、豆包火山方舟兼容模式、多数中转站 | `Authorization: Bearer <key>` | `/v1/chat/completions` 或供应商完整地址 | `messages: [{ role, content }]`，多模态通常用 `content` 数组 | 应作为默认优先支持格式 |
| OpenAI Responses | OpenAI 新接口 | `Authorization: Bearer <key>` | `/v1/responses` | `input` 数组，可混合文本、图片等内容 | 适合后续扩展，不建议首版强依赖 |
| Anthropic Messages | Claude | `x-api-key` + `anthropic-version` | `/v1/messages` | `messages` 中的 `content` 是文本和图片块数组 | 需要专用适配器 |
| Gemini generateContent | Gemini | `x-goog-api-key` 或查询参数 Key | `/v1beta/models/{model}:generateContent` | `contents[].parts[]`，文本和图片分片 | 需要专用适配器 |
| Azure OpenAI | Azure OpenAI | `api-key` 或 Entra ID | `/openai/deployments/{deployment}/chat/completions?api-version=...` | 接近 OpenAI Chat Completions | 需要地址模板和鉴权头适配 |
| 图片生成 OpenAI 兼容 | OpenAI Images、部分中转站 | `Authorization: Bearer <key>` | `/v1/images/generations` | `prompt`、`model`、`size`、`response_format` | 可复用现有 RightCode 方向 |
| 视频生成任务接口 | Seedance、可灵、Runway、部分中转站 | 差异较大 | 常见为提交任务和轮询任务两个接口 | 任务型请求，字段强依赖供应商 | 本次不纳入统一设置，继续使用视频页面局部配置 |

参考资料：

- OpenAI Chat Completions API 文档：https://platform.openai.com/docs/api-reference/chat/create
- OpenAI Responses API 文档：https://platform.openai.com/docs/api-reference/responses
- DeepSeek API 文档：https://api-docs.deepseek.com/
- Anthropic Messages API 文档：https://docs.anthropic.com/en/api/messages
- Anthropic Vision 文档：https://docs.anthropic.com/en/docs/build-with-claude/vision
- Gemini generateContent 文档：https://ai.google.dev/api/generate-content
- Azure OpenAI REST API 文档：https://learn.microsoft.com/en-us/azure/ai-services/openai/reference

### 推荐首版覆盖范围

首版不追求所有供应商原生能力完全打平，而是采用“OpenAI 兼容优先，其他原生协议先保留设计”的策略：

1. 默认支持 OpenAI Chat Completions 兼容文本和多模态模型。
2. Anthropic、Gemini、Azure OpenAI 只保留调研和接口设计，首版不落代码。
3. 图片模型和视频模型继续保留在分镜、视频页面的局部配置中，暂不并入本次多文本模型设置。
4. 对未知网站或中转站，提供“自定义 OpenAI 兼容”配置入口。
5. 业务页面读取默认模型档案，同时允许用户在当前页面临时覆盖本次调用使用的模型档案。

## 统一内部调用模型

后端业务代码不直接关心供应商格式，而是调用统一的 `ModelGateway`。网关接收项目内部请求，再交给具体适配器转换。

```text
业务服务
  -> ModelGateway
    -> ProviderCredentialStore
    -> ProviderAdapter
      -> OpenAICompatibleAdapter
      -> AnthropicAdapter（后续扩展）
      -> GeminiAdapter（后续扩展）
      -> AzureOpenAIAdapter（后续扩展）
```

### 内部请求结构

```json
{
  "purpose": "narrative_analysis",
  "model_profile_id": "deepseek-default",
  "messages": [
    {
      "role": "system",
      "content": [
        { "type": "text", "text": "系统提示词" }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "用户输入" },
        { "type": "image_url", "image_url": "https://example.com/a.png" }
      ]
    }
  ],
  "response_format": "json_object",
  "temperature": 0.1,
  "max_tokens": 16000,
  "stream": false,
  "debug_context": "chapter-1"
}
```

### 内部响应结构

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "text": "模型返回正文",
  "finish_reason": "stop",
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500,
    "total_tokens": 1500
  },
  "raw_response_path": ".data/debug/model-gateway/..."
}
```

这样叙事分析、剧本补全、分镜提示词、多模态识图后续都能复用同一套客户端。

## 配置数据设计

### 供应商档案

建议新增本地配置文件 `.data/settings/model-providers.json`，真实 Key 单独保存到 `.data/settings/secrets.env`，继续不提交。这样模型服务密钥不会和开发环境配置混在 `apps/api/.env` 中，非敏感元数据则写入 JSON。

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "deepseek-default",
      "name": "DeepSeek 默认文本模型",
      "provider_type": "openai_compatible",
      "capabilities": ["text", "json"],
      "api_key_ref": "MODEL_PROVIDER_DEEPSEEK_DEFAULT_API_KEY",
      "base_url": "https://api.deepseek.com",
      "chat_completions_url": "https://api.deepseek.com/chat/completions",
      "models_url": "https://api.deepseek.com/models",
      "model": "deepseek-chat",
      "headers": {},
      "timeout_seconds": 60,
      "max_retries": 2,
      "enabled": true,
      "created_at": "2026-06-22T00:00:00+08:00",
      "updated_at": "2026-06-22T00:00:00+08:00"
    }
  ],
  "defaults": {
    "narrative_analysis": "deepseek-default",
    "screenplay_completion": "deepseek-default",
    "storyboard_prompt": "deepseek-default",
    "vision_understanding": "",
    "image_generation": "",
    "video_generation": ""
  }
}
```

### 字段说明

| 字段 | 说明 |
| --- | --- |
| `id` | 本地唯一 ID，用于业务功能引用 |
| `name` | 用户可读名称，例如“DeepSeek 长文本分析” |
| `provider_type` | `openai_compatible`、`anthropic`、`gemini`、`azure_openai`、`image_openai_compatible`、`seedance` |
| `capabilities` | 首版使用 `text`、`json`、`vision`、`model_list`；`image_generation`、`video_generation` 仅作为后续扩展预留 |
| `api_key_ref` | 指向 `.data/settings/secrets.env` 中的变量名，不在 JSON 中保存明文 Key |
| `base_url` | 供应商根地址，允许为空 |
| `chat_completions_url` | OpenAI 兼容文本和多模态完整接口地址 |
| `models_url` | 模型列表接口地址，可为空 |
| `model` | 默认模型名或 Azure deployment 名 |
| `headers` | 额外请求头，不允许保存 `Authorization` 或完整 Key |
| `timeout_seconds` | 请求超时 |
| `max_retries` | 可重试错误的最大重试次数 |
| `enabled` | 是否启用该配置 |

### API Key 存储策略

为了保护 Key，建议遵循以下规则：

- 后端不向前端返回完整 API Key，只返回 `configured`、末尾 4 位掩码和配置状态。
- 日志、调试文件、错误信息不得写入完整 API Key。
- `.data/settings/secrets.env` 中使用自动生成的变量名，例如 `MODEL_PROVIDER_DEEPSEEK_DEFAULT_API_KEY`。
- 删除供应商档案时，同步清理 `.data/settings/secrets.env` 中对应 Key，或标记为废弃等待用户确认。
- 后续可增加“本机系统凭据库”选项，但首版不引入额外依赖。
- 供应商档案首版不支持导入导出，避免误导用户导出包含敏感配置的文件。

## 供应商适配器设计

### OpenAI 兼容适配器

适用范围最广，应作为首选。

请求转换：

- `system`、`user`、`assistant` 角色原样保留。
- 纯文本内容转换为 `content: "文本"`。
- 多模态内容转换为 `content: [{ type: "text", text }, { type: "image_url", image_url: { url } }]`。
- JSON 输出优先使用 `response_format: { "type": "json_object" }`，若供应商不支持则降级为提示词约束。

鉴权：

```text
Authorization: Bearer <api_key>
Content-Type: application/json
```

### Anthropic 适配器

该适配器首版只保留设计，不进入实现范围。

请求转换：

- `system` 单独映射到顶层 `system` 字段。
- `messages[].content` 转换为 Anthropic content block。
- 图片 URL 需要先转为 base64，或要求用户提供可被供应商直接读取的图片格式，具体按接口能力处理。
- JSON 输出通过提示词和后处理解析实现，不能完全依赖 OpenAI 的 `response_format`。

鉴权：

```text
x-api-key: <api_key>
anthropic-version: 2023-06-01
Content-Type: application/json
```

### Gemini 适配器

该适配器首版只保留设计，不进入实现范围。

请求转换：

- `messages` 转为 `contents`。
- `role=user` 和 `role=model` 映射 Gemini 角色。
- 文本转为 `parts: [{ text }]`。
- 图片转为 `inline_data` 或 `file_data`。
- `system` 可映射到 `systemInstruction`。

鉴权：

```text
x-goog-api-key: <api_key>
Content-Type: application/json
```

### Azure OpenAI 适配器

该适配器首版只保留设计，不进入实现范围。

请求转换接近 OpenAI 兼容格式，但配置需要额外字段：

- `azure_endpoint`
- `deployment`
- `api_version`

请求地址由后端拼接：

```text
{azure_endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}
```

鉴权：

```text
api-key: <api_key>
Content-Type: application/json
```

## 后端接口设计

### 供应商档案接口

```text
GET    /api/model-providers
POST   /api/model-providers
GET    /api/model-providers/{profile_id}
PUT    /api/model-providers/{profile_id}
DELETE /api/model-providers/{profile_id}
POST   /api/model-providers/{profile_id}/test
GET    /api/model-providers/{profile_id}/models
```

### 默认用途接口

```text
GET /api/model-providers/defaults
PUT /api/model-providers/defaults
```

用途建议：

| 用途 | 说明 | 默认兼容能力 |
| --- | --- | --- |
| `narrative_analysis` | 小说章节结构化抽取 | `text`、`json` |
| `screenplay_completion` | 单场剧本补全 | `text` |
| `storyboard_prompt` | 分镜图片提示词生成 | `text` |
| `vision_understanding` | 后续图片理解、分镜校对 | `vision` |

图片生成和视频生成暂不纳入本次默认用途映射，继续使用分镜和视频页面已有的局部配置。

### 测试连接接口

`POST /api/model-providers/{profile_id}/test` 应执行最小请求：

- 文本模型：发送“请回复：连接成功”。
- JSON 模型：要求返回 `{"ok": true}`。
- 视觉模型：可选传入用户上传的测试图片，不自动读取小说正文。

返回示例：

```json
{
  "ok": true,
  "message": "模型连接测试成功。",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "latency_ms": 1234
}
```

## 前端设置页设计

### 页面结构

系统设置页建议拆成三块：

1. 模型供应商档案列表
2. 新增或编辑供应商配置抽屉
3. 业务用途默认模型映射

### 档案卡片展示

每张卡片展示：

- 用户命名
- 供应商类型
- 能力标签：文本、JSON、多模态、图片、视频
- 默认模型
- Key 是否已配置
- 最近测试状态
- 编辑、测试、设为默认、删除按钮

### 新增配置流程

第一步选择模板：

- OpenAI 兼容
- DeepSeek
- 通义千问 OpenAI 兼容
- 豆包火山方舟 OpenAI 兼容
- 自定义 OpenAI 兼容

Anthropic Claude、Gemini、Azure OpenAI、图片生成和视频生成模板保留为后续扩展，不在首版新增入口中展示。

第二步填写配置：

- 显示名称
- API Key
- 接口地址
- 模型名
- 能力勾选
- 超时时间
- 可选模型列表地址

第三步测试连接：

- 成功后允许保存。
- 失败时展示中文错误摘要。
- 不把第三方英文错误原样直接展示给用户，应以中文说明包裹。

### 默认模型映射

提供一个“用途 -> 模型档案”的表单：

```text
叙事分析：DeepSeek 默认文本模型
剧本补全：OpenAI 兼容高质量写作模型
分镜提示词：DeepSeek 默认文本模型
图片理解：GPT-4.1 mini 视觉
```

保存后，业务页面提示“默认使用 xxx”，并提供当前页面的临时模型选择。临时选择只影响本次页面操作，不写回全局默认配置。

### 业务页面临时覆盖

叙事分析、剧本补全和分镜提示词页面可以读取可用文本模型档案，并在调用前允许用户临时选择：

- 默认选项为系统设置中的用途默认模型。
- 用户切换后只保存在当前页面状态或浏览器本地草稿中。
- 请求后端时带上 `model_profile_id`，后端优先使用该临时档案；未传时回退到用途默认档案。
- 临时覆盖模型仅当前页面会话有效，不写入浏览器本地记忆，也不写回全局默认配置。页面刷新或重新进入页面后，重新使用系统设置中的用途默认模型。

## 迁移方案

### 阶段一：文档确认

- 确认多供应商配置的数据模型。
- 首版只实现 OpenAI 兼容供应商。
- API Key 保存到 `.data/settings/secrets.env`。
- 供应商档案不支持导入导出。
- 业务页面允许临时覆盖默认模型，且临时覆盖仅当前页面会话有效。
- 图片和视频模型继续保留在分镜和视频页面的局部配置。
- 旧 `DEEPSEEK_API_KEY`、`DEEPSEEK_CHAT_COMPLETIONS_URL`、`DEEPSEEK_MODEL` 自动迁移到首个 OpenAI 兼容供应商档案。
- 多模态图片输入首版同时支持图片 URL 和本地文件转 Base64。

### 阶段二：后端配置存储

- 新增 `model_provider` 领域模型。
- 新增 `ModelProviderSettingsService`，负责读写 `.data/settings/model-providers.json` 和 `.data/settings/secrets.env`。
- 首次读取新配置时，如果尚不存在供应商档案，则检查旧 `DEEPSEEK_API_KEY`、`DEEPSEEK_CHAT_COMPLETIONS_URL`、`DEEPSEEK_MODEL`，自动创建首个 OpenAI 兼容供应商档案，并将 Key 写入 `.data/settings/secrets.env`。
- 保留当前 `/api/settings/deepseek`、`/api/settings/seedance`、`/api/settings/rightcode`，内部桥接到新服务，避免前端一次性大改。
- 新增 `/api/model-providers` 系列接口。

### 阶段三：统一模型网关

- 新增 `ModelGateway` 和 OpenAI 兼容适配器。
- 将当前 `DeepSeekClient.extract_json` 和 `generate_text` 迁移到网关。
- 保留原类名作为薄封装，降低业务服务改动。
- 统一调试目录为 `.data/debug/model-gateway/{provider_id}/{debug_context}`。
- 多模态请求首版支持 `image_url` 和本地图片文件。后端接收本地文件后转换为 Base64 数据 URL，再交给 OpenAI 兼容适配器组装请求。

### 阶段四：前端系统设置改造

- 将当前卡片式配置升级为多档案管理。
- 支持新增、编辑、删除、测试连接。
- 支持按用途选择默认模型。
- 导入页、剧本页和分镜提示词相关页面读取默认用途状态，并允许临时覆盖文本模型。
- 分镜生图和视频生成继续使用已有局部模型配置。

### 阶段五：扩展原生适配器

- 后续再添加 Anthropic、Gemini、Azure OpenAI 适配器。
- 后续再评估图片生成和视频生成是否按供应商能力统一。

## 兼容当前项目的关键改动点

| 当前模块 | 建议改动 |
| --- | --- |
| `apps/api/app/services/settings_service.py` | 保留旧接口，新增多供应商配置服务 |
| `apps/api/app/services/deepseek_client.py` | 逐步改为调用 `ModelGateway` |
| `apps/api/app/core/deepseek_config.py` | 只保留默认值和兼容迁移逻辑 |
| `apps/api/app/services/seedream_image_client.py` | 首版不迁移，继续使用现有分镜图片局部配置 |
| `apps/api/app/services/seedance_client.py` | 首版不迁移，继续使用现有视频局部配置 |
| `apps/web/src/features/settings/SettingsPage.tsx` | 从固定三张卡片改为可增删的供应商档案 |
| `apps/web/src/shared/api.ts` | 新增模型供应商 API 类型和请求方法 |

## 风险与约束

- 不同供应商对 JSON 输出、多模态图片、上下文长度和流式返回支持不一致，前端必须显示“能力标签”，避免用户把不支持视觉的模型设为视觉默认模型。
- 部分中转站虽然宣称 OpenAI 兼容，但只兼容文本，不支持 `response_format` 或多模态内容，需要提供“兼容性测试结果”。
- 模型列表接口差异较大，不能把“读取模型列表失败”视为配置不可用，用户应能手动输入模型名。
- 调试文件可能保存模型输入输出，需要继续遵守不提交缓存、调试证据和小说正文的约束。
- API Key 不能出现在日志、调试文件、前端状态消息或 PR 描述中。

## 待确认问题

以下问题已确认：

1. 首版只实现 OpenAI 兼容供应商，Anthropic、Gemini、Azure OpenAI 先保留设计不落代码。
2. API Key 改为保存到 `.data/settings/secrets.env`，减少和开发环境配置混在一起。
3. 供应商档案不需要支持导入导出。
4. 业务页面允许临时覆盖默认模型，且临时覆盖仅当前页面会话有效。
5. 图片和视频模型继续保留在分镜和视频页面的局部配置。
6. 旧 `DEEPSEEK_API_KEY`、`DEEPSEEK_CHAT_COMPLETIONS_URL`、`DEEPSEEK_MODEL` 自动迁移到首个供应商档案。
7. 多模态图片输入首版支持 URL，同时支持本地文件转 Base64。
