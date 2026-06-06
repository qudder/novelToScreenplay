import logging
from logging.config import dictConfig

from app.core.config import settings


LOGGER_NAMESPACE = "novel_to_screenplay"


def configure_logging() -> None:
    if not settings.logging_enabled:
        logging.disable(logging.CRITICAL)
        return

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                }
            },
            "loggers": {
                LOGGER_NAMESPACE: {
                    "handlers": ["console"],
                    "level": settings.log_level,
                    "propagate": False,
                }
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{name}")

