from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_timestamp_compact() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
