import json
from typing import Any

from pydantic import BaseModel

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
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
    scene_content: str = ""
    shot: dict[str, Any] = {}
    frame: dict[str, Any] = {}
    dialogues: list[dict[str, Any]] = []


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
    scene_content: str = ""
    shot: dict[str, Any] = {}
    frames: list[dict[str, Any]] = []
    dialogues: list[dict[str, Any]] = []


class StoryboardBatchPromptResult(BaseModel):
    prompts: dict[str, str]


async def generate_storyboard_frame_prompt(payload: StoryboardFramePromptRequest) -> StoryboardFramePromptResult:
    system_prompt = deepseek_config.storyboard_image_prompt_path.read_text(encoding="utf-8")
    user_prompt = _build_frame_user_prompt(payload)
    frame_id = str(payload.frame.get("id") or "frame")
    debug_context = f"storyboard-prompt-{payload.scene_id or 'scene'}-{frame_id}"
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
            scene_content=payload.scene_content,
            shot=payload.shot,
            frame=frame,
            dialogues=payload.dialogues,
        )
        result = await generate_storyboard_frame_prompt(frame_request)
        frame_id = str(frame.get("id") or f"frame-{len(prompts) + 1}")
        prompts[frame_id] = result.prompt
    return StoryboardBatchPromptResult(prompts=prompts)


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
        "对话参考": payload.dialogues,
        "剧本参考": payload.scene_content[:1200],
    }
    return (
        "请为目标小分镜生成黑白分镜草图提示词。\n"
        "你可以阅读完整镜头信息和对话来理解人物关系，但输出必须只覆盖目标小分镜。\n"
        "最终提示词只描述人物相对位置和大概场景，不追求精致成片，不要包含任何对白原文，不要生成字幕或文字。\n"
        f"{json.dumps(material, ensure_ascii=False, indent=2)}"
    )


def _clean_prompt(prompt: str) -> str:
    return prompt.strip().strip("`").strip()
