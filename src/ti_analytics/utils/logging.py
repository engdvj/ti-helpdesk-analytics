import logging
from pathlib import Path

from ti_analytics.paths import LOGS_DIR


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(Path(LOGS_DIR) / f"{name}.log", encoding="utf-8")
    stream_handler = logging.StreamHandler()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    file_handler.setFormatter(fmt)
    stream_handler.setFormatter(fmt)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger
