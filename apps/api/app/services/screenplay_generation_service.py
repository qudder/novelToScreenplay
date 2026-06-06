import json
from typing import Any

from pydantic import BaseModel

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.domain.models import SourceRef
from app.services.deepseek_client import deepseek_client

logger = get_logger("services.screenplay_generation")


class ScreenplayCompletionRequest(BaseModel):
    document_id: str = ""
    filename: str = ""
    scene_id: str = ""
    block_title: str = ""
    scene_title: str = ""
    location: str = ""
    time_of_day: str = ""
    dramatic_function: str = ""
    event_titles: list[str] = []
    characters: list[str] = []
    environments: list[dict[str, Any]] = []
    shot_plans: list[dict[str, Any]] = []
    dialogues: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    source_refs: list[SourceRef] = []
    source_text: str = ""
    current_content: str = ""


class ScreenplayCompletionResult(BaseModel):
    content: str


async def complete_scene_screenplay(payload: ScreenplayCompletionRequest) -> ScreenplayCompletionResult:
    system_prompt = deepseek_config.screenplay_prompt_path.read_text(encoding="utf-8")
    source_excerpt = _build_source_excerpt(payload.source_text, payload.source_refs)
    user_prompt = _build_user_prompt(payload, source_excerpt)
    debug_context = f"screenplay-{payload.scene_id or 'scene'}"
    logger.info(
        "开始生成场景剧本：文档ID=%s，场景ID=%s，标题=%s，原文片段字符数=%s",
        payload.document_id,
        payload.scene_id,
        payload.scene_title,
        len(source_excerpt),
    )
    content = await deepseek_client.generate_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        debug_context=debug_context,
        temperature=0.35,
        max_tokens=12000,
    )
    logger.info("场景剧本生成完成：文档ID=%s，场景ID=%s，剧本字符数=%s", payload.document_id, payload.scene_id, len(content))
    return ScreenplayCompletionResult(content=content)


def _build_user_prompt(payload: ScreenplayCompletionRequest, source_excerpt: str) -> str:
    material = {
        "文件名": payload.filename,
        "总场景": payload.block_title,
        "子场景": {
            "id": payload.scene_id,
            "标题": payload.scene_title,
            "地点": payload.location,
            "时间": payload.time_of_day,
            "戏剧功能": payload.dramatic_function,
            "关联事件标题": payload.event_titles,
            "出场人物": payload.characters,
        },
        "事件信息": payload.events,
        "环境信息": payload.environments,
        "分镜信息": payload.shot_plans,
        "关键对话": payload.dialogues,
        "已有编辑内容": payload.current_content,
        "原文片段": source_excerpt,
    }
    return (
        "请根据以下材料生成一个可直接编辑的中文剧本场景。\n"
        "材料如下：\n"
        f"{json.dumps(material, ensure_ascii=False, indent=2)}"
    )


def _build_source_excerpt(source_text: str, refs: list[SourceRef]) -> str:
    if not source_text:
        return ""

    snippets: list[str] = []
    for ref in refs[:4]:
        if ref.start_char >= 0 and ref.end_char > ref.start_char:
            start = max(0, ref.start_char - 300)
            end = min(len(source_text), ref.end_char + 500)
            snippet = source_text[start:end].strip()
        elif ref.evidence:
            index = source_text.find(ref.evidence)
            if index < 0:
                snippet = ref.evidence
            else:
                start = max(0, index - 300)
                end = min(len(source_text), index + len(ref.evidence) + 500)
                snippet = source_text[start:end].strip()
        else:
            snippet = ""
        if snippet and snippet not in snippets:
            snippets.append(snippet)

    if snippets:
        return "\n\n---\n\n".join(snippets)[:6000]

    return source_text[:3000]
