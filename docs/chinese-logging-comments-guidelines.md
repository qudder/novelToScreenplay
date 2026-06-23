# 中文日志与注释约束

本文档定义本项目在开发、调试、运行、提交代码时必须遵守的日志与注释规范。后续每次修改代码、运行服务、排查问题、提交 PR 前，均需按本文档检查。

## 目标

- 所有业务日志、调试日志、异常日志必须使用中文。
- 所有新增代码注释必须使用中文。
- 面向用户或开发者的错误信息应优先使用中文。
- 日志与注释应帮助定位问题，不写无意义描述。
- 主分支代码在合并后必须保持可运行、可调试、可追踪。

## 适用范围

本约束适用于以下内容：

- 后端 FastAPI 日志。
- 前端控制台日志、错误提示、调试信息。
- 代码中的行内注释、块注释、函数说明注释。
- 配置文件中的说明性注释。
- DeepSeek 调试文件命名、错误记录说明。
- PR 描述中的测试说明和运行说明。

不强制翻译的内容：

- 第三方库原始 API 名称。
- 协议字段名、HTTP 状态名、异常类名。
- JSON/YAML/TypeScript/Python 结构字段。
- 外部服务返回的原始英文错误。
- 代码标识符，例如变量名、函数名、类名。

## 日志语言约束

所有项目自有日志必须使用中文。不得新增如下形式的英文业务日志：

```python
logger.info("Narrative analysis completed.")
logger.warning("Document not found.")
logger.error("DeepSeek request failed.")
```

应写为：

```python
logger.info("叙事分析完成：文档ID=%s", document_id)
logger.warning("文档查询失败：文档ID=%s", document_id)
logger.error("DeepSeek 请求失败：章节ID=%s，错误=%s", chapter_id, error)
```

日志必须包含足够定位信息，优先包含：

- 文档 ID。
- 章节 ID。
- 文件名。
- 分析状态。
- 缓存路径。
- 调试目录。
- 接口路径。
- 错误摘要。

## 日志格式约束

日志内容推荐格式：

```text
动作结果：关键对象=值，关键状态=值，错误=错误摘要
```

示例：

```python
logger.info("文档导入完成：文档ID=%s，文件名=%s，章节数=%s", document_id, filename, chapter_count)
logger.info("章节叙事分析已写入缓存：章节ID=%s，缓存路径=%s", chapter_id, cache_path)
logger.warning("DeepSeek 响应缺少原文定位：章节ID=%s，字段=%s", chapter_id, field_name)
logger.error("叙事分析失败：文档ID=%s，错误=%s", document_id, error, exc_info=True)
```

## 错误信息约束

后端抛给前端的 `HTTPException.detail` 应使用中文。

推荐：

```python
raise HTTPException(status_code=404, detail="文档不存在。")
raise HTTPException(status_code=400, detail="文件格式不支持，请上传 TXT、Markdown 或 Docx。")
```

避免：

```python
raise HTTPException(status_code=404, detail="Document not found.")
raise HTTPException(status_code=500, detail="Internal server error.")
```

如需保留第三方英文原始错误，应在中文说明后附加原始错误：

```python
raise HTTPException(status_code=500, detail=f"DeepSeek 请求失败：{error}")
```

## 注释语言约束

新增注释必须使用中文，并且只在代码意图不明显时添加。

推荐：

```python
# DeepSeek 可能返回 Markdown 包裹的 JSON，这里先剥离代码块再解析。
content = strip_json_fence(raw_content)
```

避免：

```python
# Parse JSON
content = strip_json_fence(raw_content)
```

也避免无意义注释：

```python
# 设置变量
status = "running"
```

## 前端提示约束

前端面向用户的提示必须使用中文，包括：

- 按钮文案。
- 页面状态。
- 错误提示。
- 空状态提示。
- 表单校验提示。
- 上传与分析进度提示。

示例：

```ts
throw new Error("启动叙事分析失败。");
setStatusMessage("叙事分析已启动，章节结果可继续查看。");
```

除非是浏览器、Vite、TypeScript、第三方库原始错误，否则不得直接展示英文异常。

## DeepSeek 调试输出约束

DeepSeek 相关本地调试文件应继续保留原始请求与响应，便于复盘。

允许保留模型原始输出中的英文、乱码或非法片段，因为这些属于外部输入证据。

项目自有调试说明文件、错误文件中的说明性文本应使用中文，例如：

```text
DeepSeek 响应因达到最大 token 限制被截断，请降低章节输入长度或收紧 prompt。
```

## 运行前检查

每次启动服务或执行联调前，需要检查：

- 后端日志配置开关是否符合当前调试需要。
- 当前运行端口是否为预期端口。
- 当前后端 OpenAPI 是否包含本次开发涉及的接口。
- 前端 API 地址是否指向当前后端。
- 本地缓存和调试目录是否符合当前测试目的。

推荐检查命令：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
(Invoke-RestMethod http://127.0.0.1:8000/openapi.json).paths.PSObject.Properties.Name
```

## PowerShell 执行约束

在 Windows PowerShell 中运行排查、验证和服务管理命令时，必须优先使用 PowerShell 兼容写法，避免把 Bash 习惯直接搬过来导致误判。

### Python 临时代码

- 不得使用 Bash here-doc 写法，例如 `python - <<'PY'`，PowerShell 会把 `<` 解析为重定向并报错。
- 简短脚本使用 `python -c "..."`；多行或复杂脚本应临时保存为受控脚本文件后执行，执行完确认不提交临时文件。
- 需要设置导入路径时，使用 `$env:PYTHONPATH='apps/api'; python -c "..."`。

推荐：

```powershell
$env:PYTHONPATH='apps/api'
python -c "from app.main import app; print(app.title)"
```

### 正则与引号

- `rg`、`Select-String` 等命令中的正则优先用单引号包裹，避免 `"`、`[`、`]`、`|` 被 PowerShell 提前解释。
- 正则本身需要单引号时，再切换为双引号并手动转义。

推荐：

```powershell
rg -n 'logger\.(info|warning|error|debug|exception)\("[A-Za-z]' apps/api/app
rg -n 'throw new Error\("[A-Za-z]|console\.(log|warn|error)\("[A-Za-z]' apps/web/src
```

### 启停服务

- 启动后端服务前，先确认目标端口是否已被占用；若需要后台运行，使用 `Start-Process` 并指定 `-WorkingDirectory`、`-WindowStyle Hidden`、标准输出和错误日志路径。
- 停止服务不能只依赖 `Stop-Process` 的单个 PID；`uvicorn --reload` 会产生 reloader 和子进程，端口可能由子进程继续监听。
- 关闭端口时，先查监听端口，再结合 `Get-CimInstance Win32_Process`、`tasklist` 和 `netstat -ano` 交叉确认实际进程；必要时按实际 Python 子进程 PID 使用 `taskkill /T /F`。
- 关闭后必须同时验证端口和健康检查：`netstat` 不再显示监听，并且 `/health` 已不可访问。

推荐：

```powershell
$ports = 8000,8001,8010,8011,5173,5174
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in $ports } |
  Select-Object LocalAddress,LocalPort,OwningProcess

Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*app.main:app*' -or $_.CommandLine -like '*vite*' } |
  Select-Object ProcessId,ParentProcessId,CommandLine

netstat -ano | Select-String ':8000|:8001|:8010|:8011|:5173|:5174'
```

### 命令结果判断

- PowerShell 表格输出可能截断长路径；查看调试目录、日志路径和缓存路径时，使用 `ForEach-Object { $_.FullName }` 或显式字符串格式化输出完整路径。
- 端口进程关闭后，`Get-NetTCPConnection` 可能短暂显示不存在的 PID；遇到不一致时必须用 `netstat -ano`、`tasklist /FI "PID eq <pid>"` 和实际接口请求交叉确认。
- 命令失败时先区分“Shell 语法错误”和“业务代码错误”。例如 PowerShell 报 `<` 重定向错误、正则引号错误，不应直接归因于 Python、前端或后端实现。

## 提交前检查

每次提交 PR 前，必须至少执行以下检查：

```powershell
rg -n "logger\\.(info|warning|error|debug|exception)\\(\\\"[A-Za-z]" apps/api/app
rg -n "throw new Error\\(\\\"[A-Za-z]|console\\.(log|warn|error)\\(\\\"[A-Za-z]" apps/web/src
python -m compileall apps/api/app
cd apps/web; npm run build
```

如果确实需要保留英文日志或英文提示，必须在 PR 描述中说明原因。

## 既有问题处理

当前代码中如存在历史英文日志、乱码日志或英文错误提示，应在修改相关模块时同步修复。

不要求为了单独翻译历史日志发起大范围重构 PR。应遵守“小 PR、单一目的”的原则，在相关功能修改时顺手清理。

## PR 约束

涉及日志或注释的 PR 描述必须包含：

- 修改了哪些日志或注释。
- 是否影响运行逻辑。
- 是否新增调试信息。
- 如何验证日志输出。

示例：

```text
功能描述：统一章节分析服务中的中文日志，便于排查 DeepSeek 调用与缓存命中情况。
实现思路：替换英文和乱码日志，保留结构化上下文参数。
测试方式：运行 python -m compileall apps/api/app，并触发一次章节分析观察日志输出。
```

## 必须避免

- 不得新增英文业务日志。
- 不得新增英文业务注释。
- 不得新增无上下文的日志，例如“成功”“失败”“进入方法”。
- 不得在日志中打印完整 API Key。
- 不得在日志中输出完整小说正文。
- 不得在前端直接展示第三方英文错误而不做中文包装。
- 不得为翻译日志引入大范围无关重构。

## 推荐实践

- 日志写清楚“谁、做了什么、结果如何”。
- 错误日志使用 `exc_info=True` 保留堆栈。
- 高频轮询接口减少日志噪音，必要时使用 debug 级别。
- 对 DeepSeek 请求记录章节 ID、模型名、调试目录，不记录 API Key。
- 对缓存命中、缓存失效、强制刷新分别记录中文日志。
- 前端错误提示优先告诉用户下一步能做什么。
