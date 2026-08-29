"""Busca o hardware (RAM/disco/SO/CPU/GPU) de cada Computer do GLPI Agent -
chamado por services/computer_sync.py logo depois de resolver identidade/
setor, na mesma sincronização (mesmo `CollectionRun`, sem endpoint próprio).

Cada PC exige varias sub-chamadas REST (`/Computer/{id}/Item_Device*/` +
resolver o catálogo de cada dispositivo pra pegar o nome legível) - caro pra
um parque grande, mas é job de background, não bloqueia request de usuário
(mesmo raciocínio de `pipeline.py::_fetch_ticket_details`, que já faz N
chamadas por chamado). `_CatalogCache` evita repetir a mesma resolução de
catálogo (ex. o mesmo modelo de SSD em várias máquinas do mesmo lote de
compra) dentro de uma sincronização.

Cada sub-recurso é best-effort: se uma falhar (GlpiError), só aquele campo
fica None - nunca aborta o hardware inteiro do PC por causa de 1 campo."""
from __future__ import annotations

from datetime import date, datetime, timezone

from ti_analytics.config import GlpiConfig
from ti_analytics.glpi.client import GlpiError, api_request


class _CatalogCache:
    """{(itemtype, id): valor_ja_resolvido} - poupa round-trip quando varios
    PCs compartilham o mesmo modelo de peça (lote de compra padronizado)."""

    def __init__(self, cfg: GlpiConfig, session_token: str):
        self._cfg = cfg
        self._token = session_token
        self._cache: dict[tuple[str, int], dict | None] = {}

    def get(self, itemtype: str, item_id: int) -> dict | None:
        key = (itemtype, item_id)
        if key not in self._cache:
            try:
                self._cache[key] = api_request(self._cfg, f"/{itemtype}/{item_id}", self._token)
            except GlpiError:
                self._cache[key] = None
        return self._cache[key]


def _parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _sub(cfg: GlpiConfig, session_token: str, glpi_id: int, sub: str) -> list[dict]:
    try:
        rows = api_request(cfg, f"/Computer/{glpi_id}/{sub}/", session_token)
        return rows if isinstance(rows, list) else []
    except GlpiError:
        return []


def fetch_hardware(cfg: GlpiConfig, session_token: str, glpi_id: int, catalog: _CatalogCache) -> dict:
    """Um dict pronto pra `ComputerHardware(**dict, computer_id=..., atualizado_em=...)`."""
    dados: dict = {
        "ram_mb": None,
        "disco_tipo": None,
        "disco_total_mb": None,
        "disco_livre_mb": None,
        "so_nome": None,
        "so_instalado_em": None,
        "cpu_designacao": None,
        "gpu_designacao": None,
        "gpu_memoria_mb": None,
    }

    memorias = _sub(cfg, session_token, glpi_id, "Item_DeviceMemory")
    tamanhos = [m["size"] for m in memorias if isinstance(m.get("size"), int)]
    if tamanhos:
        dados["ram_mb"] = sum(tamanhos)

    discos = _sub(cfg, session_token, glpi_id, "Item_DeviceHardDrive")
    if discos:
        primeiro = discos[0]
        modelo = catalog.get("DeviceHardDrive", primeiro["deviceharddrives_id"]) if primeiro.get("deviceharddrives_id") else None
        if modelo and modelo.get("deviceharddrivetypes_id"):
            tipo = catalog.get("DeviceHardDriveType", modelo["deviceharddrivetypes_id"])
            if tipo:
                dados["disco_tipo"] = tipo.get("name")

    particoes = _sub(cfg, session_token, glpi_id, "Item_Disk")
    totais = [p["totalsize"] for p in particoes if isinstance(p.get("totalsize"), int)]
    livres = [p["freesize"] for p in particoes if isinstance(p.get("freesize"), int)]
    if totais:
        dados["disco_total_mb"] = sum(totais)
    if livres:
        dados["disco_livre_mb"] = sum(livres)

    sistemas = _sub(cfg, session_token, glpi_id, "Item_OperatingSystem")
    if sistemas:
        primeiro = sistemas[0]
        dados["so_instalado_em"] = _parse_iso_date(primeiro.get("install_date"))
        if primeiro.get("operatingsystems_id"):
            so = catalog.get("OperatingSystem", primeiro["operatingsystems_id"])
            if so:
                dados["so_nome"] = so.get("name")

    processadores = _sub(cfg, session_token, glpi_id, "Item_DeviceProcessor")
    if processadores and processadores[0].get("deviceprocessors_id"):
        cpu = catalog.get("DeviceProcessor", processadores[0]["deviceprocessors_id"])
        if cpu:
            dados["cpu_designacao"] = cpu.get("designation")

    placas = _sub(cfg, session_token, glpi_id, "Item_DeviceGraphicCard")
    if placas:
        primeiro = placas[0]
        dados["gpu_memoria_mb"] = primeiro.get("memory")
        if primeiro.get("devicegraphiccards_id"):
            gpu = catalog.get("DeviceGraphicCard", primeiro["devicegraphiccards_id"])
            if gpu:
                dados["gpu_designacao"] = gpu.get("designation")

    return dados


def fetch_all_hardware(cfg: GlpiConfig, session_token: str, glpi_ids: list[int]) -> dict[int, dict]:
    """Um dict {glpi_computer_id: hardware_dict}, catálogo compartilhado
    entre todos os PCs da sincronização."""
    catalog = _CatalogCache(cfg, session_token)
    out: dict[int, dict] = {}
    for glpi_id in glpi_ids:
        hw = fetch_hardware(cfg, session_token, glpi_id, catalog)
        hw["atualizado_em"] = datetime.now(timezone.utc)
        out[glpi_id] = hw
    return out
