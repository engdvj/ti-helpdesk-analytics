"""Score de saúde do equipamento (0-100, maior = melhor) a partir do
inventário de hardware trazido pelo GLPI Agent. Pesos são julgamento de
design documentado aqui, não calibração - mesmo espírito do
`TECH_SCORE_WEIGHTS` em `src/ti_analytics/analytics/scores.py` (revisitar
conforme mais dado real de parque se acumular; hoje só 1 PC de teste real).

Decidido com o usuário em 2026-08-29: RAM/disco/SO pesam mais (sinais fortes
e concretos), CPU/GPU pesam pouco (heurística por nome, sinal fraco sem
benchmark real). "Chamados abertos" do PC fica de fora de propósito - é
sinal de outra natureza (histórico de problema, não capacidade do
equipamento), mostrado separado, não somado aqui."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from api.app.models.computer_hardware import ComputerHardware

# --- pesos (somam 100) --------------------------------------------------
_PESO_RAM = 25
_PESO_DISCO_TIPO = 20
_PESO_DISCO_LIVRE = 15
_PESO_SO = 20
_PESO_TEMPO_SEM_FORMATAR = 10
_PESO_GPU = 5
_PESO_CPU = 5

_NIVEL_CRITICO_ATE = 40
_NIVEL_ATENCAO_ATE = 70

_SO_CRITICOS = ("windows xp", "windows vista", "windows 7", "windows 8")
_SO_ATENCAO = ("windows 10",)
_SO_BONS = ("windows 11",)

_CPU_FRACOS = ("celeron", "pentium", "atom")
_CPU_MEDIOS = ("core i3", "ryzen 3")
_CPU_BONS = ("core i5", "core i7", "core i9", "ryzen 5", "ryzen 7", "ryzen 9")

_GPU_DEDICADAS = ("geforce", "radeon rx", "quadro", "radeon pro")


@dataclass
class ScoreComponente:
    dimensao: str
    pontos: int
    peso: int  # máximo possível dessa dimensão
    texto: str


@dataclass
class HardwareScore:
    score: int
    nivel: str  # "critico" | "atencao" | "bom"
    detalhes: list[str] = field(default_factory=list)
    componentes: list[ScoreComponente] = field(default_factory=list)


def _pontos_ram(ram_mb: int | None) -> tuple[int, str]:
    if ram_mb is None:
        return _PESO_RAM // 2, "RAM: desconhecida"
    gb = ram_mb / 1024
    if ram_mb < 4096:
        return 0, f"RAM: {gb:.0f}GB (crítico, abaixo de 4GB)"
    if ram_mb < 6144:
        return round(_PESO_RAM * 0.4), f"RAM: {gb:.0f}GB (baixa)"
    if ram_mb < 8192:
        return round(_PESO_RAM * 0.7), f"RAM: {gb:.0f}GB (ok)"
    if ram_mb < 16384:
        return round(_PESO_RAM * 0.9), f"RAM: {gb:.0f}GB (boa)"
    return _PESO_RAM, f"RAM: {gb:.0f}GB (ótima)"


def _pontos_disco_tipo(disco_tipo: str | None) -> tuple[int, str]:
    if disco_tipo is None:
        return round(_PESO_DISCO_TIPO * 0.5), "Disco: tipo desconhecido"
    tipo = disco_tipo.strip().upper()
    if tipo == "SSD":
        return _PESO_DISCO_TIPO, "Disco: SSD"
    if tipo == "HDD":
        return 0, "Disco: HDD mecânico (crítico)"
    return round(_PESO_DISCO_TIPO * 0.5), f"Disco: {disco_tipo}"


def _pontos_disco_livre(total_mb: int | None, livre_mb: int | None) -> tuple[int, str]:
    if not total_mb or livre_mb is None:
        return round(_PESO_DISCO_LIVRE * 0.5), "Espaço livre: desconhecido"
    pct = 100 * livre_mb / total_mb
    if pct < 10:
        return 0, f"Espaço livre: {pct:.0f}% (crítico)"
    if pct < 20:
        return round(_PESO_DISCO_LIVRE * 0.45), f"Espaço livre: {pct:.0f}% (baixo)"
    if pct < 40:
        return round(_PESO_DISCO_LIVRE * 0.8), f"Espaço livre: {pct:.0f}%"
    return _PESO_DISCO_LIVRE, f"Espaço livre: {pct:.0f}%"


def _pontos_so(so_nome: str | None) -> tuple[int, str]:
    if not so_nome:
        return round(_PESO_SO * 0.5), "SO: desconhecido"
    nome = so_nome.strip().lower()
    if any(alvo in nome for alvo in _SO_CRITICOS):
        return 0, f"SO: {so_nome} (fora de suporte)"
    if any(alvo in nome for alvo in _SO_ATENCAO):
        return round(_PESO_SO * 0.5), f"SO: {so_nome} (suporte estendido)"
    if any(alvo in nome for alvo in _SO_BONS):
        return _PESO_SO, f"SO: {so_nome}"
    if "windows" not in nome:  # Linux/macOS/etc - trata como suportado
        return _PESO_SO, f"SO: {so_nome}"
    return round(_PESO_SO * 0.5), f"SO: {so_nome}"


def _pontos_tempo_sem_formatar(instalado_em: date | None, hoje: date) -> tuple[int, str]:
    if instalado_em is None:
        return round(_PESO_TEMPO_SEM_FORMATAR * 0.5), "Tempo sem formatar: desconhecido"
    anos = (hoje - instalado_em).days / 365
    if anos > 4:
        return 0, f"Tempo sem formatar: {anos:.1f} anos (crítico)"
    if anos > 2:
        return round(_PESO_TEMPO_SEM_FORMATAR * 0.5), f"Tempo sem formatar: {anos:.1f} anos"
    return _PESO_TEMPO_SEM_FORMATAR, f"Tempo sem formatar: {anos:.1f} anos"


def _pontos_gpu(gpu_designacao: str | None) -> tuple[int, str]:
    if not gpu_designacao:
        return round(_PESO_GPU * 0.6), "GPU: desconhecida"
    nome = gpu_designacao.strip().lower()
    if any(alvo in nome for alvo in _GPU_DEDICADAS):
        return _PESO_GPU, f"GPU: {gpu_designacao} (dedicada)"
    return round(_PESO_GPU * 0.4), f"GPU: {gpu_designacao} (integrada)"


def _pontos_cpu(cpu_designacao: str | None) -> tuple[int, str]:
    if not cpu_designacao:
        return round(_PESO_CPU * 0.4), "CPU: desconhecida"
    nome = cpu_designacao.strip().lower()
    if any(alvo in nome for alvo in _CPU_FRACOS):
        return 0, f"CPU: {cpu_designacao} (entrada)"
    if any(alvo in nome for alvo in _CPU_BONS):
        return _PESO_CPU, f"CPU: {cpu_designacao}"
    if any(alvo in nome for alvo in _CPU_MEDIOS):
        return round(_PESO_CPU * 0.6), f"CPU: {cpu_designacao}"
    return round(_PESO_CPU * 0.4), f"CPU: {cpu_designacao}"


def calcular_score(hw: ComputerHardware | None, hoje: date | None = None) -> HardwareScore | None:
    """None quando o PC nunca foi sincronizado com o GLPI (sem hardware
    conhecido) - nunca inventa uma nota pra um PC 100% manual."""
    if hw is None:
        return None
    hoje = hoje or date.today()

    specs = [
        ("RAM", _PESO_RAM, _pontos_ram(hw.ram_mb)),
        ("Disco (tipo)", _PESO_DISCO_TIPO, _pontos_disco_tipo(hw.disco_tipo)),
        ("Espaço livre", _PESO_DISCO_LIVRE, _pontos_disco_livre(hw.disco_total_mb, hw.disco_livre_mb)),
        ("Sistema operacional", _PESO_SO, _pontos_so(hw.so_nome)),
        ("Tempo sem formatar", _PESO_TEMPO_SEM_FORMATAR, _pontos_tempo_sem_formatar(hw.so_instalado_em, hoje)),
        ("GPU", _PESO_GPU, _pontos_gpu(hw.gpu_designacao)),
        ("CPU", _PESO_CPU, _pontos_cpu(hw.cpu_designacao)),
    ]
    componentes = [
        ScoreComponente(dimensao=dim, pontos=pontos, peso=peso, texto=texto)
        for dim, peso, (pontos, texto) in specs
    ]
    score = round(sum(c.pontos for c in componentes))
    detalhes = [c.texto for c in componentes]

    if score < _NIVEL_CRITICO_ATE:
        nivel = "critico"
    elif score < _NIVEL_ATENCAO_ATE:
        nivel = "atencao"
    else:
        nivel = "bom"

    return HardwareScore(score=score, nivel=nivel, detalhes=detalhes, componentes=componentes)
