from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo


BRASILIA_TIMEZONE = ZoneInfo("America/Sao_Paulo")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_timestamp_compact() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def brasilia_today() -> date:
    """Data operacional do sistema, independente do fuso do servidor."""
    return datetime.now(BRASILIA_TIMEZONE).date()
