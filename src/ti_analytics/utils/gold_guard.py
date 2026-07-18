"""Guard anti-stale do gold (mesmo padrao do fifa_analytics/utils/gold_guard.py).

Mantem um conjunto CANONICO de parquets esperados no gold e remove qualquer
outro *.parquet que tenha ficado para tras (ex.: renomeacao de artefato durante
o desenvolvimento). So mexe em *.parquet dentro de pipeline/data/gold/ - nao
toca em JSON (weights.json), raw nem silver.
"""
from __future__ import annotations

from pathlib import Path

from ti_analytics.paths import GOLD_DIR
from ti_analytics.utils.logging import get_logger

logger = get_logger(__name__)

KNOWN_GOLD_PARQUETS: frozenset[str] = frozenset({
    "dim_tecnico.parquet",
    "dim_unidade.parquet",
    "fact_chamado.parquet",
    "bridge_chamado_tecnico.parquet",
    "analytics/wide_chamado_tecnico.parquet",
    "analytics/snapshot_timeline.parquet",
})


def find_unknown_gold(gold_dir: Path = GOLD_DIR) -> list[Path]:
    if not gold_dir.exists():
        return []
    return sorted(
        p for p in gold_dir.rglob("*.parquet")
        if p.relative_to(gold_dir).as_posix() not in KNOWN_GOLD_PARQUETS
    )


def prune_unknown_gold(gold_dir: Path = GOLD_DIR, *, remove: bool = True) -> list[Path]:
    unknown = find_unknown_gold(gold_dir)
    for p in unknown:
        rel = p.relative_to(gold_dir).as_posix()
        if not remove:
            logger.warning("gold stale detectado (nao removido): %s", rel)
            continue
        try:
            p.unlink()
            logger.warning("gold stale removido: %s", rel)
        except OSError as exc:  # pragma: no cover
            logger.warning("nao consegui remover %s: %s", rel, exc)

    if remove and unknown:
        for d in sorted(gold_dir.rglob("*"), reverse=True):
            if d.is_dir() and not any(d.iterdir()):
                try:
                    d.rmdir()
                except OSError:  # pragma: no cover
                    pass
    return unknown
