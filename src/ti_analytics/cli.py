from __future__ import annotations

import argparse
import sys

import pandas as pd

from ti_analytics.paths import GOLD_DIR


def _coletar() -> None:
    from ti_analytics.glpi.pipeline import run

    counts = run()
    print("Coleta concluida:")
    for key, value in counts.items():
        print(f"  {key}: {value}")


def _quality_check() -> None:
    """Checagem rapida de qualidade sobre o gold ja coletado - nulos em
    colunas-chave, referencial (bridge aponta pra chamado/tecnico que
    existem). Pre-flight antes de confiar em qualquer score."""
    chamado_path = GOLD_DIR / "fact_chamado.parquet"
    bridge_path = GOLD_DIR / "bridge_chamado_tecnico.parquet"
    tecnico_path = GOLD_DIR / "dim_tecnico.parquet"

    if not chamado_path.exists():
        print("Nenhuma coleta encontrada ainda - rode `ti-analytics coletar` primeiro.")
        sys.exit(1)

    chamados = pd.read_parquet(chamado_path)
    bridge = pd.read_parquet(bridge_path)
    tecnicos = pd.read_parquet(tecnico_path)

    print(f"Chamados de TI: {len(chamados)}")
    print(f"  itilcategories_id nulo: {chamados['itilcategories_id'].isna().mean():.1%}")
    print(f"  solve_delay_stat nulo: {chamados['solve_delay_stat'].isna().mean():.1%}")
    print(f"  foi_reaberto: {int(chamados.get('foi_reaberto', pd.Series(dtype=bool)).sum())}")

    orfaos_chamado = bridge[~bridge["tickets_id"].isin(chamados["tickets_id"])]
    orfaos_tecnico = bridge[~bridge["users_id"].isin(tecnicos["users_id"])]
    print(f"Atribuicoes com chamado inexistente: {len(orfaos_chamado)}")
    print(f"Atribuicoes com tecnico inexistente: {len(orfaos_tecnico)}")
    print(f"Tecnicos: {len(tecnicos)} ({dict(tecnicos['papel'].value_counts())})")


def main() -> None:
    parser = argparse.ArgumentParser(prog="ti-analytics")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("coletar", help="Coleta GLPI -> raw -> silver -> gold -> scores")
    sub.add_parser("quality-check", help="Checagem rapida de qualidade do gold coletado")

    args = parser.parse_args()
    if args.command == "coletar":
        _coletar()
    elif args.command == "quality-check":
        _quality_check()


if __name__ == "__main__":
    main()
