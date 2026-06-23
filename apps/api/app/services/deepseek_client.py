from typing import Any

from app.core.deepseek_config import deepseek_config
from app.core.logging_config import get_logger
from app.services.model_gateway import (
    ModelGatewayConfigurationError,
    ModelGatewayRequest,
    ModelGatewayResponseParseError,
    model_gateway,
    parse_json_content,
    text_message,
)

logger = get_logger("services.deepseek")


class DeepSeekConfigurationError(ModelGatewayConfigurationError):
    pass


class DeepSeekResponseParseError(ModelGatewayResponseParseError):
    pass


class DeepSeekResponseTruncatedError(DeepSeekResponseParseError):
    pass


class DeepSeekClient:
    async def extract_json(
        self,
        user_prompt: str,
        debug_context: str | None = None,
        model_profile_id: str = "",
    ) -> dict[str, Any]:
        system_prompt = deepseek_config.prompt_path.read_text(encoding="utf-8")
        try:
            response = await model_gateway.generate(
                ModelGatewayRequest(
                    purpose="narrative_analysis",
                    model_profile_id=model_profile_id,
                    messages=[
                        text_message("system", system_prompt),
                        text_message("user", user_prompt),
                    ],
                    response_format="json_object",
                    temperature=deepseek_config.temperature,
                    max_tokens=deepseek_config.max_tokens,
                    stream=False,
                    debug_context=debug_context or "request",
                )
            )
        except ModelGatewayConfigurationError as error:
            raise DeepSeekConfigurationError(str(error)) from error
        try:
            parsed = parse_json_content(response.text)
        except ModelGatewayResponseParseError as error:
            logger.exception("文本模型 JSON 解析失败：调试上下文=%s，错误=%s", debug_context, error)
            raise DeepSeekResponseParseError(str(error)) from error
        logger.info("文本模型响应解析完成：调试上下文=%s，字段=%s", debug_context, list(parsed.keys()))
        return parsed

    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        debug_context: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        model_profile_id: str = "",
    ) -> str:
        try:
            response = await model_gateway.generate(
                ModelGatewayRequest(
                    purpose="screenplay_completion",
                    model_profile_id=model_profile_id,
                    messages=[
                        text_message("system", system_prompt),
                        text_message("user", user_prompt),
                    ],
                    response_format="text",
                    temperature=deepseek_config.temperature if temperature is None else temperature,
                    max_tokens=deepseek_config.max_tokens if max_tokens is None else max_tokens,
                    stream=False,
                    debug_context=debug_context or "request",
                )
            )
        except ModelGatewayConfigurationError as error:
            raise DeepSeekConfigurationError(str(error)) from error
        return response.text


deepseek_client = DeepSeekClient()
