from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger
from app.core.seedance_config import seedance_config

configure_logging()
logger = get_logger("main")

app = FastAPI(title=settings.app_name, version="0.1.0")
logger.info("后端服务启动：应用=%s，日志启用=%s，日志级别=%s", settings.app_name, settings.logging_enabled, settings.log_level)
seedance_config.media_dir.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.mount(seedance_config.public_media_prefix, StaticFiles(directory=seedance_config.media_dir), name="generated_media")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
