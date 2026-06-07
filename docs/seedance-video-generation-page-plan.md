# Seedance 视频生成页面规划

## 目标

新增“视频生成”页面，把剧本、参考图片、参考视频、音频素材和 Seedance 参数组织成一个可提交的视频生成任务草案。

## 页面结构

- 剧本与提示词：读取当前小说的剧本草稿，也支持导入 TXT、Markdown、YAML 剧本文件。
- 参考素材：支持导入图片、视频、音频，并在页面内预览。
- Seedance 配置：保存 Seedance API Key 到本地后端 `.env`，不提交到仓库。
- 任务草案：展示模型、画幅、清晰度、时长、素材数量和提交状态。

## 参数设计原因

- `prompt`：Seedance 视频生成的核心文本控制字段，用于描述镜头、动作、风格和剧情。
- `negative_prompt`：用于约束低质量、畸变、水印、字幕等不希望出现的结果。
- `ratio`：视频生成常见需要指定横屏、竖屏、方形或电影宽银幕。
- `duration`：短视频生成通常以 5 秒或 10 秒作为基础任务单位。
- `resolution`：页面先提供 720p 和 1080p，避免超出常见模型限制。
- `seed`：用于复现实验结果，留空则随机。
- `camera_fixed`：Seedance 常见生成参数中会区分是否固定镜头运动，便于控制画面稳定性。
- 参考图片、视频、音频：分别用于角色/场景视觉参考、运动参考、配音或节奏参考。

## 后续接口接入

当前页面完成前端素材组织和 Seedance API Key 配置。后续可新增：

- `POST /api/videos/seedance/tasks`
- `GET /api/videos/seedance/tasks/{task_id}`
- `GET /api/videos/seedance/tasks/{task_id}/result`

后端提交任务时需要把本地文件转为模型服务可接受的文件 URL、Base64 或对象存储地址，具体取决于最终使用的 Seedance 服务提供方接口。
