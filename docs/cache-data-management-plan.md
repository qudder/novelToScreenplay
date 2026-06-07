# 缓存与持久化数据统一管理计划

## 背景

当前后端缓存、调试文件和持久化数据分散在多个目录：

- `apps/api/app/.cache/deepseek`：章节分析缓存。
- `apps/api/app/.debug/deepseek`：DeepSeek 请求、响应和解析调试文件。
- `apps/api/app/.data/documents`：文档快照数据。
- `.data/generated_media`：当前后端默认挂载的生成媒体目录。
- `apps/api/.debug/seedance`：Seedance/Seedream 调试文件。
- `apps/api/.cache`、`apps/api/app/.data/generated_media`：历史或误生成目录，已确认无有效运行价值并完成清理。

Seedream 图片生成调试目录目前使用固定目录名 `generate-image`，多次请求会互相覆盖；同时成功响应、失败响应和生成媒体没有按小说、章节、场景、镜头分层归档，导致排查“图片是否正确保存到本地”时缺少清晰链路。

## 目标

- 所有缓存、调试文件和持久化数据统一从项目根目录 `.data` 管理。
- 所有目录名和文件名携带可定位信息，包括小说、章节、场景、镜头、请求类型和时间戳。
- Seedream 接口返回内容完整保存到本地调试目录，方便复盘响应结构、图片保存状态和错误原因。
- 生成图片、视频等媒体进入统一媒体目录，并能通过后端静态路径访问。
- 不在日志、缓存或调试摘要中写入完整 API Key 或完整小说正文。
- 保留必要的 DeepSeek 原始调试证据，但后续新增目录应按统一规则分层。

## 统一目录结构

推荐统一到项目根目录：

```text
.data/
  documents/
    {document_slug}-{document_id}/
      snapshot.json
      chapters/
        {chapter_slug}-{chapter_id}.json
  cache/
    deepseek/
      analysis/
        {document_slug}-{document_id}/
          {chapter_slug}-{chapter_id}-{content_hash}.json
      prompts/
        {document_slug}-{document_id}/
          {scene_slug}-{scene_id}/
            {shot_slug}-{shot_id}/
              {frame_slug}-{frame_id}-{prompt_hash}.json
  debug/
    deepseek/
      {document_slug}-{document_id}/
        chapters/
          {chapter_slug}-{chapter_id}-{content_hash}/
        storyboard-prompts/
          {scene_slug}-{scene_id}/
            {shot_slug}-{shot_id}/
              {frame_slug}-{frame_id}-{timestamp}/
    seedream/
      {document_slug}-{document_id}/
        {scene_slug}-{scene_id}/
          {shot_slug}-{shot_id}/
            {frame_slug}-{frame_id}-{timestamp}/
              request.json
              response.json
              raw_response.txt
              error.txt
              media.json
              prompt_summary.txt
  generated_media/
    images/
      {document_slug}-{scene_slug}-{shot_slug}-{frame_slug}-{digest}.{ext}
    videos/
      {document_slug}-{scene_slug}-{shot_slug}-{task_id}-{digest}.{ext}
```

## 命名规则

- `document_slug`：来源小说文件名清洗后得到，最长 40 个字符。
- `chapter_slug`：章节标题清洗后得到，最长 32 个字符。
- `scene_slug`：场景标题清洗后得到，最长 40 个字符。
- `shot_slug`：镜头编号或镜头标题，例如 `shot-003`。
- `frame_slug`：小分镜 ID 或目标类型，例如 `composition`、`focus`、`whole-shot`。
- `content_hash`：章节正文或输入上下文 SHA-256 前 12 位。
- `prompt_hash`：提示词 SHA-256 前 12 位。
- `digest`：媒体字节 SHA-256 前 16 位。
- `timestamp`：`yyyyMMdd-HHmmss`，用于避免调试目录覆盖。

所有清洗后的名称只保留中文、英文、数字、短横线和下划线；空值使用 `未命名`、`未知章节`、`未知场景` 等中文占位。

## Seedream 调试落盘

### 请求上下文

前端提交分镜生图时，应向后端传入：

- `document_id`
- `filename`
- `chapter_id` 或 `chapter_title`
- `scene_id`
- `scene_title`
- `shot_id`
- `shot_label`
- `frame_id`
- `frame_label`

后端 `SeedreamImageGenerationRequest` 增加可选上下文字段，用于构建调试目录和媒体文件名。业务逻辑不得依赖前端传入的完整小说正文。

### 保存内容

每次 Seedream 请求都创建独立目录，至少保存：

- `request.json`：脱敏后的请求体，隐藏完整提示词，只保留模型、尺寸、响应格式、seed 和提示词摘要。
- `prompt_summary.txt`：提示词长度、摘要 hash、前 300 字安全摘要；不得保存完整小说正文。
- `raw_response.txt`：第三方原始响应文本，允许保留完整 Base64，便于复盘。
- `response.json`：解析后的结构化响应，包括 `id`、`model`、`status`、是否包含 `image_url`、是否包含 `b64_json`、`usage`。
- `error.txt`：失败时保存中文说明和第三方原始错误。
- `media.json`：本地保存结果，包括 `local_path`、`local_url`、`original_url`、字节数、图片格式、宽高、hash、是否通过有效性校验。

## 图片有效性校验

后端保存图片前应校验：

- 可识别格式：PNG、JPEG、WEBP、GIF。
- 字节数大于最小阈值，建议图片不少于 10KB。
- 宽高大于 `1x1`，建议不少于 `256x256`。
- Seedream 请求尺寸满足模型要求。

如果响应包含 Base64 但保存失败，需要在 `media.json` 和中文日志中记录原因，不要只返回 `image_url` 空值。

## 代码改造步骤

1. 新增 `app/core/storage_config.py`，统一计算 `.data` 下的 `documents`、`cache`、`debug`、`generated_media` 目录。
2. 修改 `document_store.py`，将文档数据迁移到 `.data/documents/{document_slug}-{document_id}/snapshot.json`，保留读取旧路径的兼容逻辑。
3. 修改 `deepseek_config.py`，将缓存和调试目录改为 `.data/cache/deepseek` 与 `.data/debug/deepseek`，保留旧缓存读取兼容。
4. 修改 `seedance_config.py`，将 Seedance/Seedream 调试目录改为 `.data/debug/seedream` 和 `.data/debug/seedance`，媒体目录保持 `.data/generated_media`。
5. 新增统一的路径命名工具，例如 `storage_naming.py`，提供 `safe_slug`、`timestamp`、`short_hash` 和上下文目录构造函数。
6. 扩展 Seedream 请求模型，接收小说、章节、场景、镜头、小分镜上下文。
7. 修改 Seedream 调试目录生成逻辑，禁止固定目录覆盖。
8. 修改媒体保存服务，返回格式、宽高、字节数、hash、有效性校验结果，并写入 `media.json`。
9. 前端分镜生图请求补充上下文字段；图片任务记录保存 `localImagePath`、`imageUrl` 和 `mediaMeta`。
10. 更新 README 的目录说明和环境变量说明。

## 清理策略

- 保留 `apps/api/app/.data/documents` 直到迁移逻辑完成并验证。
- 保留 `apps/api/app/.cache/deepseek` 和 `apps/api/app/.debug/deepseek` 作为旧调试证据，后续通过迁移脚本转入 `.data/cache` 与 `.data/debug`。
- 已清理空目录 `apps/api/.cache`。
- 已清理错位媒体目录 `apps/api/app/.data/generated_media`，其中仅包含无效 `1x1` 占位图片。
- 不清理 `.env`、真实文档快照、DeepSeek 原始调试响应和用户素材目录。

## 验证方式

- 执行 `python -m compileall apps/api/app`。
- 执行 `npm run build`。
- 启动后端后检查：
  - `Invoke-RestMethod http://127.0.0.1:8000/health`
  - `/media/generated/images/...` 可访问本地生成图片。
- 触发一次 Seedream 分镜生图，检查：
  - `.data/debug/seedream/{小说}/{场景}/{镜头}/{小分镜}-{时间}/response.json`
  - `.data/debug/seedream/{小说}/{场景}/{镜头}/{小分镜}-{时间}/media.json`
  - `.data/generated_media/images/{小说}-{场景}-{镜头}-{小分镜}-{hash}.png`
- 确认日志不包含完整 API Key 或完整小说正文。

## 风险与回滚

- 目录迁移会影响历史缓存命中，需要保留旧目录读取兼容，避免用户重新分析全部章节。
- 文档快照迁移必须先支持双读，再切换写入新目录。
- Seedream 原始响应可能很大，调试目录后续需要增加保留天数或手动清理入口。
- 如果统一目录切换后媒体 URL 访问失败，可临时将 `GENERATED_MEDIA_DIR` 指回旧目录排查。
