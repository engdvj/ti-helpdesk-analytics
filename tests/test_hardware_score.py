from __future__ import annotations

from datetime import date

from api.app.models.computer_hardware import ComputerHardware
from api.app.services.hardware_score import calcular_score

HOJE = date(2026, 8, 29)


def _hw(**overrides) -> ComputerHardware:
    base = dict(
        computer_id=1,
        ram_mb=8192,
        disco_tipo="SSD",
        disco_total_mb=200_000,
        disco_livre_mb=100_000,
        so_nome="Microsoft Windows 11 Pro",
        so_instalado_em=date(2026, 1, 1),
        cpu_designacao="Intel Core i5-1135G7",
        gpu_designacao="Intel UHD Graphics",
        gpu_memoria_mb=1024,
    )
    base.update(overrides)
    return ComputerHardware(**base)


def test_calcular_score_none_quando_sem_hardware():
    assert calcular_score(None, HOJE) is None


def test_pc_bom_pontua_alto():
    resultado = calcular_score(_hw(), HOJE)
    assert resultado is not None
    assert resultado.score >= 70
    assert resultado.nivel == "bom"


def test_pc_critico_pontua_baixo():
    resultado = calcular_score(_hw(
        ram_mb=2048,
        disco_tipo="HDD",
        disco_total_mb=200_000,
        disco_livre_mb=5_000,  # 2.5% livre
        so_nome="Microsoft Windows 7 Professional",
        so_instalado_em=date(2019, 1, 1),  # > 4 anos
        cpu_designacao="Intel Celeron N4000",
        gpu_designacao="Intel HD Graphics",
    ), HOJE)
    assert resultado is not None
    assert resultado.score < 40
    assert resultado.nivel == "critico"


def test_ram_baixa_derruba_score_mas_nao_zera_tudo():
    bom = calcular_score(_hw(), HOJE)
    com_pouca_ram = calcular_score(_hw(ram_mb=2048), HOJE)
    assert com_pouca_ram is not None and bom is not None
    assert com_pouca_ram.score < bom.score


def test_hdd_pontua_zero_no_criterio_de_disco():
    resultado = calcular_score(_hw(disco_tipo="HDD"), HOJE)
    assert resultado is not None
    assert any("HDD" in linha for linha in resultado.detalhes)


def test_disco_quase_cheio_penaliza():
    cheio = calcular_score(_hw(disco_total_mb=200_000, disco_livre_mb=5_000), HOJE)  # 2.5%
    espacoso = calcular_score(_hw(disco_total_mb=200_000, disco_livre_mb=150_000), HOJE)  # 75%
    assert cheio is not None and espacoso is not None
    assert cheio.score < espacoso.score


def test_windows_10_fica_no_meio_entre_7_e_11():
    win7 = calcular_score(_hw(so_nome="Microsoft Windows 7 Professional"), HOJE)
    win10 = calcular_score(_hw(so_nome="Microsoft Windows 10 Pro"), HOJE)
    win11 = calcular_score(_hw(so_nome="Microsoft Windows 11 Pro"), HOJE)
    assert win7 and win10 and win11
    assert win7.score < win10.score < win11.score


def test_linux_nao_e_penalizado_como_windows_antigo():
    linux = calcular_score(_hw(so_nome="Ubuntu 24.04 LTS"), HOJE)
    win11 = calcular_score(_hw(so_nome="Microsoft Windows 11 Pro"), HOJE)
    assert linux is not None and win11 is not None
    assert linux.score == win11.score  # mesmo peso maximo de SO


def test_tempo_sem_formatar_penaliza_maquina_antiga():
    recente = calcular_score(_hw(so_instalado_em=date(2026, 6, 1)), HOJE)
    antiga = calcular_score(_hw(so_instalado_em=date(2020, 1, 1)), HOJE)
    assert recente is not None and antiga is not None
    assert antiga.score < recente.score


def test_gpu_dedicada_pontua_mais_que_integrada():
    integrada = calcular_score(_hw(gpu_designacao="Intel UHD Graphics 730"), HOJE)
    dedicada = calcular_score(_hw(gpu_designacao="NVIDIA GeForce RTX 3050"), HOJE)
    assert integrada is not None and dedicada is not None
    assert dedicada.score > integrada.score


def test_cpu_de_entrada_pontua_menos_que_cpu_boa():
    fraca = calcular_score(_hw(cpu_designacao="Intel Celeron N4000"), HOJE)
    boa = calcular_score(_hw(cpu_designacao="Intel Core i7-11700"), HOJE)
    assert fraca is not None and boa is not None
    assert fraca.score < boa.score


def test_campos_desconhecidos_ficam_neutros_nao_zeram_score():
    tudo_desconhecido = calcular_score(_hw(
        ram_mb=None, disco_tipo=None, disco_total_mb=None, disco_livre_mb=None,
        so_nome=None, so_instalado_em=None, cpu_designacao=None,
        gpu_designacao=None, gpu_memoria_mb=None,
    ), HOJE)
    assert tudo_desconhecido is not None
    # nem "bom" (nada foi confirmado bom) nem "critico" (nada foi confirmado ruim)
    assert tudo_desconhecido.nivel == "atencao"


def test_score_nunca_passa_de_100_nem_fica_negativo():
    for hw in (_hw(), _hw(ram_mb=1024, disco_tipo="HDD", so_nome="Windows XP")):
        resultado = calcular_score(hw, HOJE)
        assert resultado is not None
        assert 0 <= resultado.score <= 100
