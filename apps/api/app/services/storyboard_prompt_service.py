import json
from typing import Any, Literal

from pydantic import BaseModel

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.core.storage_naming import context_dir_name, safe_slug
from app.services.deepseek_client import deepseek_client

logger = get_logger("services.storyboard_prompt")


class StoryboardFramePromptRequest(BaseModel):
    document_id: str = ""
    filename: str = ""
    scene_id: str = ""
    scene_title: str = ""
    location: str = ""
    time_of_day: str = ""
    characters: list[str] = []
    shot: dict[str, Any] = {}
    frame: dict[str, Any] = {}


class StoryboardFramePromptResult(BaseModel):
    prompt: str


class StoryboardBatchPromptRequest(BaseModel):
    document_id: str = ""
    filename: str = ""
    scene_id: str = ""
    scene_title: str = ""
    location: str = ""
    time_of_day: str = ""
    characters: list[str] = []
    shot: dict[str, Any] = {}
    frames: list[dict[str, Any]] = []


class StoryboardBatchPromptResult(BaseModel):
    prompts: dict[str, str]


class CharacterImagePromptRequest(BaseModel):
    document_id: str = ""
    filename: str = ""
    character_id: str = ""
    name: str = ""
    role: str = ""
    description: str = ""
    aliases: list[str] = []
    appearances: list[str] = []
    template: Literal["single", "identity-board"] = "single"
    draft_prompt: str = ""


class CharacterImagePromptResult(BaseModel):
    prompt: str


async def generate_storyboard_frame_prompt(payload: StoryboardFramePromptRequest) -> StoryboardFramePromptResult:
    system_prompt = deepseek_config.storyboard_image_prompt_path.read_text(encoding="utf-8")
    user_prompt = _build_frame_user_prompt(payload)
    frame_id = str(payload.frame.get("id") or "frame")
    debug_context = _debug_context(payload)
    logger.info("开始生成小分镜图片提示词：场景ID=%s，小分镜=%s", payload.scene_id, frame_id)
    prompt = await deepseek_client.generate_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        debug_context=debug_context,
        temperature=0.35,
        max_tokens=1800,
    )
    logger.info("小分镜图片提示词生成完成：场景ID=%s，小分镜=%s，字符数=%s", payload.scene_id, frame_id, len(prompt))
    return StoryboardFramePromptResult(prompt=_clean_prompt(prompt))


async def generate_storyboard_batch_prompts(payload: StoryboardBatchPromptRequest) -> StoryboardBatchPromptResult:
    prompts: dict[str, str] = {}
    for frame in payload.frames:
        frame_request = StoryboardFramePromptRequest(
            document_id=payload.document_id,
            filename=payload.filename,
            scene_id=payload.scene_id,
            scene_title=payload.scene_title,
            location=payload.location,
            time_of_day=payload.time_of_day,
            characters=payload.characters,
            shot=payload.shot,
            frame=frame,
        )
        result = await generate_storyboard_frame_prompt(frame_request)
        frame_id = str(frame.get("id") or f"frame-{len(prompts) + 1}")
        prompts[frame_id] = result.prompt
    return StoryboardBatchPromptResult(prompts=prompts)


async def generate_character_image_prompt(payload: CharacterImagePromptRequest) -> CharacterImagePromptResult:
    system_prompt = _character_system_prompt(payload.template)
    user_prompt = _build_character_user_prompt(payload)
    debug_context = _character_debug_context(payload)
    logger.info("开始生成角色图片提示词：角色ID=%s，姓名=%s", payload.character_id, payload.name)
    prompt = await deepseek_client.generate_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        debug_context=debug_context,
        temperature=0.35,
        max_tokens=1400,
    )
    logger.info("角色图片提示词生成完成：角色ID=%s，字符数=%s", payload.character_id, len(prompt))
    return CharacterImagePromptResult(prompt=_clean_prompt(prompt))


def _build_frame_user_prompt(payload: StoryboardFramePromptRequest) -> str:
    material = {
        "文件名": payload.filename,
        "场景": {
            "id": payload.scene_id,
            "标题": payload.scene_title,
            "地点": payload.location,
            "时间": payload.time_of_day,
            "人物": payload.characters,
        },
        "完整镜头信息": payload.shot,
        "目标小分镜": payload.frame,
    }
    return (
        "请为目标小分镜生成电影感分镜图片提示词，不要生成黑白线稿、粗略草图或低细节框架图。\n"
        "只根据场景、镜头和目标小分镜信息生成，不要使用或补充任何对话信息。\n"
        "最终提示词要参考电影般广角镜头、戏剧性光线、氛围感景深、低调灯光、2.39:1 宽高比、高对比度动作瞬间或阴影浓重的电影肖像等表达，不要包含任何对白、台词、字幕或文字。\n"
        f"{json.dumps(material, ensure_ascii=False, indent=2)}"
    )


def _build_character_user_prompt(payload: CharacterImagePromptRequest) -> str:
    material = {
        "文件名": payload.filename,
        "角色": {
            "id": payload.character_id,
            "姓名": payload.name,
            "角色定位": payload.role,
            "人物描述": payload.description,
            "别名": payload.aliases,
            "出场章节": payload.appearances,
        },
        "当前提示词草稿": payload.draft_prompt,
    }
    if payload.template == "identity-board":
        instruction = (
            "请根据角色资料和当前提示词草稿，润色生成一个 16:9 角色身份板提示词。\n"
            "必须保留并强化结构化分区：主体角色、视觉风格、背景、设计方向、重要布局规则、主要构图、身份锁定、艺术部分、文字设计、整体风格。\n"
            "主体角色要提取并补足可视化身份信息，包括年龄感、身形、脸部、发型、眼神、服装轮廓、关键道具、姿态语言和色彩签名。\n"
            "布局必须明确要求多视角角色研究彼此分离、有呼吸空间，不要重叠，不要做成网格或目录式排版。\n"
            "文字设计必须包含角色名、角色定位、核心气质和视觉签名，帮助后续分镜和视频保持角色一致性。\n"
            "可以根据小说材料合理补足视觉细节，但不要改变角色身份、性格基调或已给出的服饰信息。\n"
            "不要加入对白、字幕、水印、屏幕文字、Logo、多人同框或完整小说正文。\n"
        )
    else:
        instruction = (
            "请根据角色资料和当前提示词草稿，润色生成一段角色图片提示词。\n"
            "如果当前提示词草稿不为空，请保留其核心设定并补强视觉细节、构图、光线、服装和气质表达。\n"
            "最终提示词应适合文生图模型生成单人角色肖像或半身设定图，强调可视化特征和影视概念设计感。\n"
            "可以合理补足服装轮廓、镜头构图、光线和背景，但不要改变角色身份与性格基调。\n"
            "不要包含任何对白、字幕、水印、屏幕文字、Logo 或多角色同框。\n"
        )
    return f"{instruction}{json.dumps(material, ensure_ascii=False, indent=2)}"


def _character_system_prompt(template: Literal["single", "identity-board"]) -> str:
    if template == "identity-board":
        return (
            "你是影视项目的角色身份板提示词助手。"
            "你只输出可直接用于文生图模型的中文提示词，不输出解释、标题、Markdown 或代码块。"
            "提示词要服务于高端动画工作室角色研究和艺术画册布局，强调结构化设定、多视角一致性、细节研究和身份文字。"
            "不要编造与材料冲突的剧情，不要加入对白、字幕、水印、屏幕文字、Logo、多人同框或完整小说正文。"
        )
    return (
        "你是影视项目的角色概念设定图提示词助手。"
        "你只输出可直接用于文生图模型的中文提示词，不输出解释、标题、Markdown 或代码块。"
        "提示词要服务于单人角色肖像或半身设定图，清晰描述年龄感、气质、身份、服装轮廓、表情状态和画面风格。"
        "不要编造与材料冲突的剧情，不要加入对白、字幕、水印、屏幕文字或多人同框。"
    )


def _clean_prompt(prompt: str) -> str:
    return prompt.strip().strip("`").strip()


def _debug_context(payload: StoryboardFramePromptRequest) -> str:
    filename = safe_slug(payload.filename.rsplit(".", 1)[0], "未命名小说", 32)
    scene = context_dir_name(payload.scene_title, payload.scene_id, "未知场景", 32)
    shot = context_dir_name(str(payload.shot.get("sceneTitle") or payload.shot.get("eventTitle") or "镜头"), str(payload.shot.get("id") or ""), "未知镜头", 32)
    frame = context_dir_name(str(payload.frame.get("label") or payload.frame.get("id") or "小分镜"), str(payload.frame.get("id") or ""), "未知小分镜", 24)
    return f"storyboard-prompt-{filename}-{scene}-{shot}-{frame}"


def _character_debug_context(payload: CharacterImagePromptRequest) -> str:
    filename = safe_slug(payload.filename.rsplit(".", 1)[0], "未命名小说", 32)
    character = context_dir_name(payload.name, payload.character_id, "未知角色", 32)
    return f"character-image-prompt-{filename}-{character}"
